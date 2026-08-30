"""StyleRefinement domain suite — closed-model assertions + structural rejets.

Two halves:

(a) **Closure (delta-only)** — the locked set of fields is exactly
    ``{sub_palette, motif, stroke_pick, radius_pick, accent_weight}``. The
    set is asserted against ``model_json_schema()["properties"]`` so adding
    a sixth field is a deliberate, structural change to both this module
    and the zod mirror (``src/rpc/contracts/style-refinement.schema.ts``).

(b) **Structural rejets** — every visual primitive (``"#fff"``, ``"<path"``,
    free stroke widths, etc.) is rejected at construction time. The
    structural gate that makes the delta-only contract real is the
    ``KebabToken`` regex (CR-01, ``^[a-z][a-z0-9-]*$``): it rejects every
    hex-like, svg-like, or otherwise non-kebab primitive. Without the
    regex the closed field set would not be enough -- this test suite pins
    that the regex is in place.

A separate ``test_rejection_case`` parametrize block (added in Task 3 of
this plan) drives the shared JSON harness
(``fixtures/rejection-cases/style-refinement.json``).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from lottie_forge.domain.style_refinement import StyleRefinement
from tests.bridge.rejection_loader import load_rejection_cases

# Bridge artifact paths -- see `tests/bridge/test_style_spec_bridge.py`
# for the ordered chain pattern. The schema-keys artifact is the
# parité-de-clés byte-identical contract: TS reads it and asserts
# sorted(Object.keys(StyleRefinementSchema.shape)) == expectedKeys.
REPO_ROOT = Path(__file__).resolve().parents[2]
BRIDGE_DIR = REPO_ROOT / "fixtures" / "bridge"
SCHEMA_KEYS = BRIDGE_DIR / "style-refinement.schema-keys.json"


def _loc_as_tuple(error: dict) -> tuple:
    """Pydantic v2 ``errors()`` returns loc as a tuple of str/int entries."""
    return tuple(error["loc"])


def _valid_default() -> StyleRefinement:
    """A reference payload accepted by the closed model -- overrides only.

    Defaults: ``sub_palette=["accent"]``, ``motif=None``,
    ``stroke_pick="default"``, ``radius_pick="medium"``,
    ``accent_weight=0.5``.
    """
    return StyleRefinement(sub_palette=["accent"])


# ---------- (a) Closure & boundaries ----------


def test_field_set_is_exactly_the_locked_delta_only_set() -> None:
    """The model's properties are exactly the five §5.3 fields.

    Adding a sixth field (e.g. ``hex_override``, ``path_data``) is a
    structural change to the delta-only contract -- this test fails first.
    """
    assert set(StyleRefinement.model_json_schema()["properties"]) == {
        "sub_palette",
        "motif",
        "stroke_pick",
        "radius_pick",
        "accent_weight",
    }


def test_default_construction_is_accepted() -> None:
    """All defaults (``motif=None``, ``stroke_pick="default"``, ...) build OK."""
    refinement = StyleRefinement(sub_palette=["accent"])
    assert refinement.motif is None
    assert refinement.stroke_pick == "default"
    assert refinement.radius_pick == "medium"
    assert refinement.accent_weight == 0.5


def test_model_dump_json_round_trip() -> None:
    """A valid default serialises and re-parses byte-for-byte."""
    original = _valid_default()
    reimported = StyleRefinement.model_validate_json(original.model_dump_json())
    assert reimported == original
    assert reimported.model_dump_json() == original.model_dump_json()


# ---------- (b) KebabToken rejets in sub_palette / motif (CR-01, §5.3) ----------


def test_sub_palette_rejects_hex_like_value() -> None:
    """``"#fff"`` in ``sub_palette`` is rejected by ``KebabToken``.

    The hex pattern starts with ``#`` which is not in the kebab character
    set; the regex ``^[a-z][a-z0-9-]*$`` cannot match.
    """
    with pytest.raises(ValidationError):
        StyleRefinement.model_validate({"sub_palette": ["#fff"]})


def test_sub_palette_rejects_svg_like_value() -> None:
    """``"<path"`` in ``sub_palette`` is rejected -- a visual primitive.

    SVG path fragments (``<path``, ``<rect``) start with ``<`` which is not
    in the kebab character set; the regex cannot match.
    """
    with pytest.raises(ValidationError):
        StyleRefinement.model_validate({"sub_palette": ["<path"]})


def test_motif_rejects_hex_like_value() -> None:
    """``"#fff"`` in ``motif`` is rejected by ``KebabToken`` -- motif is a role name, not a hex."""
    with pytest.raises(ValidationError):
        StyleRefinement.model_validate({"sub_palette": ["accent"], "motif": "#fff"})


def test_motif_rejects_svg_like_value() -> None:
    """``"<path"`` in ``motif`` is rejected by ``KebabToken``.

    ``motif`` is a semantic role name (e.g. ``"sunset"``, ``"mono"`` per
    §5.3) -- it cannot carry a path fragment.
    """
    with pytest.raises(ValidationError):
        StyleRefinement.model_validate({"sub_palette": ["accent"], "motif": "<path"})


# ---------- (c) Closed model rejets (extra=forbid, Literal bounds) ----------


def test_extra_key_is_rejected_at_construction() -> None:
    """An unknown top-level field is rejected (extra=forbid).

    A ``hex_override`` field on the delta-only model is exactly the
    injection vector the closed set guards against.
    """
    with pytest.raises(ValidationError):
        StyleRefinement.model_validate(
            {"sub_palette": ["accent"], "hex_override": "#fff"}
        )


def test_unknown_stroke_pick_value_is_rejected() -> None:
    """``stroke_pick`` is a closed Literal -- ``"thick"`` is not a member.

    A free numeric stroke thickness cannot slip past the Literal -- the
    delta-only model has no numeric stroke field at all.
    """
    with pytest.raises(ValidationError):
        StyleRefinement.model_validate(
            {"sub_palette": ["accent"], "stroke_pick": "thick"}
        )


def test_unknown_radius_pick_value_is_rejected() -> None:
    """``radius_pick`` is a closed Literal -- ``"huge"`` is not a member."""
    with pytest.raises(ValidationError):
        StyleRefinement.model_validate(
            {"sub_palette": ["accent"], "radius_pick": "huge"}
        )


# ---------- (d) accent_weight bounds ----------


@pytest.mark.parametrize("value", [0.0, 0.5, 1.0])
def test_accent_weight_bounds_accepted(value: float) -> None:
    """0.0, 0.5, 1.0 -- the inclusive lower / mid / upper bounds are accepted."""
    refinement = StyleRefinement.model_validate(
        {"sub_palette": ["accent"], "accent_weight": value}
    )
    assert refinement.accent_weight == value


@pytest.mark.parametrize("value", [1.5, -0.1, 2.0, -1e-9])
def test_accent_weight_out_of_range_rejected(value: float) -> None:
    """Out-of-bounds values raise ``ValidationError``."""
    with pytest.raises(ValidationError):
        StyleRefinement.model_validate(
            {"sub_palette": ["accent"], "accent_weight": value}
        )


# ---------- (e) sub_palette length bounds ----------


def test_sub_palette_empty_is_rejected() -> None:
    """``sub_palette=[]`` is rejected (min_length=1)."""
    with pytest.raises(ValidationError):
        StyleRefinement.model_validate({"sub_palette": []})


def test_sub_palette_too_long_is_rejected() -> None:
    """17 entries is rejected (max_length=16).

    A 17-entry payload is a denial-of-service vector -- the bound is part
    of T-02-04 (anti-DoS, §4.1 #4). Every entry is also a valid kebab
    token, so the rejection must come from the length bound alone.
    """
    too_long = [f"token-{i:02d}" for i in range(17)]
    with pytest.raises(ValidationError):
        StyleRefinement.model_validate({"sub_palette": too_long})


# ---------- (f) Schema-keys artifact (parity contract with zod, Task 2) ----------


def test_export_style_refinement_schema_keys() -> None:
    """Write ``style-refinement.schema-keys.json`` for the zod mirror to consume.

    Bridge artifact: ``fixtures/bridge/style-refinement.schema-keys.json``
    is the byte-identical key set both sides of the bridge agree on. The
    TS spec at ``src/rpc/contracts/style-refinement.spec.ts`` reads this
    artifact and asserts ``sorted(Object.keys(StyleRefinementSchema.shape))
    == expectedKeys`` -- a missing artifact raises hard, never silently
    skips (§4.2).
    """
    BRIDGE_DIR.mkdir(parents=True, exist_ok=True)
    SCHEMA_KEYS.write_text(
        json.dumps(sorted(StyleRefinement.model_json_schema()["properties"].keys())),
        encoding="utf-8",
    )
    assert SCHEMA_KEYS.exists()


# ---------- (g) Rejection harness (mirror of vitest test.each, D-06/D-08) ----------


_REJECTION_CASES = load_rejection_cases("style-refinement")


@pytest.mark.parametrize("case", _REJECTION_CASES, ids=lambda c: c.case_id)
def test_rejection_case(case) -> None:
    """Every shared rejection case must be rejected by ``StyleRefinement``.

    The TypeScript mirror in ``src/rpc/contracts/style-refinement.spec.ts``
    consumes the same JSON file -- a drift here surfaces on both sides at
    once.
    """
    with pytest.raises(ValidationError) as exc_info:
        StyleRefinement.model_validate(case.payload)

    errors = exc_info.value.errors()
    actual_locs = {_loc_as_tuple(e) for e in errors}

    if not case.expect_paths:
        # No path constraint -- assert rejection only.
        assert errors, f"Expected at least one ValidationError, got none for {case.case_id}"
        return

    for expected in case.expect_paths:
        assert tuple(expected) in actual_locs, (
            f"{case.case_id}: expected loc {tuple(expected)!r} not found in "
            f"{sorted(actual_locs)!r}"
        )
