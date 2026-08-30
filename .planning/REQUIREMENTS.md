# Requirements: lottie-forge

**Defined:** 2026-08-29
**Core Value:** Un style visuel verrouillé + un vocabulaire de mouvement catalogué + des exports dev-ready — first-pass yield > 70 % et coût < €0,05 / asset.

> Source canonique : `docs/project/01_Vision.md` → `13_Hardening.md` (cahier des charges aligné v2, 13 parties). Les IDs reprennent la nomenclature du cahier des charges. Les 50 exigences v1 y sont déclarées couvertes ; chaque partie (4→13) mappe chaque exigence à sa gate.

## v1 Requirements

Requirements pour la sortie v1 (premier pack shippé via ship-gate humain). Chacune mappe à une phase de la roadmap.

### Contrats & Modèles (DM) — Partie 4

- [x] **DM-01**: `StyleSpec` strict validée des deux côtés (champs bornés, `extra=forbid`/`strict`, cross-field thin<default<bold et small<=medium<=large)
- [x] **DM-02**: `MotionRecipe` avec vocabulaire clos `RecipeId` (invariant 8–12, 10 ids verrouillés) ; tout id hors catalogue rejeté
- [x] **DM-03**: `AssetSpec` complète (`asset_id` `a-\d{3}`, pin `style_ref` name@version, `recipe_ref`, `composition_meta`, `content_hashes` modèle clos)
- [x] **DM-04**: `PackManifest` validé (unicité `asset_id`, cohérence compte/total, mono-style, licence structurelle)
- [x] **DM-05**: Miroirs zod stricts de chaque contrat + parité testée (clés schéma, rejet miroir, round-trip ordonné pytest→vitest→pytest) enforce CI

### Licence (LIC) — Parties 4 & 13

- [ ] **LIC-01**: Licence perpétuelle one-time **structurelle** (`Literal["perpetual-one-time"]` + validateurs — une licence abonnement ne peut pas être construite) et exprimée en runtime par `license.txt` généré depuis `LicenseInfo` (cohérence gate CI, zéro wording subscription)
- [ ] **LIC-02**: Usage commercial autorisé et attribution optionnelle, enforce par construction + gate CI sur l'artefact licence

### Style (STY) — Partie 5

- [x] **STY-01**: Mono-style par pack structurel + fixture `StyleSpec` YAML versionnée et hashée comme unique source de vérité du style
- [x] **STY-02**: `StyleRefinement` delta-only par construction (jamais de SVG/path data/hex libre) ; vérification `sub_palette ⊆ style.palette` au Translator
- [ ] **STY-03**: Gate de re-validation sur bump de `style_version` via l'ancre `style_ref` (assets pinnés flaggés : PATCH échantillonné, MINOR tokens touchés, MAJOR tous)

### Mouvement (MOT) — Partie 5

