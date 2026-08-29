import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Rejection-case loader for the TypeScript bridge suite (D-06/D-08).
 *
 * The same JSON file drives the pytest rejection suite and the vitest
 * `test.each` suite here -- one source, zero drift.
 *
 * Format (D-08, verbatim):
 *
 *     { "case_id": "...", "ref": "...", "model": "...", "payload": { },
 *       "expect_paths": [ ["..."] ]  // OPTIONAL
 *
 * `expect_paths` absent  -> assert rejection only.
 * `expect_paths` present -> additionally assert each expected path is a member
 * of the zod `result.error.issues[].path` tuples (path comparison only -- never
 * message text, D-08).
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..", "..");
const REJECTION_FIXTURES_DIR = join(REPO_ROOT, "fixtures", "rejection-cases");

export const CONTRACT_FILES: Record<string, string> = {
  "style-spec": "style-spec.json",
  recipe: "recipe.json",
  "asset-spec": "asset-spec.json",
  "pack-manifest": "pack-manifest.json",
};

export interface RejectionCase {
  case_id: string;
  ref: string;
  model: string;
  payload: Record<string, unknown>;
  expect_paths: ReadonlyArray<ReadonlyArray<string | number>>;
}

export function loadRejectionCases(contract: string): RejectionCase[] {
  const filename = CONTRACT_FILES[contract];
  if (!filename) {
    throw new Error(`Unknown rejection contract: ${contract}`);
  }
  const path = join(REJECTION_FIXTURES_DIR, filename);
  if (!existsSync(path)) {
    throw new Error(`Rejection fixture file missing: ${path}`);
  }
  const raw = JSON.parse(readFileSync(path, "utf-8")) as Array<{
    case_id: string;
    ref: string;
    model: string;
    payload: Record<string, unknown>;
    expect_paths?: ReadonlyArray<ReadonlyArray<string | number>>;
  }>;
  return raw.map((entry) => ({
    case_id: entry.case_id,
    ref: entry.ref,
    model: entry.model,
    payload: entry.payload,
    expect_paths: entry.expect_paths ?? [],
  }));
}
