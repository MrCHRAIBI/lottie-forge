/**
 * Motion Compiler orchestrator — `compile(renderSpec, catalogue, style)`
 * produces the closed `CompileResult` envelope:
 *
 *   { asset_id, recipe_id, renderer_support, lottie, svg }
 *
 * Three responsibilities, in order:
 *
 * 1. **Joint validation (D-05, D-17):** the load is `safeParse`-d
 *    through the existing `JointCatalogueStyleSchema` from
 *    `catalogue.schema.ts`. The cross-references baked into that
 *    schema — easing ∈ `StyleSpec.easing_curves` — fail loud at
 *    the gate.
 *
 * 2. **Per-component cross-references (D-05, D-34):** every
 *    component's shape generator MUST be in the resolved recipe's
 *    `shapes_supported` set; the recipe's `intensity_range` MUST
 *    bracket the `motion.amplitude`. The checks collect-all (never
 *    short-circuit) and throw a single `CompileError` on any
 *    violation.
 *
 * 3. **Lottie + SVG emission:** each component becomes one Lottie
 *    shape layer + one SVG `<g>`. The layers are emitted in
 *    **reversed** component order (D-10 + Pitfall 1). The layer
 *    `nm` is the component `role` (D-02).
 *
 * **COM-03 — re-validation as the LAST act.** The emitted Lottie
 * JSON is `safeParse`-d through `LottieJSONSchema`. A failure
 * throws a `CompileError` — never returns a partial result.
 *
 * **Phase 3 TASK 2 (plan 03-05) state:** all 5 shape generators
 * implemented (rect, ellipse, path, polyline, polystar); D-15
 * pose rule + trigger marker emission wired into markers.ts. The
 * feature-gate is still in the TRACER state (Task 3 widens it).
 *
 * **Pure module orchestrator, but calls the keyframe emitter +
 * builders** which are themselves pure.
 */

import type { RecipeCatalogue } from "../rpc/contracts/catalogue.schema.js";
import { JointCatalogueStyleSchema } from "../rpc/contracts/catalogue.schema.js";
import {
  type CompileResult,
  LottieJSONSchema,
  type RenderSpec,
} from "../rpc/contracts/motion-compiler.schema.js";
import type { StyleSpec } from "../rpc/contracts/style-spec.schema.js";
import { RECIPE_IDS, type RecipeId } from "../rpc/contracts/vocabulary.schema.js";

import { assertSupportedComposition, classify } from "./feature-gate.js";
import { CompileError, emitKeyframes } from "./keyframe-emitter.js";
import { markersFor } from "./markers.js";
import { FRAME_RATE } from "./meta.js";
import { buildShapeItem } from "./shape-builder.js";
import { buildSvg } from "./svg-builder.js";
import { buildTransform } from "./transform-builder.js";

function findRecipe(catalogue: RecipeCatalogue, id: RecipeId) {
  const recipe = catalogue.recipes.find((r) => r.id === id);
  if (recipe === undefined) {
    throw new CompileError(
      `recipe ${id} not found in catalogue (recipe count: ${catalogue.recipes.length})`,
    );
  }
  return recipe;
}

