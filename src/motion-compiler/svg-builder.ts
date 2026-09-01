/**
 * SVG builder — emit the raw SVG companion string for a
 * `CompileResult`. The output is the **pre-sanitization** form:
 * the SVG the compiler emits before `sanitizeSvg()` runs the SVGO
 * gate.
 *
 * **Decisions implemented (D-19 / D-20 / D-22 / D-32):**
 *
 * - D-19 — one `<g>` per component, each carrying the 2-segment
 *   ID `{asset_id}_{component}`. Mirrors the Lottie layer
 *   structure 1:1.
 *
 * - D-20 — pure template strings (no XMLSerializer, no SVGO
 *   emission, no external dependencies). Every attribute is
 *   hand-written in canonical order, every escape is statically
 *   bounded (the only dynamic content is the deterministic IDs,
 *   hex colors, and numeric attributes routed through `fmt()`).
 *
 * - D-22 — viewBox-only regime. The `<svg>` root carries
 *   `xmlns` and `viewBox`; no `width`, no `height`.
 *
 * - D-32 — shape elements inside each `<g>` carry the 3-segment
 *   ID `{asset_id}_{component}_{role}`.
 *
 * **Phase 3 WIDENING (plan 03-05):** all 5 shape generators
 * are implemented (rect, ellipse, path, polyline, polystar).
 * Path emits `<path d="...">` with `M` / `L` commands; polyline
 * emits `<polyline points="...">` (open by definition); polystar
 * emits a `<path>` with the star algorithm.
 *
 * **Pure module, zero I/O.**
 */

import type { Component, Paint, RenderSpec } from "../rpc/contracts/motion-compiler.schema.js";
import type { StyleSpec } from "../rpc/contracts/style-spec.schema.js";
import { fmt } from "../shared/format.js";
import { deriveDesc, deriveTitle, svgRootAttributes } from "./meta.js";

/**
 * Build the SVG companion string for a `CompileResult`.
 */
export function buildSvg(renderSpec: RenderSpec, style: StyleSpec): string {
  const viewBoxW = style.viewBox.width;
  const viewBoxH = style.viewBox.height;
  const root = svgRootAttributes(viewBoxW, viewBoxH);

  const head = `<svg xmlns="${root.xmlns}" viewBox="${root.viewBox}">`;
  const title = `<title>${deriveTitle(renderSpec.asset_id, renderSpec.recipe_id)}</title>`;
  const desc = `<desc>${deriveDesc(renderSpec.asset_id, renderSpec.recipe_id)}</desc>`;

  const groups = renderSpec.components
    .map((component) => buildGroup(renderSpec.asset_id, component, viewBoxW, viewBoxH, style))
    .join("");

  return `${head}${title}${desc}${groups}</svg>\n`;
}

/**
 * Build one `<g>` element for a component.
 */
function buildGroup(
  assetId: string,
  component: Component,
  viewBoxW: number,
  viewBoxH: number,
  style: StyleSpec,
): string {
  const groupId = `${assetId}_${component.component}`;
  const shapeId = `${groupId}_${component.role}`;
  const shapeEl = buildShapeElement(component, shapeId, viewBoxW, viewBoxH, style);
  return `<g id="${groupId}">${shapeEl}</g>`;
}

/**
 * Build the shape element inside a `<g>`. SVG attributes are
 * ordered canonically — the byte sequence is part of the
 * determinism contract.
 */
