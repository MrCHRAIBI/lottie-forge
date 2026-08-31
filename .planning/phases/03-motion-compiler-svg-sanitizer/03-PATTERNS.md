# Phase 3: Motion Compiler & SVG Sanitizer - Pattern Map

**Mapped:** 2026-08-31
**Files analyzed:** 41 (38 new + 3 modified/data groups)
**Analogs found:** 34 / 41 (7 partial/no-analog — first occurrences in codebase, use RESEARCH.md patterns)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/rpc/contracts/motion-compiler.schema.ts` | model (zod schema) | validation | `src/rpc/contracts/style-spec.schema.ts` | exact |
| `src/rpc/contracts/sanitizer.schema.ts` | model (zod schema) | validation | `src/rpc/contracts/style-spec.schema.ts` | exact |
| `src/rpc/contracts/render-spec-rejection.ts` | utility (loader) | file-I/O | `src/rpc/contracts/rejection-cases.ts` | exact |
| `src/rpc/contracts/no-llm-imports.spec.ts` | test (static-scan gate) | static | `src/rpc/contracts/recipe.spec.ts` (constants parity test) | role-match |
| `src/shared/format.ts` | utility | transform | — (no formatter exists; style from `vocabulary.schema.ts` module guard) | no-analog |
| `src/shared/format.spec.ts` | test | validation | `src/rpc/contracts/style-spec.spec.ts` | role-match |
| `src/motion-compiler/compiler.ts` | service (orchestrator) | transform + validation | `src/rpc/contracts/catalogue.schema.ts` (`JointCatalogueStyleSchema` cross-ref) + `lottie_forge/loading/catalogue.py` | role-match |
| `src/motion-compiler/shape-builder.ts` | utility | transform | `lottie_forge/loading/catalogue.py` (pure function module) | role-match |
| `src/motion-compiler/transform-builder.ts` | utility | transform | `lottie_forge/loading/catalogue.py` | role-match |
| `src/motion-compiler/keyframe-emitter.ts` | utility | transform | `lottie_forge/loading/catalogue.py` | role-match |
| `src/motion-compiler/color-resolver.ts` | utility | transform | `lottie_forge/loading/catalogue.py` | role-match |
| `src/motion-compiler/markers.ts` | utility | transform | `lottie_forge/loading/catalogue.py` | role-match |
| `src/motion-compiler/meta.ts` | config (constants) | static | `src/rpc/contracts/vocabulary.schema.ts` (constants + module guard) | exact |
| `src/motion-compiler/feature-gate.ts` | utility (classifier) | transform | `src/rpc/contracts/vocabulary.schema.ts` (closed tuple + guard) | role-match |
| `src/motion-compiler/svg-builder.ts` | utility (serializer) | transform | — (no serializer exists; pure-module style from `loading/catalogue.py`) | no-analog |
| `src/motion-compiler/__tests__/make-render-spec.ts` | test-builder (factory) | factory | `tests/bridge/fixtures.py` (`make_*`) | exact |
| `src/motion-compiler/__tests__/compiler.spec.ts` | test (golden) | validation | `src/rpc/contracts/catalogue.spec.ts` | role-match |
| `src/motion-compiler/__tests__/determinism.spec.ts` | test (integration) | process | `tests/bridge/test_catalogue_bridge.py` (hash regime test) | role-match |
| `src/motion-compiler/__tests__/ids.spec.ts` | test | validation | `catalogue.spec.ts` (mutation/diff pattern) | role-match |
| `src/motion-compiler/__tests__/feature-gate.spec.ts` | test | validation | `style-spec.spec.ts` (rejection harness) | role-match |
| `src/motion-compiler/__tests__/goldens/*.json` | test-data | static | `fixtures/recipe-catalogue/catalogue.json` (committed byte-exact data) | role-match |
| `src/svg-sanitizer/sanitize.ts` | service (gate) | validation | `src/rpc/contracts/rejection-cases.ts` (fail-loud guard) + RESEARCH Pattern 2 | partial |
| `src/svg-sanitizer/config.ts` | config | static | RESEARCH.md Pattern 2 (verbatim) | no-analog |
| `src/svg-sanitizer/constraint-report.ts` | model | transform | `src/rpc/contracts/rejection-cases.ts` (structured report types) | role-match |
| `src/svg-sanitizer/plugins/forbid-*.ts` (4 files) | middleware (SVGO visitors) | event-driven | RESEARCH.md Pattern 2 | no-analog |
| `src/svg-sanitizer/plugins/stabilize-ids.ts` | middleware (SVGO visitor) | event-driven | RESEARCH.md Pattern 2 | no-analog |
| `src/svg-sanitizer/__tests__/sanitize.spec.ts` | test (parametrized matrix) | validation | `recipe.spec.ts` (`it.each` harness) | exact |
| `src/svg-sanitizer/__tests__/svgo-regression.spec.ts` | test (regression) | validation | `catalogue.spec.ts` (post-parse assertions) | role-match |
| `src/svg-sanitizer/__tests__/self-consistency.spec.ts` | test | validation | `catalogue.spec.ts` + `test_catalogue_bridge.py` | role-match |
| `src/rpc/server.ts` | server (IPC dispatcher) | request-response | `scripts/assert-zero-skips.mjs` (Node stdio/exit discipline only) | no-analog (use RESEARCH Pattern 5) |
| `scripts/update-goldens.mjs` | script | file-I/O | `scripts/assert-zero-skips.mjs` | exact (conventions) |
| `scripts/compile-stdin.ts` | script entry | streaming | `scripts/assert-zero-skips.mjs` | role-match |
| `lottie_forge/rpc/client.py` | client (transport) | request-response | `lottie_forge/loading/catalogue.py` (module conventions) | role-match (conventions) |
| `lottie_forge/rpc/__init__.py` | package init | static | `lottie_forge/loading/__init__.py` | exact |
| `tests/rpc/test_rpc_integration.py` | test (integration) | request-response | `tests/bridge/test_catalogue_bridge.py` | role-match |
| `fixtures/render-specs/*.json` (11) | data | static | `tests/bridge/fixtures.py` values (canon source) | exact |
| `fixtures/rejection-cases/render-spec.json` | data | static | `fixtures/rejection-cases/recipe.json` | exact |
| `fixtures/rejection-cases/lottie-json.json` | data | static | `fixtures/rejection-cases/recipe.json` | exact |
| `package.json` (modified) | config | static | existing file (add `svgo@^4.1.0` dep + `tsx@^4.23.13` devDep, scripts `goldens:update`) | exact |
| `src/rpc/contracts/rejection-cases.ts` (modified) | utility (loader) | file-I/O | self — extend `CONTRACT_FILES` map | exact |

## Pattern Assignments

### `src/rpc/contracts/motion-compiler.schema.ts` (model, validation)

**Analog:** `src/rpc/contracts/style-spec.schema.ts` (+ `catalogue.schema.ts` for cross-ref/closed-tuple portions)

**Imports pattern** (style-spec.schema.ts lines 1-3 + catalogue.schema.ts lines 1-3 — relative imports carry `.js` extension, mandatory under NodeNext + `verbatimModuleSyntax`):
```typescript
import { z } from "zod";

import { StyleSpecSchema, TOKEN_NAME_PATTERN } from "./style-spec.schema.js";
import { RecipeIdSchema, ThemeAnchorIdSchema } from "./vocabulary.schema.js";
```

**Vocabulary re-import rule — NEVER redeclare** (catalogue.schema.ts lines 19-21, docblock verbatim):
```typescript
 * ADR-03 / D-11: the recipe-id list and the theme-anchor list are imported
 * from `vocabulary.schema.js` -- NEVER redeclared here (the structural
 * same-commit scan in `tests/domain/test_vocabulary.py` enforces it).
```
→ For D-02: import `ThemeAnchorIdSchema` from `vocabulary.schema.js`; the `role` Literal set = `ThemeAnchorId ∪ {"neutral"}`. For shapes: import `ShapeNameSchema` from `catalogue.schema.js`. For motion block D-08: re-use `MotionParamsSchema` from `recipe.schema.js` **as-is**.

**Closed ranges on every numeric param** (style-spec.schema.ts lines 21-31 — D-06 pattern):
```typescript
export const SizeSchema = z.strictObject({
  width: z.number().int().min(16).max(2048),
  height: z.number().int().min(16).max(2048),
});

export const StrokeWidthsSchema = z
  .strictObject({
    thin: z.number().min(0.25).max(16),
    default: z.number().min(0.25).max(16),
    bold: z.number().min(0.25).max(16),
  })
```

**Cross-field `superRefine` with typed issue** (style-spec.schema.ts lines 32-39 — the D-34 pattern for `corner_radius ≤ min(w,h)/2` and (component, role) uniqueness):
```typescript
  .superRefine((widths, ctx) => {
    if (!(widths.thin < widths.default && widths.default < widths.bold)) {
      ctx.addIssue({
        code: "custom",
        message: `stroke widths must strictly increase: thin (${widths.thin}) < default (${widths.default}) < bold (${widths.bold})`,
      });
    }
  });
```

**Collect-all superRefine with explicit paths** (catalogue.schema.ts lines 84-98 — D-32 uniqueness `(component, role)` and D-29 path-reporting pattern):
```typescript
  .superRefine((catalogue, ctx) => {
    // Invariant 1: id uniqueness -- one issue per duplicate occurrence,
    // path ["recipes", idx, "id"] (IN-08 analogue: never merged silently).
    const seen = new Set<string>();
    catalogue.recipes.forEach((recipe, idx) => {
      if (seen.has(recipe.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["recipes", idx, "id"],
          message: `duplicate recipe id ${recipe.id} at index ${idx}`,
        });
      } else {
        seen.add(recipe.id);
      }
    });
```

**Closed tuple constants + Literal pinning** (catalogue.schema.ts lines 29-58; D-12 `v: z.literal("5.7.0")`, `ddd: z.literal(0)`, `ty: z.literal(4)` follow this exact shape):
```typescript
export const KEYFRAME_SHAPES = [
  "opacity-ramp",
  ...
] as const;

export type KeyframeShape = (typeof KEYFRAME_SHAPES)[number];

export const KeyframeShapeSchema = z.enum(KEYFRAME_SHAPES);
```

**Type exports at file end** (style-spec.schema.ts lines 91-96):
```typescript
export type StyleSpec = z.infer<typeof StyleSpecSchema>;
export type Size = z.infer<typeof SizeSchema>;
```

**Docblock doctrine:** every schema opens with a docblock citing the mirror Pydantic model, the strictness rationale, and ADR references (recipe.schema.ts lines 5-17). The Phase 3 schema is TS-only until Ph 7 (gel §6.3.1) — docblock must state the freeze and the Ph 7 mirror obligation.

**Naming (D-13 — meta-rule, zero tolerance):** field names = snake_case JSON convention of the Phase 1 contracts verbatim (`asset_id`, `recipe_ref`, `theme_anchors`, `duration_ms`, `control_points`, `stroke_widths`, `intensity_range`). All existing schemas use snake_case keys; no camelCase anywhere in the zod layer.

---

### `src/rpc/contracts/render-spec-rejection.ts` (utility, file-I/O)

**Analog:** `src/rpc/contracts/rejection-cases.ts` — extend, don't fork.

**D-08 fixture format** (rejection-cases.ts lines 12-19, docblock verbatim — D-29 extends it with `expect_code`):
```typescript
 * Format (D-08, verbatim):
 *
 *     { "case_id": "...", "ref": "...", "model": "...", "payload": { },
 *       "expect_paths": [ ["..."] ]  // OPTIONAL
```

**Contract-file registry to extend** (rejection-cases.ts lines 27-34):
```typescript
export const CONTRACT_FILES: Record<string, string> = {
  "style-spec": "style-spec.json",
  recipe: "recipe.json",
  ...
};
```
→ Add `"render-spec": "render-spec.json"` and `"lottie-json": "lottie-json.json"` (either in place or via the new `render-spec-rejection.ts` wrapper that re-exports `loadRejectionCases` with the `expect_code` field added to the `RejectionCase` interface).

**Fail-loud shape guard pattern** (rejection-cases.ts lines 73-90 — copy this exact philosophy for validating the new fixtures at load; a fixture that silently passes is a vacuous green):
```typescript
export function assertRejectionEntryShape(entry: RawRejectionEntry, filename: string): void {
  const missing: string[] = [];
  if (typeof entry.case_id !== "string") missing.push("case_id");
  ...
  if (missing.length > 0) {
    throw new Error(
      `Rejection fixture ${filename}, case ${caseId}: missing or malformed ` +
        `required field(s): ${missing.join(", ")} -- the Python loader ` +
        ...
    );
  }
}
```

**Validate-then-cast discipline** (rejection-cases.ts lines 104-106):
```typescript
    // Validate-then-cast: the guard above proved each required field's
    // type at runtime; the casts only re-state it for the compiler.
```

---

### Vitest spec files (all `*.spec.ts`) — test harness pattern

**Analog:** `src/rpc/contracts/recipe.spec.ts` + `catalogue.spec.ts`

**Imports pattern** (recipe.spec.ts lines 1-5):
```typescript
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DIRECTION_VALUES, MotionRecipeSchema, TOKEN_NAME_PATTERN } from "./recipe.schema.js";
import { loadRejectionCases } from "./rejection-cases.js";
```

**Repo-root path resolution** (recipe.spec.ts lines 29-33 — every spec resolves from `__dirname`, never cwd-relative):
```typescript
const REPO_ROOT = join(__dirname, "..", "..", "..");
const BRIDGE_DIR = join(REPO_ROOT, "fixtures", "bridge");
```

**`it.each` shared-fixture rejection harness** (recipe.spec.ts lines 113-130 — the exact harness D-29 requires for `render-spec.json`/`lottie-json.json`; membership-only path assertion, never message text):
```typescript
describe("recipe rejection harness (mirror of pytest)", () => {
  const cases = loadRejectionCases("recipe");

  it.each(cases.map((c) => [c.case_id, c]))(
    "%s -> zod rejects the shared payload",
    (_caseId, c) => {
      const result = MotionRecipeSchema.safeParse(c.payload);
      expect(result.success).toBe(false);
      if (result.success) return; // narrow for TS

      const actualPaths = new Set(result.error.issues.map((issue) => JSON.stringify(issue.path)));
      for (const expected of c.expect_paths) {
        const key = JSON.stringify(expected);
        expect(actualPaths.has(key)).toBe(true);
      }
    },
  );
});
```

**Direct byte loading of committed data** (catalogue.spec.ts lines 50-61 — the goldens pattern: read committed bytes, parse, assert; plus the D-03 hash regime test in `test_catalogue_bridge.py` lines 99-106 → translate to `Buffer.compare` for goldens, NOT `toMatchFileSnapshot` — see RESEARCH.md Alternatives table):
```typescript
describe("catalogue bilingual loading (MOT-04, §5.5.3)", () => {
  it("loads the committed catalogue.json directly, in canonical order", () => {
    const committed = JSON.parse(readFileSync(COMMITTED, "utf-8"));
    const catalogue = RecipeCatalogueSchema.parse(committed);
    expect(catalogue.recipes).toHaveLength(10);
    expect(catalogue.recipes.map((r) => r.id)).toEqual([...RECIPE_IDS]);
```

**Hard-fail on missing artifact — never skip** (recipe.spec.ts lines 42-46; doctrine applies to goldens missing):
```typescript
    if (!existsSync(FROM_PYTHON)) {
      throw new Error(
        `Bridge export artifact missing at ${FROM_PYTHON} -- run ` +
          "`python -m pytest tests/bridge/test_recipe_bridge.py -k export` first.",
      );
    }
```
→ Golden missing = throw pointing at `node scripts/update-goldens.mjs`.

**Mutation-based invariant test** (catalogue.spec.ts lines 101-115 — pattern for ids.spec.ts diff test and feature-gate forced-branch test):
```typescript
  it("rejects a duplicate recipe id at [recipes, idx, id] (superRefine mirror)", () => {
    const committed = JSON.parse(readFileSync(COMMITTED, "utf-8"));
    const mutated = {
      ...committed,
      recipes: committed.recipes.map((r: Record<string, unknown>, i: number) =>
        i === 1 ? { ...r, id: "fade" } : r,
      ),
    };
    const result = RecipeCatalogueSchema.safeParse(mutated);
    expect(result.success).toBe(false);
```

**Test-file docblock convention:** every spec opens with a docblock explaining its position in the pipeline, the decision IDs it enforces, and the mirror suite it pairs with (recipe.spec.ts lines 7-27, catalogue.spec.ts lines 16-34). The goldens specs must document COM-01, the compare-only doctrine (D-25), and the `goldens:update` escape hatch.

---

### `src/motion-compiler/__tests__/make-render-spec.ts` (test-builder factory)

**Analog:** `tests/bridge/fixtures.py` — the exact patron D-04 names.

**Single-source builder with stable defaults** (fixtures.py lines 84-105):
```python
def make_recipe(recipe_id: RecipeId = "fade") -> MotionRecipe:
    """The single source of fixture truth for the MotionRecipe bridge chain.

    Defaults are stable so bridge tests can rely on them without restating:
    ...
    """
    return MotionRecipe(
        recipe_id=recipe_id,
        family="transform",
        duration_ms=1200,
        easing="ease-in-out",
        params=MotionParams(amplitude=0.5, direction="up", loops=1),
        theme_anchors=["primary"],
    )
```
→ `make_render_spec(recipeId?)` mirrors this: one function, canonical default pose, optional overrides only where a fixture needs variety; docstring lists every default and why.

**Deliberately fractional floats** (fixtures.py lines 28-30 — critical for the D-35 formatter):
```python
All float values are deliberately **fractional** (``2.5``, ``0.25``,
``0.5`` -- never integral ``2.0``) so Python and JavaScript format them
identically across the JSON hop
```

**Cross-consistency pinning** (fixtures.py lines 154-156 — asset's `style_ref` pinned to `make_style_spec().style_version`): the RenderSpec fixtures' `recipe_ref`/easing values must be consistent with `fixtures/recipe-catalogue/catalogue.json` and `fixtures/style-specs/example-style/` (D-05 shapes ⊆ `shapes_supported`; easing ∈ {standard, entrance}).

---

### `src/motion-compiler/compiler.ts` + builders (service, transform)

**Analog:** `src/rpc/contracts/catalogue.schema.ts` `JointCatalogueStyleSchema` (D-05 cross-ref at entry) + `lottie_forge/loading/catalogue.py` (pure-function module style)

**Hard cross-ref rejection at joint load (D-05)** (catalogue.schema.ts lines 135-151 — compiler entry validates `component.shapes ⊆ recipe.shapes_supported` with the same shape):
```typescript
export const JointCatalogueStyleSchema = z
  .strictObject({
    catalogue: RecipeCatalogueSchema,
    style: StyleSpecSchema,
  })
  .superRefine((joint, ctx) => {
    const easingNames = new Set(joint.style.easing_curves.map((c) => c.name));
    joint.catalogue.recipes.forEach((recipe, idx) => {
      if (!easingNames.has(recipe.easing)) {
        ctx.addIssue({
          code: "custom",
          path: ["catalogue", "recipes", idx, "easing"],
          message: `easing ${recipe.easing} for recipe ${recipe.id} is not declared in the loaded StyleSpec.easing_curves`,
        });
      }
    });
  });
```

**Pure cross-check function doctrine** (loading/catalogue.py lines 10-21, docblock verbatim):
```python
**The easing cross-reference lives HERE, not on the model (D-17).**
§5.5.3 validator 3 is a cross-reference between two fixtures -- a recipe's
``easing`` must name a curve declared in the loaded ``StyleSpec``. That is
joint-loading state, not per-object state, so:

- :func:`validate_easing_cross` is a **pure** collect-all function (no I/O)
  taking the catalogue and the set of valid easing names
```
→ Each builder (`shape-builder.ts`, `transform-builder.ts`, `keyframe-emitter.ts`, `color-resolver.ts`, `markers.ts`) is a pure function module: no I/O, no module state, exports typed from the zod `z.infer` types, docblock cites the decision IDs it implements.

**Module-level invariant guard** (vocabulary.schema.ts lines 74-78 — pattern for `meta.ts` constants like `fr`/`op` rule and `meta.ts` g/a constants):
```typescript
if (RECIPE_IDS.length < MIN_RECIPE_COUNT || RECIPE_IDS.length > MAX_RECIPE_COUNT) {
  throw new Error(
    `recipe count must satisfy ${MIN_RECIPE_COUNT} <= n <= ${MAX_RECIPE_COUNT}, got ${RECIPE_IDS.length}`,
  );
}
```

**Path constant + `__all__`-style explicit exports** (loading/catalogue.py lines 43-56 — for `meta.ts`/`feature-gate.ts` re-export lists):
```python
REPO_ROOT = Path(__file__).resolve().parents[2]
CATALOGUE_FIXTURE_PATH: Path = REPO_ROOT / "fixtures" / "recipe-catalogue" / "catalogue.json"
"""The committed catalogue product data (D-01 × §5.5.2 verbatim)."""

__all__ = [
    "CATALOGUE_FIXTURE_PATH",
    ...
]
```

---

### `src/rpc/contracts/no-llm-imports.spec.ts` (test, static scan — COM-02)

**Analog:** `recipe.spec.ts` "exposes the locked constants" test (lines 36-39) for the assert-style; scan logic is new.

```typescript
  it("exposes the locked regex and direction constants (parity contract)", () => {
    expect(TOKEN_NAME_PATTERN.source).toBe("^[a-z][a-z0-9-]*$");
    expect([...DIRECTION_VALUES]).toEqual(["up", "down", "left", "right", "none"]);
  });
```
→ Read `package.json`, `tsconfig.json`, walk `src/**` with `node:fs`; assert no `/langchain|openai|anthropic/` match; a violation throws with the file path (fail-loud doctrine). Collected by existing CI step 09 (`npx vitest run`) — **verify.yml stays byte-identical**.

---

### `scripts/update-goldens.mjs` + `scripts/compile-stdin.ts` (scripts)

**Analog:** `scripts/assert-zero-skips.mjs` — the house script style, verbatim conventions.

**Script header + stdlib-only doctrine** (assert-zero-skips.mjs lines 1-21):
```javascript
#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// assert-zero-skips.mjs — Hard-fail when any test is skipped in CI.
//
// Usage:
//   node scripts/assert-zero-skips.mjs <junit.xml> [<junit.xml> ...]
//
// Stdlib-only — no dependencies on purpose, the script must run identically
// in any CI runner and any local fresh checkout.

import { readFileSync } from "node:fs";
import { exit } from "node:process";
```

**Stdout data / stderr errors / exit-code discipline** (assert-zero-skips.mjs lines 77-86 — same split the RPC server needs at D-36):
```javascript
  // Always print the breakdown first — operators should see WHY the gate tripped.
  process.stdout.write(`${lines.join("\n")}\ntotal skipped: ${grandTotal}\n`);

  if (grandTotal > 0) {
    process.stderr.write(
      `\nFAIL: ${grandTotal} test(s) skipped — CI requires zero skipped tests (§4.2).\n`,
    );
    exit(1);
  }
  exit(0);
```
→ `update-goldens.mjs`: same shape; opens with the CI guard `if (process.env.CI === "true") { stderr; exit(1); }` (D-37); writes `\n` never `os.EOL` (Pitfall 9; `.gitattributes` already enforces LF, lines 1-18 — do NOT touch it).

**`.mjs` for scripts, `.ts` for src** — existing convention: `scripts/*.mjs` (Node-runnable directly); `compile-stdin.ts` is the exception because it imports `src/` TS modules → runs under `npx tsx` (RESEARCH.md Pitfall 8).

---

### `lottie_forge/rpc/client.py` + `tests/rpc/test_rpc_integration.py` (Python side)

**Analog:** `lottie_forge/loading/catalogue.py` (module conventions) + `tests/bridge/test_catalogue_bridge.py` (test conventions)

**Python module opening** (loading/catalogue.py lines 1, 28-41):
```python
"""Recipe-catalogue loader + the D-17 joint easing cross-reference (§5.5.3 #3).
...
"""

from __future__ import annotations

from collections.abc import Set as AbstractSet
from pathlib import Path

from pydantic_core import InitErrorDetails, PydanticCustomError, ValidationError

from lottie_forge.domain.catalogue import RecipeCatalogue
```
→ `client.py` opens with `from __future__ import annotations`, a docblock stating it is transport-only (D-30: zéro type métier, typed re-validation arrives Ph 7), `__all__` at module end (loading/catalogue.py lines 50-56).

**Pytest test conventions** (test_catalogue_bridge.py lines 62-66, 304-318):
```python
def test_export_catalogue() -> None:
    """Bridge export (pytest -k export): re-emit the Python-validated model."""
    catalogue = _load_committed_catalogue()
```
```python
@pytest.mark.parametrize("case", _CATALOGUE_REJECTION_CASES, ids=lambda c: c.case_id)
def test_catalogue_rejection_case(case) -> None:
    """Every shared catalogue case is rejected by Pydantic strict (mirrored).
    ...
    """
```
→ Every test carries a docstring; assertion failures include explanatory f-string messages citing decision IDs (lines 247-256); helper functions prefixed `_`; `REPO_ROOT = Path(__file__).resolve().parents[2]` at module top (line 50); full annotations (`-> None`).

**Subprocess-spawn precondition (Pitfall 8):** the integration test spawns `npx tsx src/rpc/server.ts` — command comes from `client.py`'s spawn function; local run order note in the test docblock (`pytest -q tests/rpc/` after `npm ci`).

---

### `src/rpc/server.ts`, `src/svg-sanitizer/*` (no direct analog — use RESEARCH.md)

These are first-of-kind in the codebase. The planner must build them from RESEARCH.md patterns, keeping the house conventions above:

| File | RESEARCH.md source | House conventions to keep |
|------|--------------------|---------------------------|
| `src/rpc/server.ts` | Pattern 5 (NDJSON lockstep skeleton, lines 327-341) + Code Examples envelope (lines 552-560) | stdout=protocol/stderr=logs (assert-zero-skips.mjs split); fail-loud zod parse at every method entry; strictObject request schemas from `src/rpc/contracts/` |
| `src/svg-sanitizer/config.ts` | Pattern 2 (verbatim config, lines 286-321) — imports nommés `import { optimize, type Plugin } from "svgo"`, plugins ordered gates → preset-default → stabilize-ids | `verbatimModuleSyntax` → `import type` for `Plugin`; docblock cites ADR-02, SAN-03/04, D-31 |
| `src/svg-sanitizer/plugins/*.ts` | Pattern 2 visitor shape (`element.enter`) | one plugin per file, named export, collect violations — never silent removal |
| `src/svg-sanitizer/sanitize.ts` | Pattern 2 + rejection envelope → `sanitize_rejected` code | collect-all report before any mutation (the gate is the gate — doctrine quoted in assert-zero-skips.mjs lines 10-12) |
| `src/shared/format.ts` | Pattern 1 (verbatim `fmt()` reference impl, lines 273-284) + D-35 | pure, zero-dep, exported singly; module guard optional |

## Shared Patterns

### 1. Zod strict boundary (every schema, every request)
**Source:** `src/rpc/contracts/style-spec.schema.ts` lines 11-17 (docblock), 21-31 (ranges)
**Apply to:** `motion-compiler.schema.ts`, `sanitizer.schema.ts`, server request parsing
```typescript
 * Every object is a `z.strictObject` so unknown keys are rejected, mirroring
 * `extra="forbid"` on the Python side.
```
Every numeric field gets closed `.min()`/`.max()` (D-06/D-34: transform deltas get their OWN ranges, separate from 0..1 coords). Cross-field rules = `.superRefine` with `code: "custom"` + explicit `path`.

### 2. Vocabulary imported, never redeclared
**Source:** `src/rpc/contracts/catalogue.schema.ts` lines 1-3, 19-21; `vocabulary.schema.ts` lines 18-64
**Apply to:** `motion-compiler.schema.ts` (role set = ThemeAnchorId ∪ {"neutral"}), `feature-gate.ts`, compiler, fixtures
```typescript
import { RecipeIdSchema, ThemeAnchorIdSchema } from "./vocabulary.schema.js";
```
Also from `catalogue.schema.js`: `KEYFRAME_SHAPES` (keyframe-emitter's exhaustive switch, D-37), `SHAPE_NAMES` (shape-builder), `TRIGGER_POINTS` (markers, D-15 pose rule). From `recipe.schema.js`: `MotionParamsSchema` (D-08 — reuse as-is).

### 3. Shared rejection harness (one JSON, two suites)
**Source:** `src/rpc/contracts/rejection-cases.ts` lines 12-19 + `recipe.spec.ts` lines 113-130 + `tests/bridge/rejection_loader.py` lines 7-15
**Apply to:** `fixtures/rejection-cases/render-spec.json`, `lottie-json.json`; vitest `it.each` in Ph 3; pytest `parametrize` in Ph 7 without rewriting (D-29). New field `expect_code` (closed Literal per D-28/D-36) asserted alongside `expect_paths`.

### 4. Docblock doctrine (decision-ID citations everywhere)
**Source:** every existing file — e.g. `recipe.schema.ts` lines 5-17, `catalogue.spec.ts` lines 16-34, `loading/catalogue.py` lines 1-26, `assert-zero-skips.mjs` lines 4-12
**Apply to:** all 38 new files. Each module header names: the decisions it implements (D-xx), the spec section (§6.x), the mirror file on the other side of the bridge, and its position in the pipeline.

### 5. Fail-loud, never skip
**Source:** `recipe.spec.ts` lines 42-46; `rejection-cases.ts` lines 73-90; `assert-zero-skips.mjs` lines 10-12
**Apply to:** goldens missing → throw pointing at `node scripts/update-goldens.mjs`; malformed fixture → abort at load; SVGO violation → reject with report, never silently strip.

### 6. Byte-exactness regime
**Source:** `.gitattributes` (`* text=auto eol=lf` — untouched); `test_catalogue_bridge.py` lines 99-106 (sha256 over LF-normalized bytes)
**Apply to:** goldens (D-24 compact JSON + trailing `\n`), Node writers use `\n` never `os.EOL`; hash regime for compiler outputs extends D-02/D-03 Ph 2.

### 7. Naming & style pins (D-13, zero-discretion)
- JSON field names: snake_case verbatim of Phase 1 contracts (`asset_id`, `recipe_ref`...) — any deviation = review rejection
- Relative TS imports carry `.js` extension (NodeNext + `verbatimModuleSyntax`; `import type` for type-only)
- Biome: 2-space indent, lineWidth 100 (`biome.json` lines 6-11); scope `src/**/*.ts` already covers new dirs
- tsconfig `strict: true`, `noEmit` — new dirs under `src/` are auto-included (tsconfig include `src/**/*.ts`, line 15); vitest include `src/**/*.spec.ts` (vitest.config.ts line 5) — spec files MUST live under `src/`
- Python: `from __future__ import annotations`, module `__all__`, ruff-clean (CI step 06), full type annotations

### 8. CI stays untouched
**Source:** `.github/workflows/verify.yml` steps 01-12 (grep confirmed)
**Apply to:** every gate this phase = an ordinary `*.spec.ts` (step 09) or pytest (step 10) file; no new workflow step; `assert-zero-skips.mjs` (step 12) must keep seeing zero skips — no `it.skip`/`xfail` anywhere.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/shared/format.ts` | utility | transform | No number formatter or JSON serializer exists in the codebase; every existing artifact used native `JSON.stringify`. Build from RESEARCH.md Pattern 1 (`fmt()` reference implementation is verbatim-usable) + D-35 test matrix. |
| `src/motion-compiler/svg-builder.ts` | utility | transform | No DOM/XML serialization exists (imports are banned by D-20 — zero-dependency template strings). Style follows pure-module conventions of `loading/catalogue.py`. |
| `src/rpc/server.ts` | server | request-response | No server/IPC code exists anywhere (Phases 1-2 were pure validators). RESEARCH.md Pattern 5 gives the readline skeleton; `assert-zero-skips.mjs` supplies the stdout/stderr/exit discipline. Framing is reused Ph 4/7/8 (D-27) — get it byte-clean now. |
| `src/svg-sanitizer/config.ts` + `plugins/*.ts` (5) | config + middleware | event-driven | First SVGO usage (svgo not yet installed — RESEARCH.md Installation). Plugin visitor API from RESEARCH.md Pattern 2; there is no local plugin precedent. |
| `scripts/compile-stdin.ts` | script entry | streaming | No stdin-driven TS entry exists; runs under `npx tsx` (new devDep, Pitfall 8). |
| `lottie_forge/rpc/` (package) | client | request-response | First `lottie_forge/rpc/` submodule; no transport precedent. Conventions fully covered by `loading/catalogue.py` analog above. |

