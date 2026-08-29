"""Vocabulary domain suite — RecipeId closure, invariant 8-12, and same-commit (ADR-03, §4.4).

The closed motion-recipe id vocabulary is the gate every other Phase 2-7 model
traverses: ``MotionRecipe.recipe_id``, ``AssetSpec.recipe_ref``, and the future
``RecipeCatalogue`` all import :data:`RecipeId`. ADR-03 pins the catalogue at
**exactly 8-12 ids**; this suite locks that invariant in three independent
mechanisms:

1. **Closure (10 ids in canonical order)** — :func:`get_args(RecipeId)` must
   equal ``tuple(RECIPE_IDS)``. Any drift between the declared ``Literal``
   and the tuple the module exports fails immediately.

2. **Membership** — every canonical id is accepted (``in get_args(RecipeId)``);
   ``disco-spin`` is rejected. The disco-spin assertion is the contract Phase 6
   ``RecipePicker`` cannot break.

3. **Boundary invariant 8-12** — :func:`assert_recipe_count` accepts lists of
   length 8 and 12 and rejects 7 and 13. The closed-range guard runs at module
   import too — the production self-check is asserted here.

Plus two parity / mechanism locks (CR-01, ADR-03):

- **CR-01 fullmatch** — the KebabToken pattern is verified in ``fullmatch``
  mode (anchored at both ends). The Python ``re`` ``$``-before-trailing-
  newline quirk previously accepted ``"accent\\n"``; fullmatch closes that
  bypass. This test is canonical because pydantic-core uses the same
  anchored semantics.

- **Structural same-commit** — scanning ``src/rpc/contracts/*.ts`` ensures
  ``vocabulary.schema.ts`` is the only file declaring ``RECIPE_IDS``; every
  other schema module imports it. Catches the classic drift where a second
  mirror tuple is added in a downstream file in a different commit.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Final, get_args

import pytest

from lottie_forge.domain._shared import TOKEN_NAME_PATTERN
from lottie_forge.domain.vocabulary import (
    MAX_RECIPE_COUNT,
    MIN_RECIPE_COUNT,
    RECIPE_IDS,
    RecipeId,
    assert_recipe_count,
)

# ---------- (a) Closure & invariant ----------


def test_vocabulary_size_is_within_the_closed_adr03_range() -> None:
    """The current lock is exactly 10 ids -- inside [8, 12] (§4.4)."""
    assert MIN_RECIPE_COUNT <= len(RECIPE_IDS) <= MAX_RECIPE_COUNT


def test_get_args_of_recipe_id_equals_recite_ids_tuple() -> None:
    """The Literal arguments and the exported tuple are the same sequence.

    Any drift between the two sources is a same-commit violation and would
    cause the same id to be accepted by one consumer and rejected by another.
    """
    assert get_args(RecipeId) == RECIPE_IDS


def test_recipe_ids_are_unique() -> None:
    assert len(set(RECIPE_IDS)) == len(RECIPE_IDS)


@pytest.mark.parametrize("recipe_id", RECIPE_IDS)
def test_canonical_recipe_id_is_a_member_of_the_literal(recipe_id: str) -> None:
    """Every id in the canonical tuple must be in the Literal's args.

    Parametrized over the 10 ids so a single missing id shows up as one
    failure in CI, not a sweep.
    """
    assert recipe_id in get_args(RecipeId)


def test_disco_spin_is_not_a_member_of_the_vocabulary() -> None:
    """The Phase 6 RecipePicker cannot smuggle ``disco-spin`` past the Literal."""
    assert "disco-spin" not in get_args(RecipeId)
    assert "disco-spin" not in RECIPE_IDS


def test_disco_spin_is_rejected_at_pydantic_runtime() -> None:
    """Membership via ``get_args`` is informational; runtime check is structural.

    ``RecipeId("disco-spin")`` is a string-literal alias and does NOT raise at
    construction. The real gate is at :class:`MotionRecipe` validation (Task 2
    suite, see ``tests/domain/test_recipe.py::test_recipe_id_out_of_catalogue``)
    where a non-member id fails Pydantic strict ``Literal[...]`` coercion.
    """
    # get_args-based membership is the only constructible assertion at this
    # isolation level. The runtime gate is asserted in the MotionRecipe suite.
    assert "disco-spin" not in get_args(RecipeId)


# ---------- (b) Boundary invariant 8-12 ----------


@pytest.mark.parametrize(
    "count",
    [7, 13],
    ids=["below_min", "above_max"],
)
def test_assert_recipe_count_rejects_boundaries_one_step_out(count: int) -> None:
    """Lists of length 7 and 13 violate the ADR-03 invariant."""
    ids = tuple(f"id-{i}" for i in range(count))
    with pytest.raises(ValueError, match="recipe count must satisfy"):
        assert_recipe_count(ids)


@pytest.mark.parametrize(
    "count",
    [MIN_RECIPE_COUNT, MAX_RECIPE_COUNT],
    ids=["lower_bound", "upper_bound"],
)
def test_assert_recipe_count_accepts_boundaries(count: int) -> None:
    """Lists of length 8 and 12 are accepted (inclusive bounds)."""
    ids = tuple(f"id-{i}" for i in range(count))
    # Must not raise.
    assert_recipe_count(ids)


# ---------- (c) CR-01 fullmatch lock ----------


_TOKEN_RE: Final[re.Pattern[str]] = re.compile(TOKEN_NAME_PATTERN)


def test_kebab_token_pattern_fullmatch_rejects_accent_newline() -> None:
    """Python ``re`` ``$`` would accept ``'accent\\n'`` as a kebab token.

    ``fullmatch`` anchors both ends so the trailing newline cannot sneak past.
    The KebabToken type at the Pydantic level is validated by pydantic-core
    with the same anchored semantics (CR-01 fix, §4.6). This test is the
    explicit lock at the level of the regex itself (D-02 #1).
    """
    assert _TOKEN_RE.fullmatch("accent") is not None
    # The CR-01 trap: the ``$`` anchor of Python ``re`` is "end of string OR
    # before a trailing newline at end of string" (re.match / re.search). A
    # naive ``re.match(r"^[a-z][a-z0-9-]*$", "accent\\n")`` returns a match
    # because of this quirk. ``fullmatch`` requires the entire string to
    # satisfy the pattern -- the trailing newline fails the anchor.
    assert _TOKEN_RE.fullmatch("accent\n") is None


def test_every_recipe_id_is_a_kebab_case_slug() -> None:
    """All canonical ids must satisfy the fullmatch kebab pattern.

    Parametrized implicitly: a single failing id in the tuple is enough.
    """
    offenders = [rid for rid in RECIPE_IDS if _TOKEN_RE.fullmatch(rid) is None]
    assert offenders == []


# ---------- (d) Structural same-commit lock (ADR-03) ----------


REPO_ROOT = Path(__file__).resolve().parents[2]
CONTRACTS_DIR = REPO_ROOT / "src" / "rpc" / "contracts"


def test_only_vocabulary_schema_ts_declares_the_id_list() -> None:
    """No other ``.ts`` file under ``src/rpc/contracts/`` may declare RECIPE_IDS.

    The ADR-03 same-commit rule means: every other schema module imports
    ``RECIPE_IDS`` from ``vocabulary.schema.ts``. A second literal declaration
    (e.g. a hardcoded ``["fade", "slide", ...]`` in ``recipe.schema.ts``)
    is structural drift -- this scan catches it before the bridge tests do.

    Skips ``vocabulary.schema.ts`` itself (the canonical owner) and
    ``.spec.ts`` files (they only consume the symbol).
    """
    offenders: list[str] = []
    for ts_path in CONTRACTS_DIR.glob("*.ts"):
        if ts_path.name == "vocabulary.schema.ts":
            continue
        if ts_path.name.endswith(".spec.ts"):
            continue
        text = ts_path.read_text(encoding="utf-8")
        # A bare ``"fade"`` string or import statement is fine; we look for a
        # declaration site ``export const RECIPE_IDS`` -- only ``vocabulary.schema.ts``
        # may have one.
        if re.search(r"export\s+const\s+RECIPE_IDS\b", text):
            offenders.append(ts_path.relative_to(REPO_ROOT).as_posix())

    assert offenders == [], (
        f"RECIPE_IDS may only be declared in vocabulary.schema.ts (ADR-03 "
        f"same-commit rule); offenders: {offenders}"
    )


def test_other_contracts_import_recipe_id_schema_from_vocabulary() -> None:
    """Downstream schemas must consume ``RecipeIdSchema`` via the canonical import.

    A naive ``z.enum(['fade', ...])`` in a non-vocabulary file is the exact
    drift ADR-03 prohibits. This scan checks that any other schema file
    mentioning recipe ids imports them.
    """
    # The current set of sibling files. Update if a new schema is added that
    # legitimately does not reference recipe ids.
    files_to_check = [
        p
        for p in CONTRACTS_DIR.glob("*.ts")
        if p.name not in {"vocabulary.schema.ts", "rejection-cases.ts"}
        and not p.name.endswith(".spec.ts")
    ]
    offenders: list[str] = []
    for ts_path in files_to_check:
        text = ts_path.read_text(encoding="utf-8")
        if "RecipeIdSchema" not in text:
            continue  # OK: file does not reference recipe ids
        # If it does, it MUST import from vocabulary.schema.ts.
        # `verbatimModuleSyntax: true` rewrites bare specifiers with the `.js`
        # extension at type-check time -- the import specifier can end with
        # `.js` or be left bare; both must point at `vocabulary.schema`.
        if 'from "./vocabulary.schema' not in text and "from './vocabulary.schema" not in text:
            offenders.append(ts_path.relative_to(REPO_ROOT).as_posix())

    assert offenders == [], (
        f"Files referencing RecipeIdSchema must import from vocabulary.schema.ts; "
        f"offenders: {offenders}"
    )
