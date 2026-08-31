"""Closed motion-recipe id vocabulary (DM-02, ADR-03, §4.4).

ADR-03 locks the catalogue at a **closed set of 8-12 named recipes**. The LLM
layer (Phase 6 RecipePicker) can only select an id from this vocabulary via a
Pydantic ``Literal`` -- it can never invent an ad-hoc recipe.

**Single source of truth.** Any change to ``RECIPE_IDS`` (adding, removing, or
renaming an id) MUST edit this module and ``src/rpc/contracts/vocabulary.schema.ts``
in the **same commit** (ADR-03). The structural test in
``tests/domain/test_vocabulary.py`` scans every ``.ts`` file under
``src/rpc/contracts/`` and asserts ``vocabulary.schema.ts`` is the only one
that declares the id list -- a regression in either side fails the build.

**Invariant 8..12** is enforced on both sides via runtime checks:

- Python: :func:`assert_recipe_count` raises ``ValueError`` when the count is
  outside the closed range ``[8, 12]``. Used by tests at the boundaries and as
  a defensive guard at module import time (covered by the runtime self-check).
- TypeScript: a top-level invariant in ``vocabulary.spec.ts`` deep-equals the
  TS tuple against the Python-exported ``fixtures/bridge/vocabulary.json``.

Per ADR-01 these ids name Lottie motion recipes only; no id implies a SMIL or
CSS-keyframe animation channel.
"""

from __future__ import annotations

from typing import Final, Literal

RECIPE_IDS: Final[tuple[str, ...]] = (
    "fade",
    "slide",
    "bounce",
    "pulse",
    "draw-on",
    "rotate",
    "scale-pop",
    "float",
    "wiggle",
    "orbit",
)
"""The Phase-1 lock: exactly 10 ids, inside the ADR-03 range of 8-12.

Order is canonical and matches :class:`MotionRecipe` references -- preserve
when extending. Every membership change is a same-commit change touching
this file AND ``src/rpc/contracts/vocabulary.schema.ts`` (ADR-03).
"""

RecipeId = Literal[
    "fade",
    "slide",
    "bounce",
    "pulse",
    "draw-on",
    "rotate",
    "scale-pop",
    "float",
    "wiggle",
    "orbit",
]
"""Closed type of a recipe id -- the only motion vocabulary any model may reference.

Star-unpack of :data:`RECIPE_IDS` is not used at type-definition time to keep
the resolved Literal arguments easy to inspect (``typing.get_args``).
The structural same-commit test in ``tests/domain/test_vocabulary.py`` enforces
that :func:`get_args(RecipeId) == tuple(RECIPE_IDS)` -- the two sides stay in
lockstep.
"""

THEME_ANCHOR_IDS: Final[tuple[str, ...]] = (
    "primary",
    "secondary",
    "accent",
    "background",
    "success",
    "danger",
)
"""The closed set of 6 theme-anchor labels (D-10, MOT-03).

Mirrors the ``RecipeId`` closure on the same-commit doctrine: the closed
type ``ThemeAnchorId`` below is its Python mirror, and the TS mirror
lives in ``src/rpc/contracts/vocabulary.schema.ts``. The Phase 4
``CatalogRecipe.theme_anchors`` and the Phase 8 packager both consume
this vocabulary; an unknown label is rejected at the type boundary,
not after the fact.

No count-invariant helper (``assert_recipe_count`` analogue) is
defined -- the cardinality of 6 is fixed at design time (D-10). What
is locked is the **lockstep** between this tuple and the ``Literal``
below, asserted by ``tests/domain/test_vocabulary.py``.

Order is canonical and matches the ``ThemeAnchorIdSchema`` enum on
the TS side -- preserve when extending.
"""

ThemeAnchorId = Literal[
    "primary",
    "secondary",
    "accent",
    "background",
    "success",
    "danger",
]
"""Closed type of a theme-anchor label (D-10, D-11, MOT-03).

Same doctrine as :data:`RecipeId`: no star-unpack of
:data:`THEME_ANCHOR_IDS` at type-definition time so the resolved
Literal arguments stay inspectable via ``typing.get_args``. The
lockstep is asserted by ``tests/domain/test_vocabulary.py`` --
``get_args(ThemeAnchorId) == THEME_ANCHOR_IDS``.

Per D-12 the anchor labels are **independent** from the palette token
names (``ink`` / ``accent`` / ``surface`` / ``success`` / ...) -- they
live in two distinct namespaces and there is no cross-validation at
the Phase 2 layer. The mapping anchor -> colour is a Phase 8 packaging
concern (ADR-05); Phase 2 must not invent coupling.
"""

MIN_RECIPE_COUNT: Final[int] = 8
"""ADR-03 lower bound -- below this the catalogue is too narrow to be useful."""

MAX_RECIPE_COUNT: Final[int] = 12
"""ADR-03 upper bound -- above this the catalogue stops being auditable by humans."""


def assert_recipe_count(ids: tuple[str, ...]) -> None:
    """Raise ``ValueError`` if ``len(ids)`` falls outside the ADR-03 closed range.

    Used at the boundary (tests + runtime self-check) so any future addition
    or removal of a recipe id past 12 or below 8 is loud and immediate --
    not a quiet behavioural drift.

    Parameters
    ----------
    ids:
        The id tuple to validate. Must have length in ``[MIN_RECIPE_COUNT,
        MAX_RECIPE_COUNT]`` inclusive.
    """
    count = len(ids)
    if count < MIN_RECIPE_COUNT or count > MAX_RECIPE_COUNT:
        raise ValueError(
            f"recipe count must satisfy {MIN_RECIPE_COUNT} <= n <= "
            f"{MAX_RECIPE_COUNT}, got {count}"
        )


# Runtime self-check at import time -- the production import path itself
# guards the invariant. If the tuple is edited incorrectly the import fails,
# not the first call site.
assert_recipe_count(RECIPE_IDS)

__all__ = [
    "MAX_RECIPE_COUNT",
    "MIN_RECIPE_COUNT",
    "RECIPE_IDS",
    "RecipeId",
    "THEME_ANCHOR_IDS",
    "ThemeAnchorId",
    "assert_recipe_count",
]
