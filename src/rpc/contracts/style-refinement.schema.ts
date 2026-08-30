import { z } from "zod";

import { TOKEN_NAME_PATTERN } from "./style-spec.schema.js";

/**
 * zod mirror of the Pydantic `StyleRefinement` in
 * `lottie_forge/domain/style_refinement.py` (DM-05, STY-02, §5.3).
 *
 * The model is the seam between "creative" (Phase 6 `StyleRefiner` LLM)
 * and "deterministic compile" (Motion Compiler + Packager): the LLM is
 * constrained to declare deltas from a loaded StyleSpec -- never to smuggle
 * in a raw hex, a path, a numeric stroke thickness, or any other visual
 * primitive.
 *
 * The closed field set `{sub_palette, motif, stroke_pick, radius_pick,
 * accent_weight}` is structurally identical to the Pydantic model: the
 * regex (imported from `./style-spec.schema.js`, single source of truth
 * per CR-01), bounds, array lengths, and closed Literal values mirror
 * exactly. A bound that exists on one side and not on the other is drift,
 * and the bridge tests on both ends catch it.
 *
 * Per ADR-01 no field describes a SMIL or CSS-keyframe animation channel.
 */

/** Closed enum of stroke weight picks from the StyleSpec §5.2.2 envelope. */
export const STROKE_PICK_VALUES = ["thin", "default", "bold"] as const;

/** Closed enum of corner-radius picks from the StyleSpec §5.2.2 envelope. */
export const RADIUS_PICK_VALUES = ["small", "medium", "large"] as const;

export const StyleRefinementSchema = z.strictObject({
  sub_palette: z.array(z.string().regex(TOKEN_NAME_PATTERN).max(64)).min(1).max(16),
  motif: z.string().regex(TOKEN_NAME_PATTERN).max(64).nullable().optional(),
  stroke_pick: z.enum(STROKE_PICK_VALUES).default("default"),
  radius_pick: z.enum(RADIUS_PICK_VALUES).default("medium"),
  accent_weight: z.number().min(0).max(1).default(0.5),
});

export type StyleRefinement = z.infer<typeof StyleRefinementSchema>;
export type StrokePick = (typeof STROKE_PICK_VALUES)[number];
export type RadiusPick = (typeof RADIUS_PICK_VALUES)[number];
