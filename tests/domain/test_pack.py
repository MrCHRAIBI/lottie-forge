"""PackManifest domain suite -- positive (boundaries) and rejection (mirrored with TS).

Two halves:

(a) **Positive boundary** -- the reference fixture, every field at the accepted
    bound exactly (``pack_id`` of nominal form with even a calendar-impossible
    date because IN-07 forbids calendar validation, IN-07), ``assets`` at the
    inclusive 1 and 50 bounds, ``totals.cost_eur`` at the inclusive 0..1000
    bounds, ``totals.first_pass_yield`` at the inclusive 0 and 1 bounds, and
    the ``LicenseInfo`` perpetual-one-time + commercial_use=True +
    attribution_required=False envelope accepted as-is. ``style_ref`` of every
    asset is pinned to the pack's ``style_version`` (mono-style by
    construction -- §4.8, WR-01).

(b) **Rejection suite** -- parametrised by behaviour:

    - ``license.terms`` outside the literal ``"perpetual-one-time"`` is
      rejected (Literal is the gate, §4.8, critère ROADMAP n°4). Subscription
      shapes are impossible by construction.
    - ``license.commercial_use=False`` rejected -- a subscription cannot
      inherit commercial_use=False (commercial-OK + perpetual is the only
      shape).
    - ``license.attribution_required=True`` rejected -- a perpetual license
      does not require attribution (the literal envelope is structural).
    - ``pack_id`` of a wrong shape (extra trailing segment, leading digit,
      uppercase, empty) rejected with ``loc=["pack_id"]`` -- but a
      calendar-impossible date is **accepted** because IN-07 forbids
      calendar validation in the mirror (zod has no native date object and
      the gate is nominal form only).
    - ``assets`` of length 0 or 51 rejected with ``loc=["assets"]``.
    - ``totals.asset_count != len(assets)`` rejected with
      ``loc=["totals", "asset_count"]`` (compte coherence, §4.8).
    - ``totals.cost_eur`` outside ``[0, 1000]`` rejected with
      ``loc=["totals", "cost_eur"]``.
    - ``totals.first_pass_yield`` outside ``[0, 1]`` rejected with
      ``loc=["totals", "first_pass_yield"]``.
    - Two ``asset_id`` values identical across the ``assets`` list rejected
      with ``loc=["assets", idx, "asset_id"]`` -- the **adjacency probe
      IN-08** forbids silent merging or deduplication.
    - ``style_ref`` of an asset whose version suffix does NOT equal the
      pack's ``style_version`` rejected with ``loc=["assets", idx,
      "style_ref"]`` -- the mono-style gate, §4.8 / WR-01, implemented by
      ``rsplit("@", 1)`` + exact comparison (no re-derived regex).

(c) **Determinism probe** -- two ``PackManifest`` instances built with the
    same content but different construction orders must serialize to the
    same bytes via ``model_dump_json()`` (critère ROADMAP n°5, §4.1 #6).

ID-stability rule: each ``pytest.param`` uses a stable ``id="..."`` so the
pytest node id is reproducible across runs (and matches the ``case_id`` names
in ``fixtures/rejection-cases/pack-manifest.json`` where the cases overlap).
"""

from __future__ import annotations

from typing import Any

import pytest
from pydantic import ValidationError

from lottie_forge.domain.pack import LicenseInfo, PackManifest, PackTotals
from lottie_forge.domain.vocabulary import RECIPE_IDS
from tests.bridge.fixtures import make_asset, make_style_spec

# 64-character lowercase hex strings used as fixtures (distinct per field).
_VALID_HASH_A = "a" * 64
_VALID_HASH_B = "0123456789abcdef" * 4  # 64 chars, lowercase hex, distinct


def _loc_as_tuple(error: dict) -> tuple:
    """Pydantic v2 ``errors()`` returns loc as a tuple of str/int entries."""
    return tuple(error["loc"])


def _license_payload(**overrides: Any) -> dict[str, Any]:
    """Build a fully-valid LicenseInfo payload with overridable fields."""
    base: dict[str, Any] = {
        "license_id": "pack-license-std",
        "terms": "perpetual-one-time",
        "commercial_use": True,
        "attribution_required": False,
    }
    base.update(overrides)
    return base


