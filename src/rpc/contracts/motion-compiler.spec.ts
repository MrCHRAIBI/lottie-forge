import { describe, expect, it } from "vitest";

import {
  AnimatablePropertySchema,
  type CompileResult,
  CompileResultSchema,
  ComponentSchema,
  KeyframeSchema,
  KeyframeShapeSchema,
  LottieJSONSchema,
  PaintSchema,
  RENDER_SPEC_ROLES,
  RenderSpecSchema,
  RoleSchema,
  ShapeInputSchema,
  STROKE_WIDTH_TOKENS,
  StrokeWidthTokenSchema,
  TransformDeltaSchema,
} from "./motion-compiler.schema.js";
import { isRejectionExpectCode } from "./rejection-cases.js";
import { loadRenderSpecRejectionCases, type Phase3RejectionCase } from "./render-spec-rejection.js";
import { THEME_ANCHOR_IDS } from "./vocabulary.schema.js";

/**
 * Phase 3 frozen-contract suite — RenderSpec gates, the LottieJSON
 * re-validation gate, the role derivation, and the structural pins of
 * COM-03/COM-04. Every behavior bullet from the plan's
 * `<behavior>` block maps to a distinct `it()` below.
 *
 * The companion zod-goldens contract that mirrors these schemas on
 * the Pydantic side (Phase 7) will read the same fixture file once
 * the harness is connected — until then, vitest pins the structural
 * regime on the TypeScript side as the spec-build authority.
 */

const BASE_RECT = { shape: "rect", x: 0.1, y: 0.1, w: 0.4, h: 0.4, corner_radius: 0.05 } as const;
const BASE_PAINT = { kind: "fill", color: "#1c57cb" } as const;

function makeRenderSpec(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    asset_id: "a-001",
    recipe_id: "fade",
    style_ref: "example-style@1.0.0",
    components: [
      {
        component: "primary-rect",
        role: "primary",
        shape: { shape: "rect", x: 0.1, y: 0.1, w: 0.4, h: 0.4, corner_radius: 0.05 },
        paint: { kind: "fill", color: "#1c57cb" },
        transform: { translate_dx: 0, translate_dy: 0, rotation_deg: 0, scale: 1 },
      },
    ],
    motion: { amplitude: 0.5, direction: "up", loops: 1 },
    ...overrides,
  };
}

describe("RoleSchema — D-02 derived union", () => {
  it("accepts every theme anchor id (verbatim from vocabulary.schema.ts)", () => {
    for (const id of THEME_ANCHOR_IDS) {
      expect(RoleSchema.safeParse(id).success).toBe(true);
    }
  });

  it('accepts the "neutral" token added at this layer', () => {
    expect(RoleSchema.safeParse("neutral").success).toBe(true);
  });

  it("rejects arbitrary role strings (closed union)", () => {
    expect(RoleSchema.safeParse("marquee").success).toBe(false);
    expect(RoleSchema.safeParse("").success).toBe(false);
    expect(RoleSchema.safeParse("PRIMARY").success).toBe(false);
  });

  it("exposes the closed tuple in canonical order (THEME_ANCHORS + neutral last)", () => {
    expect([...RENDER_SPEC_ROLES]).toEqual([...THEME_ANCHOR_IDS, "neutral"]);
  });
});

describe("StrokeWidthTokenSchema — D-14 closed 3-token enum", () => {
  it("accepts the locked tokens only (thin|default|bold)", () => {
    expect([...STROKE_WIDTH_TOKENS]).toEqual(["thin", "default", "bold"]);
    for (const token of STROKE_WIDTH_TOKENS) {
      expect(StrokeWidthTokenSchema.safeParse(token).success).toBe(true);
    }
  });

  it("rejects numeric stroke-width values (D-14: never a free float)", () => {
    expect(StrokeWidthTokenSchema.safeParse(2).success).toBe(false);
    expect(StrokeWidthTokenSchema.safeParse("wider").success).toBe(false);
    expect(StrokeWidthTokenSchema.safeParse("").success).toBe(false);
  });
});

