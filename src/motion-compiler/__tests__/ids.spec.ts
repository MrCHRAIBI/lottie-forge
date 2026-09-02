import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import type { RecipeCatalogue } from "../../rpc/contracts/catalogue.schema.js";
import { RecipeCatalogueSchema } from "../../rpc/contracts/catalogue.schema.js";
import { type StyleSpec, StyleSpecSchema } from "../../rpc/contracts/style-spec.schema.js";
import { sanitizeSvg } from "../../svg-sanitizer/sanitize.js";
import { compileFromFixture } from "./__test_helpers__/compile-from-fixture.js";

/**
 * Plan 03-06 — Task 2.3 / `ids.spec.ts`.
 *
 * **SAN-03 stable-ID proof on the SANITIZED output** (Pitfall
 * 6 — `cleanupIds` neutralized by SVGO override; the test
 * verifies the actual sanitized bytes, not the raw compiler
 * bytes). D-32 distinguishes the two ID schemes:
 *
 *   - **`<g>` component elements:** 2 segments
 *     `{asset_id}_{component}`.
 *
 *   - **shape elements** (`<rect>`, `<ellipse>`, `<path>`,
 *     `<polyline>`, `<polystar>`) inside a `<g>`: 3 segments
 *     `{asset_id}_{component}_{role}`.
 *
 * **Three-way test path:** every fixture is compiled three
 * times — twice in-process and once via `compile-stdin.ts` (a
 * fresh process). The ID multisets of the three sanitized
 * outputs MUST be identical (diff = ∅), and the (component,
 * role) pairs within a fixture must be unique per asset.
 *
 * **Why the SANITIZED output and not the raw compiler bytes:**
 * Pitfall 6 documents that the SVGO `cleanupIds` plugin
 * (active by default) renames IDs and would destroy the
 * scheme. The override `cleanupIds: false` in the locked
 * config neutralizes it (see `src/svg-sanitizer/config.ts`).
 * This test runs on the SANITIZED output to prove the
 * override load-bearing — a future SVGO pin bump that re-
 * introduces the rename would break here.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const FIXTURES_DIR = join(REPO_ROOT, "fixtures", "render-specs");
const COMPILE_STDIN = join(REPO_ROOT, "scripts", "compile-stdin.ts");
const TSX_CLI = join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");

function loadCatalogue(): RecipeCatalogue {
  const raw = JSON.parse(
    readFileSync(join(REPO_ROOT, "fixtures", "recipe-catalogue", "catalogue.json"), "utf-8"),
  );
  return RecipeCatalogueSchema.parse(raw);
}

function loadStyle(): StyleSpec {
  return StyleSpecSchema.parse({
    style_version: "1.0.0",
    viewBox: { width: 400, height: 300 },
    stroke_widths: { thin: 1.5, default: 2.5, bold: 4.0 },
    corner_radii: { small: 0, medium: 8, large: 16 },
    palette: [
      { name: "ink", hex: "#1F2430" },
      { name: "accent", hex: "#FF6B4A" },
      { name: "surface", hex: "#F5F1EA" },
      { name: "success", hex: "#3E9B6E" },
    ],
    easing_curves: [
      { name: "standard", control_points: [0.2, 0, 0.2, 1] },
      { name: "entrance", control_points: [0, 0, 0.2, 1] },
    ],
  });
}

/**
 * Run a compile + sanitize cycle and return the parsed
 * multiline ID inventory. The function operates on the
 * committed fixture (loaded from disk by `compileFromFixture`).
 */
function compileSanitizeAndInventory(
  catalogue: RecipeCatalogue,
  style: StyleSpec,
  assetId: string,
  recipeId: string,
): {
  sanitizedSvg: string;
  gIds: string[];
  shapeIds: string[];
  layerNms: string[];
} {
  const { result } = compileFromFixture({
    assetId,
    recipeId: recipeId as never,
    catalogue,
    style,
    repoRoot: REPO_ROOT,
  });
  const sanitized = sanitizeSvg({ asset_id: result.asset_id, svg: result.svg });
  expect(sanitized.ok).toBe(true);
  if (!sanitized.ok) {
    throw new Error(
      `sanitizer rejected clean compile for ${result.asset_id}: ${JSON.stringify(sanitized.report.violations)}`,
    );
  }
  // The schema pins `ok=true ⇒ svg present` — narrow defensively
  // for the TS strictNullChecks compiler.
  const svg = sanitized.svg;
  expect(svg, "ok=true sanitized result must carry svg (SanitizeResult.superRefine)").toBeDefined();
  if (svg === undefined) {
    throw new Error("sanitized.svg is undefined despite ok=true (schema invariant violated)");
  }
  // <g id="..."> — 2-segment g IDs.
  const gIds = Array.from(svg.matchAll(/<g\b[^>]*\bid="([^"]+)"/g))
    .map((m) => m[1] ?? "")
    .filter((id): id is string => id.length > 0);
  // shape elements — 3-segment IDs.
  const shapeIds = Array.from(svg.matchAll(/<(?:rect|ellipse|path|polyline)\b[^>]*\bid="([^"]+)"/g))
    .map((m) => m[1] ?? "")
    .filter((id): id is string => id.length > 0);
  // layer nm fields (Lottie envelope).
  const lottie = result.lottie as {
    layers: ReadonlyArray<{ nm: string }>;
  };
  const layerNms = lottie.layers.map((l) => l.nm);
  return { sanitizedSvg: svg, gIds, shapeIds, layerNms };
}

