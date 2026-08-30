"""CatalogRecipe / RecipeCatalogue domain suite (MOT-01..03, §5.5.3, plan 02-04 Task 1).

Positive half: one valid ``CatalogRecipe`` per locked id (values = §5.5.2 ×
D-01 matrix) + a valid 10-recipe catalogue + JSON-mode validation (arrays →
tuples for ``intensity_range``) + the type-level lockstep guarantees.

Rejection half (loc-membership assertions, same convention as
``tests/domain/test_pack.py``):

- unknown id ``disco-spin`` → loc ``("recipes", idx, "id")`` (RecipeId Literal)
- duplicate id → collect-all issue at ``("recipes", idx, "id")`` (one issue
  per duplicate/excess occurrence -- never silently merged, IN-08 analogue)
- 7 / 13 recipes → loc ``("recipes",)`` (invariant 8..12, ADR-03)
- ``theme_anchors: []`` → loc ``("recipes", idx, "theme_anchors")`` (MOT-03)
- unknown anchor ``logo`` → loc ``("recipes", idx, "theme_anchors")`` (D-10)
- unordered intensity ``[1.0, 0.2]`` → collect-all
  ``("recipes", idx, "intensity_range")``; out-of-bound ``1.5`` → field loc
- shapes ``["circle"]`` / triggers ``["hover"]`` → closed-set field locs
- duration 500 / 1600 → collect-all pack range ``("recipes", idx,
  "duration_ms")``; duration 99999 → field-level model bounds
- ``keyframe_shape "spin-around"`` → loc ``("recipes", idx, "keyframe_shape")``
- ``family "Opacity"`` (uppercase) → KebabToken rejects at ``family``
- ``catalogue_version "1.0"`` → loc ``("catalogue_version",)``
- extra keys top-level and nested → strict reject

Free-string guarantee: a brand-new family like ``"blur"`` passes -- no
Literal on family (§5.9, the catalogue is the source of families).
"""

from __future__ import annotations

from typing import Any, get_args

import pytest
from pydantic import ValidationError

from lottie_forge.domain.catalogue import (
    KEYFRAME_SHAPES,
    SHAPE_NAMES,
    TRIGGER_POINTS,
    CatalogRecipe,
    RecipeCatalogue,
)
from lottie_forge.domain.vocabulary import RECIPE_IDS

# §5.5.2 × D-01: the locked product data -- id -> (family, duration_ms,
# easing, keyframe_shape, theme_anchors, intensity_range, shapes, triggers).
RECIPE_DATA: dict[str, dict[str, Any]] = {
    "fade": {
        "family": "opacity",
        "duration_ms": 800,
        "easing": "standard",
        "keyframe_shape": "opacity-ramp",
        "theme_anchors": ["primary", "accent"],
        "intensity_range": (0.0, 1.0),
        "shapes_supported": ["rect", "ellipse", "path"],
        "trigger_points": ["enter", "exit"],
    },
    "slide": {
        "family": "transform",
        "duration_ms": 1000,
        "easing": "standard",
        "keyframe_shape": "translate-in",
        "theme_anchors": ["primary"],
        "intensity_range": (0.2, 1.0),
        "shapes_supported": ["rect", "ellipse", "path"],
        "trigger_points": ["enter", "exit"],
    },
    "bounce": {
        "family": "transform",
        "duration_ms": 1200,
        "easing": "entrance",
        "keyframe_shape": "overshoot-settle",
        "theme_anchors": ["primary", "accent"],
        "intensity_range": (0.3, 1.0),
        "shapes_supported": ["rect", "ellipse", "path", "polyline"],
        "trigger_points": ["enter"],
    },
    "pulse": {
        "family": "scale",
        "duration_ms": 900,
        "easing": "standard",
        "keyframe_shape": "scale-breath",
        "theme_anchors": ["accent"],
        "intensity_range": (0.1, 0.8),
        "shapes_supported": ["rect", "ellipse", "polystar"],
        "trigger_points": ["enter", "loop"],
    },
    "draw-on": {
        "family": "stroke",
        "duration_ms": 1200,
        "easing": "entrance",
        "keyframe_shape": "trim-path",
        "theme_anchors": ["accent"],
        "intensity_range": (0.2, 1.0),
        "shapes_supported": ["path", "polyline"],
        "trigger_points": ["enter"],
    },
    "rotate": {
        "family": "transform",
        "duration_ms": 1100,
        "easing": "standard",
        "keyframe_shape": "angular-in",
        "theme_anchors": ["primary"],
        "intensity_range": (0.2, 1.0),
        "shapes_supported": ["path", "polyline", "polystar"],
        "trigger_points": ["enter"],
    },
    "scale-pop": {
        "family": "scale",
        "duration_ms": 700,
        "easing": "entrance",
        "keyframe_shape": "pop-settle",
        "theme_anchors": ["primary", "accent"],
        "intensity_range": (0.2, 1.0),
        "shapes_supported": ["rect", "ellipse", "polystar"],
        "trigger_points": ["enter"],
    },
    "float": {
        "family": "transform",
        "duration_ms": 1400,
        "easing": "standard",
        "keyframe_shape": "sine-drift",
        "theme_anchors": ["primary", "background"],
        "intensity_range": (0.1, 0.8),
        "shapes_supported": ["rect", "ellipse", "path"],
        "trigger_points": ["loop"],
    },
    "wiggle": {
        "family": "transform",
        "duration_ms": 800,
        "easing": "standard",
        "keyframe_shape": "damped-oscillation",
        "theme_anchors": ["accent"],
        "intensity_range": (0.1, 0.5),
        "shapes_supported": ["rect", "ellipse", "path", "polyline"],
        "trigger_points": ["enter"],
    },
    "orbit": {
        "family": "transform",
        "duration_ms": 1500,
        "easing": "standard",
        "keyframe_shape": "circular-path",
        "theme_anchors": ["primary", "accent"],
        "intensity_range": (0.3, 1.0),
        "shapes_supported": ["ellipse", "path", "polystar"],
        "trigger_points": ["loop"],
    },
}


