---
phase: 01-contrats-de-donn-es-fronti-re-pydantic-zod-reconstruction
reviewed: 2026-08-29T12:00:00Z
depth: standard
files_reviewed: 44
files_reviewed_list:
  - .github/workflows/verify.yml
  - biome.json
  - fixtures/rejection-cases/asset-spec.json
  - fixtures/rejection-cases/pack-manifest.json
  - fixtures/rejection-cases/recipe.json
  - fixtures/rejection-cases/style-spec.json
  - lottie_forge/__init__.py
  - lottie_forge/domain/__init__.py
  - lottie_forge/domain/_shared.py
  - lottie_forge/domain/asset.py
  - lottie_forge/domain/pack.py
  - lottie_forge/domain/recipe.py
  - lottie_forge/domain/style.py
  - lottie_forge/domain/vocabulary.py
  - package.json
  - pyproject.toml
  - ruff.toml
  - scripts/assert-zero-skips.mjs
  - src/rpc/contracts/asset-spec.schema.ts
  - src/rpc/contracts/asset-spec.spec.ts
  - src/rpc/contracts/pack-manifest.schema.ts
  - src/rpc/contracts/pack-manifest.spec.ts
  - src/rpc/contracts/recipe.schema.ts
  - src/rpc/contracts/recipe.spec.ts
  - src/rpc/contracts/rejection-cases.ts
  - src/rpc/contracts/style-spec.schema.ts
  - src/rpc/contracts/style-spec.spec.ts
  - src/rpc/contracts/vocabulary.schema.ts
  - src/rpc/contracts/vocabulary.spec.ts
  - tests/bridge/fixtures.py
  - tests/bridge/rejection_loader.py
  - tests/bridge/test_asset_bridge.py
  - tests/bridge/test_pack_bridge.py
  - tests/bridge/test_recipe_bridge.py
  - tests/bridge/test_style_spec_bridge.py
  - tests/bridge/test_vocabulary_bridge.py
  - tests/conftest.py
  - tests/domain/test_asset.py
  - tests/domain/test_pack.py
  - tests/domain/test_recipe.py
  - tests/domain/test_style_spec.py
  - tests/domain/test_vocabulary.py
  - tsconfig.json
  - vitest.config.ts
findings:
  critical: 0
  warning: 6
  info: 10
  total: 16
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-08-29T12:00:00Z
**Depth:** standard
**Files Reviewed:** 44
**Status:** issues_found

## Summary

The Phase-1 contract layer (Pydantic strict models in `lottie_forge/domain/`, zod ^4 `strictObject` mirrors in `src/rpc/contracts/`, shared rejection fixtures, 12-step CI bridge chain) is functionally sound. Adversarial verification performed:

- **Pydantic↔zod parity** — every regex, numeric bound, array bound, `max_length`, and error-path convention was cross-checked field-by-field across all 5 contract pairs. No drift found. The documented WR-06 asymmetry (zod `z.number().int()` accepts integral floats; Pydantic strict rejects) is correctly pinned and tested on both halves.
- **Collect-all validators** — the Python `ValidationError.from_exception_data` strategy and the zod `.superRefine` strategy produce equivalent issue paths for all 10 shared pack-manifest rejection fixtures, including the IN-08 first-occurrence + duplicate-index double emission (both sides emit it identically).
- **Constraint compliance** — closed 10-id motion vocabulary is single-sourced (`vocabulary.py` + `vocabulary.schema.ts`, same-commit structural scan in place); no SMIL/CSS animation fields anywhere; no `dict[str, Any]` crosses the production Pydantic↔zod boundary (the only `dict[str, Any]` lives inside test-fixture loaders, which is acceptable); no `<text>`/raster concerns apply at this layer.
- **Security** — no injection surface (fixed-path file reads via whitelisted `CONTRACT_FILES`, no eval/shell/SQL), no secrets, no ReDoS (all patterns are anchored with linear-backtracking structure; the Rust regex engine behind pydantic-core is linear-time by guarantee; the JS patterns backtrack linearly because the trailing literal branch fails in O(1) per position).
- **CI gate** — the 12-step chain has no `continue-on-error`/`if: always()`; re-import tests are `skipif`-gated on artifact presence but CI ordering makes the skip unreachable; the zero-skip script's regex correctly targets `<testsuites?>` opening tags for both pytest and vitest junit emitters.

