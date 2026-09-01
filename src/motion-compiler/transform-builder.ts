/**
 * Transform builder — emits the Lottie `Transform` (`ks`) block for a
 * single component.
 *
 * The `ks` block is a strictObject with 5 optional channels
 * (`o` = opacity, `r` = rotation, `p` = position, `s` = scale,
 * `a` = anchor). Each channel is an `AnimatableProperty` — either
 * static (`a: 0`, direct value) or animated (`a: 1`, keyframe array).
 *
 * **D-34 unit gates** (re-stated here for the file-local doctrine):
 *
 * - `s` (scale) MUST be non-negative on every keyframe and on the
 *   static branch — the schema-layer `superRefine` rejects negative
 *   stretch (COM-04 unit gate, mirrored from §6.3.2). A negative
 *   scale would render the shape as a mirror image, corrupting
 *   the asset. Static scale defaults to `[100, 100]` (Lottie
 *   identity scale is `100%`, not `1.0` — Pitfall 2 unit gate).
 *
 * - `o` (opacity) MUST be in `[0, 100]` on every keyframe and on
 *   the static branch (Pitfall 2 — Lottie opacity is percent).
 *
 * - `a` (anchor) MUST equal `p` (position) when the shape is
 *   centered (Pitfall 7). When the shape is at a custom position,
 *   anchor defaults to `[50, 50]` (Lottie's own convention; the
 *   transform pipeline rotates around the anchor point).
 *
 * **Phase 3 WIDENING (plan 03-05):** exactly ONE transform channel
 * is animated per recipe family — opacity for fade, position for
 * slide/orbit/float/wiggle/bounce, scale for pulse/scale-pop,
 * rotation for rotate (D-34 — animated deltas keep their OWN
 * closed ranges, separate from the 0..1 coordinate bounds).
 * Trim-path recipes (`draw-on`) carry `motionProperty: null`;
 * the trim item lives in the layer's `gr.it` array, not in `ks`.
 *
 * **Pure module, zero I/O.**
 */

import type {
  AnimatableProperty,
  Component,
  Keyframe,
  Transform,
  TransformDelta,
} from "../rpc/contracts/motion-compiler.schema.js";

import type { AnimatedProperty } from "./keyframe-emitter.js";

/**
 * Build the `ks` block for a component.
 *
 * @param component    - the RenderSpec component (carries the
 *                       optional transform delta).
 * @param motionProperty - which `ks` channel the keyframes target
 *                       (`o` | `r` | `p` | `s` | `a`), or `null`
 *                       when the recipe carries no transform
 *                       animation (e.g. `trim-path` → the trim
 *                       item lives in `gr.it`, not in `ks`).
 * @param motionFrames - the keyframes emitted by `keyframe-emitter.ts`
 *                       for the recipe's animated property. Empty
 *                       when no transform animation.
 * @param viewBox      - the StyleSpec viewBox (width + height). The
 *                       center coordinate used to anchor centered
 *                       shapes (Pitfall 7 — `a = p` when centered).
 */
