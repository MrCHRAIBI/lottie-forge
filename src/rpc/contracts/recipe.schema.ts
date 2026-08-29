import { z } from "zod";

import { RecipeIdSchema } from "./vocabulary.schema.js";

/**
 * zod mirror of the Pydantic `MotionRecipe` in `lottie_forge/domain/recipe.py`
 * (DM-02, DM-05, §4.6). The model is the seam between "creative" (LLM-side,
 * Phase 6 RecipePicker) and "deterministic" (Motion Compiler); `recipe_id`
 * is the only motion vocabulary the LLM is allowed to pick from -- ADR-03.
 *
 * Every object is a `z.strictObject` so unknown keys are rejected, mirroring
 * `extra="forbid"` on the Python side. Bounds, regexes, array lengths and
 * the closed Direction Literal mirror the Pydantic model exactly -- a bound
 * that exists on one side and not the other is drift, and the bridge tests
 * on both ends catch it.
 *
 * Per ADR-01 no field describes a SMIL or CSS-keyframe animation channel.
 */

/** Kebab-case token pattern -- same regex as StyleSpec palette token names. */
export const TOKEN_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Closed enum of motion directions -- must match Python's `Direction` Literal. */
export const DIRECTION_VALUES = ["up", "down", "left", "right", "none"] as const;

export const MotionParamsSchema = z.strictObject({
  amplitude: z.number().min(0).max(1),
  direction: z.enum(DIRECTION_VALUES),
  loops: z.number().int().min(1).max(10),
});

export const MotionRecipeSchema = z.strictObject({
  recipe_id: RecipeIdSchema,
  family: z.string().regex(TOKEN_NAME_PATTERN).max(64),
  duration_ms: z.number().int().min(100).max(10000),
  easing: z.string().regex(TOKEN_NAME_PATTERN).max(64),
  params: MotionParamsSchema,
  theme_anchors: z.array(z.string().regex(TOKEN_NAME_PATTERN).max(64)).max(16).default([]),
});

export type Direction = (typeof DIRECTION_VALUES)[number];
export type MotionParams = z.infer<typeof MotionParamsSchema>;
export type MotionRecipe = z.infer<typeof MotionRecipeSchema>;
