---
phase: 03-motion-compiler-svg-sanitizer
plan: 02
subsystem: contracts-and-harness
tags: [zod, sanitizer, lottie-gate, frozen-contract, d-29, shared-rejection-harness, expect_code]

# Dependency graph
requires:
  - phase: 03-01
    provides: src/shared/format.ts byte-authority (D-23/D-24/D-35) — every Phase 3 producer will import through it; svgo + tsx install past blocking-human legitimacy checkpoint
provides:
  - RenderSpecSchema + CompileRequestSchema + CompileResultSchema (frozen at the Phase 3 zod layer, COM-03 schema boundary; the Phase 7 Pydantic mirror mirrors this module 1-for-1 per §6.3.1)
  - LottieJSONSchema re-validation gate (D-12 pin v="5.7.0" + ddd=0 + ty=4 + closed SHAPE_NAME union; rejects expression-channel `x`, legacy keyframe `e`, descending t, last-keyframe carries i/o, op<ip, negative scale, opacity out of 0..100 — COM-03/COM-04 schema layer)
  - SanitizeRequestSchema + SanitizeReportSchema + SanitizeResultSchema (D-17 chained-call surface; closed SANITIZER_VIOLATION_CATEGORIES literal; ok=true ⇔ empty violations + svg present)
  - `loadRenderSpecRejectionCases()` typed loader (D-29) — Phase 3 surface over the shared D-08 harness with closed `expect_code` validation
  - fixtures/rejection-cases/render-spec.json (14 cases) + fixtures/rejection-cases/lottie-json.json (11 cases) — one source, vitest today, pytest parametrize in Phase 7 without rewrite
affects:
  - src/rpc/contracts/rejection-cases.ts (additive: optional expect_code field, closed RPC code enum, fail-loud guard)
  - Every producer of bytes for the Phase 3 / Phase 4 / Phase 7 boundaries (the LottieJSON gate re-validates compiler output; the sanitizer report gates the SVG sale)
  - 03-03 (the make_render_spec builder must produce payloads that pass RenderSpecSchema.safeParse); 03-04/03-05 (the compiler re-validates through LottieJSONSchema before returning)

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates
actuals:
  tokens: 18200   # chars/4 over the 7 files committed (4 schema/spec pairs + 1 loader + 2 fixtures); fixtures dominate
  tasks: 3 (all auto, TDD-driven)
  commits: 3   # feat(03-02): contracts, feat(03-02): D-29 harness, docs(03-02): below

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive RejectionCase extension (IN-07): expect_code optional with default null; existing Phase 1/2 callers unaffected"
    - "Closed RPC code enum enforced at LOAD TIME (D-29) — a stray code never silently passes vitest while Phase 7 pytest would raise"
    - "Discriminated unions for the per-variant shape generator (D-01) and the fill/stroke paint variants (D-14) — unknown variants rejected before per-variant field check"
    - "Path-asymmetric (inherently non-symmetric) s-easing handles: per-dimension scalar OR 1-element array — the Lottie emit hybrid form"
    - "LottieJSON re-validation as a schema-layer gate (COM-03) — strictObject + closed ranges + superRefines; the compiler never returns a JSON that didn't pass LottieJSONSchema.safeParse"
    - "Frozen-convention sniffer: vocab/catalogue/asset patterns imported (recipe_id, asset_id, theme_anchor, motion block) — no second declaration site for any vocabulary"

key-files:
  created:
    - "src/rpc/contracts/motion-compiler.schema.ts — RenderSpec + LottieJSON + CompileResult gates (~430 lines, all STRICT-OBJECT)"
    - "src/rpc/contracts/motion-compiler.spec.ts — 76 vitest cases (Roles / Stroke / Shapes / Paints / Transforms / Components / LottieJSON / CompileResult / Rejection harnesses / expect_code guard)"
    - "src/rpc/contracts/sanitizer.schema.ts — SanitizeRequest + SanitizeReport + SanitizeResult + closed SANITIZER_VIOLATION_CATEGORIES"
    - "src/rpc/contracts/sanitizer.spec.ts — 13 vitest cases (empty edge, closed categories, ok=true ⇔ empty violations + svg present)"
    - "src/rpc/contracts/render-spec-rejection.ts — typed Phase 3 loader facade (loadRenderSpecRejectionCases('render-spec' | 'lottie-json'))"
    - "fixtures/rejection-cases/render-spec.json — 14 cases (expect_code validation_error, D-08 format extended)"
    - "fixtures/rejection-cases/lottie-json.json — 11 cases (expect_code validation_error, D-08 format extended)"
  modified:
    - "src/rpc/contracts/rejection-cases.ts — additive optional expect_code field, REJECTION_EXPECT_CODES closed set, fail-loud guard on stray codes, two new CONTRACT_FILES entries (render-spec, lottie-json)"
    - "src/rpc/contracts/rejection-cases.spec.ts — added Phase 3 contracts to the load-non-empty sweep"

