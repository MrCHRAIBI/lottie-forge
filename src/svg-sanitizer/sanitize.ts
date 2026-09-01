/**
 * SVG Sanitizer — `sanitizeSvg(request)` entry point.
 *
 * **D-17 — chained-call surface:** the sanitizer accepts ONLY
 * the raw SVG string + the asset's stable id. The sanitizer does
 * not receive the RenderSpec (it does its own structural gate;
 * the caller chains `motion.compile` → `svg.sanitize`, two
 * separate methods).
 *
 * **D-31, ADR-02, SAN-01/02/05 — gate pass BEFORE mutation:**
 * the sanitizer runs the collector plugins (forbid-* family)
 * BEFORE `preset-default` mutates the tree. Any violation is
 * reported and the sanitize fails — the SVG is NEVER silently
 * stripped (P4). The plugin order is locked in `config.ts`.
 *
 * **Two-pass strategy:**
 *
 *   pass 1 (collect-only): run the four forbid-* plugins; any
 *     violation → return `ok=false` with the report; no
 *     optimization happens.
 *
 *   pass 2 (optimize): only if pass 1 reported zero violations,
 *     run the full locked config (collectors + preset-default
 *     + stabilize-ids) and return `ok=true` with the optimized
 *     SVG.
 *
 * The split guarantees the collect-then-reject gate fires
 * BEFORE any mutation. If a single `optimize()` call ran all
 * plugins, the `preset-default` mutation would happen even when
 * the gate rejected — the SVGO output would be a mutated form
 * of an SVG we then discard anyway, with a wasted optimize
 * pass. The two-pass strategy is also what makes the
 * sanitize-rejected return value byte-stable (no optimized
 * bytes leaked into the rejection path).
 */

import type { SanitizeRequest, SanitizeResult } from "../rpc/contracts/sanitizer.schema.js";
import { buildSanitizerConfig, runOptimize } from "./config.js";
import {
  type CollectedReport,
  type CollectedViolation,
  toSanitizeReport,
} from "./constraint-report.js";

/**
 * Sanitize an SVG request — entry point (D-17, SAN-01..05).
 *
 * @param request - the `SanitizeRequest` (asset_id + raw SVG).
 * @returns the `SanitizeResult` envelope:
 *   - `ok=true` carries the optimized SVG + an empty-violations
 *     report;
 *   - `ok=false` carries the report (with at least one violation)
 *     and the `sanitize_rejected` code.
 */
export function sanitizeSvg(request: SanitizeRequest): SanitizeResult {
  // The shared collector — passed to every plugin by reference.
  const violations: CollectedViolation[] = [];
  const report: CollectedReport = {
    allowed_elements: [],
    violations,
    input_element_count: countElements(request.svg),
  };

  // Pass 1 — collect violations only. No `preset-default`, no
  // `stabilize-ids` (those run in pass 2). The four forbid-*
  // plugins run sequentially against the raw SVG.
  const collectConfig = buildSanitizerConfig(violations, request.asset_id);
  const collectPlugins = collectConfig.plugins?.slice(0, 4) ?? [];
  const collectOnly: typeof collectConfig = {
    multipass: false,
    floatPrecision: 4,
    plugins: collectPlugins,
  };
  runOptimize(request.svg, collectOnly);

  if (violations.length > 0) {
    return {
      ok: false,
      report: toSanitizeReport(report),
      code: "sanitize_rejected",
    };
  }

  // Pass 2 — full locked config (collectors + preset-default +
  // stabilize-ids). Collectors still run first (their entries
  // are appended to the same `violations` array), but on a
  // known-clean tree they record nothing; the preset does its
  // mutations; `stabilize-ids` asserts the D-32 scheme.
  const fullConfig = buildSanitizerConfig(violations, request.asset_id);
  const optimized = runOptimize(request.svg, fullConfig);

  return {
    ok: true,
    svg: optimized,
    report: toSanitizeReport(report),
  };
}

/**
 * Count the elements in an SVG string for the report's
 * `input_element_count` field. The count is a coarse
 * cardinality proxy (the regex counts `<` occurrences in
 * tag positions); it does not parse XML. The plan's
 * self-consistency contract (D-31) requires the count to be
 * > 0 for any non-empty SVG and stable across invocations of
 * the same input.
 */
function countElements(svg: string): number {
  // Count `<word` where `word` starts with a letter (an opening
  // tag) or `</word` (a closing tag). The regex is intentionally
  // loose — the count is a sanity signal, not a parse.
  const matches = svg.match(/<[!?/]?[A-Za-z]/g);
  return matches?.length ?? 0;
}
