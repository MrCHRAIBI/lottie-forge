/**
 * Phase 3 plan 03-05 — feature-gate enforcement spec.
 *
 * Asserts COM-04 enforcement:
 *
 * - Hard-reject family tests (3D, negative stretch, expressions,
 *   matte variants) all raise the `unsupported_feature` error
 *   code (D-33, D-28/D-36).
 * - The svg-only branch is forced synthetically by a masks /
 *   matting fixture (D-33 forced-branch test — no Phase 3
 *   emission produces svg-only naturally).
 * - A plain shapes+transform composition classifies `all`.
 * - `classify` never mutates its input.
 */

import { describe, expect, it } from "vitest";

import {
  assertSupportedComposition,
  assertSupportedLayer,
  classify,
  SUPPORTED_LOTTIE_FEATURES,
  type SupportedLottieFeature,
  UnsupportedFeatureError,
} from "../../motion-compiler/feature-gate.js";
import { CompileError } from "../../motion-compiler/keyframe-emitter.js";
import type { LottieJSON, LottieShapeLayer } from "../../rpc/contracts/motion-compiler.schema.js";
import { LottieJSONSchema } from "../../rpc/contracts/motion-compiler.schema.js";

/* ===========================================================================
 * Test fixtures — minimal-but-valid Lottie structures for gate testing.
 *
 * The schemas pin the structural rules; the gate adds
 * defense-in-depth rejection of out-of-subset features.
 * ===========================================================================
 */

/**
 * Build a minimal valid Lottie envelope for gate tests. The
 * shape layer / transform channels are minimal placeholders —
 * the gate tests focus on the reject / classify paths, not
 * the emit quality.
 */
function baseComposition(overrides: Partial<LottieJSON> = {}): LottieJSON {
  const base: LottieJSON = {
    v: "5.7.0",
    fr: 60,
    ip: 0,
    op: 60,
    ddd: 0,
    assets: [],
    layers: [baseShapeLayer()],
  };
  return { ...base, ...overrides };
}

function baseShapeLayer(_overrides: Partial<LottieShapeLayer> = {}): LottieShapeLayer {
  return LottieJSONSchema.shape.layers.element.parse({
    ddd: 0,
    ind: 1,
    ty: 4,
    nm: "primary",
    ip: 0,
    op: 60,
    ks: {
      o: { a: 0, k: 100 },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [200, 150] },
      s: { a: 0, k: [100, 100] },
      a: { a: 0, k: [200, 150] },
    },
    shapes: [
      {
        ty: "gr",
        it: [
          { ty: "rc", p: [200, 150], s: [200, 150], r: 0 },
          { ty: "fl", c: [0.5, 0.5, 0.5], o: 100 },
        ],
      },
    ],
  }) as LottieShapeLayer;
}

/* ===========================================================================
 * Hard-reject family tests (D-33)
 * ===========================================================================
 */

describe("feature-gate — hard rejects (D-33)", () => {
  it("rejects a 3D composition (ddd ≠ 0)", () => {
    // The schema pins ddd = 0 as a literal — to exercise the
    // gate, we bypass via cast (the gate is defense-in-depth).
    const composition = baseComposition();
    (composition as unknown as Record<string, unknown>).ddd = 1;
    expect(() => assertSupportedComposition(composition)).toThrow(UnsupportedFeatureError);
    try {
      assertSupportedComposition(composition);
    } catch (err) {
      expect((err as UnsupportedFeatureError).code).toBe("unsupported_feature");
      expect((err as UnsupportedFeatureError).feature).toBe("ddd-3d");
    }
  });

  it("rejects a non-empty assets array (audio/video/image sequences)", () => {
    const composition = baseComposition({
      assets: [{ id: "precomp", layers: [] } as unknown as never],
    });
    expect(() => assertSupportedComposition(composition)).toThrow(UnsupportedFeatureError);
    try {
      assertSupportedComposition(composition);
    } catch (err) {
      expect((err as UnsupportedFeatureError).code).toBe("unsupported_feature");
      expect((err as UnsupportedFeatureError).feature).toBe("non-empty-assets");
    }
  });

  it("rejects negative static scale (negative stretch — COM-04)", () => {
    // The schema rejects negative scale; we bypass it with a
    // permissive cast to exercise the gate's defense-in-depth.
    const layer = baseShapeLayer();
    (layer.ks as unknown as Record<string, unknown>).s = { a: 0, k: -50 };
    expect(() => assertSupportedLayer(layer)).toThrow(UnsupportedFeatureError);
    try {
      assertSupportedLayer(layer);
    } catch (err) {
      expect((err as UnsupportedFeatureError).code).toBe("unsupported_feature");
      expect((err as UnsupportedFeatureError).feature).toBe("negative-scale");
    }
  });

  it("rejects negative animated scale values", () => {
    const layer = baseShapeLayer();
    (layer.ks as unknown as Record<string, unknown>).s = {
      a: 1,
      k: [
        { t: 0, s: [100, 100] },
        { t: 30, s: [-50, -50] },
        { t: 60, s: [100, 100] },
      ],
    };
    expect(() => assertSupportedLayer(layer)).toThrow(UnsupportedFeatureError);
    try {
      assertSupportedLayer(layer);
    } catch (err) {
      expect((err as UnsupportedFeatureError).code).toBe("unsupported_feature");
    }
  });

  it("rejects an expression channel (`x` key) on a shape item", () => {
    const layer = baseShapeLayer();
    // Inject `x` directly on the gr item via cast.
    const gr = layer.shapes[0] as unknown as Record<string, unknown>;
    gr.x = "100 - 50";
    expect(() => assertSupportedLayer(layer)).toThrow(UnsupportedFeatureError);
    try {
      assertSupportedLayer(layer);
    } catch (err) {
      expect((err as UnsupportedFeatureError).code).toBe("unsupported_feature");
      expect((err as UnsupportedFeatureError).feature).toBe("expression-channel");
    }
  });

  it("rejects a layer with a non-zero ddd field (3D layer)", () => {
    const layer = baseShapeLayer();
    (layer as unknown as Record<string, unknown>).ddd = 1;
    expect(() => assertSupportedLayer(layer)).toThrow(UnsupportedFeatureError);
  });
});

