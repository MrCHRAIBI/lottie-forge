---
phase: 03-motion-compiler-svg-sanitizer
plan: 07
subsystem: svg-sanitizer
tags: [svg, sanitizer, svgo, security, gate, allow-list, regression, self-consistency, isomorphism]

# Dependency graph
requires:
  - phase: 03-motion-compiler-svg-sanitizer
    plan: 03
    provides: "11 RenderSpec fixtures + make_render_spec builder (D-04 / D-05)"
  - phase: 03-motion-compiler-svg-sanitizer
    plan: 04
    provides: "TRACER compiler + sanitizer seam (frozen SVGO 4 config + D-32 stabilize-ids plugin)"
  - phase: 03-motion-compiler-svg-sanitizer
    plan: 05
    provides: "Widened compiler surface (5 SHAPE_NAMES + 10 KEYFRAME_SHAPES + D-15 pose rule)"
provides:
  - "Hardened sanitizer seam: D-31 closed 9-element allow-list (svg/title/desc/g/path/rect/ellipse/polyline/polygon)"
  - "SANITIZER_PLUGIN_ORDER constant + assertPluginOrder self-check (P5 / D-31 / D-32)"
  - "collect-all doctrine preserved across all 4 forbid-* collectors + both passes (P4: never first-fail)"
  - "Defensive empty-input guard (SAN-01 empty edge — never a pass, never a thrown error)"
  - "Adversarial rejection matrix: 17 cases + 1 clean control + 2 collect-all proofs"
  - "ADR-02 SVGO regression: viewBox + title + desc + IDs survive optimize (SAN-04)"
  - "D-31/D-37 self-consistency + Lottie↔SVG isomorphism + ink visible over all 11 fixtures"
  - "Config-shape guard: the three named overrides (removeDesc/cleanupIds/collapseGroups) remain disabled; v3 plugins (removeViewBox/removeTitle/prefixIds) NOT re-added"
affects:
  - "Phase 4 (Anim QA): the gate is the upstream contract; smoke theming Ph 4 iterates on D-31 allow-list"
  - "Phase 5 (MFT-01): the SanitizeReportSchema + SanitizeResultSchema envelope persists to the manifest"
  - "Phase 8 (Packager): per-asset sanitized SVG is the dev-ready surface; ADR-02 regression locks the byte regime"

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), not a harness token count.
actuals:
  tokens: 13000    # chars/4 over the 4 commits (~52k chars across harden + guard + 3 test files)
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Closed element allow-list with case-sensitive exact name match (D-31 / ADR-02)"
    - "Plugin-order self-check via exported constant + assertPluginOrder helper (P5 / D-31 / D-32)"
    - "collect-all violations across all 4 forbid-* collectors + both passes (P4: never first-fail)"
    - "Defensive empty-input guard: structured ok=false with validation_error code, never a thrown error (SAN-01 empty edge)"
    - "Parametrized it.each matrix over hand-authored adversarial SVGs (gate-level assertion, never message text — D-08)"
    - "Lottie↔SVG isomorphism: layer[g.length-1-i] order == component order (D-10 / Pitfall 1)"

key-files:
  created:
    - src/svg-sanitizer/__tests__/sanitize.spec.ts
    - src/svg-sanitizer/__tests__/svgo-regression.spec.ts
    - src/svg-sanitizer/__tests__/self-consistency.spec.ts
  modified:
    - src/svg-sanitizer/plugins/forbid-structure.ts
    - src/svg-sanitizer/config.ts
    - src/svg-sanitizer/sanitize.ts

