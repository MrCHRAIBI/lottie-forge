/**
 * `compile-and-check.ts` — shared helper for compiler-level
 * golden tests (plan 03-06). Lives under `__tests__/` because
 * vitest only picks up `*.spec.ts` from this directory; the
 * helper is a regular TypeScript module consumed by
 * `compiler.spec.ts` and (its in-process half) the
 * `determinism.spec.ts`.
 *
 * **Single source of byte-emission:** the helper compiles the
 * RenderSpec, serialises the produced envelope through the
 * exact same `serializeDeterministicJson` walker as
 * `compile-stdin.ts` (the README pattern of D-23/D-24/D-35),
 * and returns both the bytes and the parsed envelope. The
 * process-spawned `determinism.spec.ts` performs the SAME
 * serialisation; a divergence between the two surfaces a
 * drift in compilation versus emission.
 */

import type { CatalogRecipe, RecipeCatalogue } from "../../../rpc/contracts/catalogue.schema.js";
import type { RenderSpec } from "../../../rpc/contracts/motion-compiler.schema.js";
import { type StyleSpec, StyleSpecSchema } from "../../../rpc/contracts/style-spec.schema.js";
import type { RecipeId } from "../../../rpc/contracts/vocabulary.schema.js";
import { serializeDeterministicJson } from "../../../shared/format.js";

import { compileFromFixture } from "./compile-from-fixture.js";

/**
 * The pinned golden style spec — verbatim mirror of
 * `scripts/compile-stdin.ts`. Any change invalidates every
 * committed golden (D-23 reversibility: costly).
 */
export const GOLDEN_STYLE_SPEC: StyleSpec = StyleSpecSchema.parse({
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

export interface GoldenEnvelope {
  asset_id: string;
  recipe_id: RecipeId;
  renderer_support: "all" | "svg-only";
  lottie: unknown;
  svg: string;
}

/**
 * Build the canonical envelope byte-for-byte. The serializer
 * emits fields in insertion order:
 *
 *   asset_id → recipe_id → renderer_support → lottie → svg
 *
 * Any future field addition must be APPENDED at the tail —
 * same-commit byte discipline (D-25).
 */
function envelopeObject(result: {
  asset_id: string;
  recipe_id: RecipeId;
  renderer_support: "all" | "svg-only";
  lottie: unknown;
  svg: string;
}): GoldenEnvelope {
  return {
    asset_id: result.asset_id,
    recipe_id: result.recipe_id,
    renderer_support: result.renderer_support,
    lottie: result.lottie,
    svg: result.svg,
  };
}

/**
 * Produce the envelope bytes for a fixture. In-process compile
 * + serializer (no spawn). The bytes match what
 * `compile-stdin.ts` emits process-side; the determinism test
 * proves they also match what an independent process emits.
 */
export function compileAndCheckGolden(params: {
  assetId: string;
  recipeId: RecipeId;
  catalogue: RecipeCatalogue;
  style: StyleSpec;
}): { bytes: Buffer; envelope: GoldenEnvelope; renderSpec: RenderSpec } {
  const { result, renderSpec } = compileFromFixture({
    assetId: params.assetId,
    recipeId: params.recipeId,
    catalogue: params.catalogue,
    style: params.style,
  });
  const envelope = envelopeObject(result);
  const body = serializeDeterministicJson(envelope);
  // D-24 — compact JSON + final "\n" terminator (Pitfall 9 — LF
  // only, never `os.EOL`).
  const bytes = Buffer.from(`${body}\n`, "utf-8");
  return { bytes, envelope, renderSpec };
}

/**
 * Find the catalogue recipe for a given recipe id, or throw
 * a fail-loud error. Consumers (compiler.spec.ts) handle a
 * missing catalogue entry the same as a missing golden — the
 * bytes NEVER ship under that condition.
 */
export function findRecipeOrThrow(catalogue: RecipeCatalogue, recipeId: RecipeId): CatalogRecipe {
  const recipe = catalogue.recipes.find((r) => r.id === recipeId);
  if (recipe === undefined) {
    throw new Error(
      `recipe ${recipeId} not found in catalogue (catalogue holds ${catalogue.recipes.length} recipes)`,
    );
  }
  return recipe;
}
