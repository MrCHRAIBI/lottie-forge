"""The two BLOCKING STY-03 tests (D-07) + the pure-gate unit suite (D-06/D-09).

Test (a) -- **simulated bump** (parametrised): pins built on an older
version flag with the exact §5.4 semantics (PATCH -> sampled, MINOR ->
tokens_touched, MAJOR -> all); an up-to-date pin flags nothing; duplicate
pins each flag (never silently deduplicated -- adjacency doctrine).

Test (b) -- **permanent guard**: every ``style_ref`` extracted from a
contractually VALID committed payload (plus the contract-valid builder
baseline ``make_asset()`` / ``make_pack()``) must equal the CURRENT
version of the loaded style fixture -- any stale pin reddens verify
(same-commit bump discipline, enforced from Phase 2 onward). Extraction
is contract-scoped: a fixture payload participates ONLY if it validates
under its model (``AssetSpec`` / ``PackManifest``, payload by payload).
Rejection fixtures are **rejection-only data, outside the pin scope** --
including the fully-valid-format ``example-style@2.0.0`` of the
``mono-style-mismatch`` case in ``pack-manifest.json`` (that string is
the mutation the shared harness tests, not a pin to surveil); partial
(``1.2``) and malformed (``1.0.0.1``) versions never match
``STYLE_REF_PATTERN`` anyway. A non-vacuity assert (>= 1 scanned pin)
keeps a silently-empty extraction from reading as green.

Both tests fail the verify job on violation -- no informational report
(D-07). The Phase 5+ store-backed semantics are documented at module
level in :mod:`lottie_forge.gates.stale_pins`.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from lottie_forge.domain.asset import STYLE_REF_PATTERN, AssetSpec
from lottie_forge.domain.pack import PackManifest
from lottie_forge.gates.stale_pins import PinRecord, scan_stale_pins
from lottie_forge.loading.style import load_style_spec
from tests.bridge.fixtures import make_asset, make_pack, make_style_spec

REPO_ROOT = Path(__file__).resolve().parents[2]
REJECTION_DIR = REPO_ROOT / "fixtures" / "rejection-cases"


def _pin(asset_id: str = "a-001", version: str = "1.0.0") -> PinRecord:
    return PinRecord(asset_id=asset_id, style_ref=f"example-style@{version}")


# ---------------------------------------------------------------------------
# (a) Simulated bump -- the §5.4 dedicated suite (blocking)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("current", "expected_bump", "expected_scope"),
    [
        ("1.0.1", "patch", "sampled"),
        ("1.1.0", "minor", "tokens_touched"),
        ("2.0.0", "major", "all"),
    ],
    ids=["patch-sampled", "minor-tokens_touched", "major-all"],
)
def test_simulated_bump_flags_with_exact_class_and_scope(
    current: str, expected_bump: str, expected_scope: str
) -> None:
    flags = scan_stale_pins([_pin(version="1.0.0")], current)
    assert len(flags) == 1
    flag = flags[0]
    assert flag.pinned_version == "1.0.0"
    assert flag.current_version == current
    assert flag.bump_class == expected_bump
    assert flag.scope == expected_scope


def test_up_to_date_pin_flags_nothing() -> None:
    assert scan_stale_pins([_pin(version="1.0.0")], "1.0.0") == []


def test_downgrade_classifies_major_by_safety() -> None:
    """pinned 2.0.0 vs current 1.0.0: conservative major/all, still flagged."""
    flags = scan_stale_pins([_pin(version="2.0.0")], "1.0.0")
    assert len(flags) == 1
    assert flags[0].bump_class == "major"
    assert flags[0].scope == "all"


def test_mixed_pins_flag_in_input_order() -> None:
    flags = scan_stale_pins(
        [_pin("a-001", "1.0.0"), _pin("a-002", "1.1.0")], "2.0.0"
    )
    assert [f.asset_id for f in flags] == ["a-001", "a-002"]  # input order
    assert all(f.bump_class == "major" and f.scope == "all" for f in flags)


def test_duplicate_pins_never_merge() -> None:
    """Adjacency probe: identical stale pins each produce their own flag."""
    flags = scan_stale_pins([_pin("a-001", "0.9.9"), _pin("a-001", "0.9.9")], "1.0.0")
    assert len(flags) == 2


# ---------------------------------------------------------------------------
# (a-bis) Fail-closed injected-version guard (WR-01)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "bad_version",
    ["1.0", "abc", "1.0.x", "1.0.0.0", "", "v1.0.0", "1..0"],
    ids=[
        "two-segments",
        "non-numeric",
        "non-numeric-patch",
        "four-segments",
        "empty",
        "v-prefix",
        "empty-segment",
    ],
)
def test_malformed_current_version_fails_closed(bad_version: str) -> None:
    """WR-01: a malformed injected ``current_version`` is a loud rejection.

    Before the entry guard these inputs crashed mid-scan (``IndexError``
    for ``1.0``, bare ``ValueError: invalid literal for int()`` for
    ``abc`` / ``1.0.x``) or -- worst -- silently misclassified the
    4-segment ``1.0.0.0`` diff down to ``patch``/``sampled``. Each case
    fails if the validation disappears: the pre-fix behaviour either
    raises a bare (non-ValidationError) exception or returns a flag.
    """
    with pytest.raises(ValidationError):
        scan_stale_pins([_pin(version="1.0.0")], bad_version)


def test_four_segment_diff_is_rejected_not_downscoped() -> None:
    """WR-01 review probe: ``1.0.0.0`` is rejected at the entry guard.

    It must never reach the classifier, where it used to be flagged but
    classified ``patch``/``sampled`` -- the narrowest (wrong) scope.
    """
    with pytest.raises(ValidationError, match="String should match pattern"):
        scan_stale_pins([_pin(version="1.0.0")], "1.0.0.0")


def test_numeric_tie_with_different_strings_fails_closed() -> None:
    """WR-01: ``1.0.0`` vs ``01.0.0`` tie on all three numeric components
    but differ as strings -- the classifier must raise, never masquerade
    as a ``patch`` bump. (The removed fall-through comment claimed
    identical versions 'never reach this function': they did.)"""
    with pytest.raises(ValueError, match="tie on all three numeric components"):
        scan_stale_pins([_pin(version="1.0.0")], "01.0.0")


# ---------------------------------------------------------------------------
# (b) Permanent guard -- zero stale pins among contract-valid data (blocking)
# ---------------------------------------------------------------------------


def _extract_pins_from_rejection_fixture(
    filename: str, model: type[AssetSpec] | type[PackManifest]
) -> list[PinRecord]:
    """Extract pins from payloads that VALIDATE under ``model`` -- only.

    Rejection fixtures are rejection-only data (see module docstring): a
    payload that fails ``model_validate`` is excluded from the pin scope.
    """
    path = REJECTION_DIR / filename
    raw = json.loads(path.read_text(encoding="utf-8"))
    pins: list[PinRecord] = []
    for entry in raw:
        payload: Any = entry.get("payload")
        try:
            validated = model.model_validate(payload)
        except Exception:
            continue  # rejection-only payload -- outside the pin scope
        if isinstance(validated, AssetSpec):
            pins.append(PinRecord(asset_id=validated.asset_id, style_ref=validated.style_ref))
        else:  # PackManifest
            pins.extend(
                PinRecord(asset_id=asset.asset_id, style_ref=asset.style_ref)
                for asset in validated.assets
            )
    return pins


def test_permanent_guard_zero_stale_pins_nonempty_scan() -> None:
    """(b) Blocking guard: every contract-valid pin == current fixture version."""
    current_version = load_style_spec()[0].style_version

    pins: list[PinRecord] = []
    # Contract-scoped extraction from committed fixtures (validating only).
    pins.extend(_extract_pins_from_rejection_fixture("asset-spec.json", AssetSpec))
    pins.extend(
        _extract_pins_from_rejection_fixture("pack-manifest.json", PackManifest)
    )
    # Contract-valid builder baseline (the non-vacuity source).
    baseline_asset = make_asset()
    pins.append(
        PinRecord(asset_id=baseline_asset.asset_id, style_ref=baseline_asset.style_ref)
    )
    pins.extend(
        PinRecord(asset_id=asset.asset_id, style_ref=asset.style_ref)
        for asset in make_pack().assets
    )

    # Non-vacuity: a silently-empty extraction is a failure, never a green.
    total = len(pins)
    assert total >= 1, (
        "permanent guard scanned zero pins -- the extraction must include the "
        "contract-valid builder baseline (make_asset/make_pack)"
    )

    # Every style_ref must be well-formed AND pinned at the current version.
    for pin in pins:
        assert re.match(STYLE_REF_PATTERN, pin.style_ref), pin.style_ref
    flags = scan_stale_pins(pins, current_version)
    assert flags == [], (
        f"stale pins detected (current style fixture version {current_version!r}): "
        f"{[f.model_dump() for f in flags]} -- bumping style_version requires the "
        f"same-commit discipline over every pinned fixture"
    )
    # The baseline really participates (make_style_spec().style_version).
    assert make_style_spec().style_version == current_version
