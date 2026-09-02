"""RPC transport client -- spawn the TS server, drive NDJSON lockstep (D-30).

**Transport-only.** Zero business types live in this module. The
typed envelope mirror + schema re-validation is Phase 7's job --
this module ships the byte-clean transport that every later Python
consumer reuses (Phase 4 ``Anim QA``, Phase 7 orchestrator, Phase 8
packager). D-27 frames this as a **costly reversibility** decision:
the NDJSON framing and 8-code envelope are committed by both sides
of the bridge, and changing transport later rewrites TS and Python.

**Wire contract (D-27/D-28/D-36):**

    request  : one NDJSON line ``{"id": <int>, "method": <str>, "params": <obj>}``
    response : one NDJSON line
               ``{"id": <int|null>, "ok": true,  "result": <obj>}``
            | ``{"id": <int|null>, "ok": false, "error": {"code": <str>,
                "message": <str>, "details": <obj>?}}``

The closed code set is 8 literals -- documented in the README at
:mod:`src.rpc.server` and mirrored here as :data:`RPC_ERROR_CODES`
so the test suite asserts the wire equality.

**Lockstep semantics:**

- :meth:`RPCClient.call` writes one request, reads one response,
  correlates by id. Monotonic numeric id assigned by the client
  (independent of caller -- the caller never picks the id).
- :meth:`RPCClient.send_raw` + :meth:`RPCClient.read_response`
  expose the underlying NDJSON write/read so the malformed-line
  test can verify the server survives a junk line (D-36).
- :meth:`RPCClient.close` terminates the child cleanly. Idempotent.

**Server spawn (Pitfall 8):** Node 20 cannot strip TypeScript types
natively, so the subprocess command defaults to ``npx tsx src/rpc/server.ts``
with cwd at the repo root. The command is a constructor parameter
(``command``) so Phase 4/7/8 can pin differently (e.g. a pinned
production entry that does not depend on tsx).

**Windows / POSIX portability:** the stdout reader uses a
dedicated background thread + :class:`queue.Queue` instead of
``select.select`` (which only works on sockets on win32 -- the
local CI / development host is PowerShell 5.1). The same module
runs unchanged on Linux CI runners; the thread is the same on
both platforms.

**stdout discipline:** the server only writes NDJSON on stdout --
diagnostics go to stderr. The client does NOT mix logs onto stdout
either (the test asserts this by checking that every captured
stdout line parses as JSON -- a stray log would fail parse and
fail the suite by construction).
"""

from __future__ import annotations

import json
import os
import queue
import subprocess
import sys
import threading
import time
from pathlib import Path

# Repo root resolution (parity with lottie_forge/loading/catalogue.py).
# The server source path is computed from this root, never from cwd.
REPO_ROOT: Path = Path(__file__).resolve().parents[2]
DEFAULT_SERVER_PATH: Path = REPO_ROOT / "src" / "rpc" / "server.ts"
"""The committed RPC server source -- the default child entry."""


#: The closed 8-code error set the server emits (D-28/D-36).
#: Mirrored verbatim from ``src/rpc/server.ts::RPC_ERROR_CODES``.
RPC_ERROR_CODES: tuple[str, ...] = (
    "parse_error",
    "validation_error",
    "unsupported_feature",
    "compile_error",
    "sanitize_rejected",
    "internal",
    "protocol_error",
    "method_not_found",
)
"""Closed enum of RPC error codes -- never add a code without
updating both sides of the bridge in the same commit."""


def default_command(server_path: Path = DEFAULT_SERVER_PATH) -> list[str]:
    """Build the default ``tsx`` command array.

    ``tsx`` is the devDep that bridges Node 20 (no native TS strip)
    to the TypeScript server source. The command is parameterised
    so callers (Phase 4/7/8 production entries) can pin a different
    runner without touching this module.

    On Windows, Python's ``subprocess.Popen`` does NOT auto-resolve
    ``PATHEXT`` (the system call ``CreateProcess`` requires the
    ``.cmd`` extension on ``.cmd`` / ``.bat`` shims); the runtime
    helper below appends ``.cmd`` on win32 to keep the seam
    portable across CI / local Windows hosts and POSIX runners.
    """
    base = ["npx", "--no", "tsx", str(server_path)]
    if sys.platform == "win32":
        base[0] = f"{base[0]}.cmd"
    return base


