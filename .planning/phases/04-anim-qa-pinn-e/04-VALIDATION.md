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
| (filled by planner — one row per task lifting a QA-0x hook from RESEARCH § Validation Architecture) | | | QA-01..QA-04 | — | N/A (no auth/network surface; path-injection-free RPC request D-18) | unit / container-e2e | `npx vitest run` / `npm run qa:run` | ❌ W0 | ⬜ pending |

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
