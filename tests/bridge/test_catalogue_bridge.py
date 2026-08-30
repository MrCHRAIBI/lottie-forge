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

from lottie_forge.domain.catalogue import (
    KEYFRAME_SHAPES,
    SHAPE_NAMES,
    TRIGGER_POINTS,
    CatalogRecipe,
    RecipeCatalogue,
)
from lottie_forge.loading.style import normalize_lf, sha256_hex

REPO_ROOT = Path(__file__).resolve().parents[2]
CATALOGUE_FIXTURE_PATH = REPO_ROOT / "fixtures" / "recipe-catalogue" / "catalogue.json"
COVERAGE_MAP_PATH = REPO_ROOT / "fixtures" / "recipe-catalogue" / "coverage-map.json"
BRIDGE_DIR = REPO_ROOT / "fixtures" / "bridge"
FROM_PYTHON = BRIDGE_DIR / "catalogue.from-python.json"
SCHEMA_KEYS = BRIDGE_DIR / "catalogue.schema-keys.json"


def _load_committed_catalogue() -> RecipeCatalogue:
    """Parse the committed catalogue bytes under the strict model."""
    normalised = normalize_lf(CATALOGUE_FIXTURE_PATH.read_bytes())
    return RecipeCatalogue.model_validate_json(normalised)


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
