"""AssetSpec domain suite -- positive (boundaries) and rejection (mirrored with TS).

Two halves:

(a) **Positive boundary** -- the reference fixture, every field at the
    accepted bound exactly (``asset_id`` ``a-000`` / ``a-999``,
    ``style_ref`` with a three-segment version, ``recipe_ref`` canonical
    id, ``composition_meta.shape_group_names`` at the inclusive 1 / 24
    bounds, ``content_hashes`` with 64 lowercase hex per field). Each
    bound is also tested one step out to prove the gate is strict
    (DM-03, §4.7).

(b) **Rejection suite** -- parametrised by behaviour, with the **shared
    harness** via :func:`tests.bridge.rejection_loader.load_rejection_cases`
    consuming ``fixtures/rejection-cases/asset-spec.json``. For every
    case we assert:

    1. ``AssetSpec.model_validate(payload)`` raises ``ValidationError``.
    2. When ``expect_paths`` is present, each expected path is **a member**
       of the Pydantic ``errors()`` loc-tuples -- never a message-text
       comparison (D-08).

The CR-01 lock (rejection of non-ASCII tokens in shape-group names) is
exercised by both the domain suite (``test_shape_group_name_with_accent_is_rejected``)
and the shared fixture ``dm03-token-non-ascii-shape-group-name``.

`asset_id` is the 50-slot lock (§4.7) -- ``"a-000"`` and ``"a-999"``
are accepted; ``"a-12"``, ``"a-1234"``, ``"b-123"``, ``""`` and ``"a-"``
are rejected with ``loc=["asset_id"]``.

`style_ref` is the STY-03 pin (`name@MAJOR.MINOR.PATCH`); partial
versions, four-segment versions and non-kebab names are all rejected
with ``loc=["style_ref"]``.

`recipe_ref` reuses the closed vocabulary from ``lottie_forge/domain/vocabulary.py``
(ADR-03 same-commit, no second declaration here); ``"disco-spin"`` is
rejected with ``loc=["recipe_ref"]``.

`content_hashes` is a **closed 2-field model** (per §4.7, no open
mapping); a third key is rejected (extra="forbid"). Per-hash pattern:
``^[a-f0-9]{64}$`` lowercase -- 63 chars, uppercase, and non-hex all
fail with ``loc=["content_hashes", "<field>"]``.
"""

from __future__ import annotations

from typing import Any

import pytest
from pydantic import ValidationError

from fixtures import make_style_spec
from lottie_forge.domain.asset import AssetSpec, CompositionMeta, ContentHashes
from lottie_forge.domain.vocabulary import RECIPE_IDS
from tests.bridge.rejection_loader import load_rejection_cases

# 64-character lowercase hex strings used as fixtures (never reuse the same
# string for the two fields to keep their semantic identity independent).
_VALID_HASH_A = "a" * 64
_VALID_HASH_B = "0123456789abcdef" * 4  # 64 chars, lowercase hex, distinct
_VALID_HASH_C = "fedcba9876543210" * 4  # 64 chars, lowercase hex, distinct


def _loc_as_tuple(error: dict) -> tuple:
    """Pydantic v2 ``errors()`` returns loc as a tuple of str/int entries."""
    return tuple(error["loc"])


def _asset_payload(**overrides: Any) -> dict[str, Any]:
    """Build a fully-valid AssetSpec payload with overridable fields.

    The defaults pin ``style_ref`` to the same ``style_version`` as the
    ``make_style_spec()`` fixture (``1.0.0``) so re-imports stay
    consistent without cross-fixture wiring.
    """
    style_version = make_style_spec().style_version
    base: dict[str, Any] = {
        "asset_id": "a-001",
        "style_ref": f"example-style@{style_version}",
        "recipe_ref": "fade",
        "composition_meta": {
            "shape_group_names": ["bg-shape", "accent-shape"],
        },
        "content_hashes": {
            "svg_sha256": _VALID_HASH_A,
            "lottie_sha256": _VALID_HASH_B,
        },
    }
    base.update(overrides)
    return base


# ---------- (a) Positive boundary ----------


def test_reference_fixture_is_accepted() -> None:
    asset = AssetSpec.model_validate(_asset_payload())
    assert asset.asset_id == "a-001"
    assert asset.recipe_ref == "fade"
    assert len(asset.composition_meta.shape_group_names) == 2
    assert asset.content_hashes.svg_sha256 == _VALID_HASH_A


@pytest.mark.parametrize("asset_id", ["a-000", "a-001", "a-050", "a-999"])
def test_asset_id_bounds_accepted(asset_id: str) -> None:
    asset = AssetSpec.model_validate(_asset_payload(asset_id=asset_id))
    assert asset.asset_id == asset_id


