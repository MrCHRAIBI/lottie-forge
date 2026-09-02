---
phase: 03-motion-compiler-svg-sanitizer
plan: 08
subsystem: rpc-bridge
tags: [ndjson, rpc, stdio, transport, pattern-5, com-02, no-llm, grep-gate, python-client, vitest, pytest]

# Dependency graph
requires:
  - phase: 03-motion-compiler-svg-sanitizer
    provides: "Motion Compiler + SVG Sanitizer + their frozen RPC contracts (motion-compiler.schema.ts, sanitizer.schema.ts) — the server dispatches to compile() and sanitizeSvg()"
provides:
  - "src/rpc/server.ts: NDJSON lockstep server exposing motion.compile + svg.sanitize with closed 8-code envelope; pure processLine handler for unit testing"
  - "lottie_forge/rpc/client.py: transport-only Python client (spawn/call/send_raw/close); Phase 4/7/8 reuse"
  - "tests/rpc/test_rpc_integration.py: §6.6 integration — cold-start compile + sanitize + parametrized D-29 closure + D-36 server survival"
  - "src/rpc/contracts/no-llm-imports.spec.ts: COM-02 grep gate with proven teeth — ordinary vitest spec, verify.yml byte-identical"
affects:
  - phase: 04-anim-qa
    note: "Will reuse the RPC framing (Pattern 5 + 8-code envelope) to add anim_qa.run; client.py is the shared transport"
  - phase: 07-pydantic-mirror
    note: "Client.py is transport-only (D-30 — zero business types) so Phase 7 can add the typed Pydantic mirror without refactoring"
  - phase: 08-packager
    note: "Reuses the same framing for package.export; the COM-02 gate is the structural backbone guarantee that the deterministic spine stays LLM-free"

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 85000        # chars/4 over the files actually changed
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added:
    - "Python: subprocess + queue.Queue + threading (background reader thread for win32 pipe-safe lockstep RPC)"
  patterns:
    - "Pattern 5 NDJSON RPC framing: one JSON object per line, correlation by numeric id, closed envelope {id, ok, result|error}"
    - "Closed 8-code error set: parse_error, validation_error, unsupported_feature, compile_error, sanitize_rejected, internal, protocol_error, method_not_found"
    - "Stdout = protocol only, stderr = diagnostics (fail-loud, never log on stdout)"
    - "Server survival on malformed input (D-36): protocol_error with id null + continue; never crash"
    - "Pure handler separation: processLine is a pure function over ServerContext, main() only wires stdin→stdout (testability + entry-detection via import.meta.url)"
    - "COM-02 structural gate as ordinary vitest spec: case-insensitive regex over package.json/tsconfig.json/src/**/*.ts, scanner teeth proven on synthetic in-memory content"
    - "Transport-only client (D-30): zero business types on the Python side; typed Pydantic mirror arrives Phase 7"

key-files:
  created:
    - "src/rpc/server.ts"
    - "src/rpc/server.spec.ts"
    - "lottie_forge/rpc/__init__.py"
    - "lottie_forge/rpc/client.py"
    - "tests/rpc/test_rpc_integration.py"
    - "src/rpc/contracts/no-llm-imports.spec.ts"
  modified: []

key-decisions:
  - "Server loads catalogue + style ONCE at startup; RPC motion.compile request is just { render_spec } (style/catalogue never cross the wire) — minimises the on-wire attack surface and matches the locked D-17 contract"
  - "Server detects entry-vs-import via `import.meta.url === pathToFileURL(process.argv[1]).href` so vitest importing server.ts never triggers main()"
  - "Python client uses a background reader thread + queue.Queue (not select.select — only works on sockets on win32) to keep the same module portable across Windows + POSIX"
  - "On win32, the default command array appends '.cmd' to npx because Python's subprocess.Popen does NOT auto-resolve PATHEXT (CreateProcess requires the literal extension)"
  - "COM-02 spec self-excludes from the scan walk: the closed tuple of forbidden names MUST live in source somewhere, and the gate's scanner lives in the same file as its self-test — the docblock makes the rationale explicit"
  - "biome-ignore-all lint/suspicious/noExportsInTest at the top of the COM-02 spec — the scanner is a reusable piece of the gate (plan: 'export the scan function'); living in a test file keeps it next to its self-validating test"

