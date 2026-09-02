/**
 * NDJSON RPC server — Pattern 5 (§6.5, §6.6).
 *
 * Closed-envelope protocol on stdin/stdout (D-27/D-28/D-36):
 *
 *   request  : one NDJSON line `{ "id": <number>, "method": <name>, "params": <obj> }`
 *   response : one NDJSON line `{ "id": <number|null>, "ok": true, "result": <obj> }`
 *                            | `{ "id": <number|null>, "ok": false, "error": { "code", "message", "details"? } }`
 *
 * **Closed code set (D-28/D-36 — exactly 8 literals):**
 *
 *   parse_error | validation_error | unsupported_feature | compile_error
 *   sanitize_rejected | internal | protocol_error | method_not_found
 *
 * Every code is a literal string in the envelope. The Python client
 * re-validates the code on receipt (typed mirror lands in Phase 7).
 *
 * **Stdout discipline (D-36):** stdout carries protocol lines ONLY.
 * Every diagnostic (startup banner, error stack, unexpected throw)
 * goes to stderr. A log line on stdout would break NDJSON parsing
 * for the Python client — the integration suite asserts this by
 * construction (no test ever mixes a log into a response).
 *
 * **Server survival (D-36):** a malformed line returns
 * `{ id: null, ok: false, error: { code: "protocol_error" } }` and
 * the server STAYS ALIVE for the next request. The handler never
 * throws, never exits, never crashes the process. The unit spec
 * drives `processLine` directly to prove this contract.
 *
 * **Methods (D-17, D-27):**
 *
 *   - `motion.compile` — params: `{ render_spec }`. The catalogue
 *     + style fixtures are loaded ONCE at startup (Pitfall 8 — the
 *     Python client spawns this process via `tsx` because Node 20
 *     cannot strip TypeScript types natively). The compile output is
 *     the `CompileResult` envelope (`asset_id`, `recipe_id`,
 *     `renderer_support`, `lottie`, `svg`).
 *   - `svg.sanitize`   — params: `{ asset_id, svg }`. The sanitizer
 *     gate runs verbatim; `ok=true` returns the optimized SVG + a
 *     zero-violations report, `ok=false` returns the structured
 *     report + `code: "sanitize_rejected"`.
 *
 * **Testability:** `processLine(line, ctx)` is a pure handler — it
 * takes the parsed inputs and returns the envelope to write, with
 * zero side effects (no I/O, no logger calls). The thin `main()`
 * only wires stdin → processLine → stdout. Unit tests drive
 * `processLine` directly with synthetic contexts.
 *
 * **Framing reused by Phases 4/7/8 (D-27 — costly reversibility).**
 * The same NDJSON envelope and 8-code set carry `anim_qa.run`
 * (Phase 4) and `package.export` (Phase 8). The transport layer
 * in `lottie_forge/rpc/client.py` is the shared client contract.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { compile } from "../motion-compiler/compiler.js";
import { UnsupportedFeatureError } from "../motion-compiler/feature-gate.js";
import { CompileError } from "../motion-compiler/keyframe-emitter.js";
import { sanitizeSvg } from "../svg-sanitizer/sanitize.js";
import { type RecipeCatalogue, RecipeCatalogueSchema } from "./contracts/catalogue.schema.js";
import { type RenderSpec, RenderSpecSchema } from "./contracts/motion-compiler.schema.js";
import { type SanitizeRequest, SanitizeRequestSchema } from "./contracts/sanitizer.schema.js";
import { type StyleSpec, StyleSpecSchema } from "./contracts/style-spec.schema.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");

/**
 * The closed set of RPC error codes emitted on the protocol
 * (D-28/D-36 — exactly 8 literals). The set is exported so the
 * Python client and the unit suite share the same source of
 * truth, and any future addition is a single-site edit.
 *
 * Note on `parse_error`: it is an alias for `protocol_error`
 * reserved for the SPECIFIC case where the line parses as JSON but
 * fails to extract `id` + `method` (the Python client also uses
 * `parse_error` when its own lockstep decoder reads an invalid
 * envelope — symmetry). The handler emits `protocol_error` for
 * raw JSON.parse failure and `parse_error` for known-shape-but-
 * missing-fields failure (mirroring the D-28/D-36 split).
 */
export const RPC_ERROR_CODES = [
  "parse_error",
  "validation_error",
  "unsupported_feature",
  "compile_error",
  "sanitize_rejected",
  "internal",
  "protocol_error",
  "method_not_found",
] as const;

export type RpcErrorCode = (typeof RPC_ERROR_CODES)[number];

/** An `ok: true` envelope. The `result` field is whatever the method returned. */
export interface OkEnvelope {
  readonly id: number | null;
  readonly ok: true;
  readonly result: unknown;
}

/** An `ok: false` envelope. `details` carries zod issues / violation reports. */
export interface ErrEnvelope {
  readonly id: number | null;
  readonly ok: false;
  readonly error: {
    readonly code: RpcErrorCode;
    readonly message: string;
    readonly details?: unknown;
  };
}