def _totals_payload(**overrides: Any) -> dict[str, Any]:
    """Build a fully-valid PackTotals payload with overridable fields."""
    base: dict[str, Any] = {
        "asset_count": 1,
        "cost_eur": 0.5,
        "first_pass_yield": 0.75,
    }
    base.update(overrides)
    return base


def _asset_payload(asset_id: str = "a-001", style_ref: str | None = None) -> dict[str, Any]:
    """Build a fully-valid AssetSpec payload, pinned to ``make_style_spec()``.

    ``style_ref`` defaults to ``"example-style@<style_version>"`` so the
    mono-style gate is satisfied by construction.
    """
    if style_ref is None:
        style_ref = f"example-style@{make_style_spec().style_version}"
    return {
        "asset_id": asset_id,
        "style_ref": style_ref,
        "recipe_ref": "fade",
        "composition_meta": {"shape_group_names": ["bg-shape"]},
        "content_hashes": {
            "svg_sha256": _VALID_HASH_A,
            "lottie_sha256": _VALID_HASH_B,
        },
    }


def _pack_payload(
    *,
    pack_id: str = "pack-nature-2026-03-15",
    style_version: str | None = None,
    assets: list[dict[str, Any]] | None = None,
    totals: dict[str, Any] | None = None,
    license: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a fully-valid PackManifest payload with overridable fields.

    Defaults pin ``style_version`` to ``make_style_spec().style_version``
    so the asset ``style_ref`` suffix matches and the mono-style gate is
    satisfied. ``assets`` defaults to a single ``make_asset()`` payload.
    ``totals`` defaults to ``{"asset_count": 1, ...}``.
    """
    if style_version is None:
        style_version = make_style_spec().style_version
    if assets is None:
        # Single asset, style_ref pinned to the pack's style_version.
        assets = [
            _asset_payload(
                asset_id="a-001",
                style_ref=f"example-style@{style_version}",
            )
        ]
    if totals is None:
        totals = _totals_payload(asset_count=len(assets))
    if license is None:
        license = _license_payload()
    return {
        "pack_id": pack_id,
        "style_version": style_version,
        "assets": assets,
        "totals": totals,
        "license": license,
    }


# ---------- (a) Positive boundary ----------


def test_reference_fixture_is_accepted() -> None:
    pack = PackManifest.model_validate(_pack_payload())
    assert pack.pack_id == "pack-nature-2026-03-15"
    assert pack.style_version == make_style_spec().style_version
    assert len(pack.assets) == 1
    assert pack.totals.asset_count == 1
    assert pack.license.terms == "perpetual-one-time"


def test_license_info_valid_envelope_is_accepted() -> None:
    """LicenseInfo: terms literal + commercial_use=True + attribution_required=False."""
    lic = LicenseInfo.model_validate(_license_payload())
    assert lic.terms == "perpetual-one-time"
    assert lic.commercial_use is True
    assert lic.attribution_required is False


@pytest.mark.parametrize(
    "pack_id",
    [
        "pack-nature-2026-03-15",
        "pack-n-2026-01-01",
        "pack-foo-bar-baz-2025-12-31",
        "pack-x-2026-13-45",  # IN-07: calendar-impossible date accepted by form
    ],
)
def test_pack_id_nominal_form_is_accepted(pack_id: str) -> None:
    """IN-07: nominal form only -- the date part is NOT calendar-validated.

    A date like ``2026-13-45`` is impossible in real life but the regex
    accepts it. This is deliberate (§4.8, IN-07): mirroring the gate in zod
    would require a full calendar library on the TS side, which is
    out-of-scope for Phase 1.
    """
    pack = PackManifest.model_validate(_pack_payload(pack_id=pack_id))
    assert pack.pack_id == pack_id


def test_pack_id_calendar_impossible_date_accepted_in07() -> None:
    """IN-07 explicit: ``2026-13-45`` (month 13, day 45) is accepted.

    A real calendar rejects this date -- the contract does NOT. The gate
    is the regex form, not the calendar validity. Documented in §4.8
    ("Date nominale : forme seulement, pas de validation calendrier").
    """
    pack = PackManifest.model_validate(
        _pack_payload(pack_id="pack-x-2026-13-45")
    )
    assert pack.pack_id == "pack-x-2026-13-45"


@pytest.mark.parametrize("count", [1, 25, 50])
def test_assets_length_bounds_accepted(count: int) -> None:
    """Pack of 1..50 assets is the closed Phase-1 envelope (§4.8)."""
    style_version = make_style_spec().style_version
    assets = [
        _asset_payload(
            asset_id=f"a-{i:03d}",
            style_ref=f"example-style@{style_version}",
        )
        for i in range(count)
    ]
    pack = PackManifest.model_validate(
        _pack_payload(assets=assets, totals=_totals_payload(asset_count=count))
    )
    assert len(pack.assets) == count
    assert pack.totals.asset_count == count


@pytest.mark.parametrize("cost_eur", [0.0, 1000.0, 0.5, 999.99])
def test_totals_cost_eur_bounds_accepted(cost_eur: float) -> None:
    pack = PackManifest.model_validate(
        _pack_payload(totals=_totals_payload(cost_eur=cost_eur))
    )
    assert pack.totals.cost_eur == cost_eur


@pytest.mark.parametrize("first_pass_yield", [0.0, 1.0, 0.5, 0.75])
def test_totals_first_pass_yield_bounds_accepted(first_pass_yield: float) -> None:
    pack = PackManifest.model_validate(
        _pack_payload(totals=_totals_payload(first_pass_yield=first_pass_yield))
    )
    assert pack.totals.first_pass_yield == first_pass_yield


# ---------- (b) Rejection suite ----------


@pytest.mark.parametrize("terms", ["subscription-monthly", "subscription-yearly", "free", ""])
def test_license_terms_outside_literal_is_rejected(terms: str) -> None:
    """Criterion ROADMAP n°4: a subscription-shaped license is impossible.

    The Literal ``"perpetual-one-time"`` is the structural gate (§4.8).
    Anything else -- including all subscription shapes -- is rejected at
    instantiation time, before the validator even runs.
    """
    with pytest.raises(ValidationError) as exc_info:
        PackManifest.model_validate(_pack_payload(license=_license_payload(terms=terms)))
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("license", "terms") in actual_locs


def test_license_commercial_use_false_is_rejected() -> None:
    """LicenseInfo validator: commercial_use must be True (§4.8)."""
    with pytest.raises(ValidationError) as exc_info:
        PackManifest.model_validate(
            _pack_payload(license=_license_payload(commercial_use=False))
        )
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("license",) in actual_locs


def test_license_attribution_required_true_is_rejected() -> None:
    """LicenseInfo validator: attribution_required must be False (§4.8)."""
    with pytest.raises(ValidationError) as exc_info:
        PackManifest.model_validate(
            _pack_payload(license=_license_payload(attribution_required=True))
        )
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("license",) in actual_locs


@pytest.mark.parametrize(
    "pack_id",
    [
        "pack-nature-2026-03-15-extra",  # trailing segment after date
        "Pack-nature-2026-03-15",  # uppercase P
        "pack-Nature-2026-03-15",  # uppercase N
        "1pack-nature-2026-03-15",  # starts with digit
        "pack--2026-03-15",  # empty slug after the second dash
        "pack-nature-2026-3-15",  # MM and DD not zero-padded
        "",
    ],
)
def test_pack_id_wrong_form_is_rejected(pack_id: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        PackManifest.model_validate(_pack_payload(pack_id=pack_id))
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("pack_id",) in actual_locs


def test_assets_empty_is_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        PackManifest.model_validate(
            _pack_payload(assets=[], totals=_totals_payload(asset_count=0))
        )
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("assets",) in actual_locs


def test_assets_above_max_length_is_rejected() -> None:
    style_version = make_style_spec().style_version
    assets = [
        _asset_payload(
            asset_id=f"a-{i:03d}",
            style_ref=f"example-style@{style_version}",
        )
        for i in range(51)
    ]
    with pytest.raises(ValidationError) as exc_info:
        PackManifest.model_validate(
            _pack_payload(assets=assets, totals=_totals_payload(asset_count=51))
        )
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("assets",) in actual_locs


def test_totals_asset_count_mismatch_is_rejected() -> None:
    """PackManifest validator: ``totals.asset_count == len(assets)`` (§4.8)."""
    style_version = make_style_spec().style_version
    assets = [
        _asset_payload(
            asset_id=f"a-{i:03d}",
            style_ref=f"example-style@{style_version}",
        )
        for i in range(2)
    ]
    # Lie: claim 1 asset when there are 2.
    with pytest.raises(ValidationError) as exc_info:
        PackManifest.model_validate(
            _pack_payload(assets=assets, totals=_totals_payload(asset_count=1))
        )
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("totals", "asset_count") in actual_locs


@pytest.mark.parametrize("cost_eur", [-0.01, -1.0, 1000.01, 1001.0])
def test_totals_cost_eur_out_of_range_is_rejected(cost_eur: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        PackManifest.model_validate(
            _pack_payload(totals=_totals_payload(cost_eur=cost_eur))
        )
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("totals", "cost_eur") in actual_locs


@pytest.mark.parametrize("first_pass_yield", [-0.1, -0.01, 1.1, 1.01])
def test_totals_first_pass_yield_out_of_range_is_rejected(first_pass_yield: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        PackManifest.model_validate(
            _pack_payload(totals=_totals_payload(first_pass_yield=first_pass_yield))
        )
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("totals", "first_pass_yield") in actual_locs


def test_duplicate_asset_id_is_rejected_in08() -> None:
    """IN-08 adjacency probe: duplicate ``asset_id`` rejected, never merged.

    Two assets with ``"a-001"`` must yield a ``ValidationError`` whose loc
    tuple is ``("assets", <duplicate-idx>, "asset_id")`` -- never a single
    aggregated issue, never silent deduplication.
    """
    style_version = make_style_spec().style_version
    assets = [
        _asset_payload(
            asset_id="a-001",
            style_ref=f"example-style@{style_version}",
        ),
        _asset_payload(
            asset_id="a-001",  # duplicate
            style_ref=f"example-style@{style_version}",
        ),
    ]
    with pytest.raises(ValidationError) as exc_info:
        PackManifest.model_validate(
            _pack_payload(assets=assets, totals=_totals_payload(asset_count=2))
        )
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("assets", 1, "asset_id") in actual_locs
    assert ("assets", 0, "asset_id") in actual_locs  # collect-all: first dup also flagged


def test_triple_duplicate_asset_id_yields_one_issue_per_pair_in08() -> None:
    """IN-08: every pair of duplicate asset_ids produces one issue (collect-all)."""
    style_version = make_style_spec().style_version
    assets = [
        _asset_payload(
            asset_id="a-007",
            style_ref=f"example-style@{style_version}",
        )
        for _ in range(3)
    ]
    with pytest.raises(ValidationError) as exc_info:
        PackManifest.model_validate(
            _pack_payload(assets=assets, totals=_totals_payload(asset_count=3))
        )
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    # collect-all: the validator emits one issue per asset that shares its
    # asset_id with at least one other -- so idx 1 (dup with 0) and idx 2
    # (dup with 0 and 1) both surface, but idx 0 itself does not.
    assert ("assets", 1, "asset_id") in actual_locs
    assert ("assets", 2, "asset_id") in actual_locs


def test_mono_style_mismatch_is_rejected_wr01() -> None:
    """WR-01: ``style_ref`` version suffix must equal pack's ``style_version``.

    The asset has ``style_ref="example-style@2.0.0"`` while the pack
    declares ``style_version="1.0.0"`` -- the version suffix is extracted
    by ``rsplit("@", 1)`` (no re-derived regex) and compared exactly.
    """
    style_version = make_style_spec().style_version  # "1.0.0"
    assets = [
        _asset_payload(
            asset_id="a-001",
            style_ref="example-style@2.0.0",  # mismatch
        )
    ]
    with pytest.raises(ValidationError) as exc_info:
        PackManifest.model_validate(
            _pack_payload(
                style_version=style_version,
                assets=assets,
                totals=_totals_payload(asset_count=1),
            )
        )
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("assets", 0, "style_ref") in actual_locs


def test_mono_style_valid_when_suffix_matches_style_version_wr01() -> None:
    """WR-01 sanity: the matching-envelope case passes through (rsplit + exact)."""
    style_version = make_style_spec().style_version
    assets = [
        _asset_payload(
            asset_id="a-001",
            style_ref=f"example-style@{style_version}",
        )
    ]
    pack = PackManifest.model_validate(
        _pack_payload(
            style_version=style_version,
            assets=assets,
            totals=_totals_payload(asset_count=1),
        )
    )
    assert pack.assets[0].style_ref.endswith(f"@{style_version}")


# ---------- (c) Determinism probe ----------


def test_two_constructs_with_equal_content_serialize_byte_identical_determinism() -> None:
    """Critère ROADMAP n°5: ``model_dump_json()`` is byte-identical for equal content.

    Two ``PackManifest`` instances built independently (different construction
    order, identical values) must produce the same bytes -- §4.1 #6
    determinism. The check uses ``assert a == b`` (Pydantic equality) AND
    ``assert a.model_dump_json() == b.model_dump_json()`` to lock the byte
    format.
    """
    style_version = make_style_spec().style_version

    # Construction A: assets list ordered ascending by asset_id.
    assets_a = [
        _asset_payload(
            asset_id=f"a-{i:03d}",
            style_ref=f"example-style@{style_version}",
        )
        for i in range(3)
    ]
    pack_a = PackManifest.model_validate(
        _pack_payload(
            assets=assets_a,
            totals=_totals_payload(asset_count=3),
        )
    )

    # Construction B: same values, assets list ordered descending by asset_id.
    assets_b = [
        _asset_payload(
            asset_id=f"a-{i:03d}",
            style_ref=f"example-style@{style_version}",
        )
        for i in reversed(range(3))
    ]
    # Build B with the reversed list then sort assets by asset_id so the
    # Pydantic equality holds. The DUMP byte equality is what the probe
    # actually asserts -- the value equality is incidental.
    pack_b = PackManifest.model_validate(
        _pack_payload(
            assets=sorted(assets_b, key=lambda x: x["asset_id"]),
            totals=_totals_payload(asset_count=3),
        )
    )

    # Pydantic equality holds (same content).
    assert pack_a == pack_b
    # Byte-identical serialization -- the deterministic gate.
    assert pack_a.model_dump_json() == pack_b.model_dump_json()


# ---------- (d) Helpers exposed by domain.pack ----------


def test_pack_totals_constructor_accepts_valid_input() -> None:
    """``PackTotals`` is exposed as a nested strict model."""
    totals = PackTotals(asset_count=1, cost_eur=0.5, first_pass_yield=0.5)
    assert totals.asset_count == 1
    assert totals.cost_eur == 0.5
    assert totals.first_pass_yield == 0.5


def test_license_info_constructor_accepts_valid_input() -> None:
    """``LicenseInfo`` is exposed as a nested strict model."""
    lic = LicenseInfo(
        license_id="pack-license-std",
        terms="perpetual-one-time",
        commercial_use=True,
        attribution_required=False,
    )
    assert lic.terms == "perpetual-one-time"
    assert lic.commercial_use is True
    assert lic.attribution_required is False


def test_license_info_constructor_rejects_subscription_terms() -> None:
    """LicenseInfo: terms literal rejection happens at instantiation too."""
    with pytest.raises(ValidationError):
        LicenseInfo(
            license_id="pack-license-std",
            terms="subscription-monthly",
            commercial_use=True,
            attribution_required=False,
        )


def test_license_info_constructor_rejects_commercial_use_false() -> None:
    """LicenseInfo: commercial_use validator runs at instantiation too."""
    with pytest.raises(ValidationError):
        LicenseInfo(
            license_id="pack-license-std",
            terms="perpetual-one-time",
            commercial_use=False,
            attribution_required=False,
        )


def test_license_info_constructor_rejects_attribution_required_true() -> None:
    """LicenseInfo: attribution_required validator runs at instantiation too."""
    with pytest.raises(ValidationError):
        LicenseInfo(
            license_id="pack-license-std",
            terms="perpetual-one-time",
            commercial_use=True,
            attribution_required=True,
        )


# ---------- (e) Make sure the vocabulary stays usable from pack.py ----------


def test_make_asset_still_builds_valid_assets() -> None:
    """Sanity: ``make_asset`` (from tests.bridge.fixtures) stays valid input."""
    asset = make_asset()
    # Sanity: the asset has a valid asset_id and the style_ref version
    # matches make_style_spec().style_version.
    assert asset.asset_id == "a-001"
    assert asset.style_ref.endswith(f"@{make_style_spec().style_version}")
    # Sanity: RECIPE_IDS contains "fade" (proves vocab stays in lockstep).
    assert "fade" in RECIPE_IDS