class RPCError(RuntimeError):
    """Typed transport error raised on timeout, process death, or
    malformed envelope.

    Distinct from a closed RPC ``error`` envelope: this exception
    means the client cannot talk to the server at all (subprocess
    died, stdout pipe closed, response never arrived, response
    was unparseable as JSON).

    Attributes:
        cause: ``"timeout"`` | ``"process_dead"`` | ``"malformed_envelope"``
        detail: optional human-readable detail (timeout seconds,
            subprocess stderr tail, etc.).
    """

    def __init__(self, message: str, *, cause: str, detail: str | None = None) -> None:
        super().__init__(message)
        self.cause = cause
        if detail is not None:
            self.detail = detail


class RPCClient:
    """Lockstep NDJSON RPC client. Thread-unsafe by design (one
    caller at a time per client instance).

    The client owns the child process. Call :meth:`close` (or use
    the context manager) to terminate it cleanly.

    Args:
        command: the subprocess command array. Defaults to
            :func:`default_command` (``npx tsx src/rpc/server.ts``).
        cwd: working directory for the subprocess. Defaults to the
            repo root (Pitfall 8 -- the server resolves its fixture
            paths from ``import.meta.url``, so cwd is only the
            tsx invocation context).
        env: optional environment mapping merged over ``os.environ``.
        startup_timeout_s: how long to wait for the server's
            startup banner on stderr before declaring it ready.
            The banner is ``rpc-server: ready`` -- emitted exactly
            once after catalogue + style load.
    """

    _READY_BANNER = "rpc-server: ready"
    _READER_THREAD_NAME = "rpc-stdout-reader"
    _STDERR_THREAD_NAME = "rpc-stderr-drain"

    def __init__(
        self,
        *,
        command: list[str] | None = None,
        cwd: Path | str | None = None,
        env: dict[str, str] | None = None,
        startup_timeout_s: float = 30.0,
    ) -> None:
        self._command = command if command is not None else default_command()
        self._cwd = str(cwd) if cwd is not None else str(REPO_ROOT)
        merged_env = dict(os.environ)
        if env is not None:
            merged_env.update(env)
        self._env = merged_env
        self._startup_timeout_s = startup_timeout_s
        self._proc: subprocess.Popen[bytes] | None = None
        self._next_id = 0
        self._lock = threading.Lock()
        self._stderr_thread: threading.Thread | None = None
        self._reader_thread: threading.Thread | None = None
        self._lines: queue.Queue[bytes | None] = queue.Queue()
        self._stderr_captured: list[bytes] = []
        self._stderr_lock = threading.Lock()
        self._closed = False

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Spawn the child process and wait for the ready banner.

        The child writes ``rpc-server: ready ...`` to stderr after
        loading the catalogue + style fixtures. The banner is the
        canonical signal that NDJSON requests can now be written to
        its stdin -- until then, a request line could be lost in the
        boot buffering.

        Raises:
            RPCError: ``cause="process_dead"`` if the child exits
                before emitting the banner; ``cause="timeout"`` if
                it does not emit the banner within
                ``startup_timeout_s``.
        """
        if self._proc is not None:
            return  # idempotent
        try:
            self._proc = subprocess.Popen(
                self._command,
                cwd=self._cwd,
                env=self._env,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                bufsize=0,  # unbuffered on the OS side
            )
        except OSError as exc:
            raise RPCError(
                f"failed to spawn RPC server {self._command!r}: {exc}",
                cause="process_dead",
                detail=str(exc),
            ) from exc

        # Drain stderr in a daemon thread -- the server writes its
        # diagnostics there. We capture bytes for the readiness check.
        self._stderr_thread = threading.Thread(
            target=self._drain_stderr,
            name=self._STDERR_THREAD_NAME,
            daemon=True,
        )
        self._stderr_thread.start()

        # Drain stdout in a daemon thread -- the only safe way to read
        # from a pipe on Windows (where ``select`` only works on sockets).
        # Lines land in ``self._lines``; a ``None`` entry marks EOF.
        self._reader_thread = threading.Thread(
            target=self._drain_stdout,
            name=self._READER_THREAD_NAME,
            daemon=True,
        )
        self._reader_thread.start()

        # Poll for the ready banner with a finite timeout.
        deadline = time.monotonic() + self._startup_timeout_s
        while time.monotonic() < deadline:
            if self._proc.poll() is not None:
                tail = self._stderr_tail()
                raise RPCError(
                    f"RPC server exited before becoming ready "
                    f"(exit code {self._proc.returncode}); stderr tail: {tail!r}",
                    cause="process_dead",
                    detail=tail,
                )
            with self._stderr_lock:
                joined = b"".join(self._stderr_captured).decode("utf-8", errors="replace")
            if self._READY_BANNER in joined:
                return
            time.sleep(0.05)

        tail = self._stderr_tail()
        raise RPCError(
            f"RPC server did not emit ready banner within "
            f"{self._startup_timeout_s}s; stderr tail: {tail!r}",
            cause="timeout",
            detail=tail,
        )

    def close(self) -> None:
        """Terminate the child cleanly. Idempotent."""
        with self._lock:
            if self._closed:
                return
            self._closed = True
            proc = self._proc
            if proc is None:
                return
            try:
                if proc.stdin is not None and proc.stdin.writable():
                    try:
                        proc.stdin.close()
                    except OSError:
                        pass
                try:
                    proc.wait(timeout=2.0)
                except subprocess.TimeoutExpired:
                    proc.terminate()
                    try:
                        proc.wait(timeout=1.0)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait(timeout=1.0)
            finally:
                self._proc = None
                # Signal the reader thread to drain the queue and exit.
                try:
                    self._lines.put_nowait(None)
                except queue.Full:  # pragma: no cover -- queue is unbounded
                    pass

    def __enter__(self) -> RPCClient:
        self.start()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def __del__(self) -> None:  # pragma: no cover -- defensive only
        try:
            self.close()
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Lockstep RPC
    # ------------------------------------------------------------------

    def call(
        self,
        method: str,
        params: object,
        *,
        timeout: float = 10.0,
    ) -> dict[str, object]:
        """Send one NDJSON request, read one NDJSON response, return
        the parsed envelope dict.

        Args:
            method: the RPC method literal (``motion.compile`` or
                ``svg.sanitize``).
            params: the request params object (passed through as JSON
                verbatim -- the server-side zod schema validates it).
            timeout: max seconds to wait for the response line.

        Returns:
            The parsed envelope dict with keys ``id``, ``ok``, and
            either ``result`` (ok=true) or ``error`` (ok=false).

        Raises:
            RPCError: timeout, process death, malformed JSON line,
                or non-JSON content on stdout.
        """
        if self._proc is None or self._proc.stdin is None:
            raise RPCError("RPC client not started", cause="process_dead")

        with self._lock:
            self._next_id += 1
            request_id = self._next_id
            request_line = (
                json.dumps(
                    {"id": request_id, "method": method, "params": params},
                    separators=(",", ":"),
                    ensure_ascii=False,
                )
                + "\n"
            )

            try:
                self._proc.stdin.write(request_line.encode("utf-8"))
                self._proc.stdin.flush()
            except (BrokenPipeError, OSError) as exc:
                raise RPCError(
                    f"RPC server stdin closed while writing request: {exc}",
                    cause="process_dead",
                    detail=str(exc),
                ) from exc

            response_line = self._read_response_line(timeout=timeout)
            return self._parse_envelope(response_line, expected_id=request_id)

    def send_raw(self, line: str) -> None:
        """Write a raw line to the server's stdin (no id bookkeeping,
        no response read). Exposed for the malformed-line test (D-36).

        The trailing newline is appended if absent -- one logical NDJSON
        line per ``send_raw`` call.
        """
        if self._proc is None or self._proc.stdin is None:
            raise RPCError("RPC client not started", cause="process_dead")
        payload = line if line.endswith("\n") else f"{line}\n"
        try:
            self._proc.stdin.write(payload.encode("utf-8"))
            self._proc.stdin.flush()
        except (BrokenPipeError, OSError) as exc:
            raise RPCError(
                f"RPC server stdin closed while writing raw line: {exc}",
                cause="process_dead",
                detail=str(exc),
            ) from exc

    def read_response(self, *, timeout: float = 10.0) -> dict[str, object]:
        """Read exactly one NDJSON response line and parse it as the
        envelope dict. Exposed for the malformed-line test (D-36).

        Does NOT correlate with a prior ``send_raw`` -- the caller
        inspects ``envelope["id"]`` directly (the malformed-line test
        asserts ``id is None``).
        """
        line = self._read_response_line(timeout=timeout)
        return self._parse_envelope(line, expected_id=None)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _drain_stdout(self) -> None:
        """Background reader thread -- lines from stdout into the queue."""
        proc = self._proc
        if proc is None or proc.stdout is None:
            self._lines.put(None)
            return
        try:
            while True:
                chunk = proc.stdout.readline()
                if not chunk:
                    self._lines.put(None)
                    return
                self._lines.put(chunk)
        except (OSError, ValueError):
            # Stream closed or pipe broken -- mark EOF for readers.
            self._lines.put(None)

    def _drain_stderr(self) -> None:
        """Background reader thread -- lines from stderr into the captured buffer."""
        proc = self._proc
        if proc is None or proc.stderr is None:
            return
        try:
            while True:
                chunk = proc.stderr.readline()
                if not chunk:
                    return
                with self._stderr_lock:
                    self._stderr_captured.append(chunk)
        except (OSError, ValueError):
            return

    def _stderr_tail(self) -> str:
        with self._stderr_lock:
            return b"".join(self._stderr_captured).decode("utf-8", errors="replace").strip()

    def _read_response_line(self, *, timeout: float) -> bytes:
        """Pop one line from the background-reader queue, blocking up to
        ``timeout`` seconds.

        The reader thread (started in :meth:`start`) places exactly one
        ``bytes`` per ``stdout.readline()`` into ``self._lines``; an EOF
        is marked by ``None``. The timeout fires via the ``queue.get``
        timeout path.
        """
        proc = self._proc
        if proc is None:
            raise RPCError("RPC client not started", cause="process_dead")

        try:
            line = self._lines.get(timeout=timeout)
        except queue.Empty:
            # Could be a slow child or a dead one -- poll.
            if proc.poll() is not None:
                raise RPCError(
                    f"RPC server died (exit code {proc.returncode})",
                    cause="process_dead",
                    detail=str(proc.returncode),
                )
            raise RPCError(
                f"RPC server did not respond within {timeout}s",
                cause="timeout",
                detail=f"{timeout}s",
            )

        if line is None:
            # EOF on stdout -- the child closed its write side.
            tail = self._stderr_tail()
            raise RPCError(
                f"RPC server closed stdout before responding; stderr tail: {tail!r}",
                cause="process_dead",
                detail=tail,
            )
        return line

    @staticmethod
    def _parse_envelope(
        line: bytes,
        *,
        expected_id: int | None,
    ) -> dict[str, object]:
        """Parse one response line as the envelope dict.

        A malformed envelope (non-JSON, missing keys, id mismatch)
        raises :class:`RPCError` with ``cause="malformed_envelope"``
        -- the wire protocol is part of the contract, a corrupt
        envelope is a transport failure, NOT a method-level error.
        """
        text = line.decode("utf-8", errors="replace").rstrip("\n").rstrip("\r")
        if not text:
            raise RPCError(
                "RPC server returned an empty response line",
                cause="malformed_envelope",
                detail="",
            )
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            raise RPCError(
                f"RPC server returned a non-JSON response: {text!r}",
                cause="malformed_envelope",
                detail=exc.msg,
            ) from exc
        if not isinstance(parsed, dict):
            raise RPCError(
                f"RPC server returned a non-object envelope: {text!r}",
                cause="malformed_envelope",
                detail=type(parsed).__name__,
            )
        if "id" not in parsed or "ok" not in parsed:
            raise RPCError(
                f"RPC envelope missing required keys (id, ok): {text!r}",
                cause="malformed_envelope",
                detail=str(list(parsed.keys())),
            )
        if expected_id is not None:
            env_id = parsed["id"]
            if env_id != expected_id:
                raise RPCError(
                    f"RPC envelope id mismatch: expected {expected_id}, got {env_id!r}",
                    cause="malformed_envelope",
                    detail=str(env_id),
                )
        return parsed


def is_rpc_error_code(value: object) -> bool:
    """True iff ``value`` is a member of the closed :data:`RPC_ERROR_CODES`
    set. Helper for callers that need to validate a code at the boundary
    before raising a typed Phase-7 Pydantic error."""
    return isinstance(value, str) and value in RPC_ERROR_CODES


__all__ = [
    "DEFAULT_SERVER_PATH",
    "REPO_ROOT",
    "RPC_ERROR_CODES",
    "RPCClient",
    "RPCError",
    "default_command",
    "is_rpc_error_code",
]


if __name__ == "__main__":  # pragma: no cover -- manual smoke
    # ``python -m lottie_forge.rpc.client`` opens the default client
    # against the committed server, sends a probe motion.compile, and
    # prints the envelope. Manual run only -- the test suite drives
    # the full integration.
    import argparse

    parser = argparse.ArgumentParser(description="RPC client smoke probe")
    parser.add_argument(
        "fixture",
        nargs="?",
        default=str(REPO_ROOT / "fixtures" / "render-specs" / "fade.json"),
        help="Path to a RenderSpec JSON fixture (default: fade.json)",
    )
    args = parser.parse_args()
    fixture_path = Path(args.fixture)
    if not fixture_path.is_absolute():
        fixture_path = REPO_ROOT / fixture_path
    render_spec = json.loads(fixture_path.read_text(encoding="utf-8"))

    with RPCClient() as client:
        envelope = client.call("motion.compile", {"render_spec": render_spec}, timeout=30.0)
    print(json.dumps(envelope, indent=2))
    sys.exit(0 if envelope.get("ok") else 1)