- [ ] **MOT-01**: Catalogue fermé de 8–12 recettes en données versionnées (`catalogue.json`) possédant durées, easings, keyframe_shapes et ranges d'intensité
- [ ] **MOT-02**: Les ids de recette choisis par tout agent ⊆ vocabulaire clos (jamais d'invention hors catalogue)
- [x] **MOT-03**: `theme_anchors` ≥ 1 par recette, labels non-PII
- [x] **MOT-04**: Catalogue chargé bilingue (Python + TypeScript) sans drift + embarqué comme fixture de system prompt versionnée (hash au manifest)

### Compilation (COM) — Partie 6

- [ ] **COM-01**: Motion Compiler idempotent byte-for-byte (même `RenderSpec` → mêmes bytes), golden files par recette
- [ ] **COM-02**: Zéro LLM sur le chemin backbone déterministe (aucun import langchain/openai/anthropic — grep CI bloquant)
- [ ] **COM-03**: Lottie JSON re-validé zod avant retour (un JSON invalide ne sort jamais du compiler)
- [ ] **COM-04**: Feature gate lottie-web pinnée (`SupportedLottieFeature`, champ `v` ; rejet dur 3D/audio/negative stretch/expressions vivantes ; fallback bake en keyframes)

### Sanitisation SVG (SAN) — Partie 6

- [ ] **SAN-01**: Rejet de `<text>`/`<tspan>` (glyphs-as-paths uniquement)
- [ ] **SAN-02**: Rejet de raster embarqué (`<image>`, data URIs base64)
- [ ] **SAN-03**: IDs stables entre régénérations, schéma `{asset_id}_{component}_{role}`, assignés par le compiler (jamais le LLM)
- [ ] **SAN-04**: SVGO 4 avec `removeViewBox`/`removeTitle` désactivés + test de régression (viewBox et `<title>` survivent) — ADR-02
- [ ] **SAN-05**: Rejet sécurité : `<foreignObject>`, `<script>`, event handlers, URIs `javascript:`, `xlink:href` externe

### Anim QA (QA) — Parties 7 & 13

- [ ] **QA-01**: Anim QA en conteneur Playwright pinné (Chromium verrouillé, même image local/CI), frame walk déterministe `goToAndStop(n, true)`, flake < 1 % sur 10 runs
- [ ] **QA-02**: Diff pixelmatch vs baseline avec `maxDiffPixels` calibré (frame canonique + 3 frames échantillonnées)
- [ ] **QA-03**: Un seul asset au-delà de son seuil = pack échoué (pas de moyenne)
- [ ] **QA-04**: `QAReport` structuré par asset (pass/fail, `reason_codes` canoniques, stats pixel, tag conteneur) persisté au manifest ; validation structurelle avant tout diff pixel
- [ ] **QA-05**: Ship-gate humain : approval/rejet explicite enregistré (`shippable`, `approved_by`, `approved_at`, `preview_sha256`), anti-contournement (packaging refuse un pack non approuvé)

### Manifest Store (MFT) — Partie 8

- [ ] **MFT-01**: Manifest par asset complet persisté en store (style_version, recipe_id, model_id, seeds, hashes de contenu, QAReport, timestamp)
- [ ] **MFT-02**: Agrégateur pack calculant count/coût/first-pass-yield/licence depuis les lignes assets, validé par `PackManifest` avant INSERT
- [ ] **MFT-03**: Store SQLite single-file, backup trivial (`cp` documenté, test restore), note de migration DuckDB

### Orchestration (ORC) — Parties 8 & 10

- [ ] **ORC-01**: État typé `PackState`/`AssetState` (BaseModel Pydantic) auto-validé à chaque frontière de nœud (état invalide lève, ne corrompt pas)
- [ ] **ORC-02**: Fan-out `Send` ×50 avec parallélisme borné 5–8 assets concurrents
- [ ] **ORC-03**: Retry router structuré (arêtes = enum d'action : re-roll seed → swap recette → escalade tier → hard fail) ; « fix it with a prompt » structurellement impossible
- [ ] **ORC-04**: Crash-recovery via `langgraph-checkpoint-sqlite` (tuer un run de 50 assets et le relancer reprend au dernier checkpoint, zéro travail dupliqué, zéro double facturation)
- [ ] **ORC-05**: Garde de coût pré-génération : projection > €0,05/asset → rejet structuré `rejected_cost` au manifest, zéro appel LLM

### Agents LLM (AGT) — Partie 9

- [ ] **AGT-01**: StyleRefiner = fonction pure → `StyleRefinement` delta, snapshots dorés par style exemple, zéro import LangGraph
- [ ] **AGT-02**: RecipePicker → `RecipeSelection` clos ; jamais d'id hors catalogue dans aucune sortie (snapshots avec cas adverses)
- [ ] **AGT-03**: CompositionComposer → `CompositionSpec` (modèle clos, jamais de path data) ; ≥ 3 snapshots représentatifs par recette
- [ ] **AGT-04**: Appels via OpenRouter (modèle = paramètre) avec idempotency keys salées par env ; même clé + même input = réponse cachée, jamais de double facturation

### Exports Multi-Frameworks (EXP) — Partie 11

- [ ] **EXP-01**: Export React dev-ready (lottie-react 3.1, peerDeps versionnés, prop `theme` sans re-mount, `structuredClone` par rendu)
- [ ] **EXP-02**: Export Vue dev-ready (dotlottie-vue 0.5+, `setTheme` natif réactif, `setWasmUrl`)
- [ ] **EXP-03**: Export Flutter dev-ready (lottie 3.5.1, deux JSON pré-appliqués light/dark, pubspec.yaml généré)
- [ ] **EXP-04**: Export HTML pur (lottie-svg vendored < 30 Ko, fallback lottie-web 5.13, poster statique)
- [ ] **EXP-05**: Dark-mode sémantique via dotLottie `themeId` + `theme_anchors` (ADR-05) ; smoke test theming (diff light/dark > 5 %) sur la sortie packagée

### Observabilité (OBS) — Partie 12

- [ ] **OBS-01**: Traçage Langfuse self-host (fallback LangSmith) de chaque appel LLM et nœud déterministe, tagué `pack_id`/`asset_id`/`idempotency_key`/stage/attempt/model_id ; spool JSONL sans perte si backend injoignable
- [ ] **OBS-02**: `cost_eur` par asset calculé depuis `prices.yaml` versionné (prix manquant = erreur dure) ; `totals.cost_eur` = somme du ledger, jamais saisie
- [ ] **OBS-03**: Yield guard fenêtre roulante 10 packs : first-pass < 70 % → pack non shippable (blocage du ship-gate, décision humaine)

### KPIs (KPI) — Partie 12

- [ ] **KPI-01**: Coût moyen < €0,05 / asset sur les 10 derniers packs ; violation rendue explicite avec contributeurs (recette/modèle/stage) dans le yield-report
- [ ] **KPI-02**: First-pass yield > 70 % sur les 10 derniers packs, calculé depuis le store (tentatives `attempt == 1`)

## v2 Requirements

Différés milestone 2+ / v1.x / v2, tracés dans le cahier des charges (§1.8, §12.9, §13.10).

### Go-To-Market

- **GTM-01**: Page de vente pack avec preview jouable
- **GTM-02**: Livraison post-achat (download + licence)
- **GTM-03**: Publishing automatisé lisant le flag `shippable`
- **GTM-04**: Boucle feedback ventes lisant le yield-report comme entrée de planification

### Cohérence & Qualité étendue

- **COH-01**: Score de cohérence pack-level (variance stroke/palette/amplitude)
- **COH-02**: Seconde StyleSpec (multi-style)
- **COH-03**: Gate CI de cohérence pack
- **AQA-01**: Baseline enrichie de frames de référence choisies à la main
- **AQA-02**: Rapports QA par renderer (lottie-web/ios/android/flutter)
- **CAT-01**: Catalogue de thèmes multiples
- **CAT-02**: Bibliothèque de styles

### Portail & Production

- **WPR-01**: Portail public filtrable (au-delà de l'`index.html` de revue)
- **WPR-02**: Widgets de preview embarquables
- Revue légale complète + indemnisation B2B sur la licence
- Signature cryptographique des artefacts de pack
- Migration analytique DuckDB
- Dashboard web coût/yield
- Smoke live anti-dérive de modèle en CI hebdomadaire ; A/B multi-modèles par stage piloté par le yield report

## Out of Scope

Explicitement exclus (§1.6 — jamais construits).

| Feature | Reason |
|---------|--------|
| Éditeur d'illustration user-facing | L'usine produit, l'humain édite/valide au ship-gate — pas d'outil d'édition |
| Génération on-the-fly / runtime | Batch only, pack-at-a-time ; le coût/yield ne se maîtrise qu'en batch |
| Raster PNG/WebP en sortie produit | Vectoriel pur par design (PNG = artefacts QA internes uniquement) |
| Pick-and-mix par asset | Packs thématiques cohérents uniquement (valeur = cohérence) |
| Subscription / metered licensing | Posture anti-subscription explicite ; licence perpétuelle structurelle |
| Grammaires de motion ouvertes | Catalogue fermé 8–12 recettes (ADR-03) ; yield inmesurable sinon |
| Prompt playground public | Pas d'exposition LLM ; les prompts sont des fixtures versionnées |
| Photoréalisme | Illustration vectorielle animée uniquement |
| Collab temps réel | Usine mono-opérateur |
| Analytics embarquées dans les packs | Produit = assets ; telemetry côté usine seulement |
| App mobile native | Exports Flutter = intégration dans l'app du client |
| Auto-traduction / texte dans les assets | Pas de `<text>` par design (SAN-01) |
| SMIL / CSS keyframes sur SVG | ADR-01 : Lottie = seule surface de mouvement |
| Bodymovin / After Effects | Non pilotable par LLM |
| Temporal / Celery / Redis | SQLite checkpointer suffit (batch single-machine) ; ADR-06 |
| Vite 8 ; gpt-4o ; CrewAI en production ; librsvg/Inkscape ; Jest 29 | Stack verrouillée Partie 3 (§3.8) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DM-01 | Phase 1 | Complete |
| DM-02 | Phase 1 | Complete |
| DM-03 | Phase 1 | Complete |
| DM-04 | Phase 1 | Complete |
| DM-05 | Phase 1 | Complete |
| LIC-01 | Phase 10 (structurel : Phase 1) | Pending |
| LIC-02 | Phase 10 (structurel : Phase 1) | Pending |
| STY-01 | Phase 2 | Complete |
| STY-02 | Phase 6 (type delta-only livré en Phase 2 ; complété au Translator Phase 7) | Complete |
| STY-03 | Phase 2 | Pending |
| MOT-01 | Phase 2 | Pending |
| MOT-02 | Phase 2 (clos structurel) + Phase 6 (côté agent) | Pending |
| MOT-03 | Phase 2 | Complete |
| MOT-04 | Phase 2 | Complete |
| COM-01 | Phase 3 | Pending |
| COM-02 | Phase 3 | Pending |
| COM-03 | Phase 3 | Pending |
| COM-04 | Phase 3 | Pending |
| SAN-01 | Phase 3 | Pending |
| SAN-02 | Phase 3 | Pending |
| SAN-03 | Phase 3 | Pending |
| SAN-04 | Phase 3 | Pending |
| SAN-05 | Phase 3 | Pending |
| QA-01 | Phase 4 | Pending |
| QA-02 | Phase 4 | Pending |
| QA-03 | Phase 4 | Pending |
| QA-04 | Phase 4 | Pending |
| QA-05 | Phase 10 | Pending |
| MFT-01 | Phase 5 | Pending |
| MFT-02 | Phase 5 | Pending |
| MFT-03 | Phase 5 | Pending |
| ORC-01 | Phase 7 | Pending |
| ORC-02 | Phase 7 | Pending |
| ORC-03 | Phase 7 | Pending |
| ORC-04 | Phase 5 | Pending |
| ORC-05 | Phase 7 | Pending |
| AGT-01 | Phase 6 | Pending |
| AGT-02 | Phase 6 | Pending |
| AGT-03 | Phase 6 | Pending |
| AGT-04 | Phase 6 | Pending |
| EXP-01 | Phase 8 | Pending |
| EXP-02 | Phase 8 | Pending |
| EXP-03 | Phase 8 | Pending |
| EXP-04 | Phase 8 | Pending |
| EXP-05 | Phase 8 | Pending |
| OBS-01 | Phase 9 | Pending |
| OBS-02 | Phase 9 | Pending |
| OBS-03 | Phase 9 | Pending |
| KPI-01 | Phase 9 | Pending |
| KPI-02 | Phase 9 | Pending |

**Coverage:**

- v1 requirements: 50 total
- Mapped to phases: 50
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-29*
*Last updated: 2026-08-29 — traceability remplie puis réordonnée §2.8 exact (agents Ph6, orchestrator Ph7, packager Ph8 ; M1 = Phases 1–5) après feedback utilisateur*
