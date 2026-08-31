---
phase: 02
slug: style-verrouill-catalogue-de-recettes
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-31
reconstructed: true
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> **Reconstructed (State B)** from PLAN/SUMMARY artifacts + live test-run audit — no VALIDATION.md existed at phase close.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.1.1 (Python 3.12, project venv) + vitest 4 (Node 20) |
| **Config file** | `pyproject.toml` (pytest) / `vitest.config.ts` (vitest) |
| **Quick run command** | `.venv\Scripts\python.exe -m pytest tests/ -q` |
| **Full suite command** | `.venv\Scripts\python.exe -m pytest tests/ -q` + `npx vitest run` + `npx tsc --noEmit` + `.venv\Scripts\python.exe -m ruff check .` + `npx @biomejs/biome check .` |
| **Estimated runtime** | ~5 seconds total (pytest 1.3s + vitest 3.2s) |

**Note:** the `python` on PATH is not the project venv — always invoke via `.venv\Scripts\python.exe -m pytest`. The bridge ordered chain (`pytest -k export` → `npx vitest run` → `pytest tests/ -q`) is the canonical full verification sequence (CI steps 08–10 of `verify.yml`, unchanged — D-18).

---

## Sampling Rate

- **After every task commit:** Run `.venv\Scripts\python.exe -m pytest tests/ -q`
- **After every plan wave:** Run full suite (pytest + vitest + tsc + ruff + biome)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | IN-02 / T-02-SC | T-02-SC | PyYAML supply-chain legitimacy gate before install | human + smoke | `.venv\Scripts\python.exe -c "import yaml; assert tuple(int(p) for p in yaml.__version__.split('.')[:2]) >= (6, 0)"` | ✅ | ✅ green |
| 02-01-02 | 01 | 1 | STY-01 | T-02-01/02/03/04 | yaml.safe_load only; REPO_ROOT-constant paths; LF-normalised sha256 reproducible outside factory; style_id gate (absent/non-kebab/diverging → reject) | unit + bridge | `.venv\Scripts\python.exe -m pytest tests/bridge/test_style_fixture_bridge.py -q`; `npx vitest run style-fixture` | ✅ | ✅ green |
| 02-01-03 | 01 | 1 | MOT-03 / D-10/D-11 | — | ThemeAnchorId closed Literal of exactly 6 labels, lockstep py↔ts, "logo" rejected | unit | `.venv\Scripts\python.exe -m pytest tests/domain/test_vocabulary.py -q`; `npx vitest run vocabulary` | ✅ | ✅ green |
| 02-02-01 | 02 | 1 | STY-02 | T-02-04/05 | Closed delta-only model: hex/path/svg inexpressible; bounded lists (anti-DoS) | unit | `.venv\Scripts\python.exe -m pytest tests/domain/test_style_refinement.py -q` | ✅ | ✅ green |
| 02-02-02 | 02 | 1 | STY-02 / DM-05 | T-02-05 | zod strictObject mirror, schema-keys parity artifact | unit | `npx vitest run style-refinement`; `npx tsc --noEmit` | ✅ | ✅ green |
| 02-02-03 | 02 | 1 | STY-02 / D-06/D-07/D-08 | T-02-05 | 10 shared rejection cases (sr01–sr10) consumed by pytest parametrize AND vitest it.each — parity of rejection both sides | integration | `.venv\Scripts\python.exe -m pytest tests/domain/test_style_refinement.py -q`; `npx vitest run style-refinement` | ✅ | ✅ green |
| 02-03-01 | 03 | 2 | MOT-04 / STY-01 / D-16 | T-02-07 | ContentHashes closed at exactly 4 fields (5th key `dotlottie_sha256` rejected); malformed digests rejected on new fields, both sides | unit | `.venv\Scripts\python.exe -m pytest tests/domain/test_asset.py -q`; `npx vitest run asset-spec` | ✅ | ✅ green |
| 02-03-02 | 03 | 2 | MOT-04 | T-02-07 | make_asset/_make_asset_for_pack 4-hash builders + optional override; pack-manifest.json migrated preserving collect-all signatures (in08/totals/mono-style); cases as01–as03 | integration | `.venv\Scripts\python.exe -m pytest tests/bridge/test_asset_bridge.py tests/bridge/test_pack_bridge.py -q`; `npx vitest run` | ✅ | ✅ green |
| 02-04-01 | 04 | 2 | MOT-01/02/03 | T-02-04 | §5.5.3 collect-all invariants: id uniqueness, pack durations 600..1500, ordered intensity, 8..12 recipes, anchors ≥ 1; family stays free string | unit | `.venv\Scripts\python.exe -m pytest tests/domain/test_catalogue.py -q` | ✅ | ✅ green |
| 02-04-02 | 04 | 2 | MOT-04 / D-01/D-03/D-15 | T-02-08 | Bilingual direct load without drift (deep-equal + keys parity + tuple lockstep); catalogue_sha256 in D-03 regime; coverage-map 16 states committed | integration | `.venv\Scripts\python.exe -m pytest tests/bridge/test_catalogue_bridge.py -q`; `npx vitest run catalogue` | ✅ | ✅ green |
| 02-04-03 | 04 | 2 | MOT-04 / D-17 | T-02-08 | Joint load: easing ∉ StyleSpec.easing_curves rejects both sides with path parity; validate_easing_cross pure | integration | `.venv\Scripts\python.exe -m pytest tests/bridge/test_catalogue_bridge.py -q`; `npx vitest run catalogue` | ✅ | ✅ green |
| 02-05-01 | 05 | 3 | MOT-01/02 | T-02-04 | 15 shared catalogue rejection cases (cat01–cat15) in the shared harness, membership of paths only | integration | `.venv\Scripts\python.exe -m pytest tests/bridge/test_catalogue_bridge.py -q`; `npx vitest run catalogue` | ✅ | ✅ green |
| 02-05-02 | 05 | 3 | MOT-02 / D-14 A/B/C | T-02-08 | Blocking coverage audit: no orphan state, no dead recipe, no unknown id; same-commit rule over 4 files (set(catalogue ids) == set(RECIPE_IDS)) | integration | `.venv\Scripts\python.exe -m pytest tests/bridge/test_catalogue_bridge.py tests/domain/test_vocabulary.py -q`; `npx vitest run vocabulary` | ✅ | ✅ green |
| 02-05-03 | 05 | 3 | STY-03 / D-06/D-07/D-08/D-09 | T-02-09 | scan_stale_pins pure + injectable; simulated bump flags PATCH/MINOR/MAJOR with exact scopes; permanent guard: every valid-payload style_ref == current fixture version, scan non-empty | unit | `.venv\Scripts\python.exe -m pytest tests/domain/test_stale_pins.py -q` | ✅ | ✅ green |
| 02-06-01 | 06 | 3 | MOT-04 / D-13 | T-02-02/10 | Two contractual placeholders present once; verbatim embedding (embarqué == hashé == committé); determinism; residual-placeholder guard | unit | `.venv\Scripts\python.exe -m pytest tests/prompts/test_prompt_fixture.py -q` | ✅ | ✅ green |
| 02-06-02 | 06 | 3 | MOT-04 / D-16 | T-02-05 | Manifest-hash loop closed: AssetSpec with real fixture shas round-trips; catalogue_sha on prompt == on asset; make_asset consumed unmodified | integration | `.venv\Scripts\python.exe -m pytest tests/prompts/test_prompt_fixture.py -q` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Phase-wide cross-checks (all green at audit time 2026-08-31):**
- `.venv\Scripts\python.exe -m pytest tests/ -q` → **485 passed**, 0 skipped
- `npx vitest run` → **156 passed** (9 files), 0 skipped
- `.venv\Scripts\python.exe -m ruff check .` → clean · `npx @biomejs/biome check .` → clean · `npx tsc --noEmit` → clean
- `git diff --exit-code -- .github/workflows/verify.yml` → empty (**D-18** upheld)

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* (pytest + vitest were installed in Phase 1; no Wave 0 needed.)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PyYAML package legitimacy on pypi.org | T-02-SC (plan 02-01 Task 1) | One-time supply-chain human gate — cannot be automated at install time | ✅ **Cleared during execution** (human confirmed canonical PyYAML at https://pypi.org/project/PyYAML/, "approved"; PyYAML 6.0.3 installed). No recurring manual step — the automated import/version smoke test covers regressions. |

All other phase behaviors have automated verification.

---

## Validation Audit 2026-08-31

Reconstructed from artifacts (State B): 6 PLAN/SUMMARY pairs audited, requirement→test map built, test infrastructure filesystem-scanned, full suites re-executed live.

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

**Result: `nyquist_compliant: true`** — all 7 phase requirements (STY-01, STY-02 partial, STY-03, MOT-01, MOT-02, MOT-03, MOT-04) have automated verification that exists and runs green.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — infrastructure pre-existing)
- [x] No watch-mode flags
- [x] Feedback latency < 10s (pytest 1.3s / vitest 3.2s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-31