patterns-established:
  - "Closed RPC envelope: { id: number | null, ok: boolean, result?: unknown, error?: { code, message, details? } }"
  - "Closed code set is an exported const tuple (RPC_ERROR_CODES) shared by both sides of the bridge — a future addition is a single-site edit + same-commit update"
  - "processLine never throws (D-36 doctrine); defense-in-depth in the readline loop catches anything that slips"
  - "RPCError.cause ∈ {timeout, process_dead, malformed_envelope} — typed transport errors distinct from the closed envelope.error.code"
  - "Server's `__name__ == \"__main__\"`-equivalent via import.meta.url comparison — keeps the entry detection framework-agnostic"

requirements-completed:
  - "COM-02"

# Coverage metadata (#1602) — one entry per shipped deliverable. Drives DETERMINISTIC UAT routing in verify-work.
coverage:
  - id: D1
    description: "NDJSON RPC server — src/rpc/server.ts — methods motion.compile + svg.sanitize with closed 8-code envelope (D-27/D-28/D-36)"
    requirement: "COM-02"
    verification:
      - kind: unit
        ref: "src/rpc/server.spec.ts (12 tests)"
        status: pass
      - kind: automated_tooling
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D2
    description: "Python transport client + §6.6 integration — lottie_forge/rpc/client.py + tests/rpc/test_rpc_integration.py — spawn/call/send_raw/close, transport-only (D-30), 22-test §6.6 integration including parametrized D-29 closure over fixtures/rejection-cases/render-spec.json"
    requirement: "COM-02"
    verification:
      - kind: integration
        ref: "python -m pytest tests/rpc/test_rpc_integration.py -q (22 passed)"
        status: pass
      - kind: automated_tooling
        ref: "ruff check ."
        status: pass
    human_judgment: false
  - id: D3
    description: "COM-02 grep gate — src/rpc/contracts/no-llm-imports.spec.ts — case-insensitive scan of package.json + tsconfig.json + src/**/*.ts against the three SDK names (langchain, openai, anthropic), with self-test proving scanner teeth on synthetic in-memory content; verify.yml byte-identical"
    requirement: "COM-02"
    verification:
      - kind: unit
        ref: "src/rpc/contracts/no-llm-imports.spec.ts (9 tests — 5 self-test + 2 repo-wide + 1 entry-count)"
        status: pass
      - kind: automated_tooling
        ref: "git diff .github/workflows/verify.yml (empty)"
        status: pass
    human_judgment: false

# Metrics
duration: 21min
completed: 2026-09-02
status: complete
---

# Phase 3 Plan 08: NDJSON RPC server + Python transport client + COM-02 grep gate Summary

**NDJSON lockstep RPC server (Pattern 5), Python transport client + 22-test §6.6 integration, and the COM-02 static-scan gate that structurally keeps the deterministic backbone LLM-free.**

## Performance

- **Duration:** 21 min (1788367894 → 1788369131)
- **Started:** 2026-09-02T16:51:34Z
- **Completed:** 2026-09-02T17:12:11Z
- **Tasks:** 3 (all committed atomically)
- **Files created:** 6 (3 TS + 2 Py + 1 Py test)
- **Files modified:** 0 in this plan (Task 3 includes biome cleanup of Task 1+3 files inside the Task 3 commit)

## Accomplishments

