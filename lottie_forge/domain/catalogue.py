r"""CatalogRecipe / RecipeCatalogue -- the closed motion catalogue (MOT-01..04, §5.5).

The catalogue turns motion into **versioned product data**: ``catalogue.json``
is the committed fixture both layers load directly (MOT-04). These models are
the Python authority for that data; the zod mirror in
``src/rpc/contracts/catalogue.schema.ts`` is the TypeScript authority.

**Structural decision (documented per plan 02-04 Task 1).** §5.5.3 says
``CatalogRecipe`` "extends" ``MotionRecipe``, but the locked JSON shape
(§5.5.1) keys recipes by ``id`` (not ``recipe_id``) and carries no ``params``
envelope. ``CatalogRecipe`` is therefore a **standalone** ``STRICT_CONFIG``
model whose field types are *shared by import* with ``MotionRecipe``
(``RecipeId``, ``KebabToken``, ``ThemeAnchorId``) -- the extension lives at
the shared-type level, not Python inheritance, because inheriting would
impose ``params``. The field name is ``id``: faithful to the locked JSON.

Validators (§5.5.3, aggregate invariants):

1. **ids ⊆ RecipeId + uniqueness** -- membership is the field type
   (``RecipeId`` imported from :mod:`lottie_forge.domain.vocabulary`, never
   redeclared, ADR-03); uniqueness is the collect-all validator below, one
   issue per duplicate (excess) occurrence at ``("recipes", idx, "id")``.
   The 8..12 invariant is the list bounds ``min_length=8 / max_length=12``.
2. **theme_anchors >= 1 per recipe (MOT-03)** -- enforced at the field
   (``min_length=1``), so the loc is the field itself
   (``("recipes", idx, "theme_anchors")``) -- documented here as the
   field-level equivalent of §5.5.3 validator 2. Labels are the closed
   ``ThemeAnchorId`` set (D-10/D-11); anchors and palette token names are
   **never** cross-validated (D-12).
3. **easing ∈ StyleSpec.easing_curves** -- NOT here: it is a cross-reference
   validated at joint (catalogue + style) loading, see
   :mod:`lottie_forge.loading.catalogue` (D-17, plan Task 3).
4. **Pack duration range** -- 600..1500 ms for primary motion, enforced in
   the collect-all validator at ``("recipes", idx, "duration_ms")``; the
   model bounds 100..10000 stay at the field (§5.5.3 #4).

``family`` stays a **free kebab string** -- the catalogue is the source of
families, no second list (§5.9): a Literal here would be exactly that.

Strict-mode note: ``intensity_range`` is a tuple, so committed-JSON
validation goes through ``model_validate_json`` (JSON arrays become
tuples); Python builders pass tuples directly.
"""

from __future__ import annotations

from typing import Annotated, Final, Literal, Self, get_args

from pydantic import BaseModel, Field, model_validator
from pydantic_core import InitErrorDetails, PydanticCustomError, ValidationError

from lottie_forge.domain._shared import STRICT_CONFIG, KebabToken
from lottie_forge.domain.vocabulary import (
    MAX_RECIPE_COUNT,
    MIN_RECIPE_COUNT,
    RecipeId,
    ThemeAnchorId,
)

CATALOGUE_VERSION_PATTERN = r"^\d+\.\d+\.\d+$"
"""Semver shape of ``catalogue_version`` -- dots literal, three numeric segments."""

PACK_DURATION_MIN: Final[int] = 600
"""§5.5.3 #4: primary-motion pack floor (the field still allows 100..10000)."""

PACK_DURATION_MAX: Final[int] = 1500
"""§5.5.3 #4: primary-motion pack ceiling (the field still allows 100..10000)."""

KEYFRAME_SHAPES: Final[tuple[str, ...]] = (
    "opacity-ramp",
    "translate-in",
    "overshoot-settle",
    "scale-breath",
    "trim-path",
    "angular-in",
    "pop-settle",
    "sine-drift",
    "damped-oscillation",
    "circular-path",
)
"""The 10 locked keyframe shapes (§5.5.2 table, canonical order).

Explicit ``Literal`` below (no star-unpack) keeps the resolved arguments
inspectable via ``typing.get_args`` -- the same doctrine as ``RecipeId``.
The lockstep ``get_args(KeyframeShape) == KEYFRAME_SHAPES`` is asserted by
``tests/domain/test_catalogue.py`` and mirrored by ``KEYFRAME_SHAPES`` in
``catalogue.schema.ts``.
"""

KeyframeShape = Literal[
    "opacity-ramp",
    "translate-in",
    "overshoot-settle",
    "scale-breath",
    "trim-path",
    "angular-in",
    "pop-settle",
    "sine-drift",
    "damped-oscillation",
    "circular-path",
]

SHAPE_NAMES: Final[tuple[str, ...]] = (
    "rect",
    "ellipse",
    "path",
    "polyline",
    "polystar",
)
"""Closed set of Lottie-relevant shape names (§5.5.1 example + §5.5.3 bounds)."""

ShapeName = Literal["rect", "ellipse", "path", "polyline", "polystar"]

TRIGGER_POINTS: Final[tuple[str, ...]] = (
    "enter",
    "exit",
    "loop",
)
"""Closed set of trigger points (§5.5.3: ⊆ {enter, exit, loop})."""

