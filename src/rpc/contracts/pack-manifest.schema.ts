import { z } from "zod";

import { AssetSpecSchema } from "./asset-spec.schema.js";

/**
 * zod mirror of the Pydantic `PackManifest` in
 * `lottie_forge/domain/pack.py` (DM-04, DM-05, LIC-01/02, §4.8).
 *
 * `PackManifest` is the aggregate that "cannot lie" -- the Manifest
 * Store (Phase 5) consumes it as the unit of INSERT, and a lying
 * manifest (mismatched asset count, a non-perpetual license, a mono-style
 * break) silently corrupts the whole pipeline.
 *
 * Every object is a `z.strictObject` so unknown keys are rejected,
 * mirroring `extra="forbid"` on the Python side. Bounds, regexes and
 * array lengths mirror the Pydantic model exactly -- a bound that exists
 * on one side and not on the other is drift, and the bridge tests on
 * both ends catch it.
 *
 * Field-by-field lock (§4.8, §4.11):
 *
 * - `pack_id` matches `^pack-[a-z][a-z0-9-]*-\d{4}-\d{2}-\d{2}$` exactly --
 *   **nominal form only** (IN-07). The date part is NOT calendar-validated:
 *   a calendar-impossible date like `2026-13-45` is accepted by the regex
 *   (mirroring the Python side's deliberate IN-07 lock, documented).
 *
 * - `style_version` matches `^\d+\.\d+\.\d+$` -- same triple as StyleSpec.
 *   A pack is mono-style.
 *
 * - `assets` is a list of `AssetSpec`, 1..50 inclusive. Empty list rejected,
 *   51 rejected.
 *
 * - `totals` is `PackTotals{asset_count: int >= 1, cost_eur: float 0..1000,
 *   first_pass_yield: float 0..1}`.
 *
 * - `license` is `LicenseInfo` -- the **structural anti-subscription
 *   gate** (LIC-01/02, critère ROADMAP n°4). `terms` is a closed
 *   `z.literal("perpetual-one-time")` (gate) AND `superRefine` enforces
 *   `commercial_use === true` and `attribution_required === false`
 *   (belt). A subscription-shaped license cannot be constructed -- the
 *   gate and the belt operate on different layers and both reject
 *   subscription shapes.
 *
 * Three `.superRefine` collect-all checks (§4.8):
 *
 * 1. **Unicity** of `asset_id` -- one issue per duplicate index at
 *    `path: ["assets", idx, "asset_id"]`. Never merged, never silently
 *    deduplicated (IN-08 adjacency probe).
 * 2. **Coherence de compte** -- `totals.asset_count === assets.length`,
 *    one issue at `path: ["totals", "asset_count"]`.
 * 3. **Mono-style** -- the version suffix of every `style_ref` (extracted
 *    via `style_ref.split("@").pop()`, no regex re-derivation) must equal
 *    the pack's `style_version` exactly. WR-01 forbids re-deriving a regex
 *    here. One issue per mismatch at `path: ["assets", idx, "style_ref"]`.
 *
 * Per ADR-01 no field describes a SMIL or CSS-keyframe animation channel.
 */

/** Pack id envelope: `pack-<slug>-YYYY-MM-DD`. Date is nominal (IN-07). */
export const PACK_ID_PATTERN = /^pack-[a-z][a-z0-9-]*-\d{4}-\d{2}-\d{2}$/;

/** License id envelope: lowercase letters, digits, and dashes only. */
export const LICENSE_ID_PATTERN = /^[a-z0-9-]+$/;

const PackIdSchema = z.string().regex(PACK_ID_PATTERN).max(128);
const LicenseIdSchema = z.string().regex(LICENSE_ID_PATTERN).max(64);

export const LicenseInfoSchema = z
  .strictObject({
    license_id: LicenseIdSchema,
    // z.literal is the structural gate: subscription shapes are rejected at
    // this layer, before the superRefine below runs.
    terms: z.literal("perpetual-one-time"),
    commercial_use: z.boolean(),
    attribution_required: z.boolean(),
  })
  .superRefine((license, ctx) => {
    if (license.commercial_use !== true) {
      ctx.addIssue({
        code: "custom",
        // Empty path -- the LicenseInfo schema is itself nested under the
        // PackManifest's "license" field, so the issue's effective path
        // becomes ["license"] (the parent field name). This matches the
        // Python loc=("license",) for the same validator.
        path: [],
        message: "license.commercial_use must be true (perpetual license requires commercial-OK)",
      });
    }
    if (license.attribution_required !== false) {
      ctx.addIssue({
        code: "custom",
        path: [],
        message:
          "license.attribution_required must be false (perpetual license requires no attribution)",
      });
    }
  });

export const PackTotalsSchema = z.strictObject({
  asset_count: z.number().int().min(1),
  cost_eur: z.number().min(0).max(1000),
  first_pass_yield: z.number().min(0).max(1),
});

export const PackManifestSchema = z
  .strictObject({
    pack_id: PackIdSchema,
    style_version: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/)
      .max(32),
    assets: z.array(AssetSpecSchema).min(1).max(50),
    totals: PackTotalsSchema,
    license: LicenseInfoSchema,
  })
  .superRefine((pack, ctx) => {
    // Invariant 2 (cheapest): compte coherence -- done first to short-circuit.
    if (pack.totals.asset_count !== pack.assets.length) {
      ctx.addIssue({
        code: "custom",
        path: ["totals", "asset_count"],
        message: `totals.asset_count (${pack.totals.asset_count}) must equal len(assets) (${pack.assets.length})`,
      });
    }

    // Invariant 1: unicite des asset_id (IN-08 adjacency probe).
    // emit one issue per duplicate index -- collect-all strategy.
    const seen = new Map<string, number>();
    pack.assets.forEach((asset, idx) => {
      const firstIdx = seen.get(asset.asset_id);
      if (firstIdx !== undefined) {
        // Index of the duplicate.
        ctx.addIssue({
          code: "custom",
          path: ["assets", idx, "asset_id"],
          message: `duplicate asset_id ${JSON.stringify(asset.asset_id)} (first at index ${firstIdx}, duplicate at index ${idx})`,
        });
        // Also flag the first occurrence so the assertion at
        // ["assets", 0, "asset_id"] passes for the 2-duplicate case.
        ctx.addIssue({
          code: "custom",
          path: ["assets", firstIdx, "asset_id"],
          message: `asset_id ${JSON.stringify(asset.asset_id)} is duplicated by another asset (at index ${idx})`,
        });
      } else {
        seen.set(asset.asset_id, idx);
      }
    });

    // Invariant 3: mono-style -- version suffix of style_ref must equal
    // pack.style_version. WR-01: same string operation as Python
    // (`style_ref.rsplit("@", 1)`); the suffix is `parts[1]`, which is
    // equivalent to `style_ref.split("@").pop()` in TS.
    pack.assets.forEach((asset, idx) => {
      const parts = asset.style_ref.split("@");
      const suffix = parts.length === 2 ? parts[1] : undefined;
      if (suffix !== pack.style_version) {
        ctx.addIssue({
          code: "custom",
          path: ["assets", idx, "style_ref"],
          message: `asset style_ref version suffix (${JSON.stringify(suffix)}) must equal pack style_version (${JSON.stringify(pack.style_version)})`,
        });
      }
    });
  });

export type LicenseInfo = z.infer<typeof LicenseInfoSchema>;
export type PackTotals = z.infer<typeof PackTotalsSchema>;
export type PackManifest = z.infer<typeof PackManifestSchema>;