- **Task 1 — NDJSON RPC server (`src/rpc/server.ts` + 12-test unit spec).** readline over stdin (terminal false), one NDJSON message per line, correlation by numeric id. `processLine(line, ctx)` is a pure handler (ctx: catalogue + style + method map) returning the envelope; `main()` only wires stdin→stdout and only runs when `import.meta.url === pathToFileURL(process.argv[1]).href` (vitest imports do NOT trigger it). Closed error code set is exactly 8 literals per D-28/D-36: `parse_error, validation_error, unsupported_feature, compile_error, sanitize_rejected, internal, protocol_error, method_not_found`. Envelope: `{ id, ok: true, result }` | `{ id, ok: false, error: { code, message, details? } }`. stdout is protocol-only — every diagnostic goes to stderr. Malformed line → `protocol_error` with id null; server stays alive (D-36 doctrine proven by 12 unit tests).
- **Task 2 — Python transport client + §6.6 integration.** `lottie_forge/rpc/client.py` is transport-only (D-30: zero business types, the typed mirror lands in Phase 7). Spawns the server as a subprocess via `npx tsx src/rpc/server.ts` with cwd at the repo root (Pitfall 8 — Node 20 cannot strip TS natively); the command is a constructor parameter so Phase 4/7/8 can pin differently. Lockstep via a background reader thread + `queue.Queue` (Windows pipe-safe; `select.select` only works on sockets on win32). On win32, `default_command` appends `.cmd` to npx because `subprocess.Popen` does NOT auto-resolve `PATHEXT`. `send_raw` + `read_response` exposed for the malformed-line test (D-36). Typed transport errors `RPCError(cause=...)` where `cause ∈ {timeout, process_dead, malformed_envelope}`. The 22-test `tests/rpc/test_rpc_integration.py` covers: cold-start compile on a-001 → ok=true + v=5.7.0 result; sanitize accepts clean SVG / rejects `<text>` with structured report; parametrized D-29 closure over all 15 render-spec.json rejection cases → `error.code == case.expect_code` over the wire; D-36 server survival (malformed raw line → `protocol_error`, next valid call succeeds); unknown method → `method_not_found`; stdout-discipline loop; `RPCError` typed-attribute sanity.
- **Task 3 — COM-02 grep gate.** `src/rpc/contracts/no-llm-imports.spec.ts` reads `package.json`, `tsconfig.json`, and walks every `.ts` file under `src/` via `node:fs`, scanning each file's CONTENT against a case-insensitive regex union of the three SDK names verbatim from REQUIREMENTS.md COM-02 (`langchain, openai, anthropic`). ANY match throws with the file path (fail-loud). Self-test proves teeth on synthetic in-memory payloads (5 asserts: one per forbidden name + transitive + case-insensitive + clean-content). The spec file self-excludes from the walk (the closed tuple MUST live in source somewhere — the gate's scanner lives in the same file as its self-test). 9 tests pass: 5 self-tests + 2 repo-wide scans + 1 entry-count guard (`> 10` so a future repo move that loses the walk fails loud). verify.yml is byte-identical (no new workflow step; the existing vitest step 09 collects this spec).
- **Reusability (D-27 — costly reversibility):** the framing is byte-clean. Phases 4/7/8 extend the server with `anim_qa.run` and `package.export`; the Python client is the shared transport; the COM-02 gate is the structural backbone guarantee that the deterministic spine stays LLM-free.

## Task Commits

Each task was committed atomically:

1. **Task 1: NDJSON RPC server** — `8d6782e` (feat: NDJSON RPC server — motion.compile + svg.sanitize with closed 8-code envelope)
2. **Task 2: Python transport client + §6.6 integration** — `becf871` (feat: Python transport client + §6.6 RPC integration (D-30/D-27/D-36))
3. **Task 3: COM-02 grep gate + biome cleanup** — `8576e0e` (feat: COM-02 grep gate + biome cleanup of Tasks 1+3)

**Plan metadata:** included in the three task commits above (no separate docs commit per the execution rules — the orchestrator owns STATE.md / ROADMAP.md updates).

_TDD note: not applicable — this plan is integration-oriented (RPC server + transport + grep gate) rather than TDD per-feature; the unit + integration tests are co-located with the code._

## Files Created/Modified

