/**
 * compile-stdin.ts — Phase 3 golden pipeline entry (D-03 / D-25 / D-26 / D-37).
 *
 * Reads a `RenderSpec` JSON document from stdin, runs the same compile
 * → sanitize chain the Phase 7 RPC server uses (D-17 — chaining is
 * explicit, never internal), and writes the **golden envelope** to
 * stdout:
 *
 *   {
 *     "asset_id":         "<asset_id>",
 *     "recipe_id":        "<recipe_id>",
 *     "renderer_support": "all" | "svg-only",
 *     "lottie":           <CompileResult.lottie — re-validated LottieJSON>,
 *     "svg":              <CompileResult.svg — raw compiler SVG, pre-sanitize>
 *   }
 *
 * The envelope is serialized through `serializeDeterministicJson` from
 * `src/shared/format.ts` (D-23 / D-24 / D-35 — the byte-authority walker)
 * with a single `\n` terminator. The committed goldens under
 * `src/motion-compiler/__tests__/goldens/` are exactly these bytes.
 *
 * **Determinism guarantees (COM-01 + D-26/D-37):** the entry
 *
 *   1. Loads the committed catalogue and style fixtures from disk by
 *      absolute path resolved from this file — no environment lookup,
 *      no clock, no random source.
 *   2. Parses stdin as JSON, validates through `RenderSpecSchema`
 *      (D-13 strict + D-07 component count + D-32 uniqueness + D-34
 *      cross-field). A malformed input → process exits 1 with a
 *      stderr message.
 *   3. Calls `compile(spec, catalogue, style)` — re-validates the
 *      Lottie JSON through `LottieJSONSchema` as the last act (COM-03).
 *   4. Calls `sanitizeSvg({ asset_id, svg })` to validate the chain
 *      (D-17). A sanitize `ok=false` result → process exits 1 with a
 *      stderr message. The sanitized bytes are NOT included in the
 *      envelope — D-31/D-37 self-consistency is plan 03-07.
 *
 * **DO NOT** add a `process.env` lookup, a `Date.now()` call, a
 * `randomUUID()`, or a `performance.now()` call anywhere in this file.
 * The golden bytes are the product; nondeterminism would silently
 * invalidate every committed fixture.
 *
 * Run under `npx tsx` (devDep — Node 20 CI cannot strip TypeScript
 * types natively; see RESEARCH.md Pitfall 8).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { compile } from "../src/motion-compiler/compiler.js";
import { RenderSpecSchema, type RenderSpec } from "../src/rpc/contracts/motion-compiler.schema.js";
import { RecipeCatalogueSchema, type RecipeCatalogue } from "../src/rpc/contracts/catalogue.schema.js";
import { StyleSpecSchema, type StyleSpec } from "../src/rpc/contracts/style-spec.schema.js";
import { serializeDeterministicJson } from "../src/shared/format.js";
import { sanitizeSvg } from "../src/svg-sanitizer/sanitize.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");

/**
 * The pinned style spec used by the golden pipeline. Values are
 * deliberately fractional where possible (D-35 fidelity to the
 * bridge-format spec §4.1 #6 — Python and JavaScript format the
 * same floats identically across the JSON hop). Every value here
 * is byte-stable across regenerations; changing any value
 * invalidates every committed golden (D-23 reversibility: costly).
 *
 * The composition mirrors `fixtures/style-specs/example-style/style.yaml`
 * (1.0.0 pin) and is verbatim what `pipeline.spec.ts` constructs in
 * memory (the TRACER test pattern).
 */
const GOLDEN_STYLE_SPEC: StyleSpec = StyleSpecSchema.parse({
  style_version: "1.0.0",
  viewBox: { width: 400, height: 300 },
  stroke_widths: { thin: 1.5, default: 2.5, bold: 4.0 },
  corner_radii: { small: 0, medium: 8, large: 16 },
  palette: [
    { name: "ink", hex: "#1F2430" },
    { name: "accent", hex: "#FF6B4A" },
    { name: "surface", hex: "#F5F1EA" },
    { name: "success", hex: "#3E9B6E" },
  ],
  easing_curves: [
    { name: "standard", control_points: [0.2, 0, 0.2, 1] },
    { name: "entrance", control_points: [0, 0, 0.2, 1] },
  ],
});

