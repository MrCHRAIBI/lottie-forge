---
phase: 1
slug: contrats-de-donn-es-fronti-re-pydantic-zod-reconstruction
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-31
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Reconstructed from phase artifacts (State B — no VALIDATION.md existed at phase close), then audited and gap-filled on 2026-08-31.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8 (Python) + vitest ^4 (TS) + tsc/ruff/biome static gates |
| **Config file** | `pyproject.toml` `[tool.pytest.ini_options]` (junitxml addopts) · `vitest.config.ts` (junit reporter) · `ruff.toml` · `biome.json` · `tsconfig.json` |
| **Quick run command** | `.venv\Scripts\python.exe -m pytest tests/ci -q` (Nyquist regression tests) |
| **Full suite command** | Ordered bridge chain: `.venv\Scripts\python.exe -m pytest tests/ -q -k export` → `npx vitest run` → `.venv\Scripts\python.exe -m pytest tests/ -q` → `npx tsc --noEmit` → `node scripts/assert-zero-skips.mjs fixtures/bridge/pytest-junit.xml fixtures/bridge/vitest-junit.xml` |
| **Estimated runtime** | ~6 s (pytest 0.9 s + vitest 0.6 s + tsc ~3 s + zero-skip <1 s) |

---

## Sampling Rate

- **After every task commit:** Run `.venv\Scripts\python.exe -m pytest tests/ -q -k <contract>` (targeted) or full `pytest tests/ -q`
- **After every plan wave:** Run the full ordered bridge chain (above)
- **Before `/gsd-verify-work`:** Full suite must be green, skipped == 0
- **Max feedback latency:** 6 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-checkpoint | 01 | 1 | — (supply gate T-01-SC) | T-01-SC | Package legitimacy [ASSUMED] approval before install | human-check | (human gate — resolved « Packages confirmés » 2026-08-29) | ✅ | ✅ green |
| 01-01-tracer | 01 | 1 | DM-01, DM-05 | T-01-01 | StyleSpec strict both sides, bounds anti-DoS | unit + bridge | `.venv\Scripts\python.exe -m pytest tests/domain/test_style_spec.py tests/bridge/test_style_spec_bridge.py -q` + `npx vitest run style-spec` | ✅ | ✅ green |
| 01-01-harness | 01 | 1 | DM-01, DM-05 | T-01-02 | Shared rejection harness, no message-text parity | unit | `.venv\Scripts\python.exe -m pytest tests/ -q -k accent` + rejection test.each in `style-spec.spec.ts` | ✅ | ✅ green |
| 01-02-T1 | 02 | 2 | DM-02 | T-01-03 | Closed vocabulary, invariant 8–12, same-commit lock | unit + bridge | `.venv\Scripts\python.exe -m pytest tests/domain/test_vocabulary.py tests/bridge/test_vocabulary_bridge.py -q` + `npx vitest run vocabulary` | ✅ | ✅ green |
| 01-02-T2 | 02 | 2 | DM-02 | T-01-03 | MotionRecipe strict, disco-spin rejected | unit | `.venv\Scripts\python.exe -m pytest tests/domain/test_recipe.py -q` | ✅ | ✅ green |
| 01-02-T3 | 02 | 2 | DM-05 | T-01-04 | zod mirror parity, WR-06 pinned asymmetry | bridge | `.venv\Scripts\python.exe -m pytest tests/bridge/test_recipe_bridge.py -q` + `npx vitest run recipe` | ✅ | ✅ green |
| 01-03-T1 | 03 | 3 | DM-03 | T-01-05 | AssetSpec strict, hashes closed 2-field | unit | `.venv\Scripts\python.exe -m pytest tests/domain/test_asset.py -q` | ✅ | ✅ green |
| 01-03-T2 | 03 | 3 | DM-05 | T-01-06 | zod mirror, STY-03 pin, shared harness (20 cases) | bridge | `.venv\Scripts\python.exe -m pytest tests/bridge/test_asset_bridge.py -q` + `npx vitest run asset-spec` | ✅ | ✅ green |
| 01-04-T1 | 04 | 4 | DM-04 | T-01-07/08/09 | License structural (LIC-01/02), IN-08, WR-01, determinism | unit | `.venv\Scripts\python.exe -m pytest tests/domain/test_pack.py -q` | ✅ | ✅ green |
| 01-04-T2 | 04 | 4 | DM-05 | T-01-07/08/09 | zod mirror collect-all, shared harness (10 cases) | bridge | `.venv\Scripts\python.exe -m pytest tests/bridge/test_pack_bridge.py -q` + `npx vitest run pack-manifest` | ✅ | ✅ green |
| 01-05-T1 | 05 | 5 | DM-05 | T-01-10/11 | verify.yml structural invariants (12 steps §3.6, no continue-on-error, contents:read, zero-skip gate last) | integration (read-only parser) | `.venv\Scripts\python.exe -m pytest tests/ci/test_verify_workflow.py -q` | ✅ (added by audit 2026-08-31) | ✅ green |
| 01-05-T2 | 05 | 5 | DM-05 | T-01-11 | README ↔ CI byte-for-byte parity (§3.6) | integration (read-only parser) | `.venv\Scripts\python.exe -m pytest tests/ci/test_readme_ci_parity.py -q` | ✅ (added by audit 2026-08-31) | ✅ green |
| 01-05-T3 | 05 | 5 | DM-05 | T-01-11 | Fresh-checkout: ordered chain green from clone, skipped == 0 | manual-only (one-shot) | see Manual-Only table | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* (pytest + vitest + junitxml + zero-skip gate were installed by plan 01-01 itself; no Wave 0 stubs needed.)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Fresh-checkout proof: full ordered chain green from a temp clone, `fixtures/bridge/` absent before export step | DM-05 | One-shot runtime proof by nature (clone + full env install); permanently enforced thereafter by the CI `verify` job on every push | Executed 2026-08-29 (12/12 steps exit 0, skipped == 0, temp clone deleted — see 01-05-SUMMARY.md). Re-run optionally after major tooling changes: clone repo to temp dir, venv + `pip install -e ".[dev]"` + `npm ci`, then run the 12 verify.yml steps in order. |
| Package legitimacy checkpoint (pydantic, pytest, ruff, zod, typescript, vitest, biome, @types/node) | T-01-SC | Human approval gate — not automatable | Completed 2026-08-29 (« Packages confirmés »), recorded in 01-01-SUMMARY.md. |