**No Critical issues.** 6 Warnings (test-reliability gaps, single-source-of-truth violations in fixtures, CI reproducibility, misleading documentation that contradicts actual behavior) and 10 Info items were found. The Warnings should be fixed before Phase 2 builds on this substrate.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Rejection harnesses silently run zero tests if the shared JSON is emptied

**Files:** `tests/bridge/rejection_loader.py:47-72`, `src/rpc/contracts/rejection-cases.ts:42-65`, `tests/domain/test_style_spec.py:120-123`, `src/rpc/contracts/style-spec.spec.ts:81-96` (same pattern in all 4 spec.ts and all 3 bridge test modules)

**Issue:** Both harnesses feed `it.each(...)` / `@pytest.mark.parametrize` from the shared JSON. If a rejection-case file is ever truncated to `[]`, the loader succeeds, `it.each` registers **zero** tests, and the suite passes green. The zero-skip gate (`scripts/assert-zero-skips.mjs`) only counts `skipped="N" > 0` — it cannot detect *absent* tests. This is exactly the "half-silent bridge" failure mode the doctrine (§4.2, §1.8) is designed to prevent, one level down: not a skip, but a silent disappearance of 13–20 rejection probes per contract.

**Fix:** Assert the case list is non-empty (and ideally pinned to a minimum count) on both sides:

```ts
// rejection harness, before it.each
const cases = loadRejectionCases("style-spec");
it("rejection fixture file is non-empty (harness cannot silently vanish)", () => {
  expect(cases.length).toBeGreaterThanOrEqual(10);
});
```

```python
# pytest mirror
def test_rejection_fixture_file_is_non_empty() -> None:
    assert len(_REJECTION_CASES) >= 10
```

### WR-02: Test imports depend on implicit namespace packages + `python -m pytest`; plain `pytest` fails collection

**Files:** `tests/bridge/test_asset_bridge.py:31-33`, `tests/bridge/test_style_spec_bridge.py:30-32`, `tests/domain/test_asset.py:52-55`, `tests/domain/test_pack.py:63`, `tests/conftest.py:28-33`

