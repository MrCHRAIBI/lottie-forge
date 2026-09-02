---
milestone: 1
audited: 2026-09-02T22:20:00+01:00
status: gaps_found
scores:
  requirements: 21/29
  phases: 3/5
  integration: 11/11
  flows: 1/1
nyquist:
  compliant_phases: ["01", "02", "03"]
  partial_phases: []
  not_validated_phases: []
  missing_phases: ["04", "05"]
  overall: compliant
gaps:
  requirements:
    - id: "QA-01"
      status: "unsatisfied"
      phase: "4"
      claimed_by_plans: []
      completed_by_plans: []
      verification_status: "missing"
      evidence: "Phase 4 (Anim QA pinnée) non démarrée — aucun plan, aucun code, aucune VERIFICATION.md. Surface d'intégration prête (RPC framing + CompileResult/SanitizeReport)."
    - id: "QA-02"
      status: "unsatisfied"
      phase: "4"
      claimed_by_plans: []
      completed_by_plans: []
      verification_status: "missing"
      evidence: "Phase 4 non démarrée"
    - id: "QA-03"
      status: "unsatisfied"
      phase: "4"
      claimed_by_plans: []
      completed_by_plans: []
      verification_status: "missing"
      evidence: "Phase 4 non démarrée"
    - id: "QA-04"
      status: "unsatisfied"
      phase: "4"
      claimed_by_plans: []
      completed_by_plans: []
      verification_status: "missing"
      evidence: "Phase 4 non démarrée"
    - id: "MFT-01"
      status: "unsatisfied"
      phase: "5"
      claimed_by_plans: []
      completed_by_plans: []
      verification_status: "missing"
      evidence: "Phase 5 (Manifest Store & checkpointer) non démarrée. Slots ContentHashes 4 champs prêts côté contrats."
    - id: "MFT-02"
      status: "unsatisfied"
      phase: "5"
      claimed_by_plans: []
      completed_by_plans: []
      verification_status: "missing"
      evidence: "Phase 5 non démarrée — disposition F-1 (2026-08-31) : le plan MFT-02 doit livrer le test de composition fixture→sha→pin→manifest"
    - id: "MFT-03"
      status: "unsatisfied"
      phase: "5"
      claimed_by_plans: []
      completed_by_plans: []
      verification_status: "missing"
      evidence: "Phase 5 non démarrée"
    - id: "ORC-04"
      status: "unsatisfied"
      phase: "5"
      claimed_by_plans: []
      completed_by_plans: []
      verification_status: "missing"
      evidence: "Phase 5 non démarrée (checkpointer langgraph-checkpoint-sqlite, crash-recovery run ×50)"
  integration: []
  flows: []
tech_debt:
  - phase: 01-contrats-de-donn-es-fronti-re-pydantic-zod-reconstruction
    items:
      - "OUVERT (humain) : premier run GitHub Actions du workflow `verify` (12 étapes vertes, `total skipped: 0`) — tout le reste prouvé localement (chaîne 15→85→329 puis 520 pytest / 603 vitest, gate zéro-skip prouvée exit 0 ET exit 1). L'entrée Complete de la ROADMAP n'en dépend pas (décision utilisateur 2026-08-31)."
  - phase: 03-motion-compiler-svg-sanitizer
    items:
      - "WARNING (Finding 1, STY-01/STY-03 côté TS) : le contenu de style.yaml est dupliqué en pins inline hardcodés sur ~10 sites TS (`pinnedStyle()` server.ts:133, compile-stdin.ts:73, pipeline.spec.ts:51 + helpers de test) — verbatim-identiques aujourd'hui (vérifié champ par champ) mais sans test d'égalité pin↔fixture, et `compile()` ne cross-checke pas `style_ref` vs `style.style_version`. La gate STY-03 ne couvre que les pins AssetSpec côté Python. Disposition : hardening recommandé avant Phase 7 — assert pinnedStyle() == spec exportée par le bridge + check de cohérence dans compile()."
      - "WARNING (Finding 2, MOT-01/MOT-02 fidélité de test) : fixtures.spec.ts:40-105 maintient un miroir CATALOGUE à la main sans check de drift contre catalogue.json (le runtime compile, lui, utilise le vrai catalogue — compiler.ts:80,166-198). Disposition : un test d'égalité contre le fichier committé suffirait."
      - "Doc drift (Finding 3) : make-render-spec.ts:164 affirme que #1c57cb est un token de palette de style.yaml — il n'y est pas (ink/accent/surface/success). Zéro impact fonctionnel (D-09 neutral côté Lottie, substitution `nm` en Phase 8). Corriger le docblock."
      - "Doc drift (Finding 4) : 03-08-SUMMARY.md annonce « 15 render-spec.json rejection cases » ; le fichier en contient 14 (22 tests d'intégration = 14 paramétrés + 8 autres — comptage interne cohérent, résumé off-by-one)."
  - phase: integration (F-1..F-4, reconduits)
    items:
      - "F-1 (DM-04/STY-01/MOT-04) : composition fixture→sha→pin→manifest prouvée piecewise — clôture planifiée en Phase 5 (MFT-02). HOLDS."
      - "F-2 (DM-02/MOT-03) : redondance de détection de drift INTENTIONNELLE dans vocabulary.spec.ts — bump de vocabulaire = édition same-commit 3 fichiers. Contraignant pour les agents Phase 6. HOLDS."
      - "F-3 (STY-03) : tests de bump hardcodent 1.0.0 par design (garde permanente couvrant le sens live-fixture). HOLDS."
      - "F-4 (DM-05) : `fixtures/bridge/` gitignoré DÉFENDU — comparaisons committed-vs-exported du harnais bridge. Ne jamais « corriger ». HOLDS."
