---
phase: quick-260831-jnx
plan: 01
type: execute
subsystem: review-hardening
tags: [02-review, IN-01, IN-02, IN-03, IN-04, IN-06, IN-07, hygiene, dedup]
dependency_graph:
  requires: []
  provides:
    - "IN-01 IN-02 IN-03 IN-04 IN-06 IN-07 applied per adjudication"
    - "vocabulary.py dead surface removed (get_args re-export)"
    - "render.py single-read catalogue loader (IN-07)"
    - "vitest IN-08 probe dedup (IN-06, 157 -> 156)"
  affects:
    - "lottie_forge/domain/vocabulary.py"
    - "lottie_forge/loading/style.py"
    - "lottie_forge/prompts/render.py"
    - "tests/domain/test_pack.py"
    - "tests/prompts/test_prompt_fixture.py"
    - "src/rpc/contracts/pack-manifest.spec.ts"
tech-stack:
  added: []
  patterns:
    - "single-read (text, hash) wrappers: embarqué == hashé == committé by construction"
    - "module-level imports for cross-function dependencies (no function-local pydantic imports)"
    - "tmp_path isolation for on-disk mutation tests (no stray files in packaged dirs)"
key-files:
  created: []
  modified:
    - "lottie_forge/domain/vocabulary.py"
    - "lottie_forge/loading/style.py"
    - "lottie_forge/prompts/render.py"
    - "tests/domain/test_pack.py"
    - "tests/prompts/test_prompt_fixture.py"
    - "src/rpc/contracts/pack-manifest.spec.ts"
decisions:
  - "IN-01: get_args dead-surface removal is limited strictly to the import line + __all__ entry; no docstring/schéma/validateur touched (vocabulary.py is a locked contract module)."
  - "IN-02: TypeAdapter import moved to module-level in alphabetical order (pydantic < yaml); stale 'TypeError (or similar)' comment corrected to name pydantic.ValidationError; no behaviour change."
  - "IN-03: test_triple_duplicate comment rewritten to reflect that idx 0 surfaces via the first-occurrence issue; only the duplicate indices (1, 2) are asserted (no assertion change)."
  - "IN-04: synthetic template isolation moved from RECIPE_PICKER_TEMPLATE_PATH.parent (packaged templates/) to tmp_path; try/finally unlink kept for symmetry; RECIPE_PICKER_TEMPLATE_PATH import retained (used by 2 other tests)."
  - "IN-06: vitest inline IN-08 collect-all block deleted (55 lines); coverage intact via shared case in08-doublons-asset-id of the it.each harness (expect_paths == [assets,0,asset_id] + [assets,1,asset_id]). Vitest count: 157 -> 156 (expected, documented in plan)."
  - "IN-07: load_catalogue_text_and_sha added as a single-read wrapper (one path.read_bytes(), one normalize_lf, both text and sha derived from the same buffer). load_catalogue_prompt_fixture delegates (signature unchanged for 4 call sites). Removed unused load_catalogue_fixture import (ruff F401)."
metrics:
  duration: 6 min
  completed_date: 2026-08-31
  tasks: 3
  commits: 3
  files_modified: 6
  insertions: 58
  deletions: 80
  actuals:
    tokens: 18404
    tasks: 3
    commits: 3
status: complete
---

# Quick 260831-jnx Plan 01: Hardening résiduel 02-REVIEW IN-01/02/03/04/06/07 — Summary

## One-liner

Applied 6 review Info findings (IN-01 dead re-export, IN-02 stale comment + function-local pydantic import, IN-03 misleading test comment, IN-04 stray template file in packaged dir, IN-06 duplicate IN-08 probe in vitest, IN-07 double-read divergence in catalogue loader) exactly per the adjudication: zero product behaviour change, 485 pytest / 156 vitest verts, all locked contracts/fixtures/verify.yml byte-identical.

## Per-Task Execution

| # | Task | Commit | Files | Verification evidence |
|---|------|--------|-------|-----------------------|
| 1 | IN-02 + IN-03 + IN-04 | `9022e82` | `lottie_forge/loading/style.py`, `tests/domain/test_pack.py`, `tests/prompts/test_prompt_fixture.py` | `pytest tests/domain/test_pack.py tests/prompts/test_prompt_fixture.py` → 66 passed; `ruff check lottie_forge tests` → All checks passed; `Select-String "or similar"` on style.py → no match; targeted `test_residual_placeholder_guard` → 1 passed; `Test-Path templates/_unsupported_template.md` → False (no stray file after run). |
| 2 | IN-01 (vocabulary.py) | `6dd8c65` | `lottie_forge/domain/vocabulary.py` | `python -c "from lottie_forge.domain import vocabulary; assert 'get_args' not in vocabulary.__all__"` → `all_len 7`; `Select-String 'from typing import .*get_args'` and `Select-String '"get_args",'` on vocabulary.py → both empty; `pytest tests/domain/test_vocabulary.py tests/bridge/test_vocabulary_bridge.py` → 38 passed; `git diff --stat` → 1 file / 1 insertion / 2 deletions (exactly the import line + the `__all__` entry). |
| 3 | IN-06 + IN-07 | `b9b9726` | `src/rpc/contracts/pack-manifest.spec.ts`, `lottie_forge/prompts/render.py` | `node -e "..."` expect_paths check → `OK: expect_paths match` ([["assets",0,"asset_id"],["assets",1,"asset_id"]] verbatim on the shared case); `npx vitest run` → 156 passed (9 files, expected 157 − 1 dedup block); `pytest tests/prompts/test_prompt_fixture.py` → 13 passed (incl. the verbatim-equals-hashed-bytes lock); `ruff check lottie_forge` → All checks passed (after removing the now-unused `load_catalogue_fixture` import — F401 was firing); `biome check src/rpc/contracts/pack-manifest.spec.ts` → No fixes applied; `tsc --noEmit` → 0 errors. |