- `src/rpc/server.ts` — NDJSON server with pure `processLine(line, ctx)` handler + thin `main()` entry. Exports `processLine`, `RPC_ERROR_CODES`, `ServerContext`, `Envelope` types, `buildDefaultContext`. 12 unit tests on `processLine`.
- `src/rpc/server.spec.ts` — 12 unit tests: closed 8-code set export, malformed line → `protocol_error` (no throw), empty line, missing id/method → `parse_error`, unknown method → `method_not_found`, validation_error with zod issue paths in details, a-001 happy-path → `v=5.7.0`, clean SVG → `ok=true` with zero violations, forbidden `<text>` → `sanitize_rejected` with structured report, missing `asset_id` → `validation_error`, id correlation end-to-end.
- `lottie_forge/rpc/__init__.py` — package marker exporting `RPCClient` + `RPCError`.
- `lottie_forge/rpc/client.py` — transport-only client. `RPCClient` (start/close/call/send_raw/read_response), `RPCError`, `RPC_ERROR_CODES`, `default_command`, `is_rpc_error_code`. Reads via background reader thread + `queue.Queue` (Windows pipe-safe).
- `tests/rpc/test_rpc_integration.py` — 22 tests: cold-start compile + sanitize happy paths, parametrized D-29 closure over 15 rejection cases, D-36 server survival (malformed line + subsequent valid call), unknown method, stdout-discipline loop, `RPCError` typed attributes.
- `src/rpc/contracts/no-llm-imports.spec.ts` — COM-02 grep gate. Self-test proves scanner teeth (5 asserts per forbidden name + clean content); repo-wide scan with self-exclusion; entry-count guard.

## Decisions Made

- **Style/catalogue pre-load at server startup** — the RPC motion.compile request is just `{ render_spec }`, matching the D-17 contract and the "load fixtures ONCE" instruction. The wire carries only the RenderSpec payload; style + catalogue are server-side state.
- **Pure `processLine` separation** — the handler takes a `ServerContext` and returns an envelope; the only I/O lives in `main()`. Tests drive `processLine` directly with synthetic contexts.
- **Entry detection via `import.meta.url`** — server.ts calls `main()` only when invoked as an entry (`npx tsx src/rpc/server.ts`); vitest imports do NOT trigger main() (the spawn would consume stdin and hang).
- **Python client uses background thread + queue** — `select.select` does NOT work on Windows pipe handles (only sockets); the background-reader-thread pattern is portable across Windows + POSIX without external deps.
- **`npx.cmd` on win32** — Python's `subprocess.Popen` on Windows does NOT auto-resolve `PATHEXT`; `default_command` appends `.cmd` to npx on `sys.platform == "win32"`. CI on Linux uses the bare `npx` form.
- **COM-02 spec self-excludes from the walk** — the closed tuple of forbidden names MUST live somewhere in source. The walk excludes this one file (self-exclusion rationale documented in the docblock); the self-test still exercises the scanner against synthetic in-memory payloads.
- **`biome-ignore-all lint/suspicious/noExportsInTest`** at the top of the COM-02 spec — the scanner is a reusable piece of the gate (plan: "export the scan function"); the file-level suppression keeps the design intent without per-export noise.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed subprocess pipe read on Windows**
- **Found during:** Task 2 (`test_cold_start_motion_compile_returns_a_001_lottie`)
- **Issue:** initial implementation used `select.select(proc.stdout, ..., 0.1)` for a short-poll read, which on Windows raises `OSError: [WinError 10038]` because `select.select` only works on sockets on win32, not on pipes. Local test env is PowerShell 5.1 (Windows).
- **Fix:** Rewrote the reader to use a dedicated background thread + `queue.Queue` (the thread does `proc.stdout.readline()` in a loop, posting each line to the queue). The main thread pops from the queue with `queue.get(timeout=...)`. Same code runs unchanged on POSIX.
- **Files modified:** `lottie_forge/rpc/client.py`
- **Verification:** `python -m pytest tests/rpc/test_rpc_integration.py -q` — 22 passed
- **Committed in:** `becf871` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed npx resolution on Windows**
- **Found during:** Task 2 (`test_cold_start_motion_compile_returns_a_001_lottie`)
- **Issue:** `subprocess.Popen(['npx', '--no', 'tsx', server])` failed with `FileNotFoundError: [WinError 2]` because Python's `subprocess.Popen` on Windows does NOT auto-resolve `PATHEXT`; `npx` is shipped as `npx.cmd` and the system call requires the literal extension.
- **Fix:** `default_command()` appends `.cmd` to the executable when `sys.platform == "win32"`. POSIX runners (Linux CI) use the bare `npx` form.
- **Files modified:** `lottie_forge/rpc/client.py`
- **Verification:** Server spawn succeeds; `python -m pytest tests/rpc/test_rpc_integration.py -q` — 22 passed
- **Committed in:** `becf871` (Task 2 commit)

