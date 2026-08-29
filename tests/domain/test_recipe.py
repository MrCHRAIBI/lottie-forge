"""MotionRecipe domain suite — positive (boundaries) and rejection (mirrored with TS).

Two halves:

(a) **Positive boundary** — each canonical recipe id accepted, every numeric
    field at the accepted bound exactly (``duration_ms=100`` and ``10000``,
    ``amplitude=0`` and ``1``, ``loops=1`` and ``10``, ``theme_anchors``
    length ``0`` default and ``16`` max). The default ``theme_anchors=[]``
    path is exercised explicitly.

(b) **Rejection suite** — parametrised by behaviour:

    - ``recipe_id`` not in catalogue (``disco-spin``) is rejected with
      ``loc=["recipe_id"]`` (DM-02 / ADR-03 closure lock).
    - ``duration_ms`` outside ``[100, 10000]`` rejected with
      ``loc=["duration_ms"]``; ``"1200"`` (string) rejected (strict typing,
      §4.1 #3); ``1200.0`` (float) rejected (Pydantic strict half of WR-06,
      §4.9). The float rejection is **the Python authority** -- mirrored as a
      dedicated bridge test in ``tests/bridge/test_recipe_bridge.py`` with a
      documented comment on the TS side.
    - ``params`` nested: ``amplitude`` outside ``[0, 1]`` with
      ``loc=["params","amplitude"]``; ``direction="diagonal"`` with
      ``loc=["params","direction"]``; ``loops`` outside ``[1, 10]`` with
      ``loc=["params","loops"]``.
    - ``theme_anchors``: 17 items rejected with ``loc=["theme_anchors"]``;
      ``"accent\\n"`` rejected via KebabToken at index 0 with
      ``loc=["theme_anchors", 0]`` (CR-01 lock).
    - ``family`` and ``easing``: kebab max 64; ``"Solid Color"`` (space)
      rejected; 65-character string rejected (WR-04 family bound).
    - ``extra`` key top-level or nested → rejected (extra="forbid" on the
      nested ``MotionParams`` model too).

ID-stability rule: each ``pytest.param`` uses a stable ``id="..."`` so the
pytest node id is reproducible across runs (and matches the ``case_id`` names
in ``fixtures/rejection-cases/recipe.json`` where the cases overlap).
"""

from __future__ import annotations

from typing import Any

import pytest
from pydantic import ValidationError

from lottie_forge.domain.recipe import (  # type: ignore[attr-defined]  -- populated in Task 2 GREEN
    MotionParams,
    MotionRecipe,
)
from lottie_forge.domain.vocabulary import RECIPE_IDS


def _loc_as_tuple(error: dict) -> tuple:
    return tuple(error["loc"])


def _recipe_payload(**overrides: Any) -> dict[str, Any]:
    """Build a fully-valid recipe payload with overridable fields."""
    base: dict[str, Any] = {
        "recipe_id": "fade",
        "family": "transform",
        "duration_ms": 1200,
        "easing": "ease-in-out",
        "params": {
            "amplitude": 0.5,
            "direction": "up",
            "loops": 1,
        },
        "theme_anchors": [],
    }
    base.update(overrides)
    return base


# ---------- (a) Positive boundary ----------


def test_reference_fixture_is_accepted() -> None:
    recipe = MotionRecipe.model_validate(_recipe_payload())
    assert recipe.recipe_id == "fade"
    assert recipe.duration_ms == 1200
    assert recipe.params.amplitude == 0.5
    assert recipe.theme_anchors == []


@pytest.mark.parametrize("recipe_id", RECIPE_IDS)
def test_every_canonical_recipe_id_is_accepted(recipe_id: str) -> None:
    recipe = MotionRecipe.model_validate(_recipe_payload(recipe_id=recipe_id))
    assert recipe.recipe_id == recipe_id


@pytest.mark.parametrize("duration_ms", [100, 10000])
def test_duration_ms_bounds_accepted(duration_ms: int) -> None:
    recipe = MotionRecipe.model_validate(_recipe_payload(duration_ms=duration_ms))
    assert recipe.duration_ms == duration_ms


@pytest.mark.parametrize("amplitude", [0.0, 1.0, 0.5, 0.25])
def test_amplitude_bounds_accepted(amplitude: float) -> None:
    recipe = MotionRecipe.model_validate(
        _recipe_payload(params={"amplitude": amplitude, "direction": "up", "loops": 1})
    )
    assert recipe.params.amplitude == amplitude


@pytest.mark.parametrize("direction", ["up", "down", "left", "right", "none"])
def test_direction_literal_values_accepted(direction: str) -> None:
    recipe = MotionRecipe.model_validate(
        _recipe_payload(params={"amplitude": 0.5, "direction": direction, "loops": 1})
    )
    assert recipe.params.direction == direction


@pytest.mark.parametrize("loops", [1, 10, 5])
def test_loops_bounds_accepted(loops: int) -> None:
    recipe = MotionRecipe.model_validate(
        _recipe_payload(params={"amplitude": 0.5, "direction": "up", "loops": loops})
    )
    assert recipe.params.loops == loops


def test_theme_anchors_default_is_empty_list() -> None:
    """theme_anchors is optional with default [] -- the field can be omitted."""
    payload = _recipe_payload()
    payload.pop("theme_anchors")
    recipe = MotionRecipe.model_validate(payload)
    assert recipe.theme_anchors == []


def test_theme_anchors_accepts_up_to_16_items() -> None:
    payload = _recipe_payload(theme_anchors=[f"anchor-{i:02d}" for i in range(16)])
    recipe = MotionRecipe.model_validate(payload)
    assert len(recipe.theme_anchors) == 16


# ---------- (b) Rejection suite ----------