## Final Test Counts vs Baselines

| Suite | Expected | Actual | Delta | Status |
|-------|----------|--------|-------|--------|
| pytest | 485 | 485 | 0 | PASSED |
| vitest | 156 (157 − 1 dedup) | 156 | 0 | PASSED — confirms the planned dedup, not a regression |
| ruff | green | green | — | PASSED |
| biome | green | green | — | PASSED |
| tsc --noEmit | green | green | — | PASSED |

The vitest 157 → 156 drop is the IN-06 dedup documented in PLAN.md (the inline IN-08 collect-all block is removed, coverage taken over by the shared `in08-doublons-asset-id` case in the `it.each` harness — same 2 expect_paths, same payload intent, asserted in membership by the harness loop). Verified by node script that the shared case's `expect_paths` is exactly `[["assets",0,"asset_id"],["assets",1,"asset_id"]]` — i.e. the same 2 assertions the inline block made. This is not a regression; it is the planned consolidation.

## Absolute-Constraint Gate Audit

| Constraint | Expected | Actual | Status |
|------------|----------|--------|--------|
| `git diff --exit-code -- .github/workflows/verify.yml` | empty | empty (exit 0) | PASSED |
| `git diff --exit-code -- fixtures/rejection-cases/catalogue.json fixtures/recipe-catalogue/catalogue.json fixtures/recipe-catalogue/coverage-map.json fixtures/style-specs/example-style/style.yaml` | empty | empty (exit 0) | PASSED |
| `git diff --exit-code -- "src/rpc/contracts/*.schema.ts"` | empty | empty (exit 0) | PASSED |
| `git diff --name-only -- lottie_forge/domain/` (over the 3-commit range `HEAD~3..HEAD`) | lists ONLY `vocabulary.py` | `lottie_forge/domain/vocabulary.py` | PASSED |
| `fixtures/rejection-cases/pack-manifest.json` (IN-08 case source-of-truth) | untouched | untouched (`git diff --stat` over HEAD~3..HEAD → no output) | PASSED |
| `lottie_forge/loading/catalogue.py` (IN-07 scope-limited wrapper in render.py only) | untouched | untouched (`git diff --stat` over HEAD~3..HEAD → no output) | PASSED |

IN-01 strict scope honoured: vocabulary.py diff is 1 file / +1 / −2, exactly the import line removal (`from typing import Final, Literal, get_args` → `from typing import Final, Literal`) and the `__all__` entry removal. No docstring (RecipeId/ThemeAnchorId blocks reference `typing.get_args` and stay byte-identical), no schema, no Literal, no validator touched.

## Deviations from Plan

**None — plan executed exactly as written.**

No Rule 1 (bug auto-fix), Rule 2 (missing critical functionality), Rule 3 (blocking issue), or Rule 4 (architectural decision) were triggered. No auth gates encountered. No stubs, TODOs, FIXMEs, or placeholder text were introduced. No tests added or removed beyond the documented IN-06 dedup. All 6 findings applied exactly per the adjudication in 02-REVIEW.md and PLAN.md; no scope creep.

## Stub Tracking

None. No hardcoded empty values, placeholder text, or mocked data introduced.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. All 6 findings are doc/test/refactor hardening on existing surfaces; the T-Q-01 (fixtures tampering), T-Q-02 (false comments), T-Q-03 (double-read divergence) mitigations declared in PLAN.md's threat model are all closed by this execution: fixtures are untouched (T-Q-01), IN-02/IN-03 comments now match the code (T-Q-02), IN-07 wrapper enforces single-read (T-Q-03).

## Bridge Chain Verification

`tests/bridge/` (the byte-identical Py↔TS reimport gate) → 128 passed in 0.44s. No `fixtures/bridge/*.from-*.json` artifact drift; `load_catalogue_prompt_fixture` signature preserved so the asset round-trip in `test_asset_content_hashes_roundtrip_with_real_fixture_shas` (which uses both the loader and the renderer) keeps the closed loop on `catalogue_sha256`.

## Self-Check

```bash
[ -f "lottie_forge/domain/vocabulary.py" ] && echo "FOUND" || echo "MISSING"
[ -f "lottie_forge/loading/style.py" ] && echo "FOUND" || echo "MISSING"
[ -f "lottie_forge/prompts/render.py" ] && echo "FOUND" || echo "MISSING"
[ -f "tests/domain/test_pack.py" ] && echo "FOUND" || echo "MISSING"
[ -f "tests/prompts/test_prompt_fixture.py" ] && echo "FOUND" || echo "MISSING"
[ -f "src/rpc/contracts/pack-manifest.spec.ts" ] && echo "FOUND" || echo "MISSING"
git log --oneline | grep -E "9022e82|6dd8c65|b9b9726"
```

All 6 files FOUND, all 3 commit hashes present. **Self-Check: PASSED**.