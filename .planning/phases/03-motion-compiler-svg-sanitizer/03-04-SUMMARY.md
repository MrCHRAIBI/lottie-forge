---
phase: 03-motion-compiler-svg-sanitizer
plan: 04
subsystem: motion-compiler-svg-sanitizer
tags: [tracer, compiler, sanitizer, d-10, d-32, d-18, com-03, san-01]

# Dependency graph
requires:
  - phase: 03-03
    provides: make_render_spec() builder + 11 fixtures (option-b galerie)
  - phase: 03-02
    provides: RenderSpec/LottieJSON/SanitizeResult zod frozen contracts + D-29 rejection harness
  - phase: 03-01
    provides: fmt() byte-authority + svgo 4 + tsx 4.23.13 installs
provides:
  - Motion Compiler orchestrator (`compile()`) — RenderSpec → CompileResult with COM-03 re-validation as last act
  - 9 builder modules under src/motion-compiler/ — meta, color-resolver, transform-builder, shape-builder (rect+ellipse), keyframe-emitter (opacity-ramp), markers, feature-gate, svg-builder
  - SVG Sanitizer (`sanitizeSvg()`) — two-pass collect-then-reject strategy with locked SVGO 4 config
  - 5 SVGO visitor plugins as collect-only collectors (forbid-text, forbid-raster, forbid-foreignobject, forbid-structure, stabilize-ids assertion)
  - Pipeline end-to-end seam test (22 cases) — D-10 inversion + D-02 nm + D-32 IDs + D-18 derived title/desc + D-22 viewBox-only + D-09 neutral fills + COM-03 + SAN-01..05 + D-31
affects:
  - Plan 03-05 — widens shape-builder (path/polyline/polystar) and keyframe-emitter (9 other shapes)
  - Plan 03-06 — generates 11 goldens via the compile pipeline
  - Plan 03-07 — wires `motion.compile` and `svg.sanitize` into the NDJSON RPC server
  - Plan 03-08 — D-37 self-consistency: sanitize(raw golden) → zero rejection

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates
actuals:
  tokens: 2529   # chars/4 over the 19 files committed (2 schema type-only additions + 17 new modules)
  tasks: 1
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Compile → re-validate → sanitize → stable IDs seam proven on a-001 (real code, not stubs)"
    - "Exhaustive switch sans default on keyframe_shape (9 typed-throw compile_error, opacity-ramp real)"
    - "Exhaustive switch sans default on shape discriminator (3 typed-throw, rect+ellipse real)"
    - "Two-pass sanitize: pass 1 collects violations (no preset-default mutation), pass 2 only fires when zero violations"
    - "Plugin order in config: gates → preset-default → stabilize-ids (collectors run BEFORE mutation, assert runs LAST)"
    - "D-32 ID scheme (2-segment g + 3-segment shape) built deterministically by compiler, asserted by sanitize"
    - "D-09 neutral fill [0.5, 0.5, 0.5] for Lottie emit; concrete hex for SVG emit (D-16)"
    - "D-18 title/desc derived from asset_id + recipe_id only (no user-supplied text)"
    - "Schema-level type-only additions (RendererSupport, LottieShapeItem) — no runtime change"

