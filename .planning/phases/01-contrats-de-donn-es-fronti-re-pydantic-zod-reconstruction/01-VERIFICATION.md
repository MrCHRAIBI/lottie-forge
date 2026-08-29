---
phase: 01-contrats-de-donn-es-fronti-re-pydantic-zod-reconstruction
verified: 2026-08-29T22:19:29+01:00
status: human_needed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Push the branch to GitHub and watch the first run of the `verify` workflow (Actions tab): all 12 steps green, in order, with step 12 printing `total skipped: 0`."
    expected: "Workflow `verify` completes green on ubuntu-latest: checkout → setup-python 3.12 → setup-node 20 → pip install -e \".[dev]\" → npm ci → ruff → biome → pytest -k export (15) → vitest (85) → pytest full (329) → tsc --noEmit → assert-zero-skips exit 0."
    why_human: "Requires the GitHub Actions runner (external service). The workflow file, its exact §3.6 step order, and the zero-skip gate (proven exit 0 AND exit 1 by this verifier) are all verified locally, and the ordered chain passes green on this machine — but a literal CI run on GitHub infrastructure cannot be triggered or observed from here. ROADMAP SC n°1 says 'passe verte en CI' ; the local fresh-clone proof (01-05) plus this verifier's chain run prove everything except the GitHub run itself."
---

# Phase 1: Contrats de données & frontière Pydantic↔zod (reconstruction) — Verification Report

