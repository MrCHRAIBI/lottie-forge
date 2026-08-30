---
phase: 02-style-verrouill-catalogue-de-recettes
plan: 02
subsystem: contracts/style-refinement
tags: [pydantic, zod, strictObject, rejection-harness, STY-02, delta-only, mirror]
requires:
  - 02-01: ThemeAnchorId vocabulary (vocabulary.py + vocabulary.schema.ts)
  - 01-01: StyleSpec contract + style-spec.schema.ts mirror
  - 01-02: MotionRecipe contract + recipe.schema.ts mirror
provides:
  - StyleRefinement Pydantic strict closed model (STY-02 partial)
  - StyleRefinementSchema zod strictObject mirror
  - Shared rejection harness entry style-refinement (10 cases)
  - Schema-keys parity artifact fixtures/bridge/style-refinement.schema-keys.json
affects:
  - tests/bridge/rejection_loader.py (CONTRACT_FILES entry)
  - src/rpc/contracts/rejection-cases.ts (CONTRACT_FILES entry)
tech-stack:
  added: []
  patterns:
    - strict closed model + Literal enums + bounded list (CR-01)
    - zod strictObject mirror with TOKEN_NAME_PATTERN import (no second declaration)
    - shared rejection fixture consumed by pytest parametrize AND vitest it.each
    - schema-keys parity artifact (pytest -k export -> TS shape.keys)
actuals:
  tokens: 6426
  tasks: 3
  commits: 3
key-files:
  created:
    - lottie_forge/domain/style_refinement.py
    - src/rpc/contracts/style-refinement.schema.ts
    - src/rpc/contracts/style-refinement.spec.ts
    - fixtures/rejection-cases/style-refinement.json
    - fixtures/bridge/style-refinement.schema-keys.json
  modified:
    - tests/bridge/rejection_loader.py
    - src/rpc/contracts/rejection-cases.ts
    - tests/domain/test_style_refinement.py
key-decisions:
  - "delta-only by construction (5-field set): hex/path/svg primitives inexprimables (§5.3, STY-02 partial)"
  - "KebabToken rejects '#fff' and '<path' -- the structural gate that makes the closed set real"
  - "motif optional with KebabToken | None = None (mirrors py Pydantic optional, zod nullable.optional)"
  - "TOKEN_NAME_PATTERN imported from style-spec.schema.js (single source of truth, CR-01)"
  - "stroke_pick/radius_pick as TS const Literal arrays (STROKE_PICK_VALUES/RADIUS_PICK_VALUES) for parity assertions"
  - "no second declaration: every schema mirror file imports its regex/literal constants (same-commit doctrine)"
  - "rejection case sr10-extra-key uses rejection-only mode (no expect_paths) -- asymmetry of loc between pydantic field-level and zod strictObject parent-level (D-08 path-asymmetry pattern)"
patterns-established:
  - "StyleRefinement + StyleRefinementSchema mirror pattern (reusable for future delta-only contracts)"
  - "10-case shared rejection fixture for a closed Pydantic model (rejection harness D-06/D-08)"
  - "schema-keys parity artifact via pytest -k export (consumed by vitest)"
