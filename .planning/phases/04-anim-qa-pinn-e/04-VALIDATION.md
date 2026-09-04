---
phase: 4
slug: anim-qa-pinn-e
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-04
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source of truth: `04-RESEARCH.md` § Validation Architecture (line 467+).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (TS) + pytest 8 (Python bridge) — container-side E2E: `*.qa.spec.ts` under dedicated `vitest.qa.config.ts`, excluded from default vitest project (D-24/B2) |
| **Config file** | `vitest.config.ts` (default, unchanged scope) + `vitest.qa.config.ts` (Wave 0 — created this phase); pytest config from Phase 1/3 |
| **Quick run command** | `npx vitest run` (unit — no Chromium, runs in `verify`) |
| **Full suite command** | `npm run qa:run` (pinned container; compiles 11 fixtures → sanitize → 5-step QA gate) + `python -m pytest` (bridge parity) |
| **Estimated runtime** | unit < 60 s · container QA run ~5–10 min (Docker cold start dominant) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run full unit suite + affected container spec via `npm run qa:run` where the wave touched `src/anim-qa/` or `src/rpc/`
- **Before `/gsd-verify-work`:** Full suite must be green (unit + one clean `qa:run`)
- **Max feedback latency:** 60 s (unit) — container evidence deferred to `qa.yml` per D-03/D-24

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| qa-report-contract | 04-01 | 1 | QA-04 | T-4-02 | reason_codes ⟺ passed biconditional both sides | unit bridge (pytest + vitest) | `python -m pytest tests/ -k qa_report -q` + `npx vitest run src/rpc/contracts` | ❌ W0 (04-01 T1) | ⬜ pending |
| rpc-codes-8to10-request | 04-01 | 1 | QA-04 | T-4-01/T-4-03 | zero-path request schema; 10-code parity 3 sites | unit + parity | `npx vitest run src/rpc && python -m pytest tests/rpc -q` | ❌ W0 (04-01 T2) | ⬜ pending |
| qa-config-contracts | 04-01 | 1 | QA-04 | T-4-14 | versioned configs schema-gated, fail-loud | unit | `npx vitest run src/anim-qa/__tests__/qa-contracts.spec.ts` | ❌ W0 (04-01 T3) | ⬜ pending |
| human-verify-deps | 04-02 | 1 | QA-01 | T-4-SC | legitimacy gate BEFORE install (blocking, never auto) | checkpoint (human) | — (checkpoint response) | n/a | ⬜ pending |
| pins-lock-install | 04-02 | 1 | QA-01 | T-4-05/T-4-06 | digest pin single source; named volume | cli | `npm ls playwright pixelmatch pngjs --depth=0` + lock grep | ❌ W0 (04-02 T2) | ⬜ pending |
| qa-run-vitest-segregation | 04-02 | 1 | QA-01 | T-4-06 | m1 parity; D-24 scan; exclusion; engine-down readable | unit + cli | `npx vitest run` + `npx vitest run --config vitest.qa.config.ts` + `node scripts/qa-run.mjs --check` | ❌ W0 (04-02 T3) | ⬜ pending |
| tracer-anim-qa-run | 04-03 | 2 | QA-04 | T-4-09/T-4-11 | verdict≠transport; baseline_missing; no-spawn architecture | unit + integration | `npx vitest run` + `python -m pytest tests/rpc/test_anim_qa_integration.py -q` | ❌ W0 (04-03 T1) | ⬜ pending |
| m7-resolver-report-matrices | 04-03 | 2 | QA-04 | T-4-12 | chromiumSpawnCount==0 on non-browser paths; m3 predicate matrix | unit | `npx vitest run src/anim-qa/__tests__ src/rpc/server.spec.ts` | ❌ W0 (04-03 T2) | ⬜ pending |
| diff-canonical-frame-pure | 04-04 | 2 | QA-02 | T-4-14 | A2 region semantics + nearest-rank p95 pinned; D-08 equality | unit | `npx vitest run src/anim-qa/__tests__/diff.spec.ts src/anim-qa/__tests__/canonical-frame.spec.ts` | ❌ W0 (04-04 T1) | ⬜ pending |
| walker-capture-core | 04-04 | 2 | QA-01 | T-4-15 | event-driven lifecycle (no wall-clock waits); 400×300 opaque | container-e2e | `npm run qa:run -- npx vitest run --config vitest.qa.config.ts capture.smoke` | ❌ W0 (04-04 T2) | ⬜ pending |
| calibration-spike | 04-04 | 2 | QA-02 | T-4-14 | thresholds measured (p95×margin), deterministic re-run | container-e2e + unit | `npm run qa:run -- node scripts/qa-calibrate.mjs` + `npx vitest run src/anim-qa/__tests__/qa-contracts.spec.ts` | ❌ W0 (04-04 T3) | ⬜ pending |
| baseline-update-sidecar | 04-05 | 3 | QA-02 | T-4-17 | CI=true refusal; atomic write; committed sidecar | container + cli | `npm run qa:run -- node scripts/baseline-update.mjs` + CI=true exit-1 probe | ❌ W0 (04-05 T1) | ⬜ pending |
| runner-step-4 | 04-05 | 3 | QA-01/QA-02 | T-4-18/T-4-21 | relative pointers only; canonical immediate-reject; tag in report | container-e2e | `npm run qa:run -- npx vitest run --config vitest.qa.config.ts gate-e2e` | ❌ W0 (04-05 T2) | ⬜ pending |
| qa03-policy-triage | 04-05 | 3 | QA-03 | T-4-19 | no averaging; stale/missing triage before any diff | unit + container-e2e | `npx vitest run src/anim-qa/__tests__/pack-verdict.spec.ts` + gate-e2e | ❌ W0 (04-05 T3) | ⬜ pending |
| theming-pure-fns | 04-06 | 4 | QA-04 | T-4-23 | slotize/applyTheme pure, no-mutation pins (D-20 costly) | unit | `npx vitest run src/anim-qa/__tests__/theming.spec.ts` | ❌ W0 (04-06 T1) | ⬜ pending |
| theme-page-masks-routing | 04-06 | 4 | QA-04 | T-4-13/T-4-22 | local wasm only; m5 denominator; routing by renderer_support | container-e2e + unit | `npm run qa:run -- npx vitest run --config vitest.qa.config.ts theming-e2e` | ❌ W0 (04-06 T2) | ⬜ pending |
| theming-e2e-both-paths | 04-06 | 4 | QA-04 | T-4-24 | theme:noop rejection; mask-vs-ink sanity; zero skips | container-e2e | `npm run qa:run -- npx vitest run --config vitest.qa.config.ts theming-e2e` | ❌ W0 (04-06 T3) | ⬜ pending |
| scaffold-manifest-builder | 04-07 | 4 | QA-01 | T-4-27 | deterministic renderer rows; flutter manifest-only | unit | `npx vitest run src/anim-qa/__tests__/scaffold-manifest.spec.ts` | ❌ W0 (04-07 T1) | ⬜ pending |
| scaffold-e2e-players | 04-07 | 4 | QA-01 | T-4-26 | 22 real passes; contradiction red test; no skips | container-e2e | `npm run qa:run -- npx vitest run --config vitest.qa.config.ts scaffold` | ❌ W0 (04-07 T2) | ⬜ pending |
| flake-proof-10x | 04-08 | 5 | QA-01 | T-4-30 | strict identity ×10 minus timestamp; counter logged | container-e2e | `npm run qa:run -- node scripts/qa-flake-proof.mjs` | ❌ W0 (04-08 T1) | ⬜ pending |
| qa-yml-workflow | 04-08 | 5 | QA-01 | T-4-05/T-4-29 | lock-parsed image; no hardcoded refs; verify.yml byte-intact | structural spec + git | `npx vitest run src/anim-qa/__tests__/qa-yml-gates.spec.ts` + `git status --porcelain .github/workflows/verify.yml` | ❌ W0 (04-08 T2) | ⬜ pending |
| qa-yml-hygiene-gates | 04-08 | 5 | QA-01 | T-4-29/T-4-31 | m13 token zero-occurrence; vacuous-green guard | unit (verify-collected) | `npx vitest run src/anim-qa/__tests__/qa-yml-gates.spec.ts` | ❌ W0 (04-08 T3) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.qa.config.ts` — dedicated project excluding `*.qa.spec.ts` from default run (D-24/B2: non collecté ≠ skippé)
- [ ] `qa-container.lock` — image tag + digest pin (D-01), consumed by `qa:run` and `qa.yml`
- [ ] `fixtures/qa/thresholds.json` + `fixtures/qa/dark-theme.json` — versioned QA configs (D-06/D-10)
- [ ] Calibration spike artifact (`docs/qa.md`) — precedes any pixel assertion (D-07/m11)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| human-verify gate on each new npm dep (playwright peer, pixelmatch, pngjs, @lottiefiles/dotlottie-web, lottie-react, @lottiefiles/dotlottie-vue) | D-09/D-27 | Established `checkpoint:human-verify` pattern (Phase 3 svgo+tsx) — legitimacy decision is human | Review pinned versions vs research legitimacy verdicts at plan/execute checkpoint |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60 s (unit tier)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