---

# Milestone 1 — Audit Report : Spine déterministe (sans agents LLM)

**Milestone:** M1 — Phases 1–5 (contrats → style/catalogue → compiler/sanitizer → Anim QA → manifest store)
**Audited:** 2026-09-02 (ré-audit post Phase 3 ; audit précédent : 2026-08-31, post Phases 1–2)
**Status:** ⚠ **gaps_found** — FAIL gate déclenchée : 8 exigences unsatisfied (Phases 4–5 non démarrées). Aucun gap inattendu, aucun défaut de câblage, aucune exigence orpheline.

**Verdict intégration (gsd-integration-checker) :** *integration-intact* — 11/11 seams landed WIRED avec preuves file:line, 0 export orphelin, 0 connexion manquante, 0 flow cassé, 0 finding critique (2 warnings mineurs + 2 doc-drift). L'E2E réalisable a été **vérifié en live** pendant l'audit : suite RPC over-the-wire 22/22 verte (cold-start compile du fixture committé, sanitize accept/reject, closure D-29 14/14 `error.code == expect_code`, survie D-36).

## Scores

| Dimension | Score | Détail |
|-----------|-------|--------|
| Requirements | **21/29** | 21 satisfaits (DM×5, STY×3, MOT×4, COM×4, SAN×5) · 8 unsatisfied (QA×4, MFT×3, ORC-04 — exactement les phases 4–5 non exécutées) |
| Phases | **3/5** | Phase 1 ✓ (human_needed : 1 item CI, 0 code gap) · Phase 2 ✓ passed 5/5 SC · Phase 3 ✓ passed 9/9 req · Phases 4–5 non démarrées |
| Integration | **11/11** | Toutes les seams des phases landed câblées (P1↔P2, P1↔P3, P2↔P3) + 2 seams READY vers P4/P5 |
| Flows | **1/1** | Le seul flow M1 exécutable (fixture style → sha → RenderSpec → compile → re-validate → sanitize → IDs stables, y compris over-the-wire) complet et vérifié live |

## Definition of Done du milestone (ROADMAP)

> « Un asset peut être compilé, sanitisé, QA-isé et persisté à partir de specs typées figées (RenderSpec fixtures), sans aucun appel LLM. »

**État : partiellement atteint.** Compilé ✓ (Phase 3, goldens byte-exact, zéro LLM prouvé par gate COM-02) · Sanitisé ✓ (Phase 3, gate dure + ADR-02) · QA-isé ✗ (Phase 4 non démarrée) · Persisté ✗ (Phase 5 non démarrée).

## Requirements — 3-source cross-reference

Sources : VERIFICATION.md par phase × SUMMARY frontmatter (`requirements-completed`) × table Traceability REQUIREMENTS.md.

