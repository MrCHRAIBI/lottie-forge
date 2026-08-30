"""Bilingual loading parity for the recipe catalogue (MOT-04, plan 02-04 Task 2).

The committed ``fixtures/recipe-catalogue/catalogue.json`` is read
**directly** by both layers (§5.5.3 l.150) -- the catalogue does NOT travel
the 3-artefact bridge chain (unlike the style fixture): Python validates it
with :class:`~lottie_forge.domain.catalogue.RecipeCatalogue`, TypeScript
with ``RecipeCatalogueSchema``, and the parity here proves zero drift:

- ``test_export_catalogue`` (selected by ``pytest -k export``) re-emits the
  Python-validated catalogue to ``fixtures/bridge/catalogue.from-python.json``
  plus the schema-key/tuple lockstep artifact
  ``catalogue.schema-keys.json`` for the vitest side.
- The parity test deep-compares the model built from the **committed** bytes
  against the model re-imported from the Python-exported artifact --
  byte-stable ``model_dump_json`` on both routes.
- The hash test pins the D-03 regime: ``sha256_hex(normalize_lf(committed
  bytes))`` -- 64 lowercase hex, stable across reads, reproducible with
  ``sha256sum`` outside the factory (same single implementation as D-02).
- The coverage-map smoke asserts the committed D-15 product data exists with
  its 16 states (5 fintech + 5 dev-tools + 6 e-commerce); the BLOCKING audit
  (A/B/C) is plan 02-05's job -- this is a load-shape check only.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic_core import ValidationError

from lottie_forge.domain.catalogue import (
    KEYFRAME_SHAPES,
    SHAPE_NAMES,
    TRIGGER_POINTS,
    CatalogRecipe,
    RecipeCatalogue,
)
from lottie_forge.domain.vocabulary import RECIPE_IDS
from lottie_forge.loading.catalogue import (
    CATALOGUE_FIXTURE_PATH,
    COVERAGE_MAP_PATH,
    load_catalogue_fixture,
    load_catalogue_with_style,
    validate_easing_cross,
)
from lottie_forge.loading.style import normalize_lf, sha256_hex
from tests.bridge.rejection_loader import load_rejection_cases

REPO_ROOT = Path(__file__).resolve().parents[2]
BRIDGE_DIR = REPO_ROOT / "fixtures" / "bridge"
FROM_PYTHON = BRIDGE_DIR / "catalogue.from-python.json"
SCHEMA_KEYS = BRIDGE_DIR / "catalogue.schema-keys.json"


def _load_committed_catalogue() -> RecipeCatalogue:
    """Parse the committed catalogue bytes under the strict model (loader)."""
    catalogue, _sha = load_catalogue_fixture()
    return catalogue


def test_export_catalogue() -> None:
    """Bridge export (pytest -k export): re-emit the Python-validated model."""
    catalogue = _load_committed_catalogue()

    BRIDGE_DIR.mkdir(parents=True, exist_ok=True)
    FROM_PYTHON.write_text(catalogue.model_dump_json(), encoding="utf-8")

    keys_payload = {
        "model": "RecipeCatalogue",
        "keys": sorted(RecipeCatalogue.model_fields.keys()),
        "recipe_keys": sorted(CatalogRecipe.model_fields.keys()),
        "keyframe_shapes": list(KEYFRAME_SHAPES),
        "shape_names": list(SHAPE_NAMES),
        "trigger_points": list(TRIGGER_POINTS),
    }
    SCHEMA_KEYS.write_text(
        json.dumps(keys_payload, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    assert FROM_PYTHON.exists()
    assert SCHEMA_KEYS.exists()


def test_committed_catalogue_loads_both_sides_without_drift() -> None:
    """MOT-04: model(committed) == model(python-exported artifact)."""
    catalogue = _load_committed_catalogue()

    assert FROM_PYTHON.exists(), (
        f"Bridge export artefact missing at {FROM_PYTHON} -- run "
        "`python -m pytest tests/bridge/test_catalogue_bridge.py -k export` first."
    )
    reimported = RecipeCatalogue.model_validate_json(FROM_PYTHON.read_bytes())
    assert catalogue == reimported
    # Byte-stability of the canonical serialisation (no field reordering).
    assert catalogue.model_dump_json() == reimported.model_dump_json()


def test_catalogue_sha256_d03_regime() -> None:
    """D-03: sha256 over LF-normalised committed bytes, 64 lowercase hex."""
    first = sha256_hex(normalize_lf(CATALOGUE_FIXTURE_PATH.read_bytes()))
    second = sha256_hex(normalize_lf(CATALOGUE_FIXTURE_PATH.read_bytes()))

    assert first == second
    assert len(first) == 64
    assert all(c in "0123456789abcdef" for c in first)


def test_committed_catalogue_is_the_locked_product_data() -> None:
    """The committed file is the D-01 × §5.5.2 verbatim data -- spot locks."""
    catalogue = _load_committed_catalogue()
    by_id = {r.id: r for r in catalogue.recipes}

    assert [r.id for r in catalogue.recipes] == [
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
    # D-01 corrections verbatim: slide exits, pulse enters+loops with a
    # 0.8 ceiling, wiggle capped at 0.5, float loops.
    assert by_id["slide"].trigger_points == ["enter", "exit"]
    assert by_id["pulse"].trigger_points == ["enter", "loop"]
    assert by_id["pulse"].intensity_range == (0.1, 0.8)
    assert by_id["wiggle"].intensity_range == (0.1, 0.5)
    assert by_id["float"].trigger_points == ["loop"]
    # Every easing is one of the two style-fixture curves (D-17 coherence).
    assert {r.easing for r in catalogue.recipes} == {"standard", "entrance"}


def test_coverage_map_product_data_loads() -> None:
    """D-15 committed data: 16 states across 3 verticals (audit is 02-05)."""
    coverage = json.loads(COVERAGE_MAP_PATH.read_bytes())

    verticals = {v["name"]: v["states"] for v in coverage["verticals"]}
    assert set(verticals) == {"fintech", "dev-tools", "e-commerce"}
    all_states = [s for states in verticals.values() for s in states]
    assert len(all_states) == 16
    state_ids = [s["state_id"] for s in all_states]
    assert len(set(state_ids)) == 16
    for state in all_states:
        assert len(state["recipes"]) >= 1


# ---------------------------------------------------------------------------
# D-17: joint (catalogue + style) easing cross-reference
# ---------------------------------------------------------------------------


def test_joint_load_on_committed_fixtures_is_green() -> None:
    """The committed pair loads jointly -- 10 easings over standard/entrance."""
    catalogue, style, style_sha, catalogue_sha = load_catalogue_with_style()

    assert len(catalogue.recipes) == 10
    assert style.style_version == "1.0.0"
    assert {c.name for c in style.easing_curves} == {"standard", "entrance"}
    assert len(style_sha) == 64
    assert len(catalogue_sha) == 64


def test_load_catalogue_fixture_returns_model_and_hash() -> None:
    catalogue, sha = load_catalogue_fixture()

    assert isinstance(catalogue, RecipeCatalogue)
    assert len(sha) == 64
    assert all(c in "0123456789abcdef" for c in sha)


def test_unknown_easing_rejected_at_joint_load() -> None:
    """Mutation: easing 'overshoot' -> ValidationError loc recipes.idx.easing."""
    catalogue = _load_committed_catalogue()
    mutated = catalogue.model_copy(
        update={
            "recipes": [
                r.model_copy(update={"easing": "overshoot"}) if i == 0 else r
                for i, r in enumerate(catalogue.recipes)
            ]
        }
    )
    with pytest.raises(ValidationError) as excinfo:
        validate_easing_cross(mutated, {"standard", "entrance"})
    locs = {tuple(e["loc"]) for e in excinfo.value.errors()}
    assert ("recipes", 0, "easing") in locs


def test_style_without_entrance_rejects_entrance_recipes() -> None:
    """Mutation: amputate the entrance curve -> its 3 recipes fail, hard."""
    catalogue = _load_committed_catalogue()
    with pytest.raises(ValidationError) as excinfo:
        validate_easing_cross(catalogue, {"standard"})
    errors = excinfo.value.errors()
    locs = {tuple(e["loc"]) for e in errors}
    # draw-on, bounce, scale-pop are the entrance recipes (§5.5.2 table).
    offending = {
        loc[1]
        for loc in locs
        if len(loc) == 3 and loc[0] == "recipes" and loc[2] == "easing"
    }
    assert {catalogue.recipes[i].id for i in offending} == {
        "draw-on",
        "bounce",
        "scale-pop",
    }


def test_validate_easing_cross_is_pure_and_green_on_valid_pair() -> None:
    """Pure function: no I/O, returns None silently on a valid pair."""
    catalogue = _load_committed_catalogue()
    assert validate_easing_cross(catalogue, {"standard", "entrance"}) is None
    # An empty name-set rejects every recipe (collect-all, one per recipe).
    with pytest.raises(ValidationError) as excinfo:
        validate_easing_cross(catalogue, set())
    assert len(excinfo.value.errors()) == len(catalogue.recipes)


# ---------------------------------------------------------------------------
# D-14 A/B: blocking motion-coverage audit (§5.6) over the committed map
# ---------------------------------------------------------------------------


def _load_coverage_map() -> dict:
    return json.loads(COVERAGE_MAP_PATH.read_bytes())


def _catalogue_id_set() -> set[str]:
    return {r.id for r in _load_committed_catalogue().recipes}


def test_coverage_audit_a_no_orphan_state_no_unknown_id() -> None:
    """D-14 A: every state maps to >= 1 existing catalogue recipe id.

    An orphan state (empty recipes list) or an unknown id (not in the
    catalogue nor in RECIPE_IDS) fails verify -- the message cites the
    vertical and the state_id so the gap is actionable.
    """
    coverage = _load_coverage_map()
    catalogue_ids = _catalogue_id_set()

    for vertical in coverage["verticals"]:
        for state in vertical["states"]:
            assert len(state["recipes"]) >= 1, (
                f"orphan state: {vertical['name']}/{state['state_id']} maps to "
                f"no recipe (D-14 A -- every state needs >= 1 recipe)"
            )
            for recipe_id in state["recipes"]:
                assert recipe_id in catalogue_ids and recipe_id in RECIPE_IDS, (
                    f"unknown recipe id {recipe_id!r} in "
                    f"{vertical['name']}/{state['state_id']} "
                    f"(D-14 A -- not a catalogue member)"
                )


def test_coverage_audit_b_no_dead_recipe_plus_d15_coherences() -> None:
    """D-14 B: every catalogue recipe appears in >= 1 mapping (no dead slot).

    Also asserts the D-15 documentary coherences on the committed map:
    exit states reference exit-capable recipes (slide/fade) and the
    continuous states reference loop recipes (orbit/float/pulse).
    """
    coverage = _load_coverage_map()
    catalogue_ids = _catalogue_id_set()

    mapped: set[str] = set()
    for vertical in coverage["verticals"]:
        for state in vertical["states"]:
            mapped.update(state["recipes"])

    dead = sorted(catalogue_ids - mapped)
    assert dead == [], (
        f"dead recipes: {dead} -- every closed-catalogue slot must be "
        f"justified (D-14 B)"
    )

    # D-15 coherences (documentary, on the committed map).
    by_state = {
        s["state_id"]: set(s["recipes"])
        for v in coverage["verticals"]
        for s in v["states"]
    }
    assert by_state["alert-dismissed"] & {"slide", "fade"}, (
        "D-15: the exit state must map to exit-capable recipes (slide/fade)"
    )
    loop_recipes = {"orbit", "float", "pulse"}
    for continuous in ("recurring-sync", "pipeline-running", "promo-banner"):
        assert by_state[continuous] & loop_recipes, (
            f"D-15: continuous state {continuous} must map to a loop recipe"
        )


# ---------------------------------------------------------------------------
# Shared rejection harness (D-06/D-08): catalogue intrinsic rejections
# ---------------------------------------------------------------------------


_CATALOGUE_REJECTION_CASES = load_rejection_cases("catalogue")


@pytest.mark.parametrize("case", _CATALOGUE_REJECTION_CASES, ids=lambda c: c.case_id)
def test_catalogue_rejection_case(case) -> None:
    """Every shared catalogue case is rejected by Pydantic strict (mirrored).

    The TypeScript mirror in ``src/rpc/contracts/catalogue.spec.ts`` consumes
    the same JSON via ``loadRejectionCases("catalogue")`` -- one source, zero
    drift. Loc membership only, never message text (D-08). Literal-in-list
    mutations carry the item index at the loc tail (pydantic v2 behaviour,
    same as the zod array-index paths).
    """
    with pytest.raises(ValidationError) as exc_info:
        RecipeCatalogue.model_validate_json(json.dumps(case.payload))

    errors = exc_info.value.errors()
    actual_locs = {tuple(e["loc"]) for e in errors}

    if not case.expect_paths:
        assert errors, f"Expected at least one ValidationError, got none for {case.case_id}"
        return

    for expected in case.expect_paths:
        assert tuple(expected) in actual_locs, (
            f"{case.case_id}: expected loc {tuple(expected)!r} not found in "
            f"{sorted(actual_locs)!r}"
        )
