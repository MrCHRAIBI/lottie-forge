import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ASSET_ID_PATTERN,
  AssetSpecSchema,
  SHA256_HEX_PATTERN,
  SHAPE_GROUP_NAME_PATTERN,
  STYLE_REF_PATTERN,
} from "./asset-spec.schema.js";
import { loadRejectionCases } from "./rejection-cases.js";

/**
 * Bridge step 2 of 3 -- zod validates and re-emits the Python-exported
 * AssetSpec JSON, asserts schema-key parity, and mirrors the rejection
 * harness.
 *
 * Ordered bridge chain (asset-spec):
 *   1. `pytest -k export`              -> fixtures/bridge/asset-spec.from-python.json
 *                                          + asset-spec.schema-keys.json
 *   2. `npx vitest run asset-spec`     (this file) ->
 *                                          fixtures/bridge/asset-spec.from-ts.json
 *   3. `pytest -k reimport`            -> strict Pydantic re-validates
 *
 * Hard failure on missing export artifact -- never skip (§4.2). The
 * artifact path resolution is rooted at the repo root so vitest can be run
 * from anywhere (CI runs `npx vitest run` with cwd = repo root).
 *
 * Rejection harness (D-06/D-08): mirrors
 * `tests/bridge/test_asset_bridge.py::test_bridge_rejection_case`. The
 * shared JSON file (`fixtures/rejection-cases/asset-spec.json`) drives
 * both the pytest parametrize and the vitest `test.each` -- one source,
 * zero drift. The cases cover DM-03 (empty, encoding probes), STY-03
 * (pin partial / 4-segment / non-kebab), DM-02 (recipe vocabulary
 * reuse -- disco-spin rejected at the asset level), CR-01 (non-ASCII
 * shape-group name), and the ContentHashes closed 4-field model
 * (uppercase / short / non-hex / 5th-key injected).
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");
const BRIDGE_DIR = join(REPO_ROOT, "fixtures", "bridge");
const FROM_PYTHON = join(BRIDGE_DIR, "asset-spec.from-python.json");
const FROM_TS = join(BRIDGE_DIR, "asset-spec.from-ts.json");
const SCHEMA_KEYS = join(BRIDGE_DIR, "asset-spec.schema-keys.json");

describe("asset-spec schema mirror", () => {
  it("exposes the locked regex constants (parity contract)", () => {
    expect(ASSET_ID_PATTERN.source).toBe("^a-\\d{3}$");
    expect(STYLE_REF_PATTERN.source).toBe("^[a-z][a-z0-9-]*@\\d+\\.\\d+\\.\\d+$");
    expect(SHA256_HEX_PATTERN.source).toBe("^[a-f0-9]{64}$");
    expect(SHAPE_GROUP_NAME_PATTERN.source).toBe("^[a-z][a-z0-9-]{2,31}$");
  });

  it("validates and re-emits the Python-exported AssetSpec", () => {
    if (!existsSync(FROM_PYTHON)) {
      throw new Error(
        `Bridge export artifact missing at ${FROM_PYTHON} -- run ` +
          "`python -m pytest tests/bridge/test_asset_bridge.py -k export` first.",
      );
    }
    const exportedRaw = readFileSync(FROM_PYTHON, "utf-8");
    const parsed = AssetSpecSchema.parse(JSON.parse(exportedRaw));
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
    const actualKeys = Object.keys(AssetSpecSchema.shape).sort();
    expect(actualKeys).toEqual(expectedKeys);
  });
});

/**
 * Rejection harness (D-06/D-08) -- mirror of the pytest suite
 * `tests/bridge/test_asset_bridge.py::test_bridge_rejection_case`.
 *
 * Both suites consume the same JSON file
 * (`fixtures/rejection-cases/asset-spec.json`) via the loaders in
 * `tests/bridge/rejection_loader.py` and `src/rpc/contracts/rejection-cases.ts`
 * -- one source, zero drift.
 *
 * Assertion rules (D-08):
 *   - The payload must always be rejected by zod safeParse.
 *   - When `expect_paths` is present, each expected path must appear among
 *     the `result.error.issues[].path` tuples (membership only -- never a
 *     message-text comparison).
 */
describe("asset-spec rejection harness (mirror of pytest)", () => {
  const cases = loadRejectionCases("asset-spec");

  it.each(cases.map((c) => [c.case_id, c]))(
    "%s -> zod rejects the shared payload",
    (_caseId, c) => {
      const result = AssetSpecSchema.safeParse(c.payload);
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