## Metadata

**Analog search scope:** `src/rpc/contracts/` (all 17 files), `tests/bridge/` (fixtures.py, rejection_loader.py, test_catalogue_bridge.py), `scripts/`, `lottie_forge/loading/`, `lottie_forge/domain/_shared.py`, `fixtures/rejection-cases/`, `fixtures/recipe-catalogue/`, root configs (`package.json`, `tsconfig.json`, `vitest.config.ts`, `biome.json`, `.gitattributes`), `.github/workflows/verify.yml`

**Files scanned:** 30+
**Pattern extraction date:** 2026-08-31

**Key planner notes:**
1. `import type` discipline: `verbatimModuleSyntax: true` is active — SVGO's `Plugin` type and all zod-inferred types crossing module boundaries must use `import type { ... }`.
2. New dirs (`src/shared/`, `src/motion-compiler/`, `src/svg-sanitizer/`, `tests/rpc/`, `lottie_forge/rpc/`) are auto-collected by existing tooling scopes — NO config file edits (tsconfig/biome/vitest already glob `src/**`), only `package.json` gains deps + `goldens:update` script.
3. The only two npm installs are `svgo@^4.1.0` (dep) and `tsx@^4.23.13` (devDep) — RESEARCH.md requires a `checkpoint:human-verify` before install (Package Legitimacy Audit [SUS] freshness flags).
4. Wave 0 order per RESEARCH.md: format.ts → schemas+loaders → fixtures → compiler builders → goldens+proofs → sanitizer → RPC+client → COM-02 grep test.
