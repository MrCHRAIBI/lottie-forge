# Phase 4: Anim QA pinnée — Research

**Researched:** 2026-09-04
**Domain:** Pinned-container visual QA — Playwright/Docker determinism, lottie-web frame walk, pixelmatch diffing, dotLottie theming, NDJSON RPC integration
**Confidence:** HIGH (all external pins verified against npm registry, MCR registry, and official sources this session)

**Sources consulted:** npm registry (`npm view`), MCR registry API (`/v2/playwright/tags/list` + manifest headers), playwright.dev (Docker docs), microsoft/playwright `Dockerfile.noble` @ tag v1.62.1, dotlottie.io spec v1.0 + v2.0, LottieFiles/dotlottie-web source (`types.ts`, `dotlottie.ts` @ main), LottieFiles/dotlottie-rs source (`theme.rs`, `renderer/slots/mod.rs` @ main), airbnb/lottie-web docs (Context7), mapbox/pixelmatch README, docs.github.com workflow syntax, actions/upload-artifact releases API, plus the full in-repo integration surface (file:line citations below).

<user_constraints>
## User Constraints (from CONTEXT.md — 04-CONTEXT.md is authoritative)

All 27 decisions D-01..D-27 are LOCKED. The decisions that directly constrain what research had to verify:

| # | Decision (research-relevant constraint) | Research verdict |
|---|------------------------------------------|------------------|
| D-01 | Pin tag + sha256 digest in dedicated `qa-container.lock` (single source of truth B1); flags `--no-sandbox --disable-dev-shm-usage`; parity test npm `playwright` version == lock tag version (m1) | ✅ Verified: `v1.62.1-noble` + digest (see Q2) |
| D-02 | Local QA = `docker run` script (`qa:run`); `npm ci` INSIDE container; never mount host Windows `node_modules`; zero host playwright | ✅ Feasible; see Q3 + new Node-24 finding |
| D-03 | Dedicated `qa.yml`, `container:` job, fresh-checkout, no secrets; `verify.yml` byte-identical; lock is single source (no hard tag@digest in YAML); grep gate m13 | ✅ Syntax verified (see Q7) |
| D-04 | Flake cadence: 1 run/PR; 10-run proof on push main + nightly; `workflow_dispatch` trigger (m2) | ✅ Syntax verified |
| D-05 | `baseline:update` replicates `goldens:update` pattern; refuses `CI=true`; baselines in `fixtures/style-specs/example-style/baseline-frames/` | ✅ Pattern exists (scripts/update-goldens.mjs:148-154) |
| D-06 | Thresholds versioned: `fixtures/qa/thresholds.json` (`maxDiffPixels` per `asset_id` + default) | — |
| D-07 | Calibration spike = FIRST delivered task; K ≥ 10 captures of a-001; noise = pairwise pixelmatch; threshold = p95 × margin (fixed AND justified in `docs/qa.md`); acceptance = ×10 identity proof | Protocol shapes the diff.ts API (Q4) |
| D-08 | Canonical frame aligned to D-15 pose rule (`enter` → final frame, `loop` → frame 0); `canonicalFrame()` shared by poster SVG + baseline + frame-walker with three-index equality test; `frame_hashes` = `[canonique, 25%, 50%, 75%]` | ⚠️ `canonicalFrame()` can reuse `poseResolutionFor()` (markers.ts:75-96) — markers are NOT embedded in emitted Lottie JSON (compiler.ts:148-153) |
| D-09 | Dark mechanism = dotLottie `setTheme` (`@lottiefiles/dotlottie-web` in QA page); B4 research gate; fallback = deterministic `.dotlottie` packaging | ⚠️ **CORRECTED — see Q1: sid-slots required; packaging alone yields `theme:noop`** |
| D-10 | `fixtures/qa/dark-theme.json`, QA-only, `scope: "qa-only"`, strong-contrast, schema-checked vs `ThemeAnchorId` | — |
| D-11 | Anchor regions = masks resolved by stable IDs `{asset_id}_{component}_{role}` in the QA page | ⚠️ See Q4/Q6 note: lottie-web SVG output does NOT carry those IDs; two deterministic options documented |
| D-12 | Aggregated threshold: `theme_diff_pct` on union of anchor regions vs 5%; non-blocking per-anchor log; canonical frame; non-empty-region denominator | — |
| D-13 | `ReasonCode` closed Literal of 7 codes §7.6, both sides, same-commit extension | — |
| D-14 | QAReport = Pydantic §7.6 verbatim + zod strictObject mirror + `fixtures/rejection-cases/qa-report.json` (D-08 Ph 1 format) + ordered bridge; additive field `applied_max_diff_pixels` (B3) | ✅ Format verified verbatim (Q8) |
| D-15 | "Persisted" = deterministic run artifacts this phase; `timestamp` injectable; store = Phase 5 | — |
| D-16 | QA input = compile on the fly (11 fixtures → compile → sanitize → QA) in container | ✅ compile-stdin.ts pattern exists |
| D-17 | Single method `anim_qa.run`; verdict ≠ transport error (`passed=false` → `ok=true`); codes 8→10 same-commit with `baseline_missing`+`baseline_stale`; steps 1–3 fail = NEVER spawn Chromium (m7) | ✅ Dispatch + code set verified verbatim (Q9) |
| D-18 | Request = `{ lottie, asset_id, renderer_support }` — zero paths; configs loaded at startup into shared pure resolver in `baseline.ts`; orphan baseline = `baseline_missing` | ✅ ServerContext startup pattern exists (server.ts:124-127) |
| D-19 | Response = QAReport + relative artifact pointers `out/qa/{asset_id}/…`; `out/qa/` gitignored; qa.yml uploads with `if: always()` | ✅ `if: always()` verified |
| D-20 | Theming routed by `renderer_support`: `all` → dotLottie setTheme; `svg-only` → `applyTheme` pure function on lottie-web SVG (born in Ph 4); additive `theme_smoke_path: Literal["dotlottie-setTheme","applyTheme-svg"]` | ✅ `RendererSupportSchema` verified; applyTheme = custom (Q5) |
| D-21 | Both theming paths proven in Ph 4: unit (pure applyTheme on synthetic Lottie) + container E2E (synthetic svg-only test-local case) | — |
| D-22 | Capture 1× native: viewport = style viewBox (400×300) at `deviceScaleFactor` 1; versioned `captureConfig` | ✅ viewBox 400×300 verified (server.ts:136) |
| D-23 | Opaque background `#ffffff` fixed in captureConfig | — |
| D-24 | Unit vitest (in verify) = everything non-Chromium; container qa.yml = frame-walker/runner/smoke; QA specs = `*.qa.spec.ts` EXCLUDED from default vitest project (`vitest.qa.config.ts`); assert-zero-skips ALSO on qa.yml junitxml; unit specs never import playwright (scan test in verify) | ⚠️ Default config currently collects `src/**/*.spec.ts` — must add exclusion (see Integration surface) |
| D-25 | Flake proof = strict identity of 10 QAReports (excluding timestamp) | — |
| D-26 | Baseline sidecar `baseline-frames/index.json` (lottie_sha256 + QA config versions); stale predicate m3: lottie_sha256 OR captureConfig_hash mismatch → `baseline_stale` | — |
| D-27 | Multi-renderer scaffold: lottie-react 3.1 + dotlottie-vue 0.5+ = real passes; Flutter = manifest column only; zero skipped tests; npm pins exact + human-verify gate | ✅ Versions verified (Q5) |

**the agent's Discretion (from CONTEXT.md):** exact image tag + digest (researched below); spike margin (bounded by D-07/m11); internal module structure of `src/anim-qa/`; exact `captureConfig` fields + output dir layout (bounded by D-23/D-19-m12/D-26-m3/D-08-m4); qa.yml internal jobs/steps; `docs/qa.md` wording.

**Deferred (OUT OF SCOPE):** per-anchor thresholds; per-renderer QA reports (AQA-02); hand-picked baseline frames (AQA-01); Playwright prod pool; continuous threshold calibration; Flutter mobile matrix.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QA-01 | Pinned Playwright container, deterministic `goToAndStop(n, true)` frame walk, flake < 1% on 10 runs | Q2 (image pin + digest), Q3 (container execution), Q6 (determinism), Validation Architecture §flake-proof |
| QA-02 | pixelmatch diff vs baseline with calibrated `maxDiffPixels` (canonical + 3 sampled frames) | Q4 (pixelmatch 7.2.0 API verified), D-05/D-06/D-07 baseline+calibration |
| QA-03 | One asset over threshold = pack failed (no averaging) | Enforced per-asset here; orchestrator Ph 7 consumes `passed` + `reason_codes` (D-17 envelope) |
| QA-04 | Structured `QAReport` validated before any pixel diff, canonical `reason_codes`, container tag, persisted | Q1/Q8/Q9 (contract verbatim + bridge harness + RPC integration) |
</phase_requirements>

