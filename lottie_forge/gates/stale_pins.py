r"""STY-03 stale-pin gate -- pure scan over injected pins (D-06/D-08/D-09).

``scan_stale_pins`` is the Phase-2 fixture-level heart of the style
re-validation gate (§5.4). It is a **pure function**: the pin source is
injected by the caller (committed fixtures today, the manifest store in
Phase 5+ -- same ``AssetSpec.style_ref`` anchor), so the gate logic is
written once and re-used when the store-backed variant lands. Per D-06's
Phase 5+ semantic note: store-backed flags will feed the re-validation
queue (yield report Phase 9, rebuild Phase 10) and are NO LONGER a CI
failure there; the red CI today only polices repo coherence (committed
fixtures).

**No zod mirror (D-08, §4.10 rule).** ``PinRecord`` / ``StalePinFlag`` are
Python-only gate types -- nothing crosses the Py<->TS boundary, so the
bridge/parity harness does not apply. Creating a TS mirror would be a
second source of truth for a type that never leaves Python.

Bump classification (D-09) is derived **in-function** by comparing the
pinned and current version component-by-component (major first, then
minor, then patch; the first differing component names the class). The
re-validation SCOPE is declarative in Phase 2 (``sampled`` /
``tokens_touched`` / ``all``) -- resolving which assets actually use
which tokens is impossible at fixture level (``AssetSpec`` does not
reference tokens) and arrives with the store in Phase 5+.

Safety rule: a downgrade (pinned version GREATER than current) classifies
as ``major`` -- the most conservative scope -- and still flags. Order of
output = order of input (stable, one flag per stale pin, duplicates never
merged -- the IN-08 adjacency doctrine).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Annotated, Final, Literal

from pydantic import BaseModel, Field

from lottie_forge.domain._shared import STRICT_CONFIG
from lottie_forge.domain.asset import STYLE_REF_PATTERN

ASSET_ID_GATE_PATTERN = r"^a-\d{3}$"
"""50-slot asset id lock -- the same shape the AssetSpec contract enforces."""

BumpClass = Literal["patch", "minor", "major"]
StaleScope = Literal["sampled", "tokens_touched", "all"]

BUMP_SCOPE: Final[dict[str, StaleScope]] = {
    "patch": "sampled",
    "minor": "tokens_touched",
    "major": "all",
}
"""§5.4 table, declarative in Phase 2 (D-09): the per-asset token-usage
resolution that would turn ``tokens_touched`` into a concrete asset set
requires the Phase 5+ store."""


class PinRecord(BaseModel):
    """One injectable pin -- decoupled from AssetSpec on purpose (D-06).

    Only the two fields the gate needs: the asset identity and the
    ``name@X.Y.Z`` style_ref. ``STYLE_REF_PATTERN`` is **imported** from
    ``lottie_forge.domain.asset`` verbatim (no re-derivation).
    """

    model_config = STRICT_CONFIG

    asset_id: Annotated[str, Field(pattern=ASSET_ID_GATE_PATTERN)]
    style_ref: Annotated[str, Field(pattern=STYLE_REF_PATTERN, max_length=128)]


class StalePinFlag(BaseModel):
    """One stale pin with its derived bump class and declarative scope."""

    model_config = STRICT_CONFIG

    asset_id: str
    pinned_version: str
    current_version: str
    bump_class: BumpClass
    scope: StaleScope


def _classify_bump(pinned: str, current: str) -> BumpClass:
    """Derive the bump class from a component-wise semver diff (D-09).

    Major first, then minor, then patch -- the first differing component
    names the class. A downgrade (pinned > current) classifies as
    ``major`` by safety: the conservative scope re-validates everything.
    """
    pinned_parts = [int(p) for p in pinned.split(".")]
    current_parts = [int(p) for p in current.split(".")]
    for index, name in ((0, "major"), (1, "minor"), (2, "patch")):
        if pinned_parts[index] != current_parts[index]:
            diff = current_parts[index] - pinned_parts[index]
            if name == "major" or diff < 0:
                return "major"
            return name  # type: ignore[return-value]
    return "patch"  # identical versions never reach this function


def scan_stale_pins(
    pins: Sequence[PinRecord], current_version: str
) -> list[StalePinFlag]:
    """Flag every pin whose version differs from ``current_version`` (pure).

    One flag per stale pin, output in input order (stable), duplicates
    never merged. Up-to-date pins produce nothing. The version half is
    extracted with ``rsplit("@", 1)`` -- the WR-01 string discipline, no
    regex re-derivation.
    """
    flags: list[StalePinFlag] = []
    for pin in pins:
        pinned_version = pin.style_ref.rsplit("@", 1)[1]
        if pinned_version == current_version:
            continue
        bump_class = _classify_bump(pinned_version, current_version)
        flags.append(
            StalePinFlag(
                asset_id=pin.asset_id,
                pinned_version=pinned_version,
                current_version=current_version,
                bump_class=bump_class,
                scope=BUMP_SCOPE[bump_class],
            )
        )
    return flags


__all__ = [
    "BUMP_SCOPE",
    "BumpClass",
    "PinRecord",
    "StalePinFlag",
    "StaleScope",
    "scan_stale_pins",
]
