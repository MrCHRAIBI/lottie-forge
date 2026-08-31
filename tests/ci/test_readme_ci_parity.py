"""README quickstart = CI ``verify`` sequence, byte-for-byte (§3.6).

Plan 01-05 (Task 2, requirement DM-05) verified at execution time — via
ad-hoc ``IndexOf`` greps — that every command of the CI job appears
verbatim in the README Quickstart, in CI order. This module pins that
parity as a committed regression test: if ``verify.yml`` gains, loses,
reorders, or rewords a command without the README following (or vice
versa), ``verify`` reddens.

Interpretation (per §3.6, kept stable): the README Quickstart carries CI
steps **4..12** — the two local setup commands (``pip install -e
".[dev]"``, ``npm ci``) followed by the 7 verification commands in CI
order (ruff → biome → pytest -k export → vitest → pytest -q → tsc →
assert-zero-skips). CI steps 1..3 (``actions/checkout``,
``actions/setup-python``, ``actions/setup-node``) are runner-only setup
actions with no local equivalent — the README says so explicitly.

Both files are READ-ONLY here: the CI command list is extracted from
``.github/workflows/verify.yml`` (single source), the README side is
scanned inside the Quickstart fenced code blocks only.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "verify.yml"
README_PATH = REPO_ROOT / "README.md"

_QUICKSTART_HEADING = "## Quickstart"
_NEXT_SECTION_HEADING = "## Structure du monorepo"


def _ci_run_commands() -> list[str]:
    """Extract the ordered ``run`` commands of the CI job ``verify``."""
    workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
    steps = workflow["jobs"]["verify"]["steps"]
    return [step["run"] for step in steps if "run" in step]


def _quickstart_code_blocks() -> str:
    """Concatenated fenced code blocks of the README Quickstart section.

    Scoping to the fenced blocks (not the prose) is what makes the check
    byte-for-byte: prose mentions of commands elsewhere in the README must
    not satisfy the parity.
    """
    readme = README_PATH.read_text(encoding="utf-8")
    start = readme.index(_QUICKSTART_HEADING)
    end = readme.index(_NEXT_SECTION_HEADING, start)
    section = readme[start:end]
    blocks = re.findall(r"```[^\n]*\n(.*?)```", section, flags=re.DOTALL)
    assert blocks, "no fenced code block found in the README Quickstart section"
    return "\n".join(blocks)


def test_readme_quickstart_matches_ci_sequence_byte_for_byte() -> None:
    """Every CI ``run`` command (steps 4..12) appears verbatim in the
    README Quickstart code blocks, in the exact CI order.

    The advancing search cursor enforces BOTH presence (byte-for-byte
    substring) and relative order in one pass. It also defuses the
    prefix-of hazard: ``python -m pytest tests/ -q`` is a prefix of
    ``python -m pytest tests/ -q -k export``, but by the time it is
    searched, the ``-k export`` variant (CI step 8) has already been
    consumed, so the cursor can only match the standalone full-suite
    command (CI step 10) further down.
    """
    quickstart = _quickstart_code_blocks()
    cursor = 0
    for command in _ci_run_commands():
        position = quickstart.find(command, cursor)
        assert position != -1, (
            f"CI command missing from (or reordered in) the README Quickstart "
            f"code blocks: {command!r}"
        )
        cursor = position + 1
