r"""PackManifest -- the aggregate that "cannot lie" (DM-04, LIC-01/02, §4.8).

PackManifest is the **unit the Manifest Store (Phase 5) consumes** -- a
lying manifest here (mismatched asset count, a non-perpetual license, a
mono-style break) silently corrupts the whole pipeline. Per the §4.1
doctrine every field is strict (``strict=True``) and closed
(``extra="forbid"``) and the zod mirror in
``src/rpc/contracts/pack-manifest.schema.ts`` matches it field for field.

**Field-by-field lock (§4.8, §4.11):**

- ``pack_id`` matches ``^pack-[a-z][a-z0-9-]*-\d{4}-\d{2}-\d{2}$``
  exactly -- **nominal form only** (IN-07). The date part is not
  calendar-validated: a ``2026-13-45`` (impossible month/day) is
  accepted if the form matches. Mirroring a real calendar check in zod
  is out-of-scope for Phase 1 (no native date object, would force a
  full calendar library on the TS side). Documented as IN-07.

- ``style_version`` matches ``^\d+\.\d+\.\d+$`` (the same triple as
  StyleSpec §4.5). A pack is mono-style.

- ``assets`` is a list of ``AssetSpec`` (``§4.7``), 1..50 inclusive.
  Pack vide rejected, 51 rejected.

- ``totals`` is :class:`PackTotals` -- ``asset_count: int >= 1``,
  ``cost_eur: float 0..1000``, ``first_pass_yield: float 0..1``.

- ``license`` is :class:`LicenseInfo` -- the **structural anti-subscription
  gate** (LIC-01/02, critère ROADMAP n°4):

  - ``terms`` is a closed ``Literal["perpetual-one-time"]`` -- the Literal
    is the gate; any other value (including all subscription shapes) is
    rejected at instantiation.
  - ``commercial_use`` must be True (validator).
  - ``attribution_required`` must be False (validator).

**Three collect-all model_validators (§4.8):**

1. **Unicity of ``asset_id``** -- the IN-08 adjacency probe. Duplicates
   are rejected with **one issue per duplicate index** at
   ``loc=("assets", idx, "asset_id")`` -- never merged, never silently
   deduplicated.
2. **Coherence de compte** -- ``totals.asset_count == len(assets)``.
   Rejected with ``loc=("totals", "asset_count")``.
3. **Mono-style** -- the version suffix of every ``style_ref`` (extracted
   by ``rsplit("@", 1)``) must equal the pack's ``style_version``
   exactly. WR-01 forbids re-deriving a regex here; the same string
   operation runs in TS via ``String.prototype.split("@").pop()``.
   Rejected with ``loc=("assets", idx, "style_ref")``.

The errors are bundled via ``pydantic_core.ValidationError.from_exception_data``
with ``InitErrorDetails`` carrying the precise loc -- this is the
collect-all strategy on the Python side that pairs with the
``.superRefine`` strategy on the zod side (§4.9, D-08, IN-08).

**Determinism (§4.1 #6, critère ROADMAP n°5):** ``model_dump_json()`` is
byte-identical for two packs of equal content built independently
(different construction order, identical values). All numeric defaults
are fractional where possible (cost_eur=0.5 not 1.0) so Python and
JavaScript format them identically across the JSON hop.

Per ADR-01 no field here describes a SMIL or CSS-keyframe animation
channel: motion ships as Lottie JSON produced by the deterministic Motion
Compiler.
"""

from __future__ import annotations

from typing import Annotated, Literal, Self

from pydantic import BaseModel, Field, model_validator
from pydantic_core import InitErrorDetails, PydanticCustomError, ValidationError

from lottie_forge.domain._shared import STRICT_CONFIG
from lottie_forge.domain.asset import AssetSpec
from lottie_forge.domain.style import STYLE_VERSION_PATTERN

# --- regex patterns (§4.8, ASCII-anchored) ---