TriggerPoint = Literal["enter", "exit", "loop"]

IntensityBound = Annotated[float, Field(ge=0.0, le=1.0)]
"""One end of an ``intensity_range`` -- bounded 0..1 (anti-DoS + semantic)."""


class CatalogRecipe(BaseModel):
    r"""One catalogue entry: closed id + locked motion envelope (§5.5.2).

    Standalone strict model -- see the module docstring for why this does
    not inherit :class:`~lottie_forge.domain.recipe.MotionRecipe`. Every
    list is bounded (anti-DoS, T-02-04): shapes 1..5, triggers 1..3,
    anchors 1..16.
    """

    model_config = STRICT_CONFIG

    id: RecipeId
    family: KebabToken
    duration_ms: Annotated[int, Field(ge=100, le=10_000)]
    easing: KebabToken
    keyframe_shape: KeyframeShape
    intensity_range: tuple[IntensityBound, IntensityBound]
    shapes_supported: list[ShapeName] = Field(min_length=1, max_length=5)
    trigger_points: list[TriggerPoint] = Field(min_length=1, max_length=3)
    theme_anchors: list[ThemeAnchorId] = Field(min_length=1, max_length=16)


class RecipeCatalogue(BaseModel):
    r"""The closed catalogue envelope: version + 8..12 recipes (ADR-03).

    One collect-all ``model_validator`` bundles the aggregate §5.5.3
    invariants -- id uniqueness (one issue per duplicate occurrence), the
    600..1500 pack duration range, and ordered intensity ranges -- raising
    a single ``ValidationError`` with precise locs via
    ``ValidationError.from_exception_data`` (the Python analogue of the zod
    ``.superRefine`` mirror on the TS side).
    """

    model_config = STRICT_CONFIG

    catalogue_version: str = Field(pattern=CATALOGUE_VERSION_PATTERN, max_length=32)
    recipes: list[CatalogRecipe] = Field(
        min_length=MIN_RECIPE_COUNT, max_length=MAX_RECIPE_COUNT
    )

    @model_validator(mode="after")
    def _validate_catalogue_invariants(self) -> Self:
        """Bundle the §5.5.3 aggregate invariants into one collect-all raise."""
        details: list[InitErrorDetails] = []

        # Invariant 1: id uniqueness -- one issue per duplicate (excess)
        # occurrence, loc ("recipes", idx, "id"). Never merged silently.
        seen: set[str] = set()
        for idx, recipe in enumerate(self.recipes):
            if recipe.id in seen:
                details.append(
                    InitErrorDetails(
                        type=PydanticCustomError(
                            "duplicate_recipe_id",
                            "duplicate recipe id {id!r} at index {idx}",
                            {"id": recipe.id, "idx": idx},
                        ),
                        loc=("recipes", idx, "id"),
                        input=recipe.id,
                    )
                )
            else:
                seen.add(recipe.id)

        # Invariant 4: pack duration range 600..1500 (model bounds stay at
        # the field 100..10000; this is the pack-level envelope).
        for idx, recipe in enumerate(self.recipes):
            if not (PACK_DURATION_MIN <= recipe.duration_ms <= PACK_DURATION_MAX):
                details.append(
                    InitErrorDetails(
                        type=PydanticCustomError(
                            "duration_out_of_pack_range",
                            "duration_ms ({value}) outside pack range "
                            "{lo}..{hi} for recipe {id!r}",
                            {
                                "value": recipe.duration_ms,
                                "lo": PACK_DURATION_MIN,
                                "hi": PACK_DURATION_MAX,
                                "id": recipe.id,
                            },
                        ),
                        loc=("recipes", idx, "duration_ms"),
                        input=recipe.duration_ms,
                    )
                )

        # Ordered intensity: intensity_range[0] <= intensity_range[1].
        for idx, recipe in enumerate(self.recipes):
            low, high = recipe.intensity_range
            if low > high:
                details.append(
                    InitErrorDetails(
                        type=PydanticCustomError(
                            "intensity_range_unordered",
                            "intensity_range {low} > {high} for recipe {id!r} "
                            "-- must be ordered ascending",
                            {"low": low, "high": high, "id": recipe.id},
                        ),
                        loc=("recipes", idx, "intensity_range"),
                        input=recipe.intensity_range,
                    )
                )

        if details:
            raise ValidationError.from_exception_data(
                self.__class__.__name__,
                details,
            )

        return self


# Lockstep guards (import time): the tuples and the Literals must never
# drift -- the same doctrine as vocabulary.py's runtime self-check.
assert get_args(KeyframeShape) == KEYFRAME_SHAPES
assert get_args(ShapeName) == SHAPE_NAMES
assert get_args(TriggerPoint) == TRIGGER_POINTS

__all__ = [
    "CATALOGUE_VERSION_PATTERN",
    "CatalogRecipe",
    "IntensityBound",
    "KEYFRAME_SHAPES",
    "KeyframeShape",
    "PACK_DURATION_MAX",
    "PACK_DURATION_MIN",
    "RecipeCatalogue",
    "SHAPE_NAMES",
    "ShapeName",
    "TRIGGER_POINTS",
    "TriggerPoint",
]
