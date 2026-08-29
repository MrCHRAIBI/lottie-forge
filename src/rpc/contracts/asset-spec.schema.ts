import { z } from "zod";

import { RecipeIdSchema } from "./vocabulary.schema.js";

/**
 * zod mirror of the Pydantic `AssetSpec` in `lottie_forge/domain/asset.py`
 * (DM-03, §4.7, §4.9). The model is the per-asset traceability record that
 * the Manifest Store (Phase 5), the Motion Compiler (Phase 3) and the Anim
 * QA gate (Phase 4) all consume as anchors -- a missing or malformed pin
 * here silently breaks downstream gates.
 *
 * Every object is a `z.strictObject` so unknown keys are rejected, mirroring
 * `extra="forbid"` on the Python side. Bounds, regexes and array lengths
 * mirror the Pydantic model exactly -- a bound that exists on one side and
 * not on the other is drift, and the bridge tests on both ends catch it.
 *
 * Field-by-field lock (§4.7):
 *
 * - `asset_id` matches `^a-\d{3}$` exactly -- 50 slots, 3 digits each.
 * - `style_ref` is the **STY-03 pin** `name@MAJOR.MINOR.PATCH` with three
 *   numeric segments separated by **literal dots** (escape `\.` on both
 *   sides -- any loose dot slips a 4-segment version past the gate).
 * - `recipe_ref` reuses the closed-vocabulary `RecipeIdSchema` imported
 *   from `./vocabulary.schema.js` (ADR-03 same-commit, **no second
 *   declaration here**).
 * - `composition_meta.shape_group_names` is a list of 1..24 kebab tokens
 *   matching `^[a-z][a-z0-9-]{2,31}$` (3..32 chars total). ASCII-anchored
 *   so non-ASCII tokens are rejected (CR-01 lock, DM-03 probe encoding).
 * - `content_hashes` is the **locked 2-field model** -- exactly
 *   `svg_sha256` and `lottie_sha256`, both 64-character lowercase hex
 *   (`^[a-f0-9]{64}$`). No third key, no uppercase, no 63/65-char
 *   digest. The Phase-8 `dotlottie_sha256` extension is added by editing
 *   this schema in the same commit (§4.14).
 *
 * Per ADR-01 no field describes a SMIL or CSS-keyframe animation channel.
 */

/** 50-slot asset id lock: exactly 3 digits prefixed by `a-`. */
export const ASSET_ID_PATTERN = /^a-\d{3}$/;

/** STY-03 pin: `name@MAJOR.MINOR.PATCH` -- three numeric segments, dots literal. */
export const STYLE_REF_PATTERN = /^[a-z][a-z0-9-]*@\d+\.\d+\.\d+$/;

/** 64-character lowercase hex (sha256 digest). No uppercase. */
export const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

/** Kebab token of 3..32 chars total -- the leading letter is one char of
 * the body, the body then has 2..31 more. ASCII-anchored. */
export const SHAPE_GROUP_NAME_PATTERN = /^[a-z][a-z0-9-]{2,31}$/;

const Sha256HexSchema = z.string().regex(SHA256_HEX_PATTERN).length(64);

const ShapeGroupNameSchema = z.string().regex(SHAPE_GROUP_NAME_PATTERN).max(32);

export const CompositionMetaSchema = z.strictObject({
  shape_group_names: z.array(ShapeGroupNameSchema).min(1).max(24),
});

export const ContentHashesSchema = z.strictObject({
  svg_sha256: Sha256HexSchema,
  lottie_sha256: Sha256HexSchema,
});

export const AssetSpecSchema = z.strictObject({
  asset_id: z.string().regex(ASSET_ID_PATTERN).max(6),
  style_ref: z.string().regex(STYLE_REF_PATTERN).max(128),
  recipe_ref: RecipeIdSchema,
  composition_meta: CompositionMetaSchema,
  content_hashes: ContentHashesSchema,
});

export type AssetSpec = z.infer<typeof AssetSpecSchema>;
export type CompositionMeta = z.infer<typeof CompositionMetaSchema>;
export type ContentHashes = z.infer<typeof ContentHashesSchema>;
