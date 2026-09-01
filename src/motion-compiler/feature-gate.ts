/**
 * Feature gate — `SupportedLottieFeature` enumeration +
 * `classify` helper for the `renderer_support` meta.
 *
 * **Phase 3 TRACER surface (plan 03-04):** the Phase 3 compiler
 * only emits the canonical lottie-web 5.13 subset below 5.7.1
 * (D-12). Every emitted feature is in the `all` bucket (no 3D,
 * no audio, no expressions, no negative stretch, no track matte
 * canvas). The classifier returns `"all"` for every Phase 3
 * compile output — the `svg-only` branch is exercised only by
 * synthetic fixtures in plan 03-05.
 *
 * **D-33 doctrine (verbatim):** any feature outside the locked
 * 5.7.0 subset is a HARD REJECT at the gate — never silently
 * emitted. A `// lottie:bake` path for expression-to-keyframes
 * is deferred v2 (no code dead in Phase 3).
 *
 * **Pure module, zero I/O.**
 */

import type { RendererSupport } from "../rpc/contracts/motion-compiler.schema.js";

/**
 * The closed set of features the Phase 3 compiler emits. Every
 * emitted feature here is in the `all` bucket — the
 * `renderer_support` meta is `"all"` unless a future plan adds
 * a `svg-only`-only emitter (e.g. masks `add` for matte).
 *
 * The enumeration is open for future additions; the classifier
 * inspects the actual emitted Lottie JSON, not the symbol, so
 * the enumeration is documentation of the supported set.
 */
export const SUPPORTED_LOTTIE_FEATURES = [
  "shape-rect",
  "shape-ellipse",
  "transform-position",
  "transform-rotation",
  "transform-scale",
  "transform-opacity",
  "keyframe-easing-bezier",
  "keyframe-easing-linear",
] as const;

export type SupportedLottieFeature = (typeof SUPPORTED_LOTTIE_FEATURES)[number];

/**
 * The closed set of features that would force the `svg-only`
 * renderer classification (D-33, §6.3.4 #5). None of these are
 * emitted by the Phase 3 compiler; the enumeration is reserved
 * for Phase 4/8 expansion (matte, masks, etc.).
 */
export const SVG_ONLY_FEATURES = [
  "mask-add",
  "mask-subtract",
  "track-matte-alpha",
  "track-matte-luma",
] as const;

export type SvgOnlyFeature = (typeof SVG_ONLY_FEATURES)[number];

/**
 * Classify a compile output's `renderer_support` meta. The Phase 3
 * compiler emits only `all`-compatible features, so the helper
 * returns `"all"` unconditionally — the `svg-only` branch is
 * reserved for future emitters that opt into the matte / masks
 * subset.
 *
 * A future plan that adds an `svg-only` emitter will branch on
 * the actual emitted features and return `"svg-only"` when at
 * least one entry matches `SVG_ONLY_FEATURES`. The signature
 * accepts the (future) feature list so the call site does not
 * change.
 */
export function classify(
  _emitted: ReadonlyArray<SupportedLottieFeature | SvgOnlyFeature>,
): RendererSupport {
  return "all";
}
