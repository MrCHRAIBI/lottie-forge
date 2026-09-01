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
 *    **reversed** component order (D-10 + Pitfall 1: Lottie's
 *    first layer renders on top, so components[0] = background
 *    becomes layers[N-1]). The layer `nm` is the component
 *    `role` (D-02 — theming anchor). The Lottie `ks` block is
 *    built by `transform-builder.ts`; the shape item is built by
 *    `shape-builder.ts`; the keyframes (currently `opacity-ramp`
 *    only) come from `keyframe-emitter.ts`.
 *
 * **COM-03 — re-validation before return.** The emitted Lottie
 * JSON is `safeParse`-d through `LottieJSONSchema` as the **last
 * act** of `compile()`. A failure throws a `CompileError` —
 * never returns a partial result.
 *
 * **Pure module orchestrator, but calls the keyframe emitter +
 * builders** which are themselves pure. The compile result is
 * deterministic across invocations (COM-01 — same `RenderSpec`
 * → same bytes, modulo `renderer_support` which is constant).
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

import { classify } from "./feature-gate.js";
import { CompileError, emitKeyframes } from "./keyframe-emitter.js";
import { FRAME_RATE } from "./meta.js";
import { buildShapeItem } from "./shape-builder.js";
import { buildSvg } from "./svg-builder.js";
import { buildTransform } from "./transform-builder.js";

/**
 * Lookup the resolved recipe from the catalogue by its id. The
 * catalogue is small (8..12 recipes, ADR-03 invariant); the linear
 * scan is faster than a Map build + lookup at this scale and keeps
 * the orchestrator's allocation footprint small.
 */
function findRecipe(catalogue: RecipeCatalogue, id: RecipeId) {
  const recipe = catalogue.recipes.find((r) => r.id === id);
  if (recipe === undefined) {
    // Should be impossible — the RenderSpecSchema gates `recipe_id`
    // to the locked vocabulary. Defensive throw anyway.
    throw new CompileError(
      `recipe ${id} not found in catalogue (recipe count: ${catalogue.recipes.length})`,
    );
  }
  return recipe;
}

/**
 * Compile a `RenderSpec` into the closed `CompileResult` envelope.
 *
 * Throws `CompileError` on any validation failure (cross-ref,
 * keyframe-shape not implemented, LottieJSON re-validation
 * failure). The caller — the RPC server — maps the throw into a
 * `compile_error` envelope per D-28/D-36.
 */
export function compile(
  renderSpec: RenderSpec,
  catalogue: RecipeCatalogue,
  style: StyleSpec,
): CompileResult {
  // D-17 — joint validation through the existing schema. The
  // schema carries the easing cross-ref and the catalogue's
  // structural invariants.
  const joint = JointCatalogueStyleSchema.safeParse({ catalogue, style });
  if (!joint.success) {
    throw new CompileError(
      `joint catalogue+style validation failed: ${JSON.stringify(joint.error.issues)}`,
    );
  }

  const recipe = findRecipe(catalogue, renderSpec.recipe_id);
  const op = Math.round((recipe.duration_ms * FRAME_RATE) / 1000);

  // D-05 — per-component cross-references (collect-all).
  validateComponentCrossRefs(renderSpec, recipe);

  // Per-component emission.
  const emittedLayers = renderSpec.components.map((component, index) => {
    // Keyframes: only the recipe's animated property carries
    // keyframes; static channels get their default from
    // transform-builder. Phase 3 TRACER: only `opacity-ramp`
    // is implemented in keyframe-emitter.
    const motion = renderSpec.motion;
    const easing = style.easing_curves.find((c) => c.name === recipe.easing);
    if (easing === undefined) {
      // Should be impossible — the joint validation above
      // already gates this.
      throw new CompileError(
        `easing ${recipe.easing} not found in StyleSpec.easing_curves — joint validation should have caught this`,
      );
    }
    const emitted = emitKeyframes(
      recipe.keyframe_shape,
      motion.amplitude,
      recipe.duration_ms,
      FRAME_RATE,
      easing,
    );
    const shapes = buildShapeItem(component, style);
    const ks = buildTransform(component, emitted.keyframes, emitted.property, style.viewBox);
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

  // D-10 + Pitfall 1 — Lottie layers render in REVERSE array
  // order (first list element renders on top). Components[0] =
  // background → layers[N-1] = first to render = behind. Reverse
  // the emitted layers.
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

  // COM-03 — re-validation as the last act. A failure throws —
  // never returns a partial result.
  const lottieResult = LottieJSONSchema.safeParse(lottieEnvelope);
  if (!lottieResult.success) {
    throw new CompileError(
      `LottieJSON re-validation failed: ${JSON.stringify(lottieResult.error.issues)}`,
    );
  }

  const svg = buildSvg(renderSpec, style);

  return {
    asset_id: renderSpec.asset_id,
    recipe_id: renderSpec.recipe_id,
    renderer_support: classify([]),
    lottie: lottieResult.data,
    svg,
  };
}

/**
 * Collect-all cross-ref validator (D-05).
 *
 * Two structural invariants per component:
 *
 * 1. The component's `shape.shape` discriminator is in the recipe's
 *    `shapes_supported` set.
 * 2. The `motion.amplitude` lies in the recipe's `intensity_range`.
 *
 * The collector accumulates every violation into one throw — a
 * partial pass is not allowed.
 */
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

// Re-export the vocabulary tuple for callers that need to drive
// the compiler in a loop (the test suite).
export { RECIPE_IDS };
