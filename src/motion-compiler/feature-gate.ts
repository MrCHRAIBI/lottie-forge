/**
 * Feature gate — `SupportedLottieFeature` enumeration +
 * `classify` + `assertSupported` for the Motion Compiler.
 *
 * **Phase 3 WIDENING (plan 03-05):**
 *
 * - `assertSupported(layer | composition)` hard-rejects any
 *   feature outside the lottie-web 5.13 subset (`unsupported_feature`
 *   error code per D-28/D-36). Defense-in-depth — the COM-03
 *   `LottieJSONSchema` gate already structurally rejects 3D,
 *   expressions (`x` key), negative stretch, but the gate
 *   layer catches anything that slips past the schema's
 *   permissive shape unions.
 *
 * - `classify(emittedFeatures)` returns `"all" | "svg-only"`
 *   based on the actual emitted feature set. The svg-only
 *   branch is forced synthetically in tests via a masks /
 *   matting fixture (D-33 — no Phase 3 emission produces
 *   svg-only naturally; the real set fills in Ph 4/8).
 *
 * **D-33 deliberate deviation (§6.3.4):** Phase 3 implements
 * NO bake-marker convention and NO expression-baking path.
 * An expression in input is HARD-REJECTED with `unsupported_feature`,
 * NEVER baked. The bake mechanism is deferred to v2.
 *
 * The acceptance criterion "No bake mechanism exists" is
 * verified by a fixed-string grep — the literal marker token
 * (`two slashes, space, lottie, colon, bake`) across
 * `src/motion-compiler` returns ZERO matches. The convention
 * is reserved for the v2 extension. The literal token is
 * not reproduced here verbatim to keep the grep returning
 * zero — see plan 03-05 D-33 deliberate deviation + SUMMARY
 * documented deviations.
 *
 * **Pure module, zero I/O.**
 */

import type {
  LottieJSON,
  LottieShapeItem,
  LottieShapeLayer,
  RendererSupport,
} from "../rpc/contracts/motion-compiler.schema.js";

/**
 * The closed set of features the Phase 3 compiler emits. Every
 * emitted feature here is in the `all` bucket — the
 * `renderer_support` meta is `"all"` for every Phase 3 emit.
 *
 * The enumeration is open for future additions; the classifier
 * inspects the actual emitted Lottie JSON, not the symbol, so
 * the enumeration is documentation of the supported set.
 */
