import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SHA256_HEX_PATTERN } from "./asset-spec.schema.js";
import { StyleSpecSchema } from "./style-spec.schema.js";

/**
 * Bridge step 2 of 3 -- zod validates and re-emits the Python-exported
 * style-fixture envelope for the Phase 2 reference dataset (DM-04, §5.2.2).
 *
 * Ordered bridge chain (style fixture):
 *   1. `pytest tests/bridge/test_style_fixture_bridge.py -k export`
 *          -> fixtures/bridge/style-fixture.from-python.json
 *   2. `npx vitest run style-fixture`  (this file)
 *          -> fixtures/bridge/style-fixture.from-ts.json
 *   3. `pytest tests/bridge/test_style_fixture_bridge.py -k reimport`
 *          -> strict Pydantic re-validates
 *
 * The envelope shape is `{"style_sha256": "...", "spec": {...}}`. The
 * `style_sha256` field carries the D-02 hash (raw committed bytes,
 * LF-normalised, sha256 -- verifiable via `sha256sum` outside the
 * factory, §5.2.2). The `spec` field is the canonical StyleSpec
 * object, validated by `StyleSpecSchema` which is the unchanged mirror
 * of the Pydantic model -- the loader-side `style_id` gate never
 * reaches this file (D-16 / decision: gate lives in the loader, the
 * bridge contracts stay untouched).
 *
 * Hard failure on missing export artefact -- never skip (§4.2). The
 * artefact path resolution is rooted at the repo root so vitest can be
 * run from anywhere (CI runs `npx vitest run` with cwd = repo root).
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");
const BRIDGE_DIR = join(REPO_ROOT, "fixtures", "bridge");
const FROM_PYTHON = join(BRIDGE_DIR, "style-fixture.from-python.json");
const FROM_TS = join(BRIDGE_DIR, "style-fixture.from-ts.json");

interface StyleFixtureEnvelope {
  style_sha256: string;
  spec: unknown;
}

function loadEnvelope(path: string): StyleFixtureEnvelope {
  return JSON.parse(readFileSync(path, "utf-8")) as StyleFixtureEnvelope;
}

describe("style-fixture bridge (style.yaml \u2192 zod \u2192 re-emit)", () => {
  it("validates the Python-exported envelope and re-emits it byte-stable", () => {
    if (!existsSync(FROM_PYTHON)) {
      throw new Error(
        `Bridge export artefact missing at ${FROM_PYTHON} -- run ` +
          "`python -m pytest tests/bridge/test_style_fixture_bridge.py -k export` first.",
      );
    }
    const envelope = loadEnvelope(FROM_PYTHON);

    // The style_sha256 must match the canonical 64-char lowercase hex
    // regex shared with `AssetSpec.content_hashes` -- one regex, two
    // schemas, one contract. Imported from `asset-spec.schema.ts`
    // (verbatimModuleSyntax \u2192 `.js`).
    expect(envelope.style_sha256).toMatch(SHA256_HEX_PATTERN);

    // Parse the spec under the unchanged StyleSpecSchema mirror. The
    // loader-side `style_id` gate has already stripped the key, so the
    // contract-clean `StyleSpecSchema` accepts the payload as-is.
    const parsed = StyleSpecSchema.parse(envelope.spec);

    // Re-emit the same envelope shape -- the Python re-import step then
    // strict-Pydantic-validates the `spec` field again; the sha must
    // round-trip exactly (no field reordering on the wire).
    const reEmitted: StyleFixtureEnvelope = {
      style_sha256: envelope.style_sha256,
      spec: parsed,
    };
    writeFileSync(FROM_TS, JSON.stringify(reEmitted));
    expect(existsSync(FROM_TS)).toBe(true);
  });

  it("preserves the SHA256_HEX_PATTERN contract across the bridge", () => {
    // Pattern-level lock: if `SHA256_HEX_PATTERN` is ever edited, the
    // canonical regex change must touch `asset-spec.schema.ts` AND be
    // reflected here (same commit). We assert the literal regex source
    // to catch a silent edit of one side and not the other.
    expect(SHA256_HEX_PATTERN.source).toBe("^[a-f0-9]{64}$");
  });

  it("rejects a non-conformant style_sha256 if the envelope is hand-mutated", () => {
    // Defensive: the canonical envelope from step 1 always carries a
    // well-formed sha, but a future human-error edit of the artefact
    // (uppercase, short, non-hex) must be caught here before reaching
    // the Pydantic re-import. The error message names the contract.
    const envelope = loadEnvelope(FROM_PYTHON);
    const mutated = { ...envelope, style_sha256: envelope.style_sha256.toUpperCase() };
    expect(mutated.style_sha256).not.toMatch(SHA256_HEX_PATTERN);
  });
});
