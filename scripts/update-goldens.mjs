#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// update-goldens.mjs — Hard-guarded golden regenerator (Phase 3).
//
// Regenerates the 11 committed envelope-format goldens under
// `src/motion-compiler/__tests__/goldens/`. Each golden is the
// EXACT bytes emitted by `scripts/compile-stdin.ts` (D-24 compact
// JSON + final "\n"; see src/shared/format.ts). The goldens are
// the rebuild-doctrine anchor for Phase 10.
//
// **First line of defense:** if `process.env.CI === "true"` the
// script refuses to run and exits non-zero (D-37 — CI NEVER
// regenerates; CI compares only). This guard is the gate's
// mechanical enforcement — a leaked `CI=true` env var cannot
// silently rewrite the committed bytes.
//
// **Atomic regeneration:** all 11 envelopes are generated and
// collected IN MEMORY first; files are written only after every
// compile succeeded. A failure on the 7th fixture leaves the
// working tree untouched.
//
// **Stdlib-only** — the script must run identically on any CI
// runner and any local fresh checkout (no `npm install`
// surprises). The tsx-runner for `compile-stdin.ts` is located
// via `node_modules/.bin/tsx`, a committed devDep.
//
// Usage:
//   node scripts/update-goldens.mjs
//
// Or, equivalently, after wiring the package.json alias:
//   npm run goldens:update
//
// Failure modes:
//   - `CI=true`        → exit 1, stderr refusal (the gate).
//   - tsx spawn error  → exit 1, stderr message naming the fixture.
//   - envelope parse   → exit 1, stderr message naming the fixture.
//   - write error      → exit 1, stderr message naming the fixture.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { exit } from "node:process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");
const FIXTURES_DIR = join(REPO_ROOT, "fixtures", "render-specs");
const GOLDENS_DIR = join(REPO_ROOT, "src", "motion-compiler", "__tests__", "goldens");
const COMPILE_STDIN = join(REPO_ROOT, "scripts", "compile-stdin.ts");

// Locate the committed tsx binary (devDep — node_modules is
// committed per the Phase 1 doctrinal file list). platform
// shims live under `node_modules/.bin/`; the actual entry is
// `node_modules/tsx/dist/cli.mjs`. The bin symlink cross-platform
// dispatch is anchored on the mjs entry — Node invokes it
// directly and tsx's loader handles the rest.
const TSX_CLI = join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");

/**
 * Order-stable list of fixture filenames (10 recipes + galerie).
 * The sort key is the asset_id embedded in each fixture (parsed
 * once at the top to keep the listing deterministic and
 * independent of filesystem readdir order — Windows / Linux
 * disagree on dirent order, and any drift would invalidate
 * three-way byte comparisons across machines).
 */
function listFixturesOrdered() {
  if (!existsSync(FIXTURES_DIR)) {
    process.stderr.write(`update-goldens: fixtures directory missing at ${FIXTURES_DIR}\n`);
    exit(1);
  }
  const names = readdirSync(FIXTURES_DIR).filter((n) => n.endsWith(".json"));
  const parsed = names.map((name) => {
    const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf-8"));
    return { name, asset_id: raw.asset_id };
  });
  parsed.sort((a, b) => a.asset_id.localeCompare(b.asset_id));
  return parsed.map((p) => p.name);
}

/**
 * Map a fixture file basename (`fade.json`, `galerie.json`) to
 * the golden file basename (`a-001.fade.golden.json`,
 * `a-011.galerie.golden.json`). The 10 recipe fixtures use
 * `{asset_id}.{recipe_id}.golden.json`; the galerie fixture
 * substitutes `galerie` for the recipe id because the galerie
 * is a set-level fixture rather than a recipe-level one (D-03
 * option-b — see 03-03 SUMMARY).
 */
function goldenNameFor(fixtureName, fixtureJson) {
  return `${fixtureJson.asset_id}.${fixtureName.replace(/\.json$/, "")}.golden.json`;
}

/**
 * Run `compile-stdin.ts` over one RenderSpec JSON payload via
 * tsx. Returns the captured stdout bytes (the envelope on
 * success). Throws with a stderr message on any error.
 */