describe("ShapeInputSchema — D-01 5-generator union, D-06 closed ranges, D-34 cross-field", () => {
  it("rejects rect with corner_radius > min(w,h)/2 (D-34 cross-field)", () => {
    const result = ShapeInputSchema.safeParse({
      shape: "rect",
      x: 0.1,
      y: 0.1,
      w: 0.4,
      h: 0.4,
      corner_radius: 0.3, // 0.3 > min(0.4,0.4)/2 = 0.2
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const cornerIssue = result.error.issues.find((i) => i.path.includes("corner_radius"));
      expect(cornerIssue).toBeDefined();
    }
  });

  it("rejects polystar with r_inner >= r_outer (D-34 cross-field)", () => {
    const result = ShapeInputSchema.safeParse({
      shape: "polystar",
      cx: 0.5,
      cy: 0.5,
      points_count: 5,
      r_outer: 0.4,
      r_inner: 0.4, // equal — degenerate to a circle
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const rInnerIssue = result.error.issues.find((i) => i.path.includes("r_inner"));
      expect(rInnerIssue).toBeDefined();
    }
  });

  it("rejects path with a single point (D-06: 2..64 points)", () => {
    const result = ShapeInputSchema.safeParse({
      shape: "path",
      points: [{ x: 0.1, y: 0.1 }],
      closed: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects polystar with points_count outside 3..12", () => {
    const tooFew = ShapeInputSchema.safeParse({
      shape: "polystar",
      cx: 0.5,
      cy: 0.5,
      points_count: 2,
      r_outer: 0.4,
      r_inner: 0.2,
      rotation_deg: 0,
    });
    expect(tooFew.success).toBe(false);

    const tooMany = ShapeInputSchema.safeParse({
      shape: "polystar",
      cx: 0.5,
      cy: 0.5,
      points_count: 13,
      r_outer: 0.4,
      r_inner: 0.2,
      rotation_deg: 0,
    });
    expect(tooMany.success).toBe(false);
  });

  it("rejects any coord outside the closed 0..1 range (D-06)", () => {
    const result = ShapeInputSchema.safeParse({
      shape: "ellipse",
      cx: 1.5, // out of range
      cy: 0.5,
      rx: 0.3,
      ry: 0.2,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.length === 1 && i.path[0] === "cx");
      expect(issue).toBeDefined();
    }
  });
});

describe("PaintSchema — D-14 stroke-width token enforcement", () => {
  it("accepts a fill-only variant", () => {
    const result = PaintSchema.safeParse({ kind: "fill", color: "#1c57cb" });
    expect(result.success).toBe(true);
  });

  it("accepts a stroke variant with stroke_width_token", () => {
    const result = PaintSchema.safeParse({
      kind: "stroke",
      color: "#1c57cb",
      stroke_width_token: "default",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a stroke variant with a free float stroke_width (D-14 strict reject)", () => {
    const result = PaintSchema.safeParse({
      kind: "stroke",
      color: "#1c57cb",
      stroke_width: 2.5, // free float — D-14 violations are structurally rejected
    });
    expect(result.success).toBe(false);
  });
});

describe("TransformDeltaSchema — D-34 own closed ranges", () => {
  it("accepts default transform (zero translation, identity rotation, scale 1)", () => {
    expect(TransformDeltaSchema.safeParse({}).success).toBe(true);
  });

  it("rejects scale -1 (D-34: scale range is 0.1..4)", () => {
    expect(
      TransformDeltaSchema.safeParse({ translate_dx: 0, translate_dy: 0, scale: -1 }).success,
    ).toBe(false);
  });

  it("rejects translate_dx outside -1..1", () => {
    expect(
      TransformDeltaSchema.safeParse({ translate_dx: 1.5, translate_dy: 0, scale: 1 }).success,
    ).toBe(false);
  });
});

describe("ComponentSchema — schema is well-formed", () => {
  it("validates a representative component (rect + fill paint)", () => {
    const result = ComponentSchema.safeParse({
      component: "primary-rect",
      role: "primary",
      shape: { shape: "rect", x: 0.1, y: 0.1, w: 0.4, h: 0.4, corner_radius: 0.05 },
      paint: { kind: "fill", color: "#1c57cb" },
      transform: { translate_dx: 0, translate_dy: 0, rotation_deg: 0, scale: 1 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown component-field (strictObject)", () => {
    const result = ComponentSchema.safeParse({
      component: "primary-rect",
      role: "primary",
      shape: { shape: "rect", x: 0.1, y: 0.1, w: 0.4, h: 0.4, corner_radius: 0.05 },
      paint: { kind: "fill", color: "#1c57cb" },
      stroke: 2.5, // unknown key — strictObject rejects
    });
    expect(result.success).toBe(false);
  });
});

describe("RenderSpecSchema — D-07 (1..8 components), D-13 (strictObject), D-32 (uniqueness)", () => {
  it("rejects zero components (D-07 min 1)", () => {
    const result = RenderSpecSchema.safeParse(makeRenderSpec({ components: [] }));
    expect(result.success).toBe(false);
  });

  it("rejects nine components (D-07 max 8)", () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({
      component: `comp-${i}`,
      role: i % 2 === 0 ? "primary" : "secondary",
      shape: {
        shape: "rect",
        x: 0.05 + 0.05 * i,
        y: 0.1,
        w: 0.1,
        h: 0.1,
        corner_radius: 0.01,
      } as const,
      paint: BASE_PAINT,
    }));
    const result = RenderSpecSchema.safeParse(makeRenderSpec({ components: nine }));
    expect(result.success).toBe(false);
  });

  it("rejects an unknown top-level key (D-13 strict + meta-rule zero tolerance)", () => {
    const result = RenderSpecSchema.safeParse(makeRenderSpec({ unexpectedKey: "value" }));
    expect(result.success).toBe(false);
  });

  it("rejects a duplicate (component, role) pair with one issue per occurrence (D-32)", () => {
    const dup = {
      ...makeRenderSpec(),
      components: [
        {
          component: "primary-rect",
          role: "primary",
          shape: BASE_RECT,
          paint: BASE_PAINT,
        },
        {
          component: "primary-rect",
          role: "primary",
          shape: BASE_RECT,
          paint: BASE_PAINT,
        },
      ],
    };
    const result = RenderSpecSchema.safeParse(dup);
    expect(result.success).toBe(false);
    if (!result.success) {
      const dupIssues = result.error.issues.filter(
        (i) => i.path.includes("role") && i.message.includes("duplicate"),
      );
      expect(dupIssues.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("accepts a baseline spec (one component, fade, valid anchors)", () => {
    const result = RenderSpecSchema.safeParse(makeRenderSpec());
    expect(result.success).toBe(true);
  });

  it("rejects an unknown recipe id (cross-checks vocabulary import)", () => {
    const result = RenderSpecSchema.safeParse(makeRenderSpec({ recipe_id: "disco-spin" }));
    expect(result.success).toBe(false);
  });
});

describe("KeyframeSchema — Pitfall 3 + Pitfall 11 invariants", () => {
  it("rejects scalar `s` (must be a 1-element array)", () => {
    const result = KeyframeSchema.safeParse({ t: 0, s: 0.5 });
    expect(result.success).toBe(false);
  });

  it("accepts `s` as a 1-element array", () => {
    const result = KeyframeSchema.safeParse({ t: 0, s: [0.5] });
    expect(result.success).toBe(true);
  });
});

describe("AnimatablePropertySchema — D-33 expression channel structurally impossible", () => {
  it("accepts a static property (a=0)", () => {
    const result = AnimatablePropertySchema.safeParse({ a: 0, k: 100 });
    expect(result.success).toBe(true);
  });

  it("rejects an expression channel (`x` key) at the gate (COM-04, strictObject)", () => {
    const result = AnimatablePropertySchema.safeParse({
      a: 1,
      k: [{ t: 0, s: [100] }],
      x: "transform.position[0]", // expression channel — D-33 zero expressions
    });
    expect(result.success).toBe(false);
  });
});

describe("LottieJSONSchema — D-12 pin + structural rejects (Task 2)", () => {
  const baseLottie = {
    v: "5.7.0",
    fr: 30,
    ip: 0,
    op: 60,
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: "primary",
        ip: 0,
        op: 60,
        ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [50, 50] } },
        shapes: [
          {
            ty: "gr",
            it: [],
          },
        ],
      },
    ],
  } as const;

  function makeLottie(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { ...baseLottie, ...overrides };
  }

  it("rejects adjacent pinned literal v '5.7.1' (D-12)", () => {
    const result = LottieJSONSchema.safeParse(makeLottie({ v: "5.7.1" }));
    expect(result.success).toBe(false);
  });

  it("accepts the exact pinned v '5.7.0' (D-12)", () => {
    const result = LottieJSONSchema.safeParse(makeLottie());
    expect(result.success).toBe(true);
  });

  it("rejects top-level ddd=1 (3D hard reject)", () => {
    const result = LottieJSONSchema.safeParse(makeLottie({ ddd: 1 }));
    expect(result.success).toBe(false);
  });

  it("rejects a non-shape layer ty (e.g. ty=2)", () => {
    const lottie = JSON.parse(JSON.stringify(baseLottie));
    lottie.layers[0].ty = 2;
    const result = LottieJSONSchema.safeParse(lottie);
    expect(result.success).toBe(false);
  });

  it("accepts a shape-layer ty=4 with a gr shape item", () => {
    const result = LottieJSONSchema.safeParse(makeLottie());
    expect(result.success).toBe(true);
  });

  it("rejects an animated property carrying an expression key (`x`) — COM-04", () => {
    const lottie = JSON.parse(JSON.stringify(baseLottie));
    lottie.layers[0].ks.o = { a: 1, k: [{ t: 0, s: [100] }], x: "effect('foo')('bar')" };
    const result = LottieJSONSchema.safeParse(lottie);
    expect(result.success).toBe(false);
  });

  it("rejects a keyframe carrying the legacy second-endpoint key `e`", () => {
    const lottie = JSON.parse(JSON.stringify(baseLottie));
    lottie.layers[0].ks.o = {
      a: 1,
      k: [{ t: 0, s: [100], e: { x: [100], y: [100] } }],
    };
    const result = LottieJSONSchema.safeParse(lottie);
    expect(result.success).toBe(false);
  });

  it("rejects a keyframe with scalar s (Pitfall 3)", () => {
    const lottie = JSON.parse(JSON.stringify(baseLottie));
    lottie.layers[0].ks.o = { a: 1, k: [{ t: 0, s: 100 }] };
    const result = LottieJSONSchema.safeParse(lottie);
    expect(result.success).toBe(false);
  });

  it("rejects descending keyframe t (Pitfall 11)", () => {
    const lottie = JSON.parse(JSON.stringify(baseLottie));
    lottie.layers[0].ks.o = {
      a: 1,
      k: [
        { t: 30, s: [100], i: { x: [0], y: [0] }, o: { x: [30], y: [30] } },
        { t: 30, s: [100], i: { x: [0], y: [0] }, o: { x: [30], y: [30] } },
      ],
    };
    const result = LottieJSONSchema.safeParse(lottie);
    expect(result.success).toBe(false);
  });

  it("rejects handles carried on the last keyframe (Pitfall 11)", () => {
    const lottie = JSON.parse(JSON.stringify(baseLottie));
    lottie.layers[0].ks.o = {
      a: 1,
      k: [
        { t: 0, s: [100], i: { x: [0], y: [0] }, o: { x: [30], y: [30] } },
        { t: 60, s: [50], i: { x: [0], y: [0] }, o: { x: [30], y: [30] } },
      ],
    };
    const result = LottieJSONSchema.safeParse(lottie);
    expect(result.success).toBe(false);
  });

  it("rejects handles missing on an intermediate keyframe (Pitfall 11)", () => {
    const lottie = JSON.parse(JSON.stringify(baseLottie));
    lottie.layers[0].ks.o = {
      a: 1,
      k: [
        { t: 0, s: [100] },
        { t: 60, s: [50] },
      ],
    };
    const result = LottieJSONSchema.safeParse(lottie);
    expect(result.success).toBe(false);
  });

  it("rejects op < ip (negative stretch, COM-04)", () => {
    const lottie = JSON.parse(JSON.stringify(baseLottie));
    lottie.op = 0;
    lottie.layers[0].op = 0;
    const result = LottieJSONSchema.safeParse(lottie);
    expect(result.success).toBe(false);
  });

  it("rejects animated scale below 0 (negative stretch, COM-04)", () => {
    const lottie = JSON.parse(JSON.stringify(baseLottie));
    lottie.layers[0].ks.s = {
      a: 1,
      k: [
        { t: 0, s: [-100, 100, 100], i: { x: [0], y: [0] }, o: { x: [30], y: [30] } },
        { t: 60, s: [100, 100, 100] },
      ],
    };
    const result = LottieJSONSchema.safeParse(lottie);
    expect(result.success).toBe(false);
  });

  it("rejects opacity out of 0..100 (Pitfall 2 unit gate)", () => {
    const lottie = JSON.parse(JSON.stringify(baseLottie));
    lottie.layers[0].ks.o = { a: 0, k: 150 };
    const result = LottieJSONSchema.safeParse(lottie);
    expect(result.success).toBe(false);
  });

  it("rejects empty layers (min 1)", () => {
    const result = LottieJSONSchema.safeParse(makeLottie({ layers: [] }));
    expect(result.success).toBe(false);
  });

  it("rejects fr outside 1..120", () => {
    const tooLow = LottieJSONSchema.safeParse(makeLottie({ fr: 0 }));
    expect(tooLow.success).toBe(false);
    const tooHigh = LottieJSONSchema.safeParse(makeLottie({ fr: 121 }));
    expect(tooHigh.success).toBe(false);
  });
});

describe("CompileResultSchema — closes the envelope; lottie re-validated by construction", () => {
  it("rejects a CompileResult whose lottie fails the gate", () => {
    const result = CompileResultSchema.safeParse({
      asset_id: "a-001",
      recipe_id: "fade",
      renderer_support: "all",
      lottie: { v: "5.7.1" }, // wrong pin — gate would already reject
      svg: "<svg viewBox='0 0 16 16'/>",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a CompileResult whose lottie passes the gate", () => {
    const okLottie = {
      v: "5.7.0",
      fr: 30,
      ip: 0,
      op: 60,
      ddd: 0,
      assets: [],
      layers: [
        {
          ddd: 0,
          ind: 1,
          ty: 4,
          nm: "primary",
          ip: 0,
          op: 60,
          ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [50, 50] } },
          shapes: [{ ty: "gr", it: [] }],
        },
      ],
    };
    const result: { success: boolean; data?: CompileResult } = CompileResultSchema.safeParse({
      asset_id: "a-001",
      recipe_id: "fade",
      renderer_support: "all",
      lottie: okLottie,
      svg: "<svg viewBox='0 0 16 16'/>",
    });
    expect(result.success).toBe(true);
  });
});

describe("KeyframeShapeSchema — imported from catalogue, exhaustive over 10 shapes (D-37)", () => {
  it("accepts every locked keyframe shape", () => {
    for (const shape of [
      "opacity-ramp",
      "translate-in",
      "overshoot-settle",
      "scale-breath",
      "trim-path",
      "angular-in",
      "pop-settle",
      "sine-drift",
      "damped-oscillation",
      "circular-path",
    ] as const) {
      expect(KeyframeShapeSchema.safeParse(shape).success).toBe(true);
    }
  });
});

/**
 * Phase 3 shared rejection harness (D-29) — `render-spec.json` cases drive
 * the zod gate here; the same fixture is the pytest parametrize source in
 * Phase 7. `it.each` mirrors the recipe.spec.ts pattern (lines 113-130).
 * `expect_code` is asserted via `isRejectionExpectCode` membership against
 * the closed RPC code set.
 */
describe("RenderSpec rejection harness (D-29)", () => {
  const cases = loadRenderSpecRejectionCases("render-spec");

  it("ships at least 14 cases (one per behavior bullet + buffer)", () => {
    expect(cases.length).toBeGreaterThanOrEqual(14);
  });

  it.each(cases.map((c: Phase3RejectionCase) => [c.case_id, c]))(
    "%s -> RenderSpecSchema.safeParse rejects (and code path matches)",
    (_caseId, c) => {
      const result = RenderSpecSchema.safeParse(c.payload);
      expect(result.success).toBe(false);
      if (result.success) return;
      const actualPaths = new Set(
        result.error.issues.map((issue) =>
          JSON.stringify(issue.path.map((p) => (typeof p === "symbol" ? String(p) : p))),
        ),
      );
      for (const expected of c.expect_paths) {
        expect(actualPaths.has(JSON.stringify(expected))).toBe(true);
      }
      if (c.expect_code !== null) {
        expect(isRejectionExpectCode(c.expect_code)).toBe(true);
      }
    },
  );
});

/**
 * Phase 3 LottieJSON rejection harness (D-29) — `lottie-json.json` cases
 * drive the gate; same JSON is the pytest source in Phase 7.
 */
describe("LottieJSON rejection harness (D-29)", () => {
  const cases = loadRenderSpecRejectionCases("lottie-json");

  it("ships at least 11 cases (one per behavior bullet)", () => {
    expect(cases.length).toBeGreaterThanOrEqual(11);
  });

  it.each(cases.map((c: Phase3RejectionCase) => [c.case_id, c]))(
    "%s -> LottieJSONSchema.safeParse rejects",
    (_caseId, c) => {
      const result = LottieJSONSchema.safeParse(c.payload);
      expect(result.success).toBe(false);
      if (result.success) return;
      const actualPaths = new Set(
        result.error.issues.map((issue) =>
          JSON.stringify(issue.path.map((p) => (typeof p === "symbol" ? String(p) : p))),
        ),
      );
      for (const expected of c.expect_paths) {
        expect(actualPaths.has(JSON.stringify(expected))).toBe(true);
      }
      if (c.expect_code !== null) {
        expect(isRejectionExpectCode(c.expect_code)).toBe(true);
      }
    },
  );
});

/**
 * The closed-typed facade — the loader MUST throw on an out-of-set
 * `expect_code` so a stray string never silently passes a case in vitest
 * while the Python mirror would error in Phase 7.
 */
describe("loadRenderSpecRejectionCases — closed enum guard", () => {
  it("throws when an expect_code is not a member of the closed RPC code set", async () => {
    const { readFileSync, writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = mkdtempSync("gsd-load-");
    try {
      const fixture = join(dir, "bogus-render-spec.json");
      writeFileSync(
        fixture,
        JSON.stringify([
          {
            case_id: "bogus",
            ref: "example-style@1.0.0",
            model: "RenderSpec",
            expect_code: "totally-unknown-code",
            payload: {},
          },
        ]),
      );
      // Use the underlying loader directly to bypass the contract-name
      // gate; the assertion is on the closed-code detection in
      // assertRejectionEntryShape.
      const { assertRejectionEntryShape } = await import("./rejection-cases.js");
      expect(() =>
        assertRejectionEntryShape(
          {
            case_id: "bogus",
            ref: "r",
            model: "m",
            payload: {},
            expect_code: "totally-unknown-code",
          },
          "bogus.json",
        ),
      ).toThrow(/expect_code.*not a member/);
      // Reference unused imports to satisfy linters without altering the catch.
      void readFileSync;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