export function compile(
  renderSpec: RenderSpec,
  catalogue: RecipeCatalogue,
  style: StyleSpec,
): CompileResult {
  const joint = JointCatalogueStyleSchema.safeParse({ catalogue, style });
  if (!joint.success) {
    throw new CompileError(
      `joint catalogue+style validation failed: ${JSON.stringify(joint.error.issues)}`,
    );
  }

  const recipe = findRecipe(catalogue, renderSpec.recipe_id);
  const op = Math.round((recipe.duration_ms * FRAME_RATE) / 1000);

  validateComponentCrossRefs(renderSpec, recipe);

  const emittedLayers = renderSpec.components.map((component, index) => {
    const motion = renderSpec.motion;
    const easing = style.easing_curves.find((c) => c.name === recipe.easing);
    if (easing === undefined) {
      throw new CompileError(
        `easing ${recipe.easing} not found in StyleSpec.easing_curves — joint validation should have caught this`,
      );
    }
    const restPx =
      style.viewBox.width / 2 + (component.transform?.translate_dx ?? 0) * style.viewBox.width;
    const restPy =
      style.viewBox.height / 2 + (component.transform?.translate_dy ?? 0) * style.viewBox.height;
    const restScale = component.transform?.scale ?? 1;
    const restRotation = component.transform?.rotation_deg ?? 0;
    const emitted = emitKeyframes(
      recipe.keyframe_shape,
      motion,
      recipe.duration_ms,
      FRAME_RATE,
      easing,
      style.viewBox,
      { px: restPx, py: restPy, s: restScale, r: restRotation },
    );
    // TASK 2 STATE: the trim item (D-14, draw-on) is now threaded
    // into the layer's gr.it array by shape-builder.
    const shapes = buildShapeItem(component, style, emitted.trim);
    const ks = buildTransform(component, emitted.property, emitted.keyframes, style.viewBox);
    return {
      ddd: 0 as const,
      ind: index + 1,
      ty: 4 as const,
      nm: component.role,
      ip: 0,
      op,
      ks,
      shapes,
    };
  });

  const layers = [...emittedLayers].reverse();

  const lottieEnvelope = {
    v: "5.7.0" as const,
    fr: FRAME_RATE,
    ip: 0,
    op,
    ddd: 0 as const,
    assets: [] as ReadonlyArray<unknown>,
    layers,
  };

  const lottieResult = LottieJSONSchema.safeParse(lottieEnvelope);
  if (!lottieResult.success) {
    throw new CompileError(
      `LottieJSON re-validation failed: ${JSON.stringify(lottieResult.error.issues)}`,
    );
  }

  // COM-04 — defense-in-depth feature gate (D-33). The schema
  // pins the structural rules; the gate re-asserts any feature
  // outside the lottie-web 5.13 subset.
  assertSupportedComposition(lottieResult.data);

  // TASK 2 STATE: trigger markers derived from catalogue (D-34).
  // The Phase 3 frozen LottieJSONSchema does not embed a
  // `markers` field; the helper is exported for plan 03-06
  // (goldens) + 03-07 (RPC) when the schema widens.
  const _markers = markersFor(recipe, op);
  void _markers;

  const svg = buildSvg(renderSpec, style);

  return {
    asset_id: renderSpec.asset_id,
    recipe_id: renderSpec.recipe_id,
    renderer_support: classify([]),
    lottie: lottieResult.data,
    svg,
  };
}

function validateComponentCrossRefs(
  spec: RenderSpec,
  recipe: {
    id: RecipeId;
    shapes_supported: ReadonlyArray<string>;
    intensity_range: readonly [number, number];
  },
): void {
  const violations: string[] = [];

  const allowedShapes = new Set(recipe.shapes_supported);
  for (let i = 0; i < spec.components.length; i += 1) {
    const component = spec.components[i];
    if (component === undefined) continue;
    const shapeKind = component.shape.shape;
    if (!allowedShapes.has(shapeKind)) {
      violations.push(
        `component[${i}] shape '${shapeKind}' is not in recipe '${recipe.id}' shapes_supported [${recipe.shapes_supported.join(", ")}]`,
      );
    }
  }

  const [intensityMin, intensityMax] = recipe.intensity_range;
  if (spec.motion.amplitude < intensityMin || spec.motion.amplitude > intensityMax) {
    violations.push(
      `motion.amplitude (${spec.motion.amplitude}) is outside recipe '${recipe.id}' intensity_range [${intensityMin}, ${intensityMax}]`,
    );
  }

  if (violations.length > 0) {
    throw new CompileError(`D-05 cross-ref violations: ${violations.join("; ")}`);
  }
}

export { RECIPE_IDS };