key-decisions:
  - "D-31 allow-list enforced as a 9-element closed set (svg/title/desc/g/path/rect/ellipse/polyline/polygon), case-sensitive exact name match — module-level guard asserts size=9; case variants + unknown elements + prefixed elements all fire forbidden-element (the proof of allow-list semantics, NOT blacklist)"
  - "SANITIZER_PLUGIN_ORDER exported as a typed const + assertPluginOrder helper fail-fasts on every sanitizeSvg call (P5: a future reorder breaks loud, never silently accepts)"
  - "Defensive empty-input guard: sanitizeSvg returns structured ok=false with code=validation_error on empty/null svg (SAN-01 empty edge — never a pass, never a thrown error)"
  - "collect-all doctrine preserved: a fixture violating 2 gates yields 2 violations in a single report (P4: never first-fail, never silently clean)"
  - "Config-shape guard: the locked SVGO 4 config must continue to disable removeDesc/cleanupIds/collapseGroups AND must NOT re-add removeViewBox/removeTitle/prefixIds (v3 plugins that v4's preset-default already excludes; re-adding them would re-activate the v3 behavior — the inverse of intent)"

patterns-established:
  - "Pattern 1: Gate plugin order is normative (SANITIZER_PLUGIN_ORDER) — every sanitize call asserts the order; collectors BEFORE preset-default, stabilize-ids AFTER"
  - "Pattern 2: Allow-list semantics (NOT blacklist) — every element enter is compared against the closed set; case variants + unknown elements fail the gate via the allow-list check"
  - "Pattern 3: Gate-level assertion (D-08 discipline) — adversarial matrix asserts the expected violation CATEGORY is in the report, never message text"
  - "Pattern 4: Lottie↔SVG isomorphism proof — layer[g.length-1-i] order == component order (D-10 / Pitfall 1); per-component shape types match between Lottie ty discriminators (rc/el/sh/sr) and SVG element names (rect/ellipse/path)"

