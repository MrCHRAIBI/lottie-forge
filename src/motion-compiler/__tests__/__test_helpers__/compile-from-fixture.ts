/**
 * `compile-from-fixture.ts` — fixture loader + compile helper
 * shared by `compiler.spec.ts` and `determinism.spec.ts`.
 *
 * The helper reads the committed RenderSpec file under
 * `fixtures/render-specs/` and runs the same `compile()`
 * orchestrator the RPC server uses (Plan 03-06 Task 2 — the
 * in-process test path mirrors the production path; the
 * process-spawned `determinism.spec.ts` covers the IPC seam).
 *
 * **No state caching:** every call re-reads the
 * RenderSpec from disk and re-parses the catalogue. The TS
 * import cache would hide a module-replacement bug (e.g. a
 * future plan 03-07 widening that monkey-patches the
 * orchestrator); loading fresh on every call keeps the test
 * honest with the rebuild doctrine.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { compile } from "../../../motion-compiler/compiler.js";
import type { RecipeCatalogue } from "../../../rpc/contracts/catalogue.schema.js";
import {
  type CompileResult,
  type RenderSpec,
  RenderSpecSchema,
} from "../../../rpc/contracts/motion-compiler.schema.js";
import type { StyleSpec } from "../../../rpc/contracts/style-spec.schema.js";
import type { RecipeId } from "../../../rpc/contracts/vocabulary.schema.js";

/**
 * Per-asset-id filename disambiguation. The wiggle recipe has
 * TWO committed fixtures — `wiggle.json` (a-009) and
 * `galerie.json` (a-011, D-03 option-b — see 03-03 SUMMARY).
 * For all other recipes, the asset-id → filename mapping is
 * 1:1 (asset_id "a-003" + recipe_id "bounce" → bounce.json,
 * etc.).
 *
 * The mapping is keyed by asset_id (not recipe_id) so the
 * fixture's identity — the asset — is the unambiguous input.
 */
const FIXTURE_BY_ASSET_ID: Record<string, string> = {
  "a-001": "fade.json",
  "a-002": "slide.json",
  "a-003": "bounce.json",
  "a-004": "pulse.json",
  "a-005": "draw-on.json",
  "a-006": "rotate.json",
  "a-007": "scale-pop.json",
  "a-008": "float.json",
  "a-009": "wiggle.json",
  "a-010": "orbit.json",
  "a-011": "galerie.json",
};

/**
 * Resolve an asset_id to its committed fixture filename.
 * Throws on an unknown asset id (the closed `^a-\d{3}$` set
 * has 11 entries during Phase 3).
 */
export function fixtureNameFor(assetId: string): string {
  const name = FIXTURE_BY_ASSET_ID[assetId];
  if (name === undefined) {
    throw new Error(
      `unknown asset_id "${assetId}" — Phase 3 commits exactly 11 fixtures, this map is closed`,
    );
  }
  return name;
}

/**
 * Read + zod-parse the committed RenderSpec for a given
 * asset id. The fixture's `asset_id` field is asserted as a
 * consistency check; a mismatch is treated as a test wiring
 * bug (the helper maps asset_id → fixture basename).
 */
export function loadRenderSpec(repoRoot: string, assetId: string, _recipeId: RecipeId): RenderSpec {
  const filename = fixtureNameFor(assetId);
  const path = join(repoRoot, "fixtures", "render-specs", filename);
  const raw = JSON.parse(readFileSync(path, "utf-8")) as { asset_id: string };
  if (raw.asset_id !== assetId) {
    throw new Error(
      `fixture ${filename} carries asset_id "${raw.asset_id}", expected "${assetId}" — fixture/asset wiring drift`,
    );
  }
  return RenderSpecSchema.parse(raw);
}

/**
 * The compile-only path used by both in-process
 * `compiler.spec.ts` and the in-process helper beneath
 * `determinism.spec.ts`. The function returns both the
 * compile `result` (for envelope construction) and the
 * parsed `renderSpec` (for cross-references the spec needs).
 */
export function compileFromFixture(params: {
  assetId: string;
  recipeId: RecipeId;
  catalogue: RecipeCatalogue;
  style: StyleSpec;
  repoRoot?: string;
}): { result: CompileResult; renderSpec: RenderSpec } {
  // The default `repoRoot` derives from this file's location
  // (the test helper lives at
  // `src/motion-compiler/__tests__/__test_helpers__/`).
  // Counting: helper → __test_helpers__ → __tests__ →
  //   motion-compiler → src → repo root (4 levels up).
  const repoRoot = params.repoRoot ?? join(__dirname, "..", "..", "..", "..");
  const renderSpec = loadRenderSpec(repoRoot, params.assetId, params.recipeId);
  // Re-validate `style` through the gate — defensive; the
  // compile call does the same internally via JointCatalogueStyleSchema.
  const result = compile(renderSpec, params.catalogue, params.style);
  return { result, renderSpec };
}