**3. [Rule 2 - Missing Critical] Added zod `path` PropertyKey filter**
- **Found during:** Task 1 (`tsc --noEmit`)
- **Issue:** zod v4 widens `issue.path` to `PropertyKey[]` (includes `symbol`), but the RPC envelope's `details.issues[].path` schema contract is `ReadonlyArray<string | number>`. Assigning the raw zod issue would widen the wire contract unintentionally.
- **Fix:** `flattenZodIssues` filters `path` entries to `string | number` only (symbol entries cannot appear in JSON over NDJSON anyway — they're filtered at the boundary by definition).
- **Files modified:** `src/rpc/server.ts`
- **Verification:** `tsc --noEmit` clean; `npx vitest run src/rpc/server.spec.ts` — 12 passed
- **Committed in:** `8d6782e` (Task 1 commit)

**4. [Rule 2 - Missing Critical] Imported `CompileError` from its real module**
- **Found during:** Task 1 (`tsc --noEmit`)
- **Issue:** `src/rpc/server.ts` imported `CompileError` from `../motion-compiler/compiler.js`, but `CompileError` is defined in `../motion-compiler/keyframe-emitter.js` and only re-imported by `compiler.ts` for internal use (not exported).
- **Fix:** Imported `CompileError` from its real module `../motion-compiler/keyframe-emitter.js`. No semantic change — `compile()` re-throws `CompileError` via the same class.
- **Files modified:** `src/rpc/server.ts`
- **Verification:** `tsc --noEmit` clean
- **Committed in:** `8d6782e` (Task 1 commit)

---

**Total deviations:** 4 auto-fixed (2 bugs, 2 missing critical)
**Impact on plan:** All auto-fixes were necessary for the plan to execute correctly on Windows (the local CI / dev environment). The first two are Windows-specific portability fixes; the latter two are type-correctness fixes for zod v4 + the actual class location. No scope creep.

## Issues Encountered

- The local execution env is Windows PowerShell 5.1. Both portability fixes (subprocess pipe read, npx.cmd) were caught by the integration test on the first run and fixed in the same commit; the POSIX path was not exercised locally but uses the same code path (no platform-specific branching beyond `.cmd`).
- biome's `noExportsInTest` flagged the COM-02 spec's exports (the plan explicitly requires `export` for the self-test). Resolved via `biome-ignore-all` file-level suppression — the design intent is documented in the spec's docblock.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 4 (`04-anim-qa`) can extend the server with `anim_qa.run` by adding a new method to the dispatch switch in `processLine`. The transport framing and 8-code envelope are byte-clean and stable (D-27 — costly reversibility honored).
- Phase 7 can add the typed Pydantic mirror to `lottie_forge/rpc/` without refactoring `client.py` (D-30 — transport-only, zero business types on the Python side).
- The COM-02 gate is an ordinary vitest spec collected by the existing CI step 09; no CI config edits needed; verify.yml is byte-identical.

---

*Phase: 03-motion-compiler-svg-sanitizer*
*Completed: 2026-09-02*