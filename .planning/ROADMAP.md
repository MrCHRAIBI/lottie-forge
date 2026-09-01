# Roadmap: lottie-forge

## Overview

Usine industrielle de production de packs de 50 illustrations vectorielles animées (SVG + Lottie) avec exports dev-ready. La roadmap suit **l'ordre de construction verrouillé du cahier des charges (§2.8 de `docs/project/02_Architecture.md`)** : le schéma est le contrat, le spine déterministe est construit avant les agents LLM (l'erreur la plus coûteuse du projet serait l'inverse). Le projet est découpé en **2 milestones** : M1 = spine déterministe **sans agents** (Phases 1–5 : contrats → style/catalogue → compiler/sanitizer → Anim QA → manifest store) ; M2 = agents LLM + Translator/Orchestrator + packager + observabilité + hardening + **premier pack shippé** via ship-gate humain (Phases 6–10). Doctrine transversale : « the gate is the gate » — chaque critère de succès est enforceable par CI/QA/contrat typé, jamais par convention ou revue manuelle seule.

## Milestones

- 📋 **Milestone 1 — Spine déterministe (sans agents LLM)** : Phases 1–5. Un asset peut être compilé, sanitisé, QA-isé et persisté à partir de specs typées figées (RenderSpec fixtures), sans aucun appel LLM.
- 📋 **Milestone 2 — Agents, orchestration, packager & premier pack shippé** : Phases 6–10. Les agents LLM proposent des specs derrière la frontière Pydantic, l'orchestrateur fait tourner l'usine ×50 avec gardes coût/yield, le packager transforme le Lottie canonique en produit installable, le premier pack réel passe le ship-gate humain.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Contrats de données & frontière Pydantic↔zod (reconstruction)** - Les 4 modèles Pydantic + miroirs zod stricts + bridge ordonné + CI `verify`, reconstruits depuis zéro
- [x] **Phase 2: Style verrouillé & catalogue de recettes** - StyleSpec YAML hashée + catalogue fermé de 10 recettes versionnées + gate de re-validation (completed 2026-08-31)
- [ ] **Phase 3: Motion Compiler & SVG Sanitizer** - Le seul producteur de Lottie JSON (backbone TS déterministe) + la gate dure d'hygiène SVG
- [ ] **Phase 4: Anim QA pinnée** - La seule gate « shippable » par asset : Playwright pinné, frame walk, pixelmatch, QAReport
- [ ] **Phase 5: Manifest Store & checkpointer** - Mémoire durable SQLite + crash-recovery LangGraph sans travail dupliqué
- [ ] **Phase 6: Agents LLM (un par un)** - Trois agents purs derrière la frontière Pydantic, routeur cheap-first, snapshots déterministes
- [ ] **Phase 7: Translator & Pack Orchestrator** - État typé, fan-out `Send` ×50 borné, retry router structuré, garde de coût pré-génération
- [ ] **Phase 8: Packager multi-framework** - Un Lottie JSON canonique → exports React/Vue/Flutter/HTML + dark-mode sémantique
- [ ] **Phase 9: Observabilité & gardes coût/yield** - Tracing Langfuse, coût depuis `prices.yaml`, yield-report, gardes roulantes €0,05 / 70 %
- [ ] **Phase 10: Hardening, licence runtime & ship-gate humain** - Rebuild byte-identique, passe release-gate, premier pack end-to-end, approval humaine

> **— FIN MILESTONE 1 après la Phase 5 : spine déterministe complet sans agents LLM —**
> La Phase 8 (packager) est déterministe : elle ne consomme que les sorties compiler/QA/store et les `RenderSpec` produits par le Translator (Phase 7) — aucun agent sur son chemin.

## Phase Details

### Phase 1: Contrats de données & frontière Pydantic↔zod (reconstruction)