## Research Question Findings

### Q1 — [B4 gate, D-09] dotLottie theming: `setTheme` verdict

**API exists — but the targeting mechanism has a hard requirement the CONTEXT fallback assumption missed.**

Verified facts (all from official sources this session):

- **Package/version:** `@lottiefiles/dotlottie-web` latest = **0.80.0** (published 2026-08-28) `[VERIFIED: npm registry]`. The stack doc §3.3 pins **0.79.2** — that version exists on the registry `[VERIFIED: npm registry: @lottiefiles/dotlottie-web@0.79.2]`. Recommend honoring the §3.3 pin (0.79.2) since 03_Stack.md is authoritative; 0.80.0 is a valid refresh candidate under the same-commit doctrine.
- **Methods (source: `packages/web/src/dotlottie.ts` @ main)** `[CITED: github.com/LottieFiles/dotlottie-web/blob/main/packages/web/src/dotlottie.ts]`:
  - `setTheme(themeId: string): boolean` — selects a theme **embedded in the .dotlottie manifest** (line 1634).
  - `setThemeData(themeData: Theme | string): boolean` — applies raw theme data (Theme object or JSON string) (line 1672).
  - `setColorSlot(slotId: string, value: ColorSlotValue): boolean` (line 1787).
  - `setFrame(frame: number)`, `setSpeed(speed: number)`, `pause()`, `freeze()`/`unfreeze()` — the dotLottie-side frame-walk equivalents (lines 1169-1227, 1371-1385).
- **Theme JSON format = dotLottie v2.0 spec:** `{ "rules": [ { "id": <slot id>, "type": "Color", "value": [R,G,B] (0-1) } ] }` `[CITED: dotlottie.io/spec/2.0/#themes]`. Typed mirror `Theme`/`ThemeRule`/`ThemeColorRule` in `packages/web/src/types.ts` @ main.
- **Inline raw Lottie JSON loading works:** `Config.data?: Data` where `Data = string | ArrayBuffer | Record<string, unknown>` — a raw parsed Lottie JSON object is accepted without any URL or `.dotlottie` file `[CITED: dotlottie-web types.ts @ main]`.
- **No `lottie_web` render mode exists anymore:** `RenderConfig` @ main = `{ autoResize, devicePixelRatio, freezeOnOffscreen, quality }` only. The current player is **always the dotLottie wasm core** (canvas-2d default; `webgl`/`webgpu` subpath imports optional). The old `renderConfig.mode: 'dotlottie' | 'lottie_web'` option is gone `[CITED: dotlottie-web types.ts @ main]`.
- **WASM:** ~500 KB, **fetched from jsdelivr CDN by default**; `DotLottie.setWasmUrl(url: string)` (static, verified at dotlottie.ts) redirects it. The wasm file ships in the package at `dist/dotlottie-player.wasm` (README preload example path) `[CITED: dotlottie-web README @ main]`. **QA must call `setWasmUrl` pointing at a locally-served copy — a CDN fetch would break reproducibility.**

**THE CRITICAL FINDING — slots are `sid`-based, not `nm`-based:**

The dotLottie core resolves theme rules against **Lottie Slots**, and slot discovery walks the animation JSON collecting properties that carry a `"sid"` (slot ID) tag — plus an optional top-level `slots` object override. Source (`dotlottie-rs/src/renderer/slots/mod.rs` @ main, verbatim):

```rust
/// Walk the JSON tree and collect properties that have a "sid" (slot ID) tag.
/// `{"a": 0, "k": [0.71, 0.192, 0.278], "sid": "ball_color"}`
fn collect_sid_slots(value: &Value, result: &mut BTreeMap<String, SlotType>) {
```
`[CITED: github.com/LottieFiles/dotlottie-rs/blob/main/dotlottie-rs/src/renderer/slots/mod.rs]`

There is **no `nm`-targeting path** in the current core (grep of `slots/mod.rs` shows `sid` only; the v2.0 spec states "every property you want to theme must first be given a unique **slot ID**. Only properties with a slot ID can be targeted by theme rules" `[CITED: dotlottie.io/spec/2.0/#themes]`).

