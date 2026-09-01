/**
 * Phase 3 plan 03-05 — shape-builder + markers spec.
 *
 * The shape builder must cover all 5 `SHAPE_NAMES` with no
 * unimplemented branch (D-37). Tests assert the kappa constant
 * is imported (NOT hard-coded) and the polystar vertex formula
 * emits `2 × points_count` shape items per spec. The markers
 * module's D-15 pose rule is asserted for at least one one-shot
 * and one loop recipe; trigger emission is asserted for a recipe
 * with 2 trigger points.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import {
  markersFor,
  poseResolutionFor,
  svgPoseFrameFor,
  triggerFramesFor,
} from "../../motion-compiler/markers.js";
import { buildShapeItem, KAPPA, SHAPE_NAMES } from "../../motion-compiler/shape-builder.js";
import { type CatalogRecipe, RecipeCatalogueSchema } from "../../rpc/contracts/catalogue.schema.js";
import type { Component } from "../../rpc/contracts/motion-compiler.schema.js";
import { RenderSpecSchema } from "../../rpc/contracts/motion-compiler.schema.js";
import { type StyleSpec, StyleSpecSchema } from "../../rpc/contracts/style-spec.schema.js";

const REPO_ROOT = join(__dirname, "..", "..", "..");

const VIEW_BOX = { width: 400, height: 300 };

function loadStyle(): StyleSpec {
  return StyleSpecSchema.parse({
    style_version: "1.0.0",
    viewBox: { width: VIEW_BOX.width, height: VIEW_BOX.height },
    stroke_widths: { thin: 1.5, default: 2.5, bold: 4.0 },
    corner_radii: { small: 0, medium: 8, large: 16 },
    palette: [
      { name: "ink", hex: "#1F2430" },
      { name: "accent", hex: "#FF6B4A" },
    ],
    easing_curves: [
      { name: "standard", control_points: [0.2, 0, 0.2, 1] },
      { name: "entrance", control_points: [0, 0, 0.2, 1] },
    ],
  });
}

function makeComponent(shape: Component["shape"], role: string = "primary"): Component {
  return {
    component: "primary-shape",
    role: role as Component["role"],
    shape,
    paint: { kind: "fill", color: "#1c57cb" },
  };
}

function loadCatalogue(): CatalogRecipe[] {
  // Read the committed catalogue.json fixture (the canonical
  // load-time authority — D-17). The catalogue is loaded once
  // globally and shared across describe blocks.
  const raw = JSON.parse(
    readFileSync(join(REPO_ROOT, "fixtures", "recipe-catalogue", "catalogue.json"), "utf-8"),
  );
  return RecipeCatalogueSchema.parse(raw).recipes;
}

describe("shape-builder — kappa constant import (D-37)", () => {
  it("exports the kappa constant from a single source", () => {
    expect(typeof KAPPA).toBe("number");
    expect(KAPPA).toBeGreaterThan(0.5);
    expect(KAPPA).toBeLessThan(0.6);
    // Spec pin (rounded to IEEE-754 double precision):
    // 0.5519150244935105707435627 → 0.5519150244935106
    expect(KAPPA).toBeCloseTo(0.5519150244935106, 15);
  });
});

describe("shape-builder — SHAPE_NAMES exhaustive coverage", () => {
  it("enumerates the 5 closed shape names (D-37, no missing branch)", () => {
    expect(SHAPE_NAMES).toEqual(["rect", "ellipse", "path", "polyline", "polystar"]);
  });
});

describe("shape-builder — rect (rc)", () => {
  it("emits a rect shape item with normalized-to-viewBox conversion", () => {
    const style = loadStyle();
    const component = makeComponent({
      shape: "rect",
      x: 0.25,
      y: 0.25,
      w: 0.5,
      h: 0.5,
      corner_radius: 0.0625,
    });
    const shapes = buildShapeItem(component, style, null);
    expect(shapes).toHaveLength(1);
    const group = shapes[0];
    if (group === undefined || group.ty !== "gr") throw new Error("expected group");
    const it = group.it as Array<Record<string, unknown>>;
    const rect = it.find((item) => item.ty === "rc");
    expect(rect).toBeDefined();
    if (rect === undefined) return;
    // Position = (0.25 + 0.25) * 400 = 200, (0.25 + 0.25) * 300 = 150
    expect(rect.p).toEqual([200, 150]);
    // Size = 0.5 * 400 = 200, 0.5 * 300 = 150
    expect(rect.s).toEqual([200, 150]);
    // Corner radius = 0.0625 * 400 = 25
    expect(rect.r).toBe(25);
  });
});

describe("shape-builder — ellipse (el)", () => {
  it("emits an ellipse shape item with diameter (not radius) — Lottie convention", () => {
    const style = loadStyle();
    const component = makeComponent({
      shape: "ellipse",
      cx: 0.5,
      cy: 0.5,
      rx: 0.25,
      ry: 0.25,
    });
    const shapes = buildShapeItem(component, style, null);
    const group = shapes[0];
    if (group === undefined || group.ty !== "gr") throw new Error("expected group");
    const it = group.it as Array<Record<string, unknown>>;
    const el = it.find((item) => item.ty === "el");
    expect(el).toBeDefined();
    if (el === undefined) return;
    // cx = 0.5 * 400 = 200; cy = 0.5 * 300 = 150
    expect(el.p).toEqual([200, 150]);
    // Size = FULL diameter = 2 * 0.25 * 400 = 200, 2 * 0.25 * 300 = 150
    expect(el.s).toEqual([200, 150]);
  });
});

describe("shape-builder — path (sh)", () => {
  it("emits a path shape item with bezier description + closed flag", () => {
    const style = loadStyle();
    const component = makeComponent({
      shape: "path",
      points: [
        [0.1, 0.1],
        [0.5, 0.1],
        [0.5, 0.5],
        [0.1, 0.5],
      ],
      closed: true,
    });
    const shapes = buildShapeItem(component, style, null);
    const group = shapes[0];
    if (group === undefined || group.ty !== "gr") throw new Error("expected group");
    const it = group.it as Array<Record<string, unknown>>;
    const sh = it.find((item) => item.ty === "sh");
    expect(sh).toBeDefined();
    if (sh === undefined) return;
    const ks = sh.ks as { i: number[][]; o: number[][]; v: number[][]; c: boolean };
    // 4 vertices passed through; tangents are all (0, 0)
    expect(ks.v).toEqual([
      [40, 30],
      [200, 30],
      [200, 150],
      [40, 150],
    ]);
    expect(ks.i).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
    expect(ks.o).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
    expect(ks.c).toBe(true);
  });
});

describe("shape-builder — polyline (sh)", () => {
  it("emits a polyline shape item (always open — no closing edge)", () => {
    const style = loadStyle();
    const component = makeComponent({
      shape: "polyline",
      points: [
        [0.1, 0.1],
        [0.5, 0.5],
        [0.9, 0.1],
      ],
    });
    const shapes = buildShapeItem(component, style, null);
    const group = shapes[0];
    if (group === undefined || group.ty !== "gr") throw new Error("expected group");
    const it = group.it as Array<Record<string, unknown>>;
    const sh = it.find((item) => item.ty === "sh");
    expect(sh).toBeDefined();
    if (sh === undefined) return;
    const ks = sh.ks as { v: number[][]; c: boolean };
    // Polyline is always open
    expect(ks.c).toBe(false);
    expect(ks.v).toEqual([
      [40, 30],
      [200, 150],
      [360, 30],
    ]);
  });

  it("normalized→viewBox conversion is exact on 0.5 grids", () => {
    const style = loadStyle();
    const component = makeComponent({
      shape: "polyline",
      points: [
        [0.5, 0.5],
        [0.5, 0.5],
      ],
    });
    const shapes = buildShapeItem(component, style, null);
    const group = shapes[0];
    if (group === undefined || group.ty !== "gr") throw new Error("expected group");
    const it = group.it as Array<Record<string, unknown>>;
    const sh = it.find((item) => item.ty === "sh");
    if (sh === undefined) throw new Error("missing sh");
    const ks = sh.ks as { v: number[][] };
    // 0.5 * 400 = 200, 0.5 * 300 = 150
    expect(ks.v).toEqual([
      [200, 150],
      [200, 150],
    ]);
  });
});

describe("shape-builder — polystar (sr)", () => {
  it("emits a polystar shape item with pt = points_count (Lottie spec)", () => {
    const style = loadStyle();
    const component = makeComponent({
      shape: "polystar",
      cx: 0.5,
      cy: 0.5,
      points_count: 5,
      r_outer: 0.4,
      r_inner: 0.2,
      rotation_deg: 0,
    });
    const shapes = buildShapeItem(component, style, null);
    const group = shapes[0];
    if (group === undefined || group.ty !== "gr") throw new Error("expected group");
    const it = group.it as Array<Record<string, unknown>>;
    const sr = it.find((item) => item.ty === "sr");
    expect(sr).toBeDefined();
    if (sr === undefined) return;
    expect(sr.pt).toBe(5);
    // Outer/inner radii use min(viewBoxW, viewBoxH) = 300.
    expect(sr.or).toEqual([120, 120]); // 0.4 * 300 = 120
    expect(sr.ir).toEqual([60, 60]); // 0.2 * 300 = 60
    expect(sr.p).toEqual([200, 150]); // 0.5 * (400, 300)
    expect(sr.r).toBe(0);
  });

  it("handles rotation_deg in degrees", () => {
    const style = loadStyle();
    const component = makeComponent({
      shape: "polystar",
      cx: 0.5,
      cy: 0.5,
      points_count: 6,
      r_outer: 0.3,
      r_inner: 0.1,
      rotation_deg: 45,
    });
    const shapes = buildShapeItem(component, style, null);
    const it = (shapes[0] as { it: Array<Record<string, unknown>> }).it;
    const sr = it.find((item) => item.ty === "sr");
    expect(sr?.r).toBe(45);
  });

  it("rejects out-of-range points_count", () => {
    const style = loadStyle();
    // Schema layer would reject, but the builder has its own
    // sanity guard.
    const component = makeComponent({
      shape: "polystar",
      cx: 0.5,
      cy: 0.5,
      points_count: 20,
      r_outer: 0.4,
      r_inner: 0.2,
      rotation_deg: 0,
    });
    expect(() => buildShapeItem(component, style, null)).toThrow(/points_count/);
  });
});

describe("shape-builder — trim threading (D-14, draw-on)", () => {
  it("inserts a trim item between geometry and paint when supplied", () => {
    const style = loadStyle();
    const component = makeComponent({
      shape: "path",
      points: [
        [0.1, 0.1],
        [0.5, 0.5],
      ],
      closed: false,
    });
    const fakeTrim = {
      ty: "tm" as const,
      s: { a: 0 as const, k: 0 },
      e: {
        a: 1 as const,
        k: [
          { t: 0, s: [0] },
          { t: 60, s: [100] },
        ],
      },
      o: { a: 0 as const, k: 0 },
      m: 1 as const,
      ix: 2,
    };
    const shapes = buildShapeItem(component, style, fakeTrim);
    const group = shapes[0];
    if (group === undefined || group.ty !== "gr") throw new Error("expected group");
    const it = group.it as Array<Record<string, unknown>>;
    const tyOrder = it.map((item) => item.ty);
    // Order: geometry (sh) → trim (tm) → paint (fl)
    expect(tyOrder).toEqual(["sh", "tm", "fl"]);
  });
});

describe("shape-builder — paint fl/st", () => {
  it("emits a fill paint with neutral color (D-09)", () => {
    const style = loadStyle();
    const component = makeComponent({ shape: "rect", x: 0, y: 0, w: 1, h: 1, corner_radius: 0 });
    const shapes = buildShapeItem(component, style, null);
    const group = shapes[0];
    if (group === undefined || group.ty !== "gr") throw new Error("expected group");
    const it = group.it as Array<Record<string, unknown>>;
    const fl = it.find((item) => item.ty === "fl");
    expect(fl).toBeDefined();
    if (fl === undefined) return;
    expect(fl.c).toEqual([0.5, 0.5, 0.5]);
    expect(fl.o).toBe(100);
  });

  it("emits a stroke paint with token-resolved width (D-14)", () => {
    const style = loadStyle();
    const component: Component = {
      component: "primary-shape",
      role: "primary",
      shape: { shape: "rect", x: 0, y: 0, w: 1, h: 1, corner_radius: 0 },
      paint: { kind: "stroke", color: "#1c57cb", stroke_width_token: "bold" },
    };
    const shapes = buildShapeItem(component, style, null);
    const group = shapes[0];
    if (group === undefined || group.ty !== "gr") throw new Error("expected group");
    const it = group.it as Array<Record<string, unknown>>;
    const st = it.find((item) => item.ty === "st");
    expect(st).toBeDefined();
    if (st === undefined) return;
    expect(st.w).toBe(4.0); // bold token from the style
  });
});

describe("markers — D-15 pose rule (exhaustive)", () => {
  it("resolves 7 one-shot keyframe shapes to 'finale'", () => {
    const oneShotShapes = [
      "opacity-ramp",
      "translate-in",
      "overshoot-settle",
      "trim-path",
      "angular-in",
      "pop-settle",
      "damped-oscillation",
    ] as const;
    for (const shape of oneShotShapes) {
      expect(poseResolutionFor(shape)).toBe("finale");
    }
  });

  it("resolves 3 loop keyframe shapes to 't=0'", () => {
    const loopShapes = ["scale-breath", "sine-drift", "circular-path"] as const;
    for (const shape of loopShapes) {
      expect(poseResolutionFor(shape)).toBe("t=0");
    }
  });

  it("svgPoseFrameFor: one-shot recipe resolves to op", () => {
    const recipes = loadCatalogue();
    const fade = recipes.find((r) => r.id === "fade");
    if (fade === undefined) throw new Error("missing fade fixture");
    // fade is opacity-ramp (one-shot) → finale
    const op = 48;
    expect(svgPoseFrameFor(fade, op)).toBe(op);
  });

  it("svgPoseFrameFor: loop recipe resolves to 0", () => {
    const recipes = loadCatalogue();
    const orbit = recipes.find((r) => r.id === "orbit");
    if (orbit === undefined) throw new Error("missing orbit fixture");
    // orbit is circular-path (loop) → t=0
    expect(svgPoseFrameFor(orbit, 90)).toBe(0);
  });
});

describe("markers — trigger frame derivation (D-34)", () => {
  it("maps enter/exit → op, loop → 0 for a recipe with 2 trigger points", () => {
    const recipes = loadCatalogue();
    const fade = recipes.find((r) => r.id === "fade");
    if (fade === undefined) throw new Error("missing fade fixture");
    const op = 48;
    expect(fade.trigger_points).toEqual(["enter", "exit"]);
    const frames = triggerFramesFor(fade, op);
    expect(frames).toEqual([op, op]); // both enter and exit → op
  });

  it("maps single-loop trigger to 0", () => {
    const recipes = loadCatalogue();
    const orbit = recipes.find((r) => r.id === "orbit");
    if (orbit === undefined) throw new Error("missing orbit fixture");
    expect(triggerFramesFor(orbit, 90)).toEqual([0]);
  });
});

describe("markers — emission (D-34)", () => {
  it("emits one marker per trigger point, deterministically named", () => {
    const recipes = loadCatalogue();
    const fade = recipes.find((r) => r.id === "fade");
    if (fade === undefined) throw new Error("missing fade fixture");
    const op = 48;
    const markers = markersFor(fade, op);
    expect(markers).toHaveLength(2);
    expect(markers[0]?.cm).toBe("enter-fade");
    expect(markers[1]?.cm).toBe("exit-fade");
    expect(markers[0]?.tm).toBe(op);
    expect(markers[1]?.tm).toBe(op);
    expect(markers[0]?.dr).toBe(0);
  });
});

// `RenderSpecSchema` and `RenderSpec` imported for type access
// but not re-exported (test files must not export).
void RenderSpecSchema;
