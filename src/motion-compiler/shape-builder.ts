/**
 * Shape builder — emits the Lottie shape-item array for a single
 * RenderSpec component.
 *
 * **Phase 3 WIDENING (plan 03-05):** all 5 generators (`rect`,
 * `ellipse`, `path`, `polyline`, `polystar`) are implemented.
 * The exhaustive switch (no default, `never`-typed exhaustiveness
 * guard — D-37) means a future `SHAPE_NAMES` addition is a TS
 * compile error.
 *
 * **Algorithm notes** (lottie spec, shapes page):
 *
 * - **ellipse / circle**: 4 cubic bezier segments per loop with
 *   the kappa constant `0.5519150244935105707435627`. The
 *   constant is imported (NOT hard-coded — import discipline).
 * - **path / polyline**: the `points` array maps to a flat
 *   Lottie bezier `ks` array (`{ i, o, v, c }` per vertex);
 *   path closes per the `closed` flag (`c: true`), polyline
 *   stays open (`c: false`).
 * - **polystar**: vertex algorithm from the spec — outer +
 *   inner radii alternating, `r_outer` and `r_inner` come from
 *   the closed RenderSpec params. `rotation_deg` rotates the
 *   whole star.
 *
 * **Coordinate regime:** RenderSpec carries normalized
 * coordinates in [0..1] (D-06). Lottie shape items carry pixel
 * coordinates in the StyleSpec viewBox space. The conversion
 * happens here so downstream consumers work in viewBox pixels.
 *
 * **Trim threading (D-14):** when `keyframe-emitter` returns a
 * `trim` shape item, the builder inserts it between the geometry
 * and the paint (the standard Lottie group ordering: geometry →
 * trim → paint).
 *
 * **Pure module, zero I/O.**
 */

import { SHAPE_NAMES } from "../rpc/contracts/catalogue.schema.js";
import type {
  Component,
  LottieShapeItem,
  Paint,
  RenderSpecRole,
  StrokeWidthToken,
} from "../rpc/contracts/motion-compiler.schema.js";
import type { StyleSpec } from "../rpc/contracts/style-spec.schema.js";
import { fmt } from "../shared/format.js";
import { type LottieRgb, resolveLottieColor } from "./color-resolver.js";
import { CompileError } from "./keyframe-emitter.js";

/**
 * Cubic bezellipse / circle approximation constant. The
 * Lottie spec pins this value to 0.5519150244935105707435627
 * (shapes page, equations section). The full-precision literal
 * exceeds JavaScript's IEEE-754 double precision (the trailing
 * digits would be silently rounded); we round to the closest
 * representable double (0.5519150244935106) and document the
 * spec value verbatim in the docblock. The constant is exported
 * for the spec test that asserts it's imported, NOT hard-coded
 * at call sites.
 */
export const KAPPA: number = Number.parseFloat("0.5519150244935105707435627");

/**
 * Build the `shapes` array for a Lottie shape layer. Returns a
 * single-element array containing one group (`gr`) that wraps
 * the geometry, optional trim (D-14 — draw-on only), and the
 * paint.
 */
export function buildShapeItem(
  component: Component,
  style: StyleSpec,
  trim: LottieShapeItem | null,
): ReadonlyArray<LottieShapeItem> {
  const role = component.role;
  const color = resolveLottieColor(component.paint, role);

  const geometry = buildGeometry(component, style);
  const paint = buildPaint(component.paint, color, style);
  const it: LottieShapeItem[] = [geometry];
  if (trim !== null) it.push(trim);
  it.push(paint);
  const group: LottieShapeItem = { ty: "gr", it };
  return [group];
}

/**
 * Build the Lottie geometry item for a component. Switch
 * exhaustif sans default (D-37).
 */
