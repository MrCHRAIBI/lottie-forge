import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_RECIPE_COUNT, MIN_RECIPE_COUNT, RECIPE_IDS } from "./vocabulary.schema.js";

/**
 * Vocabulary bridge step 2 of 3 — zod-side deep-equal + invariant assertion.
 *
 * Ordered bridge chain (vocabulary only):
 *   1. `pytest -k export`           -> fixtures/bridge/vocabulary.json
 *   2. `npx vitest run vocabulary`  (this file)  -> reads the artifact, asserts
 *                                       deep equality and the ADR-03 invariant
 *   3. `pytest -q` re-validates the same artifact on the Python side
 *
 * Hard failure on missing export artifact -- never skip (§4.2). The artifact
 * path resolution is rooted at the repo root so vitest can be run from
 * anywhere (CI runs `npx vitest run` with cwd = repo root).
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");
const BRIDGE_DIR = join(REPO_ROOT, "fixtures", "bridge");
const VOCABULARY_FIXTURE = join(BRIDGE_DIR, "vocabulary.json");

describe("vocabulary schema mirror", () => {
  it("exports exactly 10 recipe ids in canonical order", () => {
    expect(RECIPE_IDS).toEqual([
      "fade",
      "slide",
      "bounce",
      "pulse",
      "draw-on",
      "rotate",
      "scale-pop",
      "float",
      "wiggle",
      "orbit",
    ]);
  });

  it("enforces the ADR-03 closed-range invariant at module load", () => {
    // The runtime invariant in `vocabulary.schema.ts` would have already
    // thrown at import time if the tuple were out of range. Asserting the
    // bounds directly here documents the contract for any future reader.
    expect(MIN_RECIPE_COUNT).toBe(8);
    expect(MAX_RECIPE_COUNT).toBe(12);
    expect(RECIPE_IDS.length).toBeGreaterThanOrEqual(MIN_RECIPE_COUNT);
    expect(RECIPE_IDS.length).toBeLessThanOrEqual(MAX_RECIPE_COUNT);
  });

  it("deep-equals the Python-exported vocabulary.json", () => {
    if (!existsSync(VOCABULARY_FIXTURE)) {
      throw new Error(
        `Bridge export artifact missing at ${VOCABULARY_FIXTURE} -- run ` +
          "`python -m pytest tests/bridge/test_vocabulary_bridge.py -k export` first.",
      );
    }
    const exported = JSON.parse(readFileSync(VOCABULARY_FIXTURE, "utf-8")) as string[];
    expect(exported).toEqual([...RECIPE_IDS]);
  });
});