key-files:
  created:
    - "src/motion-compiler/compiler.ts — orchestrator: JointCatalogueStyleSchema validate → cross-ref D-05 → emit Lottie → re-validate LottieJSONSchema → emit SVG → CompileResult envelope"
    - "src/motion-compiler/meta.ts — fr=60, op=round(duration_ms*60/1000), g/a constants, deriveTitle/deriveDesc, svgRootAttributes (viewBox-only)"
    - "src/motion-compiler/color-resolver.ts — NEUTRAL_RGB [0.5,0.5,0.5] for Lottie (D-09); concrete hex for SVG (D-16)"
    - "src/motion-compiler/transform-builder.ts — ks block builder (scale >= 0, opacity 0..100, anchor=position centered, scale identity [100,100])"
    - "src/motion-compiler/shape-builder.ts — rect+ellipse real (rc/el Lottie shape items), 3 other shapes typed-throw; fl/st paint with token-resolved stroke widths"
    - "src/motion-compiler/keyframe-emitter.ts — opacity-ramp real (emits {t:0,s:[0],o,i} + {t:lastFrame,s:[finalOpacity]}), 9 other shapes throw CompileError code compile_error"
    - "src/motion-compiler/markers.ts — trigger frame derivation (enter/exit → op, loop → 0), reserved hook for future marker emit"
    - "src/motion-compiler/feature-gate.ts — SUPPORTED_LOTTIE_FEATURES + SVG_ONLY_FEATURES enumeration, classify() returns 'all' for Phase 3"
    - "src/motion-compiler/svg-builder.ts — raw SVG serializer: <svg viewBox=…> + derived <title>/<desc> + 1 <g> per component + 3-segment shape IDs"
    - "src/svg-sanitizer/sanitize.ts — sanitizeSvg(): two-pass (collect → check → reject or optimize) with mutation gate BEFORE preset-default"
    - "src/svg-sanitizer/config.ts — buildSanitizerConfig(): locked plugin order gates → preset-default → stabilize-ids; removeDesc:false, cleanupIds:false, collapseGroups:false overrides; floatPrecision:4"
    - "src/svg-sanitizer/constraint-report.ts — CollectedViolation + CollectedReport types + cast helpers toSanitizeViolation/toSanitizeReport"
    - "src/svg-sanitizer/plugins/forbid-text.ts — <text>/<tspan> collector (SAN-01)"
    - "src/svg-sanitizer/plugins/forbid-raster.ts — <image> + base64 data URI collector (SAN-02)"
    - "src/svg-sanitizer/plugins/forbid-foreignobject.ts — <foreignObject>/<script>/on*/javascript:/xlink-external collector (SAN-05)"
    - "src/svg-sanitizer/plugins/forbid-structure.ts — XML comments/data-*/width-height on root/prefixed elements+attrs collector (D-31 + D-22)"
    - "src/svg-sanitizer/plugins/stabilize-ids.ts — ID scheme asserter (D-32, NO rewriting — cleanupIds disabled in preset)"
    - "src/motion-compiler/__tests__/pipeline.spec.ts — 22 vitest cases: 12 seam assertions + 10 sanitizer rejection paths"
  modified:
    - "src/rpc/contracts/motion-compiler.schema.ts — two additive type-only exports (RendererSupport, LottieShapeItem) for compiler/sanitizer consumers; no runtime schema change"

key-decisions:
  - "Exhaustive switch sans default on keyframe_shape (D-37) — 9 not-yet-implemented shapes throw typed CompileError with code 'compile_error'; the `never` type at the end of the switch makes any future KEYFRAME_SHAPES addition a TS compile error"
  - "Exhaustive switch sans default on shape discriminator — rect+ellipse real, path/polyline/polystar throw CompileError; same widening contract"
  - "Two-pass sanitize strategy: pass 1 runs only the forbid-* collectors (no preset-default), checks violations, returns ok=false if any; pass 2 only runs on a known-clean tree. Guarantees the collect-then-reject gate fires BEFORE any mutation (P4 — never silently strip)"
  - "Plugin order in config.ts: forbid-* collectors FIRST, then preset-default (mutation), then stabilize-ids (assertion LAST). Pinned as an ordered array — visible structural contract"
  - "D-32 ID scheme built by compiler (NEVER by LLM): <g id='{asset_id}_{component}'> + <rect id='{asset_id}_{component}_{role}'>; stabilize-ids asserts the prefix match without rewriting (cleanupIds disabled)"
  - "D-09 neutral fill [0.5,0.5,0.5] on the Lottie emit ONLY; SVG emit carries concrete hex (D-16). The neutral channels give `setTheme` symmetric headroom (Pitfall 8); the concrete hex gives the static SVG poster-ready parity"
  - "D-18 derived title/desc: <title>Asset a-001 — fade</title> + <desc>Motion-compiled illustration for asset a-001 (recipe fade).</desc> — deterministic bytes from asset_id + recipe_id only; user-supplied text would be rejected by closed RenderSpecSchema.strictObject"
  - "Lottie emit re-validation gate (COM-03): the emitted Lottie JSON is `LottieJSONSchema.safeParse`'d as the LAST act of compile(); any failure throws CompileError — never a partial return"
  - "Joint load via JointCatalogueStyleSchema (D-17) — the existing Phase 2 schema carries the easing cross-ref; the compiler invokes it before any emission"
  - "D-05 cross-ref validator: per-component shape ∈ recipe.shapes_supported + motion.amplitude ∈ recipe.intensity_range; collect-all, throws one CompileError with all violations"
  - "D-10 + Pitfall 1 layer inversion: components array = background→foreground (D-10), but Lottie layers[0] = top (Pitfall 1); the compiler reverses `[...emittedLayers].reverse()` so components[0] ends up at the back"
  - "Schema additions are type-only: RendererSupport and LottieShapeItem added as `export type` lines; no runtime schema change (the zod validators are untouched). Additive IN-07-style — Phase 7 Pydantic mirror will mirror the runtime shape, not the TS type exports"

