/**
 * `golden-fixtures.ts` — golden file naming for plan 03-06.
 *
 * Maps each committed `fixtures/render-specs/*.json` to its
 * expected golden filename under
 * `src/motion-compiler/__tests__/goldens/`. The order is the
 * 1-based asset-index order (a-001..a-011) — the same order
 * `makeAllFixtures()` produces in `make-render-spec.ts`.
 *
 * Living as a separate helper rather than inlined in
 * `compiler.spec.ts` keeps the byte-comparison surface clean:
 * the helper owns the *naming* concerns (asset id parsing,
 * galerie-vs-recipe distinction, sort order) and the spec
 * owns the assertion concerns.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { KeyframeShape } from "../../../rpc/contracts/catalogue.schema.js";
import type { RecipeId } from "../../../rpc/contracts/vocabulary.schema.js";

export interface GoldenFixtureInfo {
  /** The asset id (e.g. "a-001") — first segment of the golden basename. */
  assetId: string;
  /** The recipe id (10 of them) — `wiggle` for the galerie fixture. */
  recipeId: RecipeId;
  /** The recipe's keyframe_shape — drives the D-15 pose assertion. */
  keyframeShape: KeyframeShape;
  /** The committed-file name (`fixtures/render-specs/<name>.json`). */
  fixtureName: string;
  /** The golden-file basename (`<assetId>.<recipeId>.golden.json` or `galerie`). */
  goldenName: string;
}

/**
 * The mapping from committed fixture basename to recipe id.
 * The 10 recipe fixtures map 1:1; the galerie fixture
 * substitutes "galerie" for the recipe id (the galerie is a
 * set-level fixture, not a recipe-level one — D-03 option-b,
 * see 03-03 SUMMARY.md).
 */
const FIXTURE_RECIPE_OVERRIDES: Record<string, RecipeId> = {
  galerie: "wiggle",
};

/**
 * Map `recipe id → canonical keyframe_shape` for the
 * Phase 3 catalogue. Pulled from
 * `fixtures/recipe-catalogue/catalogue.json` (locked at
 * `1.0.0`); the values here mirror that fixture verbatim and
 * exhaustively cover the 10 closed recipe ids.
 */
const KEYFRAME_SHAPE_BY_RECIPE: Record<RecipeId, KeyframeShape> = {
  fade: "opacity-ramp",
  slide: "translate-in",
  bounce: "overshoot-settle",
  pulse: "scale-breath",
  "draw-on": "trim-path",
  rotate: "angular-in",
  "scale-pop": "pop-settle",
  float: "sine-drift",
  wiggle: "damped-oscillation",
  orbit: "circular-path",
};

/**
 * The 11 committed fixture files in 1-based asset-index order
 * (a-001..a-011). Each entry carries the asset id parsed from
 * the fixture file, the recipe id (10 of them or `wiggle`
 * for the galerie), the recipe's keyframe_shape, and the
 * golden-file basename.
 */
export function listFixturesAndExpectedNames(repoRoot: string): GoldenFixtureInfo[] {
  const dir = join(repoRoot, "fixtures", "render-specs");
  const names = readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .sort();
  return names.map((name): GoldenFixtureInfo => {
    const base = name.replace(/\.json$/, "");
    // Read the committed fixture to extract the asset_id.
    // node:fs readFileSync is the canonical byte source — a
    // partial JSON would surface as a JSON.parse exception.
    const raw = JSON.parse(readFileSync(join(dir, name), "utf-8")) as { asset_id: string };
    const recipeId = FIXTURE_RECIPE_OVERRIDES[base] ?? (base as RecipeId);
    return {
      assetId: raw.asset_id,
      recipeId,
      keyframeShape: KEYFRAME_SHAPE_BY_RECIPE[recipeId],
      fixtureName: name,
      goldenName: `${raw.asset_id}.${base}.golden.json`,
    };
  });
}
