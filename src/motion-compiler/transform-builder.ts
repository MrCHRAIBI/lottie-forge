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
 * **Pure module, zero I/O.** The compiler orchestrator is the only
 * caller. The keyframes come from `keyframe-emitter.ts` (a sibling
 * module); the static branches come from the RenderSpec transform
 * delta (D-34 own ranges).
 */

import type {
  AnimatableProperty,
  Component,
  Keyframe,
  Transform,
  TransformDelta,
} from "../rpc/contracts/motion-compiler.schema.js";

/**
 * Build the `ks` block for a component.
 *
 * @param component    - the RenderSpec component (carries the
 *                       optional transform delta).
 * @param motionFrames - the keyframes emitted by `keyframe-emitter.ts`
 *                       for the recipe's animated property. May be
 *                       empty when the recipe has no animated
 *                       transform property (Phase 3 TRACER: only
 *                       fade/opacity-ramp is animated; all other
 *                       recipes would throw inside the emitter).
 * @param motionProperty - which `ks` channel the keyframes target
 *                       (Lottie `o` for opacity-ramp; `r`/`p`/`s`
 *                       for other shapes, Phase 5+).
 * @param viewBox      - the StyleSpec viewBox (width + height). The
 *                       center coordinate used to anchor centered
 *                       shapes (Pitfall 7 — `a = p` when centered).
 */
export function buildTransform(
  component: Component,
  motionFrames: ReadonlyArray<Keyframe>,
  motionProperty: "o" | "r" | "p" | "s" | "a",
  viewBox: { width: number; height: number },
): Transform {
  const transform: Transform = {};

  // Opacity channel — animated when the recipe's keyframe shape
  // targets `o` (currently `opacity-ramp`); static 100% otherwise.
  if (motionProperty === "o" && motionFrames.length > 0) {
    transform.o = makeAnimatedOpacity(motionFrames);
  } else {
    transform.o = makeStaticOpacity(100);
  }

  // Rotation channel — static from the RenderSpec transform delta
  // (D-34 own range -360..360). Phase 3 has no animated rotation
  // (the `angular-in` keyframe shape is widened in plan 03-05).
  transform.r = makeStaticRotation(component.transform?.rotation_deg ?? 0);

  // Position channel — static from the transform delta.
  transform.p = makeStaticPosition(
    viewBox.width,
    viewBox.height,
    component.transform?.translate_dx ?? 0,
    component.transform?.translate_dy ?? 0,
  );

  // Scale channel — non-negative (COM-04). `100` = identity
  // (Pitfall 2). Static from the transform delta; Phase 3 has no
  // animated scale (`scale-breath`/`pop-settle` widened in plan 03-05).
  transform.s = makeStaticScale(component.transform?.scale ?? 1);

  // Anchor channel — `a = p` for centered shapes (Pitfall 7).
  // Position-anchor alignment means rotation/scale pivot around
  // the shape's own center.
  transform.a = makeStaticAnchor(
    viewBox.width,
    viewBox.height,
    component.transform?.translate_dx ?? 0,
    component.transform?.translate_dy ?? 0,
  );

  return transform;
}

/**
 * Animated opacity — `a: 1` + keyframe array. The keyframes carry
 * the Lottie opacity values in 0..100 (Pitfall 2); the schema-layer
 * `superRefine` on `AnimatablePropertySchema` re-validates each
 * keyframe's `s` array.
 */
function makeAnimatedOpacity(keyframes: ReadonlyArray<Keyframe>): AnimatableProperty {
  return { a: 1, k: [...keyframes] };
}

/**
 * Static opacity — `a: 0` + direct value. Always `100` for non-fade
 * recipes (the asset is fully visible outside the keyframe window).
 * Pitfall 2 — Lottie unit is percent, not [0..1].
 */
function makeStaticOpacity(value: number): AnimatableProperty {
  return { a: 0, k: value };
}

/**
 * Static rotation — `a: 0` + direct value in degrees. The
 * `TransformDelta.rotation_deg` is already gated to [-360, 360]
 * (D-34 own range). Lottie rotation is clockwise positive (matches
 * the catalog convention).
 */
function makeStaticRotation(degrees: number): AnimatableProperty {
  return { a: 0, k: degrees };
}

/**
 * Static position — `a: 0` + 2-tuple of viewport-relative
 * coordinates (normalized 0..1 → viewBox pixels). The RenderSpec
 * carries the normalized deltas; this module multiplies by the
 * StyleSpec viewBox to obtain Lottie's pixel coordinate space.
 *
 * Position is computed as the **viewBox center** + delta:
 *
 *   pos = (viewBox/2) + (delta × viewBox)
 *
 * For an identity delta, the position sits at the viewBox center
 * (Lottie convention). A `translate_dx = 0.5` shifts the position
 * to the right edge of the viewBox.
 */
function makeStaticPosition(
  viewBoxWidth: number,
  viewBoxHeight: number,
  deltaX: number,
  deltaY: number,
): AnimatableProperty {
  const centerX = viewBoxWidth / 2;
  const centerY = viewBoxHeight / 2;
  const x = centerX + deltaX * viewBoxWidth;
  const y = centerY + deltaY * viewBoxHeight;
  return { a: 0, k: [x, y] };
}

/**
 * Static anchor — `a: 0` + 2-tuple. Anchor = position for centered
 * shapes (Pitfall 7); the transform pipeline rotates around the
 * anchor point. A non-centered shape (Phase 5+) would compute its
 * own anchor from the shape's bounding box; for the TRACER the
 * shape is always centered so anchor = position.
 */
function makeStaticAnchor(
  viewBoxWidth: number,
  viewBoxHeight: number,
  deltaX: number,
  deltaY: number,
): AnimatableProperty {
  const centerX = viewBoxWidth / 2;
  const centerY = viewBoxHeight / 2;
  const x = centerX + deltaX * viewBoxWidth;
  const y = centerY + deltaY * viewBoxHeight;
  return { a: 0, k: [x, y] };
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
 * Re-export the TransformDelta type for the compiler orchestrator
 * (avoids the orchestrator importing the schema module just for
 * one type).
 */
export type { TransformDelta };
