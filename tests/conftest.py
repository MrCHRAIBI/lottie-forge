"""Pytest session bootstrap.

Two responsibilities:

1. Ensure ``fixtures/bridge/`` exists so the ``--junitxml`` addopts target
   (``fixtures/bridge/pytest-junit.xml``) and any bridge tests that write
   artifacts into that directory never crash on a missing parent. The
   directory itself is gitignored (see ``docs/project/04_Modeles.md`` §4.3
   -- generated at test time).

2. Put ``tests/bridge/`` on ``sys.path`` so the single fixture source of
   truth (``tests/bridge/fixtures.py`` -- named simply ``fixtures``) can be
   imported as ``from fixtures import make_style_spec``. Putting only the
   ``fixtures`` module name on the import path keeps the importable surface
   tiny (no need for an ``__init__.py`` in ``tests/``, no risk of test module
   names shadowing real packages).
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BRIDGE_DIR = REPO_ROOT / "fixtures" / "bridge"


def pytest_configure(config: object) -> None:
    """Session-level bootstrap: ensure bridge dir exists, expose fixtures module."""
    BRIDGE_DIR.mkdir(parents=True, exist_ok=True)
    bridge_path = str(Path(__file__).resolve().parent / "bridge")
    if bridge_path not in sys.path:
        sys.path.insert(0, bridge_path)
