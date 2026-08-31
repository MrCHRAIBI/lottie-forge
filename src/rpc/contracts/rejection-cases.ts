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
  "style-refinement": "style-refinement.json",
  catalogue: "catalogue.json",
};

export interface RejectionCase {
  case_id: string;
  ref: string;
  model: string;
  payload: Record<string, unknown>;
  expect_paths: ReadonlyArray<ReadonlyArray<string | number>>;
}

/**
 * Raw (pre-validation) shape of one JSON fixture entry. Every required
 * field is `unknown` until `assertRejectionEntryShape` proves otherwise --
 * a fixture file is data, never a type guarantee.
 */
interface RawRejectionEntry {
  case_id?: unknown;
  ref?: unknown;
  model?: unknown;
  payload?: unknown;
  expect_paths?: ReadonlyArray<ReadonlyArray<string | number>>;
}

/**
 * Fail-loud shape guard for one fixture entry (IN-07, D-06).
 *
 * A fixture entry whose `payload` is absent would slide through the
 * `test.each` suites as `Schema.safeParse(undefined)` -> rejection -> a
 * VACUOUS green, while the Python loader (`tests/bridge/rejection_loader.py`)
 * raises `KeyError` at load time. The one-source-zero-drift harness would
 * silently diverge in exactly the scenario it exists to prevent. Mirror
 * the Python strictness: all four required fields must be present
 * (`payload` must be a non-null object); anything else aborts the vitest
 * run at load time.
 *
 * Additive wrapper (IN-07): `loadRejectionCases` keeps its exported
 * signature -- spec files are untouched. Exported so the guard itself is
 * unit-testable without mutating the committed (locked) fixture files.
 */
export function assertRejectionEntryShape(entry: RawRejectionEntry, filename: string): void {
  const missing: string[] = [];
  if (typeof entry.case_id !== "string") missing.push("case_id");
  if (typeof entry.ref !== "string") missing.push("ref");
  if (typeof entry.model !== "string") missing.push("model");
  if (entry.payload === undefined || entry.payload === null || typeof entry.payload !== "object") {
    missing.push("payload");
  }
  if (missing.length > 0) {
    const caseId = typeof entry.case_id === "string" ? entry.case_id : "<missing case_id>";
    throw new Error(
      `Rejection fixture ${filename}, case ${caseId}: missing or malformed ` +
        `required field(s): ${missing.join(", ")} -- the Python loader ` +
        `(rejection_loader.py) raises KeyError on the same shape; the TS ` +
        `side must fail loud too instead of asserting rejection vacuously`,
    );
  }
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
  const raw = JSON.parse(readFileSync(path, "utf-8")) as RawRejectionEntry[];
  return raw.map((entry) => {
    assertRejectionEntryShape(entry, filename);
    // Validate-then-cast: the guard above proved each required field's
    // type at runtime; the casts only re-state it for the compiler.
    return {
      case_id: entry.case_id as string,
      ref: entry.ref as string,
      model: entry.model as string,
      payload: entry.payload as Record<string, unknown>,
      expect_paths: entry.expect_paths ?? [],
    };
  });
}
