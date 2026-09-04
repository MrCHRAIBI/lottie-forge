# Phase 4: Anim QA pinnée - Pattern Map

**Mapped:** 2026-09-04
**Files analyzed:** 33 (25 create + 8 modify)
**Analogs found:** 25 / 33 exact or role-match · 8 partial (browser/CI surfaces with no in-repo precedent — use RESEARCH.md Q3–Q7 patterns)

**Sources:** CONTEXT.md (D-01…D-27) + RESEARCH.md (file inventory §565-608) cross-checked against the real tree. Every excerpt below is verbatim from the repo, read this session.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/anim-qa/runner.ts` | service (orchestrator) | pipeline (request-response via RPC) | `src/rpc/server.ts` handlers + `scripts/compile-stdin.ts` | role-match |
| `src/anim-qa/frame-walker.ts` | service (browser driver) | event-driven capture | — (first Playwright consumer) | none → RESEARCH Q5/Q6 |
| `src/anim-qa/diff.ts` | utility (pure math) | transform (PNG buffers → stats) | `src/shared/format.ts` (determinism) | partial |
| `src/anim-qa/baseline.ts` | service (pure resolver) | file-I/O lookup (lazy per asset_id) | `src/rpc/server.ts` `loadCatalogue`/`buildDefaultContext` | role-match |
| `src/anim-qa/structural.ts` | service (validation gate) | request-response (no browser) | `src/motion-compiler/feature-gate.ts` | exact |
| `src/anim-qa/report.ts` | model + serializer | transform (QAReport → bytes) | `scripts/compile-stdin.ts` `buildEnvelope` + `src/shared/format.ts` | exact |
| `src/anim-qa/theming.ts` | utility (pure functions) | transform (deep-clone + rewrite) | `src/motion-compiler/markers.ts` | exact |
| `src/anim-qa/page/` | component (QA page assets) | — | — | none → RESEARCH Q6 |
| `src/rpc/contracts/qa-report.schema.ts` | model (zod contract) | validation | `src/rpc/contracts/motion-compiler.schema.ts` | exact |
| `lottie_forge/domain/qa_report.py` | model (Pydantic) | validation | `lottie_forge/domain/style.py` + `_shared.py` | exact |
| `src/anim-qa/__tests__/*.spec.ts` | test (unit, verify) | — | `src/rpc/server.spec.ts` | exact |
| `src/anim-qa/__tests__/*.qa.spec.ts` | test (container, qa) | — | `src/rpc/server.spec.ts` conventions | role-match |
| `fixtures/qa/thresholds.json` | config data (versioned) | — | `fixtures/recipe-catalogue/catalogue.json` load pattern | role-match |
| `fixtures/qa/dark-theme.json` | config data (versioned) | — | same + `ThemeAnchorId` closed vocab | role-match |
| `fixtures/qa/capture-config.json` | config data (versioned) | — | same | role-match |
| `fixtures/rejection-cases/qa-report.json` | test fixture (shared bridge) | — | `fixtures/rejection-cases/render-spec.json` | exact |
| `fixtures/style-specs/example-style/baseline-frames/` (+`index.json`) | test fixture (baseline PNGs) | file-I/O | `src/motion-compiler/__tests__/goldens/` (bytes-as-product) | role-match |
| `qa-container.lock` | config (single source B1) | — | — (key=value lock file) | none → RESEARCH Q2 |
| `vitest.qa.config.ts` | config (test runner) | — | `vitest.config.ts` | exact |
| `scripts/qa-run.mjs` | utility script | batch (docker run) | `scripts/update-goldens.mjs` (spawn discipline) | role-match |
| `scripts/baseline-update.mjs` | utility script | batch (regen + CI guard) | `scripts/update-goldens.mjs` | exact |
| `scripts/qa-flake-proof.mjs` | utility script | batch (10× compare) | `scripts/update-goldens.mjs` + `assert-zero-skips.mjs` | role-match |
| `scripts/qa-calibrate.mjs` | utility script | batch (spike D-07) | `scripts/update-goldens.mjs` | role-match |
| `.github/workflows/qa.yml` | CI config | batch | `.github/workflows/verify.yml` (read-only ref) | role-match |
| `docs/qa.md` | documentation | — | — | none |
| `package.json` (modify) | config (deps + scripts) | — | itself (`goldens:update` alias pattern) | exact |
| `vitest.config.ts` (modify) | config | — | itself | exact |
| `src/rpc/server.ts` (modify) | controller (RPC dispatch) | request-response NDJSON | itself (Ph 3 handlers) | exact |
| `src/rpc/contracts/rejection-cases.ts` (modify) | loader/model | — | itself | exact |
| `tests/bridge/rejection_loader.py` (modify) | loader | — | itself | exact |
| `lottie_forge/rpc/client.py` (modify) | transport model | — | itself | exact |
| `.gitignore` (modify) | config | — | itself (`fixtures/bridge/` entry) | exact |
| Python integration tests (new) | test (integration) | request-response over wire | `tests/rpc/test_rpc_integration.py` | exact |

---

## Pattern Assignments

### `src/rpc/server.ts` — MODIFY: add `anim_qa.run` (controller, request-response)

**Analog:** itself — the Phase 3 handler pair `handleMotionCompile` / `handleSanitize`. The new method is a third dispatch branch following the identical shape.

**Closed code set** (lines 86-97) — extend 8→10 same-commit with `baseline_missing` + `baseline_stale` (D-17):
```ts
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
```

**Dispatch pattern** (lines 269-282) — `anim_qa.run` adds a third `if` before the fallback:
```ts
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
```
Delta: update the closed-set message string to include `anim_qa.run`.

**Startup context** (lines 124-127, 152-166) — D-18 extends `ServerContext` with QA configs loaded once at startup:
```ts
export interface ServerContext {
  readonly catalogue: RecipeCatalogue;
  readonly style: StyleSpec;
}
```
```ts
function loadCatalogue(): RecipeCatalogue {
  const path = join(REPO_ROOT, "fixtures", "recipe-catalogue", "catalogue.json");
  const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  return RecipeCatalogueSchema.parse(raw);
}
```
Delta: add `thresholds` / `darkTheme` / `captureConfig` fields parsed through their zod schemas in `buildDefaultContext()` (lines 164-166); baselines resolve lazily per `asset_id` inside the handler (never at startup — sidecar check D-26 is per-request).

**Verdict ≠ transport error** (lines 329-353, `handleSanitize`) — the model for returning a business "fail" as `ok:true`:
```ts
  const request: SanitizeRequest = parsed.data;
  const result = sanitizeSvg(request);
  if (result.ok) {
    return okEnvelope(id, result);
  }
```
`handleAnimQa` mirrors this: QA verdict `passed=false` → `okEnvelope(id, qaReport)` (D-17/B5); only `validation_error` (request zod reject, lines 286-294 pattern), the two new baseline codes, and `internal` (unexpected throw, lines 315-325 pattern with stderr stack) produce `ok:false`.

**Stdout discipline** (lines 18-22 doc + 379-398 write path):
```ts
      const envelope = processLine(line, ctx);
      process.stdout.write(`${JSON.stringify(envelope)}\n`);
```
Delta: banner line 370 lists the new method — client matches substring `"rpc-server: ready"` (client.py:150) so appending text is safe:
```ts
    "rpc-server: ready — catalogue + style loaded (methods: motion.compile, svg.sanitize)\n",
```

**Entry-guard pattern** (lines 413-425): `isEntryModule()` prevents `main()` under vitest import — replicate, never import Playwright at server module top level (m7: steps 1-3 fail ⇒ no spawn; D-24: unit specs never import playwright).

---

### `src/rpc/contracts/qa-report.schema.ts` — CREATE (model, validation)

**Analog:** `src/rpc/contracts/motion-compiler.schema.ts`

**Imports pattern** (lines 1-5) — bare zod + sibling `.js`-suffixed imports, doc block carries decision IDs:
```ts
import { z } from "zod";

import { ASSET_ID_PATTERN } from "./asset-spec.schema.js";
import { KeyframeShapeSchema } from "./catalogue.schema.js";
```

**Closed enum pattern** (lines 269-279) — for `ReasonCode` (7 literals, D-13) and reuse of `RendererSupportSchema` verbatim (D-18):
```ts
export const RendererSupportSchema = z.enum(["all", "svg-only"] as const);
export type RendererSupport = z.infer<typeof RendererSupportSchema>;
```

**strictObject + superRefine cross-field gate** (lines 652-671) — the template for `QAReportSchema` (incl. the `reason_codes` non-empty ⟺ `passed===false` invariant, SC-4):
```ts
export const LottieJSONSchema = z
  .strictObject({
    v: z.literal("5.7.0"),
    fr: z.number().min(1).max(120),
    ip: z.number().int().min(0),
    op: z.number().int().min(1),
    ddd: z.literal(0),
    assets: z.array(z.unknown()).length(0),
    layers: z.array(LottieShapeLayerSchema).min(1),
  })
  .superRefine((lottie, ctx) => {
    if (!(lottie.op >= lottie.ip)) {
      ctx.addIssue({
        code: "custom",
        path: ["op"],
        message: `op (${lottie.op}) must be >= ip (${lottie.ip}); negative stretch rejected`,
      });
    }
  });
```
Delta: `qa-report.schema.ts` mirrors the Pydantic §7.6 `PixelDiffStats` + `QAReport` verbatim + additive fields `applied_max_diff_pixels` (int ≥ 0) and `theme_smoke_path: z.enum(["dotlottie-setTheme", "applyTheme-svg"])` (D-14/D-20, §4.14 same-commit rule). `timestamp` typed but excluded from content hashes (§7.6/D-15).

---

### `lottie_forge/domain/qa_report.py` — CREATE (model, validation)

**Analog:** `lottie_forge/domain/style.py` + `lottie_forge/domain/_shared.py`

**Strict config pattern** (`_shared.py` lines 25-26):
```python
STRICT_CONFIG = ConfigDict(extra="forbid", strict=True)
"""Shared model config: no coercion, no unknown fields."""
```

**Model conventions** (`style.py`): module docstring states the TS mirror path ("Mirrored field-for-field in TypeScript by ``src/rpc/contracts/...`` (DM-05)"), typed aliases via `Annotated[..., Field(ge=..., le=...)]`, cross-field invariants via `@model_validator(mode="after")`, every class sets `model_config = STRICT_CONFIG`. Delta: `PixelDiffStats` + `QAReport` per §7.6 verbatim; snake_case field names identical to the zod mirror (D-13 naming convention).

---

### `src/rpc/contracts/rejection-cases.ts` + `tests/bridge/rejection_loader.py` — MODIFY (loaders)

**Analog:** themselves.

**TS contract map** (rejection-cases.ts lines 67-76) — add `"qa-report"` entry same-commit with the fixture (D-14):
```ts
export const CONTRACT_FILES: Record<string, string> = {
  "style-spec": "style-spec.json",
  recipe: "recipe.json",
  ...
  "render-spec": "render-spec.json",
  "lottie-json": "lottie-json.json",
};
```
**TS closed expect-code set** (lines 48-57) — extend 8→10 in the SAME commit as `server.ts` (Q8):
```ts
export const REJECTION_EXPECT_CODES = [
  "parse_error",
  "validation_error",
  "compile_error",
  "sanitize_rejected",
  "unsupported_feature",
  "internal",
  "protocol_error",
  "method_not_found",
] as const;
```
**Python contract map** (rejection_loader.py lines 28-35) — currently 6 entries; add `"qa-report": "qa-report.json"` same-commit:
```python
CONTRACT_FILES: dict[str, str] = {
    "style-spec": "style-spec.json",
    "recipe": "recipe.json",
    ...
    "catalogue": "catalogue.json",
}
```
Note the deliberate asymmetry (TS has `render-spec`/`lottie-json`, Py does not) is pre-existing — preserve each file's own inventory; only add `qa-report` to both.

**Fixture format** — `fixtures/rejection-cases/qa-report.json` copies `render-spec.json` lines 1-21 shape exactly:
```json
[
  {
    "case_id": "render-spec-missing-asset-id",
    "ref": "example-style@1.0.0",
    "model": "RenderSpec",
    "expect_code": "validation_error",
    "expect_paths": [["asset_id"]],
    "payload": { ... }
  }
```
Deltas: `case_id` kebab-case with `qa-report-` prefix; `model` = `"QAReport"`; `expect_code` may be `validation_error` or (after the 8→10 extension) `baseline_missing`; path-membership only, never message text (D-08).

---

### `lottie_forge/rpc/client.py` — MODIFY (transport mirror)

**Analog:** itself (lines 71-84) — extend the tuple 8→10 same-commit:
```python
RPC_ERROR_CODES: tuple[str, ...] = (
    "parse_error",
    ...
    "method_not_found",
)
"""Closed enum of RPC error codes -- never add a code without
updating both sides of the bridge in the same commit."""
```
No other client change needed: `RPCClient.call("anim_qa.run", {...})` works unmodified (generic transport); win32 shim lines 101-104 and banner match (line 150) already handle the spawn.

---

### `src/anim-qa/structural.ts` — CREATE (service, request-response gate, no browser)

**Analog:** `src/motion-compiler/feature-gate.ts` — this file IS the reuse surface for gate step 2 (§7.3).

**Typed error with closed code** (lines 93-103):
```ts
export class UnsupportedFeatureError extends Error {
  public readonly code = "unsupported_feature" as const;

  constructor(
    message: string,
    public readonly feature?: string,
  ) {
    super(message);
    this.name = "UnsupportedFeatureError";
  }
}
```

**Composition-level gate** (lines 210-229) — `assertSupportedComposition(composition: LottieJSON)` is called verbatim at step 2; the `classify()` closed mapping (lines 248-258) is NOT re-run server-side (D-18 anti-pattern: `renderer_support` arrives in the request).

**Structural-diff pattern to follow** (markers.ts lines 89-94) — exhaustive switch, no default branch, `never` guard, for the step-3 checks (layers/ids/keyframes vs recipe):
```ts
    default: {
      const _exhaustive: never = keyframeShape;
      throw new Error(
        `unknown keyframe shape: ${JSON.stringify(_exhaustive)} — must be one of the 10 locked shapes`,
      );
    }
```
Delta: step 1 = `LottieJSONSchema.safeParse` (schema reuse, motion-compiler.schema.ts:652); any step 1-3 failure returns a QAReport with `structural:schema` / `feature:3D` / `stretch:negative` / `shape:layers` reason codes (D-13 closed set) — never throws to the RPC layer, never touches a browser (m7 test asserts zero spawns).

---

### `src/anim-qa/theming.ts` — CREATE (utility, pure transform) — `slotizeForTheme` + `applyTheme`

**Analog:** `src/motion-compiler/markers.ts` — the repo's canonical pure-module shape.

**Module contract** (markers.ts lines 26-36, 36):
```
 * The exhaustive switch (no default branch, `never` guard) is
 * the D-37 contract.
 ...
 * **Pure module, zero I/O.**
```
**Closed-vocabulary function** (lines 75-96) — `poseResolutionFor` maps the 10 locked shapes → `"finale" | "t=0"`; this same function is the DATA SOURCE for `canonicalFrame()` (D-08: enter → final frame, loop → frame 0):
```ts
export function poseResolutionFor(keyframeShape: KeyframeShape): PoseResolution {
  switch (keyframeShape) {
    case "opacity-ramp":
    ...
      return "finale";
    case "scale-breath":
    case "sine-drift":
    case "circular-path":
      return "t=0";
```
**Composition helper** (lines 106-109) — `svgPoseFrameFor(recipe, op)` is the direct template for the shared `canonicalFrame(recipe, op)`:
```ts
export function svgPoseFrameFor(recipe: CatalogRecipe, op: number): number {
  const resolution = poseResolutionFor(recipe.keyframe_shape);
  return resolution === "finale" ? op : 0;
}
```
Delta: `canonicalFrame()` lives in `src/anim-qa/` (or re-exported), consumed by 3 callers (poster SVG, baseline gen, frame-walker) with the three-index equality test (D-08/m4). `applyTheme` walks `layers`, matches `layer.nm === anchor` (D-02), rewrites fill/stroke `c` to 0-1 RGB, deep-clones, never mutates input (feature-gate.ts:245-251 no-mutation contract is the tested pattern). `slotizeForTheme` adds `"sid": "<layer nm>"` to fill `c` props of anchor layers (RESEARCH Q1 — required for dotLottie setTheme to have any effect; pure, unit-tested on synthetic Lottie à la D-33).

---

### `src/anim-qa/baseline.ts` — CREATE (service, pure resolver + file-I/O lookup)

**Analog:** `src/rpc/server.ts` `loadCatalogue`/`buildDefaultContext` (startup zod-parsed config load — lines 152-166, quoted above) + REPO_ROOT discipline (lines 69-70):
```ts
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
```
**Pure-function testability** (markers.ts module doctrine): the resolver maps `(asset_id, baseline root)` → paths + sidecar verdict with zero I/O in the decision function; I/O isolated at the edges.

Delta (D-18/D-26): configs at startup into `ServerContext`; baseline resolution lazy per `asset_id`; sidecar `baseline-frames/index.json` holds `lottie_sha256` + `captureConfig_hash` (+ thresholds/dark-theme hashes, traceability only); predicate: `lottie_sha256 mismatch OR captureConfig_hash mismatch → baseline_stale`, missing entry → `baseline_missing` — decided BEFORE any pixel work; sha256 via `node:crypto`.

---

### `src/anim-qa/report.ts` — CREATE (model + serializer, transform)

**Analog:** `scripts/compile-stdin.ts` `buildEnvelope` (lines 135-153) + `src/shared/format.ts`.

**Fixed field order, insertion-order serializer** (compile-stdin.ts lines 140-152):
```ts
 *   asset_id → recipe_id → renderer_support → lottie → svg
 *
 * The deterministic serializer preserves insertion order (D-23).
 * Any future addition must be appended at the end — same-commit
 * byte discipline (D-25).
```
**The ONLY serializers allowed** (`src/shared/format.ts` lines 45-58, 78-92):
```ts
export function fmt(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error(`fmt(): non-finite input (${n}) — finite numbers only (D-35)`);
  }
  if (Object.is(n, -0)) n = 0;
  ...
  let s = n.toFixed(4);
  if (s.includes(".")) {
    s = s.replace(/0+$/, "").replace(/\.$/, "");
  }
  return s === "-0" ? "0" : s;
}
```
```ts
export function serializeDeterministicJson(value: unknown): string {
  return serializeValue(value);
}
```
```ts
export function writeDeterministicJson(path: string, value: unknown): void {
  const bytes = `${serializeDeterministicJson(value)}\n`;
  writeFileSync(path, bytes);
}
```
Delta: every QAReport JSON artifact + sidecar bytes flow through these — never `JSON.stringify` on float-bearing paths (P8: flake-proof false negatives). `timestamp` injectable (D-15), excluded from identity compares. `ReasonCode` closed Literal of the 7 codes both sides (D-13).

---

### `src/anim-qa/diff.ts` — CREATE (utility, transform)

**Analog:** no exact in-repo analog (first pixelmath code). Determinism/test conventions come from `format.ts` (float authority, quoted above) + `feature-gate.spec.ts` style.

Delta (RESEARCH Q4): `pixelmatch@7.2.0` sync API `pixelmatch(img1, img2, diff, w, h, opts)` returns mismatch count; `pngjs@7.0.0` `PNG.sync.read/write`; crop-based per-anchor region diff (row-sliced RGBA `subarray`, per-crop pixelmatch, `diff: null`); `PixelDiffStats` = max/mean/p95 (nearest-rank, policy fixed + unit-tested) + `frames_above_tolerance`; unit-tested on synthetic PNG pairs in the default vitest project (D-24 — no browser, no playwright import).

---

### `src/anim-qa/frame-walker.ts` + `src/anim-qa/page/` + `runner.ts` — CREATE (service, event-driven browser)

**Analogs:** partial only.
- Orchestration shape: `server.ts` handler (parse → gate → envelope) + `compile-stdin.ts` pipeline (compile → sanitize → emit, lines 161-178).
- Event-driven lifecycle discipline: `test_rpc_integration.py` docstring lines 6-14 (spawn prerequisites, fail-loud never skip) — the runner waits on lottie events (`DOMLoaded`), NEVER `waitForTimeout` (RESEARCH Q6/P-anti-patterns).

Delta: `goToAndStop(n, true)` + `setSpeed(0)` + `setSubframe(false)`; frames `[canonique, 25%, 50%, 75%]` fixed order (D-08/m4); viewport 400×300 @ `deviceScaleFactor: 1`, bg `#ffffff` (D-22/D-23); launch args `--no-sandbox --disable-dev-shm-usage`; runner compiles 11 fixtures on the fly (D-16) then runs the 5-step gate; steps 1-3 failure ⇒ return early, zero Chromium spawn (m7). Playwright imports appear ONLY in `*.qa.spec.ts` / runner internals executed in-container.

---

### `scripts/baseline-update.mjs` — CREATE (utility script, batch)

**Analog:** `scripts/update-goldens.mjs` — verbatim template (D-05 = "patron goldens:update répliqué").

**The CI guard** (lines 144-154) — copy near-verbatim:
```js
  if (process.env.CI === "true") {
    process.stderr.write(
      "update-goldens: refusing to run — CI=true is set (D-37 — CI compares only, never regenerates).\n" +
        "  To refresh goldens locally: `unset CI && node scripts/update-goldens.mjs`.\n",
    );
    exit(1);
  }
```
**Deterministic ordering** (lines 68-80) — asset_id-sorted, never readdir order:
```js
  const names = readdirSync(FIXTURES_DIR).filter((n) => n.endsWith(".json"));
  const parsed = names.map((name) => {
    const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf-8"));
    return { name, asset_id: raw.asset_id };
  });
  parsed.sort((a, b) => a.asset_id.localeCompare(b.asset_id));
```
**Atomic two-pass regenerate** (lines 169-201) — collect ALL in memory first, write only after every success.

Delta: runs INSIDE the pinned container (`qa-run.mjs` invocation path, D-02/D-05 — same execution path as QA); output = `fixtures/style-specs/example-style/baseline-frames/{asset_id}.{frame-tag}.png` + `index.json` sidecar written via `writeDeterministicJson`; captures use the versioned `capture-config.json`.

---

### `scripts/qa-run.mjs` / `scripts/qa-flake-proof.mjs` / `scripts/qa-calibrate.mjs` — CREATE (utility scripts, batch)

**Analog:** `scripts/update-goldens.mjs` conventions — shebang + SPDX header (lines 1-2), stdlib-only doctrine (lines 23-26), stderr diagnostics / stdout summary split (lines 180 vs 204-208), `spawnSync` with timeout + fail-loud (lines 106-141).

```js
  const result = spawnSync(process.execPath, [TSX_CLI, COMPILE_STDIN], {
    cwd: REPO_ROOT,
    input: renderSpecJson,
    encoding: "utf-8",
    timeout: 30_000,
  });
```
Delta: `qa-run.mjs` reads `qa-container.lock` (parse `tag=`/`digest=` lines) as the SINGLE image source (B1) and `docker run --rm --init --ipc=host -v <repo>:/work -w /work -v lottie_forge_qa_node_modules:/work/node_modules <image@digest> sh -c "npm ci && …"`; readable failure when the Docker engine is down (RESEARCH Runtime State). `qa-flake-proof.mjs` runs 10 container QA passes and deep-compares QAReports minus `timestamp`. `qa-calibrate.mjs` implements the D-07/m11 spike (K≥10 captures of a-001, pairwise pixelmatch, p95 × margin) parameterized by `asset_id`.

---

### `vitest.qa.config.ts` — CREATE, and `vitest.config.ts` — MODIFY (config)

**Analog:** `vitest.config.ts` (entire file, 12 lines):
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    environment: "node",
    reporters: [
      "default",
      ["junit", { outputFile: "fixtures/bridge/vitest-junit.xml" }],
    ],
  },
});
```
Deltas (D-24/B2):
- Default config gains `exclude: [...configDefaults.exclude, "src/**/*.qa.spec.ts"]` — otherwise QA specs get collected by `verify` (they live under `src/`).
- `vitest.qa.config.ts`: `include: ["src/**/*.qa.spec.ts"]`, junit → `fixtures/bridge/vitest-qa-junit.xml`, raised `testTimeout` for browser work; invoked only inside the container by `qa.yml`.

