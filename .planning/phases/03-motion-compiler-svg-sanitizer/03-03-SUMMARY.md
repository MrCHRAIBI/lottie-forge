---
plan: 03
phase: 03-motion-compiler-svg-sanitizer
wave: 3
completed: 2026-09-01
duration_min: 14
tasks: 2
files_changed: 14
autonomous: false
requirements: [COM-01]
---

# Plan 03-03 — make_render_spec builder + 11 fixtures + consistency spec

## Galerie decision (Task 1 — checkpoint:decision)

**Choice: option-b** — "Galerie under wiggle with 4 components (rect, ellipse, path, polyline); polystar coverage rides on the pulse/rotate/scale-pop/orbit recipe goldens" (per user's selection 2026-09-01).

**Rationale verbatim from user:** *"option-b (Recommandée)"*

**Why option-b over option-a:**

- option-a (extend wiggle's `shapes_supported` to add `polystar`) would have
  required a same-commit edit of `fixtures/recipe-catalogue/catalogue.json`
  + regenerate the prompt-fixture embedded copy + re-record sha values +
  re-export bridge artifacts. The D-13 / D-14 Phase 1-2 hash chain was at
  risk; rejected.
- option-b honors D-03 at the SET level — all 5 generators remain
  golden-covered across the 11-fixture set (polystar rides on the 4
  recipes whose `shapes_supported` already lists it: pulse, rotate,
  scale-pop, orbit).
- No Phase 2 fixture touched, no bridge re-run needed. Plans 03-04
  /03-05/03-07/03-08 are unblocked (the tracer compiles `a-001`/fade,
  which is option-b-independent).

## Summary of work (Task 2)

`src/motion-compiler/__tests__/make-render-spec.ts` — single-source TS
builder (D-04) mirroring `tests/bridge/fixtures.py` doctrine: one
`makeRenderSpec(recipeId)` function with canonical defaults, per-recipe
canonical shape choice documented inline (table in docblock), optional
`overrides` parameter for test variety. `makeGalerieFixture()` produces
the 4-component option-b galerie. `makeAllFixtures()` yields the full
sequence of 11 specs.

`src/motion-compiler/__tests__/fixtures.spec.ts` — 65 vitest cases across
4 `describe` blocks:

- **Builder invariants** (D-04): exactly 11 specs, every `asset_id`
  matches `^a-\d{3}$`, `style_ref` pinned to `example-style@1.0.0`,
  draw-on uses `paint.kind="stroke"` + `stroke_width_token="default"`.
- **Committed files** (D-24 + D-13): exactly 11 `.json` files, expected
  filenames present (10 recipes + galerie), every file ends with one
  `0x0a` byte (LF regime), every file parses through `RenderSpecSchema`
  (`it.each`, 11 cases).
- **Cross-ref consistency** (D-05 pre-check at fixture level): per recipe,
  shape generators ⊆ catalogue `shapes_supported`, `motion.amplitude`
  inside catalogue `intensity_range`, role set ⊆ `ThemeAnchorId ∪ {"neutral"}`
  (D-02). Draw-on stroke + path assertions. Galerie shape coverage
  (rect/ellipse/path/polyline, 4 distinct `(component,role)` pairs).
  Polystar coverage assertion across pulse/rotate/scale-pop/orbit.
- **Byte-stable regeneration**: regenerating from the builder yields a
  schema-equal result for every fixture (the byte-identity gate).

`scripts/regenerate-render-spec-fixtures.mts` — deterministic
regenerator (D-23/D-24): imports `makeAllFixtures()` from the builder,
emits the 11 files via `writeDeterministicJson()` (compact JSON + LF
terminator, never `os.EOL`). Run via `npx tsx
scripts/regenerate-render-spec-fixtures.mts`. Galerie is routed by
`asset_id` (`a-011`), not by recipe_id (because the galerie uses
`wiggle` as recipe_id — a filename-by-recipe mapping would clobber
`wiggle.json`).

`fixtures/render-specs/*.json` — 11 committed fixtures:

| File | asset_id | recipe | components | shape |
|------|----------|--------|------------|-------|
| `fade.json` | a-001 | fade | 1 | rect |
| `slide.json` | a-002 | slide | 1 | rect |
| `bounce.json` | a-003 | bounce | 2 | rect+rect |
| `pulse.json` | a-004 | pulse | 1 | polystar |
| `draw-on.json` | a-005 | draw-on | 1 | path (stroke + token "default") |
| `rotate.json` | a-006 | rotate | 1 | polystar |
| `scale-pop.json` | a-007 | scale-pop | 1 | polystar |
| `float.json` | a-008 | float | 1 | ellipse |
| `wiggle.json` | a-009 | wiggle | 1 | ellipse |
| `orbit.json` | a-010 | orbit | 1 | polystar |
| `galerie.json` | a-011 | wiggle | 4 | rect+ellipse+path+polyline |

Generator coverage across the set: rect (fade/slide/bounce/galerie),
ellipse (float/wiggle/orbit/galerie), path (draw-on/galerie), polyline
(galerie), polystar (pulse/rotate/scale-pop/orbit). All 5 generators
covered.

## Cross-reference coverage (D-05 pre-check at fixture level)

Every fixture passes:
- `RenderSpecSchema.safeParse` — strict naming (D-13), 1..8 components (D-07),
  closed ranges (D-06), (component, role) uniqueness (D-32), cross-field
  invariants (D-34).
- Shape generator ⊆ recipe's `shapes_supported` (D-05).
- `motion.amplitude` inside recipe's `intensity_range` (closed range per
  catalogue).
- Role set ⊆ `ThemeAnchorId ∪ {"neutral"}` (D-02).
- Draw-on uses `paint.kind="stroke"` + `stroke_width_token="default"`
  (D-14: trim-path is visible only on a stroke layer; bare-float stroke
  widths are structurally rejected by `PaintSchema`).

## Verification commands

```bash
# Fixture count gate
node -e "const fs=require('fs');const n=fs.readdirSync('fixtures/render-specs').filter(f=>f.endsWith('.json')).length;if(n!==11)process.exit(1)"

# Schema + cross-ref suite (D-04, D-05, D-13, D-14)
npx vitest run src/motion-compiler/__tests__/fixtures.spec.ts

# Static gates
npx tsc --noEmit
npx @biomejs/biome check .

# Full Phase 3 suite mirror
npx vitest run
```

All gates green at commit `17257db`:

- `npx tsc --noEmit` — clean
- `npx @biomejs/biome check .` — clean
- `npx vitest run src/motion-compiler/__tests__/fixtures.spec.ts` — 65/65 green
- `npx vitest run` — 337/337 green across 13 test files
- Fixture count — exactly 11 LF-terminated JSON files under `fixtures/render-specs/`

## Pre-baked gate for plan 03-06 (goldens)

These 11 fixtures are the inputs to the Motion Compiler (plan 03-04).
Plan 03-06 will compile each fixture into a `{lottie, svg,
renderer_support}` envelope and commit the bytes as goldens under
`src/motion-compiler/__tests__/goldens/`. The regenerator script and
the byte-stable-regeneration test in `fixtures.spec.ts` give the
doctrine the same shape as Phase 1's `make_*` bridge builders: one
source of truth, deterministic regeneration on demand, schema + cross-ref
gate at load time.

## Acceptance criteria

- [x] `makeRenderSpec()` is the single source of fixture truth (D-04).
- [x] 11 fixtures committed, cross-ref-consistent with catalogue + style
      (D-05 pre-check at fixture level).
- [x] D-03 × D-05 conflict resolved by explicit user decision (option-b),
      not planner discretion — choice recorded verbatim in this SUMMARY.
- [x] Draw-on fixture uses stroke paint + token reference (D-14).
- [x] All 11 fixtures LF-terminated with one `0x0a` byte (D-24 + Pitfall 9).
- [x] Every fixture parses through `RenderSpecSchema` (`it.each` matrix).
- [x] `npx tsc --noEmit` clean.
- [x] `npx @biomejs/biome check .` clean.
- [x] Full vitest suite (337/337) green — no other suite broken.

## Downstream impact

- Plan 03-04 (tracer): compiles `a-001`/fade — unblocked by option-b
  (no conflict).
- Plan 03-05 (sanitizer): compiles the Lottie + SVG companion —
  unblocked.
- Plan 03-06 (goldens + proofs D-26/D-37): regenerates the 11
  golden envelopes from these fixtures — unblocked.
- Plan 03-07 (RPC server): operates on these fixtures via the
  `motion.compile` method — unblocked.
- Plan 03-08 (D-37 self-consistency): runs `svg.sanitize` on each
  fixture's SVG output and asserts zero rejection — unblocked.

The galerie decision only affects the 03-06 goldens regeneration order
(option-b galerie = 4 components under wiggle, option-a would have been
5 components under an extended recipe). No Phase 2 churn.