requirements-completed: [STY-02]
coverage:
  - id: "STY-02-delta-only-structure"
    description: "StyleRefinement is a closed delta-only model -- hex/path/svg inexprimables"
    requirement: "STY-02 partial (§5.3, ROADMAP critère 4)"
    verification:
      - kind: unit
        ref: "tests/domain/test_style_refinement.py::test_field_set_is_exactly_the_locked_delta_only_set"
        status: pass
      - kind: unit
        ref: "tests/domain/test_style_refinement.py::test_sub_palette_rejects_hex_like_value"
        status: pass
      - kind: unit
        ref: "tests/domain/test_style_refinement.py::test_sub_palette_rejects_svg_like_value"
        status: pass
      - kind: unit
        ref: "tests/domain/test_style_refinement.py::test_motif_rejects_hex_like_value"
        status: pass
      - kind: unit
        ref: "tests/domain/test_style_refinement.py::test_motif_rejects_svg_like_value"
        status: pass
      - kind: unit
        ref: "tests/domain/test_style_refinement.py::test_extra_key_is_rejected_at_construction"
        status: pass
    human_judgment: false
  - id: "STY-02-zod-mirror-parity"
    description: "StyleRefinementSchema = z.strictObject mirroring the Pydantic model field-for-field"
    requirement: "DM-05, STY-02 (§5.3)"
    verification:
      - kind: unit
        ref: "src/rpc/contracts/style-refinement.spec.ts -- schema-key parity check"
        status: pass
      - kind: unit
        ref: "tests/domain/test_style_refinement.py::test_export_style_refinement_schema_keys"
        status: pass
      - kind: integration
        ref: "tsc --noEmit"
        status: pass
      - kind: integration
        ref: "biome check ."
        status: pass
      - kind: integration
        ref: "ruff check ."
        status: pass
    human_judgment: false
  - id: "STY-02-bounded-lists"
    description: "sub_palette 1..16, motif optional, accent_weight 0..1 -- anti-DoS bornes (§4.1 #4)"
    requirement: "T-02-04 (§4.1 #4)"
    verification:
      - kind: unit
        ref: "tests/domain/test_style_refinement.py::test_sub_palette_empty_is_rejected"
        status: pass
      - kind: unit
        ref: "tests/domain/test_style_refinement.py::test_sub_palette_too_long_is_rejected"
        status: pass
      - kind: unit
        ref: "tests/domain/test_style_refinement.py::test_accent_weight_bounds_accepted (3 params)"
        status: pass
      - kind: unit
        ref: "tests/domain/test_style_refinement.py::test_accent_weight_out_of_range_rejected (4 params)"
        status: pass
    human_judgment: false
  - id: "STY-02-closed-Literals"
    description: "stroke_pick / radius_pick closed Literal enums (3 values each)"
    requirement: "STY-02 (§5.3)"
    verification:
      - kind: unit
        ref: "tests/domain/test_style_refinement.py::test_unknown_stroke_pick_value_is_rejected"
        status: pass
      - kind: unit
        ref: "tests/domain/test_style_refinement.py::test_unknown_radius_pick_value_is_rejected"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/style-refinement.spec.ts -- literal constants parity"
        status: pass
    human_judgment: false
  - id: "STY-02-shared-rejection-harness"
    description: "10 shared rejection cases consumed by pytest parametrize AND vitest it.each (D-06/D-08)"
    requirement: "D-06/D-07/D-08, STY-02 (§5.3)"
    verification:
      - kind: integration
        ref: "pytest tests/domain/test_style_refinement.py -q (10 rejection cases)"
        status: pass
      - kind: integration
        ref: "vitest run style-refinement (10 rejection cases)"
        status: pass
      - kind: integration
        ref: "pytest tests/ -q (full suite, 383 passed)"
        status: pass
      - kind: integration
        ref: "vitest run (full suite, 122 passed)"
        status: pass
    human_judgment: false
  - id: "D-18-verify-unchanged"
    description: ".github/workflows/verify.yml byte-identical (D-18, doctrine the gate is the gate)"
    requirement: "D-18"
    verification:
      - kind: other
        ref: "git diff --exit-code -- .github/workflows/verify.yml (exit 0)"
        status: pass
    human_judgment: false
duration: "12 min"
started: "2026-08-30T16:36:43Z"
completed: "2026-08-30T16:47:00Z"
tasks: 3
files: 8
status: complete
---

# Phase 2 Plan 02: StyleRefinement delta-only contract Summary

StyleRefinement + StyleRefinementSchema mirror delivered: closed Pydantic delta-only model (5 fields, KebabToken/Literal/bornes), strict zod mirror with TOKEN_NAME_PATTERN import (no second declaration), and 10-case shared rejection harness consumed identically by pytest parametrize AND vitest it.each.

## Performance

| Metric | Value |
|--------|-------|
| Duration | 12 min |
| Started | 2026-08-30T16:36:43Z |
| Completed | 2026-08-30T16:47:00Z |
| Tasks | 3 |
| Files | 8 |
| Tokens | 6,426 (chars/4 over 6 task-changed files) |
| Commits | 3 (88f3107, 77632cd, 030a25a) |

Within estimate band (32k tokens budget, 6.4k actual) — well under. The plan's `confidence: low` was driven by uncertainty around zod v4 `.nullable().optional()` + `.default()` semantics; resolved locally with the schema-key parity + 10 rejection cases all green.

## Accomplishments