@pytest.mark.parametrize("recipe_ref", list(RECIPE_IDS))
def test_every_canonical_recipe_ref_is_accepted(recipe_ref: str) -> None:
    asset = AssetSpec.model_validate(_asset_payload(recipe_ref=recipe_ref))
    assert asset.recipe_ref == recipe_ref


@pytest.mark.parametrize(
    "style_ref",
    [
        "example-style@1.0.0",
        "minimal@0.0.1",
        "kebab-case-only@2.4.6",
    ],
)
def test_style_ref_pattern_accepted(style_ref: str) -> None:
    asset = AssetSpec.model_validate(_asset_payload(style_ref=style_ref))
    assert asset.style_ref == style_ref


@pytest.mark.parametrize("count", [1, 12, 24])
def test_shape_group_names_length_bounds_accepted(count: int) -> None:
    names = [f"shape-{i:02d}" for i in range(count)]
    asset = AssetSpec.model_validate(
        _asset_payload(composition_meta={"shape_group_names": names})
    )
    assert len(asset.composition_meta.shape_group_names) == count


def test_content_hashes_accepts_valid_lowercase_hex() -> None:
    asset = AssetSpec.model_validate(_asset_payload())
    # Distinct field values survive strict typing.
    assert asset.content_hashes.svg_sha256 == _VALID_HASH_A
    assert asset.content_hashes.lottie_sha256 == _VALID_HASH_B


def test_content_hashes_close_model_has_exactly_two_fields() -> None:
    """`content_hashes` is the locked 2-field model -- the closed envelope (§4.7).

    A future extension (Phase 8 ``dotlottie_sha256``) is added by *editing
    this model in the same commit* (§4.14); it is never a third key
    accepted by the current contract.
    """
    fields = set(ContentHashes.model_fields.keys())
    assert fields == {"svg_sha256", "lottie_sha256"}


# ---------- (b) Rejection suite (parametrised) ----------


