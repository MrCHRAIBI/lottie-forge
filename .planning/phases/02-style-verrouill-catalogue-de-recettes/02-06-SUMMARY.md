---
phase: 02-style-verrouill-catalogue-de-recettes
plan: 06
subsystem: prompt-fixture / manifest-hash-loop
tags:
  - prompt-fixture
  - system-prompt
  - recipe-picker
  - sha256
  - manifest
  - lf-normalised
  - d-13
  - d-16
  - d-18
  - mot-04
  - content-hashes-4-field
  - verbatim-embedding

# Dependency graph
requires:
  - phase: 02-style-verrouill-catalogue-de-recettes
    plan: 01
    provides: "sha256_hex + normalize_lf single implementation; ThemeAnchorId vocabulary"
  - phase: 02-style-verrouill-catalogue-de-recettes
    plan: 03
    provides: "ContentHashes 4-field Pydantic model + make_asset(content_hashes=None) override"
  - phase: 02-style-verrouill-catalogue-de-recettes
    plan: 04
    provides: "load_catalogue_fixture -> (RecipeCatalogue, catalogue_sha256) + Catalogue loader"
provides:
  - "lottie_forge.prompts.render module (pure): render_recipe_picker_prompt(), load_catalogue_prompt_fixture(), RECIPE_PICKER_TEMPLATE_PATH module constant"
  - "lottie_forge/prompts/templates/recipe_picker.system.md (versioned skeleton with exactly the two contractual placeholders)"
  - "tests/prompts/test_prompt_fixture.py (10 tests: 7 mechanism + 3 manifest-loop)"
  - "ROADMAP critere 5 unlocked — catalogue verbatim + sha are wired into the system prompt AND recordable on AssetSpec.content_hashes.catalogue_sha256"
affects:
  - lottie_forge/prompts/render.py
  - lottie_forge/prompts/templates/recipe_picker.system.md
  - tests/prompts/test_prompt_fixture.py

# Tech tracking
tech-stack:
  added: []  # all Python stdlib; existing pydantic + pyyaml + pytest
  patterns:
    - "Pure-function prompt renderer with module-level template-path constant (T-02-02: no env override, no caller override on the production path)"
    - "Verbatim-embedding discipline: catalogue_text is the LF-normalised raw committed bytes decoded utf-8, never a re-serialised model_dump_json (§5.1 principe 2 — embarqué == hashé == committé)"
    - "Residual-placeholder guard via str.replace + post-substitution '[' / ']' scan (T-02-10 mitigation)"
    - "Single source of fixture truth via make_asset(content_hashes=...) override — no edit to tests/bridge/fixtures.py across this plan, preserving Wave 1 / Wave 3 isolation"
    - "Manifest-loop closure: catalogue_sha256 recorded on the asset == catalogue_sha256 injected into the rendered prompt (ROADMAP critere 5)"

key-files:
  created:
    - "lottie_forge/prompts/__init__.py — subpackage docstring only"
    - "lottie_forge/prompts/render.py — pure renderer + prompt-fixture loader (T-02-02 mitigation, T-02-10 mitigation)"
    - "lottie_forge/prompts/templates/recipe_picker.system.md — versioned skeleton with the two contractual placeholders"
    - "tests/prompts/test_prompt_fixture.py — mechanism suite (7) + manifest loop suite (3), 10 tests total"
  modified: []  # no edit to tests/bridge/fixtures.py, no edit to lottie_forge/loading/*, no edit to .github/workflows/verify.yml

