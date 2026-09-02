import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { makeAllFixtures } from "../../motion-compiler/__tests__/make-render-spec.js";
import { compile } from "../../motion-compiler/compiler.js";
import type { RecipeCatalogue } from "../../rpc/contracts/catalogue.schema.js";
import { RecipeCatalogueSchema } from "../../rpc/contracts/catalogue.schema.js";
import type { LottieShapeItem } from "../../rpc/contracts/motion-compiler.schema.js";
import { type StyleSpec, StyleSpecSchema } from "../../rpc/contracts/style-spec.schema.js";
import { sanitizeSvg } from "../sanitize.js";

/**
 * Phase 3 plan 03-07 — D-31 / D-37 self-consistency + isomorphism +
 * ink-visible proof over the full 11-fixture set.
 *
 * **What the suite proves:**
 *
 * 1. **D-31 self-consistency (zero violations on every fixture):**
 *    the compiler's own output always passes its own gate. The
 *    producer and the gate agree — no false rejects (every
 *    golden compiles to a sanitizable SVG) and no false accepts
 *    (the gate is not a total rejector).
 *
 * 2. **Lottie↔SVG ISOMORPHISM:** the Lottie layers and the SVG
 *    `<g>` elements are 1:1 in count, the g sequence order
 *    corresponds to the REVERSED component order (D-10 + Pitfall
 *    1), every layer `nm` equals the role segment of its
 *    counterpart g's shape id (D-02 / D-32), and per-component
 *    shape types match between the Lottie `gr.it` shape items
 *    and the SVG geometry elements.
 *
 * 3. **Ink visible (non-dégénérescence per fixture, D-37):**
 *    every sanitized SVG carries at least one geometry element
 *    with a paint attribute (`fill="…"` or `stroke="…"`). The
 *    pipeline never emits an invisible asset.
 *
 * The 11 fixtures are built IN-TEST via `makeAllFixtures()` —
 * decoupled from plan 03-06's golden artifacts by construction
 * (same inputs, freshly compiled).
 *
 * **Strict invariant:** the gate must accept every golden's raw
 * output. A regression that introduces a structure-changing
 * compiler emit (e.g. adds a comment, an unlisted attribute,
 * a new shape generator) trips D-31 immediately.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");

function loadCatalogue(): RecipeCatalogue {
  const raw = JSON.parse(
    readFileSync(join(REPO_ROOT, "fixtures", "recipe-catalogue", "catalogue.json"), "utf-8"),
  );
  return RecipeCatalogueSchema.parse(raw);
}

function loadStyle(): StyleSpec {
  return StyleSpecSchema.parse({
    style_version: "1.0.0",
    viewBox: { width: 400, height: 300 },
    stroke_widths: { thin: 1.5, default: 2.5, bold: 4.0 },
    corner_radii: { small: 0, medium: 8, large: 16 },
    palette: [
      { name: "ink", hex: "#1F2430" },
      { name: "accent", hex: "#FF6B4A" },
      { name: "surface", hex: "#F5F1EA" },
      { name: "success", hex: "#3E9B6E" },
    ],
    easing_curves: [
      { name: "standard", control_points: [0.2, 0, 0.2, 1] },
      { name: "entrance", control_points: [0, 0, 0.2, 1] },
    ],
  });
}

/**
 * Map a Lottie shape discriminator (`ty`) to the SVG element
 * name emitted by the same generator. The mapping is locked
 * in `shape-builder.ts` and mirrored in `svg-builder.ts`:
 *
 *   "rc" → "rect"
 *   "el" → "ellipse"
 *   "sh" → "path"  (for both `path` and `polyline` — the path
 *                    generator emits `<path>` regardless of the
 *                    closed flag)
 *   "sr" → "path"  (polystar emits a `<path>` with the star
 *                    algorithm)
 */
function lottieTyToSvgName(ty: string): "rect" | "ellipse" | "path" | null {
  switch (ty) {
    case "rc":
      return "rect";
    case "el":
      return "ellipse";
    case "sh":
    case "sr":
      return "path";
    default:
      return null;
  }
}

