import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadRejectionCases } from "./rejection-cases.js";
import {
  RADIUS_PICK_VALUES,
  STROKE_PICK_VALUES,
  StyleRefinementSchema,
} from "./style-refinement.schema.js";

/**
 * Local mirror of the pytest structural rejets in
 * `tests/domain/test_style_refinement.py` — Task 2 ships local mirror tests
 * here; Task 3 wires both sides to the same shared JSON rejection fixture.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");
const BRIDGE_DIR = join(REPO_ROOT, "fixtures", "bridge");
const SCHEMA_KEYS = join(BRIDGE_DIR, "style-refinement.schema-keys.json");

describe("style-refinement schema mirror", () => {
  it("preserves schema-key parity with the Pydantic model_json_schema()", () => {
    if (!existsSync(SCHEMA_KEYS)) {
      throw new Error(
        `Schema-keys artifact missing at ${SCHEMA_KEYS} -- run the export step first.`,
      );
    }
    const expectedKeys = JSON.parse(readFileSync(SCHEMA_KEYS, "utf-8")) as string[];
    const actualKeys = Object.keys(StyleRefinementSchema.shape).sort();
    expect(actualKeys).toEqual(expectedKeys);
  });

  it("exposes the locked literal constants (parity contract)", () => {
    expect([...STROKE_PICK_VALUES]).toEqual(["thin", "default", "bold"]);
    expect([...RADIUS_PICK_VALUES]).toEqual(["small", "medium", "large"]);
  });

  it("accepts a default-construction payload", () => {
    const result = StyleRefinementSchema.safeParse({ sub_palette: ["accent"] });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.sub_palette).toEqual(["accent"]);
    expect(result.data.motif).toBeUndefined();
    expect(result.data.stroke_pick).toBe("default");
    expect(result.data.radius_pick).toBe("medium");
    expect(result.data.accent_weight).toBe(0.5);
  });

  it("accepts a fully-specified payload", () => {
    const result = StyleRefinementSchema.safeParse({
      sub_palette: ["accent", "surface"],
      motif: "sunset",
      stroke_pick: "bold",
      radius_pick: "large",
      accent_weight: 0.75,
    });
    expect(result.success).toBe(true);
  });

  // ---- KebabToken rejets in sub_palette / motif (mirror of pytest) ----

  it("rejects '#fff' in sub_palette (KebabToken)", () => {
    const result = StyleRefinementSchema.safeParse({ sub_palette: ["#fff"] });
    expect(result.success).toBe(false);
  });

  it("rejects '<path' in sub_palette (KebabToken)", () => {
    const result = StyleRefinementSchema.safeParse({ sub_palette: ["<path"] });
    expect(result.success).toBe(false);
  });

  it("rejects '#fff' in motif (KebabToken)", () => {
    const result = StyleRefinementSchema.safeParse({
      sub_palette: ["accent"],
      motif: "#fff",
    });
    expect(result.success).toBe(false);
  });

  it("rejects '<path' in motif (KebabToken)", () => {
    const result = StyleRefinementSchema.safeParse({
      sub_palette: ["accent"],
      motif: "<path",
    });
    expect(result.success).toBe(false);
  });

  // ---- Closed model rejets (extra=forbid, Literal bounds) ----

  it("rejects an unknown top-level key (strict)", () => {
    const result = StyleRefinementSchema.safeParse({
      sub_palette: ["accent"],
      hex_override: "#fff",
    });
    expect(result.success).toBe(false);
  });

  it("rejects 'thick' in stroke_pick (closed Literal)", () => {
    const result = StyleRefinementSchema.safeParse({
      sub_palette: ["accent"],
      stroke_pick: "thick",
    });
    expect(result.success).toBe(false);
  });

  it("rejects 'huge' in radius_pick (closed Literal)", () => {
    const result = StyleRefinementSchema.safeParse({
      sub_palette: ["accent"],
      radius_pick: "huge",
    });
    expect(result.success).toBe(false);
  });

  // ---- accent_weight bounds ----

  it("rejects accent_weight = 1.5 (above max)", () => {
    const result = StyleRefinementSchema.safeParse({
      sub_palette: ["accent"],
      accent_weight: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects accent_weight = -0.1 (below min)", () => {
    const result = StyleRefinementSchema.safeParse({
      sub_palette: ["accent"],
      accent_weight: -0.1,
    });
    expect(result.success).toBe(false);
  });

  // ---- sub_palette length bounds ----

  it("rejects an empty sub_palette (min_length=1)", () => {
    const result = StyleRefinementSchema.safeParse({ sub_palette: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a 17-entry sub_palette (max_length=16)", () => {
    const result = StyleRefinementSchema.safeParse({
      sub_palette: Array.from({ length: 17 }, (_, i) => `token-${String(i).padStart(2, "0")}`),
    });
    expect(result.success).toBe(false);
  });
});

/**
 * Rejection harness (D-06/D-08) — mirror of the pytest suite
 * `tests/domain/test_style_refinement.py::test_rejection_case`.
 *
 * Both suites consume the same JSON file
 * (`fixtures/rejection-cases/style-refinement.json`) via the loaders in
 * `tests/bridge/rejection_loader.py` and `src/rpc/contracts/rejection-cases.ts`
 * — one source, zero drift.
 *
 * Assertion rules (D-08):
 *   - The payload must always be rejected by zod safeParse.
 *   - When `expect_paths` is present, each expected path must appear among
 *     the `result.error.issues[].path` tuples (membership only — never a
 *     message-text comparison).
 */
describe("style-refinement rejection harness (mirror of pytest)", () => {
  const cases = loadRejectionCases("style-refinement");

  it.each(cases.map((c) => [c.case_id, c]))(
    "%s -> zod rejects the shared payload",
    (_caseId, c) => {
      const result = StyleRefinementSchema.safeParse(c.payload);
      expect(result.success).toBe(false);
      if (result.success) return; // narrow for TS

      const actualPaths = new Set(result.error.issues.map((issue) => JSON.stringify(issue.path)));
      for (const expected of c.expect_paths) {
        const key = JSON.stringify(expected);
        expect(actualPaths.has(key)).toBe(true);
      }
    },
  );
});
