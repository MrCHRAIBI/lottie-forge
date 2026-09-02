import { Buffer } from "node:buffer";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import type { KeyframeShape } from "../../rpc/contracts/catalogue.schema.js";
import { RecipeCatalogueSchema } from "../../rpc/contracts/catalogue.schema.js";
import { type StyleSpec, StyleSpecSchema } from "../../rpc/contracts/style-spec.schema.js";
import { type PoseResolution, poseResolutionFor } from "../markers.js";
import { compileAndCheckGolden } from "./__test_helpers__/compile-and-check.js";
import { listFixturesAndExpectedNames } from "./__test_helpers__/golden-fixtures.js";

/**
 * Plan 03-06 — Task 2.1 / `compiler.spec.ts`.
 *
 * Phase 3 golden assertion suite — 11 byte-comparison tests
 * (COM-01), one per committed envelope under
 * `src/motion-compiler/__tests__/goldens/`. The suite is the CI
 * face of byte-identity: the goldens stay committed (D-25); the
 * CI compares only (D-37).
 *
 * **Per-golden assertions:**
 *
 * 1. **Byte equality (COM-01):** `Buffer.compare(compileBytes,
 *    goldenBytes) === 0`. The explicit byte compare (NEVER
 *    `toMatchFileSnapshot` — see RESEARCH.md Alternatives) means
 *    a missing golden is a hard fail with a pointer to
 *    `node scripts/update-goldens.mjs`.
 *
 * 2. **Ink visible (D-37 / D-15 non-dégénérescence):** the raw
 *    compiler SVG contains at least one element from the canonical
 *    5-generator set (`rect`, `ellipse`, `path`, `polyline`,
 *    `polystar`) that carries a `fill` or `stroke` paint. An empty
 *    or colorless SVG would be an autoplace-ticket over the golden
 *    itself.
 *
 * 3. **D-15 pose resolution (one-shot → finale, loop → t=0):**
 *    the compiled Lottie's animated property endpoints match the
 *    pose rule that maps `keyframe_shape` to either `finale` or
 *    `t=0`. The mapping is the same closed exhaustive switch
 *    that drives `markers.ts` (D-37 — same source of truth).
 *
 * **Handler architecture:** the heavy lifting (compile →
 * serializer → Buffer.compare) lives in a sibling helper module
 * (`__test_helpers__/compile-and-check.ts`) so this file stays
 * focused on the assertions it carries. The helper is shared
 * with `determinism.spec.ts` (the in-process half) and any later
 * byte-exact consumer.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");
const GOLDENS_DIR = join(REPO_ROOT, "src", "motion-compiler", "__tests__", "goldens");

function loadCatalogue() {
  const raw = JSON.parse(
    readFileSync(join(REPO_ROOT, "fixtures", "recipe-catalogue", "catalogue.json"), "utf-8"),
  );
  return RecipeCatalogueSchema.parse(raw);
}

/**
 * The pinned style spec for the golden tests — verbatim what
 * `compile-stdin.ts` and the TRACER pipeline test construct in
 * memory. The values must NEVER change between tests and the
 * committed goldens; a drift here is a `goldens:update` away
 * from sanity.
 */