| REQ-ID | Phase | VERIFICATION | SUMMARY | REQUIREMENTS.md | Statut final |
|--------|-------|--------------|---------|-----------------|--------------|
| DM-01 | 1 | passed (8/8 truths) | listed (01-01) | `[x]` Complete | ✅ satisfied |
| DM-02 | 1 | passed | listed (01-02) | `[x]` Complete | ✅ satisfied |
| DM-03 | 1 | passed | listed (01-03) | `[x]` Complete | ✅ satisfied |
| DM-04 | 1 | passed | listed (01-04) | `[x]` Complete | ✅ satisfied |
| DM-05 | 1 | passed | listed (01-01/03/04/05) | `[x]` Complete | ✅ satisfied |
| STY-01 | 2 | passed (5/5 SC) | listed (02-01, 02-03) | `[x]` Complete | ✅ satisfied (côté TS : voir Finding 1 en tech debt) |
| STY-02 | 2/6/7 | passed (scope phase : type delta-only) | listed (02-02) | `[x]` Complete | ✅ satisfied (M1) — complétion Translator explicitement Phase 7 |
| STY-03 | 2 | passed | listed (02-05) | `[x]` Complete | ✅ satisfied (gate fixture-level Python ; extension TS = tech debt Finding 1) |
| MOT-01 | 2 | passed | listed (02-04, 02-05) | `[x]` Complete | ✅ satisfied |
| MOT-02 | 2/6 | passed (fermeture structurelle) | listed (02-04, 02-05) | `[x]` Complete | ✅ satisfied (M1) — côté agent Phase 6 |
| MOT-03 | 2 | passed | listed (02-01, 02-04, 02-05) | `[x]` Complete | ✅ satisfied |
| MOT-04 | 2 | passed | listed (02-03, 02-04, 02-06) | `[x]` Complete | ✅ satisfied |
| COM-01 | 3 | passed (9/9 req) | listed (03-01, 03-06) | `[x]` Complete | ✅ satisfied |
| COM-02 | 3 | passed | listed (03-08) | `[x]` Complete | ✅ satisfied (gate scanne tout `src/**` y compris code Phase 3 — re-vérifié pendant l'audit) |
| COM-03 | 3 | passed | listed (03-02, 03-04) | `[x]` Complete | ✅ satisfied |
| COM-04 | 3 | passed | listed (03-02, 03-05) | `[x]` Complete | ✅ satisfied |
| SAN-01 | 3 | passed | listed (03-07) | `[x]` Complete | ✅ satisfied |
| SAN-02 | 3 | passed | listed (03-07) | `[x]` Complete | ✅ satisfied |
| SAN-03 | 3 | passed | listed (03-04, 03-06) | `[x]` Complete | ✅ satisfied |
| SAN-04 | 3 | passed | listed (03-04, 03-07) | `[x]` Complete | ✅ satisfied |
| SAN-05 | 3 | passed | listed (03-04, 03-07) | `[x]` Complete | ✅ satisfied |
| QA-01..04 | 4 | missing (phase non démarrée) | missing | `[ ]` Pending | ❌ unsatisfied |
| MFT-01..03 | 5 | missing (phase non démarrée) | missing | `[ ]` Pending | ❌ unsatisfied |
| ORC-04 | 5 | missing (phase non démarrée) | missing | `[ ]` Pending | ❌ unsatisfied |

**Orphan detection :** aucun — les 29 REQ-IDs du milestone sont mappés dans la traceability et tous figurent dans au moins une source. Les 8 unsatisfied le sont parce que leurs phases (4–5) ne sont pas encore exécutées — état planned du milestone, pas un défaut de traçabilité.

**Hors périmètre M1 :** LIC-01/LIC-02 + QA-05 (Phase 10 ; la part structurelle licence est déjà livrée et vérifiée en Phase 1). STY-02 Translator (Phase 7). ORC-01/02/03/05 (Phase 7).

## Phases

| Phase | Statut | VERIFICATION | Constat |
|-------|--------|--------------|---------|
| 1 — Contrats & frontière Pydantic↔zod | ✅ Complete (2026-08-29) | `01-VERIFICATION.md` — human_needed, 8/8 truths, **0 code gap** | 1 item humain résiduel : premier run GitHub Actions de `verify` — tout le reste prouvé localement ; les suites ont encore grossi depuis (520 pytest / 603 vitest vertes en Phase 3) |
| 2 — Style verrouillé & catalogue | ✅ Complete (2026-08-31) | `02-VERIFICATION.md` — **passed**, 5/5 SC, 7/7 req | Re-vérifié comportementalement lors de sa vérification (472 pytest / 150 vitest / tsc clean) ; aucune régression détectée par le checker après l'atterrissage de la Phase 3 |
| 3 — Motion Compiler & SVG Sanitizer | ✅ Complete (2026-09-02) | `03-VERIFICATION.md` — **passed**, 9/9 req (COM×4 + SAN×5) | 11 goldens byte-exact, déterminisme double-spawn 3-voies, RPC 22/22 live, gate COM-02 repo-wide, zéro anti-pattern, zéro vérification humaine requise |
| 4 — Anim QA pinnée | ⬜ Not started | — | **Blocker M1** — surface READY (RPC framing, CompileResult/SanitizeReport, extension `anim_qa.run`) |
| 5 — Manifest Store & checkpointer | ⬜ Not started | — | **Blocker M1** — slots ContentHashes 4 champs prêts ; disposition F-1 à honorer au planning (test de composition MFT-02) |

## Cross-Phase Integration (gsd-integration-checker)

**Verdict : integration-intact.** Les seams Phase 1↔2 vérifiées à l'audit précédent tiennent toujours après l'atterrissage de la Phase 3 (aucune régression) ; les nouvelles seams Phase 2↔3 et Phase 1↔3 sont câblées.

| Seam | Verdict | Preuve |
|------|---------|--------|
| P1 vocabulary → P2 catalogue (import RecipeId/ThemeAnchorId, jamais redéclarés) | WIRED | catalogue.py:20 · scans same-commit test_vocabulary.py:170,288 |
| P1 asset → P2 stale_pins (STYLE_REF_PATTERN importé, rsplit) | WIRED | stale_pins.py:40-41,145 |
| P1 hashes → P2 loaders/prompts (régime sha256 unique) | WIRED | loading/style.py:98 ← loading/catalogue.py:37-40 ← prompts/render.py:36 |
| P2 prompts → P2 fixtures (verbatim + hash == catalogue_sha256) | WIRED | test_prompt_fixture.py:32,108,270 (357 pytest verts live) |
| P1 harness → P3 rejections (additif expect_code, enum fermé) | WIRED | rejection-cases.ts:140-147 · render-spec.json 14/14 avec expect_code |
| P2 catalogue → P3 compiler (chargé du fixture Phase 2, joint-validated, cross-refs runtime sur le VRAI catalogue) | WIRED | server.ts:153-157 · compiler.ts:73-87,166-198 · catalogue.spec.ts:51-56 |
| P2 style.yaml → P3 server/compiler | WIRED (fragile — Finding 1) | server.ts:133-150 · compile-stdin.ts:73-84 — pins inline verbatim-identiques, pas de check de drift |
| P2 catalogue/style → P3 fixtures RenderSpec (11 fichiers, cross-ref D-05) | WIRED | fixtures/render-specs/*.json · fixtures.spec.ts (comptage exact 11, schema parse, LF) |
| P3 compiler → P3 sanitizer (emit → SanitizeRequest{asset_id, svg}, zéro violation sur les 11, IDs stables sur sortie SANITISÉE) | WIRED | self-consistency.spec.ts:174-180 · ids.spec.ts:254-280 · stabilize-ids.ts:9-12 |
| P1 vocabulary → P3 contracts (RoleSchema = ThemeAnchorId ∪ {"neutral"}, import unique) | WIRED | motion-compiler.schema.ts:51-68 · imports catalogue/asset-spec/recipe.schema.ts:3 |
| P1 ContentHashes → P4/P5 (futur) | READY | asset-spec.schema.ts:62-66 · test_prompt_fixture.py:310 |
| CI (P1↔P2) → P3 code (verify.yml inchangé, étapes 08–10 collectent tout) | WIRED | verify.yml steps 08–10, 12 |
| P3 → P4 (futur : RPC framing + client transport-only) | READY | lottie_forge/rpc/client.py · 03-08-SUMMARY affects-block |

### E2E Flow (M1-so-far)

**Flow : fixture style → sha → pin → RenderSpec → compile → re-validate → sanitize → IDs stables — COMPLET, vérifié live (22/22 over-the-wire).**

| Segment | Statut | Preuve |
|---------|--------|--------|
| style.yaml → sha256 (LF-normalisé) | ✅ complet | loading/style.py:164-186 |
| sha → pin AssetSpec → composition manifest | ⏸ différé par design (F-1) → Phase 5 MFT-02 ; slots câblés | ContentHashesSchema 4 champs |
| RenderSpec fixture → compile (même compile() que production) | ✅ complet | compiler.spec.ts 11 byte-equal + determinism.spec.ts 3-voies double-spawn |
| compile → re-validation LottieJSON en dernier acte + feature gate | ✅ complet | compiler.ts:136-146 |
| → sanitize → IDs stables | ✅ complet | self-consistency + ids.spec.ts (SAN-03) |
| **Over the wire** (Python → NDJSON RPC) | ✅ complet — **22/22 passé live pendant l'audit** | tests/rpc/test_rpc_integration.py:100-190 |

**Flows bloqués sur phases non démarrées (READY, pas cassés) :** QA-01..04 (Phase 4 consommera CompileResult via RPC) ; MFT-01..03/ORC-04 (Phase 5 persistera ContentHashes + QAReport).

## Nyquist Coverage (§5.5 — hook validate-phase actif)

| Phase | VALIDATION.md | Statut | Classification |
|-------|---------------|--------|----------------|
| 01 | présent | `status: validated`, `nyquist_compliant: true`, `wave_0_complete: true` | ✅ COMPLIANT (reconstruit post-hoc, State B) |
| 02 | présent | `status: validated`, `nyquist_compliant: true`, `wave_0_complete: true` | ✅ COMPLIANT (reconstruit post-hoc, State B) |
| 03 | présent | `status: validated`, `nyquist_compliant: true`, `wave_0_complete: true` | ✅ COMPLIANT |
| 04–05 | absents | — | ❌ MISSING (phases non démarrées — se résoudra via validate-phase à l'exécution) |

**Overall : compliant** (toutes les phases démarrées sont compliant).

## Tech Debt & Deferred (non bloquant)

**Phase 01 :**
- 1 item de vérification humaine ouvert : premier run GitHub Actions de `verify` (tracé depuis 2026-08-31, hors dépendance du statut Complete)

**Phase 03 :**
- Finding 1 (warning) : style.yaml dupliqué en pins inline TS (~10 sites), pas de test d'égalité pin↔fixture, pas de cross-check `style_ref`↔`style_version` côté TS — hardening recommandé avant Phase 7
- Finding 2 (warning) : miroir CATALOGUE manuel dans fixtures.spec.ts sans check de drift (impact test-only, le runtime utilise le vrai catalogue)
- Finding 3 (doc) : docblock make-render-spec.ts:164 cite #1c57cb comme token de palette — incorrect, sans impact
- Finding 4 (doc) : 03-08-SUMMARY « 15 cases » vs 14 réelles dans render-spec.json

**Intégration (F-1..F-4 reconduits, dispositions inchangées — HOLDS) :** F-1 se clôt en Phase 5 (MFT-02) ; F-2 contraignant same-commit pour Phase 6 ; F-3 par design ; F-4 intouchable.

**Total : 6 items mineurs sur 3 sources — zéro dette de code, zéro stub, zéro anti-pattern (scans TBD/FIXME/stub : 0 hits sur les 3 phases).**

## Conclusion

Le spine livré (Phases 1–3) est **sain et intégré** : 21 exigences satisfaites avec triple-source concordante, 11/11 seams câblées avec preuves file:line, flow E2E complet vérifié live (22/22), dette quasi nulle (2 warnings de hardening TS + 3 items doc). Le milestone M1 dans son ensemble **n'atteint pas encore sa définition de done** : les Phases 4 (Anim QA) et 5 (store/checkpointer) restent à exécuter — 8 exigences en attente, exactement le travail planifié restant. Aucun gap inattendu, aucune exigence orpheline, aucune régression des phases antérieures.

---

_Audited: 2026-09-02T22:20:00+01:00_
_Auditor: opencode (gsd audit-milestone) · Integration checker: gsd-integration-checker (verdict: integration-intact)_