key-decisions:
  - "D-02 role derived union built from `ThemeAnchorIdSchema.options + ['neutral']` via `z.enum` — keeps vocabulary import + neutral as a single source (no second declaration; same-commit doctrine holds)"
  - "Stroke-width token pinned to `thin|default|bold` (the locked StyleSpec.stroke_widths keys) — D-14 free-float stroke widths are structurally rejected at the gate"
  - "LottieJSON gate: ASCII-quoted `5.7.0` literal (D-12 pin) + literal ddd=0 + literal ty=4 (shape layers only) + closed SHAPE_NAME union (rect/ellipse/path/polyline/polystar) — every adjacent literal is rejected by the strictObject"
  - "Expression channel `x` is structurally impossible (strictObject on AnimatableProperty); legacy keyframe `e` key is structurally impossible (strictObject on Keyframe) — the gates are the gate"
  - "Keyframe-easing handles accept the hybrid form (per-dimension scalar OR 1-element array) — the Lottie emit emits both forms depending on linear vs bezier easings, the structural shape is identical"
  - "AnimatableProperty discriminatedUnion on `a` (0|1) — a static property carrying `a=1` is rejected; an animated property carrying `a=0` is rejected; structurally impossible to slip"
  - "Pitfall 11 array-level superRefine: strictly ascending t, every intermediate keyframe carries i AND o, the last carries NEITHER — pinned by the gate, not by convention"
  - "Negative-stretch gate on animated scale (s.a===1, kf.s.includes(<0)) AND static scale (Array.isNumber < 0) — the static path was a self-correction found during validation (COM-04)"
  - "Opacity 0..100 unit gate covers animated + static values (Pitfall 2) — found during validation: a static `o: {a:0, k:150}` initially passed because my superRefine only checked the animated branch"
  - "D-29 expect_code is OPTIONAL with default null — Phase 1/2 callers stay unchanged (IN-07 / additive). The closed enum (`REJECTION_EXPECT_CODES`) is the same as the protocol-wide error set, mirrors the Py side in Phase 7"
  - "Closed-enum fail-loud AT LOAD TIME — `assertRejectionEntryShape` raises if expect_code is non-null and non-closed; a stray code never silently slips through vitest while pytest would raise"
  - "SanitizeResult superRefine: `ok=true ⇔ empty violations + svg present`, `ok=false ⇔ at least one violation` — the cross-field invariant is enforced at the schema layer, not by caller discipline"
  - "Loader facade typed over the closed contract literal (`'render-spec' | 'lottie-json'`) — no stringly-typed contract name, no second declaration site for the typed Phase 3 surface"

requirements-completed: [COM-03, COM-04]

coverage:
  - id: D1
    description: "RenderSpecSchema frozen at the Phase 3 zod layer (D-01/D-02/D-06/D-07/D-13/D-14/D-32/D-34)"
    requirement: COM-03
    verification:
      - kind: unit
        ref: "src/rpc/contracts/motion-compiler.spec.ts (Shape / Paint / Transform / Component / RenderSpec schemas — 28 cases)"
        status: pass
      - kind: automated_ui
        ref: "npx tsc --noEmit (clean)"
        status: pass
      - kind: automated_ui
        ref: "npx @biomejs/biome check . (clean)"
        status: pass
human_judgment: false
  - id: D2
    description: "LottieJSONSchema re-validation gate pins v/ddd/ty + rejects expressions + legacy keyframes + malformed sequences + out-of-unit values (D-12 pin + COM-04)"
    requirement: COM-03
    verification:
      - kind: unit
        ref: "src/rpc/contracts/motion-compiler.spec.ts#LottieJSONSchema — D-12 pin + structural rejects (16 cases: adjacent-literal, expression-key, legacy-endpoint, scalar-s, descending-t, last-keyframe-handles, missing-handles, op<ip, negative-scale, opacity-bounds, empty-layers, fr-range, etc.)"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/motion-compiler.spec.ts#CompileResultSchema — closes the envelope; lottie re-validated by construction"
        status: pass
    human_judgment: false
  - id: D3
    description: "Sanitizer contract suite (SAN-01 empty edge + closed violation categories + ok=true ⇔ empty violations + svg present)"
    requirement: COM-04
    verification:
      - kind: unit
        ref: "src/rpc/contracts/sanitizer.spec.ts (13 cases: SanitizeRequest empty edge, SanitizeViolation closed enum, SanitizeReport, SanitizeResult cross-field invariant)"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-29 rejection harness extension — render-spec.json (14) + lottie-json.json (11), vitest it.each + load-time expect_code guard"
    requirement: COM-04
    verification:
      - kind: automated_ui
        ref: "node -e 'a/b >= 14/11 && every(case expect_code)' (matches plan acceptance criteria)"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/motion-compiler.spec.ts#RenderSpec rejection harness (14 cases) + #LottieJSON rejection harness (11 cases)"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/motion-compiler.spec.ts#loadRenderSpecRejectionCases — closed enum guard (throws on stray code)"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/rejection-cases.spec.ts (Phase 3 contracts added to the load-non-empty sweep)"
        status: pass
    human_judgment: false

# Metrics
duration: 18min
completed: 2026-09-01
status: complete
---

# Phase 03 Plan 02: Frozen Contracts + D-29 Rejection Harness

**The Phase 3 frozen contracts landed — RenderSpec/LottieJSON/sanitizer schemas with closed ranges, superRefines, and the D-29 shared rejection harness feeding vitest today and pytest in Phase 7 without rewrite.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-09-01T14:46:00Z
- **Completed:** 2026-09-01T15:04:47Z
- **Tasks:** 3 (all auto, TDD-driven; 1 file-update + 2 committed features)
- **Files modified/created:** 9 — 4 new schema/spec pairs + 1 loader + 2 fixtures + 2 additive extensions (rejection-cases + rejection-cases spec)

## Accomplishments

- `src/rpc/contracts/motion-compiler.schema.ts` — RenderSpec with closed 0..1 coords, 0.1..4 scale, -360..360 rotation, -1..1 translate, 1..8 components, snake_case verbatim (D-13), D-32 `(component, role)` uniqueness, D-34 cross-field rules (corner_radius ≤ min(w,h)/2, r_inner < r_outer)
- Same file — LottieJSON gate: literal `v="5.7.0"` (D-12), `ddd=0`, `ty=4`, closed-shape union, expression-channel impossible via strictObject, legacy keyframe `e` impossible, ascending-t + handle-on-everything-but-last (Pitfall 11), negative-stretch + opacity 0..100 unit gates
- Same file — CompileResult envelope closes the loop; `lottie` field is typed as `LottieJSONSchema` (re-validated by construction)
- `src/rpc/contracts/sanitizer.schema.ts` — `SanitizeRequest` (svg min 1, D-17 chained-call surface), `SanitizeReport` (closed SANITIZER_VIOLATION_CATEGORIES), `SanitizeResult` (cross-field invariant: `ok=true ⇔ empty violations + svg present`)
- `src/rpc/contracts/rejection-cases.ts` — additive `expect_code` field with closed RPC code set (`validation_error | sanitize_rejected | unsupported_feature | ...`); fail-loud AT LOAD TIME if a stray code is committed
- `src/rpc/contracts/render-spec-rejection.ts` — typed facade `loadRenderSpecRejectionCases('render-spec' | 'lottie-json')` — Phase 3 surface, no stringly-typed contract name
- `fixtures/rejection-cases/render-spec.json` — 14 cases (missing/malformed asset_id, unknown top-level key, 0/9 components, coord 1.5, negative radius, duplicate (component, role), invalid role, free-float stroke width, corner_radius > min/2, transform scale -1, polystar r_inner == r_outer, unknown recipe)
- `fixtures/rejection-cases/lottie-json.json` — 11 cases (v="5.9.0", ddd=1, ty=2, expression x, legacy e, scalar s, descending t, last-keyframe handles, op<ip, negative scale, empty layers)
- `src/rpc/contracts/motion-compiler.spec.ts` — 76 vitest cases pinning the regime (Role, Stroke, Shape, Paint, Transform, Component, RenderSpec, AnimatableProperty, LottieJSON, CompileResult, KeyframeShape, two rejection harnesses, the load-time guard)
- `src/rpc/contracts/sanitizer.spec.ts` — 13 vitest cases (empty edge, closed categories, ok ⇔ empty violations)
- Total test suite: 272/272 green (was 183 — +89 cases shipped by plan 03-02), `npx tsc --noEmit` clean, `npx @biomejs/biome check .` clean

## Task Commits

Each task was committed atomically:

1. **Task 1+2: Frozen Phase 3 contracts (motion-compiler + sanitizer)** — `571bf04` (feat) — the RenderSpec / LottieJSON re-validation / CompileResult and the Sanitizer request/report envelopes, with their behaviour suites
2. **Task 3: D-29 rejection harness extension** — `3d48022` (feat) — additive `expect_code` field, closed RPC code enum with load-time guard, render-spec-rejection.ts loader, render-spec.json (14) + lottie-json.json (11) fixtures, it.each suites + load-time guard test

**Plan metadata:** `docs(03-02): complete frozen contracts + D-29 harness plan` below.

## Files Created/Modified

- **`src/rpc/contracts/motion-compiler.schema.ts` (new)** — RenderSpecSchema, ShapeInputSchema (D-01 5-generator discriminated union with D-06 ranges + D-34 cross-field rules), PaintSchema (D-14 stroke-width token enum), TransformDeltaSchema (D-34 own ranges), ComponentSchema, RoleSchema (D-02 derived ThemeAnchor ∪ neutral), RenderSpecSchema (D-07 1..8 components, D-13 strictObject, D-32 superRefine), CompileResultSchema, LottieJSONSchema (D-12 pin, expression impossible via strictObject, ascending-t + handle rules), AnimatablePropertySchema (a=0|1 discriminated union), KeyframeSchema (Pitfall 3 + 11), TransformSchema (negative-stretch + opacity unit gates)
- **`src/rpc/contracts/motion-compiler.spec.ts` (new)** — 76 vitest cases (every behavior bullet → distinct test name); rejection harness `it.each` over render-spec.json + lottie-json.json; closed-enum load-time guard test
- **`src/rpc/contracts/sanitizer.schema.ts` (new)** — SanitizeRequestSchema + SanitizeViolationSchema + SanitizeReportSchema + SanitizeResultSchema, plus closed SANITIZER_VIOLATION_CATEGORIES and SANITIZER_ERROR_CODES tuples
- **`src/rpc/contracts/sanitizer.spec.ts` (new)** — 13 vitest cases
- **`src/rpc/contracts/render-spec-rejection.ts` (new)** — typed Phase 3 loader facade
- **`src/rpc/contracts/rejection-cases.ts` (modified)** — additive `expect_code` field, REJECTION_EXPECT_CODES closed enum, fail-loud load-time guard, render-spec + lottie-json entries in CONTRACT_FILES
- **`src/rpc/contracts/rejection-cases.spec.ts` (modified)** — Phase 3 contracts added to the load-non-empty sweep
- **`fixtures/rejection-cases/render-spec.json` (new)** — 14 cases, each carrying `case_id + expect_code + expect_paths + payload`
- **`fixtures/rejection-cases/lottie-json.json` (new)** — 11 cases, same shape

## Decisions Made

### Schema design

- **D-02 role derivation.** `RENDER_SPEC_ROLES = [...THEME_ANCHOR_IDS, "neutral"]` derived from the imported vocabulary (no second declaration site); `RoleSchema = z.enum(...)`. The `"neutral"` token is added at this layer so `vocabulary.py` stays a pure anchor id set and the schema structurally forbids arbitrary role strings. Structural lockstep holds: a vocabulary change edits vocabulary.schema.ts; this file's union auto-updates.
- **D-14 stroke-width token enforcement.** `PaintSchema` is a discriminated union on `kind` (`fill` or `stroke`); the stroke variant carries `stroke_width_token` as a `thin|default|bold` enum member. A free-float `stroke_width` key is rejected by `z.strictObject` at the gate — D-14 closed vocabulary, never a free float.
- **D-32 (component, role) uniqueness via `.superRefine`.** One issue per duplicate occurrence at explicit path `["components", idx, "role"]` — mirrors the recipe-id uniqueness doctrine already in place (catalogue.schema.ts). Path-asymmetry: zod's strict-object recognition rejects the parallel `(component, role)` pair in case-sensitivity probes, never a silent dedup.
- **DiscriminatedUnion over a static errorMap.** zod's `z.discriminatedUnion` doesn't accept an `errorMap` option in this version (TS2353 at compile time); the per-variant `z.strictObject` plus the closed path reporting carries the same precision.
- **LottieJSON re-validation as a schema layer.** `CompileResultSchema.lottie` is typed as `LottieJSONSchema`'s output; the compiler re-validates by calling `safeParse()` before returning. An invalid JSON cannot parse through the gate, even by accident.
- **Expression channel structurally impossible.** `AnimatablePropertySchema` is a `discriminatedUnion("a", [static, animated])`; both variants are strictObject; the expression-channel key `x` (and the legacy keyframe endpoint `e`) is rejected at the discriminator level — D-33 zero expressions, deliberate deviation from §6.3.4.
- **Keyframe-easing handle hybrid form.** Accepted both `z.strictObject({x: number, y: number})` and the Lottie-emit `z.strictObject({x: number | array<number>, y: ...})` form. Lottie emits the per-dimension array form for bezier easings and the scalar form for linear easings — both are valid shape-builder outputs.
- **Pitfall 11 array-level superRefine.** The strictObject on `KeyframeSchema` rejects the legacy `e` key by literal `unknown key`. The `superRefine` on the keyframe ARRAY enforces ascending t + every intermediate keyframe carries `i` AND `o` + the last carries NEITHER. COM-04 + D-37 captured both invariants.
- **Negative-stretch covers animated + static scale.** The `TransformSchema` `superRefine` checks `s.a === 1` (animated) AND the static path (the `s.a === 0` branch). Originally I missed the static branch — a `s: {a:0, k:-100}` payload slipped past. Caught and fixed during the static-opacity validation pass (see Deviations).
- **Opacity 0..100 unit gate covers animated + static.** Same pattern as scale. A static `o: {a:0, k:150}` initially passed; the static branch check was missing. Caught and fixed during validation.
- **SanitizeResult cross-field invariant.** `ok=true ⇔ empty violations + svg present`, `ok=false ⇔ at least one violation`. Pinned at the schema layer via superRefine — caller discipline isn't the gate.

### Harness design (D-29)

- **Additive `expect_code` field.** Optional with default `null`; the existing Phase 1/2 callers continue to work unchanged (IN-07 additive pattern).
- **Closed RPC code enum at load time.** `REJECTION_EXPECT_CODES` mirrors the protocol-wide error code set. The `assertRejectionEntryShape` guard validates that any present `expect_code` is in the closed set — a stray code fails the vitest run at load, not at test execution. This is the canonical source of truth; the Python mirror in Phase 7 will re-validate identically.
- **Phase 3 typed facade loader.** `loadRenderSpecRejectionCases('render-spec' | 'lottie-json')` (closed literal, no stringly-typed contract name). Lives in `render-spec-rejection.ts`, separate from the Phase 1/2 shared loader, so older consumers stay unaffected (IN-07).

### Fixture design

- **Membership-only path assertions.** `expect_paths` carries the precise membership path the gate is expected to emit (e.g. `["layers", 0, "ks", "o", "k", 1]`); the suite asserts membership via `JSON.stringify` round-trip. Path-membership only, never message-text comparison — D-08 verbatim.
- **Every case has an `expect_code`.** 14 + 11 cases all expect `validation_error` at the schema layer; the RPC layer maps the schema rejection to that code. The Python mirror in Phase 7 will assert the same code mapping.

## Deviations from Plan

### Self-corrections (Rule 1 — bugs in my own implementation)