**Goal**: Le schéma est le contrat — les 4 modèles Pydantic stricts (`StyleSpec`, `MotionRecipe`, `AssetSpec`, `PackManifest`), leurs miroirs zod, le bridge ordonné pytest→vitest→pytest et la CI `verify` sont reconstruits depuis le dépôt à zéro, à l'identique du §1.8/§2.5. La licence perpétuelle one-time est **structurelle** dès cette phase (`Literal` + validateurs — une licence abonnement ne peut pas être construite) ; son expression runtime (`license.txt`) arrive en Phase 10.
**Depends on**: Nothing (first phase — reconstruction depuis dépôt vide de code)
**Requirements**: DM-01, DM-02, DM-03, DM-04, DM-05
**Success Criteria** (what must be TRUE):

  1. La chaîne bridge ordonnée (`pytest export` → `vitest validate/re-emit` → `pytest strict re-import`) passe verte en CI depuis un fresh checkout, avec zéro test skippé (asserté sur le junitxml)
  2. Tout id de recette hors catalogue (`disco-spin`) est rejeté des deux côtés (Pydantic strict ET zod `safeParse`), et l'invariant 8 ≤ ids ≤ 12 est asserté de part et d'autre
  3. Les cross-fields de `StyleSpec` (`thin < default < bold`, `small <= medium <= large`) et les trois validateurs de `PackManifest` (unicité `asset_id`, cohérence compte/total, mono-style) rejettent les payloads invalides en suites miroirs paramétrées
  4. Une licence de type abonnement (`terms` ≠ `perpetual-one-time`, `commercial_use=False`, `attribution_required=True`) est impossible à construire — le `Literal` rejette à l'instanciation, côté Pydantic comme côté zod
  5. Deux objets de contenu égal construits indépendamment sérialisent en `model_dump_json()` byte-identiques (déterminisme de sérialisation, floats fractionnaires)

**Canonical refs**: `docs/project/04_Modeles.md` (§4.1–§4.14) · `docs/project/02_Architecture.md` §2.5 (contrats de frontière) · `docs/project/03_Stack.md` (pins stack)
**Plans:** 5/5 plans executed

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Bootstrap monorepo + primitives partagées + tracer StyleSpec end-to-end (chaîne bridge verte) + harnais de rejet miroir (D-06/D-07/D-08)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Vocabulaire clos `RecipeId` (invariant 8–12, same-commit) + `MotionRecipe` complet deux côtés + asymétrie pinnée WR-06

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — `AssetSpec` complet deux côtés (asset_id, pin style_ref, content_hashes clos) + cas de rejet partagés

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-04-PLAN.md — `PackManifest` + licence structurelle + 3 validateurs collect-all (IN-08) + WR-01 rsplit + déterminisme byte-identique

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-05-PLAN.md — CI `verify` (10 étapes §3.6 + tsc + zéro-skip junitxml) + README quickstart byte-for-byte + preuve fresh-checkout

### Phase 2: Style verrouillé & catalogue de recettes

