/**
 * Keyframe emitter — converts a recipe's `keyframe_shape` into a
 * Lottie keyframe array on the matching animatable property (and,
 * for `trim-path`, a `tm` trim-path shape item).
 *
 * **Phase 3 WIDENING (plan 03-05):** all 10 locked keyframe shapes
 * are implemented. The switch remains exhaustive with NO default
 * branch and a `never`-typed exhaustiveness guard so a future
 * `KEYFRAME_SHAPES` addition is a TypeScript compile error
 * (D-37).
 *
 * **Per-shape emission rules (D-34, Pitfalls 2/3/4/11):**
 *
 * - All scalars are vector keyframes `s: [v]` (Pitfall 3).
 * - Opacity is 0..100 (Pitfall 2).
 * - Trim-path `s`/`e`/`o` are percentages 0..100, never 0..1
 *   (Pitfall 2, D-14).
 * - Easing handles `o`/`i` are emitted on each segment's STARTING
 *   keyframe from `EasingCurve.control_points` (`o` = point 1,
 *   `i` = point 2 — Pitfall 4). The last keyframe is bare (Pitfall
 *   11).
 * - Animated transform deltas keep their OWN closed ranges
 *   (D-34) — slide/orbit/float/wiggle derive from the transform
 *   resting values plus recipe amplitude, never reinterpreting
 *   the 0..1 coordinate bounds.
 *
 * **Trim-path output (D-14):** the emitter returns a `trim` shape
 * item `{ ty: "tm", s: static 0, e: animated 0→100, o: static 0,
 * m: 1 }` alongside the keyframes. The compiler orchestrator
 * threads the trim into the layer's `gr.it` array between the
 * geometry and the paint.
 *
 * **Pure module, zero I/O.**
 */

import type { KeyframeShape } from "../rpc/contracts/catalogue.schema.js";
import type {
  AnimatableProperty,
  Keyframe,
  LottieShapeItem,
} from "../rpc/contracts/motion-compiler.schema.js";
import type { Direction, MotionParams } from "../rpc/contracts/recipe.schema.js";
import type { EasingCurve } from "../rpc/contracts/style-spec.schema.js";

/** Property channel the keyframe shape animates (Lottie `Transform` keys). */
export type AnimatedProperty = "o" | "r" | "p" | "s" | "a";

/**
 * The emitted keyframes + the Lottie transform channel they target,
 * plus an optional trim-path item for `trim-path` recipes (D-14).
 *
 * `property: null` ⇒ no transform channel animated (e.g.
 * `trim-path`). `trim: null` ⇒ no trim item (every shape except
 * `trim-path`). The shape-builder + transform-builder threads
 * both signals into the emitted layer.
 */
export interface EmittedKeyframes {
  readonly property: AnimatedProperty | null;
  readonly keyframes: ReadonlyArray<Keyframe>;
  readonly trim: LottieShapeItem | null;
}

/**
 * Typed compile error — the orchestrator catches this exception
 * class and surfaces it as a `compile_error` RPC envelope
 * (D-28/D-36). The `code` literal is the protocol-wide contract.
 */
export class CompileError extends Error {
  public readonly code = "compile_error" as const;

  constructor(message: string) {
    super(message);
    this.name = "CompileError";
  }
}

/**
 * Compute the keyframe array + (optionally) the trim-path item
 * for a recipe. Switch exhaustif sans default (D-37) — the
 * `never` type at the end of the switch makes any future
 * keyframe-shape addition a TypeScript compile error that names
 * the missing branch.
 *
 * @param keyframeShape - one of the 10 locked recipe keyframe
 *                        shapes.
 * @param motion        - the resolved motion params (amplitude,
 *                        direction, loops).
 * @param durationMs    - the recipe's total duration in ms
 *                        (100..10000).
 * @param frameRate     - the Lottie frame rate (pinned at 60 in
 *                        `meta.ts`).
 * @param easing        - the recipe's named easing curve from the
 *                        loaded `StyleSpec.easing_curves`. The
 *                        control points map to Lottie easing
 *                        handles (Pitfall 4).
 * @param viewBox       - the StyleSpec viewBox (width + height).
 *                        Position keyframes are emitted in
 *                        viewBox pixels (Lottie convention).
 * @param resting       - the resting transform values (the static
 *                        position/scale/rotation the transform
 *                        would carry without animation). The
 *                        animated deltas derive from these +
 *                        recipe amplitude (D-34).
 */
export function emitKeyframes(
  keyframeShape: KeyframeShape,
  motion: MotionParams,
  durationMs: number,
  frameRate: number,
  easing: EasingCurve,
  viewBox: { width: number; height: number },
  resting: { px: number; py: number; s: number; r: number },
): EmittedKeyframes {
  const lastFrame = Math.round((durationMs * frameRate) / 1000);

  switch (keyframeShape) {
    case "opacity-ramp":
      return emitOpacityRamp(motion.amplitude, lastFrame, easing);
    case "translate-in":
      return emitTranslateIn(
        motion.amplitude,
        motion.direction,
        lastFrame,
        easing,
        viewBox,
        resting,
      );
    case "overshoot-settle":
      return emitOvershootSettle(
        motion.amplitude,
        motion.direction,
        lastFrame,
        easing,
        viewBox,
        resting,
      );
    case "scale-breath":
      return emitScaleBreath(motion.amplitude, motion.loops, lastFrame, easing, resting);
    case "trim-path":
      return emitTrimPath(lastFrame, easing);
    case "angular-in":
      return emitAngularIn(motion.amplitude, lastFrame, easing, resting);
    case "pop-settle":
      return emitPopSettle(motion.amplitude, lastFrame, easing, resting);
    case "sine-drift":
      return emitSineDrift(motion.amplitude, motion.loops, lastFrame, easing, viewBox, resting);
    case "damped-oscillation":
      return emitDampedOscillation(motion.amplitude, lastFrame, easing, viewBox, resting);
    case "circular-path":
      return emitCircularPath(motion.amplitude, motion.loops, lastFrame, easing, viewBox, resting);
    default: {
      // Exhaustiveness check (D-37): any future addition to
      // KEYFRAME_SHAPES that doesn't update this switch becomes a
      // TypeScript compile error at this `never` binding.
      const _exhaustive: never = keyframeShape;
      throw new CompileError(
        `unknown keyframe shape: ${JSON.stringify(_exhaustive)} — must be one of the 10 locked shapes`,
      );
    }
  }
}

/* ===========================================================================
 * Per-shape emitters — closed over `EasingCurve.control_points` mapping.
 *
 * The shared `easingHandles(easing)` helper maps control_points
 * `[x1, y1, x2, y2]` to Lottie keyframe handles (Pitfall 4):
 *   o (outgoing, segment START) = point 1
 *   i (incoming, segment START) = point 2
 * Every emitter places handles on every keyframe EXCEPT the last
 * (Pitfall 11). The `null` guard is a TS exhaustiveness aid; runtime
 * code always wraps with a property check.
 * ===========================================================================
 */

/**
 * Map the easing curve's control points to Lottie keyframe handles.
 * `o = {x: [cp1.x], y: [cp1.y]}`, `i = {x: [cp2.x], y: [cp2.y]}`
 * (Pitfall 4: per-dimension arrays of length 1).
 */
function easingHandles(easing: EasingCurve): {
  o: { x: [number]; y: [number] };
  i: { x: [number]; y: [number] };
} {
  return {
    o: { x: [easing.control_points[0]], y: [easing.control_points[1]] },
    i: { x: [easing.control_points[2]], y: [easing.control_points[3]] },
  };
}

/** Map a motion `direction` to a normalized 2D unit vector. */
function directionVector(direction: Direction): { x: number; y: number } {
  switch (direction) {
    case "up":
      return { x: 0, y: -1 };
    case "down":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
    case "none":
      return { x: 0, y: 0 };
    default: {
      // Exhaustiveness guard — D-37 mirror on the closed direction tuple.
      const _exhaustive: never = direction;
      throw new CompileError(
        `unknown direction: ${JSON.stringify(_exhaustive)} — must be one of the 5 locked values`,
      );
    }
  }
}

