/**
 * Markers module — trigger-point derivation + D-15 pose rule
 * for the Motion Compiler.
 *
 * **Phase 3 WIDENING (plan 03-05):** the D-15 pose rule is
 * implemented as a closed mapping over `keyframe_shape` — the
 * SVG companion pose is derived deterministically from the
 * recipe (no editing, no free-form triggers in input).
 *
 * **D-15 pose rule:**
 *
 * - One-shot recipes (`enter` trigger semantics — the asset
 *   "ends" at the trigger): resolve the SVG pose at frame
 *   `op` (the recipe's end frame). Shapes:
 *   `opacity-ramp`, `translate-in`, `overshoot-settle`,
 *   `trim-path`, `angular-in`, `pop-settle`,
 *   `damped-oscillation` (7 shapes — even though
 *   `damped-oscillation` is one-shot in the catalogue, the
 *   last-frame settling position is the SVG canonical pose).
 *
 * - Loop recipes (`loop` trigger semantics — the asset cycles
 *   back to the trigger): resolve the SVG pose at frame 0.
 *   Shapes: `scale-breath`, `sine-drift`, `circular-path`
 *   (3 shapes).
 *
 * The exhaustive switch (no default branch, `never` guard) is
 * the D-37 contract.
 *
 * **Trigger marker emission (D-34):** the marker list is
 * derived from the recipe's `trigger_points` + `keyframe_shape`.
 * Markers are emitted in the LottieJSON envelope only by the
 * compiler (never free-form in input). The marker structure is
 * the `cm` (comment) / `tm` (time) / `dr` (duration) trio per
 * the Lottie spec, markers page.
 *
 * **Pure module, zero I/O.**
 */

import type {
  CatalogRecipe,
  KeyframeShape,
  TriggerPoint,
} from "../rpc/contracts/catalogue.schema.js";

/**
 * The frame a trigger marker points at, expressed in absolute
 * Lottie frame coordinates. `op` is the recipe's last-frame
 * boundary (inclusive); `0` is the asset's t=0.
 */
export type TriggerFrame = number;

/**
 * The SVG-companion pose resolution rule (D-15).
 *
 * - One-shot shapes resolve to the **final frame** (`op`) —
 *   the asset has settled into its end-of-animation pose.
 * - Loop shapes resolve to **frame 0** — the asset is at its
 *   cyclic start.
 *
 * The exhaustive switch (no default branch, `never` guard)
 * means a future keyframe shape is a TS compile error
 * (D-37).
 */
export type PoseResolution = "finale" | "t=0";

/**
 * Map a `keyframe_shape` to its SVG pose resolution. The
 * mapping is closed over the 10 locked shapes (D-37).
 *
 * - 7 finale (one-shot): `opacity-ramp`, `translate-in`,
 *   `overshoot-settle`, `trim-path`, `angular-in`,
 *   `pop-settle`, `damped-oscillation`.
 * - 3 t=0 (loop): `scale-breath`, `sine-drift`, `circular-path`.
 */
export function poseResolutionFor(keyframeShape: KeyframeShape): PoseResolution {
  switch (keyframeShape) {
    case "opacity-ramp":
    case "translate-in":
    case "overshoot-settle":
    case "trim-path":
    case "angular-in":
    case "pop-settle":
    case "damped-oscillation":
      return "finale";
    case "scale-breath":
    case "sine-drift":
    case "circular-path":
      return "t=0";
    default: {
      const _exhaustive: never = keyframeShape;
      throw new Error(
        `unknown keyframe shape: ${JSON.stringify(_exhaustive)} — must be one of the 10 locked shapes`,
      );
    }
  }
}

/**
 * Compute the frame the SVG companion should resolve to for a
 * recipe. Combines `poseResolutionFor(keyframe_shape)` with
 * the recipe's `op` frame.
 *
 * - `finale` → returns `op` (the recipe's end frame).
 * - `t=0` → returns `0`.
 */
export function svgPoseFrameFor(recipe: CatalogRecipe, op: number): number {
  const resolution = poseResolutionFor(recipe.keyframe_shape);
  return resolution === "finale" ? op : 0;
}

/**
 * Compute the trigger-frame mapping for a recipe. The function
 * inspects each declared `trigger_point` and returns one frame
 * per trigger:
 *
 *   enter → op (final frame; one-shot semantics)
 *   exit  → op (final frame; mirrors enter for symmetry)
 *   loop  → 0  (loops back to start)
 *
 * @param recipe - the resolved catalog recipe.
 * @param op    - the Lottie `op` frame (the recipe's end frame).
 * @returns one frame per declared trigger, in the order the
 *          triggers appear in `trigger_points`.
 */
export function triggerFramesFor(recipe: CatalogRecipe, op: number): ReadonlyArray<TriggerFrame> {
  return recipe.trigger_points.map((trigger) => triggerFrameFor(trigger, op));
}

/**
 * Compute the single frame a trigger point resolves to.
 */
function triggerFrameFor(trigger: TriggerPoint, op: number): TriggerFrame {
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
}

/**
 * Lottie marker structure (lottie spec, markers page). Each
 * marker carries:
 *
 * - `tm` — the trigger frame (the time the marker fires at).
 * - `cm` — a deterministic comment string built from the
 *   trigger point + the recipe id. NO user-supplied text.
 * - `dr` — the marker duration (zero for instantaneous triggers).
 */
export interface LottieMarker {
  readonly tm: TriggerFrame;
  readonly cm: string;
  readonly dr: number;
}

/**
 * Build the Lottie marker list for a recipe. The marker list is
 * derived from `trigger_points` (catalogue data) + recipe id;
 * NO free-form trigger in input. The `cm` string is the
 * deterministic "trigger-recipe" tag.
 *
 * The marker list is intended for future emission into the
 * Lottie envelope; the Phase 3 frozen LottieJSONSchema does not
 * yet carry a `markers` field, so the compiler does not embed
 * the markers in the JSON output. The function is exported so
 * plan 03-06 (goldens) and plan 03-07 (RPC server) can thread
 * the markers when the schema widens.
 *
 * @param recipe - the resolved catalog recipe.
 * @param op    - the Lottie `op` frame.
 * @returns one marker per `trigger_point` in declaration order.
 */
export function markersFor(recipe: CatalogRecipe, op: number): ReadonlyArray<LottieMarker> {
  return recipe.trigger_points.map((trigger) => ({
    tm: triggerFrameFor(trigger, op),
    cm: `${trigger}-${recipe.id}`,
    dr: 0,
  }));
}
