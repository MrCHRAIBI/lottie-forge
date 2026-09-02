import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import type { RecipeId } from "../../rpc/contracts/vocabulary.schema.js";

/**
 * Plan 03-06 — Task 2.2 / `determinism.spec.ts`.
 *
 * **COM-01 + D-26/D-37 three-way byte-equality proof.**
 *
 * **D-26 en extension — every committed fixture is covered** (not a
 * representative subset): the 10 per-recipe fixtures + the galerie
 * multi-component fixture. Coverage is DERIVED from
 * `fixtures/render-specs/` at runtime (same derivation rule as
 * `update-goldens.mjs::goldenNameFor`), so a fixture added to the
 * directory is automatically proven — the count pin below keeps the
 * derivation honest.
 *
 * **Two global passes, one anti-horodatage gap.** `beforeAll` runs
 * pass A over ALL fixtures, sleeps ≥ 1 second once (a clock leak
 * would diverge any run before the gap from its run after it), then
 * runs pass B over ALL fixtures. Cost: ≈ 22 spawns + one 1.1 s
 * delay — no meaningful CI-budget delta versus the old 3-fixture
 * variant, full-coverage yield instead.
 *
 * The committed golden is the third axis. Three-way Buffer.compare
 * must hold per fixture.
 *
 * **Process spawning:** the helper uses tsx — invoking
 * `node <tsx-cli> scripts/compile-stdin.ts` is the same
 * invocation `update-goldens.mjs` uses; a divergence in
 * spawning signals a script-level drift.
 *
 * **Companion byte check (D-25 same-commit):** if the test
 * detects a divergence, it surfaces the per-process stdout
 * head (first 80 bytes) — a debugging operator sees
 * exactly where the two processes diverged without needing
 * to inspect shell captures.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const COMPILE_STDIN = join(REPO_ROOT, "scripts", "compile-stdin.ts");
const TSX_CLI = join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const FIXTURES_DIR = join(REPO_ROOT, "fixtures", "render-specs");
const GOLDENS_DIR = join(REPO_ROOT, "src", "motion-compiler", "__tests__", "goldens");

/** update-goldens.mjs refuses any count other than 11 — same pin here. */
const EXPECTED_FIXTURE_COUNT = 11;

/** A fixture case maps a fixture file + asset id + golden basename. */
interface FixtureCase {
  recipeId: RecipeId;
  assetId: string;
  fixtureFilename: string;
  goldenName: string;
}

/**
 * Derive the full case list from the committed fixtures directory —
 * `goldenNameFor` mirrors `update-goldens.mjs` byte-for-byte so the
 * two derivations can never drift.
 */
function deriveFixtureCases(): FixtureCase[] {
  const names = readdirSync(FIXTURES_DIR)
    .filter((n) => n.endsWith(".json"))
    .sort();
  return names.map((fixtureFilename) => {
    const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, fixtureFilename), "utf-8")) as {
      asset_id: string;
      recipe_id: RecipeId;
    };
    return {
      recipeId: raw.recipe_id,
      assetId: raw.asset_id,
      fixtureFilename,
      goldenName: `${raw.asset_id}.${fixtureFilename.replace(/\.json$/, "")}.golden.json`,
    };
  });
}

const FIXTURE_CASES = deriveFixtureCases();

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

describe("determinism proof — two global passes + golden, three-way byte-equality (COM-01, D-26 en extension, D-37)", () => {
  // Collected pass bytes, keyed by fixture filename; filled by beforeAll.
  const passA = new Map<string, Buffer>();
  const passB = new Map<string, Buffer>();

  beforeAll(() => {
    if (FIXTURE_CASES.length !== EXPECTED_FIXTURE_COUNT) {
      throw new Error(
        `expected exactly ${EXPECTED_FIXTURE_COUNT} committed RenderSpec fixtures, found ${FIXTURE_CASES.length}: ` +
          `${FIXTURE_CASES.map((c) => c.fixtureFilename).join(", ")}`,
      );
    }
    for (const { fixtureFilename, goldenName } of FIXTURE_CASES) {
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
    }

    // Pass A — first independent spawn per fixture.
    for (const { fixtureFilename } of FIXTURE_CASES) {
      passA.set(
        fixtureFilename,
        runCompileStdin(readFileSync(join(FIXTURES_DIR, fixtureFilename), "utf-8")),
      );
    }

    // Anti-horodatage delay >= 1 s — a clock leak in the
    // compiler would diverge the two passes here.
    sleepSync(INTER_PROCESS_DELAY_MS);

    // Pass B — second independent spawn per fixture (fresh processes).
    for (const { fixtureFilename } of FIXTURE_CASES) {
      passB.set(
        fixtureFilename,
        runCompileStdin(readFileSync(join(FIXTURES_DIR, fixtureFilename), "utf-8")),
      );
    }
  }, 120_000); // 22 spawns + the 1.1 s busy-wait — generous, still bounded.

  for (const { fixtureFilename, goldenName } of FIXTURE_CASES) {
    it(`${goldenName}: processA === processB === committed golden (global >=1 s pass gap)`, () => {
      const goldenBytes = readFileSync(join(GOLDENS_DIR, goldenName));
      const processABytes = passA.get(fixtureFilename);
      const processBBytes = passB.get(fixtureFilename);
      if (processABytes === undefined || processBBytes === undefined) {
        throw new Error(
          `pass bytes missing for ${fixtureFilename} — beforeAll must have run both passes (test isolation broken)`,
        );
      }

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
    });
  }
});