def test_recipe_id_out_of_catalogue_is_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        MotionRecipe.model_validate(_recipe_payload(recipe_id="disco-spin"))
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("recipe_id",) in actual_locs


@pytest.mark.parametrize("duration_ms", [99, 10001, 0, -1])
def test_duration_ms_out_of_range_is_rejected(duration_ms: int) -> None:
    with pytest.raises(ValidationError) as exc_info:
        MotionRecipe.model_validate(_recipe_payload(duration_ms=duration_ms))
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("duration_ms",) in actual_locs


def test_duration_ms_string_is_rejected_strict() -> None:
    """Pydantic strict rejects the string form for an int field (§4.1 #3)."""
    with pytest.raises(ValidationError) as exc_info:
        MotionRecipe.model_validate(_recipe_payload(duration_ms="1200"))
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("duration_ms",) in actual_locs


def test_duration_ms_integral_float_is_rejected_by_pydantic_strict() -> None:
    """Python half of WR-06 (§4.9): Pydantic strict rejects ``1200.0``.

    The bridge test in ``tests/bridge/test_recipe_bridge.py`` documents the
    asymmetry -- zod ``z.number().int()`` accepts the same value -- and pins
    Python as the strictest authority at re-import.
    """
    with pytest.raises(ValidationError) as exc_info:
        MotionRecipe.model_validate(_recipe_payload(duration_ms=1200.0))
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("duration_ms",) in actual_locs


@pytest.mark.parametrize("amplitude", [-0.1, 1.1, -0.01, 1.01])
def test_amplitude_out_of_range_is_rejected(amplitude: float) -> None:
    with pytest.raises(ValidationError) as exc_info:
        MotionRecipe.model_validate(
            _recipe_payload(params={"amplitude": amplitude, "direction": "up", "loops": 1})
        )
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("params", "amplitude") in actual_locs


def test_direction_unknown_value_is_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        MotionRecipe.model_validate(
            _recipe_payload(params={"amplitude": 0.5, "direction": "diagonal", "loops": 1})
        )
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("params", "direction") in actual_locs


@pytest.mark.parametrize("loops", [0, 11, -1, 100])
def test_loops_out_of_range_is_rejected(loops: int) -> None:
    with pytest.raises(ValidationError) as exc_info:
        MotionRecipe.model_validate(
            _recipe_payload(params={"amplitude": 0.5, "direction": "up", "loops": loops})
        )
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("params", "loops") in actual_locs


def test_theme_anchors_above_max_length_is_rejected() -> None:
    payload = _recipe_payload(theme_anchors=[f"anchor-{i:02d}" for i in range(17)])
    with pytest.raises(ValidationError) as exc_info:
        MotionRecipe.model_validate(payload)
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("theme_anchors",) in actual_locs


def test_theme_anchors_item_with_newline_is_rejected_cr01() -> None:
    """CR-01: ``"accent\\n"`` rejected at ``loc=["theme_anchors", 0]`` via KebabToken."""
    payload = _recipe_payload(theme_anchors=["accent\n"])
    with pytest.raises(ValidationError) as exc_info:
        MotionRecipe.model_validate(payload)
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("theme_anchors", 0) in actual_locs


@pytest.mark.parametrize("family", ["Solid Color", "has space", "UPPER", "1starts-with-digit"])
def test_family_non_kebab_is_rejected(family: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        MotionRecipe.model_validate(_recipe_payload(family=family))
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("family",) in actual_locs


def test_family_65_chars_is_rejected_wr04() -> None:
    with pytest.raises(ValidationError) as exc_info:
        MotionRecipe.model_validate(_recipe_payload(family="a" * 65))
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("family",) in actual_locs


@pytest.mark.parametrize("easing", ["Solid Color", "1starts-with-digit"])
def test_easing_non_kebab_is_rejected(easing: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        MotionRecipe.model_validate(_recipe_payload(easing=easing))
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("easing",) in actual_locs


def test_easing_65_chars_is_rejected_wr04() -> None:
    with pytest.raises(ValidationError) as exc_info:
        MotionRecipe.model_validate(_recipe_payload(easing="b" * 65))
    actual_locs = {_loc_as_tuple(e) for e in exc_info.value.errors()}
    assert ("easing",) in actual_locs


def test_extra_top_level_key_is_rejected() -> None:
    payload = _recipe_payload(rogue_field="must be rejected")
    with pytest.raises(ValidationError):
        MotionRecipe.model_validate(payload)


def test_extra_nested_key_in_params_is_rejected() -> None:
    payload = _recipe_payload(
        params={
            "amplitude": 0.5,
            "direction": "up",
            "loops": 1,
            "rogue_param": "must be rejected",
        }
    )
    with pytest.raises(ValidationError):
        MotionRecipe.model_validate(payload)


# ---------- (c) Helpers exposed by domain.recipe ----------


def test_make_recipe_helper_builds_a_valid_recipe() -> None:
    """``make_recipe`` is the single fixture source for the bridge suite.

    It must build a ``MotionRecipe`` that survives strict validation, with
    sensible defaults (``duration_ms=1200``, ``amplitude=0.5``, etc.).
    """
    from lottie_forge.domain.recipe import make_recipe  # type: ignore[attr-defined]

    recipe = make_recipe("bounce")
    assert recipe.recipe_id == "bounce"
    assert recipe.duration_ms == 1200
    assert recipe.params.amplitude == 0.5
    assert recipe.params.direction == "up"
    assert recipe.params.loops == 1
    assert recipe.theme_anchors == []


def test_motion_params_constructor_accepts_valid_input() -> None:
    """``MotionParams`` is exposed as a nested strict model."""
    params = MotionParams(amplitude=0.25, direction="left", loops=3)
    assert params.amplitude == 0.25
    assert params.direction == "left"
    assert params.loops == 3
