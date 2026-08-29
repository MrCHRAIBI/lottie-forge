"""Bridge steps 1 + 3 for PackManifest -- Python export and Python re-validate (DM-04, DM-05).

Ordered bridge chain (pack-manifest):

1. ``python -m pytest tests/bridge/test_pack_bridge.py -k export``
   -- writes ``fixtures/bridge/pack-manifest.from-python.json`` + schema keys
2. ``npx vitest run src/rpc/contracts/pack-manifest.spec.ts``
   -- zod validates + re-emits ``fixtures/bridge/pack-manifest.from-ts.json``
3. ``python -m pytest tests/bridge/test_pack_bridge.py -k reimport``
   -- strict Pydantic re-validates the TS-emitted artifact

Also includes:

- The **determinism probe** (critère ROADMAP n°5, §4.1 #6): two
  ``PackManifest`` instances built independently (one via
  ``make_pack()`` then another re-assembled with reversed assets list
  + same values) must serialize to the same bytes via
  ``model_dump_json()``.
- The bridge-side rejection harness (D-06/D-08): the same JSON of
  rejection cases (``fixtures/rejection-cases/pack-manifest.json``)
  drives the ``test.each`` mirror in ``pack-manifest.spec.ts`` -- one
  source, zero drift. The 10 cases cover:

    - IN-08: duplicate ``asset_id`` (collect-all, one issue per duplicate)
    - DM-04: ``totals.asset_count`` coherence (``totals`` path)
    - WR-01: mono-style mismatch (``assets`` idx, ``style_ref``)
    - DM-04: ``assets`` length bounds (empty, 51)
    - LIC-01: license shape (3 voies : terms literal, commercial_use,
      attribution_required)
    - DM-04: ``cost_eur`` out-of-range
    - DM-04: ``pack_id`` form (trailing segment rejected)
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from lottie_forge.domain.pack import PackManifest
from tests.bridge.fixtures import make_asset, make_pack, make_style_spec
from tests.bridge.rejection_loader import load_rejection_cases

REPO_ROOT = Path(__file__).resolve().parents[2]
BRIDGE_DIR = REPO_ROOT / "fixtures" / "bridge"
FROM_PYTHON = BRIDGE_DIR / "pack-manifest.from-python.json"
FROM_TS = BRIDGE_DIR / "pack-manifest.from-ts.json"
SCHEMA_KEYS = BRIDGE_DIR / "pack-manifest.schema-keys.json"


def test_export_pack() -> None:
    """Step 1: write Python-side bridge artifacts for the TypeScript half."""
    BRIDGE_DIR.mkdir(parents=True, exist_ok=True)

    pack = make_pack()
    FROM_PYTHON.write_text(pack.model_dump_json(), encoding="utf-8")

    # Parity of schema keys: zod's `.shape` keys must equal the
    # `model_json_schema().properties` keys. The TS spec consumes this list to
    # assert the bridge keys are identical on both sides (§4.2).
    SCHEMA_KEYS.write_text(
        json.dumps(sorted(PackManifest.model_json_schema()["properties"].keys())),
        encoding="utf-8",
    )

    assert FROM_PYTHON.exists()
    assert SCHEMA_KEYS.exists()
    # The exported payload must itself be re-readable by the strict model.
    assert PackManifest.model_validate_json(FROM_PYTHON.read_text(encoding="utf-8")) == pack


@pytest.mark.skipif(
    not FROM_TS.exists(),
    reason="TS bridge artifact missing -- run `npx vitest run` between export and re-import",
)
def test_reimport_pack() -> None:
    """Step 3: the TS-re-emitted artifact must re-validate under strict Pydantic.

    The re-import is the place where any cross-side drift surfaces: if zod
    accepted something Pydantic rejects (or vice versa) the comparison
    ``reimported == pack`` fails loudly here.
    """
    pack = make_pack()
    reimported = PackManifest.model_validate_json(FROM_TS.read_text(encoding="utf-8"))

    assert reimported == pack
    assert reimported.model_dump_json() == pack.model_dump_json()


# ---------- Pack style_ref pin consistency (mono-style by construction) ----------


def test_pack_assets_style_refs_are_pinned_to_pack_style_version() -> None:
    """``make_pack().assets[*].style_ref`` shares the pack's ``style_version``.

    The mono-style gate (§4.8 / WR-01) checks the version suffix of every
    asset's ``style_ref`` against the pack's ``style_version``. The
    fixture must satisfy this by construction -- the bridge suite catches
    any drift.
    """
    pack = make_pack()
    for asset in pack.assets:
        assert asset.style_ref.endswith(f"@{pack.style_version}")


def test_pack_totals_asset_count_matches_assets_length() -> None:
    """Sanity: ``make_pack().totals.asset_count`` mirrors ``len(assets)``.

    This is enforced by the PackManifest validator (§4.8 invariant 2)
    but it must also be true by construction in the fixture.
    """
    pack = make_pack()
    assert pack.totals.asset_count == len(pack.assets)


# ---------- Determinism probe (critère ROADMAP n°5, §4.1 #6) ----------


def test_two_constructs_with_equal_content_serialize_byte_identical_determinism() -> None:
    """Bridge-side determinism: two independent constructions -> same bytes.

    ``make_pack()`` builds one canonical PackManifest. A second one is
    built independently with the SAME content (same fields, same order)
    but using a different construction path -- direct kwargs instead of
    the make_* helpers. The dump bytes must match (critère ROADMAP n°5,
    §4.1 #6).
    """
    style_version = make_style_spec().style_version
    pack_a = make_pack()

    # Construct B independently -- same content, different code path.
    # Note: each asset's ``shape_group_names`` must be ``["bg-shape"]``
    # (matching ``make_pack()``'s internal helper), NOT
    # ``["bg-shape", "accent-shape"]`` (which is what ``make_asset()``
    # returns).
    b1_composition = make_asset().composition_meta.model_copy(
        update={"shape_group_names": ["bg-shape"]}
    )
    asset_b1 = make_asset().model_copy(
        update={"asset_id": "a-001", "composition_meta": b1_composition}
    )
    b2_composition = make_asset().composition_meta.model_copy(
        update={"shape_group_names": ["bg-shape"]}
    )
    asset_b2 = make_asset().model_copy(
        update={"asset_id": "a-002", "composition_meta": b2_composition}
    )
    pack_b = PackManifest(
        pack_id="pack-nature-2026-03-15",
        style_version=style_version,
        assets=[asset_b1, asset_b2],
        totals=pack_a.totals.model_copy(),
        license=pack_a.license.model_copy(),
    )

    # Pydantic equality holds (same content).
    assert pack_a == pack_b
    # Byte-identical serialization -- the deterministic gate.
    assert pack_a.model_dump_json() == pack_b.model_dump_json()


# ---------- Rejection harness (mirror of vitest test.each, D-06/D-08) ----------


_REJECTION_CASES = load_rejection_cases("pack-manifest")


@pytest.mark.parametrize("case", _REJECTION_CASES, ids=lambda c: c.case_id)
def test_bridge_rejection_case(case) -> None:
    """Bridge-side rejection check: every shared case must be rejected by Pydantic strict.

    The TypeScript mirror in ``src/rpc/contracts/pack-manifest.spec.ts``
    consumes the same JSON file -- so a drift here is visible on both
    sides at once.
    """
    with pytest.raises(ValidationError) as exc_info:
        PackManifest.model_validate(case.payload)
    # A non-empty errors() output is the minimum bar; path membership is
    # also verified by the domain suite. Here we only assert rejection.
    assert exc_info.value.errors(), (
        f"Expected at least one ValidationError, got none for {case.case_id}"
    )


# ---------- IN-08 adjacency probe on the bridge (collect-all) ----------


def test_in08_duplicate_asset_id_collect_all_on_bridge() -> None:
    """IN-08 collect-all: each duplicate index surfaces a path entry.

    The duplicate ``asset_id`` (``a-001`` at idx 0 and 1) yields
    ``loc=("assets", 0, "asset_id")`` AND ``loc=("assets", 1, "asset_id")``
    -- one issue per duplicate, never a single aggregated issue, never
    silent deduplication.
    """
    style_version = make_style_spec().style_version
    payload = {
        "pack_id": "pack-nature-2026-03-15",
        "style_version": style_version,
        "assets": [
            {
                "asset_id": "a-001",
                "style_ref": f"example-style@{style_version}",
                "recipe_ref": "fade",
                "composition_meta": {"shape_group_names": ["bg-shape"]},
                "content_hashes": {
                    "svg_sha256": "a" * 64,
                    "lottie_sha256": "0123456789abcdef" * 4,
                },
            },
            {
                "asset_id": "a-001",  # duplicate
                "style_ref": f"example-style@{style_version}",
                "recipe_ref": "fade",
                "composition_meta": {"shape_group_names": ["bg-shape"]},
                "content_hashes": {
                    "svg_sha256": "a" * 64,
                    "lottie_sha256": "0123456789abcdef" * 4,
                },
            },
        ],
        "totals": {"asset_count": 2, "cost_eur": 0.5, "first_pass_yield": 0.75},
        "license": {
            "license_id": "pack-license-std",
            "terms": "perpetual-one-time",
            "commercial_use": True,
            "attribution_required": False,
        },
    }
    with pytest.raises(ValidationError) as exc_info:
        PackManifest.model_validate(payload)
    actual_locs = {tuple(e["loc"]) for e in exc_info.value.errors()}
    assert ("assets", 0, "asset_id") in actual_locs
    assert ("assets", 1, "asset_id") in actual_locs