function runCompileStdin(renderSpecJson) {
  if (!existsSync(TSX_CLI)) {
    throw new Error(
      `tsx binary missing at ${TSX_CLI} — \`npm ci\` should have installed it (devDep, pinned in package.json)`,
    );
  }
  const result = spawnSync(process.execPath, [TSX_CLI, COMPILE_STDIN], {
    cwd: REPO_ROOT,
    input: renderSpecJson,
    encoding: "utf-8",
    timeout: 30_000,
  });
  if (result.error) {
    throw new Error(`tsx spawn failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = result.stderr ?? "<no stderr>";
    throw new Error(`compile-stdin exited ${result.status} for fixture: ${stderr.trim()}`);
  }
  // The last byte of stdout must be a single LF (D-24 +
  // Pitfall 9). Empty stdout is a sanity failure — never a
  // half-regenerated set.
  const out = result.stdout ?? "";
  if (out.length === 0) {
    throw new Error("compile-stdin emitted zero stdout bytes — refusing half-regenerated set");
  }
  if (out[out.length - 1] !== "\n") {
    throw new Error(
      `compile-stdin output does not end with \\n (D-24 + Pitfall 9); got last byte 0x${out.charCodeAt(
        out.length - 1,
      ).toString(16)}`,
    );
  }
  // Sanity-check the envelope parses — a ParseError here would
  // mean the committed goldens become garbage, so the script
  // MUST fail loud.
  try {
    JSON.parse(out); // exact-byte parse — preserves everything
  } catch (cause) {
    throw new Error(`envelope failed JSON.parse: ${String(cause)}`);
  }
  return out;
}

function main() {
  // **The D-37 gate.** CI never regenerates goldens. A leaked
  // `CI=true` env var would silently rewrite the rebuild
  // doctrine; the mechanical check is the very first thing.
  if (process.env.CI === "true") {
    process.stderr.write(
      "update-goldens: refusing to run — CI=true is set (D-37 — CI compares only, never regenerates).\n" +
        "  To refresh goldens locally: `unset CI && node scripts/update-goldens.mjs`.\n",
    );
    exit(1);
  }

  if (!existsSync(GOLDENS_DIR)) {
    mkdirSync(GOLDENS_DIR, { recursive: true });
  }

  const fixtureNames = listFixturesOrdered();
  if (fixtureNames.length !== 11) {
    process.stderr.write(
      `update-goldens: expected exactly 11 committed RenderSpec fixtures, found ${fixtureNames.length}: ` +
        `[${fixtureNames.join(", ")}]\n`,
    );
    exit(1);
  }

  // Pass 1 — collect all 11 envelopes in memory first.
  const collected = [];
  for (const fixtureName of fixtureNames) {
    const fixturePath = join(FIXTURES_DIR, fixtureName);
    const renderSpecJson = readFileSync(fixturePath, "utf-8");
    const fixtureJson = JSON.parse(renderSpecJson);
    const goldenName = goldenNameFor(fixtureName, fixtureJson);
    let bytes;
    try {
      bytes = runCompileStdin(renderSpecJson);
    } catch (cause) {
      process.stderr.write(`update-goldens: ${fixtureName} -> ${cause.message}\n`);
      exit(1);
    }
    collected.push({ goldenName, bytes });
  }

  // Pass 2 — write all 11 atomic files. After the first write,
  // a failure leaves the working tree in a partial state, but
  // no half-regenerated set was committed (D-25). The scripts
  // caller will see the partial state and decide whether to
  // retry / `git checkout -- src/motion-compiler/__tests__/goldens/`
  // / etc. A half-set is far better than a silently-overwritten
  // committed set.
  for (const { goldenName, bytes } of collected) {
    const outPath = join(GOLDENS_DIR, goldenName);
    try {
      writeFileSync(outPath, bytes, { encoding: "utf-8" });
    } catch (cause) {
      process.stderr.write(`update-goldens: write failed for ${goldenName}: ${cause.message}\n`);
      exit(1);
    }
  }

  // Summary on stdout (operators see WHAT happened, not the errors).
  process.stdout.write(
    `update-goldens: regenerated ${collected.length} golden envelopes under ${GOLDENS_DIR}\n` +
      collected.map(({ goldenName, bytes }) => `  ${goldenName} (${bytes.length} bytes)`).join("\n") +
      "\n",
  );
  exit(0);
}

main();