function buildShapeElement(
  component: Component,
  shapeId: string,
  viewBoxW: number,
  viewBoxH: number,
  style: StyleSpec,
): string {
  const shape = component.shape;
  switch (shape.shape) {
    case "rect": {
      const x = shape.x * viewBoxW;
      const y = shape.y * viewBoxH;
      const w = shape.w * viewBoxW;
      const h = shape.h * viewBoxH;
      const rx = shape.corner_radius * viewBoxW;
      const paintAttr = buildPaintAttributes(component.paint, style);
      return `<rect id="${shapeId}" x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" rx="${fmt(rx)}"${paintAttr}/>`;
    }
    case "ellipse": {
      const cx = shape.cx * viewBoxW;
      const cy = shape.cy * viewBoxH;
      const rx = shape.rx * viewBoxW;
      const ry = shape.ry * viewBoxH;
      const paintAttr = buildPaintAttributes(component.paint, style);
      return `<ellipse id="${shapeId}" cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(rx)}" ry="${fmt(ry)}"${paintAttr}/>`;
    }
    case "path": {
      const d = pointsToPathD(
        shape.points as ReadonlyArray<readonly [number, number]>,
        shape.closed,
        viewBoxW,
        viewBoxH,
      );
      const paintAttr = buildPaintAttributes(component.paint, style);
      return `<path id="${shapeId}" d="${d}"${paintAttr}/>`;
    }
    case "polyline": {
      const pointsStr = pointsToPolylinePointsAttr(
        shape.points as ReadonlyArray<readonly [number, number]>,
        viewBoxW,
        viewBoxH,
      );
      const paintAttr = buildPaintAttributes(component.paint, style);
      return `<polyline id="${shapeId}" points="${pointsStr}"${paintAttr}/>`;
    }
    case "polystar": {
      const d = polystarPathD(
        shape.cx,
        shape.cy,
        shape.points_count,
        shape.r_outer,
        shape.r_inner,
        shape.rotation_deg,
        viewBoxW,
        viewBoxH,
      );
      const paintAttr = buildPaintAttributes(component.paint, style);
      return `<path id="${shapeId}" d="${d}"${paintAttr}/>`;
    }
    default: {
      const _exhaustive: never = shape;
      throw new Error(`unknown shape discriminator: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Convert a normalized point array to an SVG `path` `d` string.
 * Path closes per the `closed` flag (closes back to the first
 * vertex with a `Z`). Polyline uses this with `closed: false`.
 */
function pointsToPathD(
  points: ReadonlyArray<readonly [number, number]>,
  closed: boolean,
  viewBoxW: number,
  viewBoxH: number,
): string {
  if (points.length === 0) return "";
  const first = points[0];
  if (first === undefined) return "";
  const parts: string[] = [`M${fmt(first[0] * viewBoxW)},${fmt(first[1] * viewBoxH)}`];
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    if (p === undefined) continue;
    parts.push(`L${fmt(p[0] * viewBoxW)},${fmt(p[1] * viewBoxH)}`);
  }
  if (closed) parts.push("Z");
  return parts.join("");
}

/**
 * Convert a normalized point array to an SVG `polyline` `points`
 * attribute (space-separated "x,y" pairs).
 */
function pointsToPolylinePointsAttr(
  points: ReadonlyArray<readonly [number, number]>,
  viewBoxW: number,
  viewBoxH: number,
): string {
  return points.map((p) => `${fmt(p[0] * viewBoxW)},${fmt(p[1] * viewBoxH)}`).join(" ");
}

/**
 * Build an SVG `path` `d` string for a polystar. The lottie
 * algorithm: outer + inner radii alternating, `2 × points_count`
 * vertices total. SVG is purely cosmetic for the static
 * companion — the path description is geometrically equivalent
 * to the Lottie `sr` emission.
 */
function polystarPathD(
  cxNorm: number,
  cyNorm: number,
  pointsCount: number,
  rOuterNorm: number,
  rInnerNorm: number,
  rotationDeg: number,
  viewBoxW: number,
  viewBoxH: number,
): string {
  const refSize = Math.min(viewBoxW, viewBoxH);
  const cx = cxNorm * viewBoxW;
  const cy = cyNorm * viewBoxH;
  const rOuterPx = rOuterNorm * refSize;
  const rInnerPx = rInnerNorm * refSize;
  const thetaBase = (rotationDeg * Math.PI) / 180;
  const startAngle = -Math.PI / 2 + thetaBase; // top of the star by default
  const totalVertices = 2 * pointsCount;
  const parts: string[] = [];
  for (let i = 0; i < totalVertices; i += 1) {
    const radius = i % 2 === 0 ? rOuterPx : rInnerPx;
    const angle = startAngle + (i * Math.PI) / pointsCount;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    if (i === 0) {
      parts.push(`M${fmt(x)},${fmt(y)}`);
    } else {
      parts.push(`L${fmt(x)},${fmt(y)}`);
    }
  }
  parts.push("Z");
  return parts.join("");
}

/**
 * Build the paint attributes for a shape element. The fill
 * variant emits a `fill="#RRGGBB"` attribute (D-16 — concrete
 * palette for poster parity); the stroke variant emits
 * `stroke="#RRGGBB"` + `stroke-width="<px>"` (D-14).
 */
function buildPaintAttributes(paint: Paint, style: StyleSpec): string {
  if (paint.kind === "fill") {
    return ` fill="${paint.color}"`;
  }
  const widthPx = style.stroke_widths[paint.stroke_width_token];
  return ` stroke="${paint.color}" stroke-width="${fmt(widthPx)}"`;
}