**Issue:** There is no `tests/__init__.py`. Imports like `from tests.bridge.rejection_loader import load_rejection_cases` resolve only because `python -m pytest` inserts the CWD (repo root) into `sys.path`, letting Python treat `tests/` and `tests/bridge/` as implicit namespace packages. Running the console-script `pytest` from the repo root does **not** put the repo root on `sys.path` (pytest prepends each module's basedir — `tests/bridge/` — instead), so collection fails with `ModuleNotFoundError: tests`. Additionally, the import style is mixed *within the same files*: `from fixtures import make_asset` (conftest `sys.path` hack) sits next to `from tests.bridge.fixtures import ...` (namespace-package path) in `test_asset_bridge.py`.

**Fix:** Pick one canonical import route for the bridge fixtures — either consistently use the conftest-registered `fixtures` module for everything (move `rejection_loader` imports through it too), or add `tests/__init__.py` + `tests/bridge/__init__.py` and use `from tests.bridge.fixtures import ...` uniformly. Document that the suite requires `python -m pytest` if the namespace-package route is kept.

### WR-03: Two divergent `make_recipe` fixture builders; domain one's "single fixture source" claim is false

**Files:** `lottie_forge/domain/recipe.py:27-30,85-100`, `tests/bridge/fixtures.py:73-94`

**Issue:** `lottie_forge/domain/recipe.py` declares `make_recipe` with the docstring claim *"``make_recipe`` is the single fixture source for both bridge test suites (Python export and TypeScript import)"* and a default of `theme_anchors=[]`. The bridge suites actually use `tests/bridge/fixtures.py::make_recipe`, which has a **different** default (`theme_anchors=["primary"]`). Two same-named builders with divergent defaults in a project whose core doctrine is "single source of truth, zero drift" is a standing drift trap: a future change to bridge defaults (e.g., `duration_ms`) will silently diverge from the domain builder and vice versa.

**Fix:** Have `tests/bridge/fixtures.py::make_recipe` delegate to the domain builder and override explicitly:

```python
from lottie_forge.domain.recipe import make_recipe as _domain_make_recipe

def make_recipe(recipe_id: RecipeId = "fade") -> MotionRecipe:
    recipe = _domain_make_recipe(recipe_id)
    return recipe.model_copy(update={"theme_anchors": ["primary"]})
```

and correct (or delete) the false "single fixture source" claim in `recipe.py`.

### WR-04: `ruff` is unpinned in CI — the lint gate is not reproducible

**Files:** `pyproject.toml:16-19`, `.github/workflows/verify.yml:74-75`

**Issue:** `pip install -e ".[dev]"` installs `ruff` at the latest published version on every CI run (Python tooling has no lockfile in this repo), then step 06 runs `ruff check .` with `select = ["E", "F", "I", "UP"]`. New ruff releases routinely add rules within existing categories; a green `main` can start failing CI the next morning with zero repo changes. The TS side is protected by the committed `package-lock.json` + `npm ci`; the Python side has no equivalent.

**Fix:** Pin the linter exactly like the runtime dependency (`ruff==0.X.Y` in the `dev` extra, matching the locally used version), or commit a `requirements-dev.txt` / lock artifact and install from it in the workflow.

### WR-05: `test_vocabulary_bridge.py` documents a bridge step 3 (`-k invariant`) that matches zero tests

**Files:** `tests/bridge/test_vocabulary_bridge.py:9-10,30-52`

**Issue:** The module docstring specifies the ordered chain step ``python -m pytest tests/bridge/test_vocabulary_bridge.py -k invariant`` as the Python-side re-validation of the exported artifact. No test name in the file (or anywhere in the repo) contains "invariant" — running the documented command deselects everything and pytest exits with code 5 ("no tests ran"). The round-trip assertion actually lives inside `test_export_vocabulary` itself. A contributor following the documented chain hits a confusing hard stop, and the "step 3" of the vocabulary bridge does not exist as an independently runnable stage.

**Fix:** Either add the step-3 test the docstring promises (e.g., `test_invariant_vocabulary_round_trip` that re-reads the artifact and deep-equals `RECIPE_IDS`), or rewrite the docstring to state that the round-trip check is embedded in the export test and the full-suite run is the re-validation stage.

### WR-06: Triple-duplicate test comment contradicts the validator's actual collect-all behavior

**Files:** `tests/domain/test_pack.py:392-411`, `lottie_forge/domain/pack.py:241-261`

**Issue:** The comment in `test_triple_duplicate_asset_id_yields_one_issue_per_pair_in08` states *"idx 1 (dup with 0) and idx 2 (dup with 0 and 1) both surface, but idx 0 itself does not."* That is false: the validator's first-occurrence detail (`pack.py:244-261`) emits `loc=("assets", 0, "asset_id")` when idx 1 is processed (and again at idx 2). The test passes only because it asserts presence of idx 1/2 without asserting anything about idx 0 — while the sibling 2-duplicate test (`test_pack.py:389`) explicitly asserts idx 0 **is** flagged. The comment sets up future maintainers to "fix" the validator (removing first-occurrence emission) and break the 2-dup contract, or to write assertions based on a wrong mental model.

**Fix:** Correct the comment to match reality ("the first occurrence is also flagged once per duplicate discovery, so idx 0 surfaces twice for a triple") and, ideally, pin the actual behavior:

```python
assert ("assets", 0, "asset_id") in actual_locs  # first occurrence IS flagged
```

## Info

### IN-01: Dead `__PATTERNS__` re-export tuple

**File:** `lottie_forge/domain/pack.py:90-93`

**Issue:** `__PATTERNS__` is declared "so the zod mirror and the rejection fixture can import from the same constant", but nothing in the repo imports it and it is not in `__all__` — pure dead code with a misleading rationale comment.

**Fix:** Delete it, or wire it into an actual parity test if the intent was real.

### IN-02: Dead defensive conditional in first-occurrence error detail

**File:** `lottie_forge/domain/pack.py:255-259`

**Issue:** `input=self.assets[first_idx].asset_id if first_idx < len(self.assets) else None` — `first_idx` always indexes an existing asset (it was stored from a prior loop iteration), so the `else None` branch is unreachable noise.

**Fix:** `input=self.assets[first_idx].asset_id`.

### IN-03: `get_args` exported in vocabulary `__all__`

**File:** `lottie_forge/domain/vocabulary.py:103-109`

**Issue:** A stdlib `typing` helper is re-exported as public API of a domain module. No consumer imports it from here (tests import it from `typing` directly). Odd public surface.

**Fix:** Remove `"get_args"` from `__all__` (and the import, if unused locally).

### IN-04: Cluster of stale/misleading docstrings about determinism, defaults, and short-circuiting

**Files:** `lottie_forge/domain/pack.py:56-60,192-194`, `src/rpc/contracts/pack-manifest.schema.ts:117`, `tests/bridge/fixtures.py:134-139`

**Issue:** (a) `pack.py` claims "All numeric defaults are fractional where possible (cost_eur=0.5 not 1.0)" but `PackTotals` fields have **no defaults**. (b) Both the Python and TS collect-all comments claim the count check "short-circuits" the per-asset checks — it does not; all three invariants always run (which is correct collect-all behavior; only the comment is wrong). (c) `_make_asset_for_pack`'s docstring claims each pack asset's `lottie_sha256` is "unique" — both pack assets share the identical `_ASSET_HASH_LOTTIE` constant.

**Fix:** Update the three docstrings/comments to describe what the code actually does.

### IN-05: Specs use bare `__dirname` in an ESM package; `rejection-cases.ts` does it correctly

**Files:** `src/rpc/contracts/style-spec.spec.ts:25` (same in `recipe.spec.ts:29`, `asset-spec.spec.ts:40`, `pack-manifest.spec.ts:39`, `vocabulary.spec.ts:20`), `src/rpc/contracts/rejection-cases.ts:22-24`

**Issue:** `package.json` is `"type": "module"`, where `__dirname` is not defined. The five spec files rely on vitest's module-runner shim (works today, and `@types/node` silences tsc), while `rejection-cases.ts` correctly derives the path from `import.meta.url`. The inconsistency breaks the moment a spec helper is evaluated outside vitest.

**Fix:** Use the `fileURLToPath(import.meta.url)` derivation in the specs too, matching `rejection-cases.ts`.

### IN-06: `TOKEN_NAME_PATTERN` regex literal duplicated across TS modules

**Files:** `src/rpc/contracts/recipe.schema.ts:21`, `src/rpc/contracts/style-spec.schema.ts:17`

**Issue:** The identical kebab regex is declared in two sibling schema modules (the structural same-commit scan only guards `RECIPE_IDS`). A future tweak to one copy silently diverges the token contract between recipe and style schemas.

**Fix:** Hoist the shared token patterns (kebab, maybe hex) into a small `tokens.schema.ts` and import from both, mirroring the Python `_shared.py` structure.

### IN-07: Package facade incomplete — only style models are re-exported

**Files:** `lottie_forge/domain/__init__.py:8-27`, `lottie_forge/__init__.py:9`

**Issue:** `lottie_forge/domain/__init__.py` exports only the style family; `AssetSpec`, `PackManifest`, `MotionRecipe`, and the vocabulary are absent, and the top-level `__all__` is empty. Every consumer must deep-import, which the module docstrings do not advertise.

**Fix:** Re-export the five contract families from `lottie_forge/domain/__init__.py` (or state explicitly that deep imports are the convention).

### IN-08: Stale `type: ignore` comment and misnamed fixture case

**Files:** `tests/domain/test_recipe.py:45`, `fixtures/rejection-cases/style-spec.json:181`

**Issue:** (a) `# type: ignore[attr-defined]  -- populated in Task 2 GREEN` guards an import that has existed since this phase shipped — stale TDD scaffolding. (b) `case_id: "dm01-style-version-empty"` actually tests `"1..0"` (missing segment), not the empty string — misleading probe name in the shared fixture consumed by both engines.

**Fix:** Drop the ignore comment; rename the case_id to `dm01-style-version-missing-segment` (both sides read IDs dynamically, so the rename is safe).

### IN-09: Comment misstates what `verbatimModuleSyntax` does

**File:** `tests/domain/test_vocabulary.py:219-221`

**Issue:** The comment says `verbatimModuleSyntax` "rewrites bare specifiers with the `.js` extension at type-check time" — it does no such thing. NodeNext *resolution* requires explicit `.js` specifiers; `verbatimModuleSyntax` only forbids eliding type-only import/export forms.

**Fix:** Reword: "NodeNext resolution requires the `.js` specifier; both forms must point at `vocabulary.schema`."

### IN-10: Inconsistent unknown-contract diagnostics between the two loaders

**Files:** `tests/bridge/rejection_loader.py:56`, `src/rpc/contracts/rejection-cases.ts:44-45`

**Issue:** The TS loader throws a descriptive `Unknown rejection contract: ${contract}`; the Python loader raises a bare `KeyError` from dict access for the same failure mode. The "mirror" loaders should fail identically legibly.

**Fix:** `raise KeyError(f"Unknown rejection contract: {contract!r} (expected one of {sorted(CONTRACT_FILES)})")`.

---

_Reviewed: 2026-08-29T12:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
