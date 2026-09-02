---
phase: 3
slug: motion-compiler-svg-sanitizer
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-02
---

# Phase 3 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| npm registry -> project | Dependency surface entries (svgo runtime `^4.1.0`, tsx devDep `^4.23.13`) | packages / supply chain |
| Renderer/Translator (future) -> RenderSpec | Untrusted structured input crossing the zod boundary | structured specs |
| Compiler output -> LottieJSON gate | Emitted JSON re-validated before any return (COM-03) | Lottie JSON |
| Recipe params + resolved intensity -> emitter | Bounded inputs; amplitude scaling must stay in closed ranges | keyframe values |
| Golden bytes <-> compiler output | Silent format drift invalidates the rebuild doctrine | deterministic bytes |
| Adversarial SVG strings -> sanitizeSvg | Primary attack surface: SVG ships inside sold packs to third-party pages | raw SVG / XSS |
| Compiler output -> own gate | Self-consistency: producer and gate agree (no false rejects/accepts) | sanitized SVG |
| stdin lines -> server dispatch | Potentially hostile NDJSON lines; parse guarded, no eval | NDJSON envelope |
| Python client -> TS server | Process boundary; the envelope is the only legal channel | NDJSON envelope |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-03-SC | Tampering | npm installs (svgo, tsx) | high | mitigate | Pins `^4.1.0`/`^4.23.13` in package.json:17,23; `package-lock.json` committed so `npm ci` fails on drift; plan-time legitimacy gate (RESEARCH audit + blocking human-verify) | closed |
| T-03-01a | Repudiation | format.ts drift | medium | mitigate | `src/shared/format.ts` + `format.spec.ts` are the single committed numeric-format authority (D-23/D-24/D-35); all producers import this one module | closed |
| T-03-02a | Tampering | RenderSpecSchema | high | mitigate | `src/rpc/contracts/motion-compiler.schema.ts` — strictObject + closed ranges + superRefines (35 matched sites); rejection harness `render-spec-rejection.ts` + `rejection-cases.spec.ts` (ASVS V5) | closed |
| T-03-02b | Tampering | LottieJSONSchema | high | mitigate | Expression channel structurally impossible (hard reject of stray `x` key — schema.ts:321–332); pinned literals v/ddd/ty; unit gates 0..100 / scale >= 0 | closed |
| T-03-02c | Information Disclosure | schema docblocks | low | accept | Schemas carry no user data; naming mirrors Phase 1 contracts (D-13) — accepted at plan time | closed |
| T-03-03a | Tampering | fixtures/render-specs/*.json | medium | mitigate | `fixtures.spec.ts` re-parses every committed fixture through `RenderSpecSchema` + cross-refs at test time (fail-loud, never skip) | closed |
| T-03-03b | Tampering | catalogue.json edit | high | mitigate | Same-commit discipline (catalogue + embedded copy + recorded sha regenerated together); `catalogue.spec.ts` asserts schema-key parity / KEYFRAME_SHAPES–SHAPE_NAMES lockstep | closed |
| T-03-04a | Tampering/Elevation | sanitizeSvg gates (SAN-01/02/05) | high | mitigate | `sanitize.ts` collect-then-reject: four forbid-* collector plugins run BEFORE any mutation; reject (never clean), byte-stable rejection path; SVGO removeScripts as defense-in-depth | closed |
| T-03-04b | Information Disclosure | title/desc/meta emission | medium | mitigate | `meta.ts` deriveTitle/deriveDesc from `asset_id` + `recipe_id` only (D-18); meta constants; asserted by `pipeline.spec.ts` | closed |
| T-03-04c | Tampering | ID scheme | medium | mitigate | `plugins/stabilize-ids.ts` asserts D-32 2/3-segment scheme; no rewriting; ids built from asset_id pattern + tokens only | closed |
| T-03-04d | DoS | hostile RenderSpec values | low | mitigate | Closed ranges at schema (plan 03-02) + cross-refs at compile entry (D-05); local process, single operator | closed |
| T-03-05a | Tampering | expressions in emission path | high | mitigate | Schema-level structural reject (03-02) + `feature-gate.ts` defense-in-depth hard-reject (`unsupported_feature`); no bake path exists (D-33) | closed |
| T-03-05b | Tampering | negative stretch / 3D | medium | mitigate | Three independent layers: schema superRefine (scale >= 0) + feature-gate reject (3D `ks.ddd !== 0`) + transform-builder construction reject | closed |
| T-03-05c | DoS | degenerate amplitude (0 / range-min) | low | accept | Degenerate-but-valid poses allowed; non-dégénérescence (ink visible) gated per-golden in plan 03-06 — accepted at plan time | closed |
| T-03-06a | Tampering | golden regeneration in CI | medium | mitigate | `scripts/update-goldens.mjs:148–152` refuses under `CI=true`, exits 1 (D-37); CI compares only; same-commit discipline (D-25) | closed |
| T-03-06b | Repudiation | hidden nondeterminism (clocks/random/env) | high | mitigate | Prohibition P1 + `determinism.spec.ts` double-process spawn with `INTER_PROCESS_DELAY_MS = 1100` + three-way byte-compare catches state/time leaks (D-26) | closed |
| T-03-06c | Tampering | ID drift on sanitized output | medium | mitigate | `ids.spec.ts` asserts sanitized-output scheme + cross-regeneration equality (cleanupIds neutralized upstream) | closed |
| T-03-07a | Tampering/Elevation | XSS via SVG (script/handlers/javascript: URIs) | high | mitigate | Adversarial matrix in `sanitize.spec.ts` (~50 case matches) + collect-before-mutate order + removeScripts preset as defense-in-depth; rejection, never silent cleaning | closed |
| T-03-07b | Tampering | raster/base64 smuggling | medium | mitigate | `plugins/forbid-raster.ts` + forbid-raster matrix cases (image element + base64 data URIs) — SAN-02 | closed |
| T-03-07c | Tampering | ID renames by optimizer | medium | mitigate | cleanupIds override in `config.ts` + id-preservation regression in `svgo-regression.spec.ts` (Pitfall 6) | closed |
| T-03-07d | Information Disclosure | a11y elements stripped silently | low | mitigate | `svgo-regression.spec.ts:88` — title + desc survival regression (Pitfall 5); derived-only content (D-18) upstream | closed |
| T-03-07e | Tampering | gate bypass via case/prefix tricks | medium | mitigate | `plugins/forbid-structure.ts` allow-list (case-sensitive exact names) + prefixed-name rejection matrix cases; `prefixIds` NOT used | closed |
| T-03-08a | DoS/Tampering | hostile NDJSON line | medium | mitigate | `server.ts:231–236` parse in try/catch -> `protocol_error` without crash (D-36); server survival asserted by `server.spec.ts`; zod at every method entry (ASVS V5) | closed |
| T-03-08b | Tampering | LLM dependency sneaking into the backbone | high | mitigate | `no-llm-imports.spec.ts` COM-02 static-scan gate (`FORBIDDEN_LLM_SDK_NAMES`: langchain/openai/anthropic) with self-tested scanner teeth; prohibition P2 | closed |
| T-03-08c | Information Disclosure | error details leakage | low | accept | details carries zod paths/violations only — structured, no stacks on stdout (stacks -> stderr, local single-operator process) — accepted at plan time | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-1 | T-03-02c | Schemas carry no user data; docblock naming mirrors Phase 1 contracts (D-13) | Plan-time disposition (03-02-PLAN) | 2026-09-02 |
| AR-2 | T-03-05c | Degenerate-but-valid amplitude poses allowed; ink-visibility gated per-golden in plan 03-06 | Plan-time disposition (03-05-PLAN) | 2026-09-02 |
| AR-3 | T-03-08c | Error `details` carries zod paths/violations only; stacks to stderr; local single-operator process | Plan-time disposition (03-08-PLAN) | 2026-09-02 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-02 | 25 | 25 | 0 | opencode orchestrator (L1 grep-depth verification, ASVS L1, register authored at plan time) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-02
