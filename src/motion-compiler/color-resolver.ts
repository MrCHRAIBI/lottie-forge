/**
 * Color resolution for the Motion Compiler — converts RenderSpec
 * `paint.color` tokens into Lottie RGB triples (3 floats in [0..1]).
 *
 * **D-09 — stylable zones emit the neutral fill `[0.5, 0.5, 0.5]`
 * (RGB + alpha 1.0) regardless of the `paint.color` hex**. The
 * neutral fill is the *Lottie-side* contract; the SVG companion
 * carries the concrete hex (D-16) and the Phase 8 packager
 * substitutes the anchor hex with a theme variable (ADR-05). Mixing
 * the two surfaces is the most likely source of regressions —
 * neutral fill is for `setTheme` to work (Pitfall 8), concrete hex
 * is for the static poster.
 *
 * **Pure module, zero I/O.** The compiler is the only consumer.
 */

import type { Paint, RenderSpecRole } from "../rpc/contracts/motion-compiler.schema.js";
import { HEX_COLOR_PATTERN } from "../rpc/contracts/style-spec.schema.js";

/**
 * RGB triple — three finite floats in [0..1]. Same unit regime as
 * Lottie `fl.c` and `st.c` (Pitfall 2). The neutral is a tuple of
 * 0.5 values (the chromatic mean of the unit cube) so a `setTheme`
 * override has symmetric headroom in every channel.
 */
export type LottieRgb = readonly [number, number, number];

/**
 * The neutral fill RGB (D-09). The literal `[0.5, 0.5, 0.5]` is
 * pinned at Phase 3 planning; any future change is a contract
 * migration (`setTheme` golden baselines).
 */
export const NEUTRAL_RGB: LottieRgb = Object.freeze([0.5, 0.5, 0.5]);

/**
 * Decode a `#RRGGBB` hex string to an RGB triple in [0..1].
 *
 * Throws on any value that does not match the `HEX_COLOR_PATTERN`
 * gate (the schema layer rejects malformed colors — a value that
 * reaches this function has already passed `RenderSpecSchema`).
 *
 * The conversion is exact: every channel is `byte / 255` where
 * `byte ∈ 0..255`. No rounding, no clamping — the byte sequence
 * is integer and the divisor is exact-binary in IEEE-754
 * (`1/255` is not exact, but the result is the precise float).
 */
export function hexToRgb(hex: string): LottieRgb {
  if (!HEX_COLOR_PATTERN.test(hex)) {
    throw new Error(`hexToRgb: malformed hex (${JSON.stringify(hex)}); expected #RRGGBB`);
  }
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  return Object.freeze([r, g, b]);
}

/**
 * Resolve the Lottie-side color for a component.
 *
 * The D-09 neutral `[0.5, 0.5, 0.5]` is always returned for the
 * Lottie emit (Pitfall 8 — `setTheme` requires neutral channels).
 * The Phase 8 packager reads the `nm` anchor and substitutes
 * the concrete hex at packaging time.
 *
 * The role parameter is accepted (and ignored) so the call site
 * reads as a symmetric "resolve color for this role" — a future
 * extension that varies the neutral by role (e.g. per-anchor
 * gamma adjustment) would only need to touch this function.
 */
export function resolveLottieColor(_paint: Paint, _role: RenderSpecRole): LottieRgb {
  return NEUTRAL_RGB;
}

/**
 * Resolve the SVG-side color (the concrete hex from `paint.color`).
 * This is the byte sequence the SVG element's `fill` or `stroke`
 * attribute carries (D-16 — concrete palette for poster parity).
 */
export function resolveSvgColor(paint: Paint): string {
  // PaintSchema already gates `color` to HEX_COLOR_PATTERN; no
  // defensive re-validation here (D-05 doctrine — gates run once).
  return paint.color;
}