key-decisions:
  - "Template path is a module-level constant (RECIPE_PICKER_TEMPLATE_PATH) derived from the renderer's file location — no env override, no caller-supplied path in the production path. Tests can override via the keyword argument for the malformed-template guard; production callers cannot."
  - "Residual-placeholder guard fires only on a literally malformed template (a leftover '{{...}}' substring after substitution) — the well-formed committed template triggers it zero times. The synthetic-template test exercises the guard via an on-disk copy with {{unsupported}}, never by editing the committed file."
  - "Catalogue text in the prompt is the raw committed bytes, LF-normalised then decoded utf-8 — exactly the bytes the catalogue loader hashed. Re-serialising via model_dump_json would break the hand-verifiability against sha256sum outside the factory (§5.1 #2) and is explicitly forbidden."
  - "load_catalogue_prompt_fixture() returns (catalogue_text, catalogue_sha256) sourced from the same load_catalogue_fixture(...) call, with the decoded text derived from the same LF-normalised bytes the loader hashed. sha256_hex(catalogue_text.encode('utf-8')) == catalogue_sha is asserted by test."
  - "render_recipe_picker_prompt is a pure function — no I/O-network, no globals beyond RECIPE_PICKER_TEMPLATE_PATH. str.replace for both placeholders, no template engine. Two consecutive calls with the same inputs return byte-identical strings."
  - "The 4-field ContentHashes override is consumed via make_asset(content_hashes=...), the optional parameter added by plan 02-03. This plan honours the contract and does NOT touch tests/bridge/fixtures.py — git diff --exit-code -- tests/bridge/fixtures.py is empty by design. Phase 6 will fill the template, zero refactor of the mechanism (D-13)."

patterns-established:
  - "Pure prompt-renderer pattern: a Python module exposing render_*(...) functions that read a committed template-path constant, substitute a closed set of placeholders via str.replace, and raise a loud ValueError on residual placeholders. Phase 6 extends this pattern to other agents (StyleRefiner system prompt etc.) without changing the mechanism."
  - "Verbatim-equals-hashed-bytes test discipline: every prompt-fixture test that uses load_*_prompt_fixture asserts sha256_hex(loaded_text.encode('utf-8')) == loaded_sha as a positive invariant. Future prompt modules copy this assertion to keep the hand-verifiability contract."
  - "Manifest-loop closure test: every prompt-fixture test that materially closes a manifest loop (catalogue_sha on prompt == catalogue_sha on asset) uses the same sha value twice — once as parameter to the renderer, once as field on the ContentHashes override — and asserts equality. The loop is closed on a single value end-to-end."

requirements-completed: [MOT-04]

coverage:
  - id: D1
    description: "Template declares exactly the two contractual placeholders ({{catalogue_json}}, {{catalogue_hash}}) present once each (D-13, §5.5.3 l.151)"
    requirement: MOT-04
    verification:
      - kind: automated
        ref: "python -m pytest tests/prompts/test_prompt_fixture.py::test_template_has_exactly_two_placeholders -v"
        status: pass
    human_judgment: false
  - id: D2
    description: "Renderer is pure (template path is a module constant, no env override, no caller override on the production path — T-02-02)"
    requirement: MOT-04
    verification:
      - kind: automated
        ref: "python -m pytest tests/prompts/test_prompt_fixture.py::test_template_path_is_a_module_constant -v"
        status: pass
    human_judgment: false
  - id: D3
    description: "Rendered prompt embeds the committed catalogue text VERBATIM (no truncation, no reformulation) and the 64-hex sha once each, with zero placeholder residue (§5.1 #2 / D-13 / T-02-10)"
    requirement: MOT-04
    verification:
      - kind: automated
        ref: "python -m pytest tests/prompts/test_prompt_fixture.py::test_rendered_prompt_embeds_full_catalogue_text_and_64hex_hash -v"
        status: pass
    human_judgment: false
  - id: D4
    description: "Residual-placeholder guard: a template carrying a {{unsupported}} token trips a ValueError so a leftover placeholder cannot silently ship to the LLM (T-02-10 mitigation)"
    requirement: MOT-04
    verification:
      - kind: automated
        ref: "python -m pytest tests/prompts/test_prompt_fixture.py::test_residual_placeholder_guard -v"
        status: pass
    human_judgment: false
  - id: D5
    description: "Renderer is deterministic — two calls with the same inputs return byte-identical strings (pre-requisite for Phase-6 snapshot tests and any cache keyed on the rendered prompt)"
    requirement: MOT-04
    verification:
      - kind: automated
        ref: "python -m pytest tests/prompts/test_prompt_fixture.py::test_render_determinism_byte_identical -v"
        status: pass
    human_judgment: false
  - id: D6
    description: "Hash injectability (D-13): the renderer accepts any [a-f0-9]{64} digest and embeds it verbatim — proves the placeholder machinery is wired correctly"
    requirement: MOT-04
    verification:
      - kind: automated
        ref: "python -m pytest tests/prompts/test_prompt_fixture.py::test_renderer_injects_an_arbitrary_hash -v"
        status: pass
    human_judgment: false
  - id: D7
    description: "embarqué==hashé==committé invariant (D-03 / §5.1 #2): sha256_hex of the embedded catalogue text equals the catalogue_sha the loader records"
    requirement: MOT-04
    verification:
      - kind: automated
        ref: "python -m pytest tests/prompts/test_prompt_fixture.py::test_prompt_fixture_text_equals_hashed_bytes -v"
        status: pass
    human_judgment: false
  - id: D8
    description: "Manifest-hash loop closed end-to-end: AssetSpec with the REAL style_sha256 and catalogue_sha256 from the committed fixtures round-trips strictly via model_dump_json, and the catalogue_sha on the asset equals the catalogue_sha injected into the rendered prompt (ROADMAP critere 5, D-16, §5.5.3 l.151)"
    requirement: MOT-04
    verification:
      - kind: automated
        ref: "python -m pytest tests/prompts/test_prompt_fixture.py::test_asset_content_hashes_roundtrip_with_real_fixture_shas -v"
        status: pass
    human_judgment: false
  - id: D9
    description: "make_asset() default path byte-identical to plan 02-03 — the optional content_hashes override does NOT alter existing call sites (test_asset_bridge, test_pack_bridge, test_pack); git diff --exit-code -- tests/bridge/fixtures.py empty by design"
    requirement: MOT-04
    verification:
      - kind: automated
        ref: "python -m pytest tests/prompts/test_prompt_fixture.py::test_make_asset_default_path_is_byte_identical_to_phase_1 -v"
        status: pass
    human_judgment: false
  - id: D10
    description: "make_asset content_hashes override goes through the same strict Sha256Hex gate (uppercase / 63-char / non-hex payload rejected at ContentHashes construction AND at make_asset(content_hashes=...)) — defence in depth so a future relaxation fails CI"
    requirement: MOT-04
    verification:
      - kind: automated
        ref: "python -m pytest tests/prompts/test_prompt_fixture.py::test_make_asset_content_hashes_override_is_strictly_validated -v"
        status: pass
    human_judgment: false
  - id: D11
    description: "Full battery green at the close of the plan: pytest -k export → npx vitest run → pytest -q (472/472), ruff / biome / tsc clean, .github/workflows/verify.yml byte-identique (D-18)"
    requirement: D-18
    verification:
      - kind: automated
        ref: "git diff --exit-code -- .github/workflows/verify.yml"
        status: pass
      - kind: automated
        ref: "python -m pytest tests/ -q -k export"
        status: pass
      - kind: automated
        ref: "npx vitest run"
        status: pass
      - kind: automated
        ref: "python -m pytest tests/ -q"
        status: pass
      - kind: automated
        ref: "python -m ruff check ."
        status: pass
      - kind: automated
        ref: "npx @biomejs/biome check ."
        status: pass
      - kind: automated
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false

# Metrics
duration: 11 min
completed: 2026-08-30
status: complete

# Actuals (#2632) — pairs with the plan's estimate to calibrate future estimates.
# Same scale as estimate (chars/4 over realized diff).
actuals:
  tokens: 5552   # ~44 KiB raw over 4 created files / 8 (chars/4)
  tasks: 2
  commits: 2
---

# Phase 2 Plan 06: RecipePicker prompt-fixture mechanism + manifest-hash loop

**Pure, deterministic system-prompt mechanism that injects the recipe catalogue verbatim + its sha256 into a versioned template, plus the end-to-end manifest loop that closes ROADMAP critere 5 (catalogue_sha on prompt == catalogue_sha on AssetSpec) — D-13, MOT-04, D-16.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-08-31T02:22:31Z
- **Completed:** 2026-08-31T02:33:30Z
- **Tasks:** 2
- **Files modified:** 0 (all 4 created)
- **Tokens:** 5552 (chars/4 over the realised diff of ~44 KiB of source/test) — well within the plan's `confidence: low` estimate band

## Accomplishments

1. **Recipe-picker prompt-fixture mechanism (D-13, MOT-04)**: a pure-function renderer (`lottie_forge.prompts.render.render_recipe_picker_prompt`) substitutes the two contractual placeholders on a committed template whose path is a module-level constant. No network, no caller override on the production path (T-02-02); a residual-placeholder `ValueError` keeps an unsubstituted `{{...}}` from leaking to the LLM (T-02-10).
2. **Verbatim-equals-hashed-bytes invariant (D-03 / §5.1 #2)**: `load_catalogue_prompt_fixture()` returns the raw LF-normalised committed bytes — exactly the bytes the catalogue loader hashed. Re-serialising via `model_dump_json` is explicitly forbidden; the test `test_prompt_fixture_text_equals_hashed_bytes` proves `sha256_hex(loaded_text.encode("utf-8")) == loaded_sha`.
3. **Manifest-loop closure (ROADMAP critere 5, D-16, §5.5.3 l.151)**: an `AssetSpec` carrying the REAL `style_sha256` and `catalogue_sha256` of the committed fixtures round-trips via `model_dump_json` byte-identically, and the `catalogue_sha` recorded on the asset equals the `catalogue_sha` injected into the rendered prompt — the loop is closed on a single value.
4. **`make_asset` consumed as-is, no edit to the builder**: the `content_hashes=` override added by plan 02-03 is the single entry point; this plan honours the contract and does NOT touch `tests/bridge/fixtures.py`. `git diff --exit-code -- tests/bridge/fixtures.py` is empty by design.
5. **Doctrine CI preserved**: `.github/workflows/verify.yml` is byte-identique (D-18). The new tests ride the existing `pytest -k export` → `npx vitest run` → `pytest -q` ordered chain — no workflow edit.
6. **Full battery green**: pytest 472/472 (+10 from this plan), vitest 150/150 (unchanged — no TS source touched), ruff / biome / tsc all clean. No TypeScript source touched (vitest unchanged is the strongest evidence the TS mirror surface is not perturbed).

## Task Commits

| Task | Hash | Subject | Files |
| ---- | ---- | ------- | ----- |
| 1 | `59fc51b` | `feat(02-06): RecipePicker prompt-fixture mechanism + template skeleton (D-13, MOT-04)` | `lottie_forge/prompts/__init__.py`, `lottie_forge/prompts/render.py`, `lottie_forge/prompts/templates/recipe_picker.system.md`, `tests/prompts/test_prompt_fixture.py` (initial 7 mechanism tests) |
| 2 | `34e4dd2` | `feat(02-06): end-to-end manifest hash loop — catalogue_sha on prompt == on AssetSpec (ROADMAP critere 5 / D-16)` | `tests/prompts/test_prompt_fixture.py` (+3 manifest-loop tests appended) |

## Files Created

- `lottie_forge/prompts/__init__.py` — subpackage docstring only; the only public surface is `lottie_forge.prompts.render`.
- `lottie_forge/prompts/render.py` — `RECIPE_PICKER_TEMPLATE_PATH` (module constant, T-02-02 mitigation), `render_recipe_picker_prompt(catalogue_json, catalogue_hash, *, template_path=...)` (pure, residual-placeholder guard T-02-10), `load_catalogue_prompt_fixture()` (returns raw LF-normalised text + sha from `load_catalogue_fixture`).
- `lottie_forge/prompts/templates/recipe_picker.system.md` — versioned skeleton carrying exactly the two contractual placeholders, each present once; the rest is at the Phase-6 agent's discretion per `02-CONTEXT.md` "the agent's Discretion".
- `tests/prompts/test_prompt_fixture.py` — 10 tests total: 7 mechanism tests (placeholder contract, verbatim embedding, residual-guard, determinism, hash injectability, embarqué==hashé==committé) + 3 manifest-loop tests (AssetSpec round-trip with real shas, default path byte-identical, strict override validation).

## Files Modified

None. `tests/bridge/fixtures.py`, `lottie_forge/domain/asset.py`, `lottie_forge/loading/catalogue.py`, `lottie_forge/loading/style.py`, and `.github/workflows/verify.yml` are all byte-identique from this plan.

## Decisions Made

- **Module-level constant for the template path** (T-02-02): `RECIPE_PICKER_TEMPLATE_PATH = Path(__file__).resolve().parent / "templates" / "recipe_picker.system.md"` is the only way production code can reach the template. No env override, no user-input override, no caller override on the production path (a `template_path=` keyword argument exists solely to let the residual-guard test exercise the malformed-template branch).
- **Verbatim embedding contract (§5.1 #2 / D-03)**: `load_catalogue_prompt_fixture()` returns the raw LF-normalised committed bytes decoded utf-8. Re-serialising via `model_dump_json` would break the hand-verifiability against `sha256sum` outside the factory and is explicitly forbidden by the doc, the plan, and the tests (`test_prompt_fixture_text_equals_hashed_bytes` proves the invariant).
- **Residual-placeholder guard philosophy**: the guard fires only on a literally malformed template (a leftover `{{...}}` substring after substitution). The well-formed committed template triggers it zero times. The test exercises the guard via an on-disk synthetic copy with `{{unsupported}}`, never by editing the committed file.
- **Pure-function renderer**: no I/O-network, no globals beyond `RECIPE_PICKER_TEMPLATE_PATH`. `str.replace` for both placeholders, no template engine, no Jinja / Mustache / f-string interpolation of user input. Two consecutive calls with the same inputs return byte-identical strings (`test_render_determinism_byte_identical`).
- **`make_asset` consumed as-is**: the optional `content_hashes=` override added by plan 02-03 is the single entry point for passing real sha values. This plan honours the contract — no edit to `tests/bridge/fixtures.py`, no duplicated builder, no second source of truth. The 3 existing call sites (`test_asset_bridge`, `test_pack_bridge`, `test_pack`) stay byte-identical.

## Deviations from Plan

**1. [Rule 1 - Bug] Template wording trimmed to avoid double-substitution**

- **Found during:** Task 1 — first test run `pytest tests/prompts/test_prompt_fixture.py -v` failed with `assert rendered.count(fake_hash) == 1` returning 2.
- **Issue:** The initial template wording included documentation lines that *also* contained the literal strings `{{catalogue_json}}` and `{{catalogue_hash}}` (e.g. a line that documented "Le placeholder est `{{catalogue_json}}`"). Because the renderer uses `str.replace`, every occurrence of the placeholder token gets substituted — not just the "real" one. The fake hash consequently appeared twice in the rendered prompt: once where the template documented the placeholder syntax, once where the placeholder was actually substituted. Section §5.1 #2 of the docs (`catalogue = fixture de system prompt`) is what the LLM sees; developer-facing "what does this template do" notes belong in the test docstring, not in the template body.
- **Fix:** Rewrote the template body to remove documentation of the placeholder syntax. The template now carries exactly two occurrences of `{{catalogue_json}}` and `{{catalogue_hash}}` (asserted by `test_template_has_exactly_two_placeholders`), each substituted by the renderer, with the rest being the system-prompt skeleton the Phase-6 agent will fill. Developer notes are in the plan and in the test docstring.
- **Files modified:** `lottie_forge/prompts/templates/recipe_picker.system.md`.
- **Verification:** `pytest tests/prompts/test_prompt_fixture.py -v` is green (10/10); the `catalogue_text in rendered` and `catalogue_sha in rendered` assertions now hold exactly.
- **Committed in:** `59fc51b` (first-amendment included in the initial Task 1 commit; the amend was a clean re-write of the test file, no functional change to the production module beyond the template wording fix).

**2. [Rule 2 - Critical missing] Added explicit `sha256_hex` re-derivation assertion**

- **Found during:** Task 1 design review of `load_catalogue_prompt_fixture`.
- **Issue:** The plan's "must-haves" list (`truths: 2`) calls out the invariant "le texte embarqué == les bytes hashés == le fichier committé" — i.e. `sha256_hex(loaded_text.encode("utf-8")) == loaded_sha`. The initial implementation sourced both `text` and `sha` from `load_catalogue_fixture`, so the invariant held *by construction*. But the test file did not carry an explicit assertion against the principle — a future refactor that pulled `text` from `read_text` without `normalize_lf` (or that pulled `sha` from a stale source) would still pass silently.
- **Fix:** Added `test_prompt_fixture_text_equals_hashed_bytes` to assert `sha256_hex(catalogue_text.encode("utf-8")) == catalogue_sha` — a direct positive invariant that locks §5.1 #2's "embarqué == hashé == committé" forever.
- **Files modified:** `tests/prompts/test_prompt_fixture.py`.
- **Verification:** Green (the invariant holds for the current implementation; future regressions fail CI).
- **Committed in:** `59fc51b` (consolidated with the mechanism commit; the test is logically part of Task 1).

**3. [Rule 2 - Critical missing] Split Task 1 and Task 2 into two commits / test groups**

- **Found during:** End-of-task 1 review.
- **Issue:** The plan lists Task 1 (mechanism) and Task 2 (manifest loop) as two separate commits. A naive implementation writes everything in one go — `tests/prompts/test_prompt_fixture.py` carrying all 10 tests — and the commit structure would not match the plan's task split. Per the plan "Task 1 files: ..., tests/prompts/test_prompt_fixture.py" + "Task 2 files: tests/prompts/test_prompt_fixture.py", the task split is on what each commit **adds**, not what the file ends up containing.
- **Fix:** Wrote the file initially with only the Task 1 mechanism tests (7 tests), committed (`59fc51b`), then appended the Task 2 manifest-loop tests (3 tests) to the same file and committed again (`34e4dd2`). The file ends the plan with all 10 tests; each commit is atomic.
- **Files modified:** `tests/prompts/test_prompt_fixture.py` (twice — initial 7 tests, then +3 tests in Task 2 commit).
- **Verification:** `git log --oneline` shows two `feat(02-06)` commits, each atomic, each addressing its own task's acceptance criteria; full battery green at end of plan.
- **Committed in:** `59fc51b` (Task 1) + `34e4dd2` (Task 2).

---

**Total deviations:** 3 auto-fixed (1 bug-fix template wording, 2 critical-missing: explicit invariant test + atomic commit split).
**Impact on plan:** All three are tightening on the plan's intent — none drift from the plan's stated truths or acceptance criteria. The template wording change is a small clarification of what goes in the system-prompt body vs. in a developer doc. The two critical-missing additions are net additions of safety-nets the plan prescribed but did not put into concrete test names.

## Issues Encountered

- **Module-constant naming pattern verification**: rendered three variants of `RECIPE_PICKER_TEMPLATE_PATH` (`Path(__file__).resolve().parents[1] / "prompts" / ...`, `Path(__file__).resolve().parent / "templates" / ...`, `Path(__file__).parent / "templates" / ...`); all resolve to the same path on disk, but the `parent / "templates" / ...` form is the most legible. Used the parent form. The plan's prescription `Path(__file__).resolve().parents[1] / "prompts" / "templates" / ...` is correct and equivalent; preserved the same effect without verbatim duplication.
- **Initial `with pytest.raises(ValueError)` over the committed template**: a leftover from a first draft of `test_residual_placeholder_guard`. The committed template is well-formed, so the first block would have fired on a *passing* call (false positive). Removed in the post-failure edit; the test now exercises the guard only via the synthetic-template path.

## Auth Gates

None — no external service, no CLI auth, no credential required.

## User Setup Required

None — no `.env` entries, no dashboard config, no account flow. The mechanism is pure Python + committed artefacts.

## Next Phase Readiness

- **Phase 6 RecipePicker agent** can now consume `render_recipe_picker_prompt(catalogue_text, catalogue_sha)` and `load_catalogue_prompt_fixture()` to fill its system prompt. Zero refactor of the mechanism (D-13): the renderer contract — two placeholders, module-constant template path, residual guard — is locked.
- **Other system-prompt agents** (StyleRefiner, Composer) can copy the `lottie_forge.prompts` pattern: a pure renderer per agent, each with its own template-path constant, each substituting a closed set of placeholders, each asserting the residual guard. The `tests/prompts/test_prompt_fixture.py` skeleton is the seed for their test suites.
- **Manifest store / Phase 5** inherits the loop: `AssetSpec.content_hashes.{style_sha256, catalogue_sha256}` is now wired end-to-end — the same `sha256_hex` from `lottie_forge.loading.style.sha256_hex` (single implementation, plan 02-01) flows from the committed fixture to the prompt to the asset's manifest.
- **Phase 8 dotlottie_sha256 extension** continues to follow the same rule (§4.14 same-commit): edit `ContentHashes` in `lottie_forge/domain/asset.py` + the zod mirror in the same commit; the `dm03-content-hashes-5e-cle` rejection case (plan 02-03) demonstrates the lock.

---

*Phase: 02-style-verrouill-catalogue-de-recettes* · *Plan: 06* · *MOT-04 unlocked* · *ROADMAP critere 5 unlocked*
*Completed: 2026-08-30* · *Branch: main*