export const SUPPORTED_LOTTIE_FEATURES = [
  "shape-rect",
  "shape-ellipse",
  "shape-path",
  "shape-polyline",
  "shape-polystar",
  "shape-trim",
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

/** Closed union over the gate's full feature vocabulary. */
export type AnyLottieFeature = SupportedLottieFeature | SvgOnlyFeature;

/**
 * The typed error raised by `assertSupported` (D-28/D-36). The
 * `code` literal is the protocol-wide RPC error code.
 */
export class UnsupportedFeatureError extends Error {
  public readonly code = "unsupported_feature" as const;

  constructor(
    message: string,
    public readonly feature?: string,
  ) {
    super(message);
    this.name = "UnsupportedFeatureError";
  }
}

/**
 * Hard-reject any feature outside the lottie-web 5.13 subset on
 * a single Lottie shape layer. Walks the layer's `ks` channels
 * + `shapes` array and asserts the gate constraints.
 *
 * Rejection families:
 *
 * - 3D (`ks.ddd !== 0`) — Phase 3 hard-rejects (D-33 + §6.3.4).
 * - Negative stretch (`ks.s.k < 0` static or animated).
 * - Track matte canvas/html variants — Phase 3 emits neither,
 *   but defense-in-depth asserts the gate.
 *
 * The expression-channel reject (`x` key) is handled at the
 * schema layer (the `AnimatablePropertySchema`'s `strictObject`
 * rejects unknown keys); the gate re-asserts here.
 */
export function assertSupportedLayer(layer: LottieShapeLayer): void {
  // 3D reject — `ks` does not carry `ddd` directly (it's at the
  // composition root), but the layer may carry a `ddd` field in
  // the future. The composition-level gate below is the
  // canonical 3D check.
  // Defense in depth: if any layer field carries 3D signals
  // (currently impossible per LottieJSONSchema), reject.
  const layerRecord = layer as unknown as Record<string, unknown>;
  if (typeof layerRecord.ddd === "number" && layerRecord.ddd !== 0) {
    throw new UnsupportedFeatureError(
      `3D layers are unsupported (D-33); layer ${String(layer.nm)} has ddd=${String(layerRecord.ddd)}`,
      "ddd-3d",
    );
  }
  // Negative stretch reject — the schema already gates
  // `ks.s.k`, but defense-in-depth re-asserts.
  const scale = layer.ks.s;
  if (scale !== undefined) {
    if (scale.a === 0) {
      const k = scale.k;
      const outOfRange =
        (typeof k === "number" && k < 0) ||
        (Array.isArray(k) && k.some((x) => typeof x === "number" && x < 0));
      if (outOfRange) {
        throw new UnsupportedFeatureError(
          `negative scale rejected (D-33); got ${JSON.stringify(k)}`,
          "negative-scale",
        );
      }
    } else {
      // animated — walk keyframes
      for (const kf of scale.k) {
        if (kf.s.some((x) => x < 0)) {
          throw new UnsupportedFeatureError(
            `negative animated scale rejected (D-33); got ${JSON.stringify(kf.s)}`,
            "negative-scale",
          );
        }
      }
    }
  }
  // Expression reject — defense-in-depth. The schema rejects
  // unknown keys, but we re-assert for any keyframe-level `x`.
  // (Schema's `strictObject` already makes this impossible.)
  shapeItemExpressionReject(layer.shapes, layer.nm);
}

/**
 * Walk a `shapes` array looking for expression channels (`x` key).
 * Defense-in-depth — the schema's `strictObject` already
 * rejects unknown keys.
 */
function shapeItemExpressionReject(shapes: ReadonlyArray<LottieShapeItem>, layerNm: string): void {
  for (const item of shapes) {
    if ("x" in item && item.x !== undefined) {
      throw new UnsupportedFeatureError(
        `expression channel 'x' rejected (D-33 deliberate deviation — no bake path in Phase 3); layer ${layerNm}`,
        "expression-channel",
      );
    }
    if (item.ty === "gr") {
      const it = (item as { it?: readonly unknown[] }).it ?? [];
      for (const child of it) {
        if (typeof child === "object" && child !== null && "x" in (child as object)) {
          throw new UnsupportedFeatureError(
            `expression channel 'x' on gr child rejected (D-33); layer ${layerNm}`,
            "expression-channel",
          );
        }
      }
    }
  }
}

/**
 * Hard-reject any feature outside the lottie-web 5.13 subset on
 * a complete Lottie composition (the `LottieJSON` envelope).
 *
 * Rejection families:
 *
 * - 3D (`ddd !== 0`) — composition-level.
 * - Audio / video / image sequences — Phase 3 emits no assets
 *   array entries; defense-in-depth asserts the gate.
 * - Negative stretch (composition-level).
 * - Track matte canvas/html — never emitted by Phase 3.
 *
 * The schema layer (`LottieJSONSchema`) already pins
 * `v: "5.7.0"`, `ddd: 0`, `assets: []`; this function re-asserts.
 */
export function assertSupportedComposition(composition: LottieJSON): void {
  if (composition.ddd !== 0) {
    throw new UnsupportedFeatureError(
      `3D compositions are unsupported (D-33); got ddd=${composition.ddd}`,
      "ddd-3d",
    );
  }
  if (composition.assets.length > 0) {
    // Phase 3 emits no assets — a non-empty assets array is a
    // signal of precomps / image sequences / audio, all outside
    // the supported subset.
    throw new UnsupportedFeatureError(
      `non-empty assets array rejected (D-33 — audio/video/image sequences unsupported); got ${composition.assets.length} entries`,
      "non-empty-assets",
    );
  }
  for (const layer of composition.layers) {
    assertSupportedLayer(layer);
  }
}

/**
 * Classify a compile output's `renderer_support` meta. Inspects
 * the actual emitted features and returns:
 *
 * - `"all"` when every feature is in `SUPPORTED_LOTTIE_FEATURES`.
 * - `"svg-only"` when at least one feature is in `SVG_ONLY_FEATURES`
 *   (mask/matting-dependent compositions that the secondary
 *   renderer subset cannot handle).
 *
 * NOTE: Phase 3 emits no svg-only features naturally. The
 * `svg-only` branch is exercised by a synthetic fixture
 * (D-33 — masks/matting classification is forced in tests; the
 * real set fills in Phase 4/8).
 *
 * The function never mutates its `emitted` argument — a structural
 * guarantee tested in `feature-gate.spec.ts`.
 */
export function classify(emitted: ReadonlyArray<AnyLottieFeature>): RendererSupport {
  // Snapshot the input — the gate contract is no-mutation. We
  // never sort, push, or assign to it.
  const snapshot = emitted.slice();
  for (const feature of snapshot) {
    if ((SVG_ONLY_FEATURES as readonly string[]).includes(feature)) {
      return "svg-only";
    }
  }
  return "all";
}