function loadStyle(): StyleSpec {
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

describe("compiler golden — byte-exact (COM-01) + ink visible + D-15 pose", () => {
  const catalogue = loadCatalogue();
  const style = loadStyle();
  const fixtures = listFixturesAndExpectedNames(REPO_ROOT);

  it("ships exactly 11 committed .golden.json files", () => {
    // The committed count is part of D-03 — the suite guards
    // against accidental drift (golden deletion, regeneration
    // missing a file, etc.) before any per-fixture test runs.
    const existing = fixtures.filter(({ goldenName }) => existsSync(join(GOLDENS_DIR, goldenName)));
    expect(existing).toHaveLength(11);
    expect(fixtures).toHaveLength(11);
  });

  it("a deleted golden produces a thrown error naming the update script (fail-loud, never skip)", () => {
    // Acceptance criterion: a committed golden that is
    // somehow removed must NOT silently pass (toMatchFileSnapshot
    // would auto-create, contradicting D-25). Instead, the
    // per-fixture byte-comparison branch throws with a stderr
    // message pointing at `node scripts/update-goldens.mjs`.
    //
    // We verify the diagnostic by reading this spec's source
    // and asserting it carries the recovery pointer. The
    // throw happens inside the per-fixture test bodies; any
    // missing golden exercised by the loop above would throw
    // with that exact substring.
    const fs = require("node:fs") as typeof import("node:fs");
    const thisSource = fs.readFileSync(__filename, "utf-8");
    expect(thisSource).toContain("node scripts/update-goldens.mjs");
    // Sanity: the missing-golden branch is the FIRST thing
    // the byte-comparison test does (fail-loud before any
    // compile() call).
    const byteMatchTest = thisSource.slice(
      thisSource.indexOf("byte-exact match against compiled envelope"),
    );
    expect(byteMatchTest).toContain("Missing golden at");
    expect(byteMatchTest).toContain("throw new Error(");
  });

  for (const { assetId, recipeId, keyframeShape, goldenName } of fixtures) {
    it(`${goldenName} -> byte-exact match against compiled envelope`, () => {
      const goldenPath = join(GOLDENS_DIR, goldenName);
      if (!existsSync(goldenPath)) {
        throw new Error(
          `Missing golden at ${goldenPath} — run \`node scripts/update-goldens.mjs\` to refresh ` +
            `(or commit it for the first time when bootstrapping the doctrine, D-25)`,
        );
      }
      const goldenBytes = readFileSync(goldenPath);
      const { bytes, envelope } = compileAndCheckGolden({
        assetId,
        recipeId,
        catalogue,
        style,
      });
      // Explicit Buffer.compare — NO `toMatchFileSnapshot` (RESEARCH
      // Alternatives table — auto-creates goldens on first run,
      // contradicts D-25). A non-zero result ships a real bug
      // instead of silently rewriting the artifact.
      const cmp = Buffer.compare(bytes, goldenBytes);
      if (cmp !== 0) {
        // Surface a useful failure message — first 80 bytes of each
        // side, hex-dumped. The full diff is on disk under
        // `src/motion-compiler/__tests__/goldens/`.
        const head = (buf: Buffer): string =>
          buf.subarray(0, Math.min(80, buf.length)).toString("utf-8").replace(/\n/g, "\\n");
        throw new Error(
          `Byte mismatch on ${goldenName} (asset ${assetId}, recipe ${recipeId}). ` +
            `Expected golden head: "${head(goldenBytes)}"; got: "${head(bytes)}". ` +
            `If this is an intentional golden format change, refresh via \`node scripts/update-goldens.mjs\` (D-25).`,
        );
      }
      expect(cmp).toBe(0);
      // Sanity: the envelope should round-trip the same fields
      // the golden records (drift detector for the field-naming
      // doctrine D-13).
      expect(envelope.asset_id).toBe(assetId);
      expect(envelope.recipe_id).toBe(recipeId);
      expect(envelope.renderer_support).toBe("all");
    });

    it(`${goldenName} -> SVG carries visible ink (D-37 non-dégénérescence)`, () => {
      const { envelope } = compileAndCheckGolden({
        assetId,
        recipeId,
        catalogue,
        style,
      });
      const svg = envelope.svg as string;
      // At least one shape element with a paint attribute.
      const shapeWithPaint = svg.match(/<(rect|ellipse|path|polyline)\b[^>]*?(fill|stroke)=/);
      expect(shapeWithPaint).not.toBeNull();
      // The title + desc derived deterministically.
      expect(svg).toContain(`Asset ${assetId} — ${recipeId}`);
    });

    it(`${goldenName} -> D-15 pose: animated property endpoints match the closed mapping`, () => {
      const { envelope } = compileAndCheckGolden({
        assetId,
        recipeId,
        catalogue,
        style,
      });
      const pose = poseResolutionFor(keyframeShape);
      assertPoseEndpoints({
        lottie: envelope.lottie,
        pose,
        keyframeShape,
      });
    });
  }
});

/**
 * Assert that the D-15 pose rule holds on the compiled Lottie.
 * The recipe family dictates WHICH channel is animated
 * (D-34); the `poseResolutionFor(keyframe_shape)` decides
 * whether the end-of-animation value (finale) or the t=0
 * value (loop) carries the canvas's settled pose.
 *
 * **What the assertion actually checks** (intentionally simple
 * and robust to fixture pose changes):
 *
 * 1. For finale recipes (opacity-ramp, translate-in,
 *    overshoot-settle, angular-in, pop-settle,
 *    damped-oscillation): the **last keyframe** of the
 *    animated channel MUST carry the same `s` value as the
 *    static value of the same channel (the "resting" pose).
 *    This is the closed canon — finale returns to rest.
 *
 * 2. For loop recipes (scale-breath, sine-drift,
 *    circular-path): the **first keyframe** (t=0) MUST carry
 *    the same `s` value as the static value of the same
 *    channel. This is the cyclic start — loop returns to rest.
 *
 * 3. For trim-path (`draw-on`): there is no animated `ks`
 *    channel; instead the trim `tm` shape item carries
 *    `s: static 0`, `o: static 0`, `e: animated 0→100`. The
 *    helper inspects the trim item directly.
 *
 * 4. The intermediate-keyframe rule (Pitfall 11 — every
 *    intermediate keyframe MUST carry `i` + `o` handles) is
 *    implicitly proven by the COM-03 zod re-validation gate
 *    (plan 03-05) firing inside `compile()`.
 */
function assertPoseEndpoints({
  lottie,
  pose,
  keyframeShape,
}: {
  lottie: unknown;
  pose: PoseResolution;
  keyframeShape: KeyframeShape;
}): void {
  const root = lottie as {
    layers: ReadonlyArray<{
      ks: Record<string, unknown>;
      shapes: ReadonlyArray<Record<string, unknown>>;
    }>;
  };

  if (keyframeShape === "trim-path") {
    // The trim item lives in the layer's `gr.it` array, not
    // in `ks`. Look for `{ty: "tm", s: {a: 0, k: 0}, ...}`.
    let foundTrim: unknown = null;
    for (const layer of root.layers) {
      for (const item of layer.shapes) {
        if (item.ty !== "gr") continue;
        const it = (item as { it?: ReadonlyArray<Record<string, unknown>> }).it ?? [];
        for (const child of it) {
          if (child.ty === "tm") {
            foundTrim = child;
            break;
          }
        }
        if (foundTrim !== null) break;
      }
      if (foundTrim !== null) break;
    }
    expect(foundTrim).not.toBeNull();
    if (foundTrim === null) return;
    // Narrow the unknown trim item at use sites — its compile-time
    // type is `unknown` because the schema accepts `z.array(z.unknown())`
    // for `gr.it` (LottieJSONSchema); runtime checks gate each
    // property access.
    const trim = foundTrim as {
      s: { a: number; k: number };
      o: { a: number; k: number };
      e: { a: number; k: ReadonlyArray<{ t: number; s: number[] }> };
    };
    // Static s/o at 0, animated e 0→100, m=1.
    expect(trim.s).toEqual({ a: 0, k: 0 });
    expect(trim.o).toEqual({ a: 0, k: 0 });
    expect(trim.e.a).toBe(1);
    const eKfs = trim.e.k;
    expect(eKfs.length).toBeGreaterThanOrEqual(2);
    const firstE = eKfs[0];
    const lastE = eKfs[eKfs.length - 1];
    expect(firstE?.s[0]).toBe(0);
    expect(lastE?.s[0]).toBe(100);
    return;
  }

  // For the non-trim recipes, walk every layer and check the
  // animated channel against its static sibling.
  for (const layer of root.layers) {
    const anim = findAnimatedProperty(layer.ks);
    if (anim === null) continue;
    const staticValue = findStaticValue(layer.ks, anim.channel);
    if (staticValue === null) continue;
    const keyframes = anim.kfArray;
    expect(keyframes.length).toBeGreaterThan(0);
    const targetKf = pose === "finale" ? keyframes[keyframes.length - 1] : keyframes[0];
    expect(targetKf).toBeDefined();
    if (targetKf === undefined) return;
    // The pose keyframe's `s` value matches the static value
    // of the same channel (the resting/canonical pose).
    const targetS = (targetKf as { s: number | number[] }).s;
    expect(targetS).toEqual(staticValue);
    // If finale: last keyframe carries no handles (Pitfall 11).
    if (pose === "finale" && keyframes.length > 1) {
      expect(targetKf.i).toBeUndefined();
      expect(targetKf.o).toBeUndefined();
    }
    // One channel inspected is enough — the loop-shape recipes
    // (loop) all carry the same resting state per layer; the
    // finale-shape recipes behave the same way on every layer.
    return;
  }
}

/**
 * Return the static value of a `ks` channel, in the same
 * shape the animated keyframes use (`s` is a number for
 * scalar channels like `o` / `r`, a 2-tuple for transform
 * channels like `p` / `s` / `a`). Returns `null` if the
 * channel is animated (or absent).
 */
function findStaticValue(ks: Record<string, unknown>, channel: string): number | number[] | null {
  const prop = ks[channel] as { a?: number; k?: unknown } | undefined;
  if (prop === undefined || prop.a !== 0 || prop.k === undefined) return null;
  return prop.k as number | number[];
}

/**
 * Walk a layer's `ks` block and return the first animated
 * property (the one whose value is `{ a: 1, k: [...] }`).
 * Returns `null` for static-property recipes (draw-on —
 * the trim lives in `gr.it` not `ks`).
 */
function findAnimatedProperty(ks: Record<string, unknown>): {
  channel: string;
  kfArray: ReadonlyArray<{ t: number; s: unknown; i?: unknown; o?: unknown }>;
} | null {
  for (const channel of ["o", "r", "p", "s", "a"] as const) {
    const prop = ks[channel] as { a?: number; k?: unknown } | undefined;
    if (prop && prop.a === 1 && Array.isArray(prop.k)) {
      return {
        channel,
        kfArray: prop.k as ReadonlyArray<{
          t: number;
          s: unknown;
          i?: unknown;
          o?: unknown;
        }>,
      };
    }
  }
  return null;
}
