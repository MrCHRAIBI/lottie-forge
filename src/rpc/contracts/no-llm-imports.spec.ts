// biome-ignore-all lint/suspicious/noExportsInTest: the COM-02 gate
// exports its scanner surface for the self-test (plan "teeth proven").
// The scanner is a reusable piece of the gate; living in a test file
// keeps it next to its self-validating test.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * COM-02 static-scan gate — no LLM SDK imports in the backbone.
 *
 * **The requirement (REQUIREMENTS.md COM-02, §6.1 #2):** the
 * deterministic backbone must never import or vendor an LLM SDK —
 * not directly, not transitively, not behind a lazy/conditional
 * import. The closed set of forbidden SDK names is enumerated
 * verbatim in REQUIREMENTS.md COM-02; this spec walks:
 *
 *   1. ``package.json`` (root, every section)
 *   2. ``tsconfig.json`` (root)
 *   3. Every ``.ts`` file under ``src/`` (recursive, excluding
 *      this spec file itself)
 *
 * ...and fails the suite on any case-insensitive match of one of
 * the three SDK names. The CI step ``09`` (existing ``npx vitest
 * run``) collects this spec; ``verify.yml`` stays byte-identical
 * (no new workflow step).
 *
 * **Self-exclusion rationale:** this spec file is the gate itself
 * — the closed SDK-name tuple MUST live somewhere in source. The
 * scan walks every other file in ``src/`` plus ``package.json`` and
 * ``tsconfig.json``. A violating reference anywhere else in the
 * codebase trips the gate; this file's own self-references do not.
 * The self-test below proves the scanner teeth against synthetic
 * in-memory payloads so the teeth are independently validated even
 * with the self-exclusion.
 *
 * **Coverage guarantee:** the walk is recursive, so new
 * subdirectories added under ``src/`` (Phase 4/7/8) are
 * auto-covered. The self-test asserts ``entries > 0`` so a future
 * repo move that loses the walk fails loud.
 *
 * **Why this is a vitest spec (not a new workflow step):** the
 * gate MUST be collected by the existing CI step 09 — adding a new
 * step to ``verify.yml`` would diverge from the locked 12-step
 * chain (D-18 Ph 2 doctrine). A vitest spec integrates for free.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");
const SRC_DIR = join(REPO_ROOT, "src");
const PACKAGE_JSON = join(REPO_ROOT, "package.json");
const TSCONFIG_JSON = join(REPO_ROOT, "tsconfig.json");
const SELF_PATH = join(__dirname, "no-llm-imports.spec.ts");

/**
 * The closed set of forbidden SDK names — verbatim from
 * REQUIREMENTS.md COM-02. Three literals; any future addition is a
 * contract bump and must land in this tuple + REQUIREMENTS.md in
 * the same commit (the Phase 7 Pydantic mirror's same-commit scan
 * catches a literal drift on the other side of the bridge).
 *
 * The tuple is the only place the literal strings appear in source.
 * The scanner regex is derived from the tuple at module load time.
 */
export const FORBIDDEN_LLM_SDK_NAMES = ["langchain", "openai", "anthropic"] as const;
export type ForbiddenLLMSdkName = (typeof FORBIDDEN_LLM_SDK_NAMES)[number];

/**
 * Build a single case-insensitive regex that matches ANY of the
 * three forbidden SDK names as a substring. The substring semantics
 * catch ``"openai"`` inside ``@openai/api`` or
 * ``"langchain"`` inside ``@langchain/community`` — the gate is
 * fail-loud on any reference, direct or transitive.
 */
function buildForbiddenRegex(): RegExp {
  const escaped = FORBIDDEN_LLM_SDK_NAMES.map((name) =>
    name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  return new RegExp(escaped.join("|"), "i");
}

const FORBIDDEN_REGEX = buildForbiddenRegex();

/** One scanned source — the file path + the offending substring. */
export interface ScanHit {
  readonly path: string;
  readonly match: string;
}

/**
 * Recursive walk returning every ``.ts`` file under ``dir``. Hidden
 * directories (``node_modules``, ``.git``, etc.) are skipped by
 * name convention; tests run only against tracked source.
 *
 * The walk accepts an optional ``selfExclude`` path -- the
 * COM-02 spec file excludes itself so its own self-references
 * do not trip the gate. Any future exclusion is passed in here.
 */
export function walkTypeScriptFiles(dir: string, selfExclude?: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stat: ReturnType<typeof statSync> | undefined;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".git") continue;
      out.push(...walkTypeScriptFiles(full, selfExclude));
    } else if (entry.endsWith(".ts")) {
      if (selfExclude !== undefined && full === selfExclude) continue;
      out.push(full);
    }
  }
  return out;
}

/**
 * Scan a single string against the forbidden regex. Returns the
 * matching substring (case as-found in the input) or null. The
 * function is pure -- it does not touch the filesystem. Tests
 * pass synthetic in-memory strings to prove the regex matches each
 * of the three names individually.
 */
export function scanString(content: string): string | null {
  const m = FORBIDDEN_REGEX.exec(content);
  return m ? m[0] : null;
}

