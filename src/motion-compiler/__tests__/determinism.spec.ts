import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { RecipeId } from "../../rpc/contracts/vocabulary.schema.js";

/**
 * Plan 03-06 — Task 2.2 / `determinism.spec.ts`.
 *
 * **COM-01 + D-26/D-37 three-way byte-equality proof.**
 *
 * For every representative golden fixture, two independent
 * `compile-stdin.ts` processes spawn ≥ 1 second apart
 * (anti-horodatage — a clock leak would diverge the first
 * run from the second). The committed golden is the third
 * axis. Three-way Buffer.compare must hold.
 *
 * **Representative-fixture selection** — at least 3
 * fixtures bound runtime:
 *
 * - **slide** — one-shot `translate-in`. Static channel
 *   values (o, r, s) plus the animated `p` (position).
 *
 * - **pulse** — loop `scale-breath`. Animates `s` (scale)
 *   with a multi-sample sine-driven keyframe sequence. The
 *   loop recipe exercises a different emit path than the
 *   one-shot recipes — multi-keyframe intermediates + last
 *   bare (Pitfall 11) is asserted here.
 *
 * - **galerie** — 4-component multi-layer multi-generator
 *   emission. The most complex RecipeSpec; a clock leak or
 *   state-machine bug would diverge here faster than on the
 *   single-component fixtures.
 *
 * **Process spawning:** the helper uses tsx — invoking
 * `node <tsx-cli> scripts/compile-stdin.ts` is the same
 * invocation `update-goldens.mjs` uses; a divergence in
 * spawning signals a script-level drift.
 *
 * **Companion byte check (D-25 same-commit):** if the test
 * detects a divergence, it surfaces the per-process stdout
 * head (first 100 bytes hex) — a debugging operator sees
 * exactly where the two processes diverged without needing
 * to inspect shell captures.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const COMPILE_STDIN = join(REPO_ROOT, "scripts", "compile-stdin.ts");
const TSX_CLI = join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const FIXTURES_DIR = join(REPO_ROOT, "fixtures", "render-specs");
const GOLDENS_DIR = join(REPO_ROOT, "src", "motion-compiler", "__tests__", "goldens");

/** Each test case maps a fixture file + asset id + golden basename. */
const DETERMINISM_FIXTURES: ReadonlyArray<{
  recipeId: RecipeId;
  assetId: string;
  fixtureFilename: string;
  goldenName: string;
}> = [
  // One-shot translate-in (single-component, static o/r/a + animated p).
  {
    recipeId: "slide",
    assetId: "a-002",
    fixtureFilename: "slide.json",
    goldenName: "a-002.slide.golden.json",
  },
  // Loop scale-breath (multi-keyframe sine emit, animated s).
  {
    recipeId: "pulse",
    assetId: "a-004",
    fixtureFilename: "pulse.json",
    goldenName: "a-004.pulse.golden.json",
  },
  // Galerie — multi-component multi-shape (option-b per D-03);
  // the fixture basename is "galerie.json" with recipe_id "wiggle".
  {
    recipeId: "wiggle",
    assetId: "a-011",
    fixtureFilename: "galerie.json",
    goldenName: "a-011.galerie.golden.json",
  },
];

const INTER_PROCESS_DELAY_MS = 1100;

/**
 * Run `compile-stdin.ts` on a fixture, return the captured stdout
 * bytes. Throws on any failure with the captured stderr.
 */
