"""Vocabulary bridge step 1 of 3 — Python exports the recipe id list (DM-02, §4.4).

Ordered bridge chain (Task 1 of plan 01-02 only exercises step 1 -- the
TypeScript-side re-emit lands when ``vocabulary.spec.ts`` reads the artifact):

1. ``python -m pytest tests/bridge/test_vocabulary_bridge.py -k export``
   -- writes ``fixtures/bridge/vocabulary.json``
2. ``npx vitest run vocabulary`` (lands with ``vocabulary.spec.ts``)
3. ``python -m pytest tests/bridge/test_vocabulary_bridge.py -k invariant`` --
   asserts deep equality between the exported JSON and the canonical tuple.

The TypeScript-side mirror reads the same artifact and asserts deep equality
plus the 8-12 invariant. The Python side round-trips: re-loads the JSON and
asserts the sequence matches :data:`RECIPE_IDS` byte-for-byte (resolution of
the DM-05 precision probe, generalised for non-numeric payloads).
"""

from __future__ import annotations

import json
from pathlib import Path

from lottie_forge.domain.vocabulary import RECIPE_IDS, assert_recipe_count

REPO_ROOT = Path(__file__).resolve().parents[2]
BRIDGE_DIR = REPO_ROOT / "fixtures" / "bridge"
VOCABULARY_FIXTURE = BRIDGE_DIR / "vocabulary.json"


def test_export_vocabulary() -> None:
    """Step 1: write the canonical id list to the bridge fixture.

    The TypeScript ``vocabulary.spec.ts`` consumes this file and asserts
    deep equality against ``RECIPE_IDS as const``. The Python suite
    independently re-loads the file to assert the round-trip is byte-identical.
    """
    BRIDGE_DIR.mkdir(parents=True, exist_ok=True)

    # ADR-03 invariant -- fail loud here so the artifact is never written
    # when the canonical tuple violates the 8-12 closed range.
    assert_recipe_count(RECIPE_IDS)

    VOCABULARY_FIXTURE.write_text(
        json.dumps(list(RECIPE_IDS)),
        encoding="utf-8",
    )
    assert VOCABULARY_FIXTURE.exists()

    # Round-trip sanity: the file we just wrote must re-parse to the same
    # tuple. This is the Python-side mirror of the TS deep-equal check.
    reloaded = tuple(json.loads(VOCABULARY_FIXTURE.read_text(encoding="utf-8")))
    assert reloaded == RECIPE_IDS
