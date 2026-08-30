import { z } from "zod";

/**
 * Closed motion-recipe id vocabulary — the TypeScript mirror of
 * `lottie_forge/domain/vocabulary.py` (DM-02, ADR-03, §4.4).
 *
 * ADR-03 locks the catalogue at a closed set of 8-12 named recipes. Any
 * membership change MUST edit this file and `lottie_forge/domain/vocabulary.py`
 * in the SAME commit — the structural same-commit scan in
 * `tests/domain/test_vocabulary.py` fails otherwise (it scans every `.ts`
 * file under `src/rpc/contracts/` and asserts this module is the only one
 * that declares the id list).
 *
 * Per ADR-01 these ids name Lottie motion recipes only — never a SMIL or
 * CSS-keyframe animation channel.
 */

export const RECIPE_IDS = [
  "fade",
  "slide",
  "bounce",
  "pulse",
  "draw-on",
  "rotate",
  "scale-pop",
  "float",
  "wiggle",
  "orbit",
] as const;

/** ADR-03 closed range -- a runtime invariant of the catalogue. */
export const MIN_RECIPE_COUNT = 8;
export const MAX_RECIPE_COUNT = 12;

export type RecipeId = (typeof RECIPE_IDS)[number];

export const RecipeIdSchema = z.enum(RECIPE_IDS);

/**
 * Closed set of 6 theme-anchor labels (D-10, MOT-03) — the closed
 * vocabulary the Phase 4 `CatalogRecipe.theme_anchors` will declare.
 *
 * Same same-commit doctrine as `RECIPE_IDS` above: a membership
 * change edits this file AND `lottie_forge/domain/vocabulary.py` in
 * one commit (D-11). The structural lockstep test in
 * `tests/domain/test_vocabulary.py` extends the canonical scan to the
 * anchor tuple in addition to the recipe tuple.
 *
 * The cardinality of 6 is fixed at design time — no runtime invariant
 * helper. Order is canonical and matches the Python `ThemeAnchorId`
 * literal in `vocabulary.py`.
 */
export const THEME_ANCHOR_IDS = [
  "primary",
  "secondary",
  "accent",
  "background",
  "success",
  "danger",
] as const;

export type ThemeAnchorId = (typeof THEME_ANCHOR_IDS)[number];

export const ThemeAnchorIdSchema = z.enum(THEME_ANCHOR_IDS);

/**
 * Runtime invariant check at module-evaluation time.
 *
 * If a future commit changes the tuple length outside the ADR-03 range the
 * module fails to load -- the TypeScript bridge then errors out before any
 * schema is even instantiated. Mirrors the Python `assert_recipe_count`
 * guard in `lottie_forge/domain/vocabulary.py`.
 */
if (RECIPE_IDS.length < MIN_RECIPE_COUNT || RECIPE_IDS.length > MAX_RECIPE_COUNT) {
  throw new Error(
    `recipe count must satisfy ${MIN_RECIPE_COUNT} <= n <= ${MAX_RECIPE_COUNT}, got ${RECIPE_IDS.length}`,
  );
}
