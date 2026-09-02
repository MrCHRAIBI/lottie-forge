---
phase: 03-motion-compiler-svg-sanitizer
plan: 06
subsystem: motion-compiler
tags: [goldens, determinism, byte-equality, COM-01, SAN-03, D-26, D-37]

# Dependency graph
requires:
  - phase: 03-motion-compiler-svg-sanitizer
    plan: 03
    provides: 11 committed RenderSpec fixtures + canonical builders (D-04)
  - phase: 03-motion-compiler-svg-sanitizer
    plan: 04
    provides: TRACER seam (compile → sanitize) — the byte-emission surface
  - phase: 03-motion-compiler-svg-sanitizer
    plan: 05
    provides: widening to all 10 KEYFRAME_SHAPES + 5 SHAPE_NAMES + D-15 pose + feature-gate
provides:
  - compile-stdin.ts entry (RenderSpec JSON → deterministic envelope bytes)
  - update-goldens.mjs CI-guarded regenerator (D-37 gate)
  - 11 byte-exact goldens (10 recipes + galerie, combined envelope { lottie, svg, renderer_support, asset_id, recipe_id })
  - compiler.spec.ts (11 byte-equal tests + ink-visible + D-15 pose assertions)
  - determinism.spec.ts (3-way double-spawn proof on ≥ 3 representative fixtures, D-26/D-37)
  - ids.spec.ts (SAN-03 stable-ID proof on the SANITIZED output, Pitfall 6)
  - bugfix KeyframeArraySchema Pitfall 11 superRefine (intermediate-keyframe i+o enforcement)
affects: [phase-10-rebuild-doctrine, phase-4-anim-qa, phase-8-packager]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), not a harness token count.
actuals:
  tokens: 36000
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DETERMINISTIC JSON via compile-stdin walker (src/shared/format.ts authority)"
    - "Child-process spawn via tsx (Pitfall 8 — Node 20 no strip-types)"
    - "Buffer.compare byte-equality (NEVER toMatchFileSnapshot — auto-creates, contradicts D-25)"
    - "Double process spawn with ≥ 1 s anti-horodatage delay (D-26)"

key-files:
  created:
    - "scripts/compile-stdin.ts — stdin RenderSpec → envelope bytes via shared walker"
    - "scripts/update-goldens.mjs — CI guard + atomic regeneration"
    - "src/motion-compiler/__tests__/compiler.spec.ts — 11 byte-equal + pose assertions"
    - "src/motion-compiler/__tests__/determinism.spec.ts — 3-way double-spawn proof"
    - "src/motion-compiler/__tests__/ids.spec.ts — SAN-03 + D-32 output invariant"
    - "src/motion-compiler/__tests__/__test_helpers__/compile-and-check.ts — compile+serializer wrapper"
    - "src/motion-compiler/__tests__/__test_helpers__/compile-from-fixture.ts — fixture loader"
    - "src/motion-compiler/__tests__/__test_helpers__/golden-fixtures.ts — basename mapping"
    - "src/motion-compiler/__tests__/goldens/a-001.fade.golden.json"
    - "src/motion-compiler/__tests__/goldens/a-002.slide.golden.json"
    - "src/motion-compiler/__tests__/goldens/a-003.bounce.golden.json"
    - "src/motion-compiler/__tests__/goldens/a-004.pulse.golden.json"
    - "src/motion-compiler/__tests__/goldens/a-005.draw-on.golden.json"
    - "src/motion-compiler/__tests__/goldens/a-006.rotate.golden.json"
    - "src/motion-compiler/__tests__/goldens/a-007.scale-pop.golden.json"
    - "src/motion-compiler/__tests__/goldens/a-008.float.golden.json"
    - "src/motion-compiler/__tests__/goldens/a-009.wiggle.golden.json"
    - "src/motion-compiler/__tests__/goldens/a-010.orbit.golden.json"
    - "src/motion-compiler/__tests__/goldens/a-011.galerie.golden.json"
  modified:
    - "package.json — goldens:update script alias"
    - "src/rpc/contracts/motion-compiler.schema.ts — bugfix Pitfall 11 superRefine (intermediate-keyframe i+o rule)"

key-decisions:
  - "Golden envelope = { asset_id, recipe_id, renderer_support, lottie, svg } — combines Lottie + companion in one file (RESEARCH Open Question Q2: covers COM-01 'sorties identiques' byte-exactly for both artifacts in 1 file per fixture)"
  - "Buffer.compare byte-equality over toMatchFileSnapshot (RESEARCH Alternatives table: auto-creates goldens + rewrites via --update — contradicts D-25)"
  - "CI=true is the FIRST check in update-goldens.mjs (D-37 gate — the gate is the gate)"
  - "Determinism proof spawns tsx compile-stdin.ts (the same entry the RPC server uses at plan 03-07) — 3-way Buffer diff on ≥ 3 representative fixtures (slide/pulse/galerie)"
  - "Stable-ID proof runs on the SANITIZED output, not the raw compiler bytes (Pitfall 6 — proves the SVGO cleanupIds:false override is load-bearing; a future SVGO pin bump that re-introduces the rename would break this)"
  - "Atomic write order: regenerate all 11 envelopes IN MEMORY first, write to disk only after every compile succeeded (D-25 — never a half-regenerated set on disk)"

