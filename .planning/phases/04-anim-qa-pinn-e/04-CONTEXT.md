# Phase 4: Anim QA pinnée - Context

**Gathered:** 2026-09-03
**Status:** Ready for planning

<domain>
## Phase Boundary

La **seule gate « shippable » par asset** existe et est reproductible : conteneur Playwright pinné (Chromium verrouillé, même image local/CI), frame walk déterministe `goToAndStop(n, true)` avec `setSpeed(0)`, diff pixelmatch calibré (frame canonique + 3 frames échantillonnées 25/50/75 %), smoke test theming light/dark, et `QAReport` structuré Pydantic/zod validé **avant** tout diff pixel. Gate ordonnée en 5 étapes (§7.3 : structurel → feature gate → diff structurel → frame walk/diff → theme smoke), les étapes 1–3 sans navigateur. Scaffold multi-renderer §7.7 (passes réelles lottie-react/dotlottie-vue, colonne manifest pour Flutter). Exposition RPC `anim_qa.run` dans `src/rpc/server.ts`. Workflow CI dédié `qa.yml` avec preuve flake. QA-01→04 (QA-05 reste Phase 10) ; l'insertion des QAReports au store = Phase 5 (MFT-01) ; le rollup pack « un asset échoué = pack échoué » (QA-03) est enforce par les seuils par asset ici, l'orchestrateur Ph 7 consommera `passed` + `reason_codes`. Aucun LLM sur ce chemin de code.

</domain>

<decisions>
## Implementation Decisions

### Environnement pinné & exécution
- **D-01:** **Pin tag + lock digest** — tag exact de l'image Playwright officielle (patch compris, ex. `v1.61.1-noble`, Chromium uniquement) + digest sha256 piné dans un fichier lock dédié (`qa-container.lock`) référencé par les scripts : lisible au quotidien, immuable en CI même si Microsoft re-pousse le tag. Le tag verbatim est enregistré dans chaque `QAReport.qa_container_tag`. Flags `--no-sandbox --disable-dev-shm-usage` (§7.2).
- **D-02:** **QA locale = script `docker run`** (ex. `qa:run`) : image lockée, repo monté en volume, zéro Playwright bare-metal sur la machine Windows — conforme à l'interdit §7.2 (rendu non pinné = flake). Le même chemin d'exécution sert à `baseline:update`.
- **D-03:** **Workflow CI dédié `qa.yml`** : job `container:` avec l'image lockée, exécutable depuis fresh checkout, sans secrets. **`verify.yml` reste byte-identique** (doctrine D-18 Ph 2) ; les tests unitaires vitest de `src/anim-qa/` restent ramassés par `verify`.
- **D-04:** **Cadence flake : 1 run QA par PR, preuve 10 runs consécutifs sur push `main` + schedule nightly** — les régressions sont capteses à chaque PR, la preuve < 1 % reste continue sans alourdir chaque PR.

### Baselines & calibration
- **D-05:** **`baseline:update` = patron `goldens:update` répliqué** (D-25/D-37 Ph 3) : tourne dans le conteneur pinné **en local**, refuse si `CI=true`, régénère les PNG atomiquement ; le refresh est **commité same-commit** avec le changement de recette/compiler. La CI ne fait que comparer, jamais régénérer. Baselines dans `fixtures/style-specs/example-style/baseline-frames/` (nées en Ph 4, D-05 Ph 2).
- **D-06:** **Seuils versionnés par asset** : fichier versionné (ex. `fixtures/qa/thresholds.json`) avec un `maxDiffPixels` par `asset_id` + une valeur par défaut — doctrine « données versionnées » (comme `catalogue.json`), calibrage fin par recette, changements traçables au diff.
- **D-07:** **Spike de calibration = première tâche livrée de la phase** : mesurer le bruit d'antialiasing du conteneur pinné (runs répétés sur l'asset de référence), `maxDiffPixels = bruit observé × marge`, écrire `thresholds.json` + `docs/qa.md` (méthode + valeurs) commités — le spike devient un artefact, pas une estimation.
- **D-08:** **Frame canonique alignée sur la règle de pose D-15 Ph 3** : recettes `enter` → frame finale (fin du marker `enter` déjà émis par `markers.ts`), recettes `loop` → frame 0. Évite les frames vides non informatives (fade/slide à frame 0 = opacité 0) et garde la cohérence avec le poster SVG statique. Frames échantillonnées = 25 % / 50 % / 75 % de la durée (§7.4 verbatim). Échec de la frame canonique = rejet immédiat sans lire les autres (économie §7.4).