requirements-completed: [SAN-01, SAN-02, SAN-04, SAN-05]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "Hardened sanitizer seam — D-31 closed 9-element allow-list (svg/title/desc/g/path/rect/ellipse/polyline/polygon) with case-sensitive exact name match + module-level size=9 guard; SANITIZER_PLUGIN_ORDER exported const + assertPluginOrder self-check fail-fasts on every sanitizeSvg call (P5 / D-31 / D-32); collect-all violations array shared across all 4 forbid-* collectors + both passes (P4: never first-fail)"
    requirement: SAN-01
    verification:
      - kind: unit
        ref: "src/svg-sanitizer/__tests__/sanitize.spec.ts#sanitizeSvg — adversarial rejection matrix (SAN-01/02/05 + D-31) > 15-uppercase-text — returns ok=false with the expected violation category"
        status: pass
      - kind: unit
        ref: "src/svg-sanitizer/__tests__/sanitize.spec.ts#sanitizeSvg — adversarial rejection matrix (SAN-01/02/05 + D-31) > 16-unknown-element — returns ok=false with the expected violation category"
        status: pass
    human_judgment: false
  - id: D2
    description: "Defensive empty-input guard — sanitizeSvg returns structured ok=false with code=validation_error on empty/null svg (SAN-01 empty edge: never a pass, never a thrown error; the test wraps sanitizeSvg in try/catch and asserts no throw escapes)"
    requirement: SAN-01
    verification:
      - kind: unit
        ref: "src/svg-sanitizer/__tests__/sanitize.spec.ts#sanitizeSvg — adversarial rejection matrix (SAN-01/02/05 + D-31) > 17-empty-string-input — returns ok=false with the expected violation category"
        status: pass
    human_judgment: false
  - id: D3
    description: "Adversarial rejection matrix — parametrized it.each over 17 hand-authored adversarial SVGs (text, tspan, image, base64 data URI, foreignObject, script, on* handler, javascript: URI, external xlink:href, javascript: in xlink:href, XML comment, data-* attribute, root width/height, prefixed element, uppercase TEXT, unknown element, empty input) + 1 clean control (CLEAN minimal svg: g + rect + 2/3-segment IDs + title + desc + viewBox passes with zero violations) + 2 collect-all proofs (P4: 2-gate fixtures yield 2 violations in one report)"
    requirement: SAN-01
    verification:
      - kind: unit
        ref: "src/svg-sanitizer/__tests__/sanitize.spec.ts#sanitizeSvg — adversarial rejection matrix (SAN-01/02/05 + D-31)"
        status: pass
      - kind: unit
        ref: "src/svg-sanitizer/__tests__/sanitize.spec.ts#sanitizeSvg — clean control proves the matrix teeth are selective"
        status: pass
      - kind: unit
        ref: "src/svg-sanitizer/__tests__/sanitize.spec.ts#sanitizeSvg — collect-all proof (P4: never first-fail)"
        status: pass
    human_judgment: false
  - id: D4
    description: "SAN-04 / ADR-02 SVGO 4 regression — viewBox + <title> + <desc> survive the optimize pass, root <svg> carries NO width/height after optimize (D-22 preserved), every input id survives UNCHANGED in the output (cleanupIds:false override — Pitfall 6); config-shape guard asserts the three named overrides (removeDesc/cleanupIds/collapseGroups) stay disabled AND v3 plugins (removeViewBox/removeTitle/prefixIds) are NOT re-added"
    requirement: SAN-04
    verification:
      - kind: unit
        ref: "src/svg-sanitizer/__tests__/svgo-regression.spec.ts#SVGO 4 regression — SAN-04 (ADR-02: viewBox + title + desc + IDs survive optimize)"
        status: pass
      - kind: unit
        ref: "src/svg-sanitizer/__tests__/svgo-regression.spec.ts#SVGO 4 regression — config-shape guard (ADR-02 overrides stay load-bearing)"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-31 / D-37 self-consistency over 11 fixtures — for each of 10 recipes + galerie, compile in-test via makeAllFixtures + compile() (decoupled from plan 03-06 goldens), sanitize, assert zero violations; Lottie↔SVG isomorphism (layer count == g count, layer[g.length-1-i] order == component order per D-10 + Pitfall 1, every layer nm == role segment of counterpart g's shape id per D-02 / D-32, per-component shape types match between Lottie ty discriminators and SVG element names); ink visible (every sanitized SVG carries >=1 geometry element with fill= or stroke= attribute — D-37 non-dégénérescence)"
    requirement: SAN-05
    verification:
      - kind: unit
        ref: "src/svg-sanitizer/__tests__/self-consistency.spec.ts#D-31 self-consistency + Lottie↔SVG isomorphism + ink visible — 11 fixtures"
        status: pass
    human_judgment: false

# Metrics
duration: 14 min
completed: 2026-09-02
status: complete
---

# Phase 3 Plan 07: Sanitizer proof surface — adversarial matrix + ADR-02 regression + self-consistency

**Hardened SVG sanitizer (D-31 closed allow-list + order self-check + collect-all) with full SAN-01/02/05 adversarial matrix, ADR-02 SVGO regression (SAN-04), and D-31/D-37 self-consistency + Lottie↔SVG isomorphism proven over all 11 fixtures**

## Performance

- **Duration:** 14 min
- **Started:** 2026-09-02T14:05:00Z
- **Completed:** 2026-09-02T14:19:00Z
- **Tasks:** 3 (3 atomic task commits + 1 follow-up fix commit)
- **Files modified:** 7 (3 source hardening + 3 new test files + 1 biome fix)

## Accomplishments

- **D-31 closed 9-element allow-list** — every element enter compared against `{svg, title, desc, g, path, rect, ellipse, polyline, polygon}` (case-sensitive exact name match); module-level guard asserts size=9. Case variants (`<TEXT>`), unknown elements (`<web-component>`), and prefixed elements (`<xlink:rect>`) all fail the gate via the `forbidden-element` category. The proof of allow-list semantics (NOT blacklist) is the matrix's case-15 uppercase TEXT case.
- **Plugin-order self-check** — `SANITIZER_PLUGIN_ORDER` exported as a typed const; `assertPluginOrder(config)` fail-fasts on every `sanitizeSvg` call (P5 / D-31 / D-32). A future reorder breaks loud at module load, never silently accepts.
- **Defensive empty-input guard** — `sanitizeSvg` returns structured `ok=false` with `code=validation_error` and a single `forbidden-element` violation on empty/null svg (SAN-01 empty edge: never a pass, never a thrown error). The test wraps the call in try/catch and asserts no throw escapes the contract.
- **Collect-all preserved** — the `violations` array is shared across all 4 forbid-* collectors AND across both passes. A 2-gate fixture yields 2 violations in a single report (P4: never first-fail, never silently clean); 2 explicit collect-all proofs in the matrix.
- **Full SAN-01/02/05 + D-31 matrix** — 17 adversarial cases parametrized via `it.each` covering text, tspan, image, base64 data URI, foreignObject, script, on* event handlers, javascript: URIs (both `href` and `xlink:href`), external xlink:href, XML comments, data-* attributes, root width/height, prefixed elements, case variants, unknown elements, empty input. Each case asserts `ok=false` + expected gate category is in the report (gate-level assertion, D-08 discipline, never message text).
- **1 clean control** — the matrix teeth are selective, not a total rejector: a CLEAN minimal svg (g + rect + 2/3-segment IDs + title + desc + viewBox) passes with zero violations AND the D-31 allow-list hits are populated in the report's `allowed_elements` field.
- **ADR-02 SVGO regression (SAN-04)** — viewBox + `<title>` + `<desc>` survive the optimize pass, root `<svg>` carries NO width/height after optimize (D-22 preserved), every input id survives UNCHANGED in the output (cleanupIds:false override proven load-bearing — Pitfall 6). Config-shape guard asserts the three named overrides (`removeDesc/cleanupIds/collapseGroups`) stay disabled AND v3 plugins (`removeViewBox/removeTitle/prefixIds`) are NOT re-added (would re-activate v3 behavior — the inverse of intent).
- **D-31/D-37 self-consistency + isomorphism + ink** over 11 fixtures (10 recipes + galerie) — zero violations on every fixture (D-31 self-consistency); Lottie↔SVG isomorphism (layer count == g count, layer[g.length-1-i] order == component order per D-10 + Pitfall 1, every layer nm == role segment of counterpart g's shape id per D-02 / D-32, per-component shape types match between Lottie ty discriminators `rc/el/sh/sr` and SVG element names `rect/ellipse/path`); ink visible (every sanitized SVG carries >=1 geometry element with `fill=` or `stroke=` attribute — D-37 non-dégénérescence).

## Task Commits

Each task was committed atomically:

1. **Task 1: Sanitizer hardening — allow-list enforcement + assertion-only IDs + report typing** — `3c945fc` (feat)
2. **Follow-up fix: defensive empty-input guard** — `6a1069b` (fix) — required for Task 2's matrix case 17 (empty-string input)
3. **Task 2: Adversarial rejection matrix** — `09c6131` (test) — 17 cases + 1 clean control + 2 collect-all proofs
4. **Task 3: ADR-02 regression + self-consistency/isomorphism/ink over 11 fixtures** — `c3fe0fc` (test) — 10 + 67 cases

**Plan metadata:** committed as part of the task commits (orchestrator handles STATE.md/ROADMAP.md/REQUIREMENTS.md centrally per Wave 6 protocol).

## Files Created/Modified

- `src/svg-sanitizer/plugins/forbid-structure.ts` — closed 9-element allow-list (D-31) + `forbidden-element` violation for any element outside the set + `matchedAllowed` Set closure for the orchestrator's report + case-sensitive exact name match (the proof of allow-list semantics)
- `src/svg-sanitizer/config.ts` — `SANITIZER_PLUGIN_ORDER` exported const + `assertPluginOrder(config)` fail-fast self-check (P5 / D-31 / D-32) + 3rd `matchedAllowed` parameter threaded through `buildSanitizerConfig` + module-level `Plugin` re-export
- `src/svg-sanitizer/sanitize.ts` — `assertPluginOrder` fires on both passes; `finalizeReport` converts the `matchedAllowed` Set to a sorted array (D-23 byte-stability); defensive empty-input guard at the top of `sanitizeSvg` (SAN-01 empty edge)
- `src/svg-sanitizer/__tests__/sanitize.spec.ts` (NEW) — 17-case adversarial `it.each` matrix + 1 clean control + 2 collect-all proofs (20 cases total)
- `src/svg-sanitizer/__tests__/svgo-regression.spec.ts` (NEW) — ADR-02 regression (SAN-04) + config-shape guard (10 cases)
- `src/svg-sanitizer/__tests__/self-consistency.spec.ts` (NEW) — D-31/D-37 self-consistency + Lottie↔SVG isomorphism + ink visible over 11 fixtures (67 cases)

## Decisions Made

- **Allow-list enforced as a 9-element closed set with case-sensitive exact name match** — D-31 doctrine, the proof of allow-list semantics (NOT blacklist). The module-level guard `if (ALLOWED_ELEMENTS.size !== 9) throw` pins the size.
- **Plugin order is normative (exported constant + assertPluginOrder helper)** — a future reorder fails loud at module load, never silently accepts. The order constant is the single source of truth shared by `sanitize.ts`, `assertPluginOrder`, and the regression test.
- **Defensive empty-input guard returns structured `ok=false` with `validation_error` code** — the schema layer (`SanitizeRequestSchema.svg: z.string().min(1)`) rejects empty input at the boundary, but a defensive runtime check keeps the function throw-free even when a caller bypasses the schema (SAN-01 empty edge contract: never a pass, never a thrown error).
- **Config-shape guard asserts BOTH that the three named overrides stay disabled AND that the v3 plugins are NOT re-added** — the v4 preset already excludes `removeViewBox` / `removeTitle` (the v3→v4 migration); re-adding them would RE-ACTIVATE the v3 behavior. The guard is double-sided: it pins the presence of the load-bearing overrides AND the absence of the inverse-intent plugins.
- **Lottie ty → SVG name mapping locked at the test (single source of truth)** — `lottieTyToSvgName(ty)` is the locked mapping table; `rc` → `rect`, `el` → `ellipse`, `sh` → `path` (path + polyline both emit `<path>`), `sr` → `path` (polystar is a `<path>` with the star algorithm).

## Deviations from Plan

None — plan executed exactly as written. Two extensions are documented as design choices (not deviations):

1. **Defensive empty-input guard** — added as a follow-up fix commit (`6a1069b`) to support Task 2's matrix case 17 (empty-string input → structured `ok=false`, never a thrown error). The guard sits at the top of `sanitizeSvg` and is consistent with the plan's "never a pass, never a crash" contract for the SAN-01 empty edge.
2. **`xmlns:xlink` namespace declaration** in test fixtures for the `xlink:href` cases (9, 10, 14, collect-all #2) — required to make SVGO's strict XML parser accept the prefixed attribute/element. The declaration ALSO fires the `forbidden-attribute` gate (defense-in-depth), so the tests still assert the primary expected gate is in the report (multi-violation per element is consistent with the collect-all doctrine).

## Issues Encountered

None — all 119 tests green on the first clean run after the type-narrowing fixes.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Phase 4 (Anim QA):** ready. The sanitizer gate is the upstream contract; smoke theming (Ph 4) iterates on the D-31 allow-list (every `<g>` carries a 2-segment ID, every shape element carries a 3-segment ID — D-32). The 67-case self-consistency proves the producer and the gate agree.
- **Phase 5 (MFT-01 manifest):** ready. The `SanitizeReportSchema` + `SanitizeResultSchema` envelope (the typed `allowed_elements` + `violations` + `input_element_count` + `code` structure) persists to the manifest. The Ph 5 envelope can rely on the closed literal `SANITIZER_VIOLATION_CATEGORIES` and the closed literal `SANITIZER_ERROR_CODES` without re-deriving them.
- **Phase 8 (Packager):** ready. The per-asset sanitized SVG (output of the gate) is the dev-ready surface. The ADR-02 regression locks the byte regime: viewBox + title + desc + IDs survive optimize, the 3 named overrides stay load-bearing, the v3 plugins stay absent. The gate is the gate — no silent cleaning.
- **Wave 6 closeout:** orchestrator handles STATE.md/ROADMAP.md/REQUIREMENTS.md centrally (no worktree, branching_strategy=none). All 3 tasks committed on main, working tree state matches the 4-commit + SUMMARY.md commit.

---

*Phase: 03-motion-compiler-svg-sanitizer*
*Completed: 2026-09-02*