patterns-established:
  - "Golden file naming: <asset_id>.<recipe_id|galerie>.golden.json under src/motion-compiler/__tests__/goldens/, LF-terminated (D-24 + Pitfall 9)"
  - "Atomic regeneration: collect-in-memory-then-write-all (D-25)"
  - "Three-way byte-equality = A (process) === B (process, ≥1s later) === committed golden (D-26/D-37)"

requirements-completed: [COM-01, SAN-03]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "Golden pipeline entry — scripts/compile-stdin.ts reads RenderSpec JSON from stdin, runs compile+sanitize chain, writes the combined envelope { asset_id, recipe_id, renderer_support, lottie, svg } to stdout via the deterministic walker"
    requirement: COM-01
    verification:
      - kind: automated_cli
        ref: "node scripts/compile-stdin.ts < fixtures/render-specs/fade.json"
        status: pass
    human_judgment: false
  - id: D2
    description: "CI-guarded golden regenerator — scripts/update-goldens.mjs refuses CI=true (D-37), regenerates all 11 envelopes atomically (collect-in-memory-then-write-all), writes LF-terminated bytes via compile-stdin stdout (no os.EOL)"
    requirement: COM-01
    verification:
      - kind: automated_cli
        ref: "node scripts/update-goldens.mjs (PASS local) + CI=true node scripts/update-goldens.mjs (PASS refusal, exit 1) + node -e \"...all 0x0a...\" (PASS 11 LF-terminated files)"
        status: pass
    human_judgment: false
  - id: D3
    description: "11 byte-exact committed goldens (10 recipes + galerie) — envelope bytes regenerated in one shell, byte-identical between two consecutive local runs (idempotent)"
    requirement: COM-01
    verification:
      - kind: automated_cli
        ref: "node scripts/update-goldens.mjs; git status --short (no diff on second run)"
        status: pass
    human_judgment: false
  - id: D4
    description: "COM-01 byte-equality suite — compiler.spec.ts runs Buffer.compare against each committed golden for the 11 fixtures (never toMatchFileSnapshot); missing-golden throws with pointer to update-goldens.mjs"
    requirement: COM-01
    verification:
      - kind: unit
        ref: "src/motion-compiler/__tests__/compiler.spec.ts#byte-exact match against compiled envelope (11 cases) + dedicated 'deleted golden produces thrown error' guard test"
        status: pass
    human_judgment: false
  - id: D5
    description: "Per-fixture ink-visible + D-15 pose assertions — every golden has visible geometry (paint attribute on canonical 5-generator element set), animated property endpoints match the closed mapping (finale→last keyframe=t=static resting, loop→first keyframe=t=0=resting); trim-path variant inspected directly via `gr.it`"
    requirement: COM-01
    verification:
      - kind: unit
        ref: "src/motion-compiler/__tests__/compiler.spec.ts#SVG carries visible ink + D-15 pose: animated property endpoints match the closed mapping (11 cases each)"
        status: pass
    human_judgment: false
  - id: D6
    description: "D-26/D-37 double-process determinism proof — determinism.spec.ts spawns TWO independent tsx compile-stdin processes with a 1.1 s anti-horodatage delay (≥ 1 s per plan) on 3 representative fixtures (slide one-shot translate-in, pulse loop scale-breath, galerie multi-component multi-shape), three-way Buffer.compare asserts processA === processB === committed golden for all three"
    requirement: COM-01
    verification:
      - kind: integration
        ref: "src/motion-compiler/__tests__/determinism.spec.ts#a-002.slide.golden.json + a-004.pulse.golden.json + a-011.galerie.golden.json"
        status: pass
    human_judgment: false
  - id: D7
    description: "SAN-03 stable-ID proof on the SANITIZED output — ids.spec.ts extracts g+shape IDs from sanitized SVG and layer nm from Lottie for each of the 11 fixtures, three independent compile+sanitize cycles each (2 in-process + 1 process-spawned); asserts (a) 2/3-segment ID scheme on every fixture, (b) cross-regeneration ID multisets identical (diff=∅), (c) (component, role) uniqueness per asset"
    requirement: SAN-03
    verification:
      - kind: integration
        ref: "src/motion-compiler/__tests__/ids.spec.ts (11 fixtures × 3 cycles each = 33 cycles)"
        status: pass
    human_judgment: false
  - id: D8
    description: "Bugfix — KeyframeArraySchema Pitfall 11 superRefine: only flag 'next kf has i/o' when next kf IS the last keyframe (previous logic flagged EVERY intermediate kf, breaking COM-03 re-validation for 3+ keyframe shapes: overshoot-settle, scale-breath, damped-oscillation, circular-path)"
    requirement: COM-01
    verification:
      - kind: unit
        ref: "src/motion-compiler/__tests__/compiler.spec.ts + determinism.spec.ts + ids.spec.ts — all 3-keyframe+ recipes pass COM-03 re-validation"
        status: pass
    human_judgment: false