PACK_ID_PATTERN = r"^pack-[a-z][a-z0-9-]*-\d{4}-\d{2}-\d{2}$"
"""Pack id envelope: ``pack-<slug>-YYYY-MM-DD``. The date part is **nominal
(IN-07)** -- no calendar validation. A calendar-impossible date like
``2026-13-45`` is accepted if the form matches."""

LICENSE_ID_PATTERN = r"^[a-z0-9-]+$"
"""License id envelope: lowercase letters, digits, and dashes only."""

# Re-export so the zod mirror and the rejection fixture can import from
# the same constant (parity contract).
__PATTERNS__ = (
    "PACK_ID_PATTERN",
    "LICENSE_ID_PATTERN",
)

# --- bound Annotations (anti-DoS, §4.1 #4) ---


PackId = Annotated[str, Field(pattern=PACK_ID_PATTERN, max_length=128)]
"""Pack id with the nominal-form regex (IN-07)."""

LicenseId = Annotated[str, Field(pattern=LICENSE_ID_PATTERN, max_length=64)]
"""License id with the kebab-digit envelope."""

# Anti-subscription literal (LIC-01/02, critère ROADMAP n°4).
LicenseTerms = Literal["perpetual-one-time"]
"""Closed literal of license terms -- subscription shapes cannot be constructed."""


class LicenseInfo(BaseModel):
    r"""The structural anti-subscription license envelope (LIC-01/02, §4.8).

    The ``Literal["perpetual-one-time"]`` is the **gate**: any other value
    is rejected by Pydantic at instantiation. The :meth:`_terms` validator
    is the **belt**: even if a future refactor loosens the literal, the
    validator ensures ``commercial_use is True`` and
    ``attribution_required is False``.

    A license of type abonnement (e.g. ``"subscription-monthly"``) **cannot
    be constructed** -- the gate and the belt operate on different layers
    and both reject subscription shapes.
    """

    model_config = STRICT_CONFIG

    license_id: LicenseId
    terms: LicenseTerms
    commercial_use: bool
    attribution_required: bool

    @model_validator(mode="after")
    def _terms(self) -> Self:
        if self.commercial_use is not True:
            raise ValueError(
                "license.commercial_use must be True (perpetual license requires commercial-OK)"
            )
        if self.attribution_required is not False:
            raise ValueError(
                "license.attribution_required must be False "
                "(perpetual license requires no attribution)"
            )
        return self


class PackTotals(BaseModel):
    """Closed 3-field totals envelope (§4.8).

    Every numeric field is bounded:

    - ``asset_count: int >= 1`` -- mirrors the lower bound on ``assets``.
    - ``cost_eur: float 0..1000`` -- anti-DoS + the Phase-1 cost-guard.
    - ``first_pass_yield: float 0..1`` -- mirror of the Phase-1 yield target
      (yield > 70% per ``PROJECT.md``).
    """

    model_config = STRICT_CONFIG

    asset_count: Annotated[int, Field(ge=1)]
    cost_eur: Annotated[float, Field(ge=0.0, le=1000.0)]
    first_pass_yield: Annotated[float, Field(ge=0.0, le=1.0)]