export type Envelope = OkEnvelope | ErrEnvelope;

/**
 * Server-side context for `processLine`. The handler is pure over
 * this object — no module-level globals, no `Date.now()`, no I/O.
 * The startup `main()` builds one context per process.
 */
export interface ServerContext {
  readonly catalogue: RecipeCatalogue;
  readonly style: StyleSpec;
}

/** The pin style spec used by the RPC server. Verbatim with the
 * golden pipeline (`scripts/compile-stdin.ts`) so the bytes are
 * stable across the seam. Changing any value invalidates every
 * committed golden (D-23 reversibility: costly). */
function pinnedStyle(): StyleSpec {
  return StyleSpecSchema.parse({
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
}

/** Load the committed recipe catalogue from disk. */
function loadCatalogue(): RecipeCatalogue {
  const path = join(REPO_ROOT, "fixtures", "recipe-catalogue", "catalogue.json");
  const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  return RecipeCatalogueSchema.parse(raw);
}

/**
 * Build the default server context — used by `main()` once at
 * startup. Tests build their own context with arbitrary catalogue
 * + style to drive `processLine` directly.
 */
export function buildDefaultContext(): ServerContext {
  return { catalogue: loadCatalogue(), style: pinnedStyle() };
}

/** RPC-layer schema for the `motion.compile` request. */
const MotionCompileRpcRequestSchema = z.strictObject({
  render_spec: RenderSpecSchema,
});

/** Internal envelope writer — stamps the parsed `id` onto the result/error. */
function okEnvelope(id: number | null, result: unknown): OkEnvelope {
  return { id, ok: true, result };
}

function errEnvelope(
  id: number | null,
  code: RpcErrorCode,
  message: string,
  details?: unknown,
): ErrEnvelope {
  const error: { code: RpcErrorCode; message: string; details?: unknown } = {
    code,
    message,
  };
  if (details !== undefined) {
    error.details = details;
  }
  return { id, ok: false, error };
}

/**
 * Walk the zod issues and produce a flat, JSON-friendly list of
 * `{ path, message }` so the Python client can re-validate
 * structured paths without re-running the zod parse. The path
 * array is the same shape the JSON.parse output emits, so a
 * Pythonic tuple/list comparison works byte-for-byte. Symbol
 * entries are filtered out (zod v4 widens `path` to
 * `PropertyKey[]`; the wire format only carries strings/numbers).
 */
function flattenZodIssues(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }> {
  return issues.map((issue) => ({
    path: issue.path.filter(
      (p): p is string | number => typeof p === "string" || typeof p === "number",
    ),
    message: issue.message,
  }));
}

/**
 * Pure line handler — testable directly, no I/O, no `Date.now()`,
 * no module globals. Every malformed input produces an envelope
 * (D-36 — server survival); nothing in this function throws.
 */
export function processLine(line: string, ctx: ServerContext): Envelope {
  if (line.trim().length === 0) {
    return errEnvelope(
      null,
      "protocol_error",
      "empty line is not a valid NDJSON RPC message (D-36 — drop or send {} body)",
    );
  }

  // Parse the line as JSON. A failure here is a `protocol_error`
  // (raw malformed NDJSON — D-36 doctrine).
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (cause) {
    return errEnvelope(
      null,
      "protocol_error",
      `malformed NDJSON line — JSON.parse failed: ${(cause as Error).message}`,
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return errEnvelope(
      null,
      "parse_error",
      "request body must be a JSON object with { id, method, params }",
    );
  }

  const request = parsed as Record<string, unknown>;

  // Extract + validate the numeric `id` (D-27 correlation).
  const rawId = request.id;
  if (typeof rawId !== "number" || !Number.isFinite(rawId) || !Number.isInteger(rawId)) {
    return errEnvelope(
      null,
      "parse_error",
      "request must carry a numeric integer `id` (correlation key, D-27)",
    );
  }
  const id: number = rawId;

  // Extract + validate the `method` literal.
  const rawMethod = request.method;
  if (typeof rawMethod !== "string" || rawMethod.length === 0) {
    return errEnvelope(id, "parse_error", "request must carry a non-empty string `method`");
  }
  const method: string = rawMethod;

  // Dispatch by method name. Unknown methods are the explicit
  // `method_not_found` code (D-36 — distinct from `protocol_error`).
  if (method === "motion.compile") {
    return handleMotionCompile(id, request.params, ctx);
  }
  if (method === "svg.sanitize") {
    return handleSanitize(id, request.params, ctx);
  }
  return errEnvelope(
    id,
    "method_not_found",
    `unknown method "${method}" — closed set: motion.compile | svg.sanitize`,
  );
}

/** Dispatch `motion.compile` — parse, compile, envelope. */
function handleMotionCompile(id: number, params: unknown, ctx: ServerContext): Envelope {
  const parsed = MotionCompileRpcRequestSchema.safeParse(params);
  if (!parsed.success) {
    return errEnvelope(
      id,
      "validation_error",
      "motion.compile params failed RenderSpec validation",
      { issues: flattenZodIssues(parsed.error.issues) },
    );
  }

  const renderSpec: RenderSpec = parsed.data.render_spec;
  try {
    const result = compile(renderSpec, ctx.catalogue, ctx.style);
    return okEnvelope(id, result);
  } catch (cause) {
    if (cause instanceof UnsupportedFeatureError) {
      // D-33 deliberate deviation — `unsupported_feature` is its own code.
      const details: { feature?: string } = {};
      if (cause.feature !== undefined) details.feature = cause.feature;
      return errEnvelope(
        id,
        "unsupported_feature",
        cause.message,
        Object.keys(details).length > 0 ? details : undefined,
      );
    }
    if (cause instanceof CompileError) {
      return errEnvelope(id, "compile_error", cause.message);
    }
    // Defense in depth — an unexpected throw is an `internal` and
    // gets logged to stderr (the D-36 stack-trace rule).
    const err = cause as Error;
    const stack = err?.stack ?? String(cause);
    process.stderr.write(`motion.compile: unexpected internal error — ${stack}\n`);
    return errEnvelope(
      id,
      "internal",
      `unexpected internal error in motion.compile: ${err?.message ?? String(cause)}`,
    );
  }
}

/** Dispatch `svg.sanitize` — parse, sanitize, envelope. */
function handleSanitize(id: number, params: unknown, _ctx: ServerContext): Envelope {
  const parsed = SanitizeRequestSchema.safeParse(params);
  if (!parsed.success) {
    return errEnvelope(
      id,
      "validation_error",
      "svg.sanitize params failed SanitizeRequest validation",
      { issues: flattenZodIssues(parsed.error.issues) },
    );
  }

  const request: SanitizeRequest = parsed.data;
  const result = sanitizeSvg(request);
  if (result.ok) {
    return okEnvelope(id, result);
  }
  // `ok: false` — sanitize_rejected carries the structured report.
  // The result.code is one of {sanitize_rejected, validation_error}
  // (sanitizer.ts handles the empty-input validation_error branch).
  const code: RpcErrorCode =
    result.code === "validation_error" ? "validation_error" : "sanitize_rejected";
  return errEnvelope(id, code, result.code ?? "sanitize_rejected", {
    report: result.report,
  });
}

/**
 * Thin entry — wires stdin → processLine → stdout. The unit
 * spec drives `processLine` directly; this `main` only runs
 * when the module is invoked as an entry script (e.g.
 * `npx tsx src/rpc/server.ts`). The conditional `isEntry`
 * guard prevents vitest from triggering it on import.
 *
 * **Stdout discipline:** every response is one compact JSON
 * line followed by `\n`. No pretty-printing (the Python client
 * uses `json.loads` per line — pretty-printing would still
 * parse but is unnecessary bytes).
 */
function main(): void {
  const ctx = buildDefaultContext();
  process.stderr.write(
    "rpc-server: ready — catalogue + style loaded (methods: motion.compile, svg.sanitize)\n",
  );

  const rl = createInterface({
    input: process.stdin,
    terminal: false,
    crlfDelay: Infinity,
  });

  rl.on("line", (line) => {
    // A line write error (broken pipe) is fatal — the client died.
    try {
      const envelope = processLine(line, ctx);
      process.stdout.write(`${JSON.stringify(envelope)}\n`);
    } catch (cause) {
      // processLine is documented to never throw; this branch is
      // defense-in-depth. Emit an `internal` envelope and stay alive.
      const err = cause as Error;
      const stack = err?.stack ?? String(cause);
      process.stderr.write(`rpc-server: processLine threw (defense-in-depth): ${stack}\n`);
      const fallback = errEnvelope(null, "internal", `processLine threw — server remains alive`);
      try {
        process.stdout.write(`${JSON.stringify(fallback)}\n`);
      } catch {
        // stdout itself broken — log to stderr and continue.
        process.stderr.write("rpc-server: stdout write failed — client likely gone\n");
      }
    }
  });

  rl.on("close", () => {
    process.stderr.write("rpc-server: stdin closed — exiting\n");
    process.exit(0);
  });
}

/**
 * Detect "this file is the entry point" so vitest imports do not
 * trigger `main()`. Uses `import.meta.url` vs the URL of
 * `process.argv[1]` (the path to the entry script). On failure
 * (e.g. exotic runtimes), default to NOT running main — vitest is
 * the common import path.
 */
function isEntryModule(): boolean {
  try {
    if (!process.argv[1]) return false;
    const entryUrl = pathToFileURL(process.argv[1]).href;
    return import.meta.url === entryUrl;
  } catch {
    return false;
  }
}

if (isEntryModule()) {
  main();
}
