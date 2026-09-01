---
phase: 03-motion-compiler-svg-sanitizer
plan: 01
subsystem: infrastructure
tags: [svgo, tsx, formatter, deterministic-json, format, vitest, biome]

# Dependency graph
requires:
  - phase: 02-spec-validators
    provides: zod-based frozen contracts and the verify.yml/CI scaffold Phase 3 producers must slot into
provides:
  - Canonical `fmt()` numeric formatter (D-35) — single source of truth for every float the Motion Compiler, SVG Sanitizer, and goldens emit
  - Deterministic compact JSON serializer (D-23) + file writer terminating with a `\n` byte (D-24)
  - `svgo@^4.1.0` runtime + `tsx@^4.23.13` devDep committed with `package-lock.json` (COM-01 + Pitfall 8)
  - `src/shared/format.spec.ts` exact-case matrix pinned on engine-independent values
affects:
  - All 11 goldens in plan 03-06 — they will be byte-compared against outputs that route through `fmt()`
  - Every later producer of bytes (compiler, sanitizer, RPC server payloads)
  - Phase 4/7/8 wire formats that cross the Python ↔ TypeScript boundary as text

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates
actuals:
  tokens: 9966   # chars/4 over package.json + package-lock.json + src/shared/{format.ts,format.spec.ts}; lockfile dominates at ~6800 chars
  tasks: 3
  commits: 3   # one per task + the docs/SUMMARY commit below

# Tech tracking
tech-stack:
  added:
    - "svgo@^4.1.0 (production dep — sanitize.ts gates scan via SVGO 4 XAST visitors)"
    - "tsx@^4.23.13 (devDep — scripts/compile-stdin.ts and the Python RPC integration test spawn Node under tsx)"
  patterns:
    - "Single-module numeric authority — one `fmt()`, no second formatter for SVG attributes"
    - "Hand-written compact JSON walker — never `JSON.stringify` on float-bearing paths"
    - "File terminator uses literal `\\n`, never `os.EOL` (Pitfall 9)"
    - "Throw-loud guards (non-finite, |x|>=1e21, unsupported types) instead of silent `undefined` substitution"

key-files:
  created:
    - "src/shared/format.ts — fmt(), serializeDeterministicJson(), writeDeterministicJson() (D-23/D-24/D-35)"
    - "src/shared/format.spec.ts — 27 vitest cases pinning the regime"
  modified:
    - "package.json — svgo (dep) + tsx (devDep) added"
    - "package-lock.json — full lockfile committed (npm ci reproducibility)"

key-decisions:
  - "svgo@^4.1.0 approved by blocking-human legitimacy checkpoint (Task 1) — maintained by the official SVG org (~39.1M weekly DL), no postinstall script, version already locked by ADR-02 + docs/project/03_Stack.md §3.2"
  - "tsx@^4.23.13 approved by blocking-human legitimacy checkpoint (Task 1) — maintained by privatenumber (~86.3M weekly DL), no postinstall script, required because Node 20 CI cannot execute TypeScript natively (Pitfall 8)"
  - "fmt() is the sole formatter — same function for Lottie outputs AND for SVG numeric attributes per D-35 ('même formateur')"
  - "JSON walker uses `JSON.stringify` ONLY for string escape contract — numbers route through fmt() so D-23's shortest-roundtrip-floats failure mode is impossible by construction"
  - "Module-evaluation guard throws at load time if the implementation ever drifts on the 1e21 bound (mirror of vocabulary.schema.ts module-guard pattern, lines 74-78)"
  - "`writeDeterministicJson` explicitly tests that the final byte is 0x0A — guard against accidental trailing-newline change in CI"

patterns-established:
  - "Pattern A: numeric-format authority lives in src/shared/format.ts; later phases import from there, never define their own (D-35)"
  - "Pattern B: JSON outputs use compact + final newline (D-24); `os.EOL` is banned globally (Pitfall 9)"
  - "Pattern C: throw on every non-serializable / out-of-bounds / non-finite value — fail-loud on the gate, never silently substitute"

requirements-completed: [COM-01]

