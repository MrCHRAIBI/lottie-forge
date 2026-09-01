/**
 * Markers module — trigger-point derivation for the Motion Compiler.
 *
 * **Phase 3 TRACER surface (plan 03-04):** the LottieJSONSchema
 * (frozen at the Phase 3 zod layer) does not include a `markers`
 * field, so the compiler does not currently emit any Lottie marker
 * structure. This module exposes the trigger-to-frame mapping logic
 * for documentation + future extension.
 *
 * The marker contract per `docs/project/06_Backbone.md` §6.3.5:
 *
 * - One-shot `enter` recipes (fade, slide, bounce, draw-on,
 *   rotate, scale-pop, wiggle) → marker at the **final frame**
 *   (`op`) — the asset "ends" at the trigger.
 * - `loop` recipes (orbit, float, pulse) → marker at **frame 0**
 *   — the asset loops back to the trigger.
 *
 * The actual emit hook will land in a later plan; for now the
 * orchestrator imports the `triggerFramesFor` helper to keep the
 * derivation visible (a future plan adds the marker emission
 * without architectural change).
 *
 * **Pure module, zero I/O.**
 */

import type { CatalogRecipe } from "../rpc/contracts/catalogue.schema.js";

/**
 * The frame a trigger marker points at, expressed in absolute
 * Lottie frame coordinates. `op` is the recipe's last-frame
 * boundary (inclusive); `0` is the asset's t=0.
 */
export type TriggerFrame = number;

/**
 * Compute the trigger-frame mapping for a recipe. The function
 * inspects each declared `trigger_point` and returns one frame
 * per trigger:
 *
 *   enter → op (final frame; one-shot semantics)
 *   exit  → op (final frame; mirrors enter for symmetry)
 *   loop  → 0  (loops back to start)
 *
 * @param recipe - the resolved catalog recipe (carries
 *                 `duration_ms` + `trigger_points`).
 * @param op    - the Lottie `op` frame (the recipe's end frame).
 * @returns one frame per declared trigger, in the order the
 *          triggers appear in `trigger_points`.
 */
export function triggerFramesFor(recipe: CatalogRecipe, op: number): ReadonlyArray<TriggerFrame> {
  return recipe.trigger_points.map((trigger) => {
    switch (trigger) {
      case "enter":
        return op;
      case "exit":
        return op;
      case "loop":
        return 0;
      default: {
        const _exhaustive: never = trigger;
        throw new Error(
          `unknown trigger_point: ${JSON.stringify(_exhaustive)} — must be one of the 3 locked values`,
        );
      }
    }
  });
}

/**
 * Empty marker list — the Phase 3 LottieJSONSchema re-validation
 * gate does not include a `markers` field, so the compiler
 * returns an empty list. A future plan may extend
 * `LottieJSONSchema` with a `markers` field and update this
 * function to build the actual marker array.
 */
export function markersFor(): ReadonlyArray<never> {
  return [];
}