export function buildTransform(
  component: Component,
  motionProperty: AnimatedProperty | null,
  motionFrames: ReadonlyArray<Keyframe>,
  viewBox: { width: number; height: number },
): Transform {
  const transform: Transform = {};

  // Compute the resting transform values (the static emit if no
  // animation). The keyframe-emitter uses the same resting
  // values for its absolute position/rotation/scale derivations
  // (D-34 — animated deltas keep their OWN ranges, but they
  // pivot around the same resting center).
  const restPx = viewBox.width / 2 + (component.transform?.translate_dx ?? 0) * viewBox.width;
  const restPy = viewBox.height / 2 + (component.transform?.translate_dy ?? 0) * viewBox.height;
  const restScale = component.transform?.scale ?? 1;
  const restRotation = component.transform?.rotation_deg ?? 0;

  // Opacity channel — animated when `motionProperty === "o"`;
  // static 100 otherwise (Pitfall 2 — percent units).
  if (motionProperty === "o" && motionFrames.length > 0) {
    transform.o = makeAnimated(motionFrames);
  } else {
    transform.o = makeStaticOpacity(100);
  }

  // Rotation channel — animated when `motionProperty === "r"`;
  // static from the transform delta otherwise.
  if (motionProperty === "r" && motionFrames.length > 0) {
    transform.r = makeAnimated(motionFrames);
  } else {
    transform.r = makeStaticRotation(restRotation);
  }

  // Position channel — animated when `motionProperty === "p"`;
  // static from the transform delta otherwise.
  if (motionProperty === "p" && motionFrames.length > 0) {
    transform.p = makeAnimated(motionFrames);
  } else {
    transform.p = makeStaticPosition(restPx, restPy);
  }

  // Scale channel — non-negative (COM-04). Animated when
  // `motionProperty === "s"`; static `multiplier × 100` otherwise.
  if (motionProperty === "s" && motionFrames.length > 0) {
    transform.s = makeAnimated(motionFrames);
  } else {
    transform.s = makeStaticScale(restScale);
  }

  // Anchor channel — `a = p` for centered shapes (Pitfall 7),
  // static. The transform pipeline rotates around the anchor
  // point; matching it to the position keeps the shape's own
  // center invariant under rotation/scale.
  transform.a = makeStaticAnchor(restPx, restPy);

  return transform;
}

/**
 * Wrap a keyframe array in the Lottie `AnimatableProperty` shape
 * (`{ a: 1, k: keyframes }`). The keyframes themselves were
 * emitted by `keyframe-emitter.ts` already in the Lottie format
 * (Pitfall 3 — `s: [v]` vector keyframes).
 */
function makeAnimated(keyframes: ReadonlyArray<Keyframe>): AnimatableProperty {
  return { a: 1, k: [...keyframes] };
}

/**
 * Static opacity — `a: 0` + direct value. Always `100` for
 * non-fade recipes (the asset is fully visible outside the
 * keyframe window). Pitfall 2 — Lottie unit is percent, not
 * [0..1].
 */
function makeStaticOpacity(value: number): AnimatableProperty {
  return { a: 0, k: value };
}

/**
 * Static rotation — `a: 0` + direct value in degrees. The
 * `TransformDelta.rotation_deg` is already gated to [-360, 360]
 * (D-34 own range). Lottie rotation is clockwise positive.
 */
function makeStaticRotation(degrees: number): AnimatableProperty {
  return { a: 0, k: degrees };
}

/**
 * Static position — `a: 0` + 2-tuple of viewport-relative
 * coordinates (normalized 0..1 → viewBox pixels). The
 * RenderSpec carries the normalized deltas; this module
 * multiplies by the StyleSpec viewBox to obtain Lottie's
 * pixel coordinate space.
 *
 * Position is computed as the **viewBox center** + delta:
 *
 *   pos = (viewBox/2) + (delta × viewBox)
 */
function makeStaticPosition(px: number, py: number): AnimatableProperty {
  return { a: 0, k: [px, py] };
}

/**
 * Static anchor — `a: 0` + 2-tuple. Anchor = position for
 * centered shapes (Pitfall 7); the transform pipeline rotates
 * around the anchor point.
 */
function makeStaticAnchor(px: number, py: number): AnimatableProperty {
  return { a: 0, k: [px, py] };
}

/**
 * Static scale — `a: 0` + 2-tuple of percent values (Pitfall 2 —
 * `[100, 100]` is identity, NOT `[1, 1]`). `TransformDelta.scale`
 * is in the D-34 own range [0.1, 4] (a multiplier on the shape's
 * intrinsic size); this module multiplies by 100 to obtain Lottie
 * percent units.
 *
 * Non-negative: the schema-layer `superRefine` rejects negative
 * stretch (COM-04); a negative scale input is a structural reject
 * long before this function runs.
 */
function makeStaticScale(multiplier: number): AnimatableProperty {
  return { a: 0, k: [multiplier * 100, multiplier * 100] };
}

/**
 * Re-export the TransformDelta type for the compiler orchestrator.
 */
export type { TransformDelta };