def _loc_as_tuple(error: dict) -> tuple:
    """Pydantic v2 ``errors()`` returns loc as a tuple of str/int entries."""
    return tuple(error["loc"])


def _recipe_payload(recipe_id: str = "fade", **overrides: Any) -> dict[str, Any]:
    """Build a fully-valid CatalogRecipe payload (JSON shape, §5.5.1 keys)."""
    base: dict[str, Any] = {"id": recipe_id, **RECIPE_DATA[recipe_id]}
    base.update(overrides)
    return base


def make_recipe_entry(recipe_id: str) -> CatalogRecipe:
    """One valid CatalogRecipe per locked id (code-side, tuples for range)."""
    return CatalogRecipe.model_validate(_recipe_payload(recipe_id))


def make_catalogue(recipe_ids: list[str] | None = None) -> RecipeCatalogue:
    """A valid catalogue -- defaults to the 10 locked ids in canonical order."""
    ids = recipe_ids if recipe_ids is not None else list(RECIPE_IDS)
    return RecipeCatalogue(
        catalogue_version="1.0.0",
        recipes=[make_recipe_entry(rid) for rid in ids],
    )


# ---------------------------------------------------------------------------
# Positive
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("recipe_id", RECIPE_IDS)
def test_valid_recipe_per_locked_id(recipe_id: str) -> None:
    recipe = make_recipe_entry(recipe_id)
    assert recipe.id == recipe_id
    assert len(recipe.theme_anchors) >= 1  # MOT-03


def test_valid_catalogue_ten_recipes() -> None:
    catalogue = make_catalogue()
    assert len(catalogue.recipes) == 10
    assert [r.id for r in catalogue.recipes] == list(RECIPE_IDS)  # order preserved


def test_json_mode_arrays_become_tuples() -> None:
    """``model_validate_json`` maps JSON arrays onto the intensity tuple."""
    payload = _recipe_payload("fade")
    recipe = CatalogRecipe.model_validate_json(
        '{"id": "fade", "family": "opacity", "duration_ms": 800, "easing": "standard",'
        ' "keyframe_shape": "opacity-ramp", "intensity_range": [0.0, 1.0],'
        ' "shapes_supported": ["rect", "ellipse", "path"],'
        ' "trigger_points": ["enter", "exit"], "theme_anchors": ["primary", "accent"]}'
    )
    assert recipe.intensity_range == (0.0, 1.0)
    assert isinstance(recipe.intensity_range, tuple)
    assert payload["id"] == "fade"  # payload sanity (unused directly)


def test_new_family_is_free_string() -> None:
    """§5.9: family is a free kebab string -- a brand-new family passes."""
    recipe = make_recipe_entry("fade")
    updated = recipe.model_copy(update={"family": "blur"})
    assert updated.family == "blur"


