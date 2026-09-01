import { describe, expect, it } from "vitest";

import {
  SANITIZER_ERROR_CODES,
  SANITIZER_VIOLATION_CATEGORIES,
  SanitizeReportSchema,
  SanitizeRequestSchema,
  SanitizeResultSchema,
  SanitizeViolationSchema,
} from "./sanitizer.schema.js";

/**
 * Sanitizer contract suite — pins the request/report/envelope shape and
 * the closed enum of violation categories. The runtime plumbing (SVGO
 * 4 plugin order, visitor shape) is built in plan 03-07; this file pins
 * the boundary TypeScript types the plugin emits into.
 */

describe("SanitizeRequestSchema — D-17 / SAN-01 empty edge", () => {
  it("accepts a non-empty SVG body with a valid asset_id", () => {
    const result = SanitizeRequestSchema.safeParse({
      asset_id: "a-001",
      svg: "<svg viewBox='0 0 16 16'/>",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty SVG (SAN-01 empty edge — never a pass)", () => {
    const result = SanitizeRequestSchema.safeParse({ asset_id: "a-001", svg: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed asset_id (mirrors ASSET_ID_PATTERN)", () => {
    const result = SanitizeRequestSchema.safeParse({
      asset_id: "b-12",
      svg: "<svg/>",
    });
    expect(result.success).toBe(false);
  });
});

describe("SanitizeViolationSchema — closed category enum", () => {
  it("accepts every category in the closed literal", () => {
    for (const cat of SANITIZER_VIOLATION_CATEGORIES) {
      const result = SanitizeViolationSchema.safeParse({
        category: cat,
        element_path: "svg > g > text",
        message: `detected ${cat}`,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an unknown violation category (closed enum)", () => {
    const result = SanitizeViolationSchema.safeParse({
      category: "totally-fine-element",
      element_path: "svg",
      message: "nope",
    });
    expect(result.success).toBe(false);
  });
});

describe("SanitizeReportSchema — additive allow-list + closed violations", () => {
  it("accepts an empty violations list (the gate's pass signal)", () => {
    const result = SanitizeReportSchema.safeParse({
      allowed_elements: ["svg", "g"],
      violations: [],
      input_element_count: 2,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a non-empty violations list", () => {
    const result = SanitizeReportSchema.safeParse({
      allowed_elements: ["svg", "g"],
      violations: [
        {
          category: "forbidden-text",
          element_path: "svg > text",
          message: "<text> is in the reject list",
        },
      ],
      input_element_count: 3,
    });
    expect(result.success).toBe(true);
  });
});

describe("SanitizeResultSchema — invariant: ok=true <=> empty violations + svg present", () => {
  it("ok=true requires an svg payload", () => {
    const result = SanitizeResultSchema.safeParse({
      ok: true,
      report: { allowed_elements: ["svg"], violations: [], input_element_count: 1 },
    });
    expect(result.success).toBe(false);
  });

  it("ok=true requires an empty violations list", () => {
    const result = SanitizeResultSchema.safeParse({
      ok: true,
      svg: "<svg/>",
      report: {
        allowed_elements: ["svg"],
        violations: [{ category: "forbidden-text", element_path: "svg > text", message: "no" }],
        input_element_count: 2,
      },
    });
    expect(result.success).toBe(false);
  });

  it("ok=false requires at least one violation", () => {
    const result = SanitizeResultSchema.safeParse({
      ok: false,
      report: { allowed_elements: ["svg"], violations: [], input_element_count: 1 },
    });
    expect(result.success).toBe(false);
  });

  it("accepts the gate-pass shape (ok=true, empty violations, svg present)", () => {
    const result = SanitizeResultSchema.safeParse({
      ok: true,
      svg: "<svg viewBox='0 0 16 16'/>",
      report: { allowed_elements: ["svg"], violations: [], input_element_count: 1 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts the gate-fail shape (ok=false, non-empty violations, code present)", () => {
    const result = SanitizeResultSchema.safeParse({
      ok: false,
      code: "sanitize_rejected",
      report: {
        allowed_elements: ["svg"],
        violations: [
          { category: "forbidden-raster", element_path: "svg > image", message: "raster" },
        ],
        input_element_count: 2,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("SANITIZER_ERROR_CODES — closed literal per D-28/D-36", () => {
  it("exposes the protocol-wide code set as a closed tuple", () => {
    expect([...SANITIZER_ERROR_CODES]).toEqual([
      "validation_error",
      "unsupported_feature",
      "sanitize_rejected",
      "internal",
      "protocol_error",
      "method_not_found",
    ]);
  });
});