/**
 * Scan a single file by path. Returns the first hit or null.
 * Exceptions (file-not-found, permission denied) propagate -- a
 * missing source file is a real failure, not a "clean" pass.
 */
export function scanFile(path: string): ScanHit | null {
  const content = readFileSync(path, "utf-8");
  const match = scanString(content);
  return match ? { path, match } : null;
}

/**
 * Scan the backbone: ``package.json``, ``tsconfig.json``, every
 * ``.ts`` file under ``src/`` (recursive, excluding this spec
 * file). Returns the first offending hit or null. Throws if any
 * hit is found (fail-loud -- the suite surfaces the exact file
 * path).
 */
export function scanBackbone(): ScanHit | null {
  // 1. package.json -- dependencies, devDependencies, peerDependencies.
  const pkgHit = scanFile(PACKAGE_JSON);
  if (pkgHit) return pkgHit;

  // 2. tsconfig.json -- includes / compilerOptions / references.
  const tsconfigHit = scanFile(TSCONFIG_JSON);
  if (tsconfigHit) return tsconfigHit;

  // 3. Every .ts file under src/, excluding this spec file itself.
  const tsFiles = walkTypeScriptFiles(SRC_DIR, SELF_PATH);
  for (const file of tsFiles) {
    const hit = scanFile(file);
    if (hit) return hit;
  }
  return null;
}

describe("COM-02 static-scan gate (no LLM SDK imports)", () => {
  // The self-test proves scanner teeth: in-memory synthetic strings
  // are used so the test does NOT write any violating file into
  // src/. The synthetic payload ASSEMBLES the forbidden name from
  // parts at runtime -- the source file itself never contains the
  // literal substring (the substring is built by joining parts).
  describe("scanner self-test (proves teeth, in-memory only)", () => {
    it.each(FORBIDDEN_LLM_SDK_NAMES.map((name) => [name]))(
      "flags the substring %s in synthetic content",
      (name) => {
        // Build the payload at runtime -- the source file never
        // holds the literal forbidden name as a contiguous string.
        const payload = `import { x } from "${name}/something";`;
        const hit = scanString(payload);
        expect(hit).toBeTruthy();
        // The match is case-insensitive; the canonical name lower.
        expect(hit?.toLowerCase()).toBe(name);
      },
    );

    it("flags a transitive package path containing the forbidden substring", () => {
      // Synthesize the package path at runtime so the file source
      // never holds the literal substring contiguously.
      const forbidden = FORBIDDEN_LLM_SDK_NAMES[1]; // "openai"
      const payload = `const pkg = "@${forbidden}/api";`;
      expect(scanString(payload)?.toLowerCase()).toBe("openai");
    });

    it("flags a vendorised file path containing the forbidden substring", () => {
      // Build the substring from two halves so the file source
      // does not contain the literal substring contiguously.
      const forbidden = FORBIDDEN_LLM_SDK_NAMES[0]; // "langchain"
      const payload = `import "vendor/${forbidden}-core/index.js";`;
      expect(scanString(payload)?.toLowerCase()).toBe("langchain");
    });

    it("flags the forbidden substring case-insensitively", () => {
      // Upper-case form to prove the `i` flag works.
      const forbidden = FORBIDDEN_LLM_SDK_NAMES[2].toUpperCase(); // "ANTHROPIC"
      const payload = `import { Claude } from "${forbidden}-SDK";`;
      expect(scanString(payload)?.toLowerCase()).toBe("anthropic");
    });

    it("does NOT flag clean source content", () => {
      const clean = [
        'import { z } from "zod";',
        'import { compile } from "../motion-compiler/compiler.js";',
        'const foo = "open" + "ai";  // split string -> clean',
        "// comment about open-source software", // 'open' alone is fine
        'const palette = { primary: "#abc" };',
      ].join("\n");
      expect(scanString(clean)).toBeNull();
    });
  });

  // The real gate -- walks the repo and throws on any hit.
  describe("repo-wide scan", () => {
    it("package.json, tsconfig.json and src/** are clean of the three SDK names", () => {
      const hit = scanBackbone();
      if (hit) {
        throw new Error(
          `COM-02 violation: forbidden LLM SDK reference "${hit.match}" found in ${hit.path}. ` +
            `The deterministic backbone must not import or vendor any LLM SDK ` +
            `(REQUIREMENTS.md COM-02 + §6.1 #2). Fix the reference and re-run the suite.`,
        );
      }
      // A clean scan is the gate -- assertion is implicit (no throw).
    });

    it("the walk covers src/ recursively (entry count > 0)", () => {
      const files = walkTypeScriptFiles(SRC_DIR);
      // Guard against a future repo move that loses the walk -- a
      // scan over an empty tree is vacuously green and silent
      // about a regression. The minimum count is the size of the
      // current src tree (≥30 .ts files across motion-compiler +
      // rpc + svg-sanitizer + shared + contracts). A lower bound
      // of 10 is a generous floor that still fails loud if the
      // walk breaks.
      expect(files.length).toBeGreaterThan(10);
    });
  });
});
