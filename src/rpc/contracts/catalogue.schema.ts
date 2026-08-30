import { z } from "zod";
import { TOKEN_NAME_PATTERN } from "./style-spec.schema.js";
import { RecipeIdSchema, ThemeAnchorIdSchema } from "./vocabulary.schema.js";

/**
 * zod mirror of the Pydantic `CatalogRecipe` / `RecipeCatalogue` in
 * `lottie_forge/domain/catalogue.py` (MOT-01..04, §5.5.3, plan 02-04).
 *
 * The committed fixture `fixtures/recipe-catalogue/catalogue.json` is read
 * DIRECTLY by both sides (MOT-04 bilingual loading, no 3-artefact bridge for
 * the catalogue itself) -- this schema is the TypeScript load-time authority.
 *
 * Aggregate invariants (§5.5.3) mirror the Python collect-all validator via
 * `.superRefine` with the SAME paths: id uniqueness at
 * `["recipes", idx, "id"]`, pack duration range at
 * `["recipes", idx, "duration_ms"]`, ordered intensity at
 * `["recipes", idx, "intensity_range"]`.
 *
 * ADR-03 / D-11: the recipe-id list and the theme-anchor list are imported
 * from `vocabulary.schema.js` -- NEVER redeclared here (the structural
 * same-commit scan in `tests/domain/test_vocabulary.py` enforces it).
 * `family` stays a free kebab string (§5.9: the catalogue is the source of
 * families -- no Literal, matching the Python `KebabToken` field).
 *
 * Per ADR-01 no field describes a SMIL or CSS-keyframe animation channel.
 */

/** The 10 locked keyframe shapes (§5.5.2, canonical order). */
export const KEYFRAME_SHAPES = [
  "opacity-ramp",
  "translate-in",
  "overshoot-settle",
  "scale-breath",
  "trim-path",
  "angular-in",
  "pop-settle",
  "sine-drift",
  "damped-oscillation",
  "circular-path",
] as const;

export type KeyframeShape = (typeof KEYFRAME_SHAPES)[number];

export const KeyframeShapeSchema = z.enum(KEYFRAME_SHAPES);

/** Closed set of Lottie-relevant shape names. */
export const SHAPE_NAMES = ["rect", "ellipse", "path", "polyline", "polystar"] as const;

export type ShapeName = (typeof SHAPE_NAMES)[number];

export const ShapeNameSchema = z.enum(SHAPE_NAMES);

/** Closed set of trigger points (§5.5.3: ⊆ {enter, exit, loop}). */
export const TRIGGER_POINTS = ["enter", "exit", "loop"] as const;

export type TriggerPoint = (typeof TRIGGER_POINTS)[number];

export const TriggerPointSchema = z.enum(TRIGGER_POINTS);

/** Semver shape of `catalogue_version` -- mirrors CATALOGUE_VERSION_PATTERN. */
export const CATALOGUE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** §5.5.3 #4: primary-motion pack envelope (field bounds stay 100..10000). */
export const PACK_DURATION_MIN = 600;
export const PACK_DURATION_MAX = 1500;

export const CatalogRecipeSchema = z.strictObject({
  id: RecipeIdSchema,
  family: z.string().regex(TOKEN_NAME_PATTERN).max(64),
  duration_ms: z.number().int().min(100).max(10000),
  easing: z.string().regex(TOKEN_NAME_PATTERN).max(64),
  keyframe_shape: KeyframeShapeSchema,
  intensity_range: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
  shapes_supported: z.array(ShapeNameSchema).min(1).max(5),
  trigger_points: z.array(TriggerPointSchema).min(1).max(3),
  theme_anchors: z.array(ThemeAnchorIdSchema).min(1).max(16),
});

export const RecipeCatalogueSchema = z
  .strictObject({
    catalogue_version: z.string().regex(CATALOGUE_VERSION_PATTERN).max(32),
    recipes: z.array(CatalogRecipeSchema).min(8).max(12),
  })
  .superRefine((catalogue, ctx) => {
    // Invariant 1: id uniqueness -- one issue per duplicate occurrence,
    // path ["recipes", idx, "id"] (IN-08 analogue: never merged silently).
    const seen = new Set<string>();
    catalogue.recipes.forEach((recipe, idx) => {
      if (seen.has(recipe.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["recipes", idx, "id"],
          message: `duplicate recipe id ${recipe.id} at index ${idx}`,
        });
      } else {
        seen.add(recipe.id);
      }
    });

    // Invariant 4: pack duration range 600..1500 (§5.5.3 #4).
    catalogue.recipes.forEach((recipe, idx) => {
      if (recipe.duration_ms < PACK_DURATION_MIN || recipe.duration_ms > PACK_DURATION_MAX) {
        ctx.addIssue({
          code: "custom",
          path: ["recipes", idx, "duration_ms"],
          message: `duration_ms (${recipe.duration_ms}) outside pack range ${PACK_DURATION_MIN}..${PACK_DURATION_MAX} for recipe ${recipe.id}`,
        });
      }
    });

    // Ordered intensity: range[0] <= range[1].
    catalogue.recipes.forEach((recipe, idx) => {
      const [low, high] = recipe.intensity_range;
      if (low > high) {
        ctx.addIssue({
          code: "custom",
          path: ["recipes", idx, "intensity_range"],
          message: `intensity_range ${low} > ${high} for recipe ${recipe.id} -- must be ordered ascending`,
        });
      }
    });
  });

export type CatalogRecipe = z.infer<typeof CatalogRecipeSchema>;
export type RecipeCatalogue = z.infer<typeof RecipeCatalogueSchema>;
