import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DIRECTION_VALUES, MotionRecipeSchema, TOKEN_NAME_PATTERN } from "./recipe.schema.js";
import { loadRejectionCases } from "./rejection-cases.js";

/**
 * Bridge step 2 of 3 — zod validates and re-emits the Python-exported
 * MotionRecipe JSON, asserts schema-key parity, and mirrors the rejection
 * harness.
 *
 * Ordered bridge chain (recipe):
 *   1. `pytest -k export`           -> fixtures/bridge/recipe.from-python.json
 *                                       + recipe.schema-keys.json
 *   2. `npx vitest run recipe`      (this file)  ->
 *                                       fixtures/bridge/recipe.from-ts.json
 *   3. `pytest -k reimport`         -> strict Pydantic re-validates
 *
 * Hard failure on missing export artifact -- never skip (§4.2). The
 * artifact path resolution is rooted at the repo root so vitest can be run
 * from anywhere (CI runs `npx vitest run` with cwd = repo root).
 *
 * The WR-06 pinned asymmetry is documented here in comments and tested on
 * the TypeScript side: zod `z.number().int()` accepts an integral float
 * (1200.0) which Pydantic strict rejects. The Python mirror in
 * `tests/bridge/test_recipe_bridge.py` enforces the strict-rejection half.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");
const BRIDGE_DIR = join(REPO_ROOT, "fixtures", "bridge");
const FROM_PYTHON = join(BRIDGE_DIR, "recipe.from-python.json");
const FROM_TS = join(BRIDGE_DIR, "recipe.from-ts.json");
const SCHEMA_KEYS = join(BRIDGE_DIR, "recipe.schema-keys.json");

describe("recipe schema mirror", () => {
  it("exposes the locked regex and direction constants (parity contract)", () => {
    expect(TOKEN_NAME_PATTERN.source).toBe("^[a-z][a-z0-9-]*$");
    expect([...DIRECTION_VALUES]).toEqual(["up", "down", "left", "right", "none"]);
  });

  it("validates and re-emits the Python-exported MotionRecipe", () => {
    if (!existsSync(FROM_PYTHON)) {
      throw new Error(
        `Bridge export artifact missing at ${FROM_PYTHON} -- run ` +
          "`python -m pytest tests/bridge/test_recipe_bridge.py -k export` first.",
      );
    }
    const exportedRaw = readFileSync(FROM_PYTHON, "utf-8");
    const parsed = MotionRecipeSchema.parse(JSON.parse(exportedRaw));
    // Re-emit via JSON.stringify so Pydantic strict re-validation sees the
    // exact same payload byte-for-byte on step 3.
    writeFileSync(FROM_TS, JSON.stringify(parsed));
    expect(existsSync(FROM_TS)).toBe(true);
  });

  it("preserves schema-key parity with the Pydantic model_json_schema()", () => {
    if (!existsSync(SCHEMA_KEYS)) {
      throw new Error(
        `Schema-keys artifact missing at ${SCHEMA_KEYS} -- run the export step first.`,
      );
    }
    const expectedKeys = JSON.parse(readFileSync(SCHEMA_KEYS, "utf-8")) as string[];
    const actualKeys = Object.keys(MotionRecipeSchema.shape).sort();
    expect(actualKeys).toEqual(expectedKeys);
  });

  /**
   * WR-06 pinned asymmetry — TypeScript half (§4.9).
   *
   * `z.number().int()` does NOT reject `1200.0` (an integral float passes the
   * integer-typed check because `Number.isInteger(1200.0) === true`).
   * Pydantic strict does reject it. The asymmetry is intentional and
   * documented here — the strict re-validation at the Python re-import step
   * is the authority. Any TS-side payload carrying an integral float is
   * caught by `tests/bridge/test_recipe_bridge.py::test_wr06_*`.
   *
   * This test therefore asserts **acceptance**, with a comment that links
   * the asymmetry to its Python mirror.
   */
  it("WR-06 (TS half): accepts an integral float for duration_ms (asymmetry)", () => {
    const payload = {
      recipe_id: "fade",
      family: "transform",
      duration_ms: 1200.0, // intentional: integral float — Pydantic strict rejects
      easing: "ease-in-out",
      params: { amplitude: 0.5, direction: "up", loops: 1 },
      theme_anchors: [],
    };
    const result = MotionRecipeSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

/**
 * Rejection harness (D-06/D-08) — mirror of the pytest suite
 * `tests/bridge/test_recipe_bridge.py::test_bridge_rejection_case`.
 *
 * Both suites consume the same JSON file
 * (`fixtures/rejection-cases/recipe.json`) via the loaders in
 * `tests/bridge/rejection_loader.py` and `src/rpc/contracts/rejection-cases.ts`
 * — one source, zero drift.
 *
 * Assertion rules (D-08):
 *   - The payload must always be rejected by zod safeParse.
 *   - When `expect_paths` is present, each expected path must appear among
 *     the `result.error.issues[].path` tuples (membership only — never a
 *     message-text comparison).
 *
 * Note: the WR-06 case (integral float) does NOT appear in the shared JSON
 * because zod accepts it — that asymmetry is documented as a separate,
 * dedicated two-half test pair.
 */
describe("recipe rejection harness (mirror of pytest)", () => {
  const cases = loadRejectionCases("recipe");

  it.each(cases.map((c) => [c.case_id, c]))(
    "%s -> zod rejects the shared payload",
    (_caseId, c) => {
      const result = MotionRecipeSchema.safeParse(c.payload);
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