- **STY-02 partial closed model delivered** (§5.3 verbatim): the 5-field `{sub_palette, motif, stroke_pick, radius_pick, accent_weight}` closure is asserted by `test_field_set_is_exactly_the_locked_delta_only_set` against `model_json_schema()["properties"]` — adding a sixth field fails first.
- **KebabToken is the structural gate that makes the closure real**: `#fff` and `<path` payloads rejected in `sub_palette` and `motif` on both sides (CR-01, regex `^[a-z][a-z0-9-]*$`).
- **zod strictObject mirror** at `src/rpc/contracts/style-refinement.schema.ts`: TOKEN_NAME_PATTERN imported from `style-spec.schema.js` (single source of truth), `STROKE_PICK_VALUES` / `RADIUS_PICK_VALUES` exposed as `as const` arrays for parity assertions.
- **Schema-keys parity artifact** `fixtures/bridge/style-refinement.schema-keys.json` written by `pytest -k export`, consumed by `vitest run style-refinement` (`Object.keys(StyleRefinementSchema.shape)` == expected).
- **10 shared rejection cases** in `fixtures/rejection-cases/style-refinement.json` covering hex-like sub_palette (sr01), svg-like motif (sr02), kebab newline (sr03, CR-01), unknown stroke/radius pick (sr04/sr05), accent_weight bounds (sr06/sr07), sub_palette length bounds (sr08/sr09), extra key (sr10, rejection-only path-asymmetry per D-08).
- **D-18 doctrine upheld**: `.github/workflows/verify.yml` byte-identical (`git diff --exit-code` exit 0); new tests picked up by the existing `pytest -k export` → `npx vitest run` → `pytest tests/ -q` chain.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | StyleRefinement Pydantic delta-only model + structural tests | `88f3107` | `lottie_forge/domain/style_refinement.py`, `tests/domain/test_style_refinement.py` |
| 2 | StyleRefinement zod strictObject mirror + schema-keys parity | `77632cd` | `src/rpc/contracts/style-refinement.schema.ts`, `src/rpc/contracts/style-refinement.spec.ts`, `tests/domain/test_style_refinement.py` |
| 3 | StyleRefinement shared rejection harness (D-06/D-08) | `030a25a` | `fixtures/rejection-cases/style-refinement.json`, `src/rpc/contracts/rejection-cases.ts`, `src/rpc/contracts/style-refinement.spec.ts`, `tests/bridge/rejection_loader.py`, `tests/domain/test_style_refinement.py` |

## Files Created / Modified

**Created:**
- `lottie_forge/domain/style_refinement.py` — `StyleRefinement` Pydantic strict, `STRICT_CONFIG` + `KebabToken` imported (never re-declared).
- `src/rpc/contracts/style-refinement.schema.ts` — `StyleRefinementSchema` zod strictObject mirror.
- `src/rpc/contracts/style-refinement.spec.ts` — local mirror rejets (15 tests) + shared harness (10 cases) = 25 vitest tests.
- `fixtures/rejection-cases/style-refinement.json` — 10 shared rejection cases (D-08 format).
- `fixtures/bridge/style-refinement.schema-keys.json` — schema-keys parity artifact (sorted property names).

**Modified:**
- `tests/bridge/rejection_loader.py` — added `"style-refinement": "style-refinement.json"` to `CONTRACT_FILES`.
- `src/rpc/contracts/rejection-cases.ts` — same entry on the TS side.
- `tests/domain/test_style_refinement.py` — 19 structural tests + 1 export test + 10 rejection harness cases = 30 pytest tests.

## Decisions Made

- **delta-only by construction**: chose the 5-field §5.3 set verbatim rather than add a hex override / numeric stroke field — the closure IS the gate. A future change adds a 6th field = structural same-commit change to both Python and TS mirrors (the schema-keys parity test fails first).
- **motif optional via `KebabToken | None = None`** (Python) / `.nullable().optional()` (zod): mirrors the doc's "motif rôle sémantique" without forcing a default value. Pydantic strict rejects `"#fff"` and `"<path"` whether or not motif is set.
- **TOKEN_NAME_PATTERN imported, not redeclared** (style-refinement.schema.ts → style-spec.schema.ts): the single source of truth per CR-01; the structural same-commit scan in `tests/domain/test_vocabulary.py` (already in place from 02-01) would catch a second declaration.
- **STROKE_PICK_VALUES / RADIUS_PICK_VALUES as `as const` arrays** (TS): exposes the locked Literal as a runtime checkable + tuple-typed constant; the spec file asserts `[...STROKE_PICK_VALUES] === ["thin", "default", "bold"]` for parity.
- **sr10-extra-key uses rejection-only mode** (no expect_paths): per the D-08 path-asymmetry pattern documented in Phase 1, the zod `unrecognizedKeys` issue's path differs from the pydantic field-level loc — so we assert rejection only and let the membership assertion remain `true`.

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria for all 3 tasks verified, all 4 verification commands pass.

## Issues Encountered

- **zod v4 `.nullable().optional()` formatting**: biome formatter initially rejected the multi-line `sub_palette` chain (`.array().min(1).max(16)` collapsed to one line). Fixed by reformatting inline; biome check now green.
- **Backtick-in-backtick parse error** in the schema-keys parity error message: removed the inner backticks to avoid the oxc/vite parser trap. The error string is still informative without the embedded command.

## User Setup Required

None — no external service configuration required. Pure local contract + harness additions.

## Next Phase Readiness

- The TypeScript `style-refinement` bridge file (planned in 02-02 PATTERNS) is shipped; no contract work pending for plan 02-03 (content_hashes extension to 4 fields).
- The Phase 6 `StyleRefiner` agent can now consume `StyleRefinement` / `StyleRefinementSchema` to emit delta-only payloads rejected by both layers.
- The Phase 7 Translator can add the `sub_palette ⊆ StyleSpec.palette` cross-reference on top of the closed type already shipped.
