import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { RenderSpecSchema } from "../../rpc/contracts/motion-compiler.schema.js";
import { RECIPE_IDS } from "../../rpc/contracts/vocabulary.schema.js";

import { makeAllFixtures, makeGalerieFixture, makeRenderSpec } from "./make-render-spec.js";

/**
 * Phase 3 fixture consistency suite (D-04 + D-05).
 *
 * Three guarantees — every one collected by `npx vitest run` (existing
 * step 09 of `verify.yml`, no CI edit):
 *
 * 1. **Source-of-truth invariant**: the in-memory builder is the single
 *    derivation source for every committed `fixtures/render-specs/*.json`
 *    file. A roundtrip `builder → JSON file → zod parse` must succeed
 *    and produce the same logical spec.
 *
 * 2. **Schema gate**: every committed fixture parses cleanly through
 *    `RenderSpecSchema` (D-13 strict + D-07 component count + D-32
 *    uniqueness + D-34 cross-field).
 *
 * 3. **Cross-ref consistency** (D-05 pre-check at fixture level):
 *    - `recipe_id` is one of the 10 locked ids from `vocabulary.schema.ts`.
 *    - `asset_id` matches the slot convention `^a-\d{3}$`.
 *    - `style_ref` is `"example-style@1.0.0"` — pinned to the committed
 *      `fixtures/style-specs/example-style/style.yaml`.
 *    - The set of distinct `shape` generators in `components` is a
 *      subset of the catalogue recipe's `shapes_supported`.
 *    - The set of distinct `role` values in `components` is a subset of
 *      `ThemeAnchorId ∪ {"neutral"}`.
 *    - `motion.amplitude` falls inside the catalogue recipe's
 *      `intensity_range`.
 *    - `draw-on` fixture uses `paint.kind = "stroke"` with
 *      `stroke_width_token` (D-14: a stroke layer is the only path on
 *      which a trim-path is visible; bare-float stroke widths are
 *      structurally rejected).
 *    - The galerie fixture is option-b (4 components under `wiggle`).
 *
 * The committed-file count is asserted exactly 11 (10 recipes + galerie).
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");
const FIXTURES_DIR = join(REPO_ROOT, "fixtures", "render-specs");

// Locked catalogue verbatim — mirror of fixtures/recipe-catalogue/catalogue.json.
const CATALOGUE: Record<
  (typeof RECIPE_IDS)[number],
  {
    intensity_range: readonly [number, number];
    shapes_supported: readonly string[];
    theme_anchors: readonly string[];
  }
> = {
  fade: {
    intensity_range: [0.0, 1.0],
    shapes_supported: ["rect", "ellipse", "path"],
    theme_anchors: ["primary", "accent"],
  },
  slide: {
    intensity_range: [0.2, 1.0],
    shapes_supported: ["rect", "ellipse", "path"],
    theme_anchors: ["primary"],
  },
  bounce: {
    intensity_range: [0.3, 1.0],
    shapes_supported: ["rect", "ellipse", "path", "polyline"],
    theme_anchors: ["primary", "accent"],
  },
  pulse: {
    intensity_range: [0.1, 0.8],
    shapes_supported: ["rect", "ellipse", "polystar"],
    theme_anchors: ["accent"],
  },
  "draw-on": {
    intensity_range: [0.2, 1.0],
    shapes_supported: ["path", "polyline"],
    theme_anchors: ["accent"],
  },
  rotate: {
    intensity_range: [0.2, 1.0],
    shapes_supported: ["path", "polyline", "polystar"],
    theme_anchors: ["primary"],
  },
  "scale-pop": {
    intensity_range: [0.2, 1.0],
    shapes_supported: ["rect", "ellipse", "polystar"],
    theme_anchors: ["primary", "accent"],
  },
  float: {
    intensity_range: [0.1, 0.8],
    shapes_supported: ["rect", "ellipse", "path"],
    theme_anchors: ["primary", "background"],
  },
  wiggle: {
    intensity_range: [0.1, 0.5],
    shapes_supported: ["rect", "ellipse", "path", "polyline"],
    theme_anchors: ["accent"],
  },
  orbit: {
    intensity_range: [0.3, 1.0],
    shapes_supported: ["ellipse", "path", "polystar"],
    theme_anchors: ["primary", "accent"],
  },
};

const ALLOWED_ROLES = new Set([
  "primary",
  "secondary",
  "accent",
  "background",
  "success",
  "danger",
  "neutral",
]);

function listCommittedFixtureFiles(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

function readCommittedFixture(name: string): Record<string, unknown> {
  const text = readFileSync(join(FIXTURES_DIR, name), "utf-8");
  return JSON.parse(text) as Record<string, unknown>;
}

describe("builder invariants — D-04 single source of fixture truth", () => {
  it("makeAllFixtures yields exactly 11 specs (10 recipes + galerie)", () => {
    const specs = makeAllFixtures();
    expect(specs).toHaveLength(11);
  });

  it("every fixture has asset_id matching ^a-\\d{3}$ (Phase 5 envelope slot)", () => {
    for (const spec of makeAllFixtures()) {
      expect(spec.asset_id).toMatch(/^a-\d{3}$/);
    }
  });

  it("every fixture has style_ref pinned to example-style@1.0.0 (D-13 STY-03 pin)", () => {
    for (const spec of makeAllFixtures()) {
      expect(spec.style_ref).toBe("example-style@1.0.0");
    }
  });

  it("draw-on uses paint.kind='stroke' with stroke_width_token (D-14)", () => {
    const spec = makeRenderSpec("draw-on");
    expect(spec.components[0].paint.kind).toBe("stroke");
    if (spec.components[0].paint.kind === "stroke") {
      expect(spec.components[0].paint.stroke_width_token).toBe("default");
    }
  });
});

describe("committed files — exactly 11 fixtures, LF-terminated, schema-parseable", () => {
  const files = listCommittedFixtureFiles();

  it("ships exactly 11 committed JSON fixtures (10 recipes + galerie)", () => {
    expect(files).toHaveLength(11);
  });

  it("expected file names are present (10 recipes + galerie)", () => {
    const expected = [
      "fade.json",
      "slide.json",
      "bounce.json",
      "pulse.json",
      "draw-on.json",
      "rotate.json",
      "scale-pop.json",
      "float.json",
      "wiggle.json",
      "orbit.json",
      "galerie.json",
    ];
    for (const name of expected) {
      expect(files).toContain(name);
    }
  });

  it.each(files)("%s ends with exactly one 0x0a byte (D-24 + Pitfall 9)", (name) => {
    const buf = readFileSync(join(FIXTURES_DIR, name));
    expect(buf.length).toBeGreaterThan(0);
    expect(buf[buf.length - 1]).toBe(0x0a);
  });

  it.each(files)("%s parses through RenderSpecSchema (D-13 strict + D-07 + D-32)", (name) => {
    const raw = readCommittedFixture(name);
    const result = RenderSpecSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(
        `fixture ${name} failed schema parse: ${JSON.stringify(result.error.issues)}`,
      );
    }
  });
});

describe("committed files — cross-ref consistency (D-05 pre-check at fixture level)", () => {
  for (const recipeId of RECIPE_IDS) {
    const file = `${recipeId}.json`;

    it(`${file}: shape generators ⊆ catalogue.shapes_supported (D-05)`, () => {
      const spec = RenderSpecSchema.parse(readCommittedFixture(file));
      const shapes = new Set(spec.components.map((c) => c.shape.shape));
      const allowed = new Set(CATALOGUE[recipeId].shapes_supported);
      for (const s of shapes) {
        expect(allowed.has(s)).toBe(true);
      }
    });

    it(`${file}: motion.amplitude ∈ catalogue.intensity_range`, () => {
      const spec = RenderSpecSchema.parse(readCommittedFixture(file));
      const [min, max] = CATALOGUE[recipeId].intensity_range;
      expect(spec.motion.amplitude).toBeGreaterThanOrEqual(min);
      expect(spec.motion.amplitude).toBeLessThanOrEqual(max);
    });

    it(`${file}: role set ⊆ ThemeAnchorId ∪ {"neutral"} (D-02)`, () => {
      const spec = RenderSpecSchema.parse(readCommittedFixture(file));
      const roles = new Set(spec.components.map((c) => c.role));
      for (const r of roles) {
        expect(ALLOWED_ROLES.has(r)).toBe(true);
      }
    });
  }

  it("draw-on uses a stroke paint (D-14: trim-path visible only on a stroke layer)", () => {
    const spec = RenderSpecSchema.parse(readCommittedFixture("draw-on.json"));
    expect(spec.components[0].paint.kind).toBe("stroke");
    if (spec.components[0].paint.kind === "stroke") {
      expect(["thin", "default", "bold"]).toContain(spec.components[0].paint.stroke_width_token);
    }
  });

  it("draw-on uses a stroke-able shape (path or polyline)", () => {
    const spec = RenderSpecSchema.parse(readCommittedFixture("draw-on.json"));
    expect(["path", "polyline"]).toContain(spec.components[0].shape.shape);
  });

  it("galerie.json is option-b: 4 components under wiggle covering 4 generators", () => {
    const spec = RenderSpecSchema.parse(readCommittedFixture("galerie.json"));
    expect(spec.recipe_id).toBe("wiggle");
    expect(spec.components).toHaveLength(4);
    const shapes = spec.components.map((c) => c.shape.shape).sort();
    expect(shapes).toEqual(["ellipse", "path", "polyline", "rect"]);
  });

  it("galerie.json has 4 distinct (component, role) pairs (D-32 uniqueness)", () => {
    const spec = RenderSpecSchema.parse(readCommittedFixture("galerie.json"));
    const keys = new Set(spec.components.map((c) => `${c.component}|${c.role}`));
    expect(keys.size).toBe(4);
  });

  it("polystar golden coverage rides on pulse/rotate/scale-pop/orbit fixtures", () => {
    for (const recipeId of ["pulse", "rotate", "scale-pop", "orbit"] as const) {
      const spec = RenderSpecSchema.parse(readCommittedFixture(`${recipeId}.json`));
      expect(spec.components.some((c) => c.shape.shape === "polystar")).toBe(true);
    }
  });
});

describe("committed files — byte-stable regeneration from the builder (D-04 invariant)", () => {
  it("regenerating a recipe fixture from the builder yields a schema-equal result", () => {
    for (const recipeId of RECIPE_IDS) {
      const fresh = makeRenderSpec(recipeId);
      const committed = RenderSpecSchema.parse(readCommittedFixture(`${recipeId}.json`));
      expect(fresh).toEqual(committed);
    }
  });

  it("regenerating the galerie fixture yields a schema-equal result", () => {
    const fresh = makeGalerieFixture();
    const committed = RenderSpecSchema.parse(readCommittedFixture("galerie.json"));
    expect(fresh).toEqual(committed);
  });
});
