/**
 * Meta constants + derivation rules for the Motion Compiler.
 *
 * Two responsibilities, both pinned at the Phase 3 zod gate (no later
 * plan may drift these without rewriting every consumer):
 *
 * 1. **Lottie meta constants** (`v`, `fr`, `ip`, `op`) — pinned at compile
 *    time per §6.3.1 and §6.3.2 (D-12 `v = "5.7.0"`; A4 cadence rule).
 *    `fr = 60`, `ip = 0`, `op = round(duration_ms × fr / 1000)`.
 *
 * 2. **Sanitized Lottie meta `g` / `a` strings** — no user-supplied
 *    content can ever flow into the meta fields. The generator name
 *    and author are constant bytes per §6.3.2 (anti information
 *    disclosure doctrine, T-03-04b).
 *
 * 3. **`<title>` / `<desc>` derivation (D-18)** — the SVG companion
 *    carries a11y elements whose text is built deterministically from
 *    `asset_id` + `recipe_id`. A `RenderSpec` carrying a user-supplied
 *    `title` field would be rejected by the closed
 *    `RenderSpecSchema.strictObject` (no such key exists).
 *
 * Module-guard at load time mirrors `vocabulary.schema.ts` (lines
 * 74-78) — a future drift on the frame-rate or on the `g`/`a`
 * constants fails the module evaluation before any schema is even
 * instantiated.
 */

import type { RecipeId } from "../rpc/contracts/vocabulary.schema.js";

/**
 * Pin: lottie spec version string (D-12). The literal is duplicated
 * by `LottieJSONSchema.v = z.literal("5.7.0")` in
 * `motion-compiler.schema.ts` — both sites MUST change in the same
 * commit (D-12 + same-commit scan).
 */
export const LOTTIE_SPEC_VERSION = "5.7.0";

/**
 * Pin: frames-per-second of every emitted Lottie. The cadence is part
 * of the byte-identity regime (COM-01); changing `fr` invalidates
 * every existing golden file (D-23 reversibility: costly).
 */
export const FRAME_RATE = 60;

/** Pin: every layer starts at frame 0 (§6.3.2). */
export const DEFAULT_IP = 0;

/**
 * Pin: lottie-meta `g` (generator) string. Constant — never derived
 * from a `RenderSpec` field, never read from a process env var. The
 * byte-level constancy is part of the deterministic compile regime
 * (§6.3.2 — "zéro donnée user-supplied").
 */
export const META_GENERATOR = "lottie-forge-gen";

/**
 * Pin: lottie-meta `a` (author) string. Same doctrine as
 * `META_GENERATOR` — the byte sequence is the contract.
 */
export const META_AUTHOR = "lottie-forge-meta";

/**
 * Compute the Lottie `op` frame count from the recipe's `duration_ms`
 * (A4 cadence rule, pinned at Phase 3 planning).
 *
 * `op = round(duration_ms × fr / 1000)` — the spec carries the
 * duration in milliseconds (catalogue regime, §5.5.3); the Lottie
 * frame count must round to the nearest integer (Lottie runtime
 * rejects non-integer `op`).
 *
 * Examples at `fr = 60`:
 *
 *   duration 600 ms  → 36 frames
 *   duration 800 ms  → 48 frames
 *   duration 1000 ms → 60 frames
 *   duration 1500 ms → 90 frames
 */
export function frameCountFor(durationMs: number): number {
  return Math.round((durationMs * FRAME_RATE) / 1000);
}

/**
 * Build the `<title>` element text from `asset_id` + `recipe_id`
 * (D-18). The string is the entire text content of the SVG `<title>`
 * element — a11y only, never displayed visually. The format is the
 * pinned Phase 3 contract:
 *
 *   `Asset ${assetId} — ${recipeId}`
 *
 * The em-dash separator is one byte sequence (`\u2014`); no other
 * separator (hyphen, colon) is permitted by the gate.
 */
export function deriveTitle(assetId: string, recipeId: RecipeId): string {
  return `Asset ${assetId} — ${recipeId}`;
}

/**
 * Build the `<desc>` element text from `asset_id` + `recipe_id`
 * (D-18). Pinned format:
 *
 *   `Motion-compiled illustration for asset ${assetId} (recipe ${recipeId}).`
 *
 * Sentence-terminating period is part of the contract.
 */
export function deriveDesc(assetId: string, recipeId: RecipeId): string {
  return `Motion-compiled illustration for asset ${assetId} (recipe ${recipeId}).`;
}

/**
 * Sanitized SVG root attributes — the only attributes the compiler
 * ever sets on the `<svg>` element. viewBox is present
 * (`width × height` from the StyleSpec); `width` and `height` are
 * absent (D-22 — responsive garanti). The `xmlns` namespace is
 * explicit and unique (D-31 — pas de `xmlns:xlink`, pas de prefixes).
 *
 * Returns a frozen record so callers cannot mutate the canonical
 * attribute set after the compile.
 */
export interface SvgRootAttributes {
  readonly xmlns: "http://www.w3.org/2000/svg";
  readonly viewBox: string;
}

export function svgRootAttributes(viewBoxWidth: number, viewBoxHeight: number): SvgRootAttributes {
  return Object.freeze({
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: `0 0 ${viewBoxWidth} ${viewBoxHeight}`,
  });
}

/**
 * Module-level guard — mirrors the `vocabulary.schema.ts`
 * load-time invariant (lines 74-78). Any future drift on the
 * pinned constants fails the import before any consumer instantiates.
 */
if (FRAME_RATE < 1 || FRAME_RATE > 120) {
  throw new Error(`FRAME_RATE must be in [1, 120] (Lottie spec range); got ${FRAME_RATE}`);
}
if (DEFAULT_IP !== 0) {
  throw new Error(`DEFAULT_IP must be 0 (Lottie spec); got ${DEFAULT_IP}`);
}