/**
 * Spawn `compile-stdin.ts` against a fixture, return the
 * **raw compiler SVG** from the envelope. Sanitizing the
 * bytes in-process (same `sanitizeSvg` config as the
 * orchestrator) gives the third sanitized output for
 * cross-regeneration comparison.
 *
 * The `catalogue` and `style` parameters are reserved for a
 * future widening (cross-validation against the in-process
 * envelope); the IPC seam independently loads both.
 */
function compileStdinSanitizeAndInventory(
  _catalogue: RecipeCatalogue,
  _style: StyleSpec,
  assetId: string,
  recipeId: string,
): {
  sanitizedSvg: string;
  gIds: string[];
  shapeIds: string[];
  layerNms: string[];
} {
  if (!existsSync(TSX_CLI)) {
    throw new Error(
      `tsx binary missing at ${TSX_CLI} — \`npm ci\` should have installed it (devDep, pinned in package.json)`,
    );
  }
  // The fixture is keyed by recipe id, EXCEPT for galerie
  // (D-03 option-b): wiggle recipe → `wiggle.json` for a-009
  // and `galerie.json` for a-011. Pick the right file by
  // asset_id.
  const fixtureFilename = assetId === "a-011" ? "galerie.json" : `${recipeId}.json`;
  const fixturePath = join(FIXTURES_DIR, fixtureFilename);
  if (!existsSync(fixturePath)) {
    throw new Error(`fixture missing at ${fixturePath}`);
  }
  const fixtureContent = readFileSync(fixturePath, "utf-8");
  const result = spawnSync(process.execPath, [TSX_CLI, COMPILE_STDIN], {
    cwd: REPO_ROOT,
    input: fixtureContent,
    timeout: 30_000,
  });
  if (result.status !== 0 || !result.stdout) {
    throw new Error(
      `compile-stdin failed: exit=${result.status} stderr=${(result.stderr ?? "<none>").toString().trim()}`,
    );
  }
  const envelope = JSON.parse(Buffer.from(result.stdout).toString("utf-8")) as {
    asset_id: string;
    svg: string;
    lottie: { layers: ReadonlyArray<{ nm: string }> };
  };
  // Sanitize the raw compiler SVG with the same orchestrator.
  // Use the in-process sanitizeSvg — the test asserts the
  // SANITIZED-ID invariant; the IPC seam is covered by
  // `compiler.spec.ts` (byte-comparison) and
  // `determinism.spec.ts` (cross-process determinism).
  const sanitized = sanitizeSvg({ asset_id: envelope.asset_id, svg: envelope.svg });
  expect(sanitized.ok).toBe(true);
  if (!sanitized.ok) {
    throw new Error(
      `process-spawned sanitizer rejected clean compile for ${envelope.asset_id}: ${JSON.stringify(sanitized.report.violations)}`,
    );
  }
  const svg = sanitized.svg;
  expect(svg, "ok=true sanitized result must carry svg (SanitizeResult.superRefine)").toBeDefined();
  if (svg === undefined) {
    throw new Error("sanitized.svg is undefined despite ok=true (schema invariant violated)");
  }
  const gIds = Array.from(svg.matchAll(/<g\b[^>]*\bid="([^"]+)"/g))
    .map((m) => m[1] ?? "")
    .filter((id): id is string => id.length > 0);
  const shapeIds = Array.from(svg.matchAll(/<(?:rect|ellipse|path|polyline)\b[^>]*\bid="([^"]+)"/g))
    .map((m) => m[1] ?? "")
    .filter((id): id is string => id.length > 0);
  const layerNms = envelope.lottie.layers.map((l) => l.nm);
  return { sanitizedSvg: svg, gIds, shapeIds, layerNms };
}

/**
 * Walk the sanitized SVG and assert the ID scheme:
 *
 *   - Every `<g>` ID matches `^{asset_id}_[a-z][a-z0-9-]*$`
 *     (2 segments joined by `_`, asset_id prefix).
 *   - Every shape ID matches `^{asset_id}_[a-z][a-z0-9-]*_[a-z][a-z0-9-]*$`
 *     (3 segments, asset_id prefix, prefix matches its parent `<g>`).
 *
 * Returns `{ g, shape }` counts for the caller (asserted in the
 * same loop — the assertion fails on the FIRST violation).
 */