**1. Static opacity `a:0 k:150` initially passed (Pitfall 2 unit gate)**
- **Found during:** Task 2 verification (LottieJSONSchema static-opacity spec case)
- **Issue:** My `TransformSchema.superRefine` for opacity only checked the `transform.o.a === 1` (animated) branch. A static `{a: 0, k: 150}` slipped past because `k: 150` is not an array — my `isOpacityOutOfRange` check was guarded by `Array.isArray(k)`.
- **Fix:** Added the explicit `(typeof k === "number" && (k < 0 || k > 100))` branch for the static path. Same fix applied to the negative-stretch scale check (`s < 0` static vs animated).
- **Files modified:** `src/rpc/contracts/motion-compiler.schema.ts`
- **Verification:** `npx vitest run src/rpc/contracts/motion-compiler.spec.ts` — opacity + scale static-path tests now pass; no animated behaviour changed.

**2. StrictObject double-strict in `KeyframeSchema`'s superRefine**
- **Found during:** biome lint pass
- **Issue:** I left an empty `superRefine` callback on `KeyframeSchema` (originally a stub). Biome flagged the unused `ctx` parameter; the schema itself didn't need a per-keyframe superRefine (the array-level `KeyframeArraySchema` carries the ascending-t + handles invariants).
- **Fix:** Removed the empty `superRefine` from `KeyframeSchema`. The schema is now a clean `z.strictObject` — unknown keys (`e`, `x`, ...) rejected; the array-level superRefine on `KeyframeArraySchema` retains the structural invariants.

**3. Biome formatter imperatives on motion-compiler.spec.ts**
- **Found during:** biome pass
- **Issue:** Biome wanted imports sorted (rejection-cases import moved before render-spec-rejection) and the `Set` constructor expressions collapsed to one line.
- **Fix:** `biome check --write` applied; tests re-run green after. No behavioural change.

### Auto-fixed

None beyond the above three self-corrections.

## Issues Encountered

None blocking. The static-opacity validation gate tripped my own implementation and the fix is recorded above.

## User Setup Required

None — no external service configuration. All schemas are pure zod; the D-08 fixture format extension is an additive change that existing callers (Phase 1/2 rejection harnesses) ignore.

## Next Phase Readiness

- **Plan 03-03 (fixtures + make_render_spec builder)** can proceed: `make_render_spec(overrides?)` will produce payloads that pass `RenderSpecSchema.safeParse()` by construction. The `expect_code` parity gate (`validation_error`) is now the wiring contract pytest consumes in Phase 7 without rewrite — the Python mirror just needs to know the closed RPC code set.
- **Plan 03-04 (the tracer)** can proceed: the compiler's re-validation step is `LottieJSONSchema.safeParse(emitted) === success` — the schema is the gate, not a convention.
- **No blockers, no deferred items, no stubs.**

## Self-Check

- **Files created/modified exist:**
  - `src/rpc/contracts/motion-compiler.schema.ts` — FOUND
  - `src/rpc/contracts/motion-compiler.spec.ts` — FOUND
  - `src/rpc/contracts/sanitizer.schema.ts` — FOUND
  - `src/rpc/contracts/sanitizer.spec.ts` — FOUND
  - `src/rpc/contracts/render-spec-rejection.ts` — FOUND
  - `src/rpc/contracts/rejection-cases.ts` — FOUND
  - `src/rpc/contracts/rejection-cases.spec.ts` — FOUND
  - `fixtures/rejection-cases/render-spec.json` — FOUND (14 cases)
  - `fixtures/rejection-cases/lottie-json.json` — FOUND (11 cases)
- **Task commits in git log:**
  - `571bf04` — FOUND (`feat(03-02): frozen Phase 3 motion-compiler + sanitizer contracts`)
  - `3d48022` — FOUND (`feat(03-02): D-29 rejection harness — render-spec (14) + lottie-json (11) shared fixtures + closed expect_code guard`)
- **`npx tsc --noEmit` clean:** YES
- **`npx @biomejs/biome check .` clean:** YES
- **`npx vitest run` green:** 272/272 (was 183 before this plan; +89 cases shipped)
- **fixtures parse + count check:** `node -e` one-liner returns `OK 14 11`
- **Closed-enum load-time guard test:** PASSES — `assertRejectionEntryShape({expect_code: "totally-unknown-code"}, ...)` throws with the expected message

## Self-Check: PASSED

---

*Phase: 03-motion-compiler-svg-sanitizer*
*Completed: 2026-09-01T15:04:47Z*


