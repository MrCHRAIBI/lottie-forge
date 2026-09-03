# Phase 4: Anim QA pinnée - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-03
**Phase:** 4-Anim QA pinnée
**Areas discussed:** Environnement pinné & CI, Baselines & calibration, Smoke test theming, Contrat QAReport, Surface RPC anim_qa.run, Assets svg-only & theme smoke, Résolution de capture, Frontière tests unit/conteneur, Scaffold multi-renderer (§7.7)

---

## Environnement pinné & CI

| Option | Description | Selected |
|--------|-------------|----------|
| Tag exact (recommandé) | Tag verrouillé patch compris, reporté dans qa_container_tag | |
| Tag + digest | Tag + sha256 en dur, immuable mais peu lisible | |
| Tag + lock digest | Tag exact + digest piné dans qa-container.lock référencé par les scripts | ✓ |

**User's choice:** Tag + lock digest
**Notes:** Lisible au quotidien, immuable en CI même si Microsoft re-pousse le tag.

| Option | Description | Selected |
|--------|-------------|----------|
| docker run script (recommandé) | Script npm qa:run, image lockée, repo monté, zéro bare-metal | ✓ |
| devcontainer | Seconde voie d'exécution à maintenir | |
| CI only | La génération des baselines devrait alors aussi passer par CI | |

**User's choice:** docker run script
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| qa.yml dédié (recommandé) | Job container: image lockée, fresh checkout, sans secrets ; verify.yml intact | ✓ |
| Job dans verify.yml | Casse la doctrine D-18 Ph 2 (byte-for-byte) | |
| Reusable workflow | verify.yml quand même édité + indirection de debug | |

**User's choice:** qa.yml dédié
**Notes:** Les tests unitaires vitest de src/anim-qa restent dans verify.

| Option | Description | Selected |
|--------|-------------|----------|
| 1× PR / 10× main+nightly (recommandé) | 1 run par PR, preuve 10 runs sur main + nightly | ✓ |
| 10 runs à chaque push | Conformité littérale §7.2 mais coût CI élevé | |
| 10 runs manuels only | Mesure flake non continue | |

**User's choice:** 1× PR / 10× main+nightly
**Notes:** —

---

## Baselines & calibration

| Option | Description | Selected |
|--------|-------------|----------|
| Patron goldens:update (recommandé) | baseline:update dans le conteneur pinné, refuse CI=true, same-commit | ✓ |
| Génération à la volée | La CI écrirait dans fixtures/ (anti-pattern doctrine) | |
| Workflow dispatch CI | Traçable mais loop local lent | |

**User's choice:** Patron goldens:update
**Notes:** La CI ne fait que comparer, jamais régénérer.

| Option | Description | Selected |
|--------|-------------|----------|
| Config versionnée par asset (recommandé) | thresholds.json : maxDiffPixels par asset_id + défaut | ✓ |
| Constante globale | Pas de calibrage par recette | |
| Dans les fixtures | Mélangerait spec d'entrée et config QA | |

**User's choice:** Config versionnée par asset
**Notes:** Doctrine « données versionnées ».

| Option | Description | Selected |
|--------|-------------|----------|
| Spike = tâche livrée (recommandé) | Mesure bruit → thresholds.json + docs/qa.md commités | ✓ |
| Estimation au planning | Seuils sans mesure réelle au départ | |
| Au fil de l'eau | Seuils non reproductibles | |

**User's choice:** Spike = tâche livrée
**Notes:** Le spike devient un artefact, pas une estimation.

| Option | Description | Selected |
|--------|-------------|----------|
| Aligné pose D-15 (recommandé) | enter → frame finale (marker), loop → frame 0 | ✓ |
| Frame 0 uniforme | Frames vides pour fade/slide (diff mort) | |
| Par asset en config | Config de plus pour un choix mécanique | |

**User's choice:** Aligné pose D-15
**Notes:** Cohérence avec le poster SVG statique ; échec frame canonique = rejet immédiat (§7.4).

---

## Smoke test theming

| Option | Description | Selected |
|--------|-------------|----------|
| dotLottie setTheme (recommandé) | Chemin de production Ph 8 (ADR-05) prouvé dès la Ph 4 | ✓ |
| Lottie dark dérivé | Proxy ne prouvant pas le chemin dotLottie | |
| Les deux | Coût de maintenance doublé | |

**User's choice:** dotLottie setTheme
**Notes:** Nouveau dep npm → gate human-verify.

| Option | Description | Selected |
|--------|-------------|----------|
| Fixture QA dédiée (recommandé) | dark-theme.json versionnée, explicitement non-produit | ✓ |
| Depuis StyleSpec | Violerait D-12 Ph 2 (couplage anchor→token interdit avant Ph 8) | |
| Hardcodé | Valeur de test non versionnée | |

**User's choice:** Fixture QA dédiée
**Notes:** Le smoke est un test d'effet, pas un test de couleurs justes.

