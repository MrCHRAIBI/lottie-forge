import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  LICENSE_ID_PATTERN,
  LicenseInfoSchema,
  PACK_ID_PATTERN,
  PackManifestSchema,
  PackTotalsSchema,
} from "./pack-manifest.schema.js";
import { loadRejectionCases } from "./rejection-cases.js";

/**
 * Bridge step 2 of 3 -- zod validates and re-emits the Python-exported
 * PackManifest JSON, asserts schema-key parity, exposes the
 * regex/literal constants, and mirrors the rejection harness.
 *
 * Ordered bridge chain (pack-manifest):
 *   1. `pytest -k export`              -> fixtures/bridge/pack-manifest.from-python.json
 *                                          + pack-manifest.schema-keys.json
 *   2. `npx vitest run pack-manifest`  (this file) ->
 *                                          fixtures/bridge/pack-manifest.from-ts.json
 *   3. `pytest -k reimport`            -> strict Pydantic re-validates
 *
 * Hard failure on missing export artifact -- never skip (§4.2). The
 * artifact path resolution is rooted at the repo root so vitest can be run
 * from anywhere (CI runs `npx vitest run` with cwd = repo root).
 *
 * Rejection harness (D-06/D-08): mirrors
 * `tests/bridge/test_pack_bridge.py::test_bridge_rejection_case`. The
 * shared JSON file (`fixtures/rejection-cases/pack-manifest.json`)
 * drives both the pytest parametrize and the vitest `test.each` -- one
 * source, zero drift. The 10 cases cover IN-08 (collect-all), DM-04
 * (compte coherence, asset bounds, cost_eur range, pack_id form), LIC-01
 * (3 voies de rejet licence), and WR-01 (mono-style mismatch).
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");
const BRIDGE_DIR = join(REPO_ROOT, "fixtures", "bridge");
const FROM_PYTHON = join(BRIDGE_DIR, "pack-manifest.from-python.json");
const FROM_TS = join(BRIDGE_DIR, "pack-manifest.from-ts.json");
const SCHEMA_KEYS = join(BRIDGE_DIR, "pack-manifest.schema-keys.json");

describe("pack-manifest schema mirror", () => {
  it("exposes the locked regex constants (parity contract)", () => {
    expect(PACK_ID_PATTERN.source).toBe("^pack-[a-z][a-z0-9-]*-\\d{4}-\\d{2}-\\d{2}$");
    expect(LICENSE_ID_PATTERN.source).toBe("^[a-z0-9-]+$");
  });

  it("validates and re-emits the Python-exported PackManifest", () => {
    if (!existsSync(FROM_PYTHON)) {
      throw new Error(
        `Bridge export artifact missing at ${FROM_PYTHON} -- run ` +
          "`python -m pytest tests/bridge/test_pack_bridge.py -k export` first.",
      );
    }
    const exportedRaw = readFileSync(FROM_PYTHON, "utf-8");
    const parsed = PackManifestSchema.parse(JSON.parse(exportedRaw));
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
    const actualKeys = Object.keys(PackManifestSchema.shape).sort();
    expect(actualKeys).toEqual(expectedKeys);
  });

  it("rejects a subscription license at instantiation (gate + belt)", () => {
    /**
     * Criterion ROADMAP n°4: a subscription-shaped license is impossible.
     * The `z.literal("perpetual-one-time")` is the structural gate (rejected
     * by the `.shape.terms` check); the `superRefine` enforces the
     * commercial_use / attribution_required invariants as a belt.
     */
    const subscriptionPayload = {
      license_id: "pack-license-std",
      terms: "subscription-monthly",
      commercial_use: true,
      attribution_required: false,
    };
    const result = LicenseInfoSchema.safeParse(subscriptionPayload);
    expect(result.success).toBe(false);
    if (result.success) return; // narrow for TS
    const paths = result.error.issues.map((issue) => JSON.stringify(issue.path));
    expect(paths).toContain(JSON.stringify(["terms"]));
  });

  it("rejects commercial_use=false (belt, path [] standalone)", () => {
    /**
     * Path-asymmetry with the PackManifest parent context:
     *
     * - Standalone LicenseInfo: the superRefine path is empty ``[]``
     *   (the validator is rooted at LicenseInfo itself, no parent
     *   field name to prepend). This mirrors the Python ``loc=()``
     *   for the same standalone invocation.
     * - Inside PackManifest: the LicenseInfo schema sits under the
     *   ``license`` field, so the effective path is ``["license"]``.
     *   This mirrors the Python ``loc=("license",)`` for the same
     *   nested invocation. The rejection harness below exercises this
     *   nested case.
     */
    const payload = {
      license_id: "pack-license-std",
      terms: "perpetual-one-time",
      commercial_use: false,
      attribution_required: false,
    };
    const result = LicenseInfoSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (result.success) return;
    const paths = result.error.issues.map((issue) => JSON.stringify(issue.path));
    expect(paths).toContain(JSON.stringify([]));
  });

  it("rejects attribution_required=true (belt, path [] standalone)", () => {
    /**
     * Mirror of the Python ``loc=()`` for the same standalone
     * invocation.
     */
    const payload = {
      license_id: "pack-license-std",
      terms: "perpetual-one-time",
      commercial_use: true,
      attribution_required: true,
    };
    const result = LicenseInfoSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (result.success) return;
    const paths = result.error.issues.map((issue) => JSON.stringify(issue.path));
    expect(paths).toContain(JSON.stringify([]));
  });

  it("accepts a well-formed perpetual license", () => {
    const payload = {
      license_id: "pack-license-std",
      terms: "perpetual-one-time",
      commercial_use: true,
      attribution_required: false,
    };
    const result = LicenseInfoSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects PackTotals out-of-bounds (cost_eur)", () => {
    const result = PackTotalsSchema.safeParse({
      asset_count: 1,
      cost_eur: -0.5,
      first_pass_yield: 0.75,
    });
    expect(result.success).toBe(false);
  });

  it("rejects PackTotals out-of-bounds (first_pass_yield)", () => {
    const result = PackTotalsSchema.safeParse({
      asset_count: 1,
      cost_eur: 0.5,
      first_pass_yield: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

/**
 * Rejection harness (D-06/D-08) -- mirror of the pytest suite
 * `tests/bridge/test_pack_bridge.py::test_bridge_rejection_case`.
 *
 * Both suites consume the same JSON file
 * (`fixtures/rejection-cases/pack-manifest.json`) via the loaders in
 * `tests/bridge/rejection_loader.py` and
 * `src/rpc/contracts/rejection-cases.ts` -- one source, zero drift.
 *
 * Assertion rules (D-08):
 *   - The payload must always be rejected by zod safeParse.
 *   - When `expect_paths` is present, each expected path must appear
 *     among the `result.error.issues[].path` tuples (membership only --
 *     never a message-text comparison).
 *   - For the IN-08 case (collect-all), BOTH the duplicate index AND
 *     the first-occurrence index must be present in the issues --
 *     never a single aggregated issue, never silent deduplication.
 */
describe("pack-manifest rejection harness (mirror of pytest)", () => {
  const cases = loadRejectionCases("pack-manifest");

  it.each(cases.map((c) => [c.case_id, c]))(
    "%s -> zod rejects the shared payload",
    (_caseId, c) => {
      const result = PackManifestSchema.safeParse(c.payload);
      expect(result.success).toBe(false);
      if (result.success) return; // narrow for TS

      const actualPaths = new Set(result.error.issues.map((issue) => JSON.stringify(issue.path)));
      for (const expected of c.expect_paths) {
        const key = JSON.stringify(expected);
        expect(actualPaths.has(key)).toBe(true);
      }
    },
  );

  it("IN-08 collect-all: duplicate asset_id yields one issue per index", () => {
    /** IN-08 adjacency probe: duplicate ``asset_id`` is rejected with
     * one issue per index (``["assets", 0, "asset_id"]`` AND
     * ``["assets", 1, "asset_id"]``), never a single aggregated issue,
     * never silent deduplication.
     */
    const payload = {
      pack_id: "pack-nature-2026-03-15",
      style_version: "1.0.0",
      assets: [
        {
          asset_id: "a-001",
          style_ref: "example-style@1.0.0",
          recipe_ref: "fade",
          composition_meta: { shape_group_names: ["bg-shape"] },
          content_hashes: {
            svg_sha256: "a".repeat(64),
            lottie_sha256: "0123456789abcdef".repeat(4),
          },
        },
        {
          asset_id: "a-001", // duplicate
          style_ref: "example-style@1.0.0",
          recipe_ref: "fade",
          composition_meta: { shape_group_names: ["bg-shape"] },
          content_hashes: {
            svg_sha256: "a".repeat(64),
            lottie_sha256: "0123456789abcdef".repeat(4),
          },
        },
      ],
      totals: { asset_count: 2, cost_eur: 0.5, first_pass_yield: 0.75 },
      license: {
        license_id: "pack-license-std",
        terms: "perpetual-one-time",
        commercial_use: true,
        attribution_required: false,
      },
    };
    const result = PackManifestSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (result.success) return;
    const actualPaths = new Set(result.error.issues.map((issue) => JSON.stringify(issue.path)));
    expect(actualPaths.has(JSON.stringify(["assets", 0, "asset_id"]))).toBe(true);
    expect(actualPaths.has(JSON.stringify(["assets", 1, "asset_id"]))).toBe(true);
  });
});
