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
 * stripped (P4). The plugin order is locked in `config.ts`
 * and the `assertPluginOrder` self-check fires on every call
 * so a future reorder breaks loudly.
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
 *
 * **Collect-all doctrine (P4 — never first-fail):** the
 * `violations` array is shared across every collector AND
 * across both passes. A single SVG fragment that violates
 * two gates yields two entries in the same report — the
 * self-consistency spec asserts the collect-all invariant
 * with a two-gate fixture.
 *
 * **`allowed_elements` population:** the D-31 allow-list hits
 * are collected in a `Set` (closure-shared with the
 * `forbid-structure` plugin) and converted to a sorted array
 * on the way out. An empty array with `ok=true` is a true
 * "no element matched the allow-list" report; a populated
 * array is the byte-stable subset of D-31 allow-list names
 * that appeared in the input.
 */

import type { SanitizeRequest, SanitizeResult } from "../rpc/contracts/sanitizer.schema.js";
import { assertPluginOrder, buildSanitizerConfig, runOptimize } from "./config.js";
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
  // SAN-01 empty edge — empty or null SVG input is a structured
  // validation rejection (never a pass, never a thrown error).
  // The schema (SanitizeRequestSchema.svg: z.string().min(1))
  // rejects empty input at the boundary, but a defensive
  // runtime check keeps the function throw-free even when a
  // caller bypasses the schema. The result is `ok=false` with
  // a `validation_error` code and a single `forbidden-element`
  // violation (semantically: no allow-listed element exists in
  // an empty input — the gate's contract holds).
  if (typeof request.svg !== "string" || request.svg.length === 0) {
    return {
      ok: false,
      report: {
        allowed_elements: [],
        violations: [
          {
            category: "forbidden-element",
            element_path: "svg",
            message: `empty or null svg input is forbidden (SAN-01) — sanitizeSvg requires a non-empty SVG string`,
          },
        ],
        input_element_count: 0,
      },
      code: "validation_error",
    };
  }

  // The shared collector — passed to every plugin by reference.
  // `matchedAllowed` is the closure-scoped accumulator the
  // forbid-structure plugin populates with every D-31 allow-list
  // name it sees; we convert the Set to a sorted array on the way
  // out (D-23 byte-stability — sorted, never iteration-order).
  const violations: CollectedViolation[] = [];
  const matchedAllowed: Set<string> = new Set();
  const report: CollectedReport = {
    allowed_elements: [],
    violations,
    input_element_count: countElements(request.svg),
  };

  // Pass 1 — collect violations only. No `preset-default`, no
  // `stabilize-ids` (those run in pass 2). The four forbid-*
  // plugins run sequentially against the raw SVG.
  const collectConfig = buildSanitizerConfig(
    violations,
    request.asset_id,
    matchedAllowed,
  );
  // Self-check the order BEFORE the optimize pass — a future
  // reorder that breaks the gate must fail loud, not silently
  // accept the SVG (P5 — D-31 / D-32 / ADR-02).
  assertPluginOrder(collectConfig);
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
      report: finalizeReport(report, matchedAllowed),
      code: "sanitize_rejected",
    };
  }

  // Pass 2 — full locked config (collectors + preset-default +
  // stabilize-ids). Collectors still run first (their entries
  // are appended to the same `violations` array), but on a
  // known-clean tree they record nothing; the preset does its
  // mutations; `stabilize-ids` asserts the D-32 scheme.
  const fullConfig = buildSanitizerConfig(
    violations,
    request.asset_id,
    matchedAllowed,
  );
  assertPluginOrder(fullConfig);
  const optimized = runOptimize(request.svg, fullConfig);

  return {
    ok: true,
    svg: optimized,
    report: finalizeReport(report, matchedAllowed),
  };
}

/**
 * Freeze the report's `allowed_elements` from the closure-scoped
 * `Set` — sorted alphabetically for byte-stability, filtered to
 * string entries (D-23 — sorted, never iteration-order).
 */
function finalizeReport(report: CollectedReport, matchedAllowed: Set<string>): {
  allowed_elements: string[];
  violations: CollectedViolation[];
  input_element_count: number;
} {
  return toSanitizeReport({
    ...report,
    allowed_elements: [...matchedAllowed].sort(),
  });
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