| Option | Description | Selected |
|--------|-------------|----------|
| Masks par IDs stables (recommandé) | bbox par anchor depuis {asset_id}_{component}_{role} (D-32 Ph 3) | ✓ |
| Diff pleine frame | Mesure aussi le fond, fausse possible | |
| Masque par rendu | Précis mais un rendu de plus par asset | |

**User's choice:** Masks par IDs stables
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Agrégé union (recommandé) | Un % sur l'union, colle à theme_diff_pct (float unique §7.6) | |
| Par ancre | Plus strict mais contrat QAReport ne le porte pas | |
| Agrégé + log par ancre | Gate agrégée + observabilité par ancre non bloquante | ✓ |

**User's choice:** Agrégé + log par ancre
**Notes:** La granularité par ancre reste possible en v2.

---

## Contrat QAReport

| Option | Description | Selected |
|--------|-------------|----------|
| Literal fermé 7 codes (recommandé) | 7 codes canoniques §7.6 en Literal, same-commit | ✓ |
| Strings libres | Agrégation fragile pour retry_router/yield report | |
| Fermé TS only | Casse la parité DM-05 | |

**User's choice:** Literal fermé 7 codes
**Notes:** Patron RecipeId/ThemeAnchorId/codes RPC D-28.

| Option | Description | Selected |
|--------|-------------|----------|
| Contrat complet Ph 4 (recommandé) | Pydantic + zod + qa-report.json + bridge | ✓ |
| Zod only, Py en Ph 5 | ROADMAP crit 4 dit « Pydantic/zod » pour la Ph 4 | |
| Sans bridge | Sort du patron D-06/D-07/D-08 | |

**User's choice:** Contrat complet Ph 4
**Notes:** Ph 5 ré-parse un contrat déjà prouvé.

| Option | Description | Selected |
|--------|-------------|----------|
| Artefact de run (recommandé) | JSON par asset, timestamp injectable, store = Ph 5 | ✓ |
| Mini-store anticipé | Schéma store non arrêté, travail jetable | |
| Retour RPC only | Perd la traçabilité des runs CI | |

**User's choice:** Artefact de run
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Compile à la volée (recommandé) | fixtures → compile → sanitize → QA en un job | ✓ |
| Goldens committés | qa.yml ne prouverait plus le chemin live | |
| Les deux modes | Deux chemins à maintenir | |

**User's choice:** Compile à la volée
**Notes:** Le compile est byte-déterministe (D-26 Ph 3), aucun flake ajouté.

---

## Surface RPC anim_qa.run

| Option | Description | Selected |
|--------|-------------|----------|
| Méthode unique (recommandé) | 5 étapes en interne, gate ordonnée = invariant du module | ✓ |
| Méthodes par étape | Tente l'appelant de réordonner les étapes | |
| run + structural | Anticiperait un besoin Ph 7 non arrêté | |

**User's choice:** Méthode unique
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Lottie inline + chemins (recommandé) | Lottie inline, baselines/thresholds par chemins | ✓ (dépassé par la réponse libre) |
| Tout par chemins | I/O mort pour le fan-out Ph 7 | |
| Tout inline | Binaires lourds en NDJSON | |

**User's choice:** Réponse libre : Lottie JSON inline (NDJSON compact) + asset_id uniquement ; le serveur résout lui-même baselines (lazy) et configs versionnées (thresholds, dark-theme, captureConfig au startup — pattern Ph 3) via un résolveur pur dans baseline.ts ; zéro chemin dans la requête = zéro surface d'injection ; orphelin = baseline_missing.
**Notes:** Le Lottie n'est jamais écrit sur disque avant QA (fan-out ×50 Ph 7) ; résolveur unit-testable (calcul de chemin pur).

| Option | Description | Selected |
|--------|-------------|----------|
| Report + artefacts (recommandé) | QAReport + chemins des PNG sous le répertoire de sortie (fixé à l'activation serveur) | ✓ |
| Report seul | Perd les pointeurs vers les preuves visuelles | |
| Report + diff inline | Binaire lourd en NDJSON | |

**User's choice:** Report + artefacts
**Notes:** Cohérent avec le résolveur : la requête ne porte jamais de chemin.

---

## Assets svg-only & theme smoke

| Option | Description | Selected |
|--------|-------------|----------|
| Skip + champ additif (recommandé) | Frame walk lottie-web + smoke marqué skipped | ✓ (dépassé par la réponse libre) |
| Smoke aussi sur svg-only | Faux theme:noop possible sur renderer wasm | |
| Échec dur | Rejette des assets valides, déplace une décision Ph 8 | |

**User's choice:** Réponse libre : smoke theming exécuté sur tous les assets, routé par renderer_support — « all » → dotLottie setTheme ; « svg-only » → applyTheme déterministe sur lottie-web SVG (chemin production Ph 8, EXP-01) ; champ additif theme_smoke_path: Literal["dotlottie-setTheme", "applyTheme-svg"] same-commit ; applyTheme = fonction pure née Ph 4, réutilisée telle quelle en Ph 8 ; mêmes masks, même seuil, même frame canonique.
**Notes:** Ni skip, ni échec dur, ni smoke wasm sur incompatible ; on enregistre le mécanisme mesuré, jamais « skipped ».

| Option | Description | Selected |
|--------|-------------|----------|
| Unit only en Ph 4 (recommandé) | applyTheme testée en unit, E2E quand de vrais assets existeront | ✓ (dépassé par la réponse libre) |
| 12e fixture commitée | Retouche le domaine figé Ph 3 (65-case, goldens) | |
| Différé sans test | Ph 8 hériterait d'une fonction jamais exécutée | |

**User's choice:** Réponse libre : preuve complète des deux chemins en Ph 4, zéro churn du domaine figé — unit applyTheme sur Lottie synthétique (esprit D-33) + cas svg-only synthétique test-local hors set D-03/goldens pour l'E2E conteneur ; raffinement du contrat d'entrée RPC : { lottie, asset_id, renderer_support } avec renderer_support provenant de l'enveloppe compile (source unique, zod à l'entrée).
**Notes:** Les 11 fixtures « all » prouvent dotLottie E2E ; le synthétique prouve applyTheme E2E.

---

## Résolution de capture

| Option | Description | Selected |
|--------|-------------|----------|
| 1× natif (recommandé) | Viewport = viewBox 400×300, DPR 1 ; ajustable via captureConfig | ✓ |
| 2× natif | PNG 4× plus lourds | |
| Supersampling | Resampling non trivial dans la chaîne déterministe | |

**User's choice:** 1× natif
**Notes:** Baseline et QA capturent identique par construction.

| Option | Description | Selected |
|--------|-------------|----------|
| Fond opaque fixe (recommandé) | captureConfig, défaut tranché au planning ; zéro alpha dans les diffs | ✓ |
| Transparent + alpha | Ambiguïté de blending, jamais pinné | |
| Fond du style | Couplerait les baselines au contenu du style | |

**User's choice:** Fond opaque fixe
**Notes:** —

---

## Frontière tests unit/conteneur

| Option | Description | Selected |
|--------|-------------|----------|
| Unit = sans navigateur (recommandé) | structural/diff/report/résolveur/applyTheme en unit ; frame-walker/runner/smoke en conteneur | ✓ |
| Unit minimale | Chaque itération dev passe par docker | |
| Chromium en unit | Viole l'interdit §7.2 (bare-metal non pinné) | |

**User's choice:** Unit = sans navigateur
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Identité stricte ×10 (recommandé) | 10 QAReports identiques hors timestamp, sinon rouge | ✓ |
| Verdict seul ×10 | Tolère du non-déterminisme latent | |
| Métrique sans gate | Contraire à « the gate is the gate » | |

**User's choice:** Identité stricte ×10
**Notes:** Le compteur reste dans le log pour la métrique < 1 %.

| Option | Description | Selected |
|--------|-------------|----------|
| Sidecar hashes (recommandé) | index.json (lottie_sha256 + version configs) ; mismatch = baseline_missing avant tout diff | ✓ |
| Sans sidecar | Diagnostic trompeur, retry_router réagirait au mauvais signal | |

**User's choice:** Sidecar hashes
**Notes:** —

---

## Scaffold multi-renderer (§7.7)

| Option | Description | Selected |
|--------|-------------|----------|
| Décision dictée directement par l'utilisateur | lottie-react 3.1 + dotlottie-vue 0.5+ = passes réelles conteneur pinné (mêmes fixtures/seuils) ; Flutter 3.5.1 = colonne manifest, zéro run ; zéro test skippé ; pins exacts + human-verify ; renderer_support = D-11 source de vérité ; échec scaffold sur asset « all » = rouge ; verdict principal = lottie-web-svg (§7.6) ; par renderer = v2 (AQA-02) | ✓ |

**User's choice:** Décision complète fournie directement par l'utilisateur (voir CONTEXT.md D-27)
**Notes:** Le scaffold = runs réels ou entrées manifest, jamais skip (gate zero-skip).

---

## the agent's Discretion

- Tag exact de l'image Playwright + digest (recherche au planning)
- Valeur par défaut du fond opaque (captureConfig) et marge du spike (bruit × marge)
- Structure interne des modules src/anim-qa/ (§7.8 nomme les fichiers, découpage fin libre)
- Champs exacts de captureConfig et layout du répertoire de sortie des artefacts
- Organisation interne du qa.yml dans le respect de D-03/D-04
- Wording de docs/qa.md

## Deferred Ideas

- Granularité par ancre du seuil theming — v2 (log non bloquant en attendant)
- Rapports QA complets par renderer (AQA-02) — v2
- Baseline enrichie de frames choisies à la main (AQA-01) — v2
- Pool Playwright production — v1 sériel par asset (§7.11)
- Calibration continue des seuils (dérive Chromium) — revue trimestrielle §7.11
- Matrice mobile Flutter réelle — v2/AQA-02 (D-27)
