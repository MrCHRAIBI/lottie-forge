import type {
  Component,
  Paint,
  RenderSpec,
  RenderSpecRole,
  ShapeInput,
  StrokeWidthToken,
  TransformDelta,
} from "../../rpc/contracts/motion-compiler.schema.js";
import { RECIPE_IDS } from "../../rpc/contracts/vocabulary.schema.js";

/**
 * Phase 3 single-source-of-truth RenderSpec fixture builder (D-04).
 *
 * Mirrors the `tests/bridge/fixtures.py` doctrine exactly: one exported
 * `makeRenderSpec(recipeId)` function with canonical-default pose, optional
 * overrides for variety, and a docblock listing every default plus its
 * rationale. Every committed fixture under `fixtures/render-specs/*.json`
 * re-derives from this builder — D-04 forbids re-stating a fixture inline.
 *
 * ## Canonical shape choice per recipe (D-03 + D-05 cross-ref)
 *
 * The catalogue `shapes_supported` per recipe (see
 * `fixtures/recipe-catalogue/catalogue.json`) restricts which generators
 * are valid for that recipe. The per-recipe canonical-shape choice is:
 *
 * | recipe     | canonical shape | rationale                                |
 * |------------|-----------------|------------------------------------------|
 * | fade       | rect            | simplest opacity carrier, well-trodden   |
 * | slide      | rect            | slide is rect's signature motion         |
 * | bounce     | rect            | the canonical entry shape (3 components)|
 * | pulse      | polystar        | radial breath is visually iconic         |
 * | draw-on    | path            | D-14: must take path with stroke + token |
 * | rotate     | polystar        | radial symmetry reads cleanly under spin |
 * | scale-pop  | polystar        | radial pop reads cleanly under scale     |
 * | float      | ellipse         | soft drift suits a soft circular shape   |
 * | wiggle     | ellipse         | small jitter suits an elliptical blob    |
 * | orbit      | polystar        | star under circular motion = visual icon |
 * | galerie    | rect+ellipse+path+polyline under wiggle | option-b (set-level D-03) |
 *
 * ## Default pose — values that vary per recipe are documented below
 *
 * - `asset_id` = `"a-001".."a-010"` for the 10 recipe fixtures; `"a-011"`
 *   for the galerie. Phase 5 envelope allocation reserves `a-001..a-050`
 *   so the test prefix sits inside the production range.
 * - `style_ref` = `"example-style@1.0.0"` — pinned to the committed
 *   style fixture (mirrors `make_asset` in `tests/bridge/fixtures.py`
 *   line 154-156).
 * - `motion` — `amplitude` chosen inside the recipe's `intensity_range`
 *   (mid-band; fractional per the Phase 1 bridge doctrine so Py/JS
 *   format parity holds). `direction = "none"` for shape-carrying
 *   recipes (the actual direction is encoded in the recipe's keyframe
 *   shape, not in the spec). `loops` = 1 for one-shot recipes
 *   (fade, slide, bounce, draw-on, rotate, scale-pop, wiggle) and 1 for
 *   loop recipes too (a single iteration is enough for the golden).
 * - `components` count varies 1..3 across fixtures so z-order inversion
 *   (D-10), multi-layer ID assignment (D-32) and the (component, role)
 *   uniqueness `superRefine` are exercised. Default role = the recipe's
 *   first declared `theme_anchor`; secondary components (when present)
 *   use the second declared anchor or `"neutral"` if only one anchor is
 *   declared. Every coordinate and parameter sits inside the D-06 closed
 *   ranges; transform deltas sit inside the D-34 own ranges.
 *
 * ## Deliberately fractional floats (D-35 / Phase 1 bridge doctrine)
 *
 * All float values are deliberately fractional (`0.5`, `0.25`, `0.125`,
 * `0.0625`, `0.1`, `0.75`) so Python and JavaScript format them
 * identically across the JSON hop — never integral `0.0`, `1.0` or `2.0`.
 * Phase 1 §4.1 #6 captured this as a precision probe.
 */

/**
 * Internal mapping — per-recipe canonical shape generator + paint kind.
 * `paint.kind = "stroke"` is reserved for `draw-on` (D-14: trim-path is
 * only visible on a stroke layer) and uses `stroke_width_token = "default"`
 * referencing the locked `StyleSpec.stroke_widths` keys.
 */
type CanonicalShape = "rect" | "ellipse" | "path" | "polyline" | "polystar";
type CanonicalPaint = "fill" | "stroke";

interface RecipeDefaults {
  readonly shape: CanonicalShape;
  readonly paint: CanonicalPaint;
  readonly amplitude: number;
  readonly loops: number;
  readonly transform: TransformDelta;
}

const RECIPE_DEFAULTS: Record<(typeof RECIPE_IDS)[number], RecipeDefaults> = {
  fade: {
    shape: "rect",
    paint: "fill",
    amplitude: 0.5,
    loops: 1,
    transform: { translate_dx: 0, translate_dy: 0, rotation_deg: 0, scale: 1 },
  },
  slide: {
    shape: "rect",
    paint: "fill",
    amplitude: 0.5,
    loops: 1,
    transform: { translate_dx: 0.5, translate_dy: 0, rotation_deg: 0, scale: 1 },
  },
  bounce: {
    shape: "rect",
    paint: "fill",
    amplitude: 0.5,
    loops: 1,
    transform: { translate_dx: 0, translate_dy: 0.5, rotation_deg: 0, scale: 1 },
  },
  pulse: {
    shape: "polystar",
    paint: "fill",
    amplitude: 0.5,
    loops: 1,
    transform: { translate_dx: 0, translate_dy: 0, rotation_deg: 0, scale: 1.5 },
  },
  "draw-on": {
    shape: "path",
    paint: "stroke",
    amplitude: 0.5,
    loops: 1,
    transform: { translate_dx: 0, translate_dy: 0, rotation_deg: 0, scale: 1 },
  },
  rotate: {
    shape: "polystar",
    paint: "fill",
    amplitude: 0.5,
    loops: 1,
    transform: { translate_dx: 0, translate_dy: 0, rotation_deg: 90, scale: 1 },
  },
  "scale-pop": {
    shape: "polystar",
    paint: "fill",
    amplitude: 0.5,
    loops: 1,
    transform: { translate_dx: 0, translate_dy: 0, rotation_deg: 0, scale: 1.5 },
  },
  float: {
    shape: "ellipse",
    paint: "fill",
    amplitude: 0.25,
    loops: 1,
    transform: { translate_dx: 0, translate_dy: 0.25, rotation_deg: 0, scale: 1 },
  },
  wiggle: {
    shape: "ellipse",
    paint: "fill",
    amplitude: 0.25,
    loops: 1,
    transform: { translate_dx: 0.1, translate_dy: 0, rotation_deg: 0, scale: 1 },
  },
  orbit: {
    shape: "polystar",
    paint: "fill",
    amplitude: 0.5,
    loops: 1,
    transform: { translate_dx: 0.25, translate_dy: 0, rotation_deg: 0, scale: 1 },
  },
};

const STYLE_REF = "example-style@1.0.0";

/** Hex color — concrete palette token from `fixtures/style-specs/example-style/style.yaml`. */
const COLOR_INK = "#1c57cb";

/**
 * Build the canonical shape for a per-recipe canonical-shape slot.
 * Coordinate ranges follow D-06 closed [0..1]; the values are
 * deliberately fractional so the D-35 formatter path is exercised.
 */
function buildCanonicalShape(shape: CanonicalShape): ShapeInput {
  switch (shape) {
    case "rect":
      return { shape: "rect", x: 0.25, y: 0.25, w: 0.5, h: 0.5, corner_radius: 0.0625 };
    case "ellipse":
      return { shape: "ellipse", cx: 0.5, cy: 0.5, rx: 0.25, ry: 0.25 };
    case "path":
      // Closed path — 4 corners of a square inside the viewport (trim
      // path 0..1 starts at point[0] and walks the path linearly).
      return {
        shape: "path",
        points: [
          [0.25, 0.25],
          [0.75, 0.25],
          [0.75, 0.75],
          [0.25, 0.75],
        ],
        closed: true,
      };
    case "polyline":
      return {
        shape: "polyline",
        points: [
          [0.125, 0.75],
          [0.375, 0.25],
          [0.625, 0.75],
          [0.875, 0.25],
        ],
      };
    case "polystar":
      // 5-pointed star (signature pulse/rotate/scale-pop shape).
      return {
        shape: "polystar",
        cx: 0.5,
        cy: 0.5,
        points_count: 5,
        r_outer: 0.375,
        r_inner: 0.1875,
        rotation_deg: 0,
      };
  }
}

/**
 * Build the canonical paint for a per-recipe canonical-paint kind. The
 * stroke variant carries `stroke_width_token = "default"` (D-14 — never
 * a free float) referencing the locked `StyleSpec.stroke_widths` keys.
 */
function buildCanonicalPaint(paint: CanonicalPaint): Paint {
  if (paint === "fill") {
    return { kind: "fill", color: COLOR_INK };
  }
  return { kind: "stroke", color: COLOR_INK, stroke_width_token: "default" as StrokeWidthToken };
}

/** Strip the optional `transform` if it equals the identity (drop the key). */
function maybeTransform(transform: TransformDelta): TransformDelta | undefined {
  const isIdentity =
    transform.translate_dx === 0 &&
    transform.translate_dy === 0 &&
    transform.rotation_deg === 0 &&
    transform.scale === 1;
  return isIdentity ? undefined : transform;
}

/**
 * Build the canonical recipe fixture. One component (the recipe's
 * canonical shape + first theme_anchor); fractional amplitude inside the
 * recipe's intensity range; identity-or-meaningful transform depending on
 * the recipe's motion family.
 */
function buildRecipeFixture(recipeId: (typeof RECIPE_IDS)[number], assetIndex: number): RenderSpec {
  const defaults = RECIPE_DEFAULTS[recipeId];
  const anchor = primaryAnchorFor(recipeId);
  const component: Component = {
    component: `${anchor}-${defaults.shape}`,
    role: anchor,
    shape: buildCanonicalShape(defaults.shape),
    paint: buildCanonicalPaint(defaults.paint),
    ...(maybeTransform(defaults.transform) !== undefined ? { transform: defaults.transform } : {}),
  };
  return {
    asset_id: `a-${String(assetIndex).padStart(3, "0")}`,
    recipe_id: recipeId,
    style_ref: STYLE_REF,
    components: [component],
    motion: { amplitude: defaults.amplitude, direction: "none", loops: defaults.loops },
  };
}

/**
 * Build a recipe fixture with 2 components (primary anchor + secondary
 * anchor) — used by `bounce` to exercise z-order (D-10), multi-layer
 * ID assignment (D-32) and the `(component, role)` uniqueness
 * `superRefine`. Bounce declares `["primary", "accent"]` so both anchors
 * are available.
 */
function buildBounceFixture(assetIndex: number): RenderSpec {
  const defaults = RECIPE_DEFAULTS.bounce;
  return {
    asset_id: `a-${String(assetIndex).padStart(3, "0")}`,
    recipe_id: "bounce",
    style_ref: STYLE_REF,
    components: [
      {
        component: "primary-rect",
        role: "primary",
        shape: buildCanonicalShape("rect"),
        paint: buildCanonicalPaint("fill"),
        transform: defaults.transform,
      },
      {
        component: "accent-rect",
        role: "accent",
        shape: { shape: "rect", x: 0.375, y: 0.375, w: 0.25, h: 0.25, corner_radius: 0.0625 },
        paint: buildCanonicalPaint("fill"),
      },
    ],
    motion: { amplitude: defaults.amplitude, direction: "none", loops: defaults.loops },
  };
}

/**
 * Build the galerie fixture — option-b (zero Phase-2 churn, set-level
 * D-03 coverage). 4 components (rect, ellipse, path, polyline) under
 * `wiggle` with 4 distinct `(component, role)` pairs. Polystar golden
 * coverage rides on pulse/rotate/scale-pop/orbit recipe fixtures.
 */
function buildGalerieFixture(): RenderSpec {
  const defaults = RECIPE_DEFAULTS.wiggle;
  return {
    asset_id: "a-011",
    recipe_id: "wiggle",
    style_ref: STYLE_REF,
    components: [
      {
        component: "accent-rect",
        role: "accent",
        shape: buildCanonicalShape("rect"),
        paint: buildCanonicalPaint("fill"),
        transform: defaults.transform,
      },
      {
        component: "primary-ellipse",
        role: "primary",
        shape: buildCanonicalShape("ellipse"),
        paint: buildCanonicalPaint("fill"),
      },
      {
        component: "secondary-path",
        role: "secondary",
        shape: buildCanonicalShape("path"),
        paint: buildCanonicalPaint("stroke"),
      },
      {
        component: "neutral-polyline",
        role: "neutral",
        shape: buildCanonicalShape("polyline"),
        paint: buildCanonicalPaint("fill"),
      },
    ],
    motion: { amplitude: defaults.amplitude, direction: "none", loops: defaults.loops },
  };
}

/**
 * Resolve the first declared `theme_anchor` for a recipe from the locked
 * catalogue. Used as the default role for single-component fixtures and
 * as the lead component of multi-component fixtures. The fallback to
 * `"neutral"` is structural — every recipe in the locked catalogue
 * declares at least one theme_anchor, but the type system cannot see
 * that.
 */
function primaryAnchorFor(recipeId: (typeof RECIPE_IDS)[number]): RenderSpecRole {
  switch (recipeId) {
    case "fade":
      return "primary";
    case "slide":
      return "primary";
    case "bounce":
      return "primary";
    case "pulse":
      return "accent";
    case "draw-on":
      return "accent";
    case "rotate":
      return "primary";
    case "scale-pop":
      return "primary";
    case "float":
      return "primary";
    case "wiggle":
      return "accent";
    case "orbit":
      return "primary";
  }
}

/**
 * Build a fully-formed `RenderSpec` fixture for a single recipe. The
 * canonical pose is used; `overrides` (if any) shallow-merge onto the
 * top level for testing purposes. **`makeRenderSpec("bounce")` returns
 * the 2-component fixture** (multi-layer exercise); all other recipes
 * return the 1-component canonical pose.
 *
 * To produce the 4-component galerie fixture, use `makeGalerieFixture`
 * directly — calling `makeRenderSpec("galerie")` is a structural reject
 * because "galerie" is not a recipe id.
 */
export function makeRenderSpec(
  recipeId: (typeof RECIPE_IDS)[number],
  overrides: Partial<RenderSpec> = {},
): RenderSpec {
  const recipeAssetIndex = assetIndexForRecipe(recipeId);
  const base =
    recipeId === "bounce"
      ? buildBounceFixture(recipeAssetIndex)
      : buildRecipeFixture(recipeId, recipeAssetIndex);
  return { ...base, ...overrides } as RenderSpec;
}

/** Build the 4-component galerie fixture (option-b, set-level D-03). */
export function makeGalerieFixture(): RenderSpec {
  return buildGalerieFixture();
}

function assetIndexForRecipe(recipeId: (typeof RECIPE_IDS)[number]): number {
  // 1-based index in the 10-recipe sequence.
  const order = RECIPE_IDS as readonly string[];
  return order.indexOf(recipeId) + 1;
}

/** Build the full sequence of 11 fixtures (10 recipes + galerie). */
export function makeAllFixtures(): RenderSpec[] {
  return [
    ...RECIPE_IDS.filter((id) => id !== "bounce").map((id) => makeRenderSpec(id)),
    makeRenderSpec("bounce"),
    makeGalerieFixture(),
  ];
}