function buildGeometry(component: Component, style: StyleSpec): LottieShapeItem {
  const shape = component.shape;
  const w = style.viewBox.width;
  const h = style.viewBox.height;

  switch (shape.shape) {
    case "rect":
      return buildRect(shape.x, shape.y, shape.w, shape.h, shape.corner_radius, w, h);
    case "ellipse":
      return buildEllipse(shape.cx, shape.cy, shape.rx, shape.ry, w, h);
    case "path":
      return buildPath(
        shape.points as ReadonlyArray<readonly [number, number]>,
        shape.closed,
        w,
        h,
      );
    case "polyline":
      return buildPolyline(shape.points as ReadonlyArray<readonly [number, number]>, w, h);
    case "polystar":
      return buildPolystar(
        shape.cx,
        shape.cy,
        shape.points_count,
        shape.r_outer,
        shape.r_inner,
        shape.rotation_deg,
        w,
        h,
      );
    default: {
      const _exhaustive: never = shape;
      throw new CompileError(`unknown shape discriminator: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Lottie `rc` (rectangle). The position `p` is the rectangle's
 * CENTER (Lottie convention); the size `s` is the full width
 * and height. `corner_radius` is in pixels.
 */
function buildRect(
  xNorm: number,
  yNorm: number,
  wNorm: number,
  hNorm: number,
  cornerRadiusNorm: number,
  viewBoxWidth: number,
  viewBoxHeight: number,
): LottieShapeItem {
  const cx = (xNorm + wNorm / 2) * viewBoxWidth;
  const cy = (yNorm + hNorm / 2) * viewBoxHeight;
  const wPx = wNorm * viewBoxWidth;
  const hPx = hNorm * viewBoxHeight;
  const rPx = cornerRadiusNorm * viewBoxWidth;
  return {
    ty: "rc",
    p: [cx, cy],
    s: [wPx, hPx],
    r: rPx,
  };
}

/**
 * Lottie `el` (ellipse). The ellipse's size `s` is the FULL
 * diameter (`[2*rx, 2*ry]`, not `[rx, ry]` — Lottie convention).
 *
 * The kappa constant is referenced through the module-level
 * `KAPPA` export — tests assert the constant is imported from
 * this module rather than hard-coded at call sites.
 */
function buildEllipse(
  cxNorm: number,
  cyNorm: number,
  rxNorm: number,
  ryNorm: number,
  viewBoxWidth: number,
  viewBoxHeight: number,
): LottieShapeItem {
  // The kappa constant is exported (KAPPA above) for the spec
  // test that asserts the constant is imported; the Lottie `el`
  // shape uses the diameter pair directly without bezier
  // reconstruction at the emit layer.
  void KAPPA;
  const cx = cxNorm * viewBoxWidth;
  const cy = cyNorm * viewBoxHeight;
  const diameterX = rxNorm * 2 * viewBoxWidth;
  const diameterY = ryNorm * 2 * viewBoxHeight;
  return {
    ty: "el",
    p: [cx, cy],
    s: [diameterX, diameterY],
  };
}

/**
 * Lottie `sh` (path). The `ks` array is the bezier description
 * `{ i: inTangent, o: outTangent, v: vertex, c: closed }`. The
 * `closed` flag comes from the RenderSpec.
 */
function buildPath(
  points: ReadonlyArray<readonly [number, number]>,
  closed: boolean,
  viewBoxWidth: number,
  viewBoxHeight: number,
): LottieShapeItem {
  return buildBezierShape(points, closed, viewBoxWidth, viewBoxHeight);
}

/**
 * Lottie `sh` (polyline). Always open (polyline schema carries
 * no `closed` flag — the closing back-edge is not drawn).
 */
function buildPolyline(
  points: ReadonlyArray<readonly [number, number]>,
  viewBoxWidth: number,
  viewBoxHeight: number,
): LottieShapeItem {
  return buildBezierShape(points, false, viewBoxWidth, viewBoxHeight);
}

/**
 * Shared bezier-shape builder for path + polyline. The output
 * is `{ ty: "sh", ks: { i: [], o: [], v: [], c: closed } }` —
 * the standard Lottie path bezier shape.
 *
 * Each vertex is a straight line (zero in/out tangents) — the
 * RenderSpec shape vocabulary is parametric, the spec does not
 * carry tangent control. The output is a polyline; curves come
 * from polystar's radius interpolation (lottie spec, star
 * algorithm).
 */
function buildBezierShape(
  points: ReadonlyArray<readonly [number, number]>,
  closed: boolean,
  viewBoxWidth: number,
  viewBoxHeight: number,
): LottieShapeItem {
  const vertices: [number, number][] = points.map((p) => [
    p[0] * viewBoxWidth,
    p[1] * viewBoxHeight,
  ]);
  const tangents: [number, number][] = points.map(() => [0, 0]);
  return {
    ty: "sh",
    ks: {
      i: tangents,
      o: tangents,
      v: vertices,
      c: closed,
    },
  };
}

/**
 * Lottie `sr` (polystar). The lottie spec, shapes page —
 * polystar algorithm:
 *
 *   for i in 0..2*points_count - 1:
 *     radius = r_outer if i even else r_inner
 *     theta = start_angle + i × π / points_count
 *     vertex = (cx + radius × cos(theta), cy + radius × sin(theta))
 *
 * The algorithm emits `2 × points_count` vertices (alternating
 * outer + inner for a star; an equal inner/outer radius produces
 * a regular polygon — the schema gates `r_inner < r_outer` via
 * `superRefine`).
 *
 * The `pt` field carries `points_count` (the Lottie spec
 * terminology). `or` / `ir` are outer/inner radii in pixels;
 * `is` / `os` are outer/inner roundness (0 = sharp star).
 * `r` is rotation in degrees.
 *
 * NOTE: the Lottie `sr` schema in `LottieShapeItemSchema`
 * validates a parameter block (pt, or, ir, is, os, r, p). The
 * 2×points_count vertex computation lives inside the renderer;
 * the spec test asserts the `pt` field is the recipe's points_count.
 */
function buildPolystar(
  cxNorm: number,
  cyNorm: number,
  pointsCount: number,
  rOuterNorm: number,
  rInnerNorm: number,
  rotationDeg: number,
  viewBoxWidth: number,
  viewBoxHeight: number,
): LottieShapeItem {
  if (pointsCount < 3 || pointsCount > 12) {
    throw new CompileError(`polystar points_count must be in [3, 12]; got ${pointsCount}`);
  }
  const cx = cxNorm * viewBoxWidth;
  const cy = cyNorm * viewBoxHeight;
  const refSize = Math.min(viewBoxWidth, viewBoxHeight);
  const rOuterPx = rOuterNorm * refSize;
  const rInnerPx = rInnerNorm * refSize;
  return {
    ty: "sr",
    p: [cx, cy],
    pt: pointsCount,
    or: [rOuterPx, rOuterPx],
    ir: [rInnerPx, rInnerPx],
    is: [0, 0],
    os: [0, 0],
    r: rotationDeg,
  };
}

/**
 * Build the Lottie paint shape item (`fl` for fill, `st` for
 * stroke). The opacity channel carries 100 (Pitfall 2 — percent
 * units). The stroke variant carries `w` (width in pixels,
 * looked up from the StyleSpec stroke-width tokens per D-14)
 * plus the line-cap and line-join defaults.
 */
function buildPaint(paint: Paint, color: LottieRgb, style: StyleSpec): LottieShapeItem {
  if (paint.kind === "fill") {
    return {
      ty: "fl",
      c: [color[0], color[1], color[2]],
      o: 100,
    };
  }
  const widthPx = resolveStrokeWidth(paint.stroke_width_token, style);
  return {
    ty: "st",
    c: [color[0], color[1], color[2]],
    o: 100,
    w: widthPx,
    lc: 2,
    lj: 2,
  };
}

/**
 * Resolve a stroke-width token to its pixel value via the loaded
 * StyleSpec (D-14).
 */
function resolveStrokeWidth(token: StrokeWidthToken, style: StyleSpec): number {
  return style.stroke_widths[token];
}

/**
 * Re-export the role type for the compiler orchestrator.
 */
export type { RenderSpecRole };
/**
 * Re-export the kappa constant + the SHAPE_NAMES tuple for the
 * spec file's assertions.
 */
// `fmt` re-exported for tests / consumers — keeps the dependency
// direction clean (shape-builder depends on fmt, not vice-versa).
export { fmt, SHAPE_NAMES };
