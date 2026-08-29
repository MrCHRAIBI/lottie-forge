"""Bridge steps 1 and 3 of 3 -- Python produces and Python re-validates (DM-05).

Ordered bridge chain:

1. ``python -m pytest tests/bridge/test_style_spec_bridge.py -k export``
   -- writes ``fixtures/bridge/style-spec.from-python.json`` + schema keys
2. ``npx vitest run src/rpc/contracts/style-spec.spec.ts``
   -- zod validates + re-emits ``fixtures/bridge/style-spec.from-ts.json``
3. ``python -m pytest tests/bridge/test_style_spec_bridge.py -k reimport``
   -- strict Pydantic re-validates the TS-emitted artifact

The re-import step is gated by ``skipif`` on the presence of the TS artifact
(``fixtures/bridge/style-spec.from-ts.json``) -- a guard of order, not a way
to silently skip. CI runs the chain in lockstep so the artifact is always
present and no test is skipped (``docs/project/04_Modeles.md`` §4.2).

Also includes the bridge-side rejection harness (D-06): the same JSON of
rejection cases (``fixtures/rejection-cases/style-spec.json``) drives the
``test.each`` mirror in ``style-spec.spec.ts`` -- one source, zero drift.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from fixtures import make_style_spec
from lottie_forge.domain.style import StyleSpec
from tests.bridge.rejection_loader import load_rejection_cases

REPO_ROOT = Path(__file__).resolve().parents[2]
BRIDGE_DIR = REPO_ROOT / "fixtures" / "bridge"
FROM_PYTHON = BRIDGE_DIR / "style-spec.from-python.json"
FROM_TS = BRIDGE_DIR / "style-spec.from-ts.json"
SCHEMA_KEYS = BRIDGE_DIR / "style-spec.schema-keys.json"


def test_export_style_spec() -> None:
    """Step 1: write Python-side bridge artifacts for the TypeScript half."""
    BRIDGE_DIR.mkdir(parents=True, exist_ok=True)

    spec = make_style_spec()
    FROM_PYTHON.write_text(spec.model_dump_json(), encoding="utf-8")

    # Parity of schema keys: zod's `.shape` keys must equal the
    # `model_json_schema().properties` keys. The TS spec consumes this list to
    # assert the bridge keys are identical on both sides (§4.2).
    SCHEMA_KEYS.write_text(
        json.dumps(sorted(StyleSpec.model_json_schema()["properties"].keys())),
        encoding="utf-8",
    )

    assert FROM_PYTHON.exists()
    assert SCHEMA_KEYS.exists()
    # The exported payload must itself be re-readable by the strict model.
    assert StyleSpec.model_validate_json(FROM_PYTHON.read_text(encoding="utf-8")) == spec


@pytest.mark.skipif(
    not (BRIDGE_DIR / "style-spec.from-ts.json").exists(),
    reason="TS bridge artifact missing -- run `npx vitest run` between export and re-import",
)
def test_reimport_style_spec() -> None:
    """Step 3: the TS-re-emitted artifact must re-validate under strict Pydantic."""
    spec = make_style_spec()
    reimported = StyleSpec.model_validate_json(FROM_TS.read_text(encoding="utf-8"))

    assert reimported == spec
    assert reimported.model_dump_json() == spec.model_dump_json()


# ---------- Rejection harness (mirror of vitest test.each, D-06/D-08) ----------


_REJECTION_CASES = load_rejection_cases("style-spec")


@pytest.mark.parametrize("case", _REJECTION_CASES, ids=lambda c: c.case_id)
def test_bridge_rejection_case(case) -> None:
    """Bridge-side rejection check: every shared case must be rejected by Pydantic strict.

    The TypeScript mirror in ``src/rpc/contracts/style-spec.spec.ts`` consumes
    the same JSON file -- so a drift here is visible on both sides at once.
    """
    with pytest.raises(ValidationError):
        StyleSpec.model_validate(case.payload)