coverage:
  - id: D1
    description: "svgo + tsx installed past the blocking-human legitimacy checkpoint with committed lockfile"
    requirement: COM-01
    verification:
      - kind: automated_ui
        ref: "npm ls svgo tsx (clean tree, svgo 4.1.0 + tsx 4.23.13)"
        status: pass
      - kind: automated_ui
        ref: "node -e \"import('svgo').then(m => { if (typeof m.optimize !== 'function') process.exit(1) })\" (v4 named export)"
        status: pass
      - kind: automated_ui
        ref: "npx tsx --version (4.23.13)"
        status: pass
      - kind: unit
        ref: "src/shared/format.spec.ts (vitest coverage includes fmt() in serializer assertions)"
        status: pass
    human_judgment: false
  - id: D2
    description: "fmt() implements D-35 exactly — toFixed(4), -0->0, strip, throw on non-finite and |x|>=1e21"
    requirement: COM-01
    verification:
      - kind: unit
        ref: "src/shared/format.spec.ts#\"fmt() — D-35 canonical decimal formatter\" (12 cases pinning toFixed + -0 + thresholds + bounds)"
        status: pass
      - kind: automated_ui
        ref: "npx tsc --noEmit (clean)"
        status: pass
      - kind: automated_ui
        ref: "npx @biomejs/biome check src/shared/ (clean)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Deterministic compact-JSON writer emits compact body + final 0x0A byte (D-24)"
    requirement: COM-01
    verification:
      - kind: unit
        ref: "src/shared/format.spec.ts#\"writes compact JSON terminated by exactly one 0x0a byte (D-24 + Pitfall 9)\" (final byte asserted via Buffer)"
        status: pass
      - kind: unit
        ref: "src/shared/format.spec.ts#\"is stable across multiple invocations (determinism, D-23)\""
        status: pass
    human_judgment: false

# Metrics
duration: 8min
completed: 2026-09-01
status: complete
---

# Phase 03 Plan 01: npm legitimacy + determinism socle

**D-35 numeric formatter, compact deterministic JSON writer, and the svgo + tsx dependency surface installed past a blocking-human checkpoint — the byte-authority socle every later Phase 3 producer imports.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-01T13:23:14Z
- **Completed:** 2026-09-01T13:30:53Z
- **Tasks:** 3 (1 was a blocking-human checkpoint approved externally; 2 executed here)
- **Files modified:** 4 (`package.json`, `package-lock.json`, `src/shared/format.ts`, `src/shared/format.spec.ts`)

## Accomplishments
- svgo@^4.1.0 and tsx@^4.23.13 installed with `package-lock.json` committed — `npm ci` now reproduces the tree
- `src/shared/format.ts` ships `fmt()`, `serializeDeterministicJson()`, and `writeDeterministicJson()` as the single byte-authority for Phase 3
- 27 vitest cases pin the D-35 regime end-to-end (negative-zero, non-exact floats, compact walker, key order, string escape contract, trailing-newline discipline)
- `npm ls` clean, `tsc --noEmit` clean, biome clean — full 183-test suite still green after the changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Legitimacy checkpoint — confirm svgo@^4.1.0 and tsx@^4.23.13 installs** — approved externally by the human verifier (recorded in Decisions below); no code commit produced
2. **Task 2: Install svgo (dep) + tsx (devDep), commit lockfile** — `ee2ae89` (feat)
3. **Task 3: Canonical formatter + deterministic JSON serializer (D-23/D-24/D-35)** — `1360885` (feat)

**Plan metadata:** `docs(03-01): complete npm legitimacy + format.ts socle plan` below.

## Files Created/Modified
- `package.json` — added `svgo: "^4.1.0"` to dependencies, `tsx: "^4.23.13"` to devDependencies
- `package-lock.json` — full lockfile for both new packages + transitives (svgo: 17 packages, tsx: 3 packages)
- `src/shared/format.ts` — `fmt()`, `serializeDeterministicJson()`, `writeDeterministicJson()`; docblock cites D-23/D-24/D-35; throws on non-finite / out-of-bounds / unsupported types
- `src/shared/format.spec.ts` — 27 exact-case vitest assertions against `format.ts`

## Decisions Made

### Legitimacy verdicts (recorded from user approval before this agent resumed)

- **svgo@^4.1.0** — github.com/svg/svgo (official SVG org maintainer); ~39.1M weekly downloads on npm; no postinstall script; version already locked by ADR-02 and `docs/project/03_Stack.md` §3.2. APPROVED by blocking-human checkpoint.
- **tsx@^4.23.13** — github.com/privatenumber/tsx; ~86.3M weekly downloads on npm; no postinstall script; required because Node 20 CI cannot execute TypeScript natively (`03-RESEARCH.md` Pitfall 8). APPROVED by blocking-human checkpoint. Documented fallback (vite-node) was rejected by user.

### Implementation decisions