---

## Validation Audit 2026-08-31

| Metric | Count |
|--------|-------|
| Gaps found | 2 |
| Resolved | 2 |
| Escalated | 0 |

**Gaps resolved (gsd-nyquist-auditor, read-only mandate respected — `verify.yml` and `README.md` byte-identical post-fix):**

1. **verify.yml structural invariants** (plan 01-05 T1, DM-05) — verified ad-hoc at execution time only (PyYAML one-shot + manual greps), no committed regression test → **`tests/ci/test_verify_workflow.py`** (10 tests: single job on ubuntu-latest, triggers, permissions contents:read, setup actions pinned, quoted `pip install -e ".[dev]"`, `npm ci` (install forbidden), §3.6 ordered sequence, zero-skip gate last with both junitxml paths, no continue-on-error/if:).
2. **README ↔ CI byte-for-byte parity** (plan 01-05 T2, DM-05) — verified ad-hoc at execution time only → **`tests/ci/test_readme_ci_parity.py`** (1 test: ordered run-list from verify.yml searched sequentially inside README Quickstart fenced blocks only).

Both test files are mutation-validated (8 adversarial mutations on temp copies, all flipped ≥ 1 assertion).

Post-fix verification: full suite **498 pytest** (485 baseline + 13 new) + **156 vitest**, 0 skipped; ruff/biome/tsc green; `git diff --exit-code` empty on `verify.yml` and `README.md`.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — infra installed in-phase by 01-01)
- [x] No watch-mode flags
- [x] Feedback latency < 6 s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-31