**Cross-check against the Phase 3 canonical Lottie:**
- Layer `nm` = anchor (compiler.ts:116 `nm: component.role`) ✅ present.
- Fill items: `{"ty":"fl","c":[0.5,0.5,0.5],"o":100}` — **no `nm`, no `sid`** (verified in golden `a-001.fade.golden.json:1`; `LottieShapeItemSchema`'s `fl` variant is `strictObject{ty,c,o}` — motion-compiler.schema.ts:586-590, so extra keys are structurally impossible).
- `LottieJSONSchema` is `strictObject` — a stray `sid` key is rejected today (motion-compiler.schema.ts:652-661).

**Consequences:**
1. `setThemeData(...)` over the raw Phase 3 Lottie **changes nothing** → guaranteed `theme:noop`. Same for `.dotlottie` packaging alone: the v1.0 spec has **no themes at all** (no `t/`, no `themes` manifest key) `[CITED: dotlottie.io/spec/1.0]` and v2 packaging does not inject slots. **The CONTEXT D-09 fallback premise ("packaging .dotlottie fait effet sans impasse") is disproven as stated — packaging without slot annotation still yields a no-op theme.**
2. The **working production-faithful mechanism** is: annotate the themable fill `c` properties with `"sid": "<anchor>"` (= layer `nm`, already the anchor per D-02), then `setThemeData`/`setTheme` applies. This is what ADR-05/Phase 8 will need anyway (`themeId` + `theme_anchors`).
3. Recommended QA design (zero Phase 3 churn, D-21 spirit): a **pure `slotizeForTheme()` function in `src/anim-qa/`** that derives the themed VARIANT of the animation data (adds `sid` = layer `nm` to fill `c` props of anchor layers, deep-cloned, never mutating the canonical bytes). The un-themed render (baseline diff) uses the canonical Lottie; the smoke test loads the slotized variant into the dotLottie player and calls `setThemeData(dark-theme.json)`. Unit-testable (D-33 spirit), and Phase 8 moves sid emission into the compiler/packager with the same shape.
4. This deviation touches a locked decision's *mechanism detail* — planner should surface it at plan review (the smoke still proves "the real mechanism" per D-09 because setThemeData+slots+wasm-core IS the production apply path; only the sid annotation site differs).

### Q2 — [D-01] Official Playwright image: exact tag + digest

- **Latest release line:** Playwright npm **1.62.1** (published 2026-07-30 per legitimacy check; registry `time.modified` 2026-09-04) — satisfies the §3 pin "1.61+" `[VERIFIED: npm registry]`.
- **MCR tags** (via `https://mcr.microsoft.com/v2/playwright/tags/list`): `v1.62.1-noble`, `v1.62.1-noble-amd64`, `v1.62.1-noble-arm64` (+ `jammy`, `resolute` variants, + bare `v1.62.1`) `[VERIFIED: mcr.microsoft.com/v2/playwright/tags/list]`.
- **Chromium-only variant:** there is no separate Chromium-only image tag — the official image carries all browsers, but the QA launches Chromium only (§7.2 concern is browser-version lock, satisfied by the tag+digest pin). `v1.62.1-noble` = Ubuntu 24.04 LTS base `[CITED: playwright.dev/docs/docker]`.
- **Digest pin (OCI image index, multi-arch):**
  ```
  mcr.microsoft.com/playwright@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e
  ```
  obtained via `GET /v2/playwright/manifests/v1.62.1-noble` with OCI-index Accept header → `Docker-Content-Digest` header `[VERIFIED: MCR registry API, 2026-09-04]`. Refresh procedure for `qa-container.lock` (document in the lock file): `curl -sI -H "Accept: application/vnd.oci.image.index.v1+json" https://mcr.microsoft.com/v2/playwright/manifests/<tag>` → read `Docker-Content-Digest`.
- **m1 parity test data:** tag `v1.62.1-noble` → npm `playwright` must be `1.62.1`. Extract via regex `^v(\d+\.\d+\.\d+)-` on the lock's tag field.

### Q3 — [D-02/D-16] Docker-on-Windows execution pattern

- **Image contents:** browsers + system deps included; **the Playwright npm package is NOT in the image** ("should be installed separately") — version match between image and npm package is REQUIRED ("If the Playwright version in your Docker image does not match the version in your project/tests, Playwright will be unable to locate browser executables") `[CITED: playwright.dev/docs/docker]`. This validates D-01/m1's parity test as a real constraint, not just hygiene.
- **⚠️ Node version in image = 24, not 20.** `Dockerfile.noble` at tag v1.62.1: `ARG NODE_VERSION=24 # autogenerated via ./update-playwright-node.mjs` (NodeSource repo) `[CITED: github.com/microsoft/playwright/blob/v1.62.1/utils/docker/Dockerfile.noble]`. Consequences:
  - `engines.node ">=20"` passes; vitest 4 supports `^20 || ^22 || >=24` `[VERIFIED: npm registry: vitest engines]`; Vite 7 (vitest 4's engine) supports Node 24.
  - `npm ci` inside the container runs under Node 24/npm 11 — lockfileVersion 3 compatible.
  - Document in `docs/qa.md`: QA container ≠ Node 20 (only `verify.yml` is Node 20). No contract impact (QA code is plain TS + browser).
- **Recommended run pattern** (docker docs "Recommended Docker Configuration"):
  ```
  docker run --rm --init --ipc=host \
    -v "<repo>:/work" -w /work \
    -v lottie_forge_qa_node_modules:/work/node_modules \
    mcr.microsoft.com/playwright@sha256:dcc5531e... \
    sh -c "npm ci && node scripts/qa-run.mjs"
  ```
  - `--ipc=host` "recommended when using Chromium. Without it, Chromium can run out of memory and crash" `[CITED: playwright.dev/docs/docker]`.
  - `--init` recommended to avoid zombie processes `[CITED: same]`.
  - Default user is **root** → Chromium sandbox auto-disabled; for trusted E2E code root "may be fine" per docs. `--no-sandbox` is then belt-and-braces in `chromium.launch({ args: [...] })` per §7.2/D-01.
  - The **named volume for `/work/node_modules`** shadows the host's Windows-built `node_modules` (D-02/m8's real hazard: platform-specific native binaries — `@biomejs/biome`, `@resvg/resvg-js` — would otherwise be overwritten inside the host folder by the `npm ci` in the container). The `qa:run` script must create/declare this volume.
- **`npm ci` requirement:** `package-lock.json` committed (verify.yml:66-71 doctrine) — same lockfile installs inside the container; QA devDeps must therefore be in `devDependencies` (not optional/adhoc installs).
- **Playwright determinism flags:** launch args `--no-sandbox --disable-dev-shm-usage` (D-01, §7.2) — with `--ipc=host` the dev-shm flag is redundant but harmless; keep it for the lock contract's verbatim compliance.

### Q4 — pixelmatch + pngjs: versions, API, region (masked) diffs

- **Versions:** `pixelmatch@7.2.0` (ESM-only, `"type": "module"`, no deps, 9.93M DL/week) and `pngjs@7.0.0` `[VERIFIED: npm registry]`. Both legacy-compatible with the repo's `"type": "module"`.
- **API (sync, raw typed arrays)** `[CITED: github.com/mapbox/pixelmatch README]`:
  ```js
  const numDiffPixels = pixelmatch(img1, img2, diff, width, height, options);
  // options: threshold (0..1, default 0.1), includeAA (default false),
  // alpha (diff blend, default 0.1), aaColor, diffColor, diffColorAlt,
  // diffMask, checkerboard (default true), windowSize (default Infinity)
  ```
  - **Returns the number of mismatched pixels** (total count by default; with `windowSize: N` returns max count in any N×N window).
  - `diff` output buffer may be `null` when no diff image is needed.
  - pngjs usage: `PNG.sync.read(buffer)` → `{ width, height, data }` (RGBA); `new PNG({width, height})` for the diff; `PNG.sync.write(png)` to serialize `[CITED: pixelmatch README Node.js example]`.
- **Region/masked diff — confirmed: pixelmatch has NO region support.** The composition approach (deterministic, no extra deps): **crop-based per-region compare** — for each anchor bbox `[x0,y0,x1,y1]`, slice the row-interleaved RGBA buffers of both images into the sub-rectangle (row-by-row `subarray` copies), run `pixelmatch(cropA, cropB, null, w, h, opts)` per region, and sum. Union `theme_diff_pct` = Σ region-diff pixels ÷ Σ non-empty region pixel areas (D-12 denominator) × 100. Alternative (per-pixel filtering by masks) is equivalent but slower; crop-based is recommended.
- **Per-frame stats for `PixelDiffStats` (max/mean/p95):** run pixelmatch per compared frame; `max` = max mismatched-pixel count across frames vs threshold; `frames_above_tolerance` counts frames whose count > `applied_max_diff_pixels`; `mean` = average count; `p95` = nearest-rank p95 over per-frame counts (4 frames → interpolation policy must be fixed and unit-tested; nearest-rank is the deterministic choice).
- **Calibration spike support (D-07/m11):** the pairwise-noise protocol ("pixelmatch pairwise entre captures du même input") uses the same API with a fixed `threshold` recorded in `captureConfig`; all options must be versioned in the sidecar per D-26/m3.

### Q5 — [D-20/D-27] lottie-react + dotlottie-vue versions; `applyTheme` on lottie-web

- **`lottie-react` current = 3.1.1** (3.1.x ✓ per D-27), peers `react ^18.2.0 || ^19.0.0` + `react-dom` same `[VERIFIED: npm registry]`. React must be installed as devDeps for the scaffold pass.
- **`@lottiefiles/dotlottie-vue` current = 0.11.27** (≥ 0.5 ✓), peer `vue ^3.3.4`, engines node ≥ 18.17 `[VERIFIED: npm registry]`. Vue must be a devDep.
- **`@lottiefiles/dotlottie-web` = 0.80.0 latest / 0.79.2 stack pin** (see Q1), engines node ≥ 18.17, no peer deps `[VERIFIED: npm registry]`.
- **`applyTheme` — there is NO native theming API on lottie-web.** The full documented instance method list is: `play, stop, pause, setSpeed, goToAndStop, goToAndPlay, setDirection, playSegments, setSubframe, destroy, getDuration` (+ `addEventListener`) `[CITED: airbnb/lottie-web README via Context7]`. D-20's `applyTheme` is therefore confirmed as a **custom pure function over the animation data**: walk `layers`, match `layer.nm === <anchor>` (D-02 contract — `nm` IS the anchor), then rewrite every fill/stroke color property (`shapes[].it[]` items with `ty: "fl"` / `ty: "st"`, field `c`) to the theme color (0-1 RGB triple). Apply BEFORE `lottie.loadAnimation({ animationData })` (lottie-web parses `animationData` at load; there is no public "reload in place" API — the re-color path is `destroy()` + `loadAnimation()` with a new deep-cloned object).
- **lottie-web details for the frame-walker** `[CITED: airbnb/lottie-web docs via Context7]`:
  - `goToAndStop(value, isFrame)` — "Moves the animation to a specific point and stops playback. `value` is the target time or frame, and `isFrame` (defaulting to `false`) determines if `value` represents a frame number or a time-based value". So the QA contract is exactly `goToAndStop(n, true)`.
  - `setSpeed(0)` freezes timeline advance; `setSubframe(false)` snaps rendering to the JSON frame rate (removes sub-frame rAF interpolation — recommended for the walker).
  - `loadAnimation({ container, renderer: 'svg', loop: false, autoplay: false, animationData })` — inline JSON object supported; deep-clone before handing to lottie-web (it mutates its input).
  - UMD bundle for the QA page: `lottie-web@5.13.0` main = `./build/player/lottie.js` `[VERIFIED: npm registry: lottie-web@5.13.0 main]` (also confirms 5.13.0 is the latest release).
  - Per-layer DOM handles for bbox masks: `animation.renderer.elements[i]` mirrors the `layers` array order (used in official docs for `updateDocumentData` examples). NOT a stable public API — see Pitfall P6 for the mask-resolution strategy.

### Q6 — [QA-01/D-25] Playwright determinism: known flake sources and mitigations

- **Frame walk determinism:** `goToAndStop(n, true)` + `setSpeed(0)` makes rendering a pure function of (animation data, frame index, renderer build). In the pinned container the renderer build is byte-locked by the image digest → the residual flake surface is environment, not code.
- **Screenshot determinism mitigations** (Playwright semantics) `[CITED: playwright.dev/docs/docker + api docs]`:
  - `deviceScaleFactor: 1` (D-22) — viewport 400×300 → PNG exactly 400×300 px.
  - Headless Chromium in the container uses the software rasterizer (no GPU in the image) — identical pixels for identical input; the D-07 spike measures the residual AA noise empirically rather than trusting this claim.
  - Disable animations/timing interference: assets are already static at capture (goToAndStop); page-level `animations: 'disabled'` screenshot option is available if any incidental CSS animation existed (none in our page).
  - Fonts: **the assets contain no `<text>`** (SAN-01) → no font-shaping variance inside the render; the QA page must not render any text into the captured viewport (keep captions outside the canvas/viewport).
  - `--disable-dev-shm-usage` + `--ipc=host` (both applied) — /dev/shm pressure is the classic container flake/crash source.
  - Deterministic page lifecycle: wait for lottie's `DOMLoaded`/`load` event, then capture — never wall-clock waits (a `waitForTimeout` is a flake generator).
  - Opaque `#ffffff` background (D-23) removes alpha-blend noise from pixelmatch's path.
- **Flake proof (D-25):** strict identity of the 10 QAReports excluding `timestamp` — the report writer must serialize every float through `fmt()`/`serializeDeterministicJson` (src/shared/format.ts) so byte-compare is meaningful; `theme_diff_pct` and `pixel_diff.mean` are floats — their exact values must be stable across runs (they are, given identical PNG bytes: the counts are integers; `mean`/`p95` derive from integers — keep the division deterministic in JS and avoid platform-dependent float formatting).

### Q7 — [D-03/D-04] GitHub Actions: `container:` + digest pin + `workflow_dispatch` + artifacts

`[CITED: docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax]` (fetched 2026-09-04):

- `jobs.<job_id>.container.image` accepts a registry reference; digest form `image: mcr.microsoft.com/playwright@sha256:...` is a standard registry reference (the digest is the OCI index digest — works on `ubuntu-latest` linux/amd64 runners). Linux runner required for container jobs ✓ (`runs-on: ubuntu-latest`).
- Default shell for `run` steps inside a container job is **`sh`, not `bash`** (docs call this out explicitly) — write steps accordingly or set `defaults.run.shell: bash`.
- `on.workflow_dispatch:` — manual trigger; note: "This trigger only receives events when the workflow file is on the default branch" (pre-ship-gate 10-run proof implication: merge the workflow to main first).
- Triggers per D-04: `pull_request` (1 QA run/PR), `push: branches: [main]` (10-run proof), `schedule: - cron: ...` (nightly), `workflow_dispatch:` (m2 on-demand).
- Artifacts: `actions/upload-artifact` latest = **v7.0.1** `[VERIFIED: GitHub releases API]`; `if: always()` on the step is the documented way to upload even on failure (D-19/m12); consider `if-no-files-found: warn`. The `qa.yml` job needs `permissions: contents: read` (least privilege, mirrors verify.yml:27-29).
- **B1 consumption of the lock:** the YAML must not hardcode tag@digest — a first step reads `qa-container.lock` and exports `IMAGE` via `$GITHUB_ENV`, then `container: image: ${{ env.QA_IMAGE }}`. Grep gate m13: assert no `secrets.` occurrence in qa.yml (a collected spec in verify).

### Q8 — [D-14] Phase 1 rejection-harness layout to extend (verbatim shapes)

- **Format** — `src/rpc/contracts/rejection-cases.ts:14-22` (verbatim doc-comment): `{ "case_id": "...", "ref": "...", "model": "...", "payload": { }, "expect_paths": [ ["..."] ], "expect_code": "validation_error" }` — `expect_paths`/`expect_code` OPTIONAL; path-membership only, never message text (D-08 + D-29 additive).
- **TS loader:** `rejection-cases.ts:67-76` — `CONTRACT_FILES` map currently has 8 entries (`style-spec, recipe, asset-spec, pack-manifest, style-refinement, catalogue, render-spec, lottie-json`); add `"qa-report": "qa-report.json"` (same-commit with the fixture).
- **TS closed code set for `expect_code`:** `rejection-cases.ts:48-57` — `REJECTION_EXPECT_CODES` = `["parse_error","validation_error","compile_error","sanitize_rejected","unsupported_feature","internal","protocol_error","method_not_found"]` — **must be extended same-commit** when RPC codes grow 8→10 (D-17), or `baseline_missing` cases cannot be expressed in the harness.
- **Python loader:** `tests/bridge/rejection_loader.py:28-35` — `CONTRACT_FILES` currently 6 entries (no render-spec/lottie-json); add the qa-report entry same-commit.
- **Example case shape** (`fixtures/rejection-cases/render-spec.json:2-21`): `case_id` kebab-case w/ contract prefix, `ref` = style pin, `model` = Pydantic model name, `expect_code` + `expect_paths` on path level.
- The Pydantic `QAReport`/`PixelDiffStats` models (§7.6 verbatim, into `lottie_forge/domain/`) + `QAReportSchema` zod mirror (`src/rpc/contracts/`) complete the bridge: pytest export → vitest validate/re-emit → pytest strict re-import (established ordered chain).

### Q9 — [D-17/D-18] RPC server: closed code set + dispatch pattern to extend

- **Current closed set (8 literals)** — `src/rpc/server.ts:86-95` verbatim:
  ```ts
  export const RPC_ERROR_CODES = [
    "parse_error", "validation_error", "unsupported_feature", "compile_error",
    "sanitize_rejected", "internal", "protocol_error", "method_not_found",
  ] as const;
  ```
  Extension 8→10 (`baseline_missing`, `baseline_stale`) is a single-site edit here + mirror in `lottie_forge/rpc/client.py:73-82` (`RPC_ERROR_CODES` tuple, docstring "never add a code without updating both sides of the bridge in the same commit") + `rejection-cases.ts:48-57`.
- **Dispatch pattern** — `processLine` (server.ts:271-282): `if (method === "motion.compile") { return handleMotionCompile(id, request.params, ctx); }` / `if (method === "svg.sanitize") { ... }` / else `method_not_found`. `anim_qa.run` adds a third branch + `handleAnimQa(id, params, ctx)`.
- **Startup context** — `ServerContext` (server.ts:124-127) = `{ catalogue, style }` loaded once in `buildDefaultContext()` (server.ts:164-166). D-18 extends this with the QA configs (thresholds, dark-theme, captureConfig) + the pure baseline resolver in `src/anim-qa/baseline.ts` (lazy per `asset_id` at request time; configs at startup — both sides pure, unit-testable).
- **Verdict ≠ transport error (B5):** the handler returns `okEnvelope(id, qaReport)` when the QA ran and the asset failed; only operational failures (schema reject at entry → `validation_error`; orphan/stale baseline → the two new codes; unexpected throw → `internal`) use `ok:false` — same shape as `handleSanitize` (server.ts:329-353).
- **Python transport** — `lottie_forge/rpc/client.py` is generic (D-27 framing): `RPCClient.call("anim_qa.run", {...})` works unmodified; win32 `npx.cmd` shim already handled (client.py:101-104); ready banner `"rpc-server: ready"` (client.py:150) — update the startup banner string in server.ts:370 to list the new method (banner is matched by *substring*, so appending text is safe).

## Codebase Integration Surface (verified this session, file:line)

| Surface | Fact (verbatim where discrete) |
|---------|-------------------------------|
| `src/rpc/server.ts:86-95` | 8-code set (quoted in Q9). Dispatch `processLine` 271-282; `ServerContext` 124-127 `{ catalogue, style }`; banner 370. |
| `src/rpc/contracts/motion-compiler.schema.ts:278` | `export const RendererSupportSchema = z.enum(["all", "svg-only"] as const);` — validated at RPC entry per D-18. |
| `src/rpc/contracts/motion-compiler.schema.ts:652-661` | `LottieJSONSchema`: `v: z.literal("5.7.0")`, `fr: 1..120`, `ddd: z.literal(0)`, `assets: z.array(z.unknown()).length(0)`, `layers` min 1. |
| `src/rpc/contracts/motion-compiler.schema.ts:586-590` | Fill item `fl` variant: `strictObject({ ty: z.literal("fl"), c: StaticPropertyValueSchema, o: 0..100 })` — **no `nm`/`sid` possible today** (relevant to Q1 slotization). |
| `src/motion-compiler/compiler.ts:116,124,160` | Layer `nm: component.role` (D-02); `layers = [...emittedLayers].reverse()` (D-10); `renderer_support: classify([])` → always `"all"` today. |
| `src/motion-compiler/compiler.ts:148-153` | Markers computed then `void _markers` — **markers NOT embedded in emitted Lottie**; `canonicalFrame()` must derive from recipe data (`poseResolutionFor`), not from a `markers` field. |
| `src/motion-compiler/markers.ts:75-96,106-109` | `poseResolutionFor(keyframeShape)` → `"finale" | "t=0"`: 7 finale shapes (`opacity-ramp, translate-in, overshoot-settle, trim-path, angular-in, pop-settle, damped-oscillation`), 3 t=0 (`scale-breath, sine-drift, circular-path`) — verbatim exhaustive switch. `svgPoseFrameFor(recipe, op)` = poster-side canonical frame; `canonicalFrame()` (D-08/m4) extends this pattern to the 3-consumer shared function + equality test. |
| `src/motion-compiler/feature-gate.ts:54-87,248-258` | `SUPPORTED_LOTTIE_FEATURES` (12 features) / `SVG_ONLY_FEATURES` (`mask-add, mask-subtract, track-matte-alpha, track-matte-luma`) / `classify(emitted)` → `"all"|"svg-only"` — reused verbatim at gate step 2 (§7.3). |
| `scripts/update-goldens.mjs:148-154` | CI guard verbatim: `if (process.env.CI === "true") { ... exit(1) }` — the D-05 `baseline:update` template (also: atomic in-memory collect 169-201, asset_id-sorted fixture order 68-80). |
| `scripts/compile-stdin.ts` | Golden pipeline entry — pattern for an in-container compile entry (fixture → compile → sanitize → envelope via `serializeDeterministicJson`, D-16). |
| `src/shared/format.ts:45-58,78-80` | `fmt()` (toFixed(4), -0→0, trailing-zero strip, throws non-finite/≥1e21) + `serializeDeterministicJson()` — the ONLY serializers for QAReport/sidecar bytes. |
| `fixtures/render-specs/` | Exactly 11 fixtures (`a-001.fade` … `a-010.orbit` + `galerie`) — D-16 compile-on-the-fly inputs. |
| `src/motion-compiler/__tests__/goldens/a-001.fade.golden.json:1` | Emit shape ground truth: layer `nm:"primary"`, fill `{"ty":"fl","c":[0.5,0.5,0.5],"o":100}` (neutral, D-09 Ph 3 headroom), opacity keyframes `t:0 s:[0]` → `t:48 s:[50]`, `op:48`, `fr:60`, no markers field. |
| `src/motion-compiler/svg-builder.ts:68-70` | SVG IDs: group `` `${assetId}_${component.component}` ``, shape `` `${groupId}_${component.role}` `` — the `{asset_id}_{component}_{role}` mask IDs (D-11) exist on the companion SVG, **not** on the lottie-web DOM output. |
| `vitest.config.ts:3-11` | `include: ["src/**/*.spec.ts"]`, junit → `fixtures/bridge/vitest-junit.xml`. ⚠️ `*.qa.spec.ts` files under `src/` WILL be collected unless excluded — default config needs `exclude: [...configDefaults.exclude, "src/**/*.qa.spec.ts"]` (D-24/B2), and `vitest.qa.config.ts` includes only the QA specs + its own junit path (e.g. `fixtures/bridge/vitest-qa-junit.xml`) + `testTimeout` raised for browser work. |
| `.github/workflows/verify.yml` | READ-ONLY — 12 steps (checkout→…→assert-zero-skips on `fixtures/bridge/*.xml`); `permissions: contents: read`; junit artifacts live under `fixtures/bridge/`. Byte-identical per D-03. |
| `scripts/assert-zero-skips.mjs:14-15` | Usage `node scripts/assert-zero-skips.mjs <junit.xml> [...]` — qa.yml reuses it on its own junitxml (D-24). |
| `lottie_forge/rpc/client.py:73-82,101-104,150` | `RPC_ERROR_CODES` 8-tuple mirror; win32 `npx.cmd` shim; ready banner `"rpc-server: ready"`. |
| `fixtures/rejection-cases/` + loaders | See Q8. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Steps 1-3 of gate (schema/feature-gate/structural diff) | API/Backend (TS `src/anim-qa/`, no browser) | — | §7.3: quasi-free, must run BEFORE Chromium (D-17/m7 test asserts no spawn) |
| Frame walk + capture | Browser (Chromium in pinned container) | TS runner orchestration | Only Playwright-consumable; image digest = determinism source |
| pixelmatch diff + stats | API/Backend (TS, in container) | — | Pure CPU on PNG buffers; runs inside the same container process |
| Theming smoke (dotLottie path) | Browser (wasm core in page) | TS (`slotizeForTheme` pure fn) | sid-annotation pure + wasm render |
| Theming smoke (svg-only path) | API/Backend (`applyTheme` pure fn) + Browser (render) | — | Pure recolor + lottie-web reload |
| QAReport contract + bridge | API/Backend (zod + Pydantic) | — | §7.6, D-14 bridge chain |
| `anim_qa.run` RPC | API/Backend (`src/rpc/server.ts`) | Python client (tests) | D-17/D-18 |
| CI flake proof | CI (`qa.yml` container) | — | D-04/D-25 |
| Baseline generation | API/Backend (local container, `baseline:update`) | — | D-05, CI=false guard |

## Recommended Stack Pins (all new deps, exact)

| Package | Pin | Role | Dep type | Notes |
|---------|-----|------|----------|-------|
| `playwright` | `1.62.1` (exact) | Browser driver **inside container only** — NOT used on host | devDependency (for lock/parity + container install) | ⚠️ nuance: the npm package exists on the host only so `npm ci` inside the container installs the matching version; **no browser download / no QA ever runs on the host** (D-02). m1 parity test: version == tag from `qa-container.lock`. |
| `pixelmatch` | `7.2.0` (exact) | Frame diff | dependency | ESM-only, sync API |
| `pngjs` | `7.0.0` (exact) | PNG decode/encode | dependency | `PNG.sync.*` |
| `@lottiefiles/dotlottie-web` | `0.79.2` (exact — §3.3 stack pin; 0.80.0 = refresh candidate) | Theming smoke player (wasm core) | devDependency | wasm self-hosted via `setWasmUrl` |
| `lottie-web` | `5.13.0` (exact — §3.3) | Reference SVG renderer (walker + applyTheme path) | devDependency | UMD `build/player/lottie.js` |
| `lottie-react` | `3.1.1` (exact, 3.1.x ✓ D-27) | Scaffold pass | devDependency | peers react/react-dom → devDeps too |
| `@lottiefiles/dotlottie-vue` | `0.11.27` (exact, ≥0.5 ✓ D-27) | Scaffold pass | devDependency | peer `vue ^3.3.4` → devDep |
| `react` / `react-dom` | `^18.2.0` or `^19` (choose 19.x latest, pin exact) | lottie-react peers (scaffold pass only) | devDependencies | |
| `vue` | `^3.3.4` (pin exact latest 3.x) | dotlottie-vue peer (scaffold pass only) | devDependency | |
| `@resvg/resvg-js` | `2.6.2` (exact) | Static poster SVG→PNG (§7.4/§7.8 baseline.ts) | devDependency | optional in Phase 4 scope if poster capture is deferred to the shared `canonicalFrame()` consumer — planner's call; §7.8 lists it in baseline.ts |

**Container pin (`qa-container.lock`, single source B1):**
```
image=mcr.microsoft.com/playwright
tag=v1.62.1-noble
digest=sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e
node=24
# refresh: curl -sI -H "Accept: application/vnd.oci.image.index.v1+json" \
#   https://mcr.microsoft.com/v2/playwright/manifests/v1.62.1-noble  → Docker-Content-Digest
```

**Installation (single npm command, all exact pins):**
```bash
npm install --save-exact --save-dev playwright@1.62.1 pixelmatch@7.2.0 pngjs@7.0.0 @lottiefiles/dotlottie-web@0.79.2 lottie-web@5.13.0 lottie-react@3.1.1 @lottiefiles/dotlottie-vue@0.11.27
```
(peer deps react/react-dom/vue added per chosen majors; pixelmatch/pngjs may be regular dependencies if `src/anim-qa/diff.ts` ships in the production backbone — planner's call; §3.2 lists them as backbone QA primitives.)

## Package Legitimacy Audit

> Gate run 2026-09-04 via `gsd-tools query package-legitimacy check --ecosystem npm`.

| Package | Registry | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|--------------|-------------|---------|-------------|
| pixelmatch 7.2.0 | npm | 9.93M | github.com/mapbox/pixelmatch | OK | Approved |
| pngjs 7.0.0 | npm | 58M | github.com/pngjs/pngjs | OK | Approved |
| playwright 1.62.1 | npm | 87.5M | github.com/microsoft/playwright | OK | Approved |
| @resvg/resvg-js 2.6.2 | npm | 2.6M | github.com/yisibl/resvg-js | OK | Approved |
| lottie-web 5.13.0 | npm | 7.7M | github.com/airbnb/lottie-web | OK | Approved |
| react / react-dom | npm | 171M / 161M | github.com/facebook/react | OK | Approved |
| @lottiefiles/dotlottie-web 0.79.2/0.80.0 | npm | 1.63M | github.com/LottieFiles/dotlottie-web | SUS ("too-new" publish recency) | **Keep — planner inserts `checkpoint:human-verify` before install** (already mandated by D-09) |
| lottie-react 3.1.1 | npm | 3.29M | github.com/Gamote/lottie-react | SUS ("too-new") | Keep — `checkpoint:human-verify` (D-27 mandates the gate) |
| @lottiefiles/dotlottie-vue 0.11.27 | npm | 48k | github.com/LottieFiles/dotlottie-web | SUS ("too-new") | Keep — `checkpoint:human-verify` (D-27) |
| vue | npm | 15.6M | github.com/vuejs/core | SUS ("too-new") | Keep — same human-verify gate covers the peer trio |

All SUS flags are publish-recency heuristics on official-org repos (LottieFiles/Gamote/Vue) with no postinstall scripts (verified: `npm view <pkg> scripts.postinstall` empty for every package). No [SLOP] verdicts; nothing removed.

## Architecture Patterns

### System data flow (QA run)

```
fixtures/render-specs/*.json (11)
   │  compile on the fly (D-16) — inside pinned container
   ▼
compile() → CompileResult { lottie, svg, renderer_support }   [Phase 3, unchanged]
   │
   ▼  anim_qa.run (NDJSON RPC, src/rpc/server.ts)
   ├─ Step 1 structural: LottieJSONSchema.safeParse          ─ no browser
   ├─ Step 2 feature gate: assertSupportedComposition        ─ no browser
   ├─ Step 3 structural diff: layers/ids/keyframes vs recipe ─ no browser
   │     (any failure → QAReport{passed:false, reason_codes:[…]}, NO Chromium — m7)
   ├─ baseline resolver (pure, baseline.ts): sidecar hash check (D-26)
   │     mismatch → ok:false { code: baseline_missing | baseline_stale }
   ▼
   ├─ Step 4 frame walk (Playwright page): goToAndStop(canon/25/50/75) + setSpeed(0)
   │     PNG 400×300 @dsf1, bg #ffffff (D-22/D-23) → pixelmatch vs baseline PNGs
   │     crop-based per-anchor masks (D-11) → PixelDiffStats
   ▼
   └─ Step 5 theming smoke: route by renderer_support (D-20)
         "all"      → slotizeForTheme() → dotLottie.setThemeData(dark-theme) → diff on anchor masks
         "svg-only" → applyTheme() pure fn → lottie-web reload → same masks
         theme_diff_pct ≤ 5% → reason_codes += "theme:noop"
   ▼
QAReport (§7.6 + applied_max_diff_pixels + theme_smoke_path + qa_container_tag)
   → ok:true envelope (verdict ≠ transport, D-17) → out/qa/{asset_id}/ PNG artifacts + JSON
   → bridge parity (fixtures/rejection-cases/qa-report.json) → Ph 5 store (MFT-01)
```

### `qa.yml` skeleton (D-03/D-04, lock consumption B1)

```yaml
name: qa
on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: "17 3 * * *"
  workflow_dispatch:
permissions:
  contents: read
jobs:
  qa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Resolve pinned image from lock (single source)
        run: |
          TAG=$(grep '^tag=' qa-container.lock | cut -d= -f2)
          DIGEST=$(grep '^digest=' qa-container.lock | cut -d= -f2)
          echo "QA_IMAGE=${{ env.IMAGE_NAME }}@${DIGEST}" >> "$GITHUB_ENV"   # parsed from lock, never hardcoded
      - name: Run QA in pinned container
        run: |
          docker run --rm --init --ipc=host \
            -v "$GITHUB_WORKSPACE:/work" -w /work \
            -v qa_node_modules:/work/node_modules \
            "$QA_IMAGE" sh -c "npm ci && npx vitest run --config vitest.qa.config.ts && node scripts/assert-zero-skips.mjs fixtures/bridge/vitest-qa-junit.xml"
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: qa-artifacts
          path: out/qa/
      - name: Flake proof (10× strict identity, main/nightly/dispatch only)
        if: github.ref == 'refs/heads/main' || github.event_name == 'workflow_dispatch'
        run: node scripts/qa-flake-proof.mjs   # 10 container runs, deep-equal QAReports minus timestamp
```
(No `container:` job used here — the `docker run` path IS the shared local/CI execution path per D-02/D-03 B1; if the planner prefers `container:`, `image: ${{ env.QA_IMAGE }}` with the digest-pinned env var is the verified-equivalent syntax.)

### Anti-patterns to avoid

- **`waitForTimeout` anywhere in the walker** — wall-clock waits are the #1 flake generator; wait on lottie events only.
- **Re-deriving `renderer_support` server-side** — it arrives in the request from the compile envelope (D-18); re-deriving via `classify()` would contradict the single-source rule.
- **Pretty-printed QAReport JSON** — only `serializeDeterministicJson` (compact, fmt floats); `JSON.stringify` on float-bearing paths breaks byte identity (format.ts docstring).
- **Mounting host `node_modules` into the container** — platform binaries; use the named-volume shadow.
- **CDN wasm fetch in QA** — `setWasmUrl` to a locally served `dotlottie-player.wasm`, else the pinned container still pulls live bytes from jsdelivr.

## Common Pitfalls

### P1 — dotLottie theming no-op without slots (Q1 correction to D-09's fallback)
**What goes wrong:** `setThemeData`/`setTheme` on the canonical Lottie changes zero pixels → smoke reports `theme:noop` for every asset, or worse, a fake "pass" if the test only asserts no-crash.
**Why:** slots are `sid`-discovered only (dotlottie-rs `collect_sid_slots`); Phase 3 emit has no `sid`, and `.dotlottie` packaging does not add slots.
**Avoid:** `slotizeForTheme()` pure step before the dotLottie load (Q1 recommendation); add a unit test asserting the slotized variant actually differs in theme regions.
**Warning signs:** `theme_diff_pct === 0` on every asset at first container run.

### P2 — npm ci inside container clobbers host node_modules (Windows)
**What goes wrong:** binding the repo into the container and running `npm ci` replaces win32 native binaries (`@biomejs/biome`, `@resvg/resvg-js`) with linux ones; host verify/tsc/biome break mysteriously afterwards.
**Avoid:** named volume shadow mount `-v lottie_forge_qa_node_modules:/work/node_modules` (D-02/m8 made concrete).
**Warning signs:** host `npx biome` fails with ELF/exec-format errors after a local `qa:run`.

### P3 — Playwright npm version ≠ image version
**What goes wrong:** Chromium executables not found ("Playwright will be unable to locate browser executables" — official docs).
**Avoid:** exact pin `playwright@1.62.1` == `v1.62.1-noble` from the lock; m1 parity test collected by verify.
**Warning signs:** container job fails at `chromium.launch` right after a lock bump without matching npm pin.

### P4 — Node version mismatch assumptions
**What goes wrong:** assuming the image ships Node 20 (it ships **Node 24** at v1.62.1-noble); scripts conditioned on Node-20-only behavior, or lockfile regenerated with a different npm major inside the container.
**Avoid:** document Node 24 in `docs/qa.md`; `npm ci` (never `npm install`) inside the container so the committed lockfile is untouched.
**Warning signs:** lockfile diff appearing after container runs (must never be committed).

### P5 — NDJSON/stdout discipline in-container
**What goes wrong:** any QA page console noise or vitest reporter output interleaved with protocol bytes if the RPC server and the runner share stdout.
**Avoid:** keep the Phase 3 split — server stdout = protocol only (server.ts:18-22); vitest junit goes to a file (`fixtures/bridge/vitest-qa-junit.xml`), runner diagnostics to stderr; in-container default shell is `sh` (GH docs), avoid bashisms in `run:` steps.
**Warning signs:** Python client `malformed_envelope` errors in mixed local runs.

### P6 — Anchor mask resolution in the lottie-web DOM (D-11)
**What goes wrong:** assuming `{asset_id}_{component}_{role}` IDs exist in the lottie-web SVG output — they exist only on the **companion static SVG** (svg-builder.ts:68-70); lottie-web generates its own anonymous DOM.
**Avoid (two deterministic options, planner's pick):**
  1. Map `animation.renderer.elements[i]` ↔ `lottie` layers array order (official docs use `renderer.elements` for layer access) and read each layer element's bbox at the canonical frame; or
  2. Compute bboxes analytically from the RenderSpec geometry at the canonical pose (pure, deterministic, zero DOM coupling) — masks need only *contain* the anchor ink (D-12 denominator tolerates slight overshoot).
Pin whichever is chosen with a container spec asserting mask-vs-ink sanity on one fixture.
**Warning signs:** masks that cover 100% of the canvas → `theme_diff_pct` denominator explodes → smoke becomes unfailable.

### P7 — Baseline regen in CI
**What goes wrong:** a CI job regenerating baselines would mask real regressions (and violate D-05/D-37 doctrine).
**Avoid:** replicate the verbatim `CI === "true"` refusal from update-goldens.mjs:148-154; CI only compares.
**Warning signs:** baseline PNG diffs in a PR that only touched tests.

### P8 — Flake-proof false negatives from float serialization
**What goes wrong:** 10-run identity check fails on `pixel_diff.mean` last-digit jitter (e.g. `toFixed` vs `JSON.stringify` shortest-roundtrip differences across code paths).
**Avoid:** all report numbers flow through `fmt()`/`serializeDeterministicJson`; fix the p95 policy (nearest-rank) in code and test.
**Warning signs:** identity proof red while every per-frame PNG byte is identical.

### P9 — workflow_dispatch before merge to main
**What goes wrong:** the m2 on-demand trigger silently does nothing on a branch.
**Avoid:** "This trigger only receives events when the workflow file is on the default branch" (GH docs) — document in qa.yml comment.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pixel diffing | Custom pixel-loop/PSNR | pixelmatch 7.2.0 (AA-aware, OKLab) | Perceptual metric + anti-aliasing detection are research-grade problems |
| PNG codec | Manual zlib/PNG writer | pngjs 7.0.0 | Chunk/CRC/filter correctness |
| Container determinism | "Same OS" arguments | Playwright official image digest pin | Browser build is the noise source, not the OS |
| Zero-skip gate | Ad-hoc grep in qa.yml | `scripts/assert-zero-skips.mjs` (existing, stdlib-only) | One gate, reused on both junitxmls |
| Rejection fixtures | New per-phase format | D-08 harness (`rejection-cases.ts` + `rejection_loader.py`) | One source, two sides, zero drift |
| Deterministic JSON | `JSON.stringify` + sort | `serializeDeterministicJson` / `fmt` | Float byte-authority already locked (D-35) |
| Browser install/CI matrix | Custom Dockerfile | Official `mcr.microsoft.com/playwright` image | Deps+browser lock maintained upstream |

## Runtime State Inventory

Not a rename/refactor phase — but three runtime-state facts matter:
- **Docker daemon is NOT auto-running** on this Windows host (Docker Desktop 29.7.2 CLI present, engine pipe absent at research time) — `qa:run` must fail with a readable message when the engine is down.
- **No playwright browsers on the host** — correct end-state per D-02; any accidental `npx playwright install` on the host is a doctrine violation to revert.
- **`fixtures/bridge/` is generated at test time and gitignored** — vitest-qa junitxml joins this family; `out/qa/` gitignored per D-19/m12. (M1 audit F-4: `fixtures/bridge/` gitignore is INTENTIONAL — do not "fix".)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker engine | qa:run, baseline:update, local container QA | ✗ (CLI 29.7.2 present, daemon stopped at research time) | — | Start Docker Desktop (user action); qa.yml does not depend on the host daemon |
| Node (host) | verify suite, scripts | ✓ | 26.3.0 (engines ≥20 ✓) | — |
| npm (host) | lockfile installs | ✓ | 11.16.0 | — |
| Node 24 (in image) | container vitest/npm ci | ✓ (verified via Dockerfile.noble @ v1.62.1) | 24 | — |
| Chromium | frame walk | ✓ (in pinned image only) | locked by digest | none (by design) |
| MCR registry access | image pull (CI + local) | ✓ (API reachable this session) | — | — |
| jsdelivr CDN | default dotlottie wasm fetch | deliberately NOT used | — | self-hosted wasm via `setWasmUrl` |

**Missing with no fallback:** none (Docker engine is a start-action, not an install).
**Missing with fallback:** none.

## Validation Architecture

> nyquist_validation enabled (config key absent → treated as enabled).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4 (unit, `verify`) + Vitest ^4 QA project (`qa.yml`, in-container) |
| Config files | `vitest.config.ts` (default, existing) + **new** `vitest.qa.config.ts` (QA-only project) |
| Quick run command | `npx vitest run` (default project; QA specs excluded) |
| Full suite command | `npx vitest run` + `python -m pytest tests/ -q` (verify); `docker run … npx vitest run --config vitest.qa.config.ts` (QA, container only) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| QA-01 (structural part) | Every Lottie loads in pinned container & walks frames via `goToAndStop(n,true)`+`setSpeed(0)` | E2E (container) | `vitest.qa.config.ts` project in container | ❌ Wave 0 (`src/anim-qa/__tests__/*.qa.spec.ts`) |
| QA-01 (flake) | 10 consecutive runs → strict identity of QAReports minus timestamp | E2E proof (container, main/nightly/dispatch) | `scripts/qa-flake-proof.mjs` in qa.yml step | ❌ Wave 0 |
| QA-01 (parity) | npm playwright version == lock tag version | unit (verify) | vitest default project (m1 gate) | ❌ Wave 0 |
| QA-02 | pixelmatch vs baseline, `maxDiffPixels` per asset, canonical+3 sampled | unit for `diff.ts` math (synthetic PNGs, no browser — D-24) + E2E container | default vitest / qa config | ❌ Wave 0 (`diff.spec.ts` unit + qa spec) |
| QA-02 (calibration) | Spike protocol: K≥10 captures a-001, p95×margin, passes ×10 identity | spike script → `docs/qa.md` + `thresholds.json` (first task, D-07) | `node scripts/qa-calibrate.mjs` in container | ❌ Wave 0 (first task) |
| QA-03 | One asset over threshold = failed verdict, no averaging | unit (rollup policy in `report.ts`/runner) + container E2E (seeded over-threshold synthetic) | default vitest | ❌ Wave 0 |
| QA-04 (contract) | QAReport Pydantic↔zod parity + rejection harness | unit bridge (verify chain) | `pytest tests/ -k qa_report` + vitest `test.each` | ❌ Wave 0 (`qa-report.json`, domain model, mirror, loaders) |
| QA-04 (ordering) | Steps 1-3 fail ⇒ no Chromium ever spawned | unit assertion (server-level, mock spawn counter) | default vitest (m7) | ❌ Wave 0 |
| QA-04 (RPC) | `anim_qa.run` envelope: verdict≠transport; codes 8→10 parity | integration (Python client) + unit | `pytest tests/rpc/` + vitest server spec | ❌ Wave 0 |
| Theming (D-09/D-20/D-21) | setTheme path + applyTheme path, `theme_smoke_path` recorded | unit (`slotizeForTheme`, `applyTheme` pure) + container E2E (11 fixtures `all` + synthetic svg-only) | both configs | ❌ Wave 0 |
| D-24 gates | unit specs never import playwright; zero skips on qa junitxml | scan spec (verify) + assert-zero-skips in qa.yml | default vitest / qa.yml step | ❌ Wave 0 |
| D-26 | baseline sidecar stale/missing → codes before any diff | unit (pure resolver) | default vitest | ❌ Wave 0 |

### Deterministic-in-`verify` vs container-only split (D-24)

- **`verify` (no Chromium, fast):** structural gate, feature gate reuse, structural diff, pixelmatch math on synthetic PNG pairs, baseline resolver, QAReport parity chain (pytest→vitest→pytest), slotize/applyTheme pure functions, RPC envelope unit specs, playwright-version parity scan, unit-imports-never-playwright scan, thresholds/dark-theme/captureConfig schema specs (m6/m10).
- **`qa.yml` (container only):** frame-walker, runner end-to-end on 11 fixtures, theming smoke both paths, baseline compare, synthetic svg-only E2E (D-21), scaffold passes (lottie-react/dotlottie-vue), 10× flake proof, junit → assert-zero-skips.

### Per-success-criterion hooks (for the planner to lift into plans)

1. *SC-1 (QA-01):* container tag recorded in every QAReport (`qa_container_tag`); ×10 identity proof script green on main; parity test green in verify.
2. *SC-2 (QA-02/03):* `thresholds.json` committed with spike-derived values + `docs/qa.md` method; seeded over-threshold synthetic produces `pixel:canonical`/`pixel:p95` verdict and pack-level fail policy documented for Ph 7 consumption.
3. *SC-3 (theming):* dark-theme fixture diff > 5% on all 11 fixtures; `theme:noop` rejection case exercised; svg-only synthetic routes to `applyTheme-svg`.
4. *SC-4 (QA-04):* zod gate (steps 1-3) runs before any pixel cost — asserted by the no-spawn test; QAReport parity chain green; `reason_codes` empty ⟺ passed (superRefine, mirrored both sides).
5. *SC-5 (CI):* qa.yml green from fresh checkout; grep gate proves no `secrets.` in qa.yml; assert-zero-skips on vitest-qa junitxml.

### Wave 0 Gaps
- [ ] `vitest.qa.config.ts` + default-config exclusion of `*.qa.spec.ts` — before any QA spec lands
- [ ] `src/anim-qa/__tests__/` unit specs (structural/diff/report/resolver/applyTheme/slotize) — verify-project
- [ ] `fixtures/rejection-cases/qa-report.json` + Pydantic domain + zod mirror + both loader maps
- [ ] `scripts/qa-flake-proof.mjs`, `scripts/qa-calibrate.mjs`, `qa-container.lock`
- [ ] npm install gate (`checkpoint:human-verify`) for the 10-pin batch above

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | dotlottie-web **0.79.2**'s bundled wasm has the same `sid`-slot theming behavior as `main` (source verified on main only; 0.79.2 is recent and the v2 spec predates it) | Q1 | Smoke must be re-verified at the pinned version in the first container task; if 0.79.2 differs, refresh to 0.80.0 same-commit (both versions verified on registry) |
| A2 | Crop-based region diff (row-sliced RGBA subarray + per-crop pixelmatch) exactly equals "pixels in region" semantics | Q4 | Only affects mask accounting granularity; unit test on synthetic PNGs pins it |
| A3 | `animation.renderer.elements[i]` order mirrors `layers` array (community-established, docs show the accessor) | P6/Pitfall-6 | Fallback = analytic bboxes from RenderSpec geometry (deterministic); pin with one container spec |
| A4 | OCI index digest pin works for both `docker run` (local) and `container:`/docker-run in GH Actions on amd64 | Q2/Q7 | Single-arch subpath digest is the fallback pin |
| A5 | `applyTheme` recolor of `c` (fill/stroke static tuples, golden shape `[0.5,0.5,0.5]`) is the complete anchor-recolor surface for current emits (no gradients in the closed emit set today) | Q5 | If Phase 8 widens emit to gradients, `applyTheme` extends same-commit (closed-model rule §4.14) |
| A6 | upload-artifact v4 usage shown in skeleton; v7.0.1 is latest — planner picks one; `if: always()` semantics identical | Q7 | Cosmetic |

## Sources

### Primary (HIGH confidence — fetched/verified this session)
- npm registry: pixelmatch 7.2.0, pngjs 7.0.0, @lottiefiles/dotlottie-web 0.79.2/0.80.0, lottie-react 3.1.1, @lottiefiles/dotlottie-vue 0.11.27, playwright 1.62.1, lottie-web 5.13.0 (+engines/peers/postinstall)
- MCR registry API: tags list + `Docker-Content-Digest` for `v1.62.1-noble`
- playwright.dev/docs/docker (image usage, `--ipc=host`, `--init`, version-match rule, tag naming)
- github.com/microsoft/playwright `utils/docker/Dockerfile.noble` @ v1.62.1 (Node 24)
- dotlottie.io spec v1.0 (no themes) + v2.0 (slot-based theme rules)
- LottieFiles/dotlottie-web source @ main: `packages/web/src/types.ts` (Config/Theme/RenderConfig), `packages/web/src/dotlottie.ts` (method signatures), README (wasm/`setWasmUrl`)
- LottieFiles/dotlottie-rs source @ main: `src/theme.rs`, `src/renderer/slots/mod.rs` (`collect_sid_slots`)
- airbnb/lottie-web via Context7 (goToAndStop/setSpeed/loadAnimation/setSubframe; no theming API)
- github.com/mapbox/pixelmatch README (API, options, return value)
- docs.github.com workflow syntax (`container.`, `workflow_dispatch`, `schedule`); actions/upload-artifact releases API (v7.0.1)
- gsd package-legitimacy gate (all 11 packages)

### In-repo (verified by Read this session)
- All files cited in "Codebase Integration Surface" with line ranges.

### Tertiary (LOW / assumption-flagged)
- A1/A3/A5 in Assumptions Log.

## Security Domain (security_enforcement enabled, ASVS L1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | **yes** | zod strictObject at the RPC entry (`anim_qa.run` request schema) — mirrors `handleMotionCompile`/`handleSanitize`; `renderer_support` validated against the closed `RendererSupportSchema` |
| V4 Access Control | no (local/CI batch, no multi-tenant surface) | — |
| V2/V3 (Auth/Session) | no | no auth on this path (fresh-checkout CI, no secrets — D-03 grep gate m13) |
| V6 Cryptography | no (sha256 = integrity only, via node:crypto) | — |
| V14 File/Path handling | **yes** | **D-18 zero-paths request** is the control: the request carries `{ lottie, asset_id, renderer_support }`; server resolves baselines/configs from repo-relative constants; artifact paths are *relative* and generated server-side (`out/qa/{asset_id}/…`, `asset_id` already regex-gated `^a-\d{3}$`) — no caller-controlled filesystem path crosses the boundary |

| Threat pattern | STRIDE | Mitigation |
|----------------|--------|------------|
| Path traversal via request fields | Tampering/Elevation | Closed request schema (no path fields), `asset_id` pattern gate, server-owned output dir (D-18/D-19) |
| Malicious "Lottie" payload driving the browser page | Tampering | Input is the compiler's own re-validated output in the E2E chain (D-16); page loads only locally-served bytes; `stateMachineConfig.openUrlPolicy` defaults deny in dotLottie; no external URLs in the QA page (self-hosted wasm) |
| CI secret exposure | Information Disclosure | qa.yml has no `secrets.` (m13 grep gate); `permissions: contents: read` |
| CDN supply-chain drift at render time | Tampering | wasm pinned by npm exact-version + `setWasmUrl` to local file; image pinned by digest |

## File Inventory

**Create:**
```
qa-container.lock                                  # image tag+digest single source (B1, D-01)
vitest.qa.config.ts                                # QA-only vitest project (B2, D-24)
.github/workflows/qa.yml                           # dedicated CI workflow (D-03/D-04)
scripts/qa-run.mjs                                 # docker run wrapper (D-02; qa:run npm script)
scripts/baseline-update.mjs                        # CI=true guard, container-run regen (D-05)
scripts/qa-flake-proof.mjs                         # 10× strict-identity proof (D-25)
scripts/qa-calibrate.mjs                           # D-07/m11 spike (first task)
src/anim-qa/runner.ts                              # Playwright entry; anim_qa.run internals (§7.8)
src/anim-qa/frame-walker.ts                        # goToAndStop(n,true)+setSpeed(0) capture (§7.8)
src/anim-qa/diff.ts                                # pixelmatch+pngjs, per-region crops, stats (§7.8)
src/anim-qa/baseline.ts                            # pure resolver + sidecar index.json (D-18/D-26)
src/anim-qa/structural.ts                          # steps 1-3, no browser (§7.8)
src/anim-qa/report.ts                              # QAReport build + ReasonCode closure (§7.8)
src/anim-qa/theming.ts                             # slotizeForTheme + applyTheme pure fns (D-09/D-20)
src/anim-qa/page/                                  # QA page assets (walker HTML/JS served by runner)
src/rpc/contracts/qa-report.schema.ts              # QAReportSchema zod strictObject mirror (D-14)
src/anim-qa/__tests__/*.spec.ts                    # unit specs (verify project)
src/anim-qa/__tests__/*.qa.spec.ts                 # container specs (qa project)
lottie_forge/domain/qa_report.py                   # QAReport + PixelDiffStats Pydantic §7.6 verbatim
fixtures/qa/thresholds.json                        # per-asset maxDiffPixels + default (D-06)
fixtures/qa/dark-theme.json                        # QA-only dark theme fixture (D-10)
fixtures/qa/capture-config.json                    # versioned captureConfig (D-22/D-23)
fixtures/rejection-cases/qa-report.json            # shared rejection cases (D-14/D-08 format)
fixtures/style-specs/example-style/baseline-frames/  # baseline PNGs + index.json sidecar (D-05/D-26)
docs/qa.md                                         # calibration method + values (D-07)
```

**Modify:**
```
package.json                                       # exact-pin devDeps + qa:run/baseline:update scripts
package-lock.json                                  # same-commit
vitest.config.ts                                   # exclude *.qa.spec.ts from default project (B2)
src/rpc/server.ts                                  # anim_qa.run dispatch + RPC_ERROR_CODES 8→10 + ServerContext QA configs + banner
src/rpc/contracts/rejection-cases.ts               # CONTRACT_FILES + REJECTION_EXPECT_CODES 8→10
tests/bridge/rejection_loader.py                   # CONTRACT_FILES qa-report entry
lottie_forge/rpc/client.py                         # RPC_ERROR_CODES 8→10 same-commit
.gitignore                                         # out/qa/
docs/project/03_Stack.md                           # NO — read-only reference; pins live in package.json (planner note)
```
**Read-only (must not change):** `.github/workflows/verify.yml` (byte-identical, D-03) · all Phase 3 compiler/sanitizer/golden files (zero domain churn, D-21) · `fixtures/render-specs/*` · `src/shared/format.ts`.

## Metadata

**Confidence breakdown:**
- Stack pins: HIGH — every version read from the registry this session
- Theming mechanism (Q1): HIGH on current-main behavior (source-verified), MEDIUM at the pinned 0.79.2 wasm (A1) — first container task settles it
- Architecture/patterns: HIGH — direct reuse of proven Phase 1/3 patterns, all cited
- Pitfalls: HIGH for P1-P5 (source/docs-verified), MEDIUM for P6 (DOM mapping, fallback exists)

**Research date:** 2026-09-04
**Valid until:** ~2026-10-04 (pins are exact; re-verify digest only on lock refresh)
