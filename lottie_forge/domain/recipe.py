"""MotionRecipe -- the closed-vocabulary recipe contract (DM-02, §4.6).

ADR-03 locks the motion recipe catalogue at a closed set of 8-12 ids (see
:mod:`lottie_forge.domain.vocabulary`). ``MotionRecipe`` is the data gate that
enforces the seam between "creative choice" (Phase 6 ``RecipePicker`` LLM) and
"deterministic compile" (Phase 3 Motion Compiler): the LLM can only ever
select an id from this vocabulary -- never invent one.

Design choices:

- ``recipe_id`` is typed as :data:`RecipeId`, the closed ``Literal`` exported
  from :mod:`lottie_forge.domain.vocabulary`. **The vocabulary module is the
  single source of truth** -- this module imports the id and never re-derives
  it.
- Every numeric / string field is bounded: ``duration_ms`` 100..10000,
  ``params.amplitude`` 0..1, ``params.loops`` 1..10, ``theme_anchors`` capped
  at 16 entries with the same ``^[a-z][a-z0-9-]*$`` kebab pattern used by the
  palette tokens. Pathological inputs are a denial-of-service vector; the
  rejection happens here, not later.
- ``model_config = ConfigDict(extra="forbid", strict=True)`` mirrors the
  TypeScript ``z.strictObject`` (see ``src/rpc/contracts/recipe.schema.ts``).
  Unknown fields are rejected at both ends of the bridge (DM-05), and the
  ``strict=True`` flag rejects ``"1200"`` for an ``int`` and ``1200.0`` for an
  ``int`` alike -- the Python half of the WR-06 pinned asymmetry (§4.9).
- ``MotionParams`` is a nested strict model, not an open mapping -- a closed
  shape prevents an LLM from smuggling in unbounded animation channels.
- ``make_recipe`` is the single fixture source for both bridge test suites
  (Python export and TypeScript import). It returns a well-typed default so
  bridge tests can stay focused on parity instead of rediscovering defaults
  on every call.

Per ADR-01 no field here describes a SMIL or CSS-keyframe animation channel:
the recipe + ``MotionParams`` is the only motion vocabulary, and all motion
ships as Lottie JSON produced by the deterministic Motion Compiler.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field

from lottie_forge.domain._shared import STRICT_CONFIG, KebabToken
from lottie_forge.domain.vocabulary import RECIPE_IDS, RecipeId

Direction = Literal["up", "down", "left", "right", "none"]
"""Closed enum of motion directions -- no other value is meaningful."""


class MotionParams(BaseModel):
    """The bounded numeric envelope of a recipe -- closed, strict, and nested.

    The three fields correspond to the three scalar knobs the Motion Compiler
    understands. Adding a fourth channel here would be a deliberate change to
    the deterministic compilation contract (ADR-01).
    """

    model_config = STRICT_CONFIG

    amplitude: Annotated[float, Field(ge=0.0, le=1.0)]
    direction: Direction
    loops: Annotated[int, Field(ge=1, le=10)]


class MotionRecipe(BaseModel):
    """A single motion recipe: closed-vocabulary id + family + bounded envelope.

    ``family`` is a free kebab-case string in Phase 1; a future catalogue
    loader (Phase 2) may tighten it to a ``Literal`` once the family taxonomy
    is locked. ``easing`` and ``theme_anchors`` items are typed as
    :data:`KebabToken` -- the same regex as StyleSpec palette tokens,
    enforced by pydantic-core (not Python's ``re`` module).
    """

    model_config = STRICT_CONFIG

    recipe_id: RecipeId
    family: KebabToken
    duration_ms: Annotated[int, Field(ge=100, le=10_000)]
    easing: KebabToken
    params: MotionParams
    theme_anchors: list[KebabToken] = Field(default_factory=list, max_length=16)


def make_recipe(recipe_id: RecipeId) -> MotionRecipe:
    """The single fixture source for both bridge suites.

    Defaults are stable: ``family="transform"``, ``duration_ms=1200``,
    ``easing="ease-in-out"``, ``amplitude=0.5``, ``direction="up"``,
    ``loops=1``, ``theme_anchors=[]``. Bridge tests can rely on those defaults
    without restating them per case.
    """
    return MotionRecipe(
        recipe_id=recipe_id,
        family="transform",
        duration_ms=1200,
        easing="ease-in-out",
        params=MotionParams(amplitude=0.5, direction="up", loops=1),
        theme_anchors=[],
    )


__all__ = [
    "Direction",
    "MotionParams",
    "MotionRecipe",
    "RECIPE_IDS",
    "RecipeId",
    "make_recipe",
]