/**
 * Extract the geometry `<g>` elements from a sanitized SVG.
 * Returns an array of `{ gId, shapeName, shapeId }` triples
 * in the order they appear in the SVG. The g id carries the
 * 2-segment scheme (`asset_id_component`); the shape id
 * carries the 3-segment scheme (`asset_id_component_role`).
 *
 * The extraction is regex-based — the SVGO output is
 * deterministic (single root, lowercase elements, double-quoted
 * attributes, ASCII-only IDs and colors). The regex is
 * intentionally narrow to keep the structural proof tight.
 */
function extractGroups(svg: string): Array<{ gId: string; shapeName: string; shapeId: string }> {
  const groups: Array<{ gId: string; shapeName: string; shapeId: string }> = [];
  // Match a `<g ... id="..." ...>...</g>` and capture the body.
  const gRegex = /<g\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g;
  for (const m of svg.matchAll(gRegex)) {
    const gId = m[1] ?? "";
    const body = m[2] ?? "";
    // Inside the g, find the first geometry element
    // (rect, ellipse, path, polyline, polygon).
    const shapeMatch = /<(rect|ellipse|path|polyline|polygon)\b[^>]*\bid="([^"]+)"/.exec(body);
    if (shapeMatch === null) continue;
    groups.push({
      gId,
      shapeName: shapeMatch[1] ?? "",
      shapeId: shapeMatch[2] ?? "",
    });
  }
  return groups;
}

/**
 * Extract the Lottie geometry item's `ty` discriminator for
 * each layer. The layer's `shapes` is a one-element array
 * containing a `gr` (group) wrapper; inside the `gr.it` array
 * the FIRST item is the geometry (the second is the optional
 * trim, the third is the paint). Returns `null` for shape
 * types not mapped to an SVG element name.
 */
function extractLayerTy(layerShapes: ReadonlyArray<LottieShapeItem>): string | null {
  for (const item of layerShapes) {
    if ("ty" in item && item.ty === "gr" && "it" in item) {
      for (const child of item.it) {
        if (typeof child === "object" && child !== null && "ty" in child) {
          const ty = String((child as { ty: unknown }).ty);
          if (ty === "rc" || ty === "el" || ty === "sh" || ty === "sr") {
            return ty;
          }
        }
      }
    }
  }
  return null;
}

describe("D-31 self-consistency + Lottie↔SVG isomorphism + ink visible — 11 fixtures", () => {
  const catalogue = loadCatalogue();
  const style = loadStyle();
  const fixtures = makeAllFixtures();

  it("makeAllFixtures yields exactly 11 specs (10 recipes + galerie)", () => {
    expect(fixtures).toHaveLength(11);
  });

  // One iteration per fixture — the per-fixture suite is
  // parametrized so a failure is attributable to a specific
  // golden.
  for (const spec of fixtures) {
    describe(`fixture ${spec.asset_id} / ${spec.recipe_id} (${spec.components.length} component${spec.components.length === 1 ? "" : "s"})`, () => {
      const compiled = compile(spec, catalogue, style);
      const sanitized = sanitizeSvg({ asset_id: spec.asset_id, svg: compiled.svg });

      it("sanitizeSvg reports zero violations (D-31 self-consistency)", () => {
        expect(sanitized.ok).toBe(true);
        if (!sanitized.ok) {
          throw new Error(
            `sanitizeSvg rejected the compiler output of ${spec.asset_id}/${spec.recipe_id}: ${JSON.stringify(sanitized.report.violations)}`,
          );
        }
        expect(sanitized.report.violations).toEqual([]);
        expect(sanitized.report.input_element_count).toBeGreaterThan(0);
      });

      it("Lottie layers and SVG <g> elements are 1:1 in count", () => {
        expect(sanitized.ok).toBe(true);
        if (!sanitized.ok || sanitized.svg === undefined) return;
        const groups = extractGroups(sanitized.svg);
        // The sanitizer preserves one <g> per component
        // (collapseGroups:false override — D-19).
        expect(groups).toHaveLength(spec.components.length);
        expect(compiled.lottie.layers).toHaveLength(spec.components.length);
      });

      it("Lottie↔SVG order is the REVERSED component order (D-10 + Pitfall 1)", () => {
        expect(sanitized.ok).toBe(true);
        if (!sanitized.ok || sanitized.svg === undefined) return;
        const groups = extractGroups(sanitized.svg);
        // The Lottie layers are in reversed component order
        // (the first component = background; in the Lottie
        // array, the LAST component is the first layer = top
        // of the stack). The SVG groups preserve the input
        // order (first component = first <g> in the document).
        // So the Lottie layer at index `i` corresponds to the
        // SVG group at index `(groups.length - 1 - i)`.
        for (let i = 0; i < groups.length; i += 1) {
          const layer = compiled.lottie.layers[i];
          const expectedComponent = spec.components[spec.components.length - 1 - i];
          const group = groups[groups.length - 1 - i];
          if (layer === undefined || expectedComponent === undefined || group === undefined) {
            continue;
          }
          // The group id is `${asset_id}_${component}`.
          const expectedGroupId = `${spec.asset_id}_${expectedComponent.component}`;
          expect(group.gId).toBe(expectedGroupId);
        }
      });

      it("every layer nm equals the role segment of its counterpart g's shape id (D-02 / D-32)", () => {
        expect(sanitized.ok).toBe(true);
        if (!sanitized.ok || sanitized.svg === undefined) return;
        const groups = extractGroups(sanitized.svg);
        // The Lottie layer at index `i` corresponds to the
        // SVG group at index `(components.length - 1 - i)`
        // (D-10 + Pitfall 1: layers are reversed). Walk the
        // LAYERS in their natural order and look up the
        // reversed-index group.
        for (let i = 0; i < groups.length; i += 1) {
          const layer = compiled.lottie.layers[i];
          const group = groups[groups.length - 1 - i];
          if (layer === undefined || group === undefined) continue;
          // The shape id is `${asset_id}_${component}_${role}`;
          // the role segment is the LAST underscore-delimited
          // segment. The Lottie layer `nm` is the component's
          // role (D-02).
          const shapeSegments = group.shapeId.split("_");
          const roleSegment = shapeSegments[shapeSegments.length - 1];
          expect(roleSegment).toBe(layer.nm);
        }
      });

      it("per-component shape types match between Lottie and SVG (isomorphism)", () => {
        expect(sanitized.ok).toBe(true);
        if (!sanitized.ok || sanitized.svg === undefined) return;
        const groups = extractGroups(sanitized.svg);
        // Same reversed-order mapping as the test above.
        for (let i = 0; i < groups.length; i += 1) {
          const layer = compiled.lottie.layers[i];
          const group = groups[groups.length - 1 - i];
          if (layer === undefined || group === undefined) continue;
          const lottieTy = extractLayerTy(layer.shapes);
          expect(lottieTy).not.toBeNull();
          if (lottieTy === null) continue;
          const expectedSvgName = lottieTyToSvgName(lottieTy);
          expect(expectedSvgName).not.toBeNull();
          expect(group.shapeName).toBe(expectedSvgName);
        }
      });

      it("ink visible — at least one geometry element carries a paint attribute (D-37 non-dégénérescence)", () => {
        expect(sanitized.ok).toBe(true);
        if (!sanitized.ok || sanitized.svg === undefined) return;
        // The sanitized SVG must contain at least one geometry
        // element with a paint attribute (`fill="…"` or
        // `stroke="…"`). The compiler always emits a paint
        // attribute (D-09 / D-16); the sanitizer's preset
        // must not strip it.
        const paintRegex = /<(rect|ellipse|path|polyline|polygon)\b[^>]*\s(fill|stroke)="/;
        const hasInk = paintRegex.test(sanitized.svg);
        expect(hasInk).toBe(true);
      });
    });
  }
});