function runCompileStdin(fixtureContent: string): Buffer {
  if (!existsSync(TSX_CLI)) {
    throw new Error(
      `tsx binary missing at ${TSX_CLI} — \`npm ci\` should have installed it (devDep, pinned in package.json)`,
    );
  }
  const result = spawnSync(process.execPath, [TSX_CLI, COMPILE_STDIN], {
    cwd: REPO_ROOT,
    input: fixtureContent,
    timeout: 30_000,
  });
  if (result.error) {
    throw new Error(`tsx spawn failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `compile-stdin exited ${result.status}: ${(result.stderr ?? "<no stderr>").toString().trim()}`,
    );
  }
  const stdoutBuf = result.stdout ?? Buffer.alloc(0);
  if (stdoutBuf.length === 0) {
    throw new Error("compile-stdin produced zero stdout bytes — half-run refused");
  }
  // D-24: the last byte MUST be LF (Pitfall 9 — never CRLF).
  if (stdoutBuf[stdoutBuf.length - 1] !== 0x0a) {
    throw new Error(
      `compile-stdin output does not end with LF (D-24 + Pitfall 9); got 0x${stdoutBuf[
        stdoutBuf.length - 1
      ]?.toString(16)}`,
    );
  }
  return stdoutBuf;
}

/**
 * Sleep `ms` milliseconds. A small helper for the
 * anti-horodatage delay; using `setTimeout` keeps it simple
 * and platform-independent.
 */
function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  // eslint-disable-next-line no-empty -- busy wait is intentionally avoided;
  // any sensible scheduler will park us.
  while (Date.now() < end) {
    /* spin to win (the wait is < 2 s by design) */
  }
}

/** Format the first 80 bytes of a buffer as a readable diagnostic. */
function headHex(buf: Buffer): string {
  return buf.subarray(0, Math.min(80, buf.length)).toString("utf-8").replace(/\n/g, "\\n");
}

describe("determinism proof — two processes + golden, three-way byte-equality (COM-01, D-26, D-37)", () => {
  for (const { fixtureFilename, goldenName } of DETERMINISM_FIXTURES) {
    it(`${goldenName}: processA === processB === committed golden (>=1 s spawn gap)`, () => {
      const fixturePath = join(FIXTURES_DIR, fixtureFilename);
      const goldenPath = join(GOLDENS_DIR, goldenName);
      if (!existsSync(fixturePath)) {
        throw new Error(
          `fixture missing at ${fixturePath} — committed RenderSpec fixtures are a Phase 3 hard requirement`,
        );
      }
      if (!existsSync(goldenPath)) {
        throw new Error(
          `golden missing at ${goldenPath} — run \`node scripts/update-goldens.mjs\` to refresh ` +
            `(or commit it for the first time when bootstrapping, D-25)`,
        );
      }
      const fixtureContent = readFileSync(fixturePath, "utf-8");
      const goldenBytes = readFileSync(goldenPath);

      // Process A — first independent spawn.
      const processABytes = runCompileStdin(fixtureContent);

      // Anti-horodatage delay >= 1 s — a clock leak in the
      // compiler would diverge the two runs here.
      sleepSync(INTER_PROCESS_DELAY_MS);

      // Process B — second independent spawn (fresh process).
      const processBBytes = runCompileStdin(fixtureContent);

      const cmpAB = Buffer.compare(processABytes, processBBytes);
      const cmpAG = Buffer.compare(processABytes, goldenBytes);
      const cmpBG = Buffer.compare(processBBytes, goldenBytes);

      if (cmpAB !== 0) {
        throw new Error(
          `Process A vs Process B byte mismatch on ${goldenName}. ` +
            `A head: "${headHex(processABytes)}"; B head: "${headHex(processBBytes)}". ` +
            `This is a hidden nondeterminism (clock / random / env leak) — D-26 fails. ` +
            `Inspect the emit path for forbidden timing sources (Date.now, performance, randomUUID, env lookup).`,
        );
      }
      if (cmpAG !== 0) {
        throw new Error(
          `Process A vs golden byte mismatch on ${goldenName}. ` +
            `A head: "${headHex(processABytes)}"; golden head: "${headHex(goldenBytes)}". ` +
            `The committed golden is out of sync with the current compile output — refresh via \`node scripts/update-goldens.mjs\` (D-25 same-commit).`,
        );
      }
      if (cmpBG !== 0) {
        throw new Error(
          `Process B vs golden byte mismatch on ${goldenName}. ` +
            `B head: "${headHex(processBBytes)}"; golden head: "${headHex(goldenBytes)}". ` +
            `Same fix as above — refresh the golden.`,
        );
      }
      expect(cmpAB).toBe(0);
      expect(cmpAG).toBe(0);
      expect(cmpBG).toBe(0);
    }, 60_000); // 60 s vitest timeout — covers the 1.1 s inter-process delay + spawn latency on Windows.
  }
});
