import { z } from "zod";

/**
 * SVG Sanitizer request/report schemas — Phase 3 frozen contract.
 *
 * The sanitizer is the architectural hygiene gate (SAN-01..05, §6.4): every
 * SVG crossing into a pack is collected-then-rejected (`sanitize_rejected`
 * code, never silent stripping). The schemas here pin the boundary so the
 * RPC server cannot accept a malformed request or emit a malformed report.
 *
 * Decisions implemented (Phase 3 CONTEXT.md):
 *
 * - D-17 — `SanitizeRequest` carries ONLY the raw SVG string + the
 *   asset's stable id; the sanitizer does not receive the RenderSpec
 *   (it does its own structural gate; the caller chains
 *   `motion.compile` -> `svg.sanitize`, two separate methods).
 * - D-22 — `width` / `height` are not present (the input is the raw
 *   companion SVG; viewBox is the only dimension the contract carries).
 * - D-31 — `<title>` / `<desc>` are explicitly part of the allow-list
 *   (regression-tested by the Phase 3 SVGO overrides, SAN-04); the
 *   report does NOT silently strip them.
 * - D-32 — `asset_id` is reused from the asset-spec contract pattern
 *   (same regex). The sanitizer does not own asset identity; the
 *   caller passes it for traceability.
 * - D-36 — every error carries a `code ∈ {validation_error |
 *   sanitize_rejected | unsupported_feature | internal |
 *   protocol_error | method_not_found}` literal (closed enum).
 *
 * ADR-01 — no SMIL or CSS-keyframe animation channels are valid in the
 * input SVG; the sanitizer reports them as `unsupported_feature`.
 */

import { ASSET_ID_PATTERN } from "./asset-spec.schema.js";

/**
 * Closed enum of violation codes the sanitizer emits (D-28/D-36).
 * Matches the protocol-wide error code set so the RPC envelope can be
 * typed identically on both sides of the bridge. The Phase 7 Pydantic
 * mirror mirrors this list verbatim — a code set change requires
 * the same-commit scan.
 */
export const SANITIZER_ERROR_CODES = [
  "validation_error",
  "unsupported_feature",
  "sanitize_rejected",
  "internal",
  "protocol_error",
  "method_not_found",
] as const;

export type SanitizerErrorCode = (typeof SANITIZER_ERROR_CODES)[number];

export const SanitizerErrorCodeSchema = z.enum(SANITIZER_ERROR_CODES);

/**
 * D-17 / SAN-01 — the sanitizer contract. SVG input is required and
 * must be non-empty (an empty / null input is a structured
 * `sanitize_rejected`, never a pass — empty-edge). `asset_id` is
 * carried for traceability, never as a sanitizer-side identity.
 *
 * The exact set of violation categories the sanitizer raises is
 * declared as a closed literal below. Adding a new category is a
 * schema bump (the same-commit scan in `tests/domain/` will catch a
 * literal-mirror mismatch on the Python side in Phase 7).
 */
export const SANITIZER_VIOLATION_CATEGORIES = [
  "forbidden-text",
  "forbidden-raster",
  "forbidden-foreignobject",
  "forbidden-script",
  "forbidden-handler",
  "forbidden-xlink-href",
  "forbidden-data-uri",
  "forbidden-element",
  "forbidden-attribute",
  "forbidden-namespace",
  "forbidden-comment",
  "forbidden-data-attribute",
  "forbidden-dimension",
  "id-mismatch",
] as const;

export type SanitizerViolationCategory = (typeof SANITIZER_VIOLATION_CATEGORIES)[number];

export const SanitizerViolationCategorySchema = z.enum(SANITIZER_VIOLATION_CATEGORIES);

export const SanitizeRequestSchema = z.strictObject({
  asset_id: z.string().regex(ASSET_ID_PATTERN).max(6),
  svg: z.string().min(1),
});

/**
 * One violation reported by the sanitizer. The gate collects ALL
 * violations across all visitors BEFORE any mutation attempt (P4:
 * never silently remove). Each violation carries an explicit category
 * (closed literal) and the precise element path where the parser saw
 * it.
 */
export const SanitizeViolationSchema = z.strictObject({
  category: SanitizerViolationCategorySchema,
  element_path: z.string().min(1),
  message: z.string().min(1),
});

/**
 * The structured sanitize report. `allowed_elements` is the
 * additive allow-list that was matched (sanity signal: the counter
 * on accepted elements should match the input count when the
 * SVG is well-formed); `violations` is the closed-all list — an
 * empty array is the gate's pass signal.
 */
export const SanitizeReportSchema = z.strictObject({
  allowed_elements: z.array(z.string()).min(0),
  violations: z.array(SanitizeViolationSchema),
  input_element_count: z.number().int().min(0),
});

/**
 * The sanitizer's RPC result envelope. `ok=true` carries the
 * re-validated SVG text + the empty-violations report. `ok=false`
 * carries the report (with at least one violation) and the same
 * `sanitize_rejected` code (one envelope matches both internal
 * fail-loud flavors).
 *
 * The sanitizer never returns `ok=true` with a non-empty
 * `violations` array, and never returns `ok=false` without at
 * least one violation. The cross-field rule below pins that
 * invariant.
 */
export const SanitizeResultSchema = z
  .strictObject({
    ok: z.boolean(),
    svg: z.string().min(1).optional(),
    report: SanitizeReportSchema,
    code: SanitizerErrorCodeSchema.optional(),
  })
  .superRefine((result, ctx) => {
    if (result.ok && result.report.violations.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["violations"],
        message: "ok=true requires an empty violations list",
      });
    }
    if (!result.ok && result.report.violations.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["violations"],
        message: "ok=false requires at least one violation",
      });
    }
    if (result.ok && result.svg === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["svg"],
        message: "ok=true requires svg to be present",
      });
    }
  });

export type SanitizeRequest = z.infer<typeof SanitizeRequestSchema>;
export type SanitizeViolation = z.infer<typeof SanitizeViolationSchema>;
export type SanitizeReport = z.infer<typeof SanitizeReportSchema>;
export type SanitizeResult = z.infer<typeof SanitizeResultSchema>;