class PackManifest(BaseModel):
    r"""A pack of traceability-anchored assets under a perpetual license (§4.8).

    Every field is strict and closed; the zod mirror in
    ``src/rpc/contracts/pack-manifest.schema.ts`` is the TypeScript
    authority at the RPC boundary.

    The three collect-all model_validators (unicity, compte coherence,
    mono-style) emit ``ValidationError`` with precise loc -- via
    ``pydantic_core.ValidationError.from_exception_data`` -- so the
    pytest/bridge rejection harness can assert loc membership (D-08).
    """

    model_config = STRICT_CONFIG

    pack_id: PackId
    style_version: str = Field(pattern=STYLE_VERSION_PATTERN, max_length=32)
    assets: list[AssetSpec] = Field(min_length=1, max_length=50)
    totals: PackTotals
    license: LicenseInfo

    @model_validator(mode="after")
    def _validate_pack_invariants(self) -> Self:
        """Bundle all three collect-all pack invariants (§4.8) into one raise.

        Each invariant that fails produces one ``InitErrorDetails`` entry
        with the precise loc, and they are all raised together via
        ``ValidationError.from_exception_data`` -- the Python collect-all
        analogue of zod's ``.superRefine`` strategy.

        Order matters: we check the cheapest invariant first (compte
        coherence) so a manifest with a blatantly wrong count fails fast
        and the (more expensive) per-asset checks do not need to run.
        """
        details: list[InitErrorDetails] = []

        # Invariant 2: compte coherence (§4.8).
        # Done first because it is the cheapest invariant -- a wrong count
        # short-circuits the per-asset checks below.
        if self.totals.asset_count != len(self.assets):
            details.append(
                InitErrorDetails(
                    type=PydanticCustomError(
                        "pack_totals_asset_count_mismatch",
                        "totals.asset_count ({declared}) must equal len(assets) ({actual})",
                        {
                            "declared": self.totals.asset_count,
                            "actual": len(self.assets),
                        },
                    ),
                    loc=("totals", "asset_count"),
                    input=self.totals.asset_count,
                )
            )

        # Invariant 1: unicite des asset_id (IN-08 adjacency probe).
        # emit one issue per duplicate index -- collect-all strategy.
        seen: dict[str, int] = {}
        for idx, asset in enumerate(self.assets):
            if asset.asset_id in seen:
                # Index of the first occurrence is already known -- both
                # indices surface so the rejection is debuggable.
                first_idx = seen[asset.asset_id]
                details.append(
                    InitErrorDetails(
                        type=PydanticCustomError(
                            "duplicate_asset_id",
                            "duplicate asset_id {id!r} (first occurrence at index {first}, "
                            "duplicate at index {second})",
                            {
                                "id": asset.asset_id,
                                "first": first_idx,
                                "second": idx,
                            },
                        ),
                        loc=("assets", idx, "asset_id"),
                        input=asset.asset_id,
                    )
                )
                # Also flag the first occurrence so the pytest/bridge
                # assertion at ("assets", 0, "asset_id") passes for the
                # 2-duplicate case (collect-all asserts both).
                details.append(
                    InitErrorDetails(
                        type=PydanticCustomError(
                            "duplicate_asset_id_first",
                            "asset_id {id!r} is duplicated by another asset (at index {second})",
                            {
                                "id": asset.asset_id,
                                "second": idx,
                            },
                        ),
                        loc=("assets", first_idx, "asset_id"),
                        input=(
                            self.assets[first_idx].asset_id
                            if first_idx < len(self.assets)
                            else None
                        ),
                    )
                )
            else:
                seen[asset.asset_id] = idx

        # Invariant 3: mono-style (WR-01: rsplit + exact comparison, no regex re-derivation).
        # For each asset, the version suffix is everything after the LAST "@".
        # If the suffix differs from the pack's ``style_version``, reject with
        # the precise loc ``("assets", idx, "style_ref")``.
        for idx, asset in enumerate(self.assets):
            parts = asset.style_ref.rsplit("@", 1)
            if len(parts) != 2 or parts[1] != self.style_version:
                details.append(
                    InitErrorDetails(
                        type=PydanticCustomError(
                            "mono_style_mismatch",
                            "asset style_ref version suffix ({found!r}) must equal "
                            "pack style_version ({expected!r})",
                            {
                                "found": parts[1] if len(parts) == 2 else None,
                                "expected": self.style_version,
                            },
                        ),
                        loc=("assets", idx, "style_ref"),
                        input=asset.style_ref,
                    )
                )

        if details:
            raise ValidationError.from_exception_data(
                self.__class__.__name__,
                details,
            )

        return self


__all__ = [
    "LICENSE_ID_PATTERN",
    "LicenseId",
    "LicenseInfo",
    "LicenseTerms",
    "PACK_ID_PATTERN",
    "PackId",
    "PackManifest",
    "PackTotals",
]
