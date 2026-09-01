/**
 * Shape builder — emits the Lottie shape-item array for a single
 * RenderSpec component.
 *
 * **Phase 3 TRACER surface (plan 03-04):** only `rect` and
 * `ellipse` are implemented. The `path`, `polyline`, and
 * `polystar` generators throw a typed `CompileError` — same
 * widening contract as `keyframe-emitter.ts` (plan 03-05 expands
 * the switch).
 *
 * The builder emits a `gr` (group) shape-item that wraps the
 * geometric primitive with a `fl` (fill) or `st` (stroke) item.
 * The `gr` group carries the D-02 anchor as `nm` — the same
 * string as the Lottie layer's `nm` so theming finds the same
 * structure at both layers (Pitfall not separately named — the
 * group-name mirroring is the architectural decision).
 *
 * **Coordinate regime:** RenderSpec carries normalized coordinates
 * in [0..1] (D-06 closed ranges). Lottie shape items carry
 * pixel coordinates in the StyleSpec viewBox space. The conversion
 * happens here so downstream consumers (transform-builder, the
 * orchestrator) work exclusively in viewBox pixels.
 *
 * **Pure module, zero I/O.** The compiler orchestrator is the
 * single caller.
 */

import type {
  Component,
  LottieShapeItem,
  Paint,
  RenderSpecRole,
  StrokeWidthToken,
} from "../rpc/contracts/motion-compiler.schema.js";
import type { StyleSpec } from "../rpc/contracts/style-spec.schema.js";
import { type LottieRgb, resolveLottieColor } from "./color-resolver.js";
import { CompileError } from "./keyframe-emitter.js";

/**
 * Build the `shapes` array for a Lottie shape layer. Returns a
 * single-element array containing one group (`gr`) that wraps
 * the geometry with the paint.
 *
 * @param component - the RenderSpec component (carries the
 *                    shape discriminator + paint + role).
 * @param style     - the loaded StyleSpec (carries viewBox + the
 *                    stroke-width token → pixel mapping).
 */
export function buildShapeItem(
  component: Component,
  style: StyleSpec,
): ReadonlyArray<LottieShapeItem> {
  const role = component.role;
  const color = resolveLottieColor(component.paint, role);

  const geometry = buildGeometry(component, style);
  const paint = buildPaint(component.paint, color, style);
  const group: LottieShapeItem = {
    ty: "gr",
    it: [geometry, paint],
  };
  return [group];
}

/**
 * Build the Lottie geometry item for a component. Switch exhaustif
 * sans default (D-37 mirrored) — the `never` binding at the end
 * makes any future shape addition a TypeScript compile error.
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
      throw new CompileError(
        "shape generator 'path' is not yet implemented in Phase 3 (widened in plan 03-05)",
      );
    case "polyline":
      throw new CompileError(
        "shape generator 'polyline' is not yet implemented in Phase 3 (widened in plan 03-05)",
      );
    case "polystar":
      throw new CompileError(
        "shape generator 'polystar' is not yet implemented in Phase 3 (widened in plan 03-05)",
      );
    default: {
      const _exhaustive: never = shape;
      throw new CompileError(`unknown shape discriminator: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Build the Lottie `rc` (rectangle) shape item. Coordinates are
 * normalized [0..1] in the RenderSpec; Lottie carries them in
 * viewBox pixels (D-22 — viewBox-only regime). The position
 * `p` is the rectangle's CENTER (Lottie convention); the size
 * `s` is the full width and height.
 *
 * The `corner_radius` is in pixels in Lottie; RenderSpec carries
 * the same value normalized, multiplied by the viewBox width
 * (the rect's horizontal axis is the conventional radius
 * dimension).
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
  // Position = center of the rectangle in viewBox pixels.
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
 * Build the Lottie `el` (ellipse) shape item. The ellipse's size
 * `s` is the FULL diameter (`[2*rx, 2*ry]`, not `[rx, ry]` — Lottie
 * convention). Position `p` is the ellipse's center.
 */
function buildEllipse(
  cxNorm: number,
  cyNorm: number,
  rxNorm: number,
  ryNorm: number,
  viewBoxWidth: number,
  viewBoxHeight: number,
): LottieShapeItem {
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
 * Build the Lottie paint shape item (`fl` for fill, `st` for
 * stroke). The opacity channel carries 100 (Pitfall 2 — percent
 * units). The stroke variant carries `w` (width in pixels, looked
 * up from the StyleSpec stroke-width tokens per D-14) plus the
 * line-cap and line-join defaults.
 *
 * `lc: 2` = round line cap, `lj: 2` = round line join — visually
 * pleasing defaults; the Lottie spec accepts `1|2|3` for both.
 */
function buildPaint(paint: Paint, color: LottieRgb, style: StyleSpec): LottieShapeItem {
  if (paint.kind === "fill") {
    return {
      ty: "fl",
      c: [color[0], color[1], color[2]],
      o: 100,
    };
  }
  // Stroke variant — resolve the token to its pixel width.
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
 * StyleSpec (D-14 — tokens are the only path to a stroke width;
 * bare floats are structurally rejected at the gate).
 */
function resolveStrokeWidth(token: StrokeWidthToken, style: StyleSpec): number {
  return style.stroke_widths[token];
}

/**
 * Re-export the role type for the compiler orchestrator.
 */
export type { RenderSpecRole };
