#!/usr/bin/env tsx
// SPDX-License-Identifier: Apache-2.0
//
// regenerate-render-spec-fixtures.mts — Deterministic regeneration of the
// 11 positive RenderSpec fixtures under `fixtures/render-specs/*.json`
// from the Phase 3 single-source-of-truth builder
// `src/motion-compiler/__tests__/make-render-spec.ts` (D-04).
//
// Usage:
//   npx tsx scripts/regenerate-render-spec-fixtures.mts
//
// These bytes are NOT goldens — they are *inputs* to the Motion Compiler.
// The compiler's goldens (plan 03-06) are derived from them. Regenerating
// is for after a deliberate builder change; the CI compares only (D-25).
//
// Stdout data / stderr errors / exit-code discipline mirrors the other
// Phase 3 scripts (assert-zero-skips.mjs, update-goldens.mjs).

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { makeAllFixtures } from "../src/motion-compiler/__tests__/make-render-spec.js";
import { writeDeterministicJson } from "../src/shared/format.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");
const FIXTURES_DIR = join(REPO_ROOT, "fixtures", "render-specs");

mkdirSync(FIXTURES_DIR, { recursive: true });

const specs = makeAllFixtures();

// Galerie is identified by its asset_id (`a-011`) -- the recipe_id is
// `wiggle` (same as the canonical wiggle fixture) but the file must be
// distinct. Every other spec maps recipe_id -> filename 1:1.
const GALERIE_ASSET_ID = "a-011";

let written = 0;
for (const spec of specs) {
  let filename: string;
  if (spec.asset_id === GALERIE_ASSET_ID) {
    filename = "galerie.json";
  } else {
    filename = `${spec.recipe_id}.json`;
  }
  const path = join(FIXTURES_DIR, filename);
  writeDeterministicJson(path, spec);
  written += 1;
  process.stdout.write(
    `wrote ${filename} (asset_id=${spec.asset_id}, recipe=${spec.recipe_id}, components=${spec.components.length})\n`,
  );
}

process.stdout.write(`\nregenerated ${written} fixture(s) under fixtures/render-specs/\n`);
