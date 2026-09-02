---
phase: 3
slug: motion-compiler-svg-sanitizer
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-31
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=dot` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=dot`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | — (legitimacy gate) | T-03-SC | Package legitimacy human gate | checkpoint | — (human approval recorded in summary) | — | ✅ approved (SUMMARY 03-01) |
| 03-01-02 | 01 | 1 | — (infra) | T-03-SC | Pinned installs + lockfile | CLI | `npm ls svgo tsx` + svgo/tsx import smoke | ✅ (svgo@4.1.0, tsx@4.23.13) | ✅ green |
| 03-01-03 | 01 | 1 | COM-01 | T-03-01a | fmt() D-35 matrix + deterministic writer | unit | `npx vitest run src/shared/format.spec.ts` | ✅ | ✅ green |
| 03-02-01 | 02 | 2 | COM-03 | T-03-02a | RenderSpec closed ranges/superRefines | unit (tdd) | `npx vitest run src/rpc/contracts/motion-compiler.spec.ts src/rpc/contracts/sanitizer.spec.ts` | ✅ | ✅ green |
| 03-02-02 | 02 | 2 | COM-03, COM-04 | T-03-02b | LottieJSON gate pins + rejects | unit (tdd) | `npx vitest run src/rpc/contracts/motion-compiler.spec.ts` | ✅ | ✅ green |
| 03-02-03 | 02 | 2 | COM-03 | T-03-02a | D-29 harness expect_code parity | parametrized | `npx vitest run src/rpc/contracts` | ✅ | ✅ green |
| 03-03-01 | 03 | 3 | — (D-03×D-05) | T-03-03b | Galerie decision checkpoint | checkpoint | — (choice recorded in summary) | — | ✅ option-b recorded (SUMMARY 03-03) |
| 03-03-02 | 03 | 3 | COM-01 | T-03-03a | 11 fixtures schema+cross-ref consistent | unit | `npx vitest run src/motion-compiler/__tests__/fixtures.spec.ts` | ✅ | ✅ green |
| 03-04-01 | 04 | 4 | COM-03, SAN-03, SAN-04, SAN-05 | T-03-04a-d | TRACER: compile→gate→sanitize→IDs end-to-end | integration (tracer) | `npx vitest run src/motion-compiler/__tests__/pipeline.spec.ts` | ✅ | ✅ green |
| 03-05-01 | 05 | 5 | COM-04 | T-03-05a | 10 keyframe shapes exhaustive + units | unit | `npx vitest run src/motion-compiler/__tests__/keyframe-emitter.spec.ts` | ✅ | ✅ green |
| 03-05-02 | 05 | 5 | COM-04 | — | 5 shape generators + pose D-15 | unit | `npx vitest run src/motion-compiler/__tests__/shape-builder.spec.ts` | ✅ | ✅ green |
| 03-05-03 | 05 | 5 | COM-04 | T-03-05a/b | Feature gate hard rejects + svg-only forced | unit | `npx vitest run src/motion-compiler/__tests__/feature-gate.spec.ts` | ✅ | ✅ green |
| 03-06-01 | 06 | 6 | COM-01 | T-03-06a | goldens:update CI guard + 11 goldens | script gate | `node scripts/update-goldens.mjs` + `CI=true node scripts/update-goldens.mjs` (refuses) | ✅ | ✅ green (refuses sous CI, vérifié 2026-09-02) |
| 03-06-02 | 06 | 6 | COM-01, SAN-03 | T-03-06b/c | Golden byte-compare + double-spawn + stable IDs | golden/integration | `npx vitest run src/motion-compiler/__tests__/compiler.spec.ts src/motion-compiler/__tests__/determinism.spec.ts src/motion-compiler/__tests__/ids.spec.ts` | ✅ | ✅ green |
| 03-07-01 | 07 | 6 | SAN-05 | T-03-07a | Allow-list + assertion-only IDs + order | unit | `npx vitest run src/svg-sanitizer` | ✅ | ✅ green |
| 03-07-02 | 07 | 6 | SAN-01, SAN-02, SAN-05 | T-03-07a/b/e | Adversarial rejection matrix (≥16 cases) | parametrized | `npx vitest run src/svg-sanitizer/__tests__/sanitize.spec.ts` | ✅ | ✅ green |
| 03-07-03 | 07 | 6 | SAN-04 | T-03-07c/d | ADR-02 regression + self-consistency/iso/ink | regression | `npx vitest run src/svg-sanitizer/__tests__/svgo-regression.spec.ts src/svg-sanitizer/__tests__/self-consistency.spec.ts` | ✅ | ✅ green |
| 03-08-01 | 08 | 7 | COM-03 | T-03-08a | NDJSON server envelope + closed codes | unit | `npx vitest run src/rpc` | ✅ | ✅ green |
| 03-08-02 | 08 | 7 | — (D-30 §6.6) | T-03-08a | Python→TS integration incl. expect_code wire parity | integration | `python -m pytest tests/rpc/test_rpc_integration.py -q` | ✅ | ✅ green (22/22 via `.venv\Scripts\python.exe`) |
| 03-08-03 | 08 | 7 | COM-02 | T-03-08b | No-LLM grep gate with self-tested teeth | static-scan | `npx vitest run src/rpc/contracts/no-llm-imports.spec.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Test stubs for COM-01..COM-04, SAN-01..SAN-05 (golden files, rejection matrix, determinism double-run)
- [x] Shared fixtures (RenderSpec samples per recipe)
- [x] `svgo` + `tsx` devDeps install (research-identified infra gap)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| — | — | All phase behaviors have automated verification candidates | — |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s (full suite : 15,1 s mesuré)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-09-02 (audit nyquist — 0 gap)

---

## Validation Audit 2026-09-02

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

**Preuves d'exécution (2026-09-02) :**
- vitest full suite : **603/603 green** (25 fichiers, 15,13 s) — couvre toutes les commandes `npx vitest run` de la map
- pytest integration : **22/22 green** (`.venv\Scripts\python.exe -m pytest tests/rpc/test_rpc_integration.py -q`, 25,2 s) — tâche 03-08-02
- Golden guard : `CI=true node scripts/update-goldens.mjs` **refuse** (exit 1, D-37) — tâche 03-06-01
- Infra : `npm ls svgo tsx` → svgo@4.1.0, tsx@4.23.13 — tâche 03-01-02
- Checkpoints humains : T-03-SC légitimité **APPROVED** (SUMMARY 03-01), galerie **option-b** enregistrée 2026-09-01 (SUMMARY 03-03)

**Note environnement :** `python` nu résout vers un venv hermes sans pytest — utiliser `.venv\Scripts\python.exe` (le CI GitHub Actions utilise le python du runner, non affecté).

Aucun test généré : tous les candidats automatisés de la stratégie existent et tournent au vert. `nyquist_compliant: true`.