---

### `src/anim-qa/__tests__/*.spec.ts` (unit) — CREATE (test)

**Analog:** `src/rpc/server.spec.ts`

**Conventions** (lines 1-14, 70-80, 93-106):
```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { type RecipeCatalogue, RecipeCatalogueSchema } from "./contracts/catalogue.schema.js";
```
```ts
function buildContext(): ServerContext {
  // The unit spec loads the COMMITTED catalogue (10 recipes) — the
  // exact same fixture the production server loads at startup.
  const REPO_ROOT = join(__dirname, "..", "..");
```
Closed-set assertions:
```ts
  it("exports the exact closed code set of 8 literals (D-28/D-36)", () => {
    expect([...RPC_ERROR_CODES].sort()).toEqual([...].sort());
  });
```
Deltas: doc-comment coverage maps (every claim asserted); contexts built from COMMITTED fixtures; new unit specs never `import` playwright (scan gate, D-24); updated closed-set test must expect 10 literals after D-17 extension; `server.spec.ts` IS a modify target (its 8-literal assertion breaks otherwise).

---

### `src/anim-qa/__tests__/*.qa.spec.ts` (container) — CREATE (test)

**Analog:** conventions of `server.spec.ts`; execution model per D-24. No in-repo `*.qa.spec.ts` exists — first of its kind. Container-only E2E (frame walk, theming smoke both paths, synthetic svg-only case D-21, scaffold passes D-27). Zero skips (gate reused on this project's junitxml — see below).

---

### Python integration tests — CREATE (test, request-response over wire)

**Analog:** `tests/rpc/test_rpc_integration.py`

**Module-scoped client fixture** (lines 82-92):
```python
@pytest.fixture(scope="module")
def rpc_client() -> Any:
    with RPCClient() as client:
        yield client
```
**Generic transport assertions** (lines 108-115):
```python
    envelope = rpc_client.call("motion.compile", {"render_spec": render_spec}, timeout=30.0)

    assert envelope["ok"] is True, f"compile failed: {envelope!r}"
    result = envelope["result"]
```
**Shared-harness parametrization** (lines 170-175):
```python
@pytest.mark.parametrize(
    "case",
    _REJECTION_CASES,
    ids=lambda c: c["case_id"],
)
```
Delta: `anim_qa.run` suite asserts (a) verdict≠transport (`passed=false` arrives as `ok=true`), (b) the EXACT 10-code set (parity with `RPC_ERROR_CODES`), (c) `baseline_missing` on orphan asset_id. Reuse the pattern of one short-lived client per rejection case (state isolation, lines 180-185).

---

### `.github/workflows/qa.yml` — CREATE (CI config, batch)

**Analog:** `.github/workflows/verify.yml` (READ-ONLY — stays byte-identical per D-03).

**Structural conventions to mirror** (verify.yml):
```yaml
permissions:
  contents: read
```
(lines 27-28) and the zero-skip gate step (lines 105-106):
```yaml
      - name: 12-assert-zero-skips
        run: node scripts/assert-zero-skips.mjs fixtures/bridge/pytest-junit.xml fixtures/bridge/vitest-junit.xml
```
Deltas (D-03/D-04/D-19 + RESEARCH Q7): triggers `pull_request` + `push: [main]` + `schedule` (nightly) + `workflow_dispatch`; NO hardcoded tag@digest — a first step parses `qa-container.lock` and exports the image ref via `$GITHUB_ENV`; in-container default shell is `sh` (avoid bashisms); `docker run` = same path as local `qa:run`; upload `out/qa/` with `if: always()`; `node scripts/assert-zero-skips.mjs fixtures/bridge/vitest-qa-junit.xml` on the QA junit; 10× flake-proof step gated to main/nightly/dispatch; no `secrets.` anywhere (grep gate m13).

---

### `package.json` — MODIFY (config)

**Analog:** itself — the script-alias pattern (lines 10-15):
```json
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "biome check .",
    "goldens:update": "node scripts/update-goldens.mjs"
  },
```
Delta: add `qa:run`, `baseline:update`, `qa` aliases; new deps use **exact pins** (`--save-exact`) per RESEARCH Recommended Stack Pins; `pixelmatch`/`pngjs` as regular deps (backbone QA primitives, §3.2), browser/player deps as devDeps; every new npm dep passes `checkpoint:human-verify` first (D-09/D-27); `package-lock.json` same-commit.

---

### `.gitignore` — MODIFY (config)

**Analog:** itself — the generated-artifact family entry (lines 22-23):
```
# Generated at test time (see docs/project/04_Modeles.md §4.3)
fixtures/bridge/
```
Delta: append `out/qa/` run artifacts (D-19/m12). Do NOT touch `fixtures/bridge/` (intentional). Baseline PNGs under `fixtures/style-specs/example-style/baseline-frames/` are COMMITTED (versioned data), never ignored.

---

### `fixtures/qa/*.json`, `baseline-frames/`, `qa-container.lock` — CREATE (versioned data)

**Analog:** `fixtures/recipe-catalogue/catalogue.json` (versioned, zod-parsed-at-startup data — the `loadCatalogue` pattern quoted above); `fixtures/render-specs/` naming (`{recipe_id}.json`, asset_id inside); goldens doctrine (`__tests__/goldens/` = committed bytes as product) for `baseline-frames/`.

Deltas:
- `thresholds.json`: `{ asset_id → maxDiffPixels }` + default (D-06), spike-derived (D-07), changes traceable in diff.
- `dark-theme.json`: keys ⊆ `ThemeAnchorId` closed vocab (import source: `src/rpc/contracts/vocabulary.schema.js` `THEME_ANCHOR_IDS`), `scope: "qa-only"` (D-10) — QA-only, non-product.
- `capture-config.json`: viewport 400×300, `deviceScaleFactor` 1, bg `#ffffff` (D-22/D-23).
- `baseline-frames/index.json`: deterministic sidecar via `writeDeterministicJson` (D-26/m3).
- `qa-container.lock`: flat key=value (`image=`, `tag=`, `digest=`, `node=` + refresh procedure comment, RESEARCH Q2) — consumed by `qa-run.mjs` AND `qa.yml`, referenced nowhere else (B1).

---

## Shared Patterns

### 1. NDJSON stdout discipline (applies to server.ts, runner logs, in-container vitest)
**Source:** `src/rpc/server.ts:18-22, 379-398`; pitfall P5.
```ts
 * **Stdout discipline (D-36):** stdout carries protocol lines ONLY.
 * Every diagnostic (startup banner, error stack, unexpected throw)
 * goes to stderr.
```
QA page console noise and vitest reporters must never interleave with protocol bytes: junit → file, diagnostics → stderr.

### 2. Deterministic bytes — `fmt()` / `serializeDeterministicJson()` / `writeDeterministicJson()`
**Source:** `src/shared/format.ts:45-92` (quoted above). **Apply to:** report.ts, baseline sidecar, thresholds/dark-theme/capture-config consumers, flake-proof comparisons. Never `JSON.stringify` float-bearing payloads; exactly one `"\n"` terminator (never `os.EOL`).

### 3. zod strictObject closed contracts + superRefine invariants
**Source:** `src/rpc/contracts/motion-compiler.schema.ts:652-671` (quoted above). **Apply to:** `qa-report.schema.ts`, the `anim_qa.run` request schema (`{ lottie, asset_id, renderer_support }` — zero path fields, D-18), config schemas for the three fixtures.

### 4. Closed literal sets mirrored same-commit (three sites per code-set change)
**Source:** `src/rpc/server.ts:86-95` ↔ `lottie_forge/rpc/client.py:73-84` ↔ `src/rpc/contracts/rejection-cases.ts:48-57`. **Rule (client.py:83-84):** "never add a code without updating both sides of the bridge in the same commit." D-17 extends all three 8→10 in one commit, plus the `server.spec.ts` exact-set assertion.

### 5. Pure module, zero I/O, exhaustive switch with `never` guard, no input mutation
**Source:** `src/motion-compiler/markers.ts:26-36, 75-96`; `src/motion-compiler/feature-gate.ts:245-258` (snapshot-before-iterate). **Apply to:** theming.ts (`slotizeForTheme`, `applyTheme`), canonicalFrame, baseline resolver decision logic, diff stats. Handlers are pure over `ServerContext`; `main()` is the only I/O site.

### 6. CI never regenerates — `CI === "true"` guard + atomic collect-then-write
**Source:** `scripts/update-goldens.mjs:144-154, 169-201` (quoted above). **Apply to:** `scripts/baseline-update.mjs` verbatim; CI compares only.

### 7. REPO_ROOT from `import.meta.url`, never cwd
**Source:** `src/rpc/server.ts:69-70`; `scripts/update-goldens.mjs:46-47`. **Apply to:** every new script/module resolving fixtures or `qa-container.lock`.

### 8. Test hygiene: zero skips, committed fixtures as test data, fail-loud loaders
**Source:** `scripts/assert-zero-skips.mjs:14-15` (reused on the QA junitxml); `src/rpc/contracts/rejection-cases.ts:101-152` (fail-loud shape guard vs vacuous green); `tests/rpc/test_rpc_integration.py:13-14` ("fail-loud, never skip"). **Apply to:** all Ph 4 specs, both vitest projects.

### 9. LF everywhere
**Source:** `.gitattributes:18` — `* text=auto eol=lf`. All new files (PNGs excepted) are LF; JSON artifacts end with exactly one `\n`.

---

## No Analog Found

| File | Role | Data Flow | Reason | Planner guidance |
|------|------|-----------|--------|------------------|
| `src/anim-qa/frame-walker.ts` | service | event-driven | First Playwright/lottie-web consumer in repo | RESEARCH Q5/Q6 API facts; keep wait-on-event discipline |
| `src/anim-qa/page/` | component | — | No browser page assets exist | RESEARCH Q6 (no text in viewport, opaque bg, local wasm) |
| `src/anim-qa/diff.ts` | utility | transform | First pixel math | RESEARCH Q4 (pixelmatch/pngjs API); determinism via format.ts |
| `qa-container.lock` | config | — | No lock-file precedent | RESEARCH Q2 verbatim content template |
| `.github/workflows/qa.yml` | CI config | batch | No docker/container workflow yet | verify.yml structure + RESEARCH Q7 skeleton |
| `scripts/qa-run.mjs` | utility | batch | No docker wrapper precedent | update-goldens spawn discipline + RESEARCH Q3 run pattern |
| `docs/qa.md` | docs | — | Only `docs/project/*` specs exist | D-07/m11 content contract |
| `src/anim-qa/runner.ts` internals | service | pipeline | 5-step gate ordering is new | server.ts handler shape + §7.3 order + m7 no-spawn test |

---

## Conventions Checklist (every Ph 4 file)

- [ ] **Imports / `verbatimModuleSyntax`**: relative imports carry `.js` extension (`from "../shared/format.js"`); type-only imports use the `type` modifier — inline `import { type X, y }` or `import type { X }`; node builtins via `node:` prefix (`node:fs`, `node:path`, `node:url`, `node:crypto`); zod imported as bare `import { z } from "zod"`.
- [ ] **eol=lf**: `.gitattributes` enforces globally; serializers end files with exactly one `"\n"` — never `os.EOL`, never CRLF.
- [ ] **Strict zod**: every contract and every config fixture is `z.strictObject` (unknown keys reject) + `.superRefine` for cross-field invariants; enums are `z.enum([...] as const)`; no passthrough, no coercion.
- [ ] **Pydantic mirror**: `model_config = STRICT_CONFIG` (`extra="forbid", strict=True`) on every model; snake_case fields identical to the zod side; module docstring names its TS mirror path.
- [ ] **NDJSON stdout discipline**: stdout = protocol lines only; banner/diagnostics/stacks → stderr; vitest junit → `fixtures/bridge/vitest-qa-junit.xml`; no `waitForTimeout` anywhere.
- [ ] **Deterministic JSON**: all QAReport/sidecar/artifact bytes through `fmt()` + `serializeDeterministicJson()` + `writeDeterministicJson()`; compact, insertion-ordered, append-only field order; `timestamp` injectable and excluded from identity checks.
- [ ] **Closed sets, same-commit**: `ReasonCode` (7), `theme_smoke_path` (2), RPC codes (8→10 across server.ts + client.py + rejection-cases.ts + server.spec.ts assertion); exhaustive switches end in a `never` guard.
- [ ] **Zero paths in the RPC request** (D-18): `{ lottie, asset_id, renderer_support }` only; output dir fixed at server activation; artifact pointers relative `out/qa/{asset_id}/…`.
- [ ] **Versioned data as source of truth**: thresholds / dark-theme / capture-config live in `fixtures/qa/`, zod-parsed at startup; baseline PNGs + sidecar committed; CI compares, never regenerates (`CI=true` guard).
- [ ] **Test hygiene**: unit specs in `src/anim-qa/__tests__/*.spec.ts` (never import playwright); container specs `*.qa.spec.ts` (excluded from default project); zero skipped tests on both junitxmls; contexts built from committed fixtures.
- [ ] **Exact npm pins** + `checkpoint:human-verify` gate before installing the new dep batch; `package-lock.json` same-commit.
- [ ] **Read-only surfaces**: `.github/workflows/verify.yml` byte-identical; Phase 3 compiler/sanitizer/goldens/fixtures untouched (zero domain churn, D-21).

---

## Metadata

**Analog search scope:** `src/` (rpc, motion-compiler, svg-sanitizer, shared), `scripts/`, `tests/` (rpc, bridge), `lottie_forge/` (domain, rpc), `fixtures/`, `.github/workflows/`, repo-root configs.
**Files scanned:** 24 read in full or targeted sections; 2 globs for tree inventory; no re-reads.
**Pattern extraction date:** 2026-09-04