def test_type_lockstep_tuples_and_literals() -> None:
    """Tuple/Literal lockstep -- same doctrine as vocabulary.py."""
    from lottie_forge.domain.catalogue import KeyframeShape, ShapeName, TriggerPoint

    assert get_args(KeyframeShape) == KEYFRAME_SHAPES
    assert get_args(ShapeName) == SHAPE_NAMES
    assert get_args(TriggerPoint) == TRIGGER_POINTS


def test_recipe_id_imported_not_redeclared() -> None:
    """ADR-03: the id type is the vocabulary import -- no second declaration."""
    from typing import Literal, get_origin

    from lottie_forge.domain.catalogue import RecipeId  # re-exported import path

    assert get_origin(RecipeId) is Literal
    assert get_args(RecipeId) == tuple(RECIPE_IDS)
    annotation = CatalogRecipe.model_fields["id"].annotation
    assert get_args(annotation) == tuple(RECIPE_IDS)


# ---------------------------------------------------------------------------
# Rejection (loc membership)
# ---------------------------------------------------------------------------


def test_unordered_intensity_range_rejected() -> None:
    """The ordering gate is a catalogue-level collect-all invariant.

    A bare ``CatalogRecipe`` accepts any ordered pair of in-bound floats
    (the tuple members are individually bounded); the ascending-order rule
    is enforced when the catalogue is built.
    """
    catalogue = make_catalogue()
    recipes = [r.model_dump() for r in catalogue.recipes]
    recipes[0]["intensity_range"] = [1.0, 0.2]
    with pytest.raises(ValidationError) as excinfo:
        RecipeCatalogue.model_validate(
            {"catalogue_version": "1.0.0", "recipes": recipes}
        )
    locs = {_loc_as_tuple(e) for e in excinfo.value.errors()}
    assert ("recipes", 0, "intensity_range") in locs


def test_unknown_recipe_id_rejected() -> None:
    payload = _recipe_payload("fade")
    payload["id"] = "disco-spin"
    with pytest.raises(ValidationError) as excinfo:
        CatalogRecipe.model_validate(payload)
    locs = {_loc_as_tuple(e) for e in excinfo.value.errors()}
    assert ("id",) in locs


def test_disco_spin_at_catalogue_level() -> None:
    recipes = [_recipe_payload(rid) for rid in RECIPE_IDS]
    recipes[0]["id"] = "disco-spin"
    with pytest.raises(ValidationError) as excinfo:
        RecipeCatalogue.model_validate(
            {"catalogue_version": "1.0.0", "recipes": recipes}
        )
    locs = {_loc_as_tuple(e) for e in excinfo.value.errors()}
    assert ("recipes", 0, "id") in locs


def test_duplicate_recipe_id_one_issue_per_excess() -> None:
    recipes = [_recipe_payload(rid) for rid in RECIPE_IDS]
    recipes[1] = _recipe_payload("fade")  # duplicate of index 0
    with pytest.raises(ValidationError) as excinfo:
        RecipeCatalogue.model_validate(
            {"catalogue_version": "1.0.0", "recipes": recipes}
        )
    errors = excinfo.value.errors()
    locs = [_loc_as_tuple(e) for e in errors]
    assert ("recipes", 1, "id") in locs  # the excess occurrence is flagged
    dup_issues = [e for e in errors if _loc_as_tuple(e) == ("recipes", 1, "id")]
    assert len(dup_issues) == 1  # exactly one issue per duplicate occurrence


@pytest.mark.parametrize(
    ("count", "label"),
    [(7, "too-few"), (13, "too-many")],
)
def test_recipe_count_bounds(count: int, label: str) -> None:
    pool = list(RECIPE_IDS) + ["fade", "slide", "bounce"]  # enough distinct ids
    ids = pool[:count]
    recipes = [_recipe_payload(rid) for rid in ids]
    with pytest.raises(ValidationError) as excinfo:
        RecipeCatalogue.model_validate(
            {"catalogue_version": "1.0.0", "recipes": recipes}
        )
    locs = {_loc_as_tuple(e) for e in excinfo.value.errors()}
    assert ("recipes",) in locs, label


def test_empty_theme_anchors_rejected() -> None:
    payload = _recipe_payload("fade", theme_anchors=[])
    with pytest.raises(ValidationError) as excinfo:
        CatalogRecipe.model_validate(payload)
    locs = {_loc_as_tuple(e) for e in excinfo.value.errors()}
    assert ("theme_anchors",) in locs


