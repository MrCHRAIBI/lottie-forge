"""Bridge steps 1 + 3 for AssetSpec — Python export and Python re-validate (DM-03, DM-05).

Ordered bridge chain:

1. ``python -m pytest tests/bridge/test_asset_bridge.py -k export``
   -- writes ``fixtures/bridge/asset-spec.from-python.json`` + schema keys
2. ``npx vitest run src/rpc/contracts/asset-spec.spec.ts``
   -- zod validates + re-emits ``fixtures/bridge/asset-spec.from-ts.json``
3. ``python -m pytest tests/bridge/test_asset_bridge.py -k reimport``
   -- strict Pydantic re-validates the TS-emitted artifact

Also includes the bridge-side rejection harness (D-06/D-08): the same
JSON of rejection cases (``fixtures/rejection-cases/asset-spec.json``)
drives the ``test.each`` mirror in ``asset-spec.spec.ts`` -- one source,
zero drift. The 20 cases cover the DM-03 probes (empty, encoding), the
STY-03 pin lock (partial / 4-segment versions, non-kebab names), the
DM-02 vocabulary reuse (``disco-spin`` rejected at the asset level),
the CR-01 ASCII anchor (non-ASCII shape-group name), and the
ContentHashes closed 2-field model (uppercase / short / non-hex /
extra field).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from fixtures import make_asset, make_style_spec
from lottie_forge.domain.asset import AssetSpec
from tests.bridge.rejection_loader import load_rejection_cases

REPO_ROOT = Path(__file__).resolve().parents[2]
BRIDGE_DIR = REPO_ROOT / "fixtures" / "bridge"
FROM_PYTHON = BRIDGE_DIR / "asset-spec.from-python.json"
FROM_TS = BRIDGE_DIR / "asset-spec.from-ts.json"
SCHEMA_KEYS = BRIDGE_DIR / "asset-spec.schema-keys.json"


def test_export_asset() -> None:
    """Step 1: write Python-side bridge artifacts for the TypeScript half."""
    BRIDGE_DIR.mkdir(parents=True, exist_ok=True)

    asset = make_asset()
    FROM_PYTHON.write_text(asset.model_dump_json(), encoding="utf-8")

    # Parity of schema keys: zod's `.shape` keys must equal the
    # `model_json_schema().properties` keys. The TS spec consumes this list to
    # assert the bridge keys are identical on both sides (§4.2).
    SCHEMA_KEYS.write_text(
        json.dumps(sorted(AssetSpec.model_json_schema()["properties"].keys())),
        encoding="utf-8",
    )

    assert FROM_PYTHON.exists()
    assert SCHEMA_KEYS.exists()
    # The exported payload must itself be re-readable by the strict model.
    assert AssetSpec.model_validate_json(FROM_PYTHON.read_text(encoding="utf-8")) == asset


@pytest.mark.skipif(
    not (BRIDGE_DIR / "asset-spec.from-ts.json").exists(),
    reason="TS bridge artifact missing -- run `npx vitest run` between export and re-import",
)
def test_reimport_asset() -> None:
    """Step 3: the TS-re-emitted artifact must re-validate under strict Pydantic.

    The re-import is the place where any cross-side drift surfaces: if zod
    accepted something Pydantic rejects (or vice versa) the comparison
    ``reimported == asset`` fails loudly here.
    """
    asset = make_asset()
    reimported = AssetSpec.model_validate_json(FROM_TS.read_text(encoding="utf-8"))

    assert reimported == asset
    assert reimported.model_dump_json() == asset.model_dump_json()


# ---------- Asset style_ref pin consistency ----------


def test_asset_style_ref_is_pinned_to_make_style_spec_version() -> None:
    """`make_asset().style_ref` mirrors `make_style_spec().style_version`.

    The Phase-2 STY-03 re-validation gate consumes this pin to confirm
    every asset stays inside the pack's style version. Drift here is a
    silent contract break -- the bridge suite must catch it.
    """
    asset = make_asset()
    style_version = make_style_spec().style_version
    assert asset.style_ref.endswith(f"@{style_version}")


# ---------- Rejection harness (mirror of vitest test.each, D-06/D-08) ----------


_REJECTION_CASES = load_rejection_cases("asset-spec")


@pytest.mark.parametrize("case", _REJECTION_CASES, ids=lambda c: c.case_id)
def test_bridge_rejection_case(case) -> None:
    """Bridge-side rejection check: every shared case must be rejected by Pydantic strict.

    The TypeScript mirror in ``src/rpc/contracts/asset-spec.spec.ts``
    consumes the same JSON file -- so a drift here is visible on both
    sides at once.
    """
    with pytest.raises(ValidationError) as exc_info:
        AssetSpec.model_validate(case.payload)
    # A non-empty errors() output is the minimum bar; path membership is
    # also verified by the domain suite. Here we only assert rejection.
    assert exc_info.value.errors(), (
        f"Expected at least one ValidationError, got none for {case.case_id}"
    )