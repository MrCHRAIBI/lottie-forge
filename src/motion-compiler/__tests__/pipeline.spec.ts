import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { compile } from "../../motion-compiler/compiler.js";
import { deriveDesc, deriveTitle, LOTTIE_SPEC_VERSION } from "../../motion-compiler/meta.js";
import { RecipeCatalogueSchema } from "../../rpc/contracts/catalogue.schema.js";
import { type RenderSpec, RenderSpecSchema } from "../../rpc/contracts/motion-compiler.schema.js";
import { type StyleSpec, StyleSpecSchema } from "../../rpc/contracts/style-spec.schema.js";
import { sanitizeSvg } from "../../svg-sanitizer/sanitize.js";

/**
 * Phase 3 TRACER — end-to-end seam test (plan 03-04).
 *
 * Proves the compile → re-validation → sanitize → stable-IDs
 * path on the real code. The architectural decisions validated
 * here are FINAL (not throwaway):
 *
 * - D-10 + Pitfall 1 — layers array = reversed components.
 * - D-02 — `nm` field carries the component role (theming anchor).
 * - D-32 — 2/3-segment ID scheme survives a roundtrip compile.
 * - D-18 — `<title>` / `<desc>` derive from `asset_id` + `recipe_id`.
 * - D-22 — viewBox present, width/height absent.
 * - D-09 — Lottie emit carries the neutral `[0.5, 0.5, 0.5]` fill.
 * - COM-03 — LottieJSON re-validation gate fires after compile.
 * - SAN-01..05 + D-31 — sanitizer gates pass with zero violations.
 *
 * The single test fixture (`a-001` / fade / 2 components rect+ellipse)
 * is built INLINE in the test, not committed as a fixture file —
 * the existing `fixtures/render-specs/fade.json` carries 1 component
 * (the 03-03 goldens are pinned at 1 component per recipe). The
 * 2-component variant proves the multi-layer path (D-10 inversion,
 * multi-layer `nm` assignment, 2-group SVG structure). The deviation
 * is documented in `03-04-SUMMARY.md`.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");

function loadCatalogue() {
  const raw = JSON.parse(
    readFileSync(join(REPO_ROOT, "fixtures", "recipe-catalogue", "catalogue.json"), "utf-8"),
  );
  return RecipeCatalogueSchema.parse(raw);
}

function loadStyle(): StyleSpec {
  // The committed YAML is the load-time authority (D-17 cross-ref).
  // Phase 3 mirrors the YAML structure into a StyleSpec directly
  // — the YAML loader is widened in plan 03-06 alongside the goldens.
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

/** 2-component fade fixture (rect+ellipse, roles primary+accent). */
function buildTracerFixture(): RenderSpec {
  return RenderSpecSchema.parse({
    asset_id: "a-001",
    recipe_id: "fade",
    style_ref: "example-style@1.0.0",
    components: [
      {
        component: "primary-rect",
        role: "primary",
        shape: {
          shape: "rect",
          x: 0.25,
          y: 0.25,
          w: 0.5,
          h: 0.5,
          corner_radius: 0.0625,
        },
        paint: { kind: "fill", color: "#1c57cb" },
      },
      {
        component: "accent-ellipse",
        role: "accent",
        shape: {
          shape: "ellipse",
          cx: 0.5,
          cy: 0.5,
          rx: 0.25,
          ry: 0.25,
        },
        paint: { kind: "fill", color: "#1c57cb" },
      },
    ],
    motion: { amplitude: 0.5, direction: "none", loops: 1 },
  });
}

describe("compile → re-validate → sanitize → stable IDs — a-001 (fade, rect+ellipse)", () => {
  const catalogue = loadCatalogue();
  const style = loadStyle();
  const spec = buildTracerFixture();

  const result = compile(spec, catalogue, style);

  it("layers array equals reversed components (D-10 + Pitfall 1)", () => {
    const names = result.lottie.layers.map((l) => l.nm);
    // Reversed components: [accent, primary] (the second component
    // becomes the first layer — first in array = top of stack).
    expect(names).toEqual(["accent", "primary"]);
  });

  it("every layer's nm equals its component role (D-02)", () => {
    for (const layer of result.lottie.layers) {
      // The component with role 'accent' (last in input) is
      // emitted as the first layer; the layer.nm matches the
      // component.role verbatim.
      expect(["accent", "primary"]).toContain(layer.nm);
    }
    // The reversed order makes the first layer the LAST
    // component in the input.
    expect(result.lottie.layers[0]?.nm).toBe("accent");
    expect(result.lottie.layers[1]?.nm).toBe("primary");
  });

  it("LottieJSON re-validation gate fires (COM-03 — every emitted object passes)", () => {
    expect(result.lottie.v).toBe(LOTTIE_SPEC_VERSION);
    expect(result.lottie.fr).toBe(60);
    expect(result.lottie.ddd).toBe(0);
    expect(result.lottie.assets).toEqual([]);
    expect(result.lottie.layers.length).toBeGreaterThanOrEqual(1);
    // op computed from fade duration_ms=800 → 800 * 60 / 1000 = 48.
    expect(result.lottie.op).toBe(48);
    expect(result.lottie.ip).toBe(0);
  });

  it("the Lottie emit carries the neutral [0.5, 0.5, 0.5] fill (D-09, Pitfall 8)", () => {
    for (const layer of result.lottie.layers) {
      for (const item of layer.shapes) {
        if (item.ty === "gr") {
          for (const child of item.it) {
            // The LottieJSONSchema permits any shape item variant
            // inside `gr.it` (the schema is `z.array(z.unknown())`
            // — permissive by design). Narrow via a runtime check
            // on the discriminator `ty === "fl"`.
            if (
              typeof child === "object" &&
              child !== null &&
              "ty" in child &&
              (child as { ty: unknown }).ty === "fl"
            ) {
              const fl = child as { ty: "fl"; c: readonly number[]; o: number };
              // D-09 — neutral fill for stylable zones; the
              // Lottie `setTheme` needs headroom in every channel.
              expect(fl.c).toEqual([0.5, 0.5, 0.5]);
              expect(fl.o).toBe(100); // Pitfall 2 unit gate
            }
          }
        }
      }
    }
  });

  it("SVG companion has no width/height on root (D-22 viewBox-only)", () => {
    // The raw SVG emitted by the compiler carries the canonical
    // `<svg xmlns="…" viewBox="…">` root without `width` / `height`.
    const rootTag = result.svg.match(/<svg[^>]*>/);
    expect(rootTag).not.toBeNull();
    if (rootTag === null) return;
    const rootStr = rootTag[0];
    expect(rootStr).toContain(`viewBox="0 0 ${style.viewBox.width} ${style.viewBox.height}"`);
    // Only the root <svg> must NOT carry width/height — child
    // elements like <rect width="..."> are perfectly fine.
    expect(rootStr).not.toMatch(/\swidth=/);
    expect(rootStr).not.toMatch(/\sheight=/);
  });

  it("SVG title/desc derive from asset_id + recipe_id only (D-18)", () => {
    const expectedTitle = deriveTitle(spec.asset_id, spec.recipe_id);
    const expectedDesc = deriveDesc(spec.asset_id, spec.recipe_id);
    expect(result.svg).toContain(`<title>${expectedTitle}</title>`);
    expect(result.svg).toContain(`<desc>${expectedDesc}</desc>`);
    // No user-supplied text leakage — the SVG cannot carry text
    // outside the deterministic derivation.
    expect(result.svg).not.toMatch(/<text[\s>]/);
    expect(result.svg).not.toMatch(/<tspan[\s>]/);
  });

  it("sanitizeSvg(raw) returns ok=true with zero violations (SAN-01..05, D-31, D-32)", () => {
    const sanitized = sanitizeSvg({ asset_id: spec.asset_id, svg: result.svg });
    expect(sanitized.ok).toBe(true);
    expect(sanitized.report.violations).toEqual([]);
    if (sanitized.ok) {
      const svgText = sanitized.svg;
      expect(svgText).toBeDefined();
      if (svgText === undefined) return;
      // viewBox + title + desc survive the SVGO optimize (ADR-02).
      expect(svgText).toContain("viewBox=");
      expect(svgText).toContain("<title>");
      expect(svgText).toContain("<desc>");
      // Root <svg> has no width/height — the regex must match the
      // root tag only, not the `<rect width="…">` children.
      const rootTag = svgText.match(/<svg[^>]*>/);
      expect(rootTag).not.toBeNull();
      if (rootTag !== null) {
        const rootStr = rootTag[0];
        expect(rootStr).not.toMatch(/\swidth=/);
        expect(rootStr).not.toMatch(/\sheight=/);
      }
    }
  });

  it("two compiles of the same spec yield byte-identical outputs (COM-01)", () => {
    const second = compile(spec, catalogue, style);
    // Lottie JSON — byte-identical at the JSON.stringify level.
    expect(JSON.stringify(second.lottie)).toBe(JSON.stringify(result.lottie));
    // SVG — byte-identical at the string level.
    expect(second.svg).toBe(result.svg);
  });

  it("sanitizing the second compile produces the same sanitized SVG (idempotence, D-23)", () => {
    const second = compile(spec, catalogue, style);
    const sanitized1 = sanitizeSvg({ asset_id: spec.asset_id, svg: result.svg });
    const sanitized2 = sanitizeSvg({ asset_id: spec.asset_id, svg: second.svg });
    expect(sanitized1.ok).toBe(true);
    expect(sanitized2.ok).toBe(true);
    if (sanitized1.ok && sanitized2.ok) {
      expect(sanitized1.svg).toBe(sanitized2.svg);
    }
  });

  it("the SVG carries one <g> per component with the 2-segment ID (D-19, D-32)", () => {
    const groups = result.svg.match(/<g id="([^"]+)">/g);
    expect(groups).not.toBeNull();
    if (groups === null) return;
    const groupIds = groups.map((g) => g.match(/id="([^"]+)"/)?.[1]).filter(Boolean);
    expect(groupIds).toContain("a-001_primary-rect");
    expect(groupIds).toContain("a-001_accent-ellipse");
  });

  it("the shape elements inside each <g> carry the 3-segment ID (D-32)", () => {
    // 2-segment g IDs + 3-segment shape IDs.
    const shapeIds = Array.from(result.svg.matchAll(/<(?:rect|ellipse) id="([^"]+)"/g))
      .map((m) => m[1])
      .filter((id): id is string => Boolean(id));
    // Each shape ID has 3 segments.
    for (const id of shapeIds) {
      expect(id.split("_").length).toBe(3);
      expect(id.startsWith("a-001_")).toBe(true);
    }
    expect(shapeIds).toContain("a-001_primary-rect_primary");
    expect(shapeIds).toContain("a-001_accent-ellipse_accent");
  });

  it("the rendered SVG is recognized as zero-element-rejected by the sanitizer (D-31)", () => {
    const sanitized = sanitizeSvg({ asset_id: spec.asset_id, svg: result.svg });
    if (!sanitized.ok) {
      throw new Error(
        `sanitize unexpectedly rejected clean compile: ${JSON.stringify(sanitized.report.violations)}`,
      );
    }
    expect(sanitized.report.violations).toHaveLength(0);
    expect(sanitized.report.input_element_count).toBeGreaterThan(0);
  });
});

describe("sanitizer rejection paths — adversarial SVG fragments", () => {
  const assetId = "a-099";

  it("rejects <text> with sanitize_rejected (SAN-01)", () => {
    const result = sanitizeSvg({
      asset_id: assetId,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><text x="10" y="20">hello</text></svg>`,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.report.violations.some((v) => v.category === "forbidden-text")).toBe(true);
      expect(result.code).toBe("sanitize_rejected");
    }
  });

  it("rejects <tspan> with sanitize_rejected (SAN-01)", () => {
    const result = sanitizeSvg({
      asset_id: assetId,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><text><tspan>world</tspan></text></svg>`,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.report.violations.some((v) => v.category === "forbidden-text")).toBe(true);
    }
  });

  it("rejects <image> with sanitize_rejected (SAN-02)", () => {
    const result = sanitizeSvg({
      asset_id: assetId,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><image href="x.png"/></svg>`,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.report.violations.some((v) => v.category === "forbidden-raster")).toBe(true);
    }
  });

  it("rejects <foreignObject> with sanitize_rejected (SAN-05)", () => {
    const result = sanitizeSvg({
      asset_id: assetId,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><foreignObject><div/></foreignObject></svg>`,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.report.violations.some((v) => v.category === "forbidden-foreignobject")).toBe(
        true,
      );
    }
  });

  it("rejects <script> with sanitize_rejected (SAN-05)", () => {
    const result = sanitizeSvg({
      asset_id: assetId,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><script>alert(1)</script></svg>`,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.report.violations.some((v) => v.category === "forbidden-script")).toBe(true);
    }
  });

  it("rejects event-handler attributes with sanitize_rejected (SAN-05)", () => {
    const result = sanitizeSvg({
      asset_id: assetId,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect onclick="alert(1)"/></svg>`,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.report.violations.some((v) => v.category === "forbidden-handler")).toBe(true);
    }
  });

  it("rejects javascript: URIs with sanitize_rejected (SAN-05)", () => {
    const result = sanitizeSvg({
      asset_id: assetId,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><a href="javascript:alert(1)"><rect/></a></svg>`,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.report.violations.some((v) => v.category === "forbidden-handler")).toBe(true);
    }
  });

  it("rejects width/height on the root <svg> with sanitize_rejected (D-22)", () => {
    const result = sanitizeSvg({
      asset_id: assetId,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300"/>`,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.report.violations.some((v) => v.category === "forbidden-dimension")).toBe(true);
    }
  });

  it("rejects data-* attributes with sanitize_rejected (D-31)", () => {
    const result = sanitizeSvg({
      asset_id: assetId,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect data-foo="bar"/></svg>`,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.report.violations.some((v) => v.category === "forbidden-data-attribute")).toBe(
        true,
      );
    }
  });

  it("rejects XML comments with sanitize_rejected (D-31)", () => {
    const result = sanitizeSvg({
      asset_id: assetId,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><!-- secret --><rect/></svg>`,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.report.violations.some((v) => v.category === "forbidden-comment")).toBe(true);
    }
  });
});