/* ===========================================================================
 * classify() — svg-only forced-branch test (D-33)
 * ===========================================================================
 */

describe("feature-gate — classify (D-33 svg-only forced branch)", () => {
  it("classifies a plain shapes+transform composition as 'all'", () => {
    const features: SupportedLottieFeature[] = [
      "shape-rect",
      "transform-position",
      "transform-opacity",
    ];
    expect(classify(features)).toBe("all");
  });

  it("classifies a mask-add feature as 'svg-only' (D-33 forced branch)", () => {
    const features = ["mask-add" as const];
    expect(classify(features)).toBe("svg-only");
  });

  it("classifies a track-matte-alpha feature as 'svg-only'", () => {
    const features = ["track-matte-alpha" as const];
    expect(classify(features)).toBe("svg-only");
  });

  it("classifies a track-matte-luma feature as 'svg-only'", () => {
    const features = ["track-matte-luma" as const];
    expect(classify(features)).toBe("svg-only");
  });

  it("classifies a mask-subtract feature as 'svg-only'", () => {
    const features = ["mask-subtract" as const];
    expect(classify(features)).toBe("svg-only");
  });

  it("classifies an empty list as 'all' (Phase 3 default emit)", () => {
    expect(classify([])).toBe("all");
  });

  it("never mutates its input", () => {
    const features: SupportedLottieFeature[] = ["shape-rect", "transform-opacity"];
    const snapshot = [...features];
    classify(features);
    expect(features).toEqual(snapshot);
    expect(features.length).toBe(2);
  });

  it("never mutates its input even with svg-only features present", () => {
    const features = ["mask-add" as const, "shape-rect" as const];
    const snapshot = [...features];
    classify(features);
    expect(features).toEqual(snapshot);
  });
});

/* ===========================================================================
 * SupportedLottieFeature enumeration — closed vocabulary
 * ===========================================================================
 */

describe("feature-gate — SupportedLottieFeature enumeration", () => {
  it("enumerates the closed subset of lottie-web 5.13 features", () => {
    expect(SUPPORTED_LOTTIE_FEATURES).toContain("shape-rect");
    expect(SUPPORTED_LOTTIE_FEATURES).toContain("shape-ellipse");
    expect(SUPPORTED_LOTTIE_FEATURES).toContain("shape-path");
    expect(SUPPORTED_LOTTIE_FEATURES).toContain("shape-polyline");
    expect(SUPPORTED_LOTTIE_FEATURES).toContain("shape-polystar");
    expect(SUPPORTED_LOTTIE_FEATURES).toContain("shape-trim");
    expect(SUPPORTED_LOTTIE_FEATURES).toContain("transform-position");
    expect(SUPPORTED_LOTTIE_FEATURES).toContain("transform-rotation");
    expect(SUPPORTED_LOTTIE_FEATURES).toContain("transform-scale");
    expect(SUPPORTED_LOTTIE_FEATURES).toContain("transform-opacity");
    expect(SUPPORTED_LOTTIE_FEATURES).toContain("keyframe-easing-bezier");
    expect(SUPPORTED_LOTTIE_FEATURES).toContain("keyframe-easing-linear");
  });
});

/* ===========================================================================
 * UnsupportedFeatureError contract (D-28/D-36)
 * ===========================================================================
 */

describe("feature-gate — UnsupportedFeatureError", () => {
  it("carries the closed `unsupported_feature` error code", () => {
    const err = new UnsupportedFeatureError("test", "feature-name");
    expect(err.code).toBe("unsupported_feature");
    expect(err.name).toBe("UnsupportedFeatureError");
    expect(err.feature).toBe("feature-name");
  });
});

/* ===========================================================================
 * CompileError re-export — the compiler's gate-failure class. The
 * schema-layer rejects first (LottieJSONSchema), but the gate layer
 * also raises UnsupportedFeatureError when structural checks pass.
 * ===========================================================================
 */

describe("feature-gate — schema gate layering", () => {
  it("compile error surface uses the typed CompileError class", () => {
    const err = new CompileError("test");
    expect(err.code).toBe("compile_error");
    expect(err.name).toBe("CompileError");
  });
});
