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
 *   structure 1:1 (theming in Phase 4/8 finds the same anchors
 *   on both surfaces).
 *
 * - D-20 — pure template strings (no XMLSerializer, no SVGO
 *   emission, no external dependencies). The byte sequence is
 *   the contract — every attribute is hand-written in canonical
 *   order; every escape is statically bounded (the only dynamic
 *   content is the integer viewBox dimensions, the deterministic
 *   IDs, the deterministic hex colors, and the deterministic
 *   numeric attributes).
 *
 * - D-22 — viewBox-only regime. The `<svg>` root carries
 *   `xmlns` and `viewBox`; no `width`, no `height`. Responsive
 *   sizing comes from the consumer's CSS.
 *
 * - D-32 — shape elements inside each `<g>` carry the 3-segment
 *   ID `{asset_id}_{component}_{role}`. The `stabilize-ids`
 *   sanitizer plugin asserts the prefix matches the parent's
 *   `{asset_id}_{component}`.
 *
 * **Pure module, zero I/O.** The compiler orchestrator is the
 * single caller. The SVG output is byte-stable across
 * invocations of the same `CompileResult` — D-23/D-24 regime.
 */

import type { Component, Paint, RenderSpec } from "../rpc/contracts/motion-compiler.schema.js";
import type { StyleSpec } from "../rpc/contracts/style-spec.schema.js";
import { fmt } from "../shared/format.js";
import { deriveDesc, deriveTitle, svgRootAttributes } from "./meta.js";

/**
 * Build the SVG companion string for a `CompileResult`.
 *
 * @param renderSpec - the source `RenderSpec` (carries the
 *                     components, the asset_id, the recipe_id).
 * @param style      - the loaded StyleSpec (carries viewBox + the
 *                     stroke-width token → pixel mapping).
 * @returns the SVG string, terminated with exactly one `\n` byte
 *          (D-24 compact + LF termination, mirror of the Lottie
 *          goldens regime).
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
 * Build one `<g>` element for a component. The group's `id`
 * carries the 2-segment prefix (D-32). The shape element inside
 * carries the 3-segment ID (D-32).
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
 * Build the shape element (`<rect>` or `<ellipse>`) inside a
 * `<g>`. SVG attributes are ordered canonically (`id`, `x`, `y`,
 * `width`, `height`, `rx` / `cx`, `cy`, `rx`, `ry`, `fill` /
 * `stroke`, `stroke-width`) — the byte sequence is part of the
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
    case "path":
    case "polyline":
    case "polystar":
      throw new Error(
        `shape generator '${shape.shape}' is not yet implemented in svg-builder (widened in plan 03-05)`,
      );
    default: {
      const _exhaustive: never = shape;
      throw new Error(`unknown shape discriminator: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Build the paint attributes for a shape element. The fill
 * variant emits a `fill="#RRGGBB"` attribute (D-16 — concrete
 * palette for poster parity); the stroke variant emits
 * `stroke="#RRGGBB"` + `stroke-width="<px>"` (D-14 — token
 * resolution).
 */
function buildPaintAttributes(paint: Paint, style: StyleSpec): string {
  if (paint.kind === "fill") {
    return ` fill="${paint.color}"`;
  }
  const widthPx = style.stroke_widths[paint.stroke_width_token];
  return ` stroke="${paint.color}" stroke-width="${fmt(widthPx)}"`;
}