**Goal**: Le style et le mouvement deviennent des **données versionnées** : fixture `StyleSpec` YAML hashée (unique source de vérité du style), catalogue fermé de 8–12 recettes (10 ids verrouillés) avec durées/easings/`theme_anchors`, gate de re-validation sur bump de `style_version`, et le type `StyleRefinement` delta-only (la vérification Translator complète STY-02 en Phase 7).
**Depends on**: Phase 1
**Requirements**: STY-01, STY-02 (partial — type delta-only), STY-03, MOT-01, MOT-02, MOT-03, MOT-04
**Success Criteria** (what must be TRUE):

  1. `fixtures/style-specs/example-style/` est chargée par Python ET TypeScript sans drift (deep-equal + parité de clés via le bridge ordonné) et son hash sha256 est enregistré dans chaque manifest
  2. `catalogue.json` contient 8–12 recettes déclarant `id, family, duration_ms, easing, keyframe_shape, intensity_range, theme_anchors` ; un id hors vocabulaire (`disco-spin`), un easing hors StyleSpec ou un `theme_anchors: []` rejettent le chargement des deux côtés
  3. Un bump simulé de `style_version` flaggue tous les assets pinnés sur l'ancienne version (PATCH → échantillonné, MINOR → tokens touchés, MAJOR → tous) via la gate scan des `AssetSpec.style_ref`
  4. `StyleRefinement` existe en type delta-only, modèle clos des deux côtés : un hex libre, un path ou un `<svg>` dans un champ est rejeté (`"#fff"`, `"<path"` → ValidationError)
  5. Le catalogue verbatim + son hash sont câblés comme fixture du template de system prompt versionné (placeholder asserté par test ; l'enregistrement du hash au manifest est en place)

**Canonical refs**: `docs/project/05_Style.md` (§5.1–§5.9) · `docs/project/04_Modeles.md` §4.4 (vocabulaire clos)
**Plans:** 6/6 plans complete

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Gate légitimité PyYAML + tracer fixture style end-to-end (style.yaml hashé §5.2.2 → loader → bridge ordonné → palette.json sync) + vocabulaire `ThemeAnchorId` (D-02/D-04/D-10/D-11)
- [x] 02-02-PLAN.md — `StyleRefinement` delta-only deux côtés + harnais de rejet partagé (STY-02 partial)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-03-PLAN.md — `AssetSpec.content_hashes` étendu à 4 champs, same-commit §4.14 (D-16) *(sequenced after 02-01 — shared builders edit)*
- [x] 02-04-PLAN.md — `CatalogRecipe`/`RecipeCatalogue` + validateurs collect-all §5.5.3 + fixtures catalogue.json/coverage-map.json verbatim + parité bilingue + cross-ref easing conjointe (D-01/D-15/D-17)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-05-PLAN.md — Gates bloquantes : rejets catalogue harnais partagé, audit de couverture D-14 (A/B), same-commit 4 fichiers (C), gate `scan_stale_pins` + 2 tests bloquants (D-06..D-09)
- [x] 02-06-PLAN.md — Mécanisme prompt-fixture verbatim + hash (D-13) + enregistrement au manifest (critère 5)

### Phase 3: Motion Compiler & SVG Sanitizer

**Goal**: La moitié déterministe TypeScript prend vie : le Motion Compiler, **seul producteur de Lottie JSON** (ADR-01), transforme les specs typées en Lottie canonique + SVG compagnon statique ; le SVG Sanitizer enforce la gate dure d'hygiène (pas de `<text>`, pas de raster, IDs stables, SVGO 4 verrouillé ADR-02). Aucun LLM n'existe sur ce chemin de code.
**Depends on**: Phase 1, Phase 2
**Requirements**: COM-01, COM-02, COM-03, COM-04, SAN-01, SAN-02, SAN-03, SAN-04, SAN-05
**Success Criteria** (what must be TRUE):

  1. Même `RenderSpec` → mêmes bytes : golden files byte-for-byte par recette, deux compilations indépendantes produisent des sorties identiques (COM-01)
  2. Le grep CI bloque tout import `langchain`/`openai`/`anthropic` dans `package.json`/`tsconfig`/sources du backbone (COM-02)
  3. Un JSON invalide ne sort jamais du compiler (re-validation zod `LottieJSON` avant retour) ; les features hors subset pinné (3D, audio, negative stretch, expressions vivantes) sont rejetés dur ou bakés en keyframes, champ `v` pinné (COM-03, COM-04)
  4. La matrice de rejet bloque `<text>`/`<tspan>`, raster et data URIs base64, `<foreignObject>`, `<script>`, event handlers, URIs `javascript:` et `xlink:href` externe (SAN-01, SAN-02, SAN-05)
  5. `viewBox` et `<title>` survivent à SVGO 4 (test de régression ADR-02) et les IDs `{asset_id}_{component}_{role}` assignés par le compiler sont identiques entre deux régénérations (diff = ∅) (SAN-03, SAN-04)

**Canonical refs**: `docs/project/06_Backbone.md` (§6.1–§6.8) · `docs/project/02_Architecture.md` §2.9 (ADR-01, ADR-02)
**Plans:** 8 plans

Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Frontière npm légitimée (checkpoint:human-verify svgo+tsx, T-03-SC) + socle déterministe `format.ts` (D-23/D-24/D-35)

**Wave 2** *(blocked on Wave 1)*

- [x] 03-02-PLAN.md — Contrats gelés RenderSpec/LottieJSON/Sanitizer (D-01/D-13, COM-03/COM-04 schema layer) + harnais de rejet D-29 (`expect_code`)

**Wave 3** *(blocked on Wave 2)*

- [ ] 03-03-PLAN.md — `make_render_spec()` + 11 fixtures RenderSpec + checkpoint:decision galerie (conflit D-03 × D-05)

**Wave 4** *(blocked on Wave 3)*

- [ ] 03-04-PLAN.md — TRACER: a-001 (fade) → compile → re-validation zod → sanitize → IDs stables (seam compiler→sanitizer, D-17)

**Wave 5** *(blocked on Wave 4)*

- [ ] 03-05-PLAN.md — Motion complet: keyframe-emitter exhaustif 10 formes + 5 générateurs + markers/pose D-15 + feature gate svg-only (COM-04)

**Wave 6** *(blocked on Wave 5)*

- [ ] 03-06-PLAN.md — 11 goldens byte-exacts (D-03/D-24/D-25) + double-spawn déterminisme (D-26/D-37) + IDs stables (COM-01/SAN-03)
- [ ] 03-07-PLAN.md — Sanitizer: matrice adversariale SAN-01/02/05 + régression ADR-02 SAN-04 + auto-consistance D-31/D-37

**Wave 7** *(blocked on Wave 6)*

- [ ] 03-08-PLAN.md — RPC NDJSON + client Python §6.6 (D-27/D-28/D-30/D-36) + gate grep COM-02

### Phase 4: Anim QA pinnée

**Goal**: La **seule gate « shippable »** par asset existe et est reproductible : conteneur Playwright pinné (Chromium verrouillé, même image local/CI), frame walk déterministe `goToAndStop(n, true)`, diff pixelmatch calibré, smoke test theming, et `QAReport` structuré persisté — validation structurelle avant tout coût pixel.
**Depends on**: Phase 3
**Requirements**: QA-01, QA-02, QA-03, QA-04
**Success Criteria** (what must be TRUE):

  1. Chaque Lottie est chargé dans le conteneur pinné (tag Docker enregistré dans chaque `QAReport.qa_container_tag`) et parcourt toutes les frames en `goToAndStop(n, true)` avec `setSpeed(0)` ; flake < 1 % mesuré sur 10 runs consécutifs du même input (QA-01)
  2. Chaque asset est comparé à sa baseline via pixelmatch avec `maxDiffPixels` calibré (frame canonique + 3 frames échantillonnées) ; un seul asset au-delà de son seuil = pack échoué, jamais de moyenne (QA-02, QA-03)
  3. Le smoke test theming rejette un rendu dark dont le diff light/dark ≤ 5 % dans les régions `theme_anchors` (`reason_codes: ["theme:noop"]`)
  4. Un `QAReport` Pydantic/zod strict par asset (pass/fail, `reason_codes` canoniques, stats pixel, tag conteneur) est validé structurellement **avant** tout diff pixel puis persisté au manifest ; `reason_codes` non vide ssi échec (QA-04)
  5. La QA complète est exécutable en CI depuis un fresh checkout (workflow dédié, image pinnée, sans secrets)

**Canonical refs**: `docs/project/07_AnimQA.md` (§7.1–§7.11) · `docs/project/06_Backbone.md` §6.3.4 (feature gate réutilisée)
**Plans**: TBD

### Phase 5: Manifest Store & checkpointer

**Goal**: La mémoire durable de l'usine : store SQLite single-file (5 tables, création idempotente, WAL) comme source de vérité du yield/licensing/traçabilité, et checkpointer `langgraph-checkpoint-sqlite` qui rend un run de 50 assets crash-recoverable sans travail dupliqué ni double facturation.
**Depends on**: Phase 1, Phase 3, Phase 4
**Requirements**: MFT-01, MFT-02, MFT-03, ORC-04
**Success Criteria** (what must be TRUE):

  1. `init_db()` exécuté deux fois crée idempotemment les 5 tables (`recipes`, `assets`, `qa_reports`, `pack_manifests`, `animation_ledger`) depuis un seul module, `PRAGMA integrity_check` ok, WAL actif
  2. Chaque asset inséré embarque un `AssetManifest` complet (style_version, recipe_id, model_id, seed, content hashes, `QAReport`, timestamp) qui se re-parse en Pydantic strict à la lecture (MFT-01)
  3. `aggregate_pack` calcule count/coût/first-pass yield/licence depuis les lignes assets et l'agrégat ne s'insère que si le modèle `PackManifest` le valide — l'agrégat ne peut pas mentir (MFT-02)
  4. Un run de 50 assets tué en vol (SIGKILL) puis relancé avec le même `thread_id` reprend au dernier checkpoint : attempts inchangés, lignes ledger non dupliquées, slots terminaux sautés (ORC-04)
  5. Le backup est un `cp` documenté avec test de restore (le pack manifest se relit depuis le `.bak`) et la note de migration DuckDB est dans le schéma (MFT-03)

**Canonical refs**: `docs/project/08_ManifestStore.md` (§8.1–§8.9)
**Plans**: TBD

> **— FIN MILESTONE 1 : spine déterministe complet sans agents LLM —**
> À ce point, un asset peut être produit et persisté de bout en bout depuis des specs figées : contrats → style/catalogue → compiler/sanitizer → Anim QA → store. Milestone 2 ajoute l'intelligence (agents), l'intégration (orchestrateur), le packaging produit, la mesure (observabilité) et le ship.

### Phase 6: Agents LLM (un par un)

**Goal**: Les trois agents purs (StyleRefiner, RecipePicker, CompositionComposer) émettent des **specs typées derrière la frontière Pydantic** — jamais de SVG, path data, Lottie JSON ou code. Routeur cheap-first, idempotency keys salées, snapshot tests déterministes (zéro appel API en CI). Complète STY-02 côté agent (delta-only structurel).
**Depends on**: Phase 2 (fixtures StyleSpec + catalogue), Phase 1, Phase 5 (ledger)
**Requirements**: AGT-01, AGT-02, AGT-03, AGT-04, STY-02
**Success Criteria** (what must be TRUE):

  1. `StyleRefiner` est une fonction pure → `StyleRefinement` delta ; snapshots dorés par style exemple ; l'assertion structurelle prouve qu'aucune sortie ne porte de champ SVG/path/hex libre (AGT-01, STY-02)
  2. `RecipePicker` ne retourne **jamais** un id hors catalogue : snapshots avec cas adverses (`disco-spin`) tous rejetés à la frontière Pydantic — invention structurellement impossible (AGT-02)
  3. `CompositionComposer` émet une `CompositionSpec` (modèle clos, jamais de path data) avec ≥ 3 snapshots représentatifs **par recette** (10 recettes × ≥ 3) (AGT-03)
  4. Les appels passent par OpenRouter avec idempotency keys salées par environnement : même clé + même input = réponse cachée, zéro double facturation ; le mapping clair ne vit que dans le ledger local (AGT-04)
  5. Zéro import LangGraph dans `agents/`, l'escalade cheap→frontier est une règle de routage déterministe (jamais un re-prompt), et la CI ne fait aucun appel API (snapshots enregistrés, transport mocké)

**Canonical refs**: `docs/project/09_AgentsLLM.md` (§9.1–§9.9) · `docs/project/05_Style.md` §5.3 (contrat `StyleRefinement`)
**Plans**: TBD

### Phase 7: Translator & Pack Orchestrator

**Goal**: L'intégration qui fait **tourner l'usine pour de vrai sur 50 assets** : état typé `PackState`/`AssetState` auto-validé, fan-out `Send` ×50 à parallélisme borné 5–8, sous-graphe par asset, Translator déterministe (seule colle LLM↔compiler, complète STY-02 au Translator), retry router structuré et garde de coût pré-génération.
**Depends on**: Phase 6 (agents), Phase 3 (backbone RPC), Phase 5 (store/checkpoint)
**Requirements**: ORC-01, ORC-02, ORC-03, ORC-05
**Success Criteria** (what must be TRUE):

  1. Un état invalide injecté entre deux nœuds lève une `ValidationError` au nœud suivant — l'état n'est jamais corrompu silencieusement (ORC-01)
  2. Le fan-out émet 50 `Send` mais le compteur de concurrence mesuré pendant un run complet reste ≤ 8 assets simultanés (borné 5–8, jamais 50) (ORC-02)
  3. Le retry router escalade dans l'ordre unique re-roll seed → swap recette → escalade tier → hard fail ; les arêtes ne transportent qu'un enum d'action — « fix it with a prompt » est structurellement impossible (ORC-03)
  4. Le Translator (fonction pure, golden-file byte-identique, grep CI sans LLM reachable) combine Refinement+Selection+Composition → `RenderSpec` avec cross-checks `sub_palette ⊆ style.palette` et `intensity ⊆ intensity_range` qui échouent en `ValidationError` — complète STY-02
  5. Une projection > €0,05/asset au nœud `cost_screen` produit un rejet structuré `rejected_cost` au manifest avec **zéro appel LLM** (zéro ligne ledger créée) (ORC-05)

**Canonical refs**: `docs/project/10_Orchestrateur.md` (§10.1–§10.12) · `docs/project/05_Style.md` §5.4 (cross-check Translator)
**Plans**: TBD

### Phase 8: Packager multi-framework

**Goal**: Le dernier module déterministe transforme **un seul Lottie JSON canonique** en 4 exports dev-ready (React/Vue/Flutter/HTML) + variante dark-mode sémantique (dotLottie `themeId` + `theme_anchors`, ADR-05) : le pack devient un produit installable. Le Packager est déterministe : il ne consomme que les sorties compiler/QA/store et les `RenderSpec` du Translator (Phase 7) — aucun agent sur son chemin.
**Depends on**: Phase 3 (compiler/sanitizer `nm`/theme anchors), Phase 4 (smoke test theming), Phase 5 (store, `dotlottie_sha256`), Phase 7 (RenderSpec)
**Requirements**: EXP-01, EXP-02, EXP-03, EXP-04, EXP-05
**Success Criteria** (what must be TRUE):

  1. React (lottie-react 3.1) et Vue (dotlottie-vue 0.5+) rendent le **même** JSON ; la prop `theme` met à jour les couleurs sans re-mount (`setTheme` natif Vue dans un `watch`, `applyTheme(structuredClone(...))` déterministe React) (EXP-01, EXP-02)
  2. Le widget Flutter (lottie 3.5.1) rend depuis deux JSON pré-appliqués light/dark générés au packaging, avec `pubspec.yaml` valide par asset (EXP-03)
  3. L'export HTML pur rend via `lottie-svg` vendored (< 30 Ko) avec fallback lottie-web 5.13.0 et poster statique (EXP-04)
  4. Le smoke test theming de la Phase 4 repasse **sur la sortie packagée** : diff light/dark > 5 % via `themeId` + `theme_anchors` (ADR-05) (EXP-05)
  5. Le codegen est déterministe (golden files de templates), `lottie-web` n'est jamais re-bundlé (`external`/`peerDependencies` vérifiés par grep), et `dotlottie_sha256` est ajouté au modèle + store en same-commit

**Canonical refs**: `docs/project/11_Packager.md` (§11.1–§11.9) · `docs/project/02_Architecture.md` §2.9 (ADR-04, ADR-05)
**Plans**: TBD

### Phase 9: Observabilité & gardes coût/yield

**Goal**: **Mesurer, pas supposer** : traçage Langfuse self-host de chaque appel LLM et nœud déterministe, `cost_eur` calculé depuis `prices.yaml` versionné (jamais saisi), yield-report CLI, et gardes roulantes (coût/yield) qui bloquent ou flaggent — jamais de « fix » automatique (ADR-06 : l'humain décide).
**Depends on**: Phase 5 (ledger), Phase 6 (agents), Phase 7 (orchestrateur)
**Requirements**: OBS-01, OBS-02, OBS-03, KPI-01, KPI-02
**Success Criteria** (what must be TRUE):

  1. Chaque appel LLM et nœud déterministe est tracé (Langfuse self-host, fallback LangSmith) avec tags `pack_id`, `asset_id`, `idempotency_key` (hashé), `stage`, `attempt`, `model_id` ; backend injoignable → spool JSONL sans perte avec warning, ré-envoi au run suivant (OBS-01)
  2. `cost_eur` par asset est calculé depuis `prices.yaml` versionné ; un prix manquant pour un `model_id` utilisé = erreur dure ; `totals.cost_eur` du pack = somme du ledger, jamais saisie (OBS-02)
  3. `python -m lottie_forge yield-report <pack-id>` sur un ledger fixture montre le coût et le yield calculés depuis le store (attempt == 1), **ou** rend la violation et ses contributeurs (recette/modèle/stage) explicites dans le Markdown (KPI-01, KPI-02)
  4. Un first-pass yield < 70 % sur la fenêtre roulante de 10 packs rend le pack **non shippable** (blocage du ship-gate jusqu'à décision humaine) ; aucune garde ne modifie le routage ni ne relance un asset (OBS-03)
  5. `bench.yml` parse la table de prix et exécute son dry-run en CI sans aucun appel externe

**Canonical refs**: `docs/project/12_Observabilite.md` (§12.1–§12.9)
**Plans**: TBD

### Phase 10: Hardening, licence runtime & ship-gate humain

**Goal**: Durcissement de production **sans changement d'architecture** : `license.txt` généré depuis `LicenseInfo` (expression runtime de la gate structurelle de Phase 1), rebuild déterministe byte-identique depuis le manifest, passe « looks done but isn't » en gate de release, **premier pack end-to-end** produit en CI puis en réel, et ship-gate humain (ADR-06 : l'humain est éditeur, pas producteur). Complète LIC-01/02 (runtime) et QA-05.
**Depends on**: Phase 7, Phase 8, Phase 9
**Requirements**: LIC-01, LIC-02, QA-05
**Success Criteria** (what must be TRUE):

  1. Chaque pack embarque un `license.txt` généré depuis `LicenseInfo` (perpétuel one-time, usage commercial autorisé, attribution optionnelle) ; la gate CI de cohérence vérifie termes == champs et le grep interdits (`subscription`, `auto-renew`, `per seat`, `attribution required`) trouve zéro occurrence (LIC-01, LIC-02)
  2. `python -m lottie_forge rebuild --manifest pack.json` régénère SVG + Lottie **byte-identiques** (sha256 des artefacts == hashes stockés, tout mismatch = échec dur)
  3. La passe « looks done but isn't » (13 checks automatisés) est verte en job CI `release-gate` — le pack n'atteint pas le ship-gate tant qu'un check échoue
  4. Le premier pack end-to-end en CI (fresh checkout, snapshots en lieu des agents) produit l'artefact complet téléchargeable : 4 exports × 50 assets + `manifest.json` + `yield-report.md` + `license.txt` + `index.html` de revue (50 players, toggle light/dark)
  5. Un pack non approuvé n'est jamais tagué shippable : `ship --approve` enregistre `shippable=1`, `approved_by`, `approved_at`, `preview_sha256` ; l'étape packaging refuse un pack `shippable=0` ; un rejet persiste la raison et renvoie en retry — jamais d'édition manuelle d'asset (QA-05, ADR-06)

**Canonical refs**: `docs/project/13_Hardening.md` (§13.1–§13.10) · `docs/project/04_Modeles.md` §4.8 (gate structurelle licence)
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 *(FIN MILESTONE 1)* → 6 → 7 → 8 → 9 → 10 *(FIN MILESTONE 2)*

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Contrats de données & frontière Pydantic↔zod (reconstruction) | 5/5 | Complete | 2026-08-29 |
| 2. Style verrouillé & catalogue de recettes | 6/6 | Complete    | 2026-08-31 |
| 3. Motion Compiler & SVG Sanitizer | 1/8 | In Progress (Wave 1 ✓) | 2026-09-01 |
| 4. Anim QA pinnée | 0/0 | Not started | - |
| 5. Manifest Store & checkpointer | 0/0 | Not started | - |
| 6. Agents LLM (un par un) *(M2)* | 0/0 | Not started | - |
| 7. Translator & Pack Orchestrator *(M2)* | 0/0 | Not started | - |
| 8. Packager multi-framework *(M2)* | 0/0 | Not started | - |
| 9. Observabilité & gardes coût/yield *(M2)* | 0/0 | Not started | - |
| 10. Hardening, licence runtime & ship-gate humain *(M2)* | 0/0 | Not started | - |

## Coverage

| Domaine | Exigences | Phase |
|---------|-----------|-------|
| Contrats & Modèles (DM) | DM-01→05 | 1 |
| Style (STY) | STY-01, STY-03, STY-02 (partial) | 2 · STY-02 → 6 (agent) · complétée au Translator → 7 |
| Mouvement (MOT) | MOT-01→04 | 2 |
| Compilation (COM) | COM-01→04 | 3 |
| Sanitisation SVG (SAN) | SAN-01→05 | 3 |
| Anim QA (QA) | QA-01→04 | 4 · QA-05 → 10 |
| Manifest Store (MFT) | MFT-01→03 | 5 |
| Orchestration (ORC) | ORC-04 → 5 · ORC-01/02/03/05 → 7 |
| Agents LLM (AGT) | AGT-01→04 | 6 |
| Exports (EXP) | EXP-01→05 | 8 |
| Observabilité (OBS) | OBS-01→03 | 9 |
| KPIs (KPI) | KPI-01/02 | 9 |
| Licence (LIC) | LIC-01/02 | 10 (structurel : Phase 1, runtime : Phase 10) |

**50/50 exigences v1 mappées — aucune orpheline, aucun doublon.** Les mappings détaillés sont dans la table Traceability de `REQUIREMENTS.md`.