**Phase Goal:** Le schéma est le contrat — les 4 modèles Pydantic stricts (StyleSpec, MotionRecipe, AssetSpec, PackManifest), leurs miroirs zod, le bridge ordonné pytest→vitest→pytest et la CI `verify` reconstruits depuis le dépôt à zéro, à l'identique du §1.8/§2.5. Licence perpétuelle one-time structurelle dès cette phase (Literal + validateurs) ; expression runtime (license.txt) en Phase 10.
**Verified:** 2026-08-29T22:19:29+01:00
**Status:** human_needed (1 item — first actual GitHub Actions run; zero code gaps)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | La chaîne bridge ordonnée (pytest -k export → npx vitest run → pytest -q) passe verte avec zéro test skippé, et la CI `verify` encode cette séquence + la gate zéro-skip (ROADMAP SC n°1) | ✓ VERIFIED | **Run by this verifier**: `pytest -k export` 15 passed → `npx vitest run` 85 passed (5 files) → `pytest -q` 329 passed → `node scripts/assert-zero-skips.mjs` → `total skipped: 0`, exit 0. Gate also proven in the negative direction: fabricated junitxml with `skipped="1"` → `FAIL: … skipped` exit 1. `verify.yml` read: 12 steps in exact §3.6 order, quoted `pip install -e ".[dev]"`, no `continue-on-error`, no `if: always()`, `permissions: contents: read`, junitxml wired to the gate. See Human Verification for the one un-runnable tail (literal GitHub run). |
| 2 | Tout id hors catalogue (disco-spin) rejeté des deux côtés ; invariant 8 ≤ ids ≤ 12 asserté de part et d'autre (SC n°2) | ✓ VERIFIED | `vocabulary.py`: RECIPE_IDS tuple (10 ids ordre canonique), `RecipeId` Literal, `assert_recipe_count` + runtime self-check at import; `vocabulary.schema.ts`: same 10 ids `as const`, `z.enum`, top-level invariant throw. Tests: `test_disco_spin_is_not_a_member_of_the_vocabulary` (test_vocabulary.py:83), disco-spin rejection in test_recipe.py:140 and test_asset.py:195, shared cases `dm02-recipe-id-out-of-catalogue` / `dm02-recipe-ref-hors-catalogue` consumed by pytest parametrize AND vitest test.each. All green in the full run. |
| 3 | Cross-fields StyleSpec (thin<default<bold strict, small<=medium<=large inclusif) + les 3 validateurs PackManifest (unicité IN-08, cohérence compte, mono-style WR-01) rejettent en suites miroirs paramétrées (SC n°3) | ✓ VERIFIED | `style.py`: two `model_validator(mode="after")` read on lines 50-57 / 69-76; shared cases `dm01-crossfield-stroke-order` + `dm01-crossfield-radii-order` with expect_paths. `pack.py`: 3 invariants via `ValidationError.from_exception_data` with precise locs `("assets", idx, "asset_id")` / `("totals", "asset_count")` / `("assets", idx, "style_ref")`, mono-style via `rsplit("@", 1)` (WR-01, no regex re-derivation); `pack-manifest.schema.ts`: 3 symmetric `.superRefine` collect-all with identical paths. Named tests green: `test_duplicate_asset_id_is_rejected_in08`, `test_triple_duplicate_asset_id_yields_one_issue_per_pair_in08`, `test_mono_style_mismatch_is_rejected_wr01`, `test_pack_bridge.py:234-236` asserts both duplicate locs. 10 pack-manifest shared rejection cases green both sides. |
| 4 | Une licence abonnement est impossible à construire — Literal rejette à l'instanciation, côté Pydantic comme côté zod (SC n°4) | ✓ VERIFIED | `pack.py`: `LicenseTerms = Literal["perpetual-one-time"]` (gate) + `model_validator(mode="after")` belt enforcing `commercial_use is True` AND `attribution_required is False` (return-self bug found and fixed during execution, commit d25c336). `pack-manifest.schema.ts`: `z.literal("perpetual-one-time")` + `.superRefine` belt with documented path-asymmetry fix. 8 license tests in test_pack.py (3 validation rejections + 3 constructor rejections + valid acceptance + terms-literal rejection) and 3 voies in pack-manifest.spec.ts — all green in the full run. |
| 5 | Deux objets de contenu égal construits indépendamment sérialisent en model_dump_json() byte-identiques (SC n°5) | ✓ VERIFIED | `test_two_constructs_with_equal_content_serialize_byte_identical_determinism` present in BOTH `tests/domain/test_pack.py:462` and `tests/bridge/test_pack_bridge.py:121`; both green in the full suite run (329 passed). Fixtures use fractional floats only (0.5, 0.75, 2.5 — never 2.0). |
| 6 | Les 4 modèles Pydantic stricts existent, substantiels, câblés (STRICT_CONFIG = extra=forbid + strict partout, style_version requis sans défaut) | ✓ VERIFIED | Read all four: `style.py` (StyleSpec + 5 nested, style_version required, no default, line 102), `recipe.py` (MotionRecipe + MotionParams, recipe_id imported from vocabulary — never redeclared), `asset.py` (AssetSpec + CompositionMeta + ContentHashes locked 2-field, 4 ASCII-anchored pattern constants), `pack.py` (PackManifest + PackTotals + LicenseInfo). `STRICT_CONFIG` defined once in `_shared.py:25`, `KebabToken` via pydantic-core `StringConstraints` (CR-01, no hand-rolled validator). |
| 7 | Les miroirs zod stricts existent pour chaque contrat (z.strictObject nested, regexes identiques, types z.infer exportés) | ✓ VERIFIED | Read `pack-manifest.schema.ts` and `vocabulary.schema.ts` in full; `style-spec.schema.ts`, `recipe.schema.ts`, `asset-spec.schema.ts` exist and are exercised green by their spec files (85 vitest tests, 5 files). Schema-key parity asserted in all 4 TS specs (`schema-keys` grep hit in every spec) via `fixtures/bridge/*.schema-keys.json` regenerated during this verifier's chain run. |
| 8 | Le harnais de rejet partagé (D-06/D-07/D-08) est opérationnel : une seule source JSON par contrat, consommée par pytest parametrize ET vitest test.each, appartenance de chemins (jamais le texte des messages) | ✓ VERIFIED | 4 tracked fixture files: style-spec (19 cases), recipe (13), asset-spec (20), pack-manifest (10) — `git ls-files` confirms tracked; `fixtures/bridge/` confirmed gitignored (`git check-ignore` exit 0, zero tracked files). `rejection_loader.py` read: expect_paths = loc-tuple membership, "path comparison only — never message text" (D-08). Bridge rejection parametrize + vitest test.each green in the full run. WR-06 trap (`1200.0`) confirmed ABSENT from all rejection JSONs (grep zero hits) — pinned asymmetry stays in dedicated two-half tests. |

