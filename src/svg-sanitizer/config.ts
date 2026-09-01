/**
 * Locked SVGO 4 configuration — `sanitizerConfig`.
 *
 * **Plugin order (P5 — D-32, D-31, ADR-02):**
 *
 *   1. `forbid-text`              — SAN-01 collector
 *   2. `forbid-raster`            — SAN-02 collector
 *   3. `forbid-foreignobject`     — SAN-05 collector
 *   4. `forbid-structure`         — D-31 collector
 *   5. `preset-default`           — SVGO optimization pass
 *      (with overrides — see below)
 *   6. `stabilize-ids`            — D-32 assertion
 *
 * **Why this order (D-32 / D-31 / ADR-02):** the collectors
 * run BEFORE `preset-default` so they see the tree in its
 * original form. Any `preset-default` mutation (e.g. removing
 * `<desc>`, collapsing groups, renaming IDs) would otherwise
 * hide a violation that exists in the source. The
 * `stabilize-ids` plugin runs LAST so its assertion operates on
 * the same ID scheme the compiler emitted (collectors do not
 * touch IDs; `cleanupIds` is disabled in the preset overrides
 * — see below).
 *
 * **Preset overrides (Pitfall 5 + Pitfall 6):**
 *
 * - `removeDesc: false` — the SVGO v4 preset-default STILL
 *   contains `removeDesc` (verified at the v4 migration doc).
 *   Overriding to `false` keeps `<desc>` in the output (D-31
 *   allow-list).
 *
 * - `cleanupIds: false` — `cleanupIds` would rename IDs (e.g.
 *   `a-001_primary-rect` → `a`), destroying the D-32 stable
 *   ID scheme and breaking SAN-03 byte-stable cross-regeneration
 *   tests (Pitfall 6).
 *
 * - `collapseGroups: false` — `collapseGroups` would flatten the
 *   `<g>` tree, removing the 1-`<g>`-per-component structure
 *   (D-19 mirrored structure for theming).
 *
 * **Adr-02 note on `removeViewBox` / `removeTitle`:** these
 * plugins are ABSENT from SVGO v4's `preset-default` (the v3→v4
 * migration removed them). Re-adding them as overrides would
 * RE-ACTIVATE them (the inverse of the v3 behavior). The locked
 * config does NOT include them — the v4 default is correct for
 * ADR-02.
 *
 * **`prefixIds` is NOT used** (§6.4.2 verbatim) — the IDs are
 * already stable and named via `stabilize-ids` (assertion-only,
 * no rewriting). The compiler owns ID assignment; the sanitizer
 * only validates.
 *
 * **Float precision override:** `floatPrecision: 4` mirrors the
 * compiler's `fmt()` precision (D-35). The default SVGO 3
 * precision would round the SVG attribute values to 3 decimals
 * while the Lottie floats carry 4 — divergence between the two
 * surfaces breaks the cross-id byte-stable regime.
 */

import { type Config, optimize } from "svgo";
import type { CollectedViolation } from "./constraint-report.js";
import { forbidForeignObjectPlugin } from "./plugins/forbid-foreignobject.js";
import { forbidRasterPlugin } from "./plugins/forbid-raster.js";
import { forbidStructurePlugin } from "./plugins/forbid-structure.js";
import { forbidTextPlugin } from "./plugins/forbid-text.js";
import { stabilizeIdsPlugin } from "./plugins/stabilize-ids.js";

/**
 * Build the locked SVGO configuration.
 *
 * The `violations` closure is the collector array — every
 * gate plugin appends to it; the orchestrator reads it after
 * the optimize pass to decide between `ok=true` and `ok=false`.
 *
 * The `assetId` parameter scopes the `stabilize-ids` assertion
 * to the asset being sanitized (D-32: the prefix must match
 * the request's `asset_id`).
 *
 * @param violations - the closure-scoped collector array.
 * @param assetId   - the asset_id of the sanitized SVG.
 */
export function buildSanitizerConfig(violations: CollectedViolation[], assetId: string): Config {
  return {
    multipass: true,
    floatPrecision: 4,
    plugins: [
      forbidTextPlugin(violations),
      forbidRasterPlugin(violations),
      forbidForeignObjectPlugin(violations),
      forbidStructurePlugin(violations),
      {
        name: "preset-default",
        params: {
          overrides: {
            removeDesc: false,
            cleanupIds: false,
            collapseGroups: false,
          },
        },
      },
      stabilizeIdsPlugin(violations, assetId),
    ],
  };
}

/**
 * Run an optimize pass with the locked SVGO configuration. The
 * `input` SVG is parsed by SVGO, walked by every visitor plugin
 * in the order documented above, and serialized back to a string.
 *
 * The optimize pass DOES mutate the tree (via `preset-default`'s
 * cleanup plugins). The collectors run BEFORE the mutations, so
 * the violations array is populated against the **original**
 * tree — a violation that exists in the source is detected even
 * if the preset would have silently removed the offending
 * element.
 */
export function runOptimize(input: string, config: Config): string {
  return optimize(input, config).data;
}
