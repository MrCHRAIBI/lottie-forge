r"""AssetSpec -- the per-asset traceability contract (DM-03, §4.7, §4.11, §4.14).

AssetSpec is the **traceability unit** of every pack. The Manifest Store
(Phase 5), the Motion Compiler (Phase 3) and the Anim QA gate (Phase 4)
all consume its fields as anchors -- a missing or malformed pin here
silently breaks downstream gates. Per the §4.1 doctrine every field is
strict (``strict=True``) and closed (``extra="forbid"``) and the zod
mirror in ``src/rpc/contracts/asset-spec.schema.ts`` matches it field
for field.

**Field-by-field lock (§4.7):**

- ``asset_id`` matches ``^a-\d{3}$`` exactly -- 50 slots, 3 digits each
  (``a-000`` … ``a-049`` is the Phase-1 range; ``a-050`` … ``a-999``
  stay open for later phases). Anything off-pattern (2 digits, 4 digits,
  empty, wrong prefix, trailing dash) is rejected with
  ``loc=["asset_id"]``.

- ``style_ref`` is the **STY-03 pin** -- a strict triple
  ``name@MAJOR.MINOR.PATCH``. The name half is the same kebab-case
  envelope as the rest of the codebase; the version half is three
  numeric segments separated by **literal dots** (escape ``\.`` in
  Python, ``\.`` in zod -- any loose dot slips a 4-segment version
  past the gate). Phase 2's style re-validation gate consumes this
  regex verbatim.

- ``recipe_ref`` is the closed-vocabulary ``RecipeId`` imported from
  :mod:`lottie_forge.domain.vocabulary` (ADR-03 same-commit, **no
  second declaration here**). ``disco-spin`` and any other non-canonical
  id are rejected with ``loc=["recipe_ref"]``.

- ``composition_meta`` is a nested strict model. ``shape_group_names``
  is a list of 1..24 kebab tokens matching
  ``^[a-z][a-z0-9-]{2,31}$`` (3..32 chars total). Empty list and
  25-item list are rejected; names starting with a digit or carrying
  a non-ASCII letter are rejected (CR-01 lock, DM-03 probe encoding).

- ``content_hashes`` is the **locked 2-field model** -- exactly
  ``svg_sha256`` and ``lottie_sha256``, both 64-character lowercase
  hex (``^[a-f0-9]{64}$``). No open mapping, no third key, no
  uppercase, no 63-char or 65-char hash. The Phase-8
  ``dotlottie_sha256`` extension is added by **editing this model in
  the same commit** (rule §4.14) -- smuggling it past ``extra="forbid"``
  is impossible by construction.

Per ADR-01 no field here describes a SMIL or CSS-keyframe animation
channel: the asset carries only traceability data, and motion ships
as Lottie JSON produced by the deterministic Motion Compiler.
"""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field

from lottie_forge.domain._shared import STRICT_CONFIG
from lottie_forge.domain.vocabulary import RecipeId

# --- regex patterns (§4.7, ASCII-anchored, points échappés) ---

ASSET_ID_PATTERN = r"^a-\d{3}$"
"""50-slot asset id lock: exactly 3 digits prefixed by ``a-``."""

STYLE_REF_PATTERN = r"^[a-z][a-z0-9-]*@\d+\.\d+\.\d+$"
"""STY-03 pin: ``name@MAJOR.MINOR.PATCH`` -- three numeric segments,
dots literal."""

SHA256_HEX_PATTERN = r"^[a-f0-9]{64}$"
"""64-character lowercase hex (sha256 digest). No uppercase, no
shorter/longer digest, no non-hex characters."""

SHAPE_GROUP_NAME_PATTERN = r"^[a-z][a-z0-9-]{2,31}$"
"""Kebab token of 3..32 chars total -- the leading letter is one char
of the body, the body then has 2..31 more (``{2,31}``). Empty names,
2-char names, names starting with a digit, names carrying a non-ASCII
letter are all rejected (CR-01 lock)."""

# --- bound Annotations (anti-DoS, §4.1 #4) ---

ShapeGroupName = Annotated[str, Field(pattern=SHAPE_GROUP_NAME_PATTERN, max_length=32)]
Sha256Hex = Annotated[str, Field(pattern=SHA256_HEX_PATTERN, min_length=64, max_length=64)]


class CompositionMeta(BaseModel):
    """Per-asset composition metadata -- closed, strict, nested.

    The single field is the kebab-typed list of shape-group names that
    the Composer agent (Phase 6) will use as anchor ids for the
    ``CompositionSpec`` extension. The list bounds and the pattern
    are the same on both sides of the bridge (§4.9).
    """

    model_config = STRICT_CONFIG

    shape_group_names: list[ShapeGroupName] = Field(min_length=1, max_length=24)


class ContentHashes(BaseModel):
    """The closed 2-field content-hash envelope (§4.7, §4.14).

    Phase 1 locks **exactly** ``svg_sha256`` and ``lottie_sha256`` --
    each 64-character lowercase hex. The Phase-8 ``dotlottie_sha256``
    extension is added by editing this model in the same commit (rule
    §4.14), not by smuggling a third key past ``extra="forbid"``.
    """

    model_config = STRICT_CONFIG

    svg_sha256: Sha256Hex
    lottie_sha256: Sha256Hex


class AssetSpec(BaseModel):
    """A single asset's traceability record -- the unit the manifest and store consume.

    Every field is strict and closed; the zod mirror in
    ``src/rpc/contracts/asset-spec.schema.ts`` is the TypeScript
    authority at the RPC boundary. Style drift is detectable because
    ``style_ref`` pins a three-segment version and ``asset_id`` pins
    the 50-slot envelope.
    """

    model_config = STRICT_CONFIG

    asset_id: Annotated[str, Field(pattern=ASSET_ID_PATTERN, max_length=6)]
    style_ref: Annotated[str, Field(pattern=STYLE_REF_PATTERN, max_length=128)]
    recipe_ref: RecipeId
    composition_meta: CompositionMeta
    content_hashes: ContentHashes


__all__ = [
    "ASSET_ID_PATTERN",
    "AssetSpec",
    "CompositionMeta",
    "ContentHashes",
    "SHAPE_GROUP_NAME_PATTERN",
    "SHA256_HEX_PATTERN",
    "STYLE_REF_PATTERN",
    "Sha256Hex",
    "ShapeGroupName",
]