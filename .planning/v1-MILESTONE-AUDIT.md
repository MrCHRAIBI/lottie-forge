---
milestone: 1
audited: 2026-08-31T04:30:00Z
status: gaps_found
scores:
  requirements: 12/29
  phases: 2/5
  integration: 17/17
  flows: 1/1
nyquist:
  compliant_phases: ["02"]
  partial_phases: []
  not_validated_phases: []
  missing_phases: ["01", "03", "04", "05"]
  overall: partial
gaps:
  requirements:
    - id: "COM-01"
      status: "unsatisfied"
      phase: "3"
      claimed_by_plans: []
      completed_by_plans: []
      verification_status: "missing"
      evidence: "Phase 3 (Motion Compiler & SVG Sanitizer) non démarrée — aucun plan, aucun code, aucune VERIFICATION.md"
    - id: "COM-02"
      status: "unsatisfied"
      phase: "3"
      claimed_by_plans: []
      completed_by_plans: []
      verification_status: "missing"
      evidence: "Phase 3 non démarrée"
    - id: "COM-03"
      status: "unsatisfied"
      phase: "3"
      claimed_by_plans: []
      completed_by_plans: []
      verification_status: "missing"
      evidence: "Phase 3 non démarrée"
    - id: "COM-04"
      status: "unsatisfied"
      phase: "3"
      claimed_by_plans: []
      completed_by_plans: []
      verification_status: "missing"
      evidence: "Phase 3 non démarrée"
    - id: "SAN-01"
      status: "unsatisfied"
      phase: "3"
      claimed_by_plans: []
      completed_by_plans: []
      verification_status: "missing"
      evidence: "Phase 3 non démarrée"
    - id: "SAN-02"
      status: "unsatisfied"
      phase: "3"
      claimed_by_plans: []
      completed_by_plans: []
      verification_status: "missing"
      evidence: "Phase 3 non démarrée"
    - id: "SAN-03"
      status: "unsatisfied"
      phase: "3"
      claimed_by_plans: []
      completed_by_plans: []
      verification_status: "missing"
      evidence: "Phase 3 non démarrée"
    - id: "SAN-04"
      status: "unsatisfied"
      phase: "3"
      claimed_by_plans: []
      completed_by_plans: []
      verification_status: "missing"
      evidence: "Phase 3 non démarrée"
    - id: "SAN-05"
      status: "unsatisfied"
      phase: "3"
      claimed_by_plans: []
      completed_by_plans: []
      verification_status: "missing"
      evidence: "Phase 3 non démarrée"
    - id: "QA-01"
      status: "unsatisfied"
      phase: "4"
      claimed_by_plans: []
      completed_by_plans: []
      verification_status: "missing"
      evidence: "Phase 4 (Anim QA pinnée) non démarrée"
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
      evidence: "Phase 5 (Manifest Store & checkpointer) non démarrée"
    - id: "MFT-02"
      status: "unsatisfied"
      phase: "5"
      claimed_by_plans: []
      completed_by_plans: []
      verification_status: "missing"
      evidence: "Phase 5 non démarrée"
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
      evidence: "Phase 5 non démarrée (checkpointer langgraph-checkpoint-sqlite)"
  integration: []
  flows: []
---

# Milestone 1 — Audit Report : Spine déterministe (sans agents LLM)

**Milestone:** M1 — Phases 1–5 (contrats → style/catalogue → compiler/sanitizer → Anim QA → manifest store)
**Audited:** 2026-08-31
**Status:** ⚠ **gaps_found** — FAIL gate déclenchée : 17 exigences unsatisfied (Phases 3–5 non exécutées)

**Verdict intégration (gsd-integration-checker) :** *integration-intact* — 17/17 seams WIRED avec preuves file:line, 0 export orphelin, 0 connexion manquante, 0 flow cassé, 0 finding critique. L'E2E réalisable aujourd'hui (fixture style → sha → pin AssetSpec → ContentHashes → PackManifest → boucle prompt-sha) a été **vérifié en live** (probe directe), pas seulement par lecture de tests.

## Scores

| Dimension | Score | Détail |
|-----------|-------|--------|
| Requirements | **12/29** | 12 satisfaits (DM×5, STY×3, MOT×4) · 17 unsatisfied (COM×4, SAN×5, QA×4, MFT×3, ORC-04) |
| Phases | **2/5** | Phase 1 ✓ (human_needed : 1 item CI) · Phase 2 ✓ passed · Phases 3–5 non démarrées |
| Integration | **17/17** | Toutes les seams Phase 1↔2 câblées, zéro constante re-dérivée |
| Flows | **1/1** | Le seul flow M1 existant (fixture→manifest) complet, vérifié live |

## Requirements — 3-source cross-reference

Sources : VERIFICATION.md par phase × SUMMARY frontmatter (`requirements-completed`) × table Traceability REQUIREMENTS.md.

| REQ-ID | Phase | VERIFICATION | SUMMARY | REQUIREMENTS.md | Statut final |
|--------|-------|--------------|---------|-----------------|--------------|
| DM-01 | 1 | passed | listed | `[x]` | ✅ satisfied |
| DM-02 | 1 | passed | listed | `[x]` | ✅ satisfied |
| DM-03 | 1 | passed | listed | `[ ]` ⚠ | ✅ satisfied (checkbox à mettre à jour) |
| DM-04 | 1 | passed | listed | `[x]` | ✅ satisfied |
| DM-05 | 1 | passed | listed | `[x]` | ✅ satisfied |
| STY-01 | 2 | passed | listed | `[x]` | ✅ satisfied |
| STY-02 | 2/6/7 | passed (scope phase : type delta-only) | listed | `[x]` | ✅ satisfied (M1) — complétion Translator explicitement Phase 7 |
| STY-03 | 2 | passed | listed | `[x]` | ✅ satisfied |
| MOT-01 | 2 | passed | listed | `[x]` | ✅ satisfied |
| MOT-02 | 2/6 | passed (fermeture structurelle) | listed | `[x]` | ✅ satisfied (M1) — côté agent Phase 6 |
| MOT-03 | 2 | passed | listed | `[x]` | ✅ satisfied |
| MOT-04 | 2 | passed | listed | `[x]` | ✅ satisfied |
| COM-01..04 | 3 | missing | missing | `[ ]` | ❌ unsatisfied |
| SAN-01..05 | 3 | missing | missing | `[ ]` | ❌ unsatisfied |
| QA-01..04 | 4 | missing | missing | `[ ]` | ❌ unsatisfied |
| MFT-01..03 | 5 | missing | missing | `[ ]` | ❌ unsatisfied |
| ORC-04 | 5 | missing | missing | `[ ]` | ❌ unsatisfied |

**Orphan detection :** aucun — les 29 REQ-IDs du milestone sont mappés dans la traceability et aucun n'est absent de toutes les VERIFICATIONs *sans* avoir une phase assignée. Les 17 unsatisfied le sont parce que leurs phases (3–5) ne sont pas encore exécutées — état planned du milestone, pas un défaut de traçabilité.

**Hors périmètre M1 :** LIC-01/LIC-02 (Phase 10 ; la part structurelle est déjà livrée et vérifiée en Phase 1 — gate Literal + belt anti-abonnement des deux côtés). QA-05 (Phase 10). STY-02 Translator (Phase 7). ORC-01/02/03/05 (Phase 7).

## Phases

| Phase | Statut | VERIFICATION | Constat |
|-------|--------|--------------|---------|
| 1 — Contrats & frontière Pydantic↔zod | ✅ Complete | `01-VERIFICATION.md` — human_needed, 8/8 truths, **0 code gap** | 1 item humain résiduel : premier run GitHub Actions de `verify` (12 étapes vertes, `total skipped: 0`) — tout le reste prouvé localement (chaîne 15→85→329, gate zéro-skip prouvée exit 0 ET exit 1) |
| 2 — Style verrouillé & catalogue | ✅ Complete | `02-VERIFICATION.md` — **passed**, 5/5 SC | Re-vérifié comportementalement (472 pytest / 150 vitest / tsc clean) ; aucun gap |
| 3 — Motion Compiler & SVG Sanitizer | ⬜ Not started | — | **Blocker M1** |
| 4 — Anim QA pinnée | ⬜ Not started | — | **Blocker M1** |
| 5 — Manifest Store & checkpointer | ⬜ Not started | — | **Blocker M1** |

## Cross-Phase Integration (gsd-integration-checker)

**Verdict : integration-intact.** L'hypothèse adverse (silos) est réfutée :

| Seam | Verdict | Preuve |
|------|---------|--------|
| `domain/catalogue.py` importe `RecipeId`/`ThemeAnchorId` de `vocabulary.py` (jamais redéclaré) | WIRED | catalogue.py:52-58 · scans structurels test_vocabulary.py:170,288 |
| `gates/stale_pins.py` importe `STYLE_REF_PATTERN`/`ASSET_ID_PATTERN` de `domain/asset.py` | WIRED | stale_pins.py:39-41 · régression `is`-identity test_stale_pins.py:161-171 |
| Régime de hash unique (`normalize_lf`/`sha256_hex`) partagé loaders + prompts | WIRED | loading/style.py:82-108 ← loading/catalogue.py ← prompts/render.py |
| Mono-style pack.py réutilise `STYLE_VERSION_PATTERN` (rsplit, pas de re-dérivation) | WIRED | pack.py:76,178,269-271 |
| catalogue.json bilingue sans drift (deep-equal vs artefact Python) | WIRED | catalogue.spec.ts:63-78 |
| style.yaml sans drift (fixture ≡ builder, sha round-trip) | WIRED | test_style_fixture_bridge.py:173-185,255-272 |
| Harnais de rejet partagé : 6 contrats, 90 cas, mêmes maps des deux côtés | WIRED | rejection_loader.py:26 ↔ rejection-cases.ts:25 |
| ContentHashes slots svg/lottie typés et prêts pour Phases 3–4 | WIRED (READY) | asset.py:119-122 · asset-spec.schema.ts:62 |
| catalogue ids == RECIPE_IDS (ordre vérifié live) | WIRED | probe live : True |
| theme_anchors ⊆ ThemeAnchorId Literal fermé | WIRED | probe live : {accent, background, primary} ⊆ 6 labels |
| verify.yml = chaîne bridge ordonnée 12 étapes, rien ne la contourne | WIRED | verify.yml:84-99,106 · include vitest/testpaths pytest couvrent tout le Phase 2 |

**E2E flow (unique flow M1 existant) : COMPLET, vérifié live.**
`style.yaml` (load_style_spec, sha 52716be0…) → pin `example-style@1.0.0` (STYLE_REF_PATTERN accepte, dérivé de make_style_spec — pas de string hardcodée) → ContentHashes avec vrais shas fixtures → PackManifest validé (mono-style + gate licence structurelle) → boucle fermée prompt sha == catalogue_sha256 au manifest. Garde permanente : tout bump de fixture sans re-pin same-commit rougit la CI.

**Findings intégration (0 critique, 4 mineurs) :**
- **F-1** (minor, DM-04/STY-01/MOT-04) : la chaîne fixture→sha→pin→manifest est prouvée piecewise sur 3 suites, pas par un test unique de composition. Couvert transitivement (probe live positive) — se clôt naturellement en Phase 5 quand MFT-02 agrégera de vrais assets.
  - **Disposition** (2026-08-31, quick 260831-l1s) : clôture planifiée en Phase 5 — le plan MFT-02 doit livrer un test de composition fixture→sha→pin→manifest (à relire au planning Phase 5, signal déjà tracé dans STATE.md decisions).
- **F-2** (minor, DM-02/MOT-03) : `vocabulary.spec.ts` re-déclare les tuples canoniques en littéraux attendus — redondance *de détection de drift* intentionnelle ; un bump de vocabulaire = édition same-commit 3 fichiers. Compatible doctrine, à documenter pour le consommateur agent Phase 6.
  - **Disposition** (2026-08-31, quick 260831-l1s) : redondance de détection de drift INTENTIONNELLE, pas une seconde source — un bump de vocabulaire = édition same-commit 3 fichiers (`vocabulary.py` + `vocabulary.schema.ts` + `vocabulary.spec.ts`), contraignant pour les consommateurs agents Phase 6.
- **F-3** (minor, STY-03) : tests de bump simulé hardcodent `"1.0.0"` — découplage correct par design (la garde permanente couvre le sens live-fixture).
  - **Disposition** (2026-08-31, quick 260831-l1s) : par design (découplage voulu) — aucune action requise, la garde permanente couvre déjà le sens live-fixture.
- **F-4** (minor, DM-05) : `fixtures/bridge/` gitignoré — défendu par comparaisons committed-vs-exported ; ne pas « corriger » le gitignore.
  - **Disposition** (2026-08-31, quick 260831-l1s) : gitignore de `fixtures/bridge/` DÉFENDU — ne jamais le « corriger », les comparaisons committed-vs-exported du harnais bridge en dépendent ; intouchable dans ce projet.

## Nyquist Coverage (§5.5 — hook validate-phase actif)

| Phase | VALIDATION.md | Statut | Classification |
|-------|---------------|--------|----------------|
| 01 | absent | — | ❌ MISSING |
| 02 | présent | `status: validated`, `nyquist_compliant: true`, `wave_0_complete: true` | ✅ COMPLIANT (reconstruit post-hoc, State B) |
| 03–05 | absents | — | ❌ MISSING (phases non démarrées) |

**Overall : partial.** Action disponible : `/gsd-validate-phase 1` pour rétro-couvrir la Phase 1.

## Tech Debt & Deferred (non bloquant)

**Phase 01 :**
- Bookkeeping : 01-VERIFICATION note DM-03 `[ ]` dans REQUIREMENTS.md alors que satisfait (drift de suivi, pas de code)
- Drift prose : 01-01 SUMMARY annonce « 20 cas de rejet » style-spec, le JSON tracké en contient 19 (documentation seulement)
- 1 item de vérification humaine ouvert : premier run GitHub Actions de `verify`

**Phase 02 :**
- Bookkeeping : STY-03/MOT-01/MOT-02 marqués « Pending » dans la table traceability REQUIREMENTS.md et ROADMAP affiche Phase 1 « In Progress » — latence de mise à jour recommandée
- 02-VALIDATION.md reconstruit post-hoc (State B) — conformité réelle, mais créée après coup

**Intégration (F-1..F-4) :** voir findings mineurs ci-dessus — aucunne action requise avant le planning Phase 3 ; F-1 se clôt en Phase 5.

**Total : 7 items mineurs sur 3 sources — zéro dette de code, zéro stub, zéro anti-pattern (scans TBD/FIXME/stub : 0 hits sur les deux phases).**

**Résolution (quick 260831-l1s, 2026-08-31) — solde des 7 items :**

| # | Item | Résolution | Source |
|---|------|------------|--------|
| 1 | DM-03 `[ ]` REQUIREMENTS.md (audit l. 166) | déjà résolu par `909d05d` (phase-2 close-out) — case `[x]` + Status `Complete` posés avant l'audit `a85dcf4` ; ligne 166 ci-dessus était stale au moment de l'écriture de l'audit | git log `909d05d` (03:04) vs `a85dcf4` (15:03) |
| 2 | Prose 01-01 « 20 cas » style-spec vs JSON = 19 | résolu par cette quick task — recompte JSON = 19 confirmé, sous-comptes Tests ré-alignés (17/19/1/19/1 = 57 cohérent `--collect-only`), entrée STATE 01-01 corrigée | quick `260831-l1s` Task 2 (commit `3bbe980`) |
| 3 | STY-03/MOT-01/MOT-02 « Pending » en traceability REQUIREMENTS.md | déjà résolu par `909d05d` (phase-2 close-out) — case `[x]` + Status `Complete` posés avant l'audit | git log `909d05d` |
| 4 | ROADMAP Phase 1 « In Progress » | résolu par cette quick task — ligne Progress Phase 1 = `Complete | 2026-08-29` (date 01-VERIFICATION `verified: 2026-08-29T22:19:29+01:00`, score 8/8 truths, 0 code gap) | quick `260831-l1s` Task 1 (commit `31416cc`) |
| 5 | Premier run GitHub Actions de `verify` | **RESTE OUVERT** — item humain de vérification (01-VERIFICATION.md § human_verification), hors périmètre docs-only de cette quick task ; tracé ici pour traçabilité, l'entrée `Complete` de la ROADMAP ne dépend pas de cet item (décision utilisateur : 8/8 + 0 code gap suffisent) | 01-VERIFICATION.md l. 14-15 |
| 6 | 02-VALIDATION.md reconstruit post-hoc (State B) | accepté — conformité réelle, classification documentée dans §Nyquist Coverage ci-dessus ; aucune action | l. 228 ci-dessus |
| 7 | F-1..F-4 (4 findings mineurs) | dispositions explicites ajoutées sous chaque finding (voir bloc ci-dessus) ; F-1 clôt en Phase 5 (signal STATE), F-2 contraignant same-commit pour Phase 6, F-3 par design, F-4 intouchable | quick `260831-l1s` Task 3 |

**Total soldé : 6/7 résolus (1 ouvert, humain CI hors périmètre docs-only).**

## Conclusion

Le spine livré (Phases 1–2) est **sain et intégré** : 12 exigences satisfaites avec triple-source concordante, intégration cross-phase intacte avec preuves live, flow E2E existant complet, dette quasi nulle. Le milestone M1 dans son ensemble **n'atteint pas encore sa définition de done** : les Phases 3 (compiler/sanitizer), 4 (Anim QA) et 5 (store/checkpointer) restent à exécuter — 17 exigences en attente, exactement le travail planifié restant du milestone. Aucun gap inattendu, aucun défaut de câblage, aucune exigence orpheline.