- **`fmt()` is the sole formatter.** Per D-35 ("même formateur pour les attributs numériques du SVG"), no second formatter exists for SVG numeric attributes. Any divergence would invalidate the 11 goldens locked in plan 03-06.
- **JSON walker is hand-written**, never `JSON.stringify` on float-bearing paths. `JSON.stringify` is used ONLY for the spec-conformant string-escape contract (object keys + primitive strings); every number flows through `fmt()` first. This makes the D-23 shortest-roundtrip-floats failure mode impossible by construction.
- **`writeDeterministicJson` uses literal `"\n"`** — never `os.EOL` (Pitfall 9). The project's `.gitattributes` (`* text=auto eol=lf`) already enforces LF globally; this matches the locked norm.
- **Throw-loud on the gate.** NaN/Infinity/-Infinity, `|x| >= 1e21`, and non-serializable values (`undefined`, functions, symbols, bigints) all throw. No silent `undefined` substitution (which `JSON.stringify` would do and which would desynchronize key inventory from body).
- **Spec pins engine-independent values.** The exact-case matrix uses only IEEE-754-exact binary fractions, integers, and values whose `toFixed(4)` result is itself engine-independent. The two non-exact cases (`0.1 + 0.2 → "0.3"`, `1/3 → "0.3333"`) exist precisely because they are the canonical `JSON.stringify` failure modes that D-35 was introduced to bypass.
- **Module-evaluation guard pattern borrowed from `vocabulary.schema.ts` (lines 74-78).** Future divergence on the `1e21` bound surfaces at module load time, not at runtime — mirrors the recipe-count invariant guard.

## Deviations from Plan

### Adjustments (Rule 1 — bug in my own spec expectations)

**1. [Self-correction] Three test expectations corrected against actual `toFixed(4)` behavior**
- **Found during:** Task 3 verification
- **Issue:** Initial spec expectations were inconsistent with ECMA-262 `toFixed(4)` on the values tested:
  - `fmt(0.03125)` — toFixed(4) emits `"0.0313"` (4-decimal cap, not 5); cannot emit `"0.03125"`.
  - `fmt(0.015625)` — toFixed(4) emits `"0.0156"` (IEEE-754 stored value rounds down); cannot emit `"0.01563"`.
  - `fmt(-0.00001)` — after `toFixed(4)="-0.0000"` → strip → `"-0"`, the residual-`-0` re-map (per D-35) produces `"0"`, not `"-0"`.
  - `fmt(1e21 - 1e12)` — IEEE-754 represents this as `999999998999999938560`, not `1000000000000000000000`; replaced with the exact-binary `(2 ** 50)` / `(2 ** 60)` to keep the test meaningful without injecting floating-point uncertainty.
- **Fix:** Spec expectations rewritten to match the deterministic `toFixed(4)` output; the implementation is unchanged and correct per D-35.
- **Files modified:** `src/shared/format.spec.ts`
- **Verification:** `npx vitest run src/shared/format.spec.ts` — 27/27 green after the fix; `npx tsc --noEmit` clean.

---

**Total deviations:** 1 self-correction (test-pillar expectations, not implementation)
**Impact on plan:** None — the corrections strengthen the test pillar by matching its audit claim (engine-independent exact-case matrix) to actual engine behavior. The regime pinned by `fmt()` is unchanged.

### Auto-fixed Issues

None.

## Issues Encountered

- Vitest reports `node.exe : RemoteException` for the first failing assertion block when piped through `Tee-Object` — purely cosmetic; the actual test results underneath are still accurate. Resolved by checking the `Tests` line, not the local exception stream.

## User Setup Required

None — no external service configuration. Both new packages (`svgo`, `tsx`) come from the npm registry; `package-lock.json` is committed, so `npm ci` reproduces the tree in any environment.

## Next Phase Readiness

- **Plan 03-02** can proceed: the schemas in `src/rpc/contracts/motion-compiler.schema.ts` and `sanitizer.schema.ts` will import from `src/shared/format.ts` only when emitting bytes (gates), not for definitions — `format.ts` is the byte-authority, the zod schemas remain the shape-authority.
- **Plan 03-06** has its byte substrate ready: every golden the plan pins will be byte-compared against outputs that flow through `fmt()` + `writeDeterministicJson()`.
- **No blockers, no deferred items, no stubs.**

## Self-Check

- **Files created/modified exist:**
  - `src/shared/format.ts` — FOUND
  - `src/shared/format.spec.ts` — FOUND
  - `package.json` — FOUND
  - `package-lock.json` — FOUND
- **Task commits in git log:**
  - `ee2ae89` — FOUND (`feat(03-01): install svgo (dep) + tsx (devDep), commit lockfile`)
  - `1360885` — FOUND (`feat(03-01): canonical formatter + deterministic JSON serializer`)
  - `5191e10` — FOUND (`docs(03-01): complete npm legitimacy + format.ts socle plan`)

## Self-Check: PASSED

---

*Phase: 03-motion-compiler-svg-sanitizer*
*Completed: 2026-09-01*
