/**
 * Keyframe emitter — converts a recipe's `keyframe_shape` into a
 * Lottie keyframe array on the matching animatable property.
 *
 * **Phase 3 TRACER surface (plan 03-04):** only `opacity-ramp` is
 * implemented. The other 9 keyframe shapes throw a typed
 * `CompileError` so the gate fail-loud on a yet-to-be-implemented
 * recipe. The exhaustive switch (no default branch, no silent
 * fallthrough) is the **D-37 "switch exhaustif sans default"
 * contract** — the TypeScript type system ensures a future
 * keyframe-shape addition is caught at compile time via the `never`
 * type assertion.
 *
 * The widening to the full 10-shape switch is plan 03-05's
 * responsibility — a functionality gap fillable without
 * architectural change.
 *
 * **Pure module, zero I/O.** The compiler orchestrator is the
 * single caller.
 */

import type { KeyframeShape } from "../rpc/contracts/catalogue.schema.js";
import type { Keyframe } from "../rpc/contracts/motion-compiler.schema.js";
import type { EasingCurve } from "../rpc/contracts/style-spec.schema.js";

/** Property channel the keyframe shape animates (Lottie `Transform` keys). */
export type AnimatedProperty = "o" | "r" | "p" | "s" | "a";

/**
 * The emitted keyframes + the Lottie transform channel they target.
 * The orchestrator merges these into the per-component `ks` block.
 */
export interface EmittedKeyframes {
  readonly property: AnimatedProperty;
  readonly keyframes: ReadonlyArray<Keyframe>;
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
 * Compute the keyframe array for a recipe. Switch exhaustif sans
 * default (D-37) — the `never` type at the end of the switch makes
 * any future keyframe-shape addition a TypeScript compile error
 * that names the missing branch.
 *
 * @param keyframeShape - one of the 10 locked recipe keyframe shapes
 *                        (D-02 vocabulary closed at the catalogue).
 * @param intensity     - the recipe's intensity in [0..1] (catalogue
 *                        `intensity_range`). Modulates the keyframe
 *                        amplitude (0 = invisible, 1 = full).
 * @param durationMs    - the recipe's total duration in milliseconds
 *                        (catalogue `duration_ms`, 100..10000).
 * @param frameRate     - the Lottie frame rate (pinned at 60 in
 *                        `meta.ts`). The caller passes the rate so
 *                        this module stays independent of the
 *                        meta module (no cyclic import risk).
 * @param easing        - the recipe's named easing curve from the
 *                        loaded `StyleSpec.easing_curves`. The
 *                        control points map to Lottie easing handles
 *                        (Pitfall 4: `o` = control point 1,
 *                        `i` = control point 2).
 */
export function emitKeyframes(
  keyframeShape: KeyframeShape,
  intensity: number,
  durationMs: number,
  frameRate: number,
  easing: EasingCurve,
): EmittedKeyframes {
  const lastFrame = Math.round((durationMs * frameRate) / 1000);

  switch (keyframeShape) {
    case "opacity-ramp":
      return emitOpacityRamp(intensity, lastFrame, easing);
    case "translate-in":
      throw new CompileError(
        "keyframe_shape 'translate-in' is not yet implemented in Phase 3 (widened in plan 03-05)",
      );
    case "overshoot-settle":
      throw new CompileError(
        "keyframe_shape 'overshoot-settle' is not yet implemented in Phase 3 (widened in plan 03-05)",
      );
    case "scale-breath":
      throw new CompileError(
        "keyframe_shape 'scale-breath' is not yet implemented in Phase 3 (widened in plan 03-05)",
      );
    case "trim-path":
      throw new CompileError(
        "keyframe_shape 'trim-path' is not yet implemented in Phase 3 (widened in plan 03-05)",
      );
    case "angular-in":
      throw new CompileError(
        "keyframe_shape 'angular-in' is not yet implemented in Phase 3 (widened in plan 03-05)",
      );
    case "pop-settle":
      throw new CompileError(
        "keyframe_shape 'pop-settle' is not yet implemented in Phase 3 (widened in plan 03-05)",
      );
    case "sine-drift":
      throw new CompileError(
        "keyframe_shape 'sine-drift' is not yet implemented in Phase 3 (widened in plan 03-05)",
      );
    case "damped-oscillation":
      throw new CompileError(
        "keyframe_shape 'damped-oscillation' is not yet implemented in Phase 3 (widened in plan 03-05)",
      );
    case "circular-path":
      throw new CompileError(
        "keyframe_shape 'circular-path' is not yet implemented in Phase 3 (widened in plan 03-05)",
      );
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

/**
 * Emit keyframes for the `opacity-ramp` shape.
 *
 * Fade semantics: opacity climbs from `0` to `100` over the recipe's
 * full duration. Two keyframes:
 *
 *   { t: 0,          s: [0],   i, o }   <- intermediate carries handles
 *   { t: lastFrame,  s: [100] }         <- last carries NO handles (Pitfall 11)
 *
 * Easing handles map from the Lottie spec (Pitfall 4):
 *
 *   `o` = outgoing handle of segment = control point 1 of the easing
 *   `i` = incoming handle of segment = control point 2 of the easing
 *
 * The control-point values are normalized [0..1]; the Lottie easing
 * handle `x`/`y` carry the same numeric range. The `EasingCurve`
 * type already gates `control_points` to `[number, number, number,
 * number]` via `StyleSpecSchema.EasingCurveSchema` (line 62-69).
 */
function emitOpacityRamp(
  intensity: number,
  lastFrame: number,
  easing: EasingCurve,
): EmittedKeyframes {
  // Map intensity in [0..1] to opacity in [0..100] (Pitfall 2 unit
  // gate). Rounding to the nearest integer — Lottie `o` is an
  // integer-valued AnimatableProperty on shape layers (the schema
  // gates it via `z.number().min(0).max(100)`).
  const finalOpacity = Math.round(intensity * 100);

  // Easing handles: control_points[0..1] = outgoing,
  // control_points[2..3] = incoming. Per-dimension arrays of length
  // 1 — the Lottie emit accepts both scalar and 1-element-array
  // forms (see Pitfall-11 follow-up: `EaseHandleSchema` accepts the
  // hybrid form in `motion-compiler.schema.ts`).
  const o = { x: [easing.control_points[0]], y: [easing.control_points[1]] };
  const i = { x: [easing.control_points[2]], y: [easing.control_points[3]] };

  const keyframes: Keyframe[] = [
    {
      t: 0,
      s: [0],
      o,
      i,
    },
    {
      t: lastFrame,
      s: [finalOpacity],
    },
  ];

  return { property: "o", keyframes };
}
