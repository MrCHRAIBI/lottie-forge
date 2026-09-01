/**
 * Sanitizer constraint-report types — the closed violation surface
 * the sanitizer collects across all visitor plugins.
 *
 * **Re-exported shape** mirrors `SanitizeViolationSchema` and
 * `SanitizeReportSchema` from
 * `src/rpc/contracts/sanitizer.schema.ts`. This module exposes
 * the internal-collector shape — same fields, same closed
 * category literal — so the SVGO visitor plugins can record
 * violations without re-importing the schema (the plugins must
 * be tree-shakeable and zero-dep).
 *
 * **Module-level invariant:** every category literal here MUST be
 * a member of `SANITIZER_VIOLATION_CATEGORIES` in
 * `sanitizer.schema.ts` (the closed literal in the Phase 3 frozen
 * contract). A future category is a contract bump (D-29 / D-36
 * same-commit doctrine).
 */

import type {
  SanitizeReport,
  SanitizeResult,
  SanitizerViolationCategory,
  SanitizeViolation,
} from "../rpc/contracts/sanitizer.schema.js";

/**
 * The internal-collector entry — structurally identical to
 * `SanitizeViolation` but typed as a mutable record so the SVGO
 * visitor plugins can push entries without a per-call object
 * spread. The `sanitize.ts` orchestrator converts the array
 * back to `SanitizeViolation[]` for the public result envelope.
 */
export interface CollectedViolation {
  category: SanitizerViolationCategory;
  element_path: string;
  message: string;
}

/**
 * The internal-collector report — same shape as `SanitizeReport`
 * but mutable. The orchestrator freezes the array on the way out
 * (D-23 byte-stability).
 */
export interface CollectedReport {
  allowed_elements: string[];
  violations: CollectedViolation[];
  input_element_count: number;
}

/**
 * A minimal snapshot of one element on the SVGO XAST — the
 * plugins need only the element name + a breadcrumb path to
 * record a violation. The path is built by walking the parent
 * chain (SVGO does not expose a built-in path API; this
 * snapshot is sufficient for the Phase 3 hygiene gate).
 */
export interface ElementSnapshot {
  name: string;
  /** SLash-separated breadcrumb of element names from the root. */
  path: string;
  attributes: Record<string, string>;
}

/**
 * Cast helper — converts an internal-collector violation to the
 * frozen public schema type. The cast is exact (the two
 * interfaces share every field name + every literal); the
 * explicit conversion keeps the schema import out of every
 * plugin file.
 */
export function toSanitizeViolation(v: CollectedViolation): SanitizeViolation {
  return { category: v.category, element_path: v.element_path, message: v.message };
}

/**
 * Cast helper — converts the internal-collector report to the
 * frozen public schema type. `allowed_elements` is filtered to
 * string-only entries (the collector may carry a wider entry
 * during the gate pass; the public surface is `string[]`).
 */
export function toSanitizeReport(r: CollectedReport): SanitizeReport {
  return {
    allowed_elements: r.allowed_elements.filter((s): s is string => typeof s === "string"),
    violations: r.violations.map(toSanitizeViolation),
    input_element_count: r.input_element_count,
  };
}

/**
 * Re-export the public types for callers that prefer a single
 * import surface.
 */
export type { SanitizeReport, SanitizeResult, SanitizerViolationCategory, SanitizeViolation };
