"""Bridge steps 1 + 3 for MotionRecipe — Python export and Python re-validate (DM-05).

Ordered bridge chain:

1. ``python -m pytest tests/bridge/test_recipe_bridge.py -k export``
   -- writes ``fixtures/bridge/recipe.from-python.json`` + schema keys
2. ``npx vitest run src/rpc/contracts/recipe.spec.ts``
   -- zod validates + re-emits ``fixtures/bridge/recipe.from-ts.json``
3. ``python -m pytest tests/bridge/test_recipe_bridge.py -k reimport``
   -- strict Pydantic re-validates the TS-emitted artifact

Also includes:

- The **WR-06 pinned asymmetry** test (§4.9): a duration of ``1200.0``
  (integral float) is **accepted** by zod ``z.number().int()`` (it does not
  reject integral floats the way Pydantic strict does) and **rejected** by
  Pydantic strict. The Python side asserts the rejection here; the
  TypeScript side mirrors with a comment on the asymmetry (see
  ``src/rpc/contracts/recipe.spec.ts``). The case deliberately does NOT
  appear in ``fixtures/rejection-cases/recipe.json`` -- the JSON only stores
  rejection cases shared by both sides, and zod does not reject this one.

- The bridge-side rejection harness (D-06/D-08): same JSON of rejection
  cases (``fixtures/rejection-cases/recipe.json``) drives the
  ``test.each`` mirror in ``recipe.spec.ts`` -- one source, zero drift.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from fixtures import make_recipe
from lottie_forge.domain.recipe import MotionRecipe
from lottie_forge.domain.vocabulary import RECIPE_IDS, RecipeId
from tests.bridge.rejection_loader import load_rejection_cases

REPO_ROOT = Path(__file__).resolve().parents[2]
BRIDGE_DIR = REPO_ROOT / "fixtures" / "bridge"
FROM_PYTHON = BRIDGE_DIR / "recipe.from-python.json"
FROM_TS = BRIDGE_DIR / "recipe.from-ts.json"
SCHEMA_KEYS = BRIDGE_DIR / "recipe.schema-keys.json"


def test_export_recipe() -> None:
    """Step 1: write Python-side bridge artifacts for the TypeScript half."""
    BRIDGE_DIR.mkdir(parents=True, exist_ok=True)

    recipe = make_recipe("fade")
    FROM_PYTHON.write_text(recipe.model_dump_json(), encoding="utf-8")

    # Parity of schema keys: zod's `.shape` keys must equal the
    # `model_json_schema().properties` keys. The TS spec consumes this list to
    # assert the bridge keys are identical on both sides (§4.2).
    SCHEMA_KEYS.write_text(
        json.dumps(sorted(MotionRecipe.model_json_schema()["properties"].keys())),
        encoding="utf-8",
    )

    assert FROM_PYTHON.exists()
    assert SCHEMA_KEYS.exists()
    # The exported payload must itself be re-readable by the strict model.
    assert MotionRecipe.model_validate_json(FROM_PYTHON.read_text(encoding="utf-8")) == recipe


@pytest.mark.skipif(
    not (BRIDGE_DIR / "recipe.from-ts.json").exists(),
    reason="TS bridge artifact missing -- run `npx vitest run` between export and re-import",
)
def test_reimport_recipe() -> None:
    """Step 3: the TS-re-emitted artifact must re-validate under strict Pydantic.

    The re-import is the place where any cross-side drift surfaces: if zod
    accepted something Pydantic rejects (or vice versa) the comparison
    ``reimported == recipe`` fails loudly here.
    """
    recipe = make_recipe("fade")
    reimported = MotionRecipe.model_validate_json(FROM_TS.read_text(encoding="utf-8"))

    assert reimported == recipe
    assert reimported.model_dump_json() == recipe.model_dump_json()


# ---------- WR-06 pinned asymmetry (§4.9) ----------


def test_wr06_integral_float_rejected_by_pydantic_strict() -> None:
    """Python half of WR-06: ``1200.0`` is rejected by Pydantic strict.

    zod ``z.number().int()`` accepts ``1200.0`` (an integral float passes the
    integer check). Pydantic strict does not coerce floats to ints and rejects
    the same input. Python is therefore the **strictest authority at re-import**
    -- a TS payload that contains ``1200.0`` will be caught here on step 3.

    This test deliberately does NOT use the shared rejection-case harness:
    zod does not reject this value, so the case cannot live in
    ``fixtures/rejection-cases/recipe.json`` (which is consumed by both
    sides). It is a **dedicated two-half asymmetry** instead.
    """
    payload = {
        "recipe_id": "fade",
        "family": "transform",
        "duration_ms": 1200.0,  # integral float -- the WR-06 trap
        "easing": "ease-in-out",
        "params": {"amplitude": 0.5, "direction": "up", "loops": 1},
        "theme_anchors": [],
    }
    with pytest.raises(ValidationError) as exc_info:
        MotionRecipe.model_validate(payload)
    # The error must surface on `duration_ms` -- the field that triggers the
    # int-vs-float strict-mode rejection.
    actual_locs = {tuple(e["loc"]) for e in exc_info.value.errors()}
    assert ("duration_ms",) in actual_locs


# ---------- Rejection harness (mirror of vitest test.each, D-06/D-08) ----------


_REJECTION_CASES = load_rejection_cases("recipe")


@pytest.mark.parametrize("case", _REJECTION_CASES, ids=lambda c: c.case_id)
def test_bridge_rejection_case(case) -> None:
    """Bridge-side rejection check: every shared case must be rejected by Pydantic strict.

    The TypeScript mirror in ``src/rpc/contracts/recipe.spec.ts`` consumes
    the same JSON file -- so a drift here is visible on both sides at once.
    """
    with pytest.raises(ValidationError):
        MotionRecipe.model_validate(case.payload)


# ---------- Per-id round-trip across the canonical vocabulary ----------


@pytest.mark.parametrize("recipe_id", list(RECIPE_IDS))
def test_export_recipe_each_canonical_id_is_round_tripable(recipe_id: RecipeId) -> None:
    """Every canonical id must survive export -> JSON -> re-import.

    This is the bridge-level proof that ``RecipeId`` is fully aligned across
    the two sides (ADR-03). One failing id shows up as a single parametrised
    failure, not a sweep.
    """
    recipe = make_recipe(recipe_id)
    raw = recipe.model_dump_json()
    reimported = MotionRecipe.model_validate_json(raw)
    assert reimported == recipe
    assert reimported.recipe_id == recipe_id