@pytest.mark.parametrize("asset_id", ["a-12", "a-1234", "b-123", "", "a-"])
def test_asset_id_pattern_violation_is_rejected(asset_id: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        AssetSpec.model_validate(_asset_payload(asset_id=asset_id))
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("asset_id",) in actual_locs


@pytest.mark.parametrize(
    "style_ref",
    [
        "example-style@1.2",       # partial version (only MAJOR.MINOR)
        "example-style@1.0.0.1",   # four-segment version
        "example_style@1.0.0",     # underscore in name (non-kebab)
        "Example-Style@1.0.0",     # uppercase letter in name
        "1starts-with-digit@1.0.0",  # name starts with digit
        "example-style",           # missing @version
        "@1.0.0",                  # missing name
        "example-style@",          # missing version
    ],
)
def test_style_ref_pattern_violation_is_rejected(style_ref: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        AssetSpec.model_validate(_asset_payload(style_ref=style_ref))
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("style_ref",) in actual_locs


def test_recipe_ref_out_of_catalogue_is_rejected() -> None:
    """RecipeId is the closed vocabulary reused at the asset level (§4.7).

    ``disco-spin`` is rejected with ``loc=["recipe_ref"]`` -- the same
    vocabulary gate that drives ``MotionRecipe.recipe_id``. No second
    declaration, no second list of ids.
    """
    with pytest.raises(ValidationError) as exc_info:
        AssetSpec.model_validate(_asset_payload(recipe_ref="disco-spin"))
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("recipe_ref",) in actual_locs


@pytest.mark.parametrize("count", [0, 25])
def test_shape_group_names_out_of_range_is_rejected(count: int) -> None:
    payload = _asset_payload(
        composition_meta={"shape_group_names": [f"shape-{i:02d}" for i in range(count)]}
    )
    with pytest.raises(ValidationError) as exc_info:
        AssetSpec.model_validate(payload)
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("composition_meta", "shape_group_names") in actual_locs


@pytest.mark.parametrize(
    "name",
    ["ab", "x", "1-bad", "Has-Cap", "-leading-dash"],
)
def test_shape_group_name_pattern_violation_is_rejected(name: str) -> None:
    """The shape-group-name pattern is ``^[a-z][a-z0-9-]{2,31}$`` (§4.7).

    ``ab`` / ``x`` (too short: under the 3..32 envelope); ``1-bad``
    (leading digit, not lowercase letter); ``-leading-dash`` (anchor
    violation: the first char must be a letter); ``Has-Cap`` (uppercase).
    Each rejected at the nested index. A trailing dash is **allowed** by
    this pattern (kebab bodies permit ``-`` anywhere) -- it is not a
    case here.
    """
    payload = _asset_payload(composition_meta={"shape_group_names": [name]})
    with pytest.raises(ValidationError) as exc_info:
        AssetSpec.model_validate(payload)
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("composition_meta", "shape_group_names", 0) in actual_locs


def test_shape_group_name_with_accent_is_rejected() -> None:
    """CR-01 lock (probe encoding DM-03): non-ASCII tokens are rejected.

    ``"café"`` carries an accented letter (non-ASCII). The pattern is
    ASCII-anchored, so this is rejected with ``loc=["composition_meta",
    "shape_group_names", 0]`` -- same encoding probe that motivates
    the KebabToken ``fullmatch`` lock in 01-01.
    """
    payload = _asset_payload(composition_meta={"shape_group_names": ["café"]})
    with pytest.raises(ValidationError) as exc_info:
        AssetSpec.model_validate(payload)
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("composition_meta", "shape_group_names", 0) in actual_locs


def test_content_hash_uppercase_is_rejected() -> None:
    payload = _asset_payload(
        content_hashes={"svg_sha256": _VALID_HASH_C.upper(), "lottie_sha256": _VALID_HASH_B}
    )
    with pytest.raises(ValidationError) as exc_info:
        AssetSpec.model_validate(payload)
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("content_hashes", "svg_sha256") in actual_locs


def test_content_hash_too_short_is_rejected() -> None:
    payload = _asset_payload(
        content_hashes={"svg_sha256": "a" * 63, "lottie_sha256": _VALID_HASH_B}
    )
    with pytest.raises(ValidationError) as exc_info:
        AssetSpec.model_validate(payload)
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("content_hashes", "svg_sha256") in actual_locs


def test_content_hash_non_hex_character_is_rejected() -> None:
    payload = _asset_payload(
        content_hashes={
            "svg_sha256": "z" * 64,  # 'z' is not in [a-f0-9]
            "lottie_sha256": _VALID_HASH_B,
        }
    )
    with pytest.raises(ValidationError) as exc_info:
        AssetSpec.model_validate(payload)
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("content_hashes", "svg_sha256") in actual_locs


def test_content_hashes_extra_field_is_rejected() -> None:
    """`ContentHashes` is a closed 2-field model -- a third key is forbidden (§4.7).

    The Phase-8 ``dotlottie_sha256`` extension is added by editing the
    model in the same commit (rule 4.14), not by smuggling it past
    ``extra="forbid"``.
    """
    payload = _asset_payload(
        content_hashes={
            "svg_sha256": _VALID_HASH_A,
            "lottie_sha256": _VALID_HASH_B,
            "rogue_hash": _VALID_HASH_C,
        }
    )
    with pytest.raises(ValidationError):
        AssetSpec.model_validate(payload)


def test_extra_top_level_key_is_rejected() -> None:
    payload = _asset_payload(rogue_field="must be rejected")
    with pytest.raises(ValidationError):
        AssetSpec.model_validate(payload)


def test_extra_nested_key_in_composition_meta_is_rejected() -> None:
    payload = _asset_payload(
        composition_meta={
            "shape_group_names": ["bg-shape"],
            "rogue_meta": "must be rejected",
        }
    )
    with pytest.raises(ValidationError):
        AssetSpec.model_validate(payload)


# ---------- (c) Shared rejection harness (mirror of vitest test.each, D-06/D-08) ----------


_REJECTION_CASES = load_rejection_cases("asset-spec")


@pytest.mark.parametrize("case", _REJECTION_CASES, ids=lambda c: c.case_id)
def test_rejection_case(case) -> None:
    """Bridge-side rejection check: every shared case must be rejected by Pydantic strict.

    The TypeScript mirror in ``src/rpc/contracts/asset-spec.spec.ts``
    consumes the same JSON file -- so a drift here is visible on both
    sides at once.
    """
    with pytest.raises(ValidationError) as exc_info:
        AssetSpec.model_validate(case.payload)

    errors = exc_info.value.errors()
    actual_locs = {_loc_as_tuple(e) for e in errors}

    if not case.expect_paths:
        # No path constraint -- assert rejection only.
        assert errors, f"Expected at least one ValidationError, got none for {case.case_id}"
        return

    for expected in case.expect_paths:
        # Membership: the expected loc must appear among the actual ones.
        assert tuple(expected) in actual_locs, (
            f"{case.case_id}: expected loc {tuple(expected)!r} not found in "
            f"{sorted(actual_locs)!r}"
        )


# ---------- (d) Helpers exposed by domain.asset ----------


def test_composition_meta_constructor_accepts_valid_input() -> None:
    """``CompositionMeta`` is exposed as a nested strict model."""
    meta = CompositionMeta(shape_group_names=["bg-shape", "accent-shape"])
    assert len(meta.shape_group_names) == 2


def test_content_hashes_constructor_accepts_valid_input() -> None:
    """``ContentHashes`` is the locked 2-field model (no third arg)."""
    hashes = ContentHashes(svg_sha256=_VALID_HASH_A, lottie_sha256=_VALID_HASH_B)
    assert hashes.svg_sha256 == _VALID_HASH_A
    assert hashes.lottie_sha256 == _VALID_HASH_B