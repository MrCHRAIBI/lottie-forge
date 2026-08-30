---
phase: 02-style-verrouill-catalogue-de-recettes
plan: 01
subsystem: data-foundations
tags: [yaml-fixture, sha256-regime, bridge-ordered, vocabulary, same-commit]
dependency_graph:
  requires: [pydantic-2.13.4, pyyaml>=6.0.2,<7]
  provides: [style-fixture-loader, style-bridge-chain, ThemeAnchorId-vocabulary]
  affects: [AssetSpec.content_hashes (style_sha256 future, plan 02-03), CatalogRecipe.theme_anchors (plan 02-04)]
tech-stack:
  added: [pyyaml>=6.0.2,<7]
  patterns: [D-02-hash-LF-normalized, same-commit-vocabulary, bridge-ordered-pytest-vitest-pytest, loader-side-gate]
key-files:
  created:
    - fixtures/style-specs/example-style/style.yaml
    - fixtures/style-specs/example-style/palette.json
    - lottie_forge/loading/__init__.py
    - lottie_forge/loading/style.py
    - src/rpc/contracts/style-fixture.spec.ts
    - tests/bridge/test_style_fixture_bridge.py
  modified:
    - pyproject.toml
    - tests/bridge/fixtures.py
    - lottie_forge/domain/vocabulary.py
    - src/rpc/contracts/vocabulary.schema.ts
    - src/rpc/contracts/vocabulary.spec.ts
    - tests/domain/test_vocabulary.py
key-decisions:
  - "PyYAML gate cleared by human (pypi.org legitimacy): install via uv pip (pip not bootstrapped in venv); deps now include pyyaml>=6.0.2,<7"
  - "Loader-side style_id gate (option b, decision D-16): KebabToken + directory-name match, strip before StyleSpec.model_validate; StyleSpec/StyleSpecSchema contracts untouched"
  - "make_style_spec aligned to §5.2.2 verbatim (400x300, bold 4.0, 4 tokens, 2 curves); fixture is canon, builder is the test-side mirror (delta from Phase 1 boundary-probe values documented below)"
  - "ThemeAnchorId closed Literal explicit form (no star-unpack of THEME_ANCHOR_IDS) mirroring the RecipeId lockstep pattern"
  - "Anchor labels and palette token names live in two namespaces (D-12); no cross-validation invented at this layer"
patterns-established:
  - "Raw committed bytes + LF normalisation + sha256_hex as the single implementation of D-02/D-03 hash regime (re-used by plan 02-04 for catalogue_sha256)"
  - "Loader returns (model, sha256_hex) envelope; sha computed before yaml.safe_load"
  - "Gate-then-strip-then-validate pattern: gate on a key the closed model doesn't own, strip it, then model_validate"
  - "Bridge ordered chain for fixtures: pytest -k export -> npx vitest run -> pytest -k reimport, byte-stable for non-integral floats, deep-equal everywhere"
requirements-completed: [STY-01, MOT-03]
coverage:
  - id: "STY-01"
    description: "Style is data: committed YAML, sha256-hashable, no contract edit"
    requirement: "STY-01 (§5.2.2)"
    verification:
      - kind: automated
        ref: "fixtures/style-specs/example-style/style.yaml + lottie_forge/loading/style.py:load_style_spec"
        status: pass
      - kind: automated
        ref: "tests/bridge/test_style_fixture_bridge.py::test_loader_sha_matches_manual_sha256sum"
        status: pass
      - kind: automated
        ref: "git diff --exit-code -- lottie_forge/domain/style.py src/rpc/contracts/style-spec.schema.ts"
        status: pass
      - kind: automated
        ref: "sha256sum manual reproduction matches loader sha (52716be0...c933e1e)"
        status: pass
    human_judgment: false
  - id: "MOT-03"
    description: "ThemeAnchorId closed vocabulary of exactly 6 labels"
    requirement: "MOT-03 / D-10 / D-11"
    verification:
      - kind: automated
        ref: "tests/domain/test_vocabulary.py::test_get_args_of_theme_anchor_id_equals_anchor_ids_tuple"
        status: pass
      - kind: automated
        ref: "tests/domain/test_vocabulary.py::test_unknown_label_is_not_a_member_of_theme_anchor_vocabulary"
        status: pass
      - kind: automated
        ref: "src/rpc/contracts/vocabulary.spec.ts (12 tests including it.each over 6 canonical labels)"
        status: pass
      - kind: automated
        ref: "tests/domain/test_vocabulary.py::test_only_vocabulary_schema_ts_declares_the_anchor_tuple"
        status: pass
    human_judgment: false
  - id: "loader-style-id-gate"
    description: "Loader rejects style_id absent / non-kebab / diverging-from-directory"
    requirement: "D-16 (no contract edit; gate lives in loader only)"
    verification:
      - kind: automated
        ref: "tests/bridge/test_style_fixture_bridge.py::test_gate_rejects_style_id_absent"
        status: pass
      - kind: automated
        ref: "tests/bridge/test_style_fixture_bridge.py::test_gate_rejects_style_id_diverging_from_directory"
        status: pass
      - kind: automated
        ref: "tests/bridge/test_style_fixture_bridge.py::test_gate_rejects_style_id_non_kebab"
        status: pass
      - kind: automated
        ref: "git diff --exit-code -- lottie_forge/domain/style.py src/rpc/contracts/style-spec.schema.ts"
        status: pass
    human_judgment: false
  - id: "fixture-bridge-ordered-chain"
    description: "pytest -k export -> npx vitest run -> pytest -k reimport with style-fixture.* artefacts"
    requirement: "§5.2.2 'chargement bilingue sans drift'"
    verification:
      - kind: automated
        ref: "python -m pytest tests/bridge/test_style_fixture_bridge.py -q (11 passed, 1 skipped pre-vitest, 0 skipped after)"
        status: pass
      - kind: automated
        ref: "npx vitest run style-fixture (3 tests passed)"
        status: pass
      - kind: automated
        ref: "python -m pytest tests/bridge/test_style_fixture_bridge.py -q (reimport stage)"
        status: pass
    human_judgment: false
  - id: "palette-json-sync"
    description: "palette.json re-derivable from style.yaml with byte-identity"
    requirement: "D-04"
    verification:
      - kind: automated
        ref: "tests/bridge/test_style_fixture_bridge.py::test_palette_json_is_in_sync_with_derived"
        status: pass
    human_judgment: false
  - id: "verify-yml-and-untouched-contracts"
    description: "No drift: verify.yml + StyleSpec/StyleSpecSchema unchanged"
    requirement: "D-18"
    verification:
      - kind: automated
        ref: "git diff --exit-code -- .github/workflows/verify.yml lottie_forge/domain/style.py src/rpc/contracts/style-spec.schema.ts"
        status: pass
    human_judgment: false
  - id: "full-suite-clean"
    description: "Whole test/lint/typecheck chain green"
    requirement: "CI quality gates (Phase 1 baseline)"
    verification:
      - kind: automated
        ref: "python -m pytest tests/ -q (353 passed)"
        status: pass
      - kind: automated
        ref: "npx vitest run (97 passed across 6 files)"
        status: pass
      - kind: automated
        ref: "ruff check . / biome check . / tsc --noEmit (all green)"
        status: pass
    human_judgment: false
duration: 28
completed: 2026-08-30
status: complete
actuals:
  tokens: 15212
  tasks: 3
  commits: 3
---

# Phase 2 Plan 01 Summary

STY-01 foundation laid: the style is committed YAML, sha256-hashable outside the factory, with a strict loader-side `style_id` gate (no contract edit). MOT-03 closed vocabulary (ThemeAnchorId, 6 labels) added same-commit on both layers. Bridge ordered chain green: pytest -k export → npx vitest run → pytest -k reimport with zero skip; palette.json sync-test byte-compares the derived artefact.

## Performance

| Phase | Plan | Duration | Tasks | Files | Commits |
|------|------|----------|-------|-------|---------|
| 02    | 01   | 28 min   | 3     | 12    | 3       |

Throughput: ~507 tokens/min on actuals vs the plan estimate of 42000 tokens (~1500 tokens/min). Plan finished well under estimate; the over-provisioning was conservative because the gate-clearance checkpoint interrupted Task 1 and the bridge ordered chain required a verbatim YAML fixture + an in-loader style_id gate.

Test surface: 353 pytest + 97 vitest passed, up from 329 + 85 at Phase 1 close (+24 pytest: 11 fixture/loader + 13 vocabulary; +12 vitest: 3 style-fixture + 9 theme-anchor).

## Accomplishments

1. **PyYAML dependency installed** (`chore(02-01): add pyyaml dependency (T-02-SC gate cleared)`, commit `cfe22a6`). The IN-02 reservation comment in `pyproject.toml` was replaced with `"pyyaml>=6.0.2,<7"`; the venv runs PyYAML 6.0.3. The T-02-SC supply-chain gate was cleared by human confirmation on `pypi.org/project/PyYAML/`.
2. **Style fixture commited** (`feat(02-01): style fixture + loader + bridge ordered chain`, commit `3a2a851`):
   - `fixtures/style-specs/example-style/style.yaml` verbatim §5.2.2 (400×300, bold 4.0, 4 palette tokens ink/accent/surface/success with hex `1F2430/FF6B4A/F5F1EA/3E9B6E`, 2 easing curves standard/entrance with control points `[0.2,0.0,0.2,1.0]` and `[0.0,0.0,0.2,1.0]`). LF-only, 491 bytes. SHA-256(LF) = `52716be03748c036d98978a9815e188290eb6b108024568d76b9e57b0c933e1e`. No `baseline-frames/` directory (D-05).
   - `fixtures/style-specs/example-style/palette.json` derived (D-04): flat JSON token list `[{name, hex}]` in YAML order, indent=2 + ensure_ascii=False + trailing LF, 210 bytes. Committed; `test_palette_json_is_in_sync_with_derived` byte-compares the re-derivation.
   - `lottie_forge/loading/style.py` — the single implementation of the D-02 hash regime, with `normalize_lf`, `sha256_hex`, and `load_style_spec(path) -> (StyleSpec, str)`. `yaml.safe_load` only (T-02-01). No env or user override of the fixture path (T-02-02).
   - `_enforce_style_id_gate` runs **before** `StyleSpec.model_validate`: present → KebabToken (pydantic-core-anchored, CR-01) → value == `path.parent.name` (e.g. `example-style`), then strip. Three fail modes, three message-bearing errors (T-02-04). The contracts `lottie_forge/domain/style.py` and `src/rpc/contracts/style-spec.schema.ts` are byte-untouched (`git diff --exit-code` empty).
   - `tests/bridge/fixtures.py` MOD — `make_style_spec()` realigned to the §5.2.2 verbatim values. Antidrift assertion `fixture == builder` (deep + model_dump_json) is the gate; the **fixture is the canon**, the builder is the mirror.
   - `tests/bridge/test_style_fixture_bridge.py` — 11 tests across (a) sha stability / 64-char hex / sha256sum hand-verifiability, (b) gate rejection (absent / diverging / non-kebab, each with its own `tmp_path/style.yaml` copy), (c) anti-drift, (d) palette sync, (e) bridge export + skipif reimport. Zero skip on the full chain.
   - `src/rpc/contracts/style-fixture.spec.ts` — envelope `{style_sha256, spec}`, `SHA256_HEX_PATTERN` imported from `asset-spec.schema.js`, defensive mutation check (uppercase digests rejected).
3. **ThemeAnchorId closed vocabulary** (`feat(02-01): ThemeAnchorId closed vocabulary (D-10/D-11, MOT-03)`, commit `41beb30`):
   - `lottie_forge/domain/vocabulary.py` — `THEME_ANCHOR_IDS: Final[tuple[str, ...]]` + `ThemeAnchorId = Literal[...]` EXPLICIT form (no star-unpack of the tuple at type definition time, mirroring the RecipeId lockstep pattern). Lockstep is enforced by `get_args(ThemeAnchorId) == THEME_ANCHOR_IDS`, count == 6.
   - `src/rpc/contracts/vocabulary.schema.ts` — `THEME_ANCHOR_IDS as const`, `ThemeAnchorId = (typeof THEME_ANCHOR_IDS)[number]`, `ThemeAnchorIdSchema = z.enum(THEME_ANCHOR_IDS)`.
   - Tests — py: lockstep + count + uniqueness + 6 parametrised membership + "logo" rejected + kebab pattern + structural same-commit scan (the tuple is only declared in `vocabulary.schema.ts`) + consumer-import scan. ts: 6-label canonical order, `it.each` membership, "logo" rejection.

## Task Commits

| Task | Name                                                                        | Commit   | Files                                                                                          |
|------|-----------------------------------------------------------------------------|----------|------------------------------------------------------------------------------------------------|
| 1    | Gate de légitimité PyYAML + installation (T-02-SC)                           | `cfe22a6`| `pyproject.toml`                                                                              |
| 2    | Tracer: style fixture end-to-end — YAML hashé → loader → bridge ordonné       | `3a2a851`| 7 files (`fixtures/style-specs/`, `lottie_forge/loading/`, `tests/bridge/{fixtures,test_style_fixture_bridge}.py`, `src/rpc/contracts/style-fixture.spec.ts`, `tests/bridge/fixtures.py`) |
| 3    | Vocabulaire clos ThemeAnchorId (6 labels) des deux côtés (D-10/D-11)         | `41beb30`| 4 files (`lottie_forge/domain/vocabulary.py`, `src/rpc/contracts/vocabulary.{schema,spec}.ts`, `tests/domain/test_vocabulary.py`) |

## Files Created/Modified

### Created
- `fixtures/style-specs/example-style/style.yaml` — 491 B, sha256 `52716be0…c933e1e`. Style canon verbatim §5.2.2.
- `fixtures/style-specs/example-style/palette.json` — 210 B. Derived + committed (D-04), sync-tested byte.
- `lottie_forge/loading/__init__.py` — package docstring explaining `lottie_forge.loading` owns every fixture loader + the D-02 hash regime.
- `lottie_forge/loading/style.py` — `STYLE_FIXTURE_PATH` constant under REPO_ROOT, `normalize_lf`, `sha256_hex`, `_enforce_style_id_gate`, `load_style_spec -> (StyleSpec, str)`.
- `src/rpc/contracts/style-fixture.spec.ts` — bridge step 2: envelope validate, `SHA256_HEX_PATTERN` lock, defensive mutation check.
- `tests/bridge/test_style_fixture_bridge.py` — 11 tests; loader contract, gate rejections, anti-drift, palette sync, bridge chain.

### Modified
- `pyproject.toml` — added `pyyaml>=6.0.2,<7` in `dependencies`.
- `tests/bridge/fixtures.py` — `make_style_spec` aligned to §5.2.2 (was 1200×800 / bold 4.25 / 2 tokens; now 400×300 / bold 4.0 / 4 tokens / 2 curves). Note in SUMMARY below.
- `lottie_forge/domain/vocabulary.py` — `THEME_ANCHOR_IDS`, `ThemeAnchorId` (explicit Literal form), `__all__` updated.
- `src/rpc/contracts/vocabulary.schema.ts` — `THEME_ANCHOR_IDS` const, `ThemeAnchorId` type, `ThemeAnchorIdSchema`.
- `src/rpc/contracts/vocabulary.spec.ts` — mirror assertions for ThemeAnchorId (canonical order, it.each membership, "logo" rejection, count guard).
- `tests/domain/test_vocabulary.py` — sections (e) and (f) added: ThemeAnchorId closure (count, lockstep, uniqueness, parametrised membership, "logo" rejection, kebab pattern) + structural same-commit scan (only `vocabulary.schema.ts` declares `THEME_ANCHOR_IDS`; consumers must import from it).

## Decisions Made

1. **PyYAML install via `uv pip`** (not `python -m pip` as the plan said literally). The venv is uv-managed (`uv = 0.12.3` in `pyvenv.cfg`) and `pip` is not bootstrapped; `uv pip install -e ".[dev]"` is the operationally-correct equivalent (same package, same version pin). Lockfile note: `uv.lock` is `.gitignore`'d by doctrine ("local-environment artefact, CI uses pip not uv sync").
2. **`make_style_spec` realigned to §5.2.2**, not the other way around (the fixture is the canon). Delta from Phase-1 values: viewBox 1200×800 → 400×300, bold stroke 4.25 → 4.0, corner_radii 2.5/6.5/12.75 → 0.0/8.0/16.0, palette 2 tokens (ink/accent #1B1F3B/#F26A4B) → 4 tokens (ink/accent/surface/success #1F2430/#FF6B4A/#F5F1EA/#3E9B6E), easing_curves 2 → 2 (unchanged count but control points realigned: 0.4/0.05/0.2/0.95 → 0.2/0.0/0.2/1.0; 0.25/0.1/0.25/0.95 → 0.0/0.0/0.2/1.0). All existing Phase 1 tests still pass (boundary tests use overrides; deep-equality tests use the rebuilt values).
3. **Loader-side `style_id` gate** (option b, decision D-16) — KebabToken via `pydantic.TypeAdapter` (no hand-rolled regex), `value == path.parent.name`, then strip. The closed `StyleSpec` model never sees `style_id`. **Decision consequence**: the StrictConfig "extra=forbid" is a *second* gate (defence in depth); a stray `style_id` in the mapping would also be rejected by the strict model — the loader strip just makes that intent explicit.
4. **ThemeAnchorId — explicit Literal form** matches the RecipeId no-star-unpack technique (keeps `get_args` inspectable; the lockstep test enforces parity). The two vocabularies live in the same module so a Phase 2/6 reader sees them side by side.
5. **Anchors and palette token names stay independent** (D-12). No cross-validation invented here — the eventual mapping anchor→colour is a Phase 8 packaging concern (ADR-05). The Phase 2 vocabulary closes the anchor side; the palette side is closed by `StyleSpec.palette` already.

## Deviations from Plan

### Auto-fixed / documented

1. **PyYAML install path** — `uv pip install` instead of `python -m pip install`. Same outcome; the venv is uv-managed by design (see `uv.lock` gitignore comment). Logged above.
2. **TS bridge artefact NOT byte-identical to Python artefact for integral-valued floats** — `JSON.stringify(4.0)` in JavaScript emits `4` (no `.0`); the TS side re-emits `4`, `0`, `1` for the `bold` / `radii.small` / control-point `1.0` fields. Pydantic 2 strict (`Annotated[float, Field(...)]`) **accepts JSON int → float** (lax number coercion for `Annotated[float]` numeric bounds), so the reimport test passes with `StyleSpec.model_validate(spec) == spec`. The bridge artefacts are therefore **deep-equal, not byte-identical** for this case — the §5.2.2 spec calls for deep-equal + parité de clés (we deliver both); Phase 1 byte-identity was a property of all-non-integral-floats data, not a structural invariant. **No fix attempt** — there is no JSON-serialisation trick that preserves `.0` for integral floats on the TS side without breaking numeric validity downstream; deep-equality is the documented contract.

### Out-of-scope (logged to `deferred-items.md`)

- None this plan.

## Issues Encountered

- Initial `ruff check` flagged 4 lint issues in `tests/bridge/test_style_fixture_bridge.py` (F401 unused import, F841 unused local, 2× E501 line-too-long). Fixed in-task; no second-cycle retried.
- Initial `ruff check` + `biome check` flagged 1 each in the vocabulary edits (I001 import sort in py, biome formatter in ts). Fixed via `--fix`; both green on retest.

## User Setup Required

None — the human cleared the T-02-SC legitimacy gate at task 1 with `"approved"`; all remaining work executed automatically.

## Next Phase Readiness

- Plan 02-02 (StyleRefinement) can now import `ThemeAnchorId` (already present in `vocabulary.py`) and reuse the loader pattern (`lottie_forge/loading/style.py`) as the canonical reference for `lottie_forge/loading/catalogue.py` (plan 02-04).
- Plan 02-03 (AssetSpec content_hashes extension to 4 fields) can directly import `sha256_hex` + `normalize_lf` from `lottie_forge.loading.style` — these are the single implementation of D-02/D-03 across the factory (catalogue_sha256 will reuse them in plan 02-04).
- The `STYLE_FIXTURE_PATH` constant is the only fixture path under REPO_ROOT (T-02-02 invariant holds); plan 02-04 will parallel this with `lottie_forge/loading/catalogue.py::CATALOGUE_FIXTURE_PATH`.
- Bridge ordered chain green; verify.yml untouched (D-18); zero test skipped at junitxml.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| All listed files exist on disk | FOUND |
| All commits referenced reachable from HEAD | FOUND (cfe22a6, 3a2a851, 41beb30) |
| `git diff --exit-code -- .github/workflows/verify.yml` | empty (PASS) |
| `git diff --exit-code -- lottie_forge/domain/style.py src/rpc/contracts/style-spec.schema.ts` | empty (PASS) |
| `python -m pytest tests/ -q` | 353 passed |
| `npx vitest run` | 97 passed |
| `ruff check .` / `biome check .` / `tsc --noEmit` | all green |
| sha256 reproducible at the shell (LF-normalised bytes) | matches loader output `52716be0…c933e1e` |