/** Clip a number to the [0, 100] range — used for opacity/trim emissions. */
function clampUnit(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * opacity-ramp (fade) — opacity 0 → intensity * 100 over the
 * recipe's full duration. Two keyframes; last bare.
 */
function emitOpacityRamp(
  intensity: number,
  lastFrame: number,
  easing: EasingCurve,
): EmittedKeyframes {
  const finalOpacity = clampUnit(Math.round(intensity * 100), 0, 100);
  const { o, i } = easingHandles(easing);
  return {
    property: "o",
    keyframes: [
      { t: 0, s: [0], o, i },
      { t: lastFrame, s: [finalOpacity] },
    ],
    trim: null,
  };
}

/**
 * translate-in (slide) — position from the offset (start) to the
 * resting position (end) over the full duration. The offset is
 * `direction × amplitude × viewBox` away from the resting
 * position. Two keyframes; last bare.
 */
function emitTranslateIn(
  amplitude: number,
  direction: Direction,
  lastFrame: number,
  easing: EasingCurve,
  viewBox: { width: number; height: number },
  resting: { px: number; py: number },
): EmittedKeyframes {
  const v = directionVector(direction);
  const startX = resting.px + v.x * amplitude * viewBox.width;
  const startY = resting.py + v.y * amplitude * viewBox.height;
  const { o, i } = easingHandles(easing);
  // Easing handles apply to the X/Y axes; for Lottie 2D position
  // property the per-dimension handle arrays carry one entry each.
  return {
    property: "p",
    keyframes: [
      { t: 0, s: [startX, startY], o, i },
      { t: lastFrame, s: [resting.px, resting.py] },
    ],
    trim: null,
  };
}

/**
 * overshoot-settle (bounce) — position overshoots the resting
 * position by `amplitude` at mid-frame, then settles to the
 * resting position by the end. Three keyframes; mid + start
 * carry handles (the mid is the segment start for the settle).
 */
function emitOvershootSettle(
  amplitude: number,
  direction: Direction,
  lastFrame: number,
  easing: EasingCurve,
  viewBox: { width: number; height: number },
  resting: { px: number; py: number },
): EmittedKeyframes {
  const v = directionVector(direction);
  // Mid keyframe overshoots resting in the OPPOSITE direction of
  // the entry — the shape passes through resting and arrives at
  // the overshoot point before settling back. amplitude scales the
  // overshoot distance.
  const startX = resting.px + v.x * amplitude * viewBox.width;
  const startY = resting.py + v.y * amplitude * viewBox.height;
  const overshootX = resting.px - v.x * amplitude * viewBox.width * 0.25;
  const overshootY = resting.py - v.y * amplitude * viewBox.height * 0.25;
  const { o, i } = easingHandles(easing);
  return {
    property: "p",
    keyframes: [
      { t: 0, s: [startX, startY], o, i },
      { t: Math.round(lastFrame / 2), s: [overshootX, overshootY], o, i },
      { t: lastFrame, s: [resting.px, resting.py] },
    ],
    trim: null,
  };
}

/**
 * scale-breath (pulse) — scale oscillates ± amplitude around 100
 * (identity = 100, Pitfall 2). The number of oscillations equals
 * `loops`. The keyframe sequence is sine-sampled at quarter-period
 * intervals: peak → resting → trough → resting. Last keyframe
 * bare (Pitfall 11).
 */
function emitScaleBreath(
  amplitude: number,
  loops: number,
  lastFrame: number,
  easing: EasingCurve,
  resting: { s: number },
): EmittedKeyframes {
  // 3 samples per loop: peak, trough, rest. Frame step divides
  // `lastFrame` into `3 * loops + 1` slots so the finale keyframe
  // (at `lastFrame`) is strictly later than the last intermediate
  // (Pitfall 11 — strictly ascending t).
  const samplesPerLoop = 3;
  const totalIntermediate = samplesPerLoop * loops;
  const frameStep = Math.max(1, Math.floor(lastFrame / (totalIntermediate + 1)));
  const { o, i } = easingHandles(easing);
  const baseScale = resting.s * 100;
  const deviation = amplitude * 100;

  const keyframes: Keyframe[] = [{ t: 0, s: [baseScale, baseScale], o, i }];
  for (let idx = 0; idx < totalIntermediate; idx += 1) {
    const t = (idx + 1) * frameStep;
    const phase = idx % 3;
    let scale = baseScale;
    if (phase === 0)
      scale = baseScale + deviation; // peak
    else if (phase === 1)
      scale = baseScale - deviation; // trough
    else scale = baseScale; // rest
    keyframes.push({ t, s: [scale, scale], o, i });
  }
  keyframes.push({ t: lastFrame, s: [baseScale, baseScale] });
  return { property: "s", keyframes, trim: null };
}

/**
 * trim-path (draw-on) — the trim `e` property animates 0 → 100
 * (percentages, never 0..1) over the recipe's full duration. The
 * `s` and `o` properties stay static at 0. The returned `trim`
 * shape item is threaded into the layer's `gr.it` array by the
 * compiler orchestrator. No transform channel is animated
 * (D-14 — only the stroke trim moves).
 */
function emitTrimPath(lastFrame: number, easing: EasingCurve): EmittedKeyframes {
  const { o, i } = easingHandles(easing);
  const keyframes: Keyframe[] = [
    { t: 0, s: [0], o, i },
    { t: lastFrame, s: [100] },
  ];
  // Static s = 0, animated e = 0→100, static o = 0, m = 1
  // (Parallel, Lottie constants page). ix = 1 (s), 2 (e), 3 (o).
  const trim: LottieShapeItem = {
    ty: "tm",
    s: { a: 0, k: 0 },
    e: { a: 1, k: keyframes },
    o: { a: 0, k: 0 },
    m: 1,
    ix: 2,
  };
  return { property: null, keyframes: [], trim };
}

/**
 * angular-in (rotate) — rotation from `-amplitude × 90°` to 0°
 * over the recipe's full duration. Linear amplitude: amplitude 1
 * = quarter-turn back. Two keyframes; last bare.
 */
function emitAngularIn(
  amplitude: number,
  lastFrame: number,
  easing: EasingCurve,
  resting: { r: number },
): EmittedKeyframes {
  const startDeg = resting.r - amplitude * 90;
  const { o, i } = easingHandles(easing);
  return {
    property: "r",
    keyframes: [
      { t: 0, s: [startDeg], o, i },
      { t: lastFrame, s: [resting.r] },
    ],
    trim: null,
  };
}

/**
 * pop-settle (scale-pop) — scale 0 → overshoot → 100 (identity).
 * The overshoot is `1 + amplitude × 0.4` at the mid-frame, then
 * settles to identity by the end. Three keyframes.
 */
function emitPopSettle(
  amplitude: number,
  lastFrame: number,
  easing: EasingCurve,
  resting: { s: number },
): EmittedKeyframes {
  const identityPct = resting.s * 100;
  const overshootPct = (resting.s + amplitude * 0.4) * 100;
  const { o, i } = easingHandles(easing);
  return {
    property: "s",
    keyframes: [
      { t: 0, s: [0, 0], o, i },
      { t: Math.round(lastFrame / 2), s: [overshootPct, overshootPct], o, i },
      { t: lastFrame, s: [identityPct, identityPct] },
    ],
    trim: null,
  };
}

/**
 * sine-drift (float) — position oscillates ± amplitude in Y,
 * starting at the resting position and returning to it at the
 * end. 2 samples per loop (peak + trough). Frame step is
 * `lastFrame / (2*loops + 1)` so the final keyframe (at
 * `lastFrame`) is strictly later than the last intermediate
 * (Pitfall 11).
 */
function emitSineDrift(
  amplitude: number,
  loops: number,
  lastFrame: number,
  easing: EasingCurve,
  viewBox: { width: number; height: number },
  resting: { px: number; py: number },
): EmittedKeyframes {
  const totalIntermediate = 2 * loops;
  const frameStep = Math.max(1, Math.floor(lastFrame / (totalIntermediate + 1)));
  const drift = amplitude * viewBox.height;
  const { o, i } = easingHandles(easing);
  const keyframes: Keyframe[] = [{ t: 0, s: [resting.px, resting.py], o, i }];
  for (let idx = 0; idx < totalIntermediate; idx += 1) {
    const t = (idx + 1) * frameStep;
    const isPeak = idx % 2 === 0;
    const offsetY = isPeak ? drift : -drift;
    keyframes.push({ t, s: [resting.px, resting.py + offsetY], o, i });
  }
  keyframes.push({ t: lastFrame, s: [resting.px, resting.py] });
  return { property: "p", keyframes, trim: null };
}

/**
 * damped-oscillation (wiggle) — X-axis position oscillates with
 * exponentially decaying amplitude. Six samples across one
 * full-period decay. Last keyframe bare (Pitfall 11).
 */
function emitDampedOscillation(
  amplitude: number,
  lastFrame: number,
  easing: EasingCurve,
  viewBox: { width: number; height: number },
  resting: { px: number; py: number },
): EmittedKeyframes {
  const samples = 6;
  // Frame step divides `lastFrame` into `samples + 1` slots so
  // the finale keyframe (at `lastFrame`) is strictly later than
  // the last intermediate (Pitfall 11 — strictly ascending t).
  const frameStep = Math.max(1, Math.floor(lastFrame / (samples + 1)));
  const { o, i } = easingHandles(easing);
  const initialDev = amplitude * viewBox.width;
  const keyframes: Keyframe[] = [{ t: 0, s: [resting.px - initialDev, resting.py], o, i }];
  // Decay envelope: amplitude *= 0.6 each sample.
  let deviation = initialDev;
  for (let iSample = 1; iSample <= samples; iSample += 1) {
    deviation *= 0.6;
    const sign = iSample % 2 === 0 ? 1 : -1; // alternate
    keyframes.push({
      t: iSample * frameStep,
      s: [resting.px + sign * deviation, resting.py],
      o,
      i,
    });
  }
  // Settle at resting.
  keyframes.push({ t: lastFrame, s: [resting.px, resting.py] });
  return { property: "p", keyframes, trim: null };
}

/**
 * circular-path (orbit) — position sampled on a circle of radius
 * `amplitude × min(viewBox)` around the resting position.
 * `loops` revolutions; sample count = max(8, loops × 8). Last
 * keyframe bare (Pitfall 11) — frame step divides `lastFrame`
 * into `totalSamples + 1` slots so the finale keyframe is
 * strictly later than the last intermediate.
 */
function emitCircularPath(
  amplitude: number,
  loops: number,
  lastFrame: number,
  easing: EasingCurve,
  viewBox: { width: number; height: number },
  resting: { px: number; py: number },
): EmittedKeyframes {
  const samplesPerLoop = 8;
  const totalSamples = Math.max(8, samplesPerLoop * loops);
  const frameStep = Math.max(1, Math.floor(lastFrame / (totalSamples + 1)));
  const radius = amplitude * Math.min(viewBox.width, viewBox.height) * 0.4;
  const { o, i } = easingHandles(easing);
  const keyframes: Keyframe[] = [{ t: 0, s: [resting.px + radius, resting.py], o, i }];
  for (let sample = 1; sample <= totalSamples; sample += 1) {
    const angle = (sample / totalSamples) * loops * 2 * Math.PI;
    const x = resting.px + Math.cos(angle) * radius;
    const y = resting.py + Math.sin(angle) * radius;
    keyframes.push({
      t: sample * frameStep,
      s: [x, y],
      o,
      i,
    });
  }
  // Close the loop on the resting tangent point.
  keyframes.push({ t: lastFrame, s: [resting.px + radius, resting.py] });
  return { property: "p", keyframes, trim: null };
}

/**
 * Make a static opacity `AnimatableProperty` — utility for
 * non-fade transforms. Re-exported so transform-builder does not
 * need to construct `AnimatableProperty` literals itself.
 */
export function staticOpacity(value: number): AnimatableProperty {
  return { a: 0, k: clampUnit(Math.round(value), 0, 100) };
}