# Metrics
duration: 23 min
completed: 2026-09-02
status: complete
---

# Phase 3 Plan 06: Golden Pipeline Summary

**COM-01/SAN-03 CI-enforced proof — 11 byte-exact goldens + double-process determinism + sanitized-output stable IDs**

## Performance

- **Duration:** 23 min
- **Started:** 2026-09-02T13:04:48Z
- **Completed:** 2026-09-02T13:27:48Z
- **Tasks:** 2
- **Files modified:** 19 (created 16 + modified 1 + package.json + schema fix)

## Accomplishments
- **scripts/compile-stdin.ts** — Phase 3 golden entry: stdin RenderSpec JSON → combined envelope `{ asset_id, recipe_id, renderer_support, lottie, svg }` on stdout via the deterministic walker (D-23/D-24/D-35 byte-authority)
- **scripts/update-goldens.mjs** — stdlib-only CI-guarded regenerator (D-37); collects all 11 envelopes in memory FIRST then writes atomically; LF-only output (Pitfall 9)
- **11 byte-exact committed goldens** (10 recipes + galerie) under `src/motion-compiler/__tests__/goldens/`, idem­potent regeneration proven across consecutive runs
- **compiler.spec.ts** — 35 vitest cases: 11 Buffer.compare byte-equality tests + 11 ink-visible + 11 D-15 pose + 1 missing-golden guard + 1 count guard
- **determinism.spec.ts** — 3 vitest cases: slide (one-shot translate-in) + pulse (loop scale-breath) + galerie (multi-component), double-spawn with 1.1 s anti-horodatage delay, three-way Buffer.compare (process A === process B === committed golden) for all 3 (D-26/D-37)
- **ids.spec.ts** — 12 vitest cases (11 fixtures × 3 cycles + 1 fixture-level smoke): 33 total compile+sanitize cycles; SAN-03 stable IDs verified ON THE SANITIZED output (cleanupIds override load-bearing per Pitfall 6); asserts 2/3-segment scheme + cross-regeneration multiset equality + (component, role) uniqueness
- **bugfix motion-compiler.schema.ts** — Pitfall 11 superRefine on KeyframeArraySchema: previous implementation flagged every intermediate keyframe with i+o as 'last keyframe present' (COM-03 re-validation broken for 3+ keyframe shapes); fixed to only flag i+o when next kf IS the last
- **package.json goldens:update script** — human-friendly `npm run goldens:update` alias

## Task Commits

Each task was committed atomically:

1. **Task 1: Golden pipeline entry + CI guard + 11 byte-exact goldens** — `d5a4226` (feat + fix same-commit per D-25)
2. **Task 2: COM-01/SAN-03 proofs** — `c1f9003` (test)
3. **Plan metadata:** this SUMMARY.md

## Files Created/Modified
- `scripts/compile-stdin.ts` — Phase 3 golden pipeline entry, deterministic envelope on stdout
- `scripts/update-goldens.mjs` — stdlib-only CI guard + atomic regenerator
- `src/motion-compiler/__tests__/compiler.spec.ts` — byte-equal + ink + pose proofs
- `src/motion-compiler/__tests__/determinism.spec.ts` — double-process determinism proof
- `src/motion-compiler/__tests__/ids.spec.ts` — SAN-03 stable-ID proof on sanitized output
- `src/motion-compiler/__tests__/__test_helpers__/*` — shared compile+serializer + fixture loader + basename mapping
- `src/motion-compiler/__tests__/goldens/*` — 11 LF-terminated byte-exact envelopes
- `src/rpc/contracts/motion-compiler.schema.ts` — Bugfix to Pitfall 11 superRefine (intermediate-keyframe i+o rule, see Deviations §1)
- `package.json` — goldens:update script alias