/**
 * Load the committed recipe catalogue from disk. The path is
 * absolute via `REPO_ROOT` so the loader is cwd-independent — the
 * script can be invoked from any directory (CI runners vary).
 */
function loadCatalogue(): RecipeCatalogue {
  const path = join(REPO_ROOT, "fixtures", "recipe-catalogue", "catalogue.json");
  const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  return RecipeCatalogueSchema.parse(raw);
}

/**
 * Read all of stdin as UTF-8, resolve when 'end' fires. Node 20
 * requires the `readable`/`end` event loop for stdin consumption
 * (no portable sync API across Windows / Linux).
 */
async function readStdinAsync(): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    stdin.on("error", reject);
    stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

/**
 * Parse the stdin JSON as a `RenderSpec` through the Phase 3
 * frozen zod gate. Throws on a malformed payload.
 */
function parseRenderSpec(raw: string): RenderSpec {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`compile-stdin: stdin is not valid JSON (${String(cause)})`);
  }
  const result = RenderSpecSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `compile-stdin: RenderSpec validation failed: ${JSON.stringify(result.error.issues)}`,
    );
  }
  return result.data;
}

/**
 * Build the golden envelope from a compile result. The envelope's
 * field order is fixed:
 *
 *   asset_id → recipe_id → renderer_support → lottie → svg
 *
 * The deterministic serializer preserves insertion order (D-23).
 * Any future addition must be appended at the end — same-commit
 * byte discipline (D-25).
 */
function buildEnvelope(result: Awaited<ReturnType<typeof compileAndSanitize>>): Record<string, unknown> {
  return {
    asset_id: result.asset_id,
    recipe_id: result.recipe_id,
    renderer_support: result.renderer_support,
    lottie: result.lottie,
    svg: result.svg,
  };
}

/**
 * Run compile → sanitize and return both. The sanitize step is the
 * gate (D-17, D-31) — if it rejects the compiler's SVG, we throw
 * rather than emit a partial envelope. The chain mirrors the
 * `pipeline.spec.ts` TRACER (plan 03-04).
 */
async function compileAndSanitize(spec: RenderSpec): Promise<{
  asset_id: string;
  recipe_id: string;
  renderer_support: "all" | "svg-only";
  lottie: unknown;
  svg: string;
}> {
  const catalogue = loadCatalogue();
  const result = compile(spec, catalogue, GOLDEN_STYLE_SPEC);
  const sanitized = sanitizeSvg({ asset_id: result.asset_id, svg: result.svg });
  if (!sanitized.ok) {
    throw new Error(
      `compile-stdin: sanitizer rejected the compiler SVG for ${result.asset_id} (${sanitized.code}): ` +
        JSON.stringify(sanitized.report.violations),
    );
  }
  return result;
}

/**
 * Entry point. Reads stdin, runs the pipeline, writes the envelope
 * to stdout followed by exactly one `\n` byte (D-24 — the goldens are
 * exactly the delivered bytes; `.gitattributes` enforces LF
 * globally).
 */
async function main(): Promise<void> {
  const raw = await readStdinAsync();
  if (raw.trim().length === 0) {
    process.stderr.write("compile-stdin: stdin is empty — expected a RenderSpec JSON document\n");
    process.exit(1);
  }
  let spec: RenderSpec;
  try {
    spec = parseRenderSpec(raw);
  } catch (cause) {
    process.stderr.write(`${(cause as Error).message}\n`);
    process.exit(1);
  }
  try {
    const result = await compileAndSanitize(spec);
    const envelope = buildEnvelope(result);
    const bytes = serializeDeterministicJson(envelope);
    process.stdout.write(`${bytes}\n`);
    process.exit(0);
  } catch (cause) {
    process.stderr.write(`${(cause as Error).message}\n`);
    process.exit(1);
  }
}

main().catch((cause: unknown) => {
  process.stderr.write(`${String(cause)}\n`);
  process.exit(1);
});
