"""Rejection-case loader for the pytest bridge suite (D-06/D-08).

The same JSON file (``fixtures/rejection-cases/<contract>.json``) drives the
pytest rejection suite **and** the TypeScript ``test.each`` suite
(``src/rpc/contracts/rejection-cases.ts``). One source, zero drift.

Format (D-08, verbatim):

    { "case_id": "...", "ref": "...", "model": "...", "payload": { },
      "expect_paths": [ ["..."] ]  // OPTIONAL

``expect_paths`` absent  -> assert rejection only.
``expect_paths`` present -> additionally assert each expected path is a member
of the Pydantic ``errors()`` loc-tuples (path comparison only -- never message
text, D-08).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
REJECTION_FIXTURES_DIR = REPO_ROOT / "fixtures" / "rejection-cases"

CONTRACT_FILES: dict[str, str] = {
    "style-spec": "style-spec.json",
    "recipe": "recipe.json",
    "asset-spec": "asset-spec.json",
    "pack-manifest": "pack-manifest.json",
    "style-refinement": "style-refinement.json",
    "catalogue": "catalogue.json",
}


@dataclass(frozen=True)
class RejectionCase:
    """A single rejection scenario loaded from the shared fixtures."""

    case_id: str
    ref: str
    model: str
    payload: dict[str, Any]
    expect_paths: tuple[tuple[Any, ...], ...]


def load_rejection_cases(contract: str) -> list[RejectionCase]:
    """Load every rejection case for ``contract`` from the shared JSON file.

    Parameters
    ----------
    contract:
        The short contract key (e.g. ``"style-spec"``). Resolved against
        :data:`CONTRACT_FILES`.
    """
    filename = CONTRACT_FILES[contract]
    path = REJECTION_FIXTURES_DIR / filename
    raw = json.loads(path.read_text(encoding="utf-8"))

    cases: list[RejectionCase] = []
    for entry in raw:
        expect_paths = entry.get("expect_paths") or []
        cases.append(
            RejectionCase(
                case_id=entry["case_id"],
                ref=entry["ref"],
                model=entry["model"],
                payload=entry["payload"],
                expect_paths=tuple(tuple(p) for p in expect_paths),
            )
        )
    return cases


__all__ = ["CONTRACT_FILES", "REJECTION_FIXTURES_DIR", "RejectionCase", "load_rejection_cases"]