## Decisions Made
- **Combined envelope format** `{ asset_id, recipe_id, renderer_support, lottie, svg }` — solves RESEARCH Open Question Q2: one envelope covers COM-01 byte-identity for BOTH Lottie and the companion SVG (1 file per fixture, 11 files total)
- **Buffer.compare over toMatchFileSnapshot** — RESEARCH Alternatives table warning: toMatchFileSnapshot auto-creates missing files and rewrites via --update, contradicting D-25 (CI compares only); explicit byte-equality with a fail-loud throw is the right shape
- **Atomic regeneration** — collect all 11 envelopes IN MEMORY first, write to disk only after every compile succeeded (D-25 forbids a half-regenerated committed set)
- **CI=true is the FIRST check** in update-goldens.mjs — the gate is the gate; a leaked CI env var cannot silently rewrite the bytes
- **Stable-ID proof runs on SANITIZED output** — proves the SVGO `cleanupIds: false` override is load-bearing (Pitfall 6); a future SVGO pin bump that re-introduces rename would break here

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Pitfall 11 superRefine in KeyframeArraySchema**
- **Found during:** Task 1 — running `node scripts/update-goldens.mjs` failed at `bounce.json` with `LottieJSON re-validation failed: the last keyframe must carry no i or o (Pitfall 11); present at index 1` (and similar on damped-oscillation, scale-breath, circular-path, sine-drift — all 3+ keyframe shapes)
- **Issue:** `KeyframeArraySchema.superRefine` flagged every intermediate keyframe with `i` or `o` as 'last keyframe present i/o'. The check needed to be conditional: `if (i + 1 === keyframes.length - 1)`. For 3-keyframe arrays (overshoot-settle emits 3), the overshoot (index 1) was incorrectly flagged; same pattern broke all multi-keyframe recipes
- **Fix:** Wrapped the existing `nextKf.i/o !== undefined` check in `if (i + 1 === keyframes.length - 1)`; added a complementary branch that requires intermediate kfs to carry i+o (Pitfall 4)
- **Files modified:** `src/rpc/contracts/motion-compiler.schema.ts`
- **Verification:** All 11 goldens regenerate cleanly; bounce.wiggle.scale-breath.* circular-path.* sine-drift.* damped-oscillation.* all pass COM-03 re-validation through compile() (proven by all 50 vitest cases in Task 2 specs + the regen audit)
- **Committed in:** `d5a4226` (Task 1 commit per D-25 same-commit discipline: goldens + scripts + schema fix all together)

## Issues Encountered
None.

## Known Stubs
None.

## Next Phase Readiness
- **Phase 10 rebuild doctrine** is anchored by these 11 byte-exact goldens — the rebuild of the entire motion surface from catalogue + style rebuilds these bytes (D-26/D-37 proof green on 3 representative fixtures; bounded not exhaustive by build-time only)
- **Plan 03-07 (RPC + adversarial sanitizer matrix)** can take the compile-stdin.ts entry as-is — the IPC seam is tested in Task 2 via process-spawned determinism + sanitized-output ID verification
- **Phase 4 Anim QA** + **Phase 8 Packager** will both consume `renderer_support` from the envelope + rely on ID stability (proven on sanitized output)

---

*Phase: 03-motion-compiler-svg-sanitizer*
*Completed: 2026-09-02*

## Self-Check: PASSED

**Files created (verified on disk):**
- scripts/compile-stdin.ts — FOUND
- scripts/update-goldens.mjs — FOUND
- src/motion-compiler/__tests__/compiler.spec.ts — FOUND
- src/motion-compiler/__tests__/determinism.spec.ts — FOUND
- src/motion-compiler/__tests__/ids.spec.ts — FOUND
- src/motion-compiler/__tests__/__test_helpers__/{compile-and-check,compile-from-fixture,golden-fixtures}.ts — FOUND (3 files)
- src/motion-compiler/__tests__/goldens/a-001.fade.golden.json through a-011.galerie.golden.json — FOUND (11 files, all LF-terminated)
- .planning/phases/03-motion-compiler-svg-sanitizer/03-06-SUMMARY.md — FOUND

**Files modified:**
- package.json (`goldens:update` script) — modified in d5a4226
- src/rpc/contracts/motion-compiler.schema.ts (Pitfall 11 superRefine bugfix) — modified in d5a4226

**Commit hashes present in git log:**
- d5a4226 feat(03-06): golden pipeline (compile-stdin + update-goldens) + 11 byte-exact goldens
- c1f9003 test(03-06): COM-01 byte-equal goldens + D-26/D-37 determinism + SAN-03 stable IDs
- 062104c docs(03-06): complete golden-pipeline plan

**Verify blocks PASS:**
- Task 1 verify (local regen, 11 LF-terminated files, CI=true refused) — PASS
- Task 2 verify (`npx vitest run` on the 3 spec files) — 50 cases PASS
- Full suite (`npx vitest run`) — 581 cases PASS
- `npx tsc --noEmit` — clean (no errors in 03-06 files)
- `npx @biomejs/biome check .` — clean (57 files, no fixes applied)
