import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRejectionCases } from "./rejection-cases.js";
import {
  HEX_COLOR_PATTERN,
  STYLE_VERSION_PATTERN,
  StyleSpecSchema,
  TOKEN_NAME_PATTERN,
} from "./style-spec.schema.js";

/**
 * Bridge step 2 of 3 -- zod validates and re-emits the Python-exported JSON.
 *
 * Ordered bridge chain:
 *   1. `pytest -k export`           -> fixtures/bridge/style-spec.from-python.json
 *   2. `npx vitest run style-spec`  (this file)  -> fixtures/bridge/style-spec.from-ts.json
 *   3. `pytest -k reimport`         -> strict Pydantic re-validates the TS artifact
 *
 * Hard failure on missing export artifact -- never skip (see §4.2). The
 * artifact path resolution is rooted at the repo root so vitest can be run
 * from anywhere (CI runs `npx vitest run` with cwd = repo root).
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");
const BRIDGE_DIR = join(REPO_ROOT, "fixtures", "bridge");
const FROM_PYTHON = join(BRIDGE_DIR, "style-spec.from-python.json");
const FROM_TS = join(BRIDGE_DIR, "style-spec.from-ts.json");
const SCHEMA_KEYS = join(BRIDGE_DIR, "style-spec.schema-keys.json");

describe("style-spec schema mirror", () => {
  it("exposes the locked regex constants (parity contract)", () => {
    expect(STYLE_VERSION_PATTERN.source).toBe("^\\d+\\.\\d+\\.\\d+$");
    expect(TOKEN_NAME_PATTERN.source).toBe("^[a-z][a-z0-9-]*$");
    expect(HEX_COLOR_PATTERN.source).toBe("^#[0-9a-fA-F]{6}$");
  });

  it("validates and re-emits the Python-exported StyleSpec", () => {
    if (!existsSync(FROM_PYTHON)) {
      throw new Error(
        `Bridge export artifact missing at ${FROM_PYTHON} -- run ` +
          "`python -m pytest tests/bridge/test_style_spec_bridge.py -k export` first.",
      );
    }
    const exportedRaw = readFileSync(FROM_PYTHON, "utf-8");
    const parsed = StyleSpecSchema.parse(JSON.parse(exportedRaw));
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
    const actualKeys = Object.keys(StyleSpecSchema.shape).sort();
    expect(actualKeys).toEqual(expectedKeys);
  });
});

/**
 * Rejection harness (D-06/D-08) -- mirror of the pytest suite
 * ``tests/bridge/test_style_spec_bridge.py::test_bridge_rejection_case``.
 *
 * Both suites consume the same JSON file
 * (``fixtures/rejection-cases/style-spec.json``) via the loaders in
 * ``tests/bridge/rejection_loader.py`` and ``src/rpc/contracts/rejection-cases.ts``
 * -- one source, zero drift.
 *
 * Assertion rules (D-08):
 *   - The payload must always be rejected by zod safeParse.
 *   - When ``expect_paths`` is present, each expected path must appear among
 *     the ``result.error.issues[].path`` tuples (membership only -- never a
 *     message-text comparison).
 */
describe("style-spec rejection harness (mirror of pytest)", () => {
  const cases = loadRejectionCases("style-spec");

  it.each(cases.map((c) => [c.case_id, c]))(
    "%s -> zod rejects the shared payload",
    (_caseId, c) => {
      const result = StyleSpecSchema.safeParse(c.payload);
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