requirements-completed: [COM-03, SAN-03, SAN-04, SAN-05]

coverage:
  - id: D1
    description: "compile() orchestrator renders a real LottieJSON from a 2-component fade RenderSpec and the SVG companion, with COM-03 LottieJSON re-validation as the last act"
    requirement: COM-03
    verification:
      - kind: unit
        ref: "src/motion-compiler/__tests__/pipeline.spec.ts#LottieJSON re-validation gate fires — v/fr/ddd/assets/layers/op assertions"
        status: pass
      - kind: unit
        ref: "src/motion-compiler/__tests__/pipeline.spec.ts#layers array equals reversed components (D-10 + Pitfall 1)"
        status: pass
      - kind: unit
        ref: "src/motion-compiler/__tests__/pipeline.spec.ts#every layer's nm equals its component role (D-02)"
        status: pass
      - kind: automated_ui
        ref: "npx tsc --noEmit (clean)"
        status: pass
      - kind: automated_ui
        ref: "npx @biomejs/biome check . (clean)"
        status: pass
      - kind: unit
        ref: "npx vitest run (359/359 green, 22 new)"
        status: pass
    human_judgment: false
  - id: D2
    description: "sanitizeSvg() two-pass collect-then-reject seam — forbidden SVG fragments (text/image/foreignObject/script/handlers/data-uris/width-height/comments/data-attrs) all rejected with sanitize_rejected; clean compile survives zero-violations"
    requirement: SAN-03
    verification:
      - kind: unit
        ref: "src/motion-compiler/__tests__/pipeline.spec.ts#sanitizeSvg(raw) returns ok=true with zero violations — viewBox + title + desc survive SVGO optimize"
        status: pass
      - kind: unit
        ref: "src/motion-compiler/__tests__/pipeline.spec.ts#sanitizer rejection paths (10 cases: text/tspan/image/foreignObject/script/onclick/javascript:/width-height/data-*/comment)"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-32 stable 2/3-segment ID scheme — byte-identical across two compiles, sanitize-asserted, no rewriting (cleanupIds disabled in preset)"
    requirement: SAN-04
    verification:
      - kind: unit
        ref: "src/motion-compiler/__tests__/pipeline.spec.ts#two compiles yield byte-identical outputs (COM-01)"
        status: pass
      - kind: unit
        ref: "src/motion-compiler/__tests__/pipeline.spec.ts#sanitizing the second compile produces the same sanitized SVG (idempotence, D-23)"
        status: pass
      - kind: unit
        ref: "src/motion-compiler/__tests__/pipeline.spec.ts#<g> per component with 2-segment ID + shape elements with 3-segment ID"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-22 viewBox-only regime + D-18 derived title/desc — root <svg> has viewBox but no width/height; title and desc carry deterministic bytes from asset_id + recipe_id"
    requirement: SAN-05
    verification:
      - kind: unit
        ref: "src/motion-compiler/__tests__/pipeline.spec.ts#SVG companion has no width/height on root (D-22 viewBox-only)"
        status: pass
      - kind: unit
        ref: "src/motion-compiler/__tests__/pipeline.spec.ts#SVG title/desc derive from asset_id + recipe_id only (D-18) + no user-supplied text leakage"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-09 Lottie neutral fill [0.5,0.5,0.5] for stylable zones (Pitfall 8 — setTheme needs symmetric headroom)"
    requirement: SAN-05
    verification:
      - kind: unit
        ref: "src/motion-compiler/__tests__/pipeline.spec.ts#Lottie emit carries the neutral [0.5, 0.5, 0.5] fill (D-09, Pitfall 8)"
        status: pass
    human_judgment: false