### Smoke test theming
- **D-09:** **Mécanisme dark par défaut = dotLottie `setTheme`** (`@lottiefiles/dotlottie-web` dans la page QA) — verbatim §7.9, et c'est le chemin de production Ph 8 (ADR-05 `themeId` + `theme_anchors`) : la QA prouve le vrai mécanisme, EXP-05 le re-testera tel quel. Nouveau dep npm → gate `checkpoint:human-verify` (pattern svgo+tsx Ph 3).
- **D-10:** **Couleurs du thème dark = fixture QA dédiée versionnée** (`fixtures/qa/dark-theme.json`), choisies pour la QA uniquement, explicitement **non-produit** — respecte D-12 Ph 2 (le mapping anchor→couleur reste l'affaire de la Phase 8). Le smoke est un test d'effet (ça change visiblement), pas un test de couleurs justes.
- **D-11:** **« Régions theme_anchors » = masks par IDs stables** : éléments résolus par ID `{asset_id}_{component}_{role}` (D-32 Ph 3) dans la page QA, bbox par anchor, le diff ne compte que les pixels des régions d'anchors — réutilise directement le travail IDs de la Ph 3.
- **D-12:** **Seuil theming agrégé** : un pourcentage sur l'**union** des régions d'anchors, comparé à 5 % (`theme:noop` si ≤) — colle au contrat `theme_diff_pct` (un seul float §7.6) ; **log non bloquant par ancre** pour l'observabilité ; la granularité par ancre reste possible en v2.

### Contrat QAReport
- **D-13:** **`ReasonCode` = Literal fermé des 7 codes canoniques §7.6** (`structural:schema`, `feature:3D`, `stretch:negative`, `shape:layers`, `pixel:canonical`, `pixel:p95`, `theme:noop`) des deux côtés, extension = règle same-commit — même philosophie que RecipeId/ThemeAnchorId/codes RPC D-28 ; un code inconnu est rejeté à la validation ; `reason_codes` non vide ssi `passed == false`.
- **D-14:** **QAReport = contrat traversant complet dès la Ph 4** : modèle Pydantic §7.6 verbatim (`PixelDiffStats` + `QAReport`) + miroir `QAReportSchema` zod strictObject + cas de rejet partagés `fixtures/rejection-cases/qa-report.json` (format D-08 Ph 1) + chaîne bridge ordonnée étendue — le store Ph 5 (MFT-01) ré-parse un contrat déjà prouvé des deux côtés.
- **D-15:** **« Persisté au manifest » en Ph 4 = artefact de run déterministe** : QAReport JSON par asset en sortie de `anim_qa.run` (répertoire de sortie + artefacts bridge commités pour la parité), `timestamp` injectable → rapport reproductible hors horloge et exclu des content hashes (§7.6) ; l'insertion réelle au store = Phase 5 (MFT-01). Pas de mini-store anticipé.
- **D-16:** **Input QA = compile à la volée** : le job qa compile les 11 fixtures render-specs dans le conteneur (fixtures → compile → sanitize → QA) — la chaîne déterministe complète est prouvée en un job depuis fresh checkout ; le compile est byte-déterministe (D-26 Ph 3) donc aucun flake ajouté ; les goldens restent la prérogative de `verify.yml`.

### Surface RPC `anim_qa.run`
- **D-17:** **Méthode unique `anim_qa.run`** : les 5 étapes enchaînées en interne — l'ordonnancement interne reste la responsabilité du module, la gate ordonnée §7.3 est un invariant du module et non une convention d'appel.
- **D-18:** **Requête = `{ lottie, asset_id, renderer_support }` — zéro chemin** : le Lottie JSON passe inline (NDJSON compact D-24/D-27), `renderer_support` (enum clos D-11 Ph 3, zod à l'entrée) provient de l'enveloppe `compile()` (source unique), jamais ré-dérivé par le serveur. Le serveur résout lui-même les baselines (lazy, par `asset_id`) et les configs versionnées (`thresholds`, `dark-theme`, `captureConfig` chargées au startup — pattern maison Ph 3 catalogue/style) via un **résolveur partagé pur dans `baseline.ts`**, unit-testable. Résolveur orphelin = erreur `baseline_missing` (code fermé D-28). Zéro chemin dans la requête = zéro surface d'injection, zéro couplage caller/layout, Lottie jamais écrit sur disque avant QA (fan-out ×50 Ph 7). — **Reversibility:** costly — la forme de la requête sera consommée telle quelle par l'orchestrateur Ph 7 ; la changer après coup = migration transport Py + TS.
- **D-19:** **Réponse = QAReport complet + pointeurs vers les artefacts écrits** (chemins des PNG frames/diff sous le répertoire de sortie passé **à l'activation du serveur**, jamais par requête) ; les PNG sont des artefacts de run, pas des données de contrat.

### Assets svg-only & routage theming
- **D-20:** **Smoke theming exécuté sur tous les assets, routé par `renderer_support`** : `all` → dotLottie `setTheme` (défaut §7.9) ; `svg-only` → **`applyTheme` déterministe sur lottie-web SVG** — le chemin de theming production exact de cette classe en Ph 8 (export React, EXP-01). Ni skip, ni échec dur, ni smoke wasm sur incompatible. **Champ additif `QAReport.theme_smoke_path: Literal["dotlottie-setTheme", "applyTheme-svg"]`** same-commit deux côtés (pattern D-16 Ph 2) — on enregistre le mécanisme mesuré, jamais « skipped ». `applyTheme` = **fonction pure née en Ph 4** avec tests unit, réutilisée telle quelle en Ph 8. Mêmes régions (masks D-11), même seuil agrégé > 5 %, même frame canonique pour les deux chemins ; le breakdown par ancre note le chemin utilisé. — **Reversibility:** costly — `applyTheme` et `theme_smoke_path` seront consommés par le packager Ph 8 ; les changer après coup = migration contrats + exports.
- **D-21:** **Preuve complète des deux chemins en Ph 4, zéro churn du domaine figé** : (1) unit : `applyTheme` fonction pure testée sur Lottie synthétique minimal (layers `nm`=anchors, fills), esprit D-33 Ph 3 ; (2) E2E conteneur : cas svg-only **synthétique test-local** (hors set D-03/goldens Ph 3) — Lottie hand-built + `renderer_support: "svg-only"` → `anim_qa.run` route sur applyTheme-svg, assert smoke passé + `theme_smoke_path = "applyTheme-svg"`. Les 11 fixtures « all » prouvent le chemin dotLottie E2E.

### Résolution de capture
- **D-22:** **Capture 1× natif** : viewport = viewBox du style (400×300, §5.2.2) à `deviceScaleFactor` 1 — PNG légers, bruit antialiasing minimal, seuils calibrés à cette résolution ; la `captureConfig` versionnée permet d'ajuster plus tard (refresh baseline same-commit). Baseline et QA capturent identique par construction (même config, même conteneur).
- **D-23:** **Fond opaque fixe dans la `captureConfig`** (valeur par défaut tranchée au planning, ex. blanc) — pas d'alpha dans les diffs : pixelmatch compare de l'opaque pur, le bruit de blending alpha disparaît, les bytes PNG sont stables.

### Frontière tests & preuves CI
- **D-24:** **Unit vitest (dans `verify`) = tout ce qui ne demande pas Chromium** : structural (zod `LottieJSONSchema` Ph 3 + feature gate + diff structurel), `diff.ts` (pixelmatch sur paires PNG synthétiques), `report.ts` (parité bridge QAReport), résolveur baseline (chemins purs), `applyTheme` (fonction pure). **Conteneur `qa.yml` = frame-walker, runner, smoke theming, preuves E2E** — le loop dev reste rapide, le navigateur ne tourne que pinné.
- **D-25:** **Preuve flake = identité stricte ×10** : le run nightly lance 10 QA consécutives même input et **asserte l'identité stricte des 10 QAReports (hors timestamp)** — le critère « < 1 % » devient une égalité mesurable : tout flake, même sous les seuils, rougit ; le compteur reste dans le log pour la métrique.
- **D-26:** **Sidecar anti-baseline-périmée** : `baseline:update` écrit `baseline-frames/index.json` (lottie_sha256 par asset + version des configs QA) ; la QA compare au hash du Lottie reçu **avant tout diff** — mismatch = erreur `baseline_missing`/stale (code fermé), jamais un faux `pixel:*` ; diagnostic propre pour le retry_router Ph 7.

### Scaffold multi-renderer §7.7
- **D-27:** **Scaffold multi-renderer** : `lottie-react` 3.1 et `@lottiefiles/dotlottie-vue` 0.5+ (players web) = **passes réelles** dans le même conteneur pinné (mêmes fixtures, mêmes seuils), résultats par renderer enregistrés en artefacts + **colonne `renderer` au manifest** ; `lottie` Flutter 3.5.1 (aucun player web) = **colonne manifest uniquement, zéro run** (matrice complète v2, AQA-02). **Aucun test skippé** (gate zero-skip) : le scaffold = runs réels ou entrées manifest, jamais skip. Deps npm pins exacts + gate human-verify (pattern svgo+tsx). `renderer_support` reste la feature gate compile (D-11 Ph 3, source de vérité) ; une passe scaffold qui échoue sur un asset `renderer_support="all"` = rouge (contradiction gate/réalité) ; le verdict QAReport principal reste `lottie-web-svg` (§7.6) ; rapports QA par renderer = v2 (AQA-02).

### the agent's Discretion
- Tag exact de l'image Playwright + digest (recherche au planning — version courante conforme « 1.61+ » §3 Stack)
- Valeur par défaut du fond opaque (`captureConfig`) et valeur de la marge du spike (`bruit × marge`, §7.5 — documentée dans `docs/qa.md`)
- Structure interne des modules `src/anim-qa/` (§7.8 nomme déjà runner/frame-walker/diff/baseline/structural/report — découpage fin libre)
- Champs exacts de `captureConfig` et layout du répertoire de sortie des artefacts de run
- Organisation interne du `qa.yml` (jobs/steps, upload d'artefacts en échec) dans le respect de D-03/D-04
- Wording de `docs/qa.md`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spécification cœur de la phase
- `docs/project/07_AnimQA.md` — Partie 7 entière (§7.1–§7.11) : principes, environnement pinné §7.2, ordonnancement des 5 étapes §7.3, baseline & échantillonnage §7.4, seuils & calibration §7.5, contrat QAReport §7.6 (modèle Pydantic verbatim), scaffold multi-renderer §7.7, structure des modules §7.8, critères §7.9, extensions différées §7.11
- `docs/project/06_Backbone.md` — §6.3.4 (feature gate `SupportedLottieFeature` réutilisée à l'étape 2), §6.5 (frontière RPC NDJSON + enveloppe codes fermés), §6.6 (tests d'intégration), §6.2 (structure `src/`)
- `.planning/ROADMAP.md` — Phase 4 (goal, 5 critères de succès)
- `.planning/REQUIREMENTS.md` — QA-01→04 (définitions testables)

### Stack, architecture & données héritées
- `docs/project/03_Stack.md` — pins (Playwright 1.61+, pixelmatch + pngjs, resvg-js, lottie-web 5.13.0, Node 20) ; §3.6 job CI `verify` (inchangé, D-03)
- `docs/project/02_Architecture.md` — composant Anim QA (`src/anim-qa/`), §2.9 (ADR-01 Lottie seul mouvement ; ADR-05 theming dotLottie), §2.7 (structure monorepo, emplacement fixtures/)
- `docs/project/05_Style.md` — §5.2.2 (viewBox 400×300 → résolution de capture D-22), §5.5 (catalogue : durées des frames échantillonnées, theme_anchors)
- `docs/project/04_Modeles.md` — §4.14 (règle d'extension same-commit des modèles clos — s'applique à `theme_smoke_path` D-20)

### Patterns des phases précédentes
- `.planning/phases/01-contrats-de-donn-es-fronti-re-pydantic-zod-reconstruction/01-CONTEXT.md` — D-06/D-07/D-08 (harnais de rejet partagé JSON, format des cas — répliqué pour `qa-report.json` D-14)
- `.planning/phases/02-style-verrouill-catalogue-de-recettes/02-CONTEXT.md` — D-05 (`baseline-frames/` naît en Ph 4), D-10/D-11/D-12 (ThemeAnchorId, mapping anchor→couleur = Ph 8), D-16 (pattern extension same-commit), D-18 (verify.yml inchangé)
- `.planning/phases/03-motion-compiler-svg-sanitizer/03-CONTEXT.md` — D-02 (`nm` = anchor), D-11 (`renderer_support` meta), D-15 (pose enter→finale / loop→t0 — alignement D-08), D-25/D-37 (patron goldens:update refusé en CI — répliqué D-05), D-27/D-28 (framing NDJSON + enveloppe codes fermés), D-32 (IDs 2/3 segments — masks D-11), D-33 (esprit test de branche forcée — D-21)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/rpc/server.ts` — y ajouter la méthode `anim_qa.run` (framing NDJSON D-27 et enveloppe D-28 déjà en place, codes fermés à étendre avec `baseline_missing`)
- `src/rpc/contracts/motion-compiler.schema.ts` — `LottieJSONSchema` (réutilisé tel quel à l'étape 1 structurelle) ; `RendererSupport` (enum clos D-11, validé à l'entrée RPC D-18)
- `src/motion-compiler/feature-gate.ts` — étape 2 de la gate (réutilisation directe)
- `src/motion-compiler/markers.ts` — markers `enter` émis par le compiler → sélection de la frame canonique (D-08)
- `fixtures/render-specs/*.json` + `src/motion-compiler/__tests__/make-render-spec.ts` — inputs de la compile à la volée (D-16)
- `scripts/update-goldens.mjs` — patron à répliquer pour `baseline:update` (D-05) avec garde `CI=true`
- `lottie_forge/rpc/client.py` — transport générique pour les tests d'intégration Python de `anim_qa.run`
- `fixtures/rejection-cases/` + `src/rpc/contracts/rejection-cases.ts` + `tests/bridge/rejection_loader.py` — harnais D-08 à étendre avec `qa-report.json` (D-14)
- `src/shared/format.ts` — `fmt()`/`serializeDeterministicJson()` pour tout byte du run QA (QAReport JSON, sidecar index.json)

### Established Patterns
- Bridge ordonné pytest→vitest→pytest, artefacts byte-identiques, zéro test skippé (junitxml) — `verify.yml` inchangé, les gates Ph 4 unit sont des tests ordinaires ; la QA conteneur vit dans `qa.yml` (D-03)
- Règle same-commit (extensions de contrats D-14/D-20, refresh baselines D-05) et `.gitattributes` eol=lf (prérequis bytes)
- Gate `checkpoint:human-verify` pour tout nouveau dep npm (playwright, pixelmatch, pngjs, resvg-js, @lottiefiles/dotlottie-web, lottie-react, dotlottie-vue — pins exacts, D-09/D-27)
- Données versionnées comme source de vérité (thresholds, dark-theme, captureConfig — D-06/D-10/D-22)

### Integration Points
- Enveloppe `compile()` (`renderer_support`) → requête `anim_qa.run` — source unique, jamais ré-dérivée (D-18)
- `nm`/IDs stables (`{asset_id}_{component}_{role}`) → masks theming (D-11)
- `QAReport` → store Ph 5 (MFT-01, ré-parse Pydantic strict) ; `passed` + `reason_codes` → retry_router Ph 7 (jamais l'inverse, §7.6)
- `applyTheme` + `theme_smoke_path` + colonne `renderer` → packager Ph 8 (EXP-01/EXP-05, ADR-05)
- `baseline_missing`/stale (sidecar D-26) → diagnostic propre pour le retry_router Ph 7
- Smoke theming Ph 4 → re-passé sur la sortie packagée en Ph 8 (EXP-05)

</code_context>

<specifics>
## Specific Ideas

- **La requête RPC ne porte jamais de chemin de fichier** — zéro surface d'injection de path, zéro couplage caller/layout ; les configs sont résolues au startup, les baselines lazy par `asset_id` (D-18)
- **Le thème dark QA est une fixture non-produit** — le mapping anchor→couleur réel reste Ph 8 (D-10, respect D-12 Ph 2)
- **Preuve flake = identité stricte des 10 QAReports hors timestamp**, pas seulement le verdict (D-25)
- **Mismatch baseline ≠ asset cassé** : le sidecar de hashes tranche avant tout diff (D-26) — jamais un faux `pixel:*`
- **Zéro test skippé pour le scaffold multi-renderer** : runs réels ou entrées manifest, jamais skip (D-27)
- **Le verdict principal QAReport reste `lottie-web-svg`** (§7.6) — les passes scaffold sont des preuves additionnelles, pas des verdicts parallèles (D-27)
- **Échec de la frame canonique = rejet immédiat** sans lire les autres frames (économie §7.4, D-08)

</specifics>

<deferred>
## Deferred Ideas

- Granularité **par ancre** du seuil theming (assertion par région avec encre visible) — v2 ; le log non bloquant par ancre (D-12) garde l'observabilité d'ici là
- Rapports QA complets **par renderer** (lottie-web/ios/android/flutter, AQA-02) — v2
- Baseline enrichie de frames de référence choisies à la main (AQA-01) — v2
- Pool Playwright en production (plusieurs packs/jour) — v1 = QA sérielle par asset, parallèle entre packs (§7.11)
- Calibration continue des seuils (dérive saisonnière Chromium, revue trimestrielle avec `bench.yml`) — §7.11
- Matrice mobile Flutter réelle (run lottie 3.5.1) — aucune voie web, v2/AQA-02 (D-27)

</deferred>

---

*Phase: 04-anim-qa-pinn-e*
*Context gathered: 2026-09-03*
