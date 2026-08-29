#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// assert-zero-skips.mjs — Hard-fail when any test is skipped in CI.
//
// Parses one or more JUnit-XML files (emitted by pytest --junitxml=... and
// vitest's junit reporter), sums the `skipped` attribute found on every
// <testsuites> and <testsuite> element, and exits non-zero if the total is > 0.
//
// Doctrine: "the gate is the gate" (§1.8 of docs/project/04_Modeles.md) — a CI
// half-silent bridge cannot pass green. Any test marked skip/xfail/conditional
// in the bridge chain is a probe-misroute we MUST surface, not bury.
//
// Usage:
//   node scripts/assert-zero-skips.mjs <junit.xml> [<junit.xml> ...]
//
// Stdlib-only — no dependencies on purpose, the script must run identically
// in any CI runner and any local fresh checkout.

import { readFileSync } from "node:fs";
import { exit } from "node:process";

/**
 * Sum the `skipped="N"` attribute found on <testsuites> and <testsuite>
 * opening tags inside an XML payload. The regex intentionally targets
 * opening tags only — we don't care about <testcase skipped="0"> children.
 *
 * The JUnit-XML emit by pytest and vitest always quotes the attribute, so
 * the quoted-number regex is reliable across both.
 *
 * @param {string} xml raw file contents
 * @returns {number} sum of skipped attributes
 */
export function countSkippedAttributes(xml) {
  // Matches: <testsuites ... skipped="N" ...>  OR  <testsuite ... skipped="N" ...>
  // Captures the integer literal in group 1.
  const re = /<testsuites?\b[^>]*\bskipped="(\d+)"[^>]*>/g;
  let total = 0;
  // Iterate without using String.prototype.matchAll for compat with Node 18+.
  let m;
  while ((m = re.exec(xml)) !== null) {
    total += Number.parseInt(m[1], 10);
  }
  return total;
}

/**
 * Parse one XML file and return its skipped total, with a friendly label.
 *
 * @param {string} path file path
 * @returns {{path: string, skipped: number}}
 */
function inspectFile(path) {
  const contents = readFileSync(path, "utf8");
  return { path, skipped: countSkippedAttributes(contents) };
}

function main(argv) {
  // Strip node + script path from argv; what remains is the user-supplied list.
  const files = argv.slice(2);

  if (files.length === 0) {
    process.stderr.write(
      "usage: node scripts/assert-zero-skips.mjs <junit.xml> [<junit.xml> ...]\n",
    );
    exit(2);
  }

  let grandTotal = 0;
  const lines = [];
  for (const file of files) {
    const { path, skipped } = inspectFile(file);
    lines.push(`  ${path}: skipped=${skipped}`);
    grandTotal += skipped;
  }

  // Always print the breakdown first — operators should see WHY the gate tripped.
  process.stdout.write(`${lines.join("\n")}\ntotal skipped: ${grandTotal}\n`);

  if (grandTotal > 0) {
    process.stderr.write(
      `\nFAIL: ${grandTotal} test(s) skipped — CI requires zero skipped tests (§4.2).\n`,
    );
    exit(1);
  }
  exit(0);
}

main(process.argv);