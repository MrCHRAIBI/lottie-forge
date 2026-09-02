"""lottie_forge.rpc -- Phase 3 NDJSON transport client (D-30).

This subpackage owns the **transport** half of the JSON-over-stdio
boundary that Phases 4/7/8 extend. The module is **transport-only**:
no business types are re-validated here -- the typed mirror + schema
re-validation arrives in Phase 7 alongside the Pydantic models
(per CONTEXT.md D-30, "le transport reste stable, le typage arrive").

Public surface:

- :class:`RPCError` -- the typed transport error raised on
  timeout, process death, or malformed envelope.
- :class:`RPCClient` -- the lockstep client. Spawns the server as a
  subprocess (``tsx src/rpc/server.ts`` by default; Phase 4/7/8 can
  pass a different command array), writes one NDJSON request line per
  :meth:`RPCClient.call`, reads exactly one response line, correlates
  by id, and returns the parsed envelope dict.

The client never raises on a closed RPC envelope (`ok: false`) --
it returns it. The caller decides what ``error.code`` means.

Run-order (the test docstring documents this):
    ``pip install -e .[dev] && npm ci && pytest tests/rpc/ -q``
"""

from lottie_forge.rpc.client import RPCClient, RPCError

__all__ = [
    "RPCClient",
    "RPCError",
]