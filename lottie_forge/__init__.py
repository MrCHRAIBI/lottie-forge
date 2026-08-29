"""lottie-forge — industrial factory for batch production of themed illustration packs.

Layer boundary: Python holds the **authoritative** contract definitions (Pydantic v2,
``strict=True``, ``extra="forbid"``). TypeScript mirrors each contract as a
``z.strictObject`` schema and never invents a new shape — drift is caught by the
bridge suite (see ``tests/bridge/``).
"""

__all__: list[str] = []
