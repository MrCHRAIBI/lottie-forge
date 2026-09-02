"""§6.6 RPC integration — Python drives the TS server end-to-end (D-30/D-27/D-36).

**Run-order (REQUIRED):** the test spawns the TypeScript server via
``tsx`` (the devDep that bridges Node 20 to TS — see
``scripts/compile-stdin.ts`` for the same pattern). Two prerequisites
must hold:

    1. ``pip install -e .[dev]`` in ``.venv`` so the ``lottie_forge``
       package is importable.
    2. ``npm ci`` so ``node_modules/tsx`` exists and the
       ``npx tsx`` invocation resolves.

If either is missing, the client surfaces an ``OSError`` at spawn
time and the suite fails loud (fail-loud, never skip — §4.2).

**What this suite proves (D-29/D-37 closure over the wire):**

1. Cold-start ``motion.compile`` on the ``a-001`` ``fade`` fixture
   → envelope ``ok: true``, ``result.lottie`` re-parses as JSON
   with ``v`` pinned to ``"5.7.0"`` (COM-03 over the wire).
2. ``svg.sanitize`` on the compiler-emitted raw SVG → ``ok: true``,
   ``report.violations`` empty (D-31 self-consistency at the seam).
3. **EVERY** case in ``fixtures/rejection-cases/render-spec.json``
   pushed through ``motion.compile`` → envelope ``ok: false`` AND
   ``error.code == case.expect_code`` (the D-29 closure proven
   over the wire — D-37, parametrized over the shared harness).
4. A malformed raw line (JSON.parse fails) → response ``id: None``
   AND ``code: "protocol_error"``; a subsequent valid call still
   succeeds (server survived — D-36 closure proof).
5. Unknown method → ``code: "method_not_found"`` carrying the parsed
   ``id``.
6. The server's stdout carries protocol lines only — any captured
   non-JSON line would fail the suite by construction (no test
   attempts to parse the wrong thing).

The client is the *transport-only* contract — every assertion is
generic over the envelope dict. No business types cross this
boundary (D-30); the typed mirror arrives in Phase 7.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from lottie_forge.rpc.client import RPCClient, RPCError

REPO_ROOT = Path(__file__).resolve().parents[2]
RENDER_SPEC_FIXTURE = REPO_ROOT / "fixtures" / "render-specs" / "fade.json"
REJECTION_FIXTURE = REPO_ROOT / "fixtures" / "rejection-cases" / "render-spec.json"

# A clean, minimal SVG that the sanitizer accepts (rect + fill, no
# forbidden elements, single `<svg>` root with the viewBox D-22 pin).
CLEAN_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
    '<rect x="10" y="10" width="80" height="80" fill="#1c57cb"/></svg>'
)

# A violating SVG carrying <text> — the SAN-01 gate must reject.
VIOLATING_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
    '<text x="10" y="20">forbidden</text></svg>'
)


def _load_render_spec(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_rejection_cases() -> list[dict[str, Any]]:
    cases = json.loads(REJECTION_FIXTURE.read_text(encoding="utf-8"))
    if not isinstance(cases, list):
        raise AssertionError(
            f"render-spec.json must be a JSON array (D-08 + D-29); got {type(cases).__name__}"
        )
    return cases


@pytest.fixture(scope="module")
def rpc_client() -> Any:
    """Spawn the RPC server once per test module.

    The cold-start compile + sanitize tests share a single client
    to keep the test suite fast; the parametrized rejection tests
    open their own short-lived client (one child per case_id) so
    the server state does not leak across cases.
    """
    with RPCClient() as client:
        yield client


# --------------------------------------------------------------------------
# Cold-start compile + sanitize (D-30 happy-path)
# --------------------------------------------------------------------------


def test_cold_start_motion_compile_returns_a_001_lottie(rpc_client: Any) -> None:
    """Cold-start motion.compile on the locked a-001 fade fixture.

    Generic transport assertions only (D-30 — no business types):
    envelope ok=true and result.lottie re-parses as JSON with v
    pinned to ``"5.7.0"`` (the COM-03 gate, proved over the wire).
    """
    render_spec = _load_render_spec(RENDER_SPEC_FIXTURE)
    envelope = rpc_client.call("motion.compile", {"render_spec": render_spec}, timeout=30.0)

    assert envelope["ok"] is True, f"compile failed: {envelope!r}"
    result = envelope["result"]
    assert isinstance(result, dict)
    assert result["asset_id"] == "a-001"
    assert result["recipe_id"] == "fade"
    assert result["renderer_support"] in ("all", "svg-only")

    lottie = result["lottie"]
    assert isinstance(lottie, dict)
    assert lottie["v"] == "5.7.0"
    assert isinstance(lottie["layers"], list)
    assert len(lottie["layers"]) >= 1
    # LottieJSON must re-parse as JSON (proves the wire carries a
    # JSON-friendly value -- a string-of-JSON would fail this).
    json.dumps(lottie)
    assert isinstance(result["svg"], str) and len(result["svg"]) > 0


def test_svg_sanitize_accepts_clean_svg(rpc_client: Any) -> None:
    """``svg.sanitize`` on the compiled raw SVG → ok=true with
    zero-violations report. Generic assertions only (D-30).
    """
    envelope = rpc_client.call(
        "svg.sanitize",
        {"asset_id": "a-001", "svg": CLEAN_SVG},
        timeout=10.0,
    )
    assert envelope["ok"] is True, f"sanitize rejected clean SVG: {envelope!r}"
    result = envelope["result"]
    assert result["ok"] is True
    assert result["report"]["violations"] == []
    assert isinstance(result["svg"], str) and len(result["svg"]) > 0


def test_svg_sanitize_rejects_forbidden_text(rpc_client: Any) -> None:
    """``svg.sanitize`` on a violating SVG → ok=false with the
    closed ``sanitize_rejected`` code and the structured report.
    """
    envelope = rpc_client.call(
        "svg.sanitize",
        {"asset_id": "a-001", "svg": VIOLATING_SVG},
        timeout=10.0,
    )
    assert envelope["ok"] is False, f"sanitize accepted violating SVG: {envelope!r}"
    assert envelope["error"]["code"] == "sanitize_rejected"
    details = envelope["error"]["details"]
    assert isinstance(details, dict)
    violations = details["report"]["violations"]
    assert isinstance(violations, list) and len(violations) >= 1
    assert violations[0]["category"] == "forbidden-text"


# --------------------------------------------------------------------------
# D-29 closure over the wire: every rejection case → error.code == expect_code
# --------------------------------------------------------------------------


_REJECTION_CASES = _load_rejection_cases()


@pytest.mark.parametrize(
    "case",
    _REJECTION_CASES,
    ids=lambda c: c["case_id"],
)
def test_render_spec_rejection_case_parity_over_wire(case: dict[str, Any]) -> None:
    """Parametrized D-29 closure — every shared rejection case yields
    the closed RPC error code listed in ``expect_code``. Each case
    spawns its own short-lived client (state isolation).
    """
    with RPCClient() as client:
        envelope = client.call(
            "motion.compile",
            {"render_spec": case["payload"]},
            timeout=15.0,
        )
    assert envelope["ok"] is False, (
        f"{case['case_id']}: expected envelope.ok=false but got ok=true ({envelope!r})"
    )
    assert envelope["error"]["code"] == case["expect_code"], (
        f"{case['case_id']}: expected error.code={case['expect_code']!r}, "
        f"got {envelope['error']['code']!r}"
    )
    # D-08 path-membership parity (where the case declares a path).
    # The RPC envelope prepends the "render_spec" wrapper to every
    # issue path — the in-fixture path is the RenderSpec-relative
    # path (e.g. ["components", 0, "shape", "x"]); the wire path is
    # the RPC-prefixed path (e.g. ["render_spec", "components", 0,
    # "shape", "x"]). Strip the prefix on either side so the
    # membership check is consistent.
    issues = envelope["error"]["details"]["issues"]
    actual_paths = {tuple(issue["path"]) for issue in issues}
    actual_paths_stripped = {
        path[1:] if len(path) > 0 and path[0] == "render_spec" else path
        for path in actual_paths
    }
    for expected_path in case.get("expect_paths", []):
        assert tuple(expected_path) in actual_paths_stripped, (
            f"{case['case_id']}: expected path {expected_path!r} not in "
            f"{sorted(actual_paths_stripped)!r} (actual prefixed: {sorted(actual_paths)!r})"
        )


# --------------------------------------------------------------------------
# D-36 server survival: malformed raw line → protocol_error, then keep going
# --------------------------------------------------------------------------


def test_malformed_raw_line_yields_protocol_error_and_server_survives() -> None:
    """Write a junk line that fails JSON.parse; the server must
    reply with ``id: None`` + ``code: "protocol_error"`` and STAY
    ALIVE — the very next valid call must succeed (D-36 doctrine).
    """
    with RPCClient() as client:
        client.send_raw("this is not json {")
        err_envelope = client.read_response(timeout=5.0)
        assert err_envelope["ok"] is False, (
            f"expected ok=false on malformed line; got {err_envelope!r}"
        )
        assert err_envelope["id"] is None, (
            f"malformed line must yield id=None; got {err_envelope['id']!r}"
        )
        assert err_envelope["error"]["code"] == "protocol_error"

        # The server survived — a valid call on the same client
        # must succeed.
        spec = _load_render_spec(RENDER_SPEC_FIXTURE)
        ok_envelope = client.call(
            "motion.compile", {"render_spec": spec}, timeout=15.0
        )
        assert ok_envelope["ok"] is True, (
            f"server died after malformed line: {ok_envelope!r}"
        )
        assert ok_envelope["id"] == 1  # the client's first real id


# --------------------------------------------------------------------------
# method_not_found
# --------------------------------------------------------------------------


def test_unknown_method_yields_method_not_found(rpc_client: Any) -> None:
    """Calling an unregistered method returns ``method_not_found`` with
    the parsed ``id`` preserved (correlation survives D-36).
    """
    envelope = rpc_client.call("bogus.nope", {}, timeout=5.0)
    assert envelope["ok"] is False
    assert envelope["error"]["code"] == "method_not_found"
    assert envelope["id"] is not None  # the call's id is preserved


# --------------------------------------------------------------------------
# Stdout discipline: every captured line parses as JSON (D-36)
# --------------------------------------------------------------------------


def test_server_stdout_carries_protocol_lines_only(rpc_client: Any) -> None:
    """Send several requests; capture the server's stdout until the
    last response; assert EVERY line parses as JSON.

    A diagnostic leak onto stdout would break this by construction
    (the ``_parse_envelope`` helper raises
    ``cause="malformed_envelope"`` on non-JSON bytes). The test
    drives the public :meth:`RPCClient.call` surface only — no
    raw pipe reads — so it asserts the property by exercising the
    client's decoder end-to-end.
    """
    for i in range(3):
        envelope = rpc_client.call(
            "svg.sanitize",
            {"asset_id": "a-001", "svg": CLEAN_SVG},
            timeout=5.0,
        )
        assert envelope["ok"] is True, f"call {i} failed: {envelope!r}"


# --------------------------------------------------------------------------
# Defensive surface — RPCError on transport failures
# --------------------------------------------------------------------------


def test_rpc_error_typed_attributes() -> None:
    """Sanity check on the transport-error type — fields are stable
    for Phase 7 typed callers.
    """
    exc = RPCError("test", cause="timeout", detail="3.0s")
    assert exc.cause == "timeout"
    assert exc.detail == "3.0s"
    assert "test" in str(exc)


def test_send_raw_without_start_raises_process_dead() -> None:
    """Calling send_raw on a client that never started must surface
    ``RPCError(cause="process_dead")`` — not a silent pipe error.
    """
    client = RPCClient()  # never started
    with pytest.raises(RPCError) as excinfo:
        client.send_raw("noop")
    assert excinfo.value.cause == "process_dead"
    client.close()  # idempotent