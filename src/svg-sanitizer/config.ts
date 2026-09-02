/**
 * Locked SVGO 4 configuration — `sanitizerConfig`.
 *
 * **Plugin order (P5 — D-32, D-31, ADR-02):**
 *
 *   1. `forbid-text`              — SAN-01 collector
 *   2. `forbid-raster`            — SAN-02 collector
 *   3. `forbid-foreignobject`     — SAN-05 collector
 *   4. `forbid-structure`         — D-31 collector (allow-list)
 *   5. `preset-default`           — SVGO optimization pass
 *      (with overrides — see below)
 *   6. `stabilize-ids`            — D-32 assertion
 *
 * The order is **normative** — it is exported as
 * `SANITIZER_PLUGIN_ORDER` and `assertPluginOrder(config)` proves
 * the array matches. A future reorder fails fast at module load
 * time, before any SVG enters the gate.
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
 * ADR-02. The `svgo-regression.spec.ts` config-shape guard
 * re-asserts the absence at every test run.
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

import { type Config, optimize, type Plugin } from "svgo";
import type { CollectedViolation } from "./constraint-report.js";
import { forbidForeignObjectPlugin } from "./plugins/forbid-foreignobject.js";
import { forbidRasterPlugin } from "./plugins/forbid-raster.js";
import { forbidStructurePlugin } from "./plugins/forbid-structure.js";
import { forbidTextPlugin } from "./plugins/forbid-text.js";
import { stabilizeIdsPlugin } from "./plugins/stabilize-ids.js";

/**
 * The normative plugin order (P5 — D-32 / D-31 / ADR-02). The
 * array is exported so `assertPluginOrder` and the test suites
 * share the same source of truth — a future reorder updates
 * this constant AND the test that asserts the order.
 */
export const SANITIZER_PLUGIN_ORDER = [
  "forbid-text",
  "forbid-raster",
  "forbid-foreignobject",
  "forbid-structure",
  "preset-default",
  "stabilize-ids",
] as const;

/**
 * Extract the `name` of a SVGO plugin entry. SVGO accepts strings,
 * built-in entries, custom plugin objects, and preset objects —
 * the locked config uses the object form. This helper returns the
 * `<unknown>` sentinel for forms the gate does not recognize; the
 * caller can then fail loud.
 */
function pluginName(p: unknown): string {
  if (typeof p === "string") return p;
  if (typeof p === "object" && p !== null && "name" in p) {
    const name = (p as { name: unknown }).name;
    if (typeof name === "string") return name;
  }
  return "<unknown>";
}

/**
 * Fail-fast self-check for the plugin order (P5 — D-32 / D-31).
 * The `collectors` run before `preset-default`, which runs before
 * `stabilize-ids`. Any deviation throws immediately so a future
 * refactor that silently reorders the array fails the test suite
 * (the regression guard lives in `svgo-regression.spec.ts`).
 *
 * The check is a pure function over the locked config — it does
 * not mutate the config object, does not touch SVGO, and is safe
 * to call at module load.
 */
export function assertPluginOrder(config: Config): void {
  const plugins = config.plugins ?? [];
  const expected = SANITIZER_PLUGIN_ORDER as readonly string[];
  if (plugins.length !== expected.length) {
    throw new Error(
      `sanitizer plugin order: expected ${expected.length} plugins, got ${plugins.length} (P5 / D-31 / D-32)`,
    );
  }
  for (let i = 0; i < expected.length; i += 1) {
    const want = expected[i];
    const got = pluginName(plugins[i]);
    if (got !== want) {
      throw new Error(
        `sanitizer plugin order mismatch at index ${i}: expected "${want}", got "${got}" (P5 / D-31 / D-32)`,
      );
    }
  }
}

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
 * The `matchedAllowed` Set is populated by `forbid-structure`
 * with every element name that fell inside the closed D-31
 * allow-list; the orchestrator converts it to a sorted array
 * for the public report's `allowed_elements` field.
 *
 * @param violations    - the closure-scoped collector array.
 * @param assetId       - the asset_id of the sanitized SVG.
 * @param matchedAllowed - the closure-scoped Set populated by
 *                        forbid-structure (D-31 allow-list hits).
 */
export function buildSanitizerConfig(
  violations: CollectedViolation[],
  assetId: string,
  matchedAllowed: Set<string> = new Set(),
): Config {
  return {
    multipass: true,
    floatPrecision: 4,
    plugins: [
      forbidTextPlugin(violations),
      forbidRasterPlugin(violations),
      forbidForeignObjectPlugin(violations),
      forbidStructurePlugin(violations, matchedAllowed),
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

/** Re-export the `Plugin` type for callers that build ad-hoc configs. */
export type { Plugin };
