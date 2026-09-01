/**
 * Canonical decimal formatter + deterministic JSON serializer
 * (D-23/D-24/D-35). This module is the single numeric-format authority for
 * every Phase 3 producer of bytes — Motion Compiler outputs, SVG Sanitizer
 * outputs, committed goldens (D-23), and any cross-bridge payload that
 * crosses the Python ↔ TypeScript boundary as text. Diverging from the
 * regime pinned here invalidates all 11 goldens and every recorded output
 * hash.
 *
 * D-35 mandates: (i) `Number.prototype.toFixed(4)` for the rounding (the
 * semantics are fully specified by ECMA-262, hence byte-identical across
 * engines — `JSON.stringify` cannot be used because it emits
 * shortest-roundtrip floats such as `0.30000000000000004`); (ii) normalize
 * negative zero to zero; (iii) strip trailing zeros and a dangling dot;
 * (iv) never emit exponential notation within project bounds (coords 0..1,
 * viewBox <= 2048, lottie units a few thousand — `toFixed` cannot emit
 * exponential notation below 1e21).
 *
 * D-23 + D-24: the JSON serializer is a hand-written walker, never
 * `JSON.stringify` on float-bearing values — it emits compact JSON (no
 * whitespace), preserves object key insertion order, routes every finite
 * float through `fmt()`, and terminates a file write with exactly one `"\n"`
 * byte (never `os.EOL`; `.gitattributes` already enforces LF globally).
 *
 * Pure module, zero dependencies. Imported by every later producer of
 * bytes — pattern reference: `src/rpc/contracts/vocabulary.schema.ts`
 * (module-guard doctrine, lines 74-78).
 */

import { writeFileSync } from "node:fs";

const MAX_ABS_BOUND = 1e21;

/**
 * Format a finite number using the D-35 regime (`-0 -> 0`,
 * `toFixed(4)`, trailing zeros stripped, no exponential notation).
 *
 * Throws on non-finite input (`NaN`, `Infinity`, `-Infinity`) and on
 * `|n| >= 1e21` (outside project bounds).
 *
 * The same function is the formatter for SVG numeric attributes (D-35:
 * "même formateur pour les attributs numériques du SVG") — do not fork a
 * second formatter.
 */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error(`fmt(): non-finite input (${n}) — finite numbers only (D-35)`);
  }
  if (Object.is(n, -0)) n = 0;
  if (Math.abs(n) >= MAX_ABS_BOUND) {
    throw new Error(`fmt(): |n| >= ${MAX_ABS_BOUND} (${n}) — outside project bounds (D-35)`);
  }
  let s = n.toFixed(4);
  if (s.includes(".")) {
    s = s.replace(/0+$/, "").replace(/\.$/, "");
  }
  return s === "-0" ? "0" : s;
}

/**
 * Serialize `value` to compact, deterministic JSON (D-23/D-24).
 *
 * - `null` -> `"null"`
 * - `boolean` -> `"true"` / `"false"`
 * - finite `number` -> `fmt(n)` (D-35)
 * - `string` -> standard JSON string escaping (via the spec-conformant
 *   native serializer used only for its string-escape contract)
 * - `Array` -> elements serialized in order, comma-joined
 * - `Record<string, unknown>` -> keys serialized in insertion order
 *   (`Object.keys` returns own enumerable string keys in insertion order
 *   per ECMA-262 §20.1.3.2), comma-joined
 *
 * Throws on any other value (`undefined`, `function`, `symbol`, `bigint`,
 * `Map`, `Set`, etc.) — fail-loud on a non-serializable value rather than
 * silently substituting `undefined` (which `JSON.stringify` would do and
 * which would desynchronize our key inventory from our body).
 */
export function serializeDeterministicJson(value: unknown): string {
  return serializeValue(value);
}

/**
 * Serialize `value` via `serializeDeterministicJson()` and write the
 * bytes to `path`, terminating with exactly one `"\n"` byte (D-24:
 * compact + final newline — the goldens are exactly the delivered bytes).
 * The newline is the literal `"\n"` character — never `os.EOL`
 * (Pitfall 9; `.gitattributes` already enforces LF).
 */
export function writeDeterministicJson(path: string, value: unknown): void {
  const bytes = `${serializeDeterministicJson(value)}\n`;
  writeFileSync(path, bytes);
}

function serializeValue(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "boolean") return value ? "true" : "false";
  if (t === "number") return fmt(value as number);
  if (t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const item of value) parts.push(serializeValue(item));
    return `[${parts.join(",")}]`;
  }
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    const parts: string[] = [];
    for (const k of keys) {
      parts.push(`${JSON.stringify(k)}:${serializeValue(obj[k])}`);
    }
    return `{${parts.join(",")}}`;
  }
  throw new Error(
    `serializeDeterministicJson: unsupported value of type ${t} — ` +
      `expected null | boolean | number | string | array | Record<string, unknown>`,
  );
}