**Score:** 8/8 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lottie_forge/domain/_shared.py` | STRICT_CONFIG, TOKEN_NAME_PATTERN, KebabToken | ✓ VERIFIED | Read — pydantic-core StringConstraints, no hand-rolled validator |
| `lottie_forge/domain/style.py` | StyleSpec + 5 nested strict models | ✓ VERIFIED | Read — cross-field validators, style_version no default |
| `lottie_forge/domain/vocabulary.py` | RECIPE_IDS + RecipeId + assert_recipe_count | ✓ VERIFIED | Read — runtime self-check at import |
| `lottie_forge/domain/recipe.py` | MotionRecipe + MotionParams strict | ✓ VERIFIED | Read — vocabulary imported, never redeclared |
| `lottie_forge/domain/asset.py` | AssetSpec + CompositionMeta + ContentHashes | ✓ VERIFIED | Read — closed 2-field hashes, STY-03 pin regex |
| `lottie_forge/domain/pack.py` | PackManifest + PackTotals + LicenseInfo + 3 validators | ✓ VERIFIED | Read — collect-all via from_exception_data |
| `src/rpc/contracts/*.schema.ts` (5) | zod strictObject mirrors + types | ✓ VERIFIED | 2 read in full, 3 exercised by green suites; ADR-03 import-only |
| `src/rpc/contracts/*.spec.ts` (5) | bridge validate/re-emit + rejection test.each | ✓ VERIFIED | 85 vitest tests green in this verifier's run |
| `tests/domain/test_*.py` (5) | domain suites | ✓ VERIFIED | Green in full run (329 pytest) |
| `tests/bridge/test_*_bridge.py` (5) | export + reimport + rejection harness | ✓ VERIFIED | test_reimport_* present in all 4 contracts; skipif guard; green |
| `tests/bridge/fixtures.py` | make_style_spec/recipe/asset/pack | ✓ VERIFIED | Consumed by the chain run (artifacts regenerated) |
| `tests/bridge/rejection_loader.py` + `src/rpc/contracts/rejection-cases.ts` | shared loaders (D-06) | ✓ VERIFIED | Read; CONTRACT_FILES covers all 4 contracts |
| `fixtures/rejection-cases/*.json` (4) | committed shared cases (D-07) | ✓ VERIFIED | All 4 tracked in git; 62 cases total |
| `pyproject.toml` | pydantic==2.13.4 pin, py>=3.12<3.14, junitxml addopts | ✓ VERIFIED | Grep-verified all three |
| `package.json` + `package-lock.json` | zod ^4, TS ~5.9, vitest ^4, biome ^2, @types/node ^20 | ✓ VERIFIED | All pins grep-verified; lock committed |
| `tsconfig.json` / `biome.json` / `ruff.toml` / `vitest.config.ts` | strict+verbatimModuleSyntax / scope src/** / known-first-party / junit reporter | ✓ VERIFIED | Static gates green: ruff ✓, biome ✓ (12 files), tsc ✓ |
| `.github/workflows/verify.yml` | 12 ordered steps §3.6 + tsc + zero-skip | ✓ VERIFIED | Read in full — exact order, quoted pip chain, no continue-on-error |
| `scripts/assert-zero-skips.mjs` | junitxml parser, exit 1 si skipped > 0 | ✓ VERIFIED | Read; proven exit 0 (real files) AND exit 1 (fabricated skip) |
| `README.md` | quickstart = séquence CI byte-for-byte (D-05) | ✓ VERIFIED | All 9 job commands present verbatim, order preserved, pre-commit note present |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `make_*()` (fixtures.py) | `fixtures/bridge/*.from-python.json` | pytest -k export | ✓ WIRED | Chain leg 1 run by verifier — 15 export tests, artifacts regenerated |
| `*.from-python.json` | `*.spec.ts` | vitest zod parse + deep-equal | ✓ WIRED | Chain leg 2 — 85 vitest tests green |
| `*.from-ts.json` | `test_reimport_*` | model_validate strict + canonical equality | ✓ WIRED | Chain leg 3 — 329 pytest green, 0 skipped |
| `*.schema-keys.json` | schema-key parity asserts | model_json_schema() vs zod shape | ✓ WIRED | Parity asserted in all 4 TS specs |
| `fixtures/rejection-cases/*.json` | pytest parametrize AND vitest test.each | shared loaders | ✓ WIRED | Same case_ids both sides; suites green |
| verify.yml steps 8→9→10→12 | junitxml → gate | ordered single job | ✓ WIRED | Step 12 reads files produced by steps 8/10 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `fixtures/bridge/*.from-python.json` | serialized models | `make_*()` Pydantic instances via model_dump_json | Yes — regenerated during this verification | ✓ FLOWING |
| `fixtures/bridge/*.from-ts.json` | re-emitted payloads | zod-parsed objects via JSON.stringify | Yes | ✓ FLOWING |
| `fixtures/bridge/{pytest,vitest}-junit.xml` | skipped counts | pytest addopts + vitest junit reporter | Yes — parsed by the gate, total 0 | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Bridge leg 1 (export) | `uv run python -m pytest tests/ -q -k export` | 15 passed, 314 deselected | ✓ PASS |
| Bridge leg 2 (validate/re-emit) | `npx vitest run` | 5 files, 85 passed | ✓ PASS |
| Bridge leg 3 (strict re-import) | `uv run python -m pytest tests/ -q` | 329 passed | ✓ PASS |
| Zero-skip gate (positive) | `node scripts/assert-zero-skips.mjs fixtures/bridge/pytest-junit.xml fixtures/bridge/vitest-junit.xml` | `total skipped: 0`, exit 0 | ✓ PASS |
| Zero-skip gate (negative) | same script on fabricated junitxml `skipped="1"` | `FAIL: 2 test(s) skipped`, exit 1 | ✓ PASS |
| Static gates | `ruff check .` / `npx @biomejs/biome check .` / `npx tsc --noEmit` | All checks passed / 12 files no fixes / exit 0 | ✓ PASS |
| fixtures/bridge/ not committed | `git check-ignore` + `git ls-files fixtures/bridge/` | exit 0, zero tracked | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` declared or conventional for this phase (Step 7c: N/A). The phase's own probe equivalent — `scripts/assert-zero-skips.mjs` — was executed by this verifier in both directions (see spot-checks).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| DM-01 | 01-01 | StyleSpec strict validée des deux côtés (bornés, extra=forbid/strict, cross-fields) | ✓ SATISFIED | Truths 3/6/7; style.py + style-spec.schema.ts + suites green |
| DM-02 | 01-02 | MotionRecipe + vocabulaire clos RecipeId (invariant 8–12, 10 ids) ; hors catalogue rejeté | ✓ SATISFIED | Truth 2; vocabulary.py/.schema.ts + disco-spin tests both sides |
| DM-03 | 01-03 | AssetSpec complète (asset_id a-\d{3}, pin style_ref, recipe_ref, composition_meta, content_hashes clos) | ✓ SATISFIED | Truth 6; asset.py + asset-spec.schema.ts + 20 shared cases green |
| DM-04 | 01-04 | PackManifest validé (unicité, cohérence compte/total, mono-style, licence structurelle) | ✓ SATISFIED | Truths 3/4/5; pack.py + pack-manifest.schema.ts + 10 shared cases green |
| DM-05 | 01-01..01-05 | Miroirs zod stricts + parité testée (clés, rejet miroir, round-trip ordonné) enforce CI | ✓ SATISFIED | Truths 1/7/8; bridge chain green + verify.yml + zero-skip gate |

**Orphaned requirements:** none — ROADMAP maps exactly DM-01..DM-05 to Phase 1, all five claimed across the 5 plans and all satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | No TBD/FIXME/XXX/HACK/PLACEHOLDER/debt markers in any phase-modified file; no stub returns; no hardcoded-empty props | ℹ️ clean | — |

### Human Verification Required

### 1. First GitHub Actions run of `verify` goes green

**Test:** Push the branch to GitHub; open the Actions tab and watch workflow `verify` run end-to-end.
**Expected:** All 12 steps green in order (checkout → setup-python 3.12 → setup-node 20 → `pip install -e ".[dev]"` → `npm ci` → ruff → biome → `pytest -k export` 15 → vitest 85 → `pytest -q` 329 → tsc → `assert-zero-skips` printing `total skipped: 0`).
**Why human:** Requires the GitHub Actions runner — an external service that cannot be triggered or observed from this development machine. Everything up to the literal CI run is verified (workflow file read step-by-step; zero-skip gate proven exit 0 and exit 1; ordered chain run green by this verifier; fresh-clone simulation with all 12 steps documented in 01-05, including the CRLF bug it caught and fixed via `.gitattributes`).

### Gaps Summary

**No code gaps.** All 5 ROADMAP success criteria are verified against the actual codebase, with the full ordered bridge chain (15 → 85 → 329, zero skipped) executed fresh by this verifier during the verification session. All 4 Pydantic models and their zod mirrors are substantive and wired; the rejection harness consumes 62 shared cases from a single tracked source per contract; the license gate is structural on both sides; determinism is test-proven; all prohibitions hold (no second id list — structural same-commit scan green; no coercion — strict suites green; no message-text assertions — path-membership loaders; no bridge fixtures committed — gitignore effective; no pre-commit hooks — none configured; no dict[str,Any] at the boundary — closed models only).

Two informational notes (no action required for this phase, fix opportunistically):
1. **REQUIREMENTS.md checkbox drift** — DM-01 and DM-03 are still marked `[ ]`/"Pending" in REQUIREMENTS.md while DM-02/DM-04/DM-05 are `[x]`/"Complete". All five are delivered by this phase; the two stale marks are tracking hygiene, not code gaps.
2. **Summary prose count drift** — 01-01 SUMMARY says "20 shared rejection cases" for style-spec; the tracked JSON contains 19. The harness consumes whatever the file holds and both suites are green, so this is documentation drift only.

The single human verification item (first GitHub Actions run) is the residual tail of ROADMAP SC n°1 ("passe verte **en CI**") — locally proven to the maximum extent possible from this machine.

---

_Verified: 2026-08-29T22:19:29+01:00_
_Verifier: the agent (gsd-verifier)_
