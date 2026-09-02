import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { compile } from "../../motion-compiler/compiler.js";
import type { RecipeCatalogue } from "../../rpc/contracts/catalogue.schema.js";
import { RecipeCatalogueSchema } from "../../rpc/contracts/catalogue.schema.js";
import { RenderSpecSchema } from "../../rpc/contracts/motion-compiler.schema.js";
import { type StyleSpec, StyleSpecSchema } from "../../rpc/contracts/style-spec.schema.js";
import { buildSanitizerConfig, SANITIZER_PLUGIN_ORDER } from "../config.js";
import { sanitizeSvg } from "../sanitize.js";

/**
 * Phase 3 plan 03-07 — SVGO 4 regression suite (SAN-04, ADR-02).
 *
 * The test locks the SVGO 4 configuration against future drift
 * (Pitfall 5 + Pitfall 6 of `03-RESEARCH.md`). Three classes of
 * assertion:
 *
 * **1. Byte-stability across the optimize pass** — for a
 * representative compiler output, the SVGO 4 optimize pass must
 * preserve:
 *
 *   - `viewBox` (root attribute)
 *   - `<title>` (a11y, derived from `asset_id` + `recipe_id` — D-18)
 *   - `<desc>`  (a11y, same derivation — D-18)
 *   - The `id` of every input element UNCHANGED
 *     (cleanupIds:false override proven load-bearing — Pitfall 6)
 *   - The absence of `width` / `height` on the root `<svg>` (D-22)
 *
 * **2. Config-shape guard** — the locked SVGO 4 config must
 * continue to disable `removeDesc`, `cleanupIds`, `collapseGroups`,
 * AND must NOT re-add `removeViewBox` / `removeTitle` plugin
 * entries (those plugins are ABSENT from SVGO 4's preset-default
 * — re-adding them would RE-ACTIVATE the v3 behavior, the
 * inverse of intent).
 *
 * **3. Plugin-order guard** — `SANITIZER_PLUGIN_ORDER` matches
 * the array the orchestrator builds. A future reorder fails loud.
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

function buildFixture() {
  return RenderSpecSchema.parse({
    asset_id: "a-001",
    recipe_id: "fade",
    style_ref: "example-style@1.0.0",
    components: [
      {
        component: "primary-rect",
        role: "primary",
        shape: { shape: "rect", x: 0.25, y: 0.25, w: 0.5, h: 0.5, corner_radius: 0.0625 },
        paint: { kind: "fill", color: "#1c57cb" },
      },
    ],
    motion: { amplitude: 0.5, direction: "none", loops: 1 },
  });
}

describe("SVGO 4 regression — SAN-04 (ADR-02: viewBox + title + desc + IDs survive optimize)", () => {
  const catalogue = loadCatalogue();
  const style = loadStyle();
  const spec = buildFixture();
  const compiled = compile(spec, catalogue, style);
  const sanitized = sanitizeSvg({ asset_id: spec.asset_id, svg: compiled.svg });

  it("sanitizeSvg accepts the compiler output as ok=true (D-31 self-consistency on a-001)", () => {
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) {
      throw new Error(
        `sanitizeSvg rejected a clean compiler output: ${JSON.stringify(sanitized.report.violations)}`,
      );
    }
  });

  it("viewBox survives the SVGO optimize pass (SAN-04 / ADR-02)", () => {
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;
    // The viewBox attribute on the root <svg> must survive.
    expect(sanitized.svg).toMatch(/viewBox=/);
    // And the value must be the StyleSpec viewBox (no
    // mutation to the canonical `0 0 400 300` form).
    expect(sanitized.svg).toContain(`viewBox="0 0 ${style.viewBox.width} ${style.viewBox.height}"`);
  });

  it("<title> survives the SVGO optimize pass (D-18 a11y)", () => {
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;
    // The <title> element must survive the optimize pass —
    // SVGO 4's preset-default would NOT remove title (the
    // v3→v4 migration removed `removeTitle` from the
    // preset), but the test pins the behavior for future
    // versions.
    expect(sanitized.svg).toContain("<title>");
  });

  it("<desc> survives the SVGO optimize pass (D-18 a11y, removeDesc override proven — Pitfall 5)", () => {
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;
    // The <desc> element must survive the optimize pass. SVGO
    // 4's preset-default STILL contains `removeDesc`; the
    // locked config disables it via `removeDesc: false`. The
    // override is load-bearing — without it, <desc> would be
    // silently removed (Pitfall 5).
    expect(sanitized.svg).toContain("<desc>");
  });

  it("root <svg> carries NO width/height after optimize (D-22 preserved)", () => {
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok || sanitized.svg === undefined) return;
    // The root <svg> tag must not carry width/height (the
    // viewBox-only regime, D-22). The regex matches the
    // root tag only — child <rect width="…"> elements are
    // perfectly fine.
    const rootTag = sanitized.svg.match(/<svg\b[^>]*>/);
    expect(rootTag).not.toBeNull();
    if (rootTag === null) return;
    const rootStr = rootTag[0];
    expect(rootStr).not.toMatch(/\swidth=/);
    expect(rootStr).not.toMatch(/\sheight=/);
  });

  it("every input id survives UNCHANGED in the output (cleanupIds override — Pitfall 6)", () => {
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok || sanitized.svg === undefined) return;
    // Extract every id from the raw compiler SVG and assert
    // each one is present UNCHANGED in the sanitized output.
    // The raw compiler SVG uses the locked 2/3-segment scheme
    // (D-32); cleanupIds would rename them to single letters
    // (`a`, `a-1`, ...). The override is load-bearing.
    const rawIds = Array.from(compiled.svg.matchAll(/\bid="([^"]+)"/g))
      .map((m: RegExpMatchArray) => m[1])
      .filter((id): id is string => Boolean(id));
    for (const id of rawIds) {
      expect(sanitized.svg).toContain(`id="${id}"`);
    }
    // The 2-segment g IDs + 3-segment shape IDs are exactly
    // what the compiler emitted — no shortened or renamed
    // forms.
    expect(sanitized.svg).toContain('id="a-001_primary-rect"');
    expect(sanitized.svg).toContain('id="a-001_primary-rect_primary"');
  });
});

describe("SVGO 4 regression — config-shape guard (ADR-02 overrides stay load-bearing)", () => {
  it("the locked config disables the three named overrides (removeDesc, cleanupIds, collapseGroups)", () => {
    // Build a config with the violation array as a no-op.
    const cfg = buildSanitizerConfig([], "a-001");
    const presetPlugin = cfg.plugins?.find(
      (p) => typeof p === "object" && p !== null && "name" in p && p.name === "preset-default",
    );
    expect(presetPlugin).toBeDefined();
    if (presetPlugin === undefined || typeof presetPlugin !== "object") return;
    const params = (presetPlugin as { params?: { overrides?: Record<string, unknown> } }).params;
    expect(params).toBeDefined();
    const overrides = params?.overrides;
    expect(overrides).toBeDefined();
    // The three named overrides must remain disabled.
    expect(overrides?.removeDesc).toBe(false);
    expect(overrides?.cleanupIds).toBe(false);
    expect(overrides?.collapseGroups).toBe(false);
  });

  it("the locked config does NOT re-add removeViewBox / removeTitle plugin entries (v4 preset already excludes them)", () => {
    // SVGO 4's preset-default ALREADY excludes `removeViewBox`
    // and `removeTitle` (the v3→v4 migration removed them).
    // Re-adding them as overrides would RE-ACTIVATE the v3
    // behavior — the inverse of intent. The locked config
    // must not include them.
    const cfg = buildSanitizerConfig([], "a-001");
    const pluginNames = (cfg.plugins ?? []).map((p) => {
      if (typeof p === "string") return p;
      if (typeof p === "object" && p !== null && "name" in p) {
        return String((p as { name: unknown }).name);
      }
      return "";
    });
    // The v3 plugins must NOT be added as explicit plugins
    // (the v4 preset does not contain them; adding them would
    // re-activate the v3 behavior).
    expect(pluginNames).not.toContain("removeViewBox");
    expect(pluginNames).not.toContain("removeTitle");
    // prefixIds is explicitly excluded (§6.4.2).
    expect(pluginNames).not.toContain("prefixIds");
  });

  it("SANITIZER_PLUGIN_ORDER constant matches the array the orchestrator builds (P5 / D-31 / D-32)", () => {
    // The normative plugin order. Collectors run first (gate
    // pass BEFORE mutation), preset-default in the middle,
    // stabilize-ids last (assertion on the compiler's ID
    // scheme). A future reorder breaks loud.
    expect([...SANITIZER_PLUGIN_ORDER]).toEqual([
      "forbid-text",
      "forbid-raster",
      "forbid-foreignobject",
      "forbid-structure",
      "preset-default",
      "stabilize-ids",
    ]);
    // The config array index MUST match the constant index —
    // the lockstep proof.
    const cfg = buildSanitizerConfig([], "a-001");
    const actualNames = (cfg.plugins ?? []).map((p) => {
      if (typeof p === "string") return p;
      if (typeof p === "object" && p !== null && "name" in p) {
        return String((p as { name: unknown }).name);
      }
      return "";
    });
    for (let i = 0; i < SANITIZER_PLUGIN_ORDER.length; i += 1) {
      expect(actualNames[i]).toBe(SANITIZER_PLUGIN_ORDER[i]);
    }
  });

  it("floatPrecision override is 4 (D-35 / D-22 fidelity with compiler fmt())", () => {
    const cfg = buildSanitizerConfig([], "a-001");
    expect(cfg.floatPrecision).toBe(4);
    expect(cfg.multipass).toBe(true);
  });
});