def test_unknown_theme_anchor_rejected() -> None:
    payload = _recipe_payload("fade", theme_anchors=["primary", "logo"])
    with pytest.raises(ValidationError) as excinfo:
        CatalogRecipe.model_validate(payload)
    locs = {_loc_as_tuple(e) for e in excinfo.value.errors()}
    # Literal-in-list errors carry the item index: ("theme_anchors", 1).
    assert any(loc[0] == "theme_anchors" for loc in locs)


def test_intensity_out_of_bound_rejected() -> None:
    payload = _recipe_payload("fade", intensity_range=[0.0, 1.5])
    with pytest.raises(ValidationError) as excinfo:
        CatalogRecipe.model_validate(payload)
    locs = {_loc_as_tuple(e) for e in excinfo.value.errors()}
    assert any(loc[:1] == ("intensity_range",) for loc in locs)


def test_unknown_shape_rejected() -> None:
    payload = _recipe_payload("fade", shapes_supported=["circle"])
    with pytest.raises(ValidationError) as excinfo:
        CatalogRecipe.model_validate(payload)
    locs = {_loc_as_tuple(e) for e in excinfo.value.errors()}
    assert any(loc[0] == "shapes_supported" for loc in locs)


def test_unknown_trigger_rejected() -> None:
    payload = _recipe_payload("fade", trigger_points=["hover"])
    with pytest.raises(ValidationError) as excinfo:
        CatalogRecipe.model_validate(payload)
    locs = {_loc_as_tuple(e) for e in excinfo.value.errors()}
    assert any(loc[0] == "trigger_points" for loc in locs)


@pytest.mark.parametrize("duration", [500, 1600])
def test_duration_outside_pack_range_rejected(duration: int) -> None:
    """§5.5.3 #4: 600..1500 pack envelope (field bounds 100..10000 intact)."""
    recipes = [_recipe_payload(rid) for rid in RECIPE_IDS]
    recipes[3]["duration_ms"] = duration  # pulse
    with pytest.raises(ValidationError) as excinfo:
        RecipeCatalogue.model_validate(
            {"catalogue_version": "1.0.0", "recipes": recipes}
        )
    locs = {_loc_as_tuple(e) for e in excinfo.value.errors()}
    assert ("recipes", 3, "duration_ms") in locs


def test_duration_outside_model_bounds_rejected() -> None:
    payload = _recipe_payload("fade", duration_ms=99999)
    with pytest.raises(ValidationError) as excinfo:
        CatalogRecipe.model_validate(payload)
    locs = {_loc_as_tuple(e) for e in excinfo.value.errors()}
    assert ("duration_ms",) in locs


def test_unknown_keyframe_shape_rejected() -> None:
    payload = _recipe_payload("fade", keyframe_shape="spin-around")
    with pytest.raises(ValidationError) as excinfo:
        CatalogRecipe.model_validate(payload)
    locs = {_loc_as_tuple(e) for e in excinfo.value.errors()}
    assert ("keyframe_shape",) in locs


def test_uppercase_family_rejected() -> None:
    """KebabToken: 'Opacity' violates ^[a-z][a-z0-9-]*$ (CR-01 lock)."""
    payload = _recipe_payload("fade", family="Opacity")
    with pytest.raises(ValidationError) as excinfo:
        CatalogRecipe.model_validate(payload)
    locs = {_loc_as_tuple(e) for e in excinfo.value.errors()}
    assert ("family",) in locs


def test_bad_catalogue_version_rejected() -> None:
    recipes = [_recipe_payload(rid) for rid in RECIPE_IDS]
    with pytest.raises(ValidationError) as excinfo:
        RecipeCatalogue.model_validate(
            {"catalogue_version": "1.0", "recipes": recipes}
        )
    locs = {_loc_as_tuple(e) for e in excinfo.value.errors()}
    assert ("catalogue_version",) in locs


def test_extra_key_top_level_rejected() -> None:
    recipes = [_recipe_payload(rid) for rid in RECIPE_IDS]
    with pytest.raises(ValidationError):
        RecipeCatalogue.model_validate(
            {"catalogue_version": "1.0.0", "recipes": recipes, "source": "x"}
        )


def test_extra_key_nested_rejected() -> None:
    payload = _recipe_payload("fade", notes="extra")
    with pytest.raises(ValidationError) as excinfo:
        CatalogRecipe.model_validate(payload)
    locs = {_loc_as_tuple(e) for e in excinfo.value.errors()}
    assert ("notes",) in locs
