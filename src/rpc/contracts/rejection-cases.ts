import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Rejection-case loader for the TypeScript bridge suite (D-06/D-08, D-29).
 *
 * The same JSON file drives the pytest rejection suite and the vitest
 * `test.each` suite here -- one source, zero drift. Each Phase 3
 * fixture extends the D-08 format with an OPTIONAL `expect_code`
 * field naming the closed RPC error code the case expects the
 * server-side gate to emit (D-28/D-29/D-36).
 *
 * Format (D-08 verbatim + D-29 additive extension):
 *
 *     { "case_id": "...", "ref": "...", "model": "...", "payload": { },
 *       "expect_paths": [ ["..."] ], // OPTIONAL (path-membership only,
 *                                    //          never message-text)
 *       "expect_code": "validation_error" // OPTIONAL (Phase 3+; one
 *                                          // of SANITIZER_ERROR_CODES)
 *     }
 *
 * `expect_paths` absent  -> assert rejection only.
 * `expect_paths` present -> additionally assert each expected path is a member
 * of the zod `result.error.issues[].path` tuples (path comparison only -- never
 * message text, D-08).
 *
 * `expect_code` absent   -> assert rejection only (existing D-06 callers
 * are unaffected -- additive extension per D-29).
 * `expect_code` present  -> additionally assert the result maps to that
 * closed protocol-level code (RPC layer mirrors to it). The closed
 * enum lives in `sanitizer.schema.ts` (`SANITIZER_ERROR_CODES`) -- we
 * mirror the literal here so the loader does not import from a phase
 * that may not yet exist for earlier consumers.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..", "..");
const REJECTION_FIXTURES_DIR = join(REPO_ROOT, "fixtures", "rejection-cases");

/**
 * Closed set of RPC error codes the rejection harness accepts in
 * the optional `expect_code` field (D-28 + D-36 verbatim).
 * Kept here as a string literal so older consumers (Phase 1/2
 * callers) continue to compile without crossing the Phase 3 surface.
 */
export const REJECTION_EXPECT_CODES = [
  "parse_error",
  "validation_error",
  "compile_error",
  "sanitize_rejected",
  "unsupported_feature",
  "internal",
  "protocol_error",
  "method_not_found",
] as const;

export type RejectionExpectCode = (typeof REJECTION_EXPECT_CODES)[number];

const REJECTION_EXPECT_CODE_SET = new Set<string>(REJECTION_EXPECT_CODES);

export function isRejectionExpectCode(value: unknown): value is RejectionExpectCode {
  return typeof value === "string" && REJECTION_EXPECT_CODE_SET.has(value);
}

export const CONTRACT_FILES: Record<string, string> = {
  "style-spec": "style-spec.json",
  recipe: "recipe.json",
  "asset-spec": "asset-spec.json",
  "pack-manifest": "pack-manifest.json",
  "style-refinement": "style-refinement.json",
  catalogue: "catalogue.json",
  "render-spec": "render-spec.json",
  "lottie-json": "lottie-json.json",
};

export interface RejectionCase {
  case_id: string;
  ref: string;
  model: string;
  payload: Record<string, unknown>;
  expect_paths: ReadonlyArray<ReadonlyArray<string | number>>;
  expect_code: RejectionExpectCode | null;
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
  expect_code?: unknown;
}

/**
 * Fail-loud shape guard for one fixture entry (IN-07, D-06, D-29).
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
 *
 * D-29 additive guard: when `expect_code` is present, it MUST be one of
 * the closed RPC codes (or the loader fails loud -- a stray code path
 * would silently pass the suite in vitest while the Python loader would
 * raise).
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
  if (
    entry.expect_code !== undefined &&
    entry.expect_code !== null &&
    !isRejectionExpectCode(entry.expect_code)
  ) {
    const caseId = typeof entry.case_id === "string" ? entry.case_id : "<missing case_id>";
    throw new Error(
      `Rejection fixture ${filename}, case ${caseId}: expect_code ` +
        `${JSON.stringify(entry.expect_code)} is not a member of the ` +
        `closed RPC code set [${REJECTION_EXPECT_CODES.join(", ")}]; ` +
        `rejected at load time (D-29).`,
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
      expect_code: isRejectionExpectCode(entry.expect_code) ? entry.expect_code : null,
    };
  });
}
