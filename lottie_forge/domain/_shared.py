"""Shared infrastructure for the ``lottie_forge.domain`` models.

This module holds constants and helpers imported by every domain model so that
siblings stay decoupled and the regex / config defaults exist exactly once.

Members
-------

- :data:`STRICT_CONFIG` -- the strict, no-extras ``ConfigDict`` shared by every
  domain model. Equivalent to ``z.strictObject`` on the TypeScript side.
- :data:`TOKEN_NAME_PATTERN` -- the regex for ``kebab-case`` identifier tokens
  used by palette names, easing names, and shape-group names. Centralised so
  the regex lives in exactly one place across the bridge.
- :data:`KebabToken` -- the ``Annotated[str, StringConstraints(pattern=...)``
  type. Validation is **owned by pydantic-core** (CR-01 fix, §4.6): no
  hand-rolled Python validator -- the ``$`` anchor of Python ``re`` previously
  accepted ``"accent\\n"`` while zod rejected it, so we delegate to the same
  regex engine that drives every other Pydantic string field.
"""

from typing import Annotated

from pydantic import ConfigDict, StringConstraints

STRICT_CONFIG = ConfigDict(extra="forbid", strict=True)
"""Shared model config: no coercion, no unknown fields."""

TOKEN_NAME_PATTERN = r"^[a-z][a-z0-9-]*$"
"""Stable kebab-case token: lowercase letter, then lowercase/digit/- only."""

# CR-01 (D-02 #1): validation owned by pydantic-core, not a hand-rolled validator.
# max_length 64 mirrors zod's ``.max(64)`` (WR-04 family bound applied same commit).
KebabToken = Annotated[str, StringConstraints(pattern=TOKEN_NAME_PATTERN, max_length=64)]

__all__ = [
    "KebabToken",
    "STRICT_CONFIG",
    "TOKEN_NAME_PATTERN",
]