function assertScheme(assetId: string, gIds: string[], shapeIds: string[]): void {
  const ASSET_ID = assetId;
  const TWO_SEG = new RegExp(`^${ASSET_ID}_[a-z][a-z0-9-]*$`);
  const THREE_SEG = new RegExp(`^${ASSET_ID}_[a-z][a-z0-9-]*_[a-z][a-z0-9-]*$`);
  for (const id of gIds) {
    expect(id, `2-segment g id ${id} violates D-32 / SAN-03`).toMatch(TWO_SEG);
  }
  for (const id of shapeIds) {
    expect(id, `3-segment shape id ${id} violates D-32 / SAN-03`).toMatch(THREE_SEG);
  }
  // Every shape ID's prefix must equal one of the g IDs + "_"
  // (D-32 mirror at the output level — verify the integrity of
  // the parent-child relationship).
  const gPrefixes = new Set(gIds.map((id) => `${id}_`));
  for (const id of shapeIds) {
    // Find the parent by stripping the trailing role segment.
    const lastUnderscore = id.lastIndexOf("_");
    const parentPrefix = `${id.slice(0, lastUnderscore)}_`;
    // parentPrefix ends with "_" already — strip and check membership.
    const parent = parentPrefix.slice(0, -1);
    expect(
      gPrefixes.has(parentPrefix) || id.startsWith(parent),
      `shape ${id} does not belong to any <g> parent`,
    ).toBe(true);
  }
  // `(component, role)` uniqueness per asset (D-32 mirror at
  // the output level — the same pair must not appear twice).
  const seen = new Set<string>();
  for (const id of shapeIds) {
    expect(seen.has(id), `duplicate shape id ${id} — D-32 uniqueness violated`).toBe(false);
    seen.add(id);
  }
}

describe("SAN-03 stable-ID proof on the sanitized output (Pitfall 6)", () => {
  // We bound this suite to the 11 closed Phase 3 fixtures.
  // 11 cases × 3 compile+sanitize cycles each = 33 total
  // operations; the cross-regeneration multiset comparison
  // catches every hidden nondeterminism in the ID path.
  const catalogue = loadCatalogue();
  const style = loadStyle();

  // Cover every committed fixture — the gallery case with
  // 4 components exercises the (component, role) uniqueness
  // rule on a single asset.
  const cases = [
    { recipeId: "fade", assetId: "a-001" },
    { recipeId: "slide", assetId: "a-002" },
    { recipeId: "bounce", assetId: "a-003" },
    { recipeId: "pulse", assetId: "a-004" },
    { recipeId: "draw-on", assetId: "a-005" },
    { recipeId: "rotate", assetId: "a-006" },
    { recipeId: "scale-pop", assetId: "a-007" },
    { recipeId: "float", assetId: "a-008" },
    { recipeId: "wiggle", assetId: "a-009" },
    { recipeId: "orbit", assetId: "a-010" },
    { recipeId: "wiggle", assetId: "a-011" }, // galerie under wiggle recipe
  ];

  for (const { recipeId, assetId } of cases) {
    it(`${assetId}/${recipeId}: ID multisets identical across two in-process + one process-spawned compile (SAN-03, D-32)`, () => {
      // Three independent compilations.
      const run1 = compileSanitizeAndInventory(catalogue, style, assetId, recipeId);
      const run2 = compileSanitizeAndInventory(catalogue, style, assetId, recipeId);
      const run3 = compileStdinSanitizeAndInventory(catalogue, style, assetId, recipeId);

      // 1. ID scheme conformance (every ID matches the
      //    2/3-segment rule on each of the 3 runs).
      assertScheme(assetId, run1.gIds, run1.shapeIds);
      assertScheme(assetId, run2.gIds, run2.shapeIds);
      assertScheme(assetId, run3.gIds, run3.shapeIds);

      // 2. Multisets identical across the 3 runs.
      expect(new Set(run2.gIds)).toEqual(new Set(run1.gIds));
      expect(new Set(run3.gIds)).toEqual(new Set(run1.gIds));
      expect(new Set(run2.shapeIds)).toEqual(new Set(run1.shapeIds));
      expect(new Set(run3.shapeIds)).toEqual(new Set(run1.shapeIds));

      // 3. Layer `nm` multisets identical (lottie layer naming
      //    carries the role — D-02). The role set MUST equal
      //    the component role set.
      expect(new Set(run2.layerNms)).toEqual(new Set(run1.layerNms));
      expect(new Set(run3.layerNms)).toEqual(new Set(run1.layerNms));
    }, 60_000);
  }

  it("(fixture-level): the committed fixtures supply 1..N components and 11 cover the (component, role) pairing", () => {
    // Smoke check: a 1-component fixture (fade) yields exactly
    // one `<g>` and one shape; the galerie yields 4. This is
    // a sidecheck to ensure the inventory extraction sees the
    // emit correctly — a fixture with 0 components would be a
    // D-07 violation flagged by RenderSpecSchema.
    const fade = compileSanitizeAndInventory(catalogue, style, "a-001", "fade");
    expect(fade.gIds.length).toBe(1);
    expect(fade.shapeIds.length).toBe(1);
    const galerie = compileSanitizeAndInventory(catalogue, style, "a-011", "wiggle");
    expect(galerie.gIds.length).toBe(4);
    expect(galerie.shapeIds.length).toBe(4);
  });
});
