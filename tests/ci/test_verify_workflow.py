"""Committed regression tests for the CI ``verify`` workflow invariants.

Plan 01-05 (requirement DM-05, "the gate is the gate" §1.8) verified the
structural shape of ``.github/workflows/verify.yml`` ad-hoc at execution
time (PyYAML safe_load + manual greps). This module turns those checks
into a permanent, committed regression suite: any future edit that
reorders, drops, weakens, or silently skips a step of the gate reddens
``verify``.

Source of truth for the assertions: §3.6 of ``docs/project/03_Stack.md``
(the ordered 10-step sequence), §4.2 of ``docs/project/04_Modeles.md``
(zero-skip junitxml gate) and plan 01-05 ``must_haves``. The tests are
READ-ONLY parsers of the workflow file — they assert the committed
invariants, they never write it.

Invariants pinned here (plan 01-05 Task 1):

- single job ``verify`` on ``ubuntu-latest``
- triggers ``push`` (branch ``main``) + ``pull_request``
- ``permissions: contents: read`` (least privilege, T-01-10)
- setup actions present and version-pinned: ``actions/checkout``,
  ``actions/setup-python`` (python-version "3.12"), ``actions/setup-node``
  (node-version 20)
- ``pip install -e ".[dev]"`` present and QUOTED in the YAML literal
  (unquoted, the shell would glob ``[dev]``)
- ``npm ci`` present (fails hard on lockfile drift)
- the ordered verification sequence ruff → biome → pytest -k export →
  vitest → pytest -q → tsc → zero-skip gate
- ``node scripts/assert-zero-skips.mjs ...`` is the LAST step (§4.2)
- NO step carries ``continue-on-error`` or an ``if:`` condition — a
  half-silent bridge chain cannot pass green (T-01-11)
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "verify.yml"

_RAW_WORKFLOW = WORKFLOW_PATH.read_text(encoding="utf-8")
_WORKFLOW = yaml.safe_load(_RAW_WORKFLOW)
_STEPS: list[dict[str, object]] = _WORKFLOW["jobs"]["verify"]["steps"]
_RUN_COMMANDS: list[str] = [step["run"] for step in _STEPS if "run" in step]

_ZERO_SKIP_GATE = (
    "node scripts/assert-zero-skips.mjs"
    " fixtures/bridge/pytest-junit.xml"
    " fixtures/bridge/vitest-junit.xml"
)

# The exact §3.6 ordered sequence: CI steps 4..12 (setup + 7 checks).
EXPECTED_RUN_COMMANDS: list[str] = [
    'pip install -e ".[dev]"',
    "npm ci",
    "ruff check .",
    "npx @biomejs/biome check .",
    "python -m pytest tests/ -q -k export",
    "npx vitest run",
    "python -m pytest tests/ -q",
    "npx tsc --noEmit",
    _ZERO_SKIP_GATE,
]


def _triggers(workflow: dict[str, object]) -> dict[str, object]:
    """Return the workflow triggers, absorbing the YAML 1.1 ``on:`` quirk.

    PyYAML implements YAML 1.1, where the bare key ``on`` parses as the
    boolean ``True`` — the lookup must try both spellings.
    """
    found = workflow.get("on")
    if found is None:
        found = workflow.get(True)
    assert isinstance(found, dict), "workflow triggers ('on:') missing or malformed"
    return found


# ---------------------------------------------------------------------------
# Structural invariants — job, triggers, permissions
# ---------------------------------------------------------------------------


def test_workflow_yaml_is_well_formed() -> None:
    """Acceptance (plan 01-05 Task 1): the workflow parses without error."""
    assert isinstance(_WORKFLOW, dict)
    for key in ("name", "jobs", "permissions"):
        assert key in _WORKFLOW, f"missing top-level workflow key {key!r}"


def test_single_job_verify_runs_on_ubuntu_latest() -> None:
    """ONE job named ``verify`` on ``ubuntu-latest`` — no matrix, no second
    job that could run bridge legs out of order or in parallel (T-01-11)."""
    jobs = _WORKFLOW["jobs"]
    assert set(jobs) == {"verify"}
    assert jobs["verify"]["runs-on"] == "ubuntu-latest"


def test_triggers_are_push_main_and_pull_request() -> None:
    """The gate fires on pushes to ``main`` and on every pull request."""
    triggers = _triggers(_WORKFLOW)
    assert triggers["push"]["branches"] == ["main"]
    assert "pull_request" in triggers


def test_permissions_are_contents_read() -> None:
    """Least privilege (T-01-10): GITHUB_TOKEN may only read contents."""
    assert _WORKFLOW["permissions"] == {"contents": "read"}


# ---------------------------------------------------------------------------
# Setup actions — presence + explicit version pinning
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("action_prefix", "expected_with"),
    [
        ("actions/checkout", {}),
        ("actions/setup-python", {"python-version": "3.12"}),
        ("actions/setup-node", {"node-version": "20"}),
    ],
    ids=["checkout", "setup-python-3.12", "setup-node-20"],
)
def test_setup_action_present_and_version_pinned(
    action_prefix: str, expected_with: dict[str, str]
) -> None:
    """Each setup action is present with an explicitly pinned ``@vN`` ref
    (never a floating branch) and its §3.1–§3.2 version inputs."""
    step = next(s for s in _STEPS if str(s.get("uses", "")).startswith(action_prefix))
    uses = str(step["uses"])
    assert re.fullmatch(re.escape(action_prefix) + r"@v\d+", uses), uses
    # Normalized to str: YAML parses bare ``20`` as int, quoted "3.12" as str.
    actual_with = {k: str(v) for k, v in (step.get("with") or {}).items()}
    assert actual_with == expected_with


# ---------------------------------------------------------------------------
# Run commands — quoting, presence, exact §3.6 order, gate last
# ---------------------------------------------------------------------------


def test_pip_install_dev_is_present_and_quoted_in_yaml() -> None:
    """``pip install -e ".[dev]"`` must be QUOTED in the YAML literal.

    The double quotes must survive into the parsed ``run`` value — that is
    the proof the shell receives a quoted ``.[dev]`` instead of globbing it
    (plan 01-05 Task 1, §3.6 step 4).
    """
    assert 'pip install -e ".[dev]"' in _RUN_COMMANDS
    assert 'pip install -e ".[dev]"' in _RAW_WORKFLOW


def test_npm_ci_is_present_not_npm_install() -> None:
    """``npm ci`` (hard-fails on lockfile drift); ``npm install`` forbidden."""
    assert "npm ci" in _RUN_COMMANDS
    assert not any(cmd.startswith("npm install") for cmd in _RUN_COMMANDS)


def test_run_commands_follow_exact_s3_6_order() -> None:
    """The 9 run commands appear in the exact §3.6 order (steps 4..12):
    pip install → npm ci → ruff → biome → pytest -k export → vitest →
    pytest -q → tsc → zero-skip gate. Reordering would break the bridge
    legs (export before validate before strict re-import)."""
    assert _RUN_COMMANDS == EXPECTED_RUN_COMMANDS


def test_zero_skip_gate_is_the_last_step_of_the_job() -> None:
    """§4.2: the junitxml zero-skip assertion closes the chain — it must be
    the LAST step of the job, pinning both junitxml paths, so no later step
    can run after a skipped run went green."""
    last = _STEPS[-1]
    assert last.get("run") == _ZERO_SKIP_GATE


def test_no_step_has_continue_on_error_or_condition() -> None:
    """T-01-11: no ``continue-on-error``, no ``if:`` on ANY step — a
    half-silent chain (soft-failed or conditional step) cannot pass green."""
    offenders = [
        str(step.get("name") or step.get("uses") or step.get("run"))
        for step in _STEPS
        if "continue-on-error" in step or "if" in step
    ]
    assert offenders == [], f"steps with continue-on-error/if: present: {offenders}"