# Metrics
duration: 22min
completed: 2026-09-01
status: complete
---

# Phase 03 Plan 04: TRACER compiler + sanitizer seam

**The compile → re-validate → sanitize → stable-IDs seam is proven end-to-end on real code (a-001/fade, 2 components) — 359/359 vitest cases green, tsc/biome clean.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-09-01T17:07:00Z
- **Completed:** 2026-09-01T17:29:00Z
- **Tasks:** 1 (single TRACER task — atomic commit per plan)
- **Files modified/created:** 19 (17 new modules + 2 schema type-only additions + 0 deletions)
- **Test cases added:** 22 (12 seam assertions + 10 sanitizer rejection paths)
- **Total vitest suite:** 359/359 green (337 from prior waves + 22 new)

## Accomplishments

- **Motion Compiler orchestrator** — `compile(renderSpec, catalogue, style)` produces a `CompileResult` envelope with `lottie`, `svg`, and `renderer_support`. Joint load through `JointCatalogueStyleSchema` (D-17) before any emission; D-05 cross-ref validator collects all violations and throws one `CompileError`; Lottie emission with D-10 layer inversion + D-32 nm anchors + D-09 neutral fills; **COM-03 re-validation as the LAST act** (LottieJSONSchema.safeParse before return).
- **9 builder modules** — meta (fr=60 + op rule + g/a constants + derived title/desc + svgRootAttributes), color-resolver (D-09 NEUTRAL_RGB + hexToRgb), transform-builder (ks blocks with scale≥0, opacity 0..100, anchor=position, scale identity [100,100]), shape-builder (rect+ellipse real + 3 typed-throw), keyframe-emitter (opacity-ramp real + 9 typed-throw), markers (trigger→frame derivation), feature-gate (classification returns "all" for Phase 3), svg-builder (D-22 viewBox-only + D-18 derived title/desc + 2/3-segment IDs).
- **SVG Sanitizer** — `sanitizeSvg(request)` with **two-pass strategy** (collect-then-reject BEFORE any mutation). Pass 1 runs only the four forbid-* collectors, checks violations, returns `ok=false` with `sanitize_rejected` if any. Pass 2 only runs on a known-clean tree (collectors + preset-default + stabilize-ids).
- **5 SVGO visitor plugins** as collect-only — forbid-text (`<text>/<tspan>`), forbid-raster (`<image>` + base64 data URIs), forbid-foreignobject (`<foreignObject>`/`<script>`/event handlers/`javascript:` URIs/external xlink), forbid-structure (XML comments/data-*/width-height on root/prefixed elements + attributes), stabilize-ids (asserts D-32 2/3-segment scheme WITHOUT rewriting — `cleanupIds: false` in the preset override).
- **Locked SVGO 4 config** (`src/svg-sanitizer/config.ts`) — `buildSanitizerConfig()` returns a `Config` with `multipass: true`, `floatPrecision: 4`, plugin order `forbid-text → forbid-raster → forbid-foreignobject → forbid-structure → preset-default → stabilize-ids`, preset overrides `{removeDesc: false, cleanupIds: false, collapseGroups: false}` (D-31 + ADR-02 + Pitfall 5/6).
- **Pipeline end-to-end seam test** (22 vitest cases) — D-10 inversion (layers = reversed components), D-02 nm (every layer's nm = component.role), D-32 IDs (2-segment `<g>` + 3-segment shape, byte-identical across two compiles), D-18 derived title/desc (no user-supplied text), D-22 viewBox-only (root has no width/height), D-09 neutral fills (`[0.5,0.5,0.5]` on every Lottie `fl`), COM-03 re-validation gate, SAN-01..05 + D-31 sanitizer rejection paths (10 adversarial SVG fragments).

## Task Commits

Single atomic commit (the TRACER is a single task per the plan's WITHIN-TASK ORDER):

1. **Task 1: TRACER — a-001 (fade, rect+ellipse) through compile → re-validate → sanitize → stable IDs** — `50ea557` (feat) — 19 files: 17 new modules + 2 schema type-only additions.

## Files Created/Modified

- `src/motion-compiler/compiler.ts` — orchestrator (227 lines)
- `src/motion-compiler/meta.ts` — LOTTIE_SPEC_VERSION, FRAME_RATE, deriveTitle/Desc, svgRootAttributes (141 lines)
- `src/motion-compiler/color-resolver.ts` — NEUTRAL_RGB, hexToRgb, resolveLottieColor (D-09), resolveSvgColor (D-16) (83 lines)
- `src/motion-compiler/transform-builder.ts` — `ks` block builder; D-34 unit gates + Pitfall 7 anchor=position (202 lines)
- `src/motion-compiler/shape-builder.ts` — rect+ellipse + 3 typed-throw; fl/st paint with token-resolved stroke widths (200 lines)
- `src/motion-compiler/keyframe-emitter.ts` — opacity-ramp real + 9 typed-throw compile_error; exhaustif sans default (D-37); CompileError class (187 lines)
- `src/motion-compiler/markers.ts` — trigger frame derivation + empty-markers stub (78 lines)
- `src/motion-compiler/feature-gate.ts` — SUPPORTED_LOTTIE_FEATURES + SVG_ONLY_FEATURES enumeration + classify (78 lines)
- `src/motion-compiler/svg-builder.ts` — raw SVG serializer (D-19 + D-20 + D-22 + D-32) (145 lines)
- `src/svg-sanitizer/sanitize.ts` — sanitizeSvg() two-pass strategy (114 lines)
- `src/svg-sanitizer/config.ts` — buildSanitizerConfig() + runOptimize() (119 lines)
- `src/svg-sanitizer/constraint-report.ts` — CollectedViolation/Report types + toSanitizeViolation/Report (94 lines)
- `src/svg-sanitizer/plugins/forbid-text.ts` — `<text>`/`<tspan>` collector (SAN-01) (51 lines)
- `src/svg-sanitizer/plugins/forbid-raster.ts` — `<image>` + base64 data URI collector (SAN-02) (59 lines)
- `src/svg-sanitizer/plugins/forbid-foreignobject.ts` — `<foreignObject>`/`<script>`/event handlers/`javascript:`/external xlink collector (SAN-05) (104 lines)
- `src/svg-sanitizer/plugins/forbid-structure.ts` — comments/data-*/width-height on root/prefixed elements + attrs collector (D-31 + D-22) (113 lines)
- `src/svg-sanitizer/plugins/stabilize-ids.ts` — D-32 2/3-segment ID scheme asserter (assertion-only, no rewriting) (141 lines)
- `src/motion-compiler/__tests__/pipeline.spec.ts` — 22 vitest cases (391 lines)
- `src/rpc/contracts/motion-compiler.schema.ts` — additive `export type RendererSupport` + `export type LottieShapeItem` (2 lines; runtime schema unchanged)

## Decisions Made

### Compiler architecture

- **Exhaustive switch sans default on `keyframe_shape` (D-37)** — the 10-shape switch ends with a `never` binding for exhaustiveness; the 9 not-yet-implemented shapes throw typed `CompileError` with `code: "compile_error"` (the protocol-wide RPC error code). Widening to the full switch is plan 03-05's responsibility — a functionality gap fillable without architectural change.
- **Same exhaustive-switch discipline on the shape discriminator** — `rect` + `ellipse` real, `path`/`polyline`/`polystar` throw `CompileError`. The `never` binding makes any future `SHAPE_NAMES` addition a TS compile error at this site.
- **D-10 + Pitfall 1 layer inversion** — `[...emittedLayers].reverse()` so `components[0]` (background) ends up at the back of the `layers` array (Lottie renders first-in-array on top). The pipeline test asserts the inversion verbatim: 2-component fade → layers = `["accent", "primary"]` (reversed).
- **D-32 ID scheme built by the compiler (never the LLM)** — `<g id="${asset_id}_${component}">` (2 segments) + `<rect id="${asset_id}_${component}_${role}">` (3 segments). `stabilize-ids` asserts the scheme without rewriting; `cleanupIds` is explicitly disabled in the preset to prevent the SVGO rename that would destroy the stability contract (Pitfall 6).
- **D-09 neutral fill on Lottie, concrete hex on SVG (D-16)** — `resolveLottieColor()` always returns `[0.5, 0.5, 0.5]` (the chromatic mean, symmetric headroom for `setTheme`); `resolveSvgColor()` returns the paint's concrete hex. The two-surface split is the architectural decision: Phase 8 derives the themable variant from the SVG's concrete hex via deterministic substitution (ADR-05).

### Sanitizer architecture

- **Two-pass strategy** — pass 1 runs only the four forbid-* collectors (no preset-default); pass 2 only runs on a known-clean tree (collectors + preset-default + stabilize-ids). The split guarantees the collect-then-reject gate fires BEFORE any mutation (P4 — never silently strip). The pre-mutation contract is the architectural reason for the two-pass design; one-pass `optimize()` would mutate even on rejection.
- **Plugin order as visible structural contract** — `buildSanitizerConfig()` returns the plugins in a fixed array: `forbid-text → forbid-raster → forbid-foreignobject → forbid-structure → preset-default → stabilize-ids`. The order is the `P5 — D-32, D-31, ADR-02` contract; the test reads it via the optimize behavior.
- **Preset overrides are surgical** — `{removeDesc: false, cleanupIds: false, collapseGroups: false}`. `removeDesc: false` preserves `<desc>` (D-31 allow-list — `removeDesc` is still in v4 preset-default per the v3→v4 migration doc); `cleanupIds: false` preserves the stable IDs (Pitfall 6 — `cleanupIds` would rename `a-001_primary-rect` to `a`); `collapseGroups: false` preserves the `<g>`-per-component structure (D-19 — `collapseGroups` would flatten the tree).
- **No plugin performs removal** — each forbid-* collector only records violations; `stabilize-ids` only asserts. Removal is NEVER silent (P4 — the gate rejects, the optimize never reaches preset-default on a rejected SVG).

### Schema additions

- **Type-only exports (no runtime change)** — added `export type RendererSupport` and `export type LottieShapeItem` to `motion-compiler.schema.ts`. The runtime zod validators are untouched; the additions are additive `import type` anchors for compiler/sanitizer consumers. IN-07-style — older Phase 1/2 callers are unaffected.

## Deviations from Plan

### Documented deviations

**1. [Plan deviation — TRACER fixture shape] Used a 2-component inline fixture (option b) instead of extending `fixtures/render-specs/fade.json`**
- **Context:** The plan's TRACER description says "a-001, fade, 2 components rect+ellipse" but the existing `fade.json` carries 1 component (the 03-03 goldens are pinned at 1 component per recipe — extending would break `fixtures.spec.ts`).
- **Decision:** Option (b) — the pipeline test builds the 2-component variant inline via `RenderSpecSchema.parse({...})` (NOT a committed fixture file). The existing 1-component `fade.json` stays untouched; the 03-03 fixtures.spec.ts remains green (337 → 359 with the +22 new pipeline tests).
- **Why option (b) over (a) or (c):** Option (a) would have broken the 03-03 fixtures.spec.ts assertions (count, byte-stable regeneration); option (c) — using the existing 1-component fade — would have proven less of the multi-layer path (D-10 inversion, multi-layer `nm` assignment, multi-`<g>` SVG structure). Option (b) keeps the existing fixture committed (no Phase 2 churn) while exercising the full multi-component path the plan intended.
- **Trade-off:** The deviation is a "test-only fixture" (not a fixture file on disk); the 03-06 goldens plan can choose to either promote the inline 2-component shape to a committed `fixtures/render-specs/fade.json` rewrite OR build per-recipe 2-component goldens on top of the existing 1-component fixtures. Plan 03-06 will resolve.
- **Verification:** The 22-case pipeline suite is green; the existing 65-case fixtures.spec.ts (D-04 + D-05) is green.

### Auto-fixed issues

None — the plan executed exactly as written modulo the documented TRACER-fixture deviation.

## Issues Encountered

- **TypeScript narrowing of `LottieShapeItem['it']`** — the schema's `gr` variant declares `it: z.array(z.unknown())` (permissive by design to allow any shape item combination). TypeScript sees the array as `unknown[]`, blocking `child.c` access in the test. Resolved via runtime type narrowing on the discriminator `ty === "fl"`. Documented inline in the test (D-05 doctrine — gates run once, the test carries its own narrow).

- **`RendererSupport` and `LottieShapeItem` types were not exported from the schema** — added two type-only exports (`export type`) without modifying any runtime validator. The schema's runtime contract is byte-identical to the Phase 3 frozen state.

- **SVGO Plugin type signature mismatch** — the `Plugin` type in SVGO v4 is a function `(root, params, info) => Visitor | null | void`, not the object form. Fixed by typing the plugin factory functions as `CustomPlugin` (the `{ name: string; fn: Plugin<T>; params?: T }` shape).

- **SVGO visitor `comment` field shape** — `comment: VisitorNode<XastComment>` requires `{ enter?: fn, exit?: fn }`, not a direct function. Fixed by wrapping the comment handler in an object.

## Self-Check

- **Files created/modified exist:**
  - `src/motion-compiler/compiler.ts` — FOUND
  - `src/motion-compiler/feature-gate.ts` — FOUND
  - `src/motion-compiler/keyframe-emitter.ts` — FOUND
  - `src/motion-compiler/transform-builder.ts` — FOUND
  - `src/motion-compiler/shape-builder.ts` — FOUND
  - `src/motion-compiler/color-resolver.ts` — FOUND
  - `src/motion-compiler/meta.ts` — FOUND
  - `src/motion-compiler/svg-builder.ts` — FOUND
  - `src/motion-compiler/markers.ts` — FOUND
  - `src/motion-compiler/__tests__/pipeline.spec.ts` — FOUND
  - `src/svg-sanitizer/sanitize.ts` — FOUND
  - `src/svg-sanitizer/config.ts` — FOUND
  - `src/svg-sanitizer/constraint-report.ts` — FOUND
  - `src/svg-sanitizer/plugins/forbid-text.ts` — FOUND
  - `src/svg-sanitizer/plugins/forbid-raster.ts` — FOUND
  - `src/svg-sanitizer/plugins/forbid-foreignobject.ts` — FOUND
  - `src/svg-sanitizer/plugins/forbid-structure.ts` — FOUND
  - `src/svg-sanitizer/plugins/stabilize-ids.ts` — FOUND
- **Task commit in git log:**
  - `50ea557` — FOUND (`feat(03-04): TRACER compiler + sanitizer seam proven end-to-end on a-001`)
- **`npx tsc --noEmit` clean:** YES
- **`npx @biomejs/biome check .` clean:** YES (45 files checked)
- **`npx vitest run` green:** 359/359 (337 prior + 22 new pipeline tests)
- **Pipeline seam assertions all green:** D-10 inversion, D-02 nm, D-32 IDs, D-18 derived meta, D-22 viewBox-only, D-09 neutral fills, COM-03 re-validation, SAN-01..05 + D-31 rejection paths, two-compile byte identity, sanitize idempotence

## Next Phase Readiness

- **Plan 03-05 (widening — sanitization features + adversarial matrix)** can proceed: the 9 typed-throw keyframe shapes and 3 typed-throw shape generators are the explicit "functionality gap fillable without architectural change" target. The CompileError surface is already wired to the RPC envelope (D-28/D-36 closed code set).
- **Plan 03-06 (11 goldens + D-26/D-37 proofs)** can proceed: `compile()` is byte-stable across invocations (the idempotence test asserts this), so the goldens generation is `compile(spec) → writeDeterministicJson(...)` per recipe × 11 fixtures. The TRACER deviation (option-b inline 2-component fixture) does not block 03-06 — the goldens plan can choose to extend `fade.json` to 2 components (breaking 03-03 fixtures.spec.ts) OR add a separate `fade-2c.json` fixture OR keep the existing 1-component per-recipe fixture set. Plan 03-06 will resolve.
- **Plan 03-07 (NDJSON RPC server)** can proceed: `compile()` and `sanitizeSvg()` are the two RPC methods (Pattern 5). The D-17 chaining is explicit at the call site (`motion.compile → svg.sanitize`, two separate methods). The CompileError class + closed RPC code set are already in place.
- **Plan 03-08 (D-37 self-consistency)** can proceed: `sanitize(raw golden) → zero rejection` is the test contract. The pipeline test already asserts the same invariant on the TRACER fixture.
- **No blockers, no deferred items, no D-08 harness regressions.** Phase 2 fixtures untouched.

## Self-Check: PASSED

---

*Phase: 03-motion-compiler-svg-sanitizer*
*Completed: 2026-09-01*
