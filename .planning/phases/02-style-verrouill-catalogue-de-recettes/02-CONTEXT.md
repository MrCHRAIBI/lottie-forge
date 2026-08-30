# Phase 2: Style verrouillé & catalogue de recettes - Context

**Gathered:** 2026-08-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Le style et le mouvement deviennent des **données versionnées** : fixture `fixtures/style-specs/example-style/` (style.yaml canonique §5.2.2 verbatim + palette.json généré + hash sha256), catalogue fermé `fixtures/recipe-catalogue/catalogue.json` (10 ids verrouillés ADR-03, invariant 8–12, contenu produit verrouillé ci-dessous), modèles `RecipeCatalogue`/`CatalogRecipe` Pydantic + miroir zod avec validateurs agrégés §5.5.3, type `StyleRefinement` delta-only (§5.3, les deux côtés), gate de re-validation sur bump de `style_version` (STY-03, niveau fixtures), câblage du catalogue verbatim + hash comme fixture de system prompt (MOT-04), audit de couverture motion §5.6, et extension `content_hashes` à 4 champs. La vérification Translator complète de STY-02 et l'agent StyleRefiner restent en Phase 6/7. Périmètre fixé par ROADMAP.md (STY-01, STY-02 partial, STY-03, MOT-01→04).

</domain>

<decisions>
## Implementation Decisions

### Données produit : fixture style & catalogue
- **D-01:** **Matrice des 10 recettes VERROUILLÉE** — contenu verbatim de `catalogue.json` (champs `intensity_range` / `shapes_supported` / `trigger_points` dictés par l'utilisateur ; `id, family, duration_ms, easing, keyframe_shape, theme_anchors` déjà verbatim table §5.5.2) :
  | id | intensity_range | shapes_supported | trigger_points |
  |---|---|---|---|
  | fade | [0.0, 1.0] | rect, ellipse, path | enter, exit |
  | draw-on | [0.2, 1.0] | path, polyline | enter |
  | slide | [0.2, 1.0] | rect, ellipse, path | enter, exit |
  | bounce | [0.3, 1.0] | rect, ellipse, path, polyline | enter |
  | pulse | [0.1, 0.8] | rect, ellipse, polystar | enter, loop |
  | rotate | [0.2, 1.0] | path, polyline, polystar | enter |
  | scale-pop | [0.2, 1.0] | rect, ellipse, polystar | enter |
  | float | [0.1, 0.8] | rect, ellipse, path | loop |
  | wiggle | [0.1, 0.5] | rect, ellipse, path, polyline | enter |
  | orbit | [0.3, 1.0] | ellipse, path, polystar | loop |

  Justifications des écarts vs propositions initiales : `slide` porte `exit` (slide-out canonique, états de sortie des verticales §5.6, inversion compileur identique au exit de fade) ; `pulse` plafonné à 0.8 + `loop` (respiration ambiante + one-shot d'apparition valide) ; `wiggle` plafonné à 0.5 (oscillation amortie à 1.0 = artefact, même logique que float). Validation : validateurs structurels §5.5.3 + audit §5.6 (D-14).
- **D-02:** **Hash du style = octets bruts** du `style.yaml` tel que commité — cross-plateformité garantie par `.gitattributes` (`* text=auto eol=lf`, leçon Phase 1) + normalisation LF dans le loader avant hachage. Vérifiable à la main au `sha256sum` hors usine. Pas de hash du JSON canonique. — **Reversibility:** costly — changer de régime de hash invaliderait tous les hash enregistrés dans les manifests et prompts existants.
- **D-03:** **catalogue_sha256 = même régime que style_sha256** : octets bruts du `catalogue.json` committé (LF normalisé), vérifiable hors usine, embarqué verbatim dans le prompt (§5.5.3).
- **D-04:** **palette.json = généré + commité + test de sync** : dérivé de `style.yaml`, un test asserte qu'il est identique à la dérivation du YAML — s'il dérive, la CI rougit (« the gate is the gate »). Pas une seconde source manuelle.
- **D-05:** **baseline-frames/ non créé en Phase 2** — le doc §5.2.1 interdit de le committer vide ; il naît en Phase 4 (Anim QA).

### Gate de re-validation STY-03
- **D-06:** **Fonction pure réutilisable** `scan_stale_pins(pins, current_version) -> flags structurés` — source de pins **injectable** : fixtures committées en Phase 2, manifest store en Phase 5+ (même ancre `AssetSpec.style_ref`, §5.4).
- **D-07:** **Deux tests BLOQUANTS** dans le job verify : (a) **bump simulé** — pins construits sur une version antérieure → flags attendus assertés (la « suite dédiée » §5.4, valide la logique) ; (b) **garde permanente** — scan des fixtures committées → **zéro pin stale asserté**, tout pin ≠ version courante de la fixture chargée = verify rouge (discipline same-commit du bump, dès maintenant). Rapport informatif exclu.
- **D-08:** **Flags = modèle Pydantic strict, sans miroir zod** (asset_id, pinned_version, current_version, bump_class, scope attendu) — la gate vit côté Python, rien ne traverse la frontière Py↔TS, le patron bridge ne s'applique pas.
- **D-09:** **bump_class dérivé in-fonction** par diff semver (pinned vs current) ; **scope déclaratif** en Phase 2 (échantillonné / tokens_touchés / tous) — la résolution « quels assets utilisent quels tokens » est impossible au niveau fixtures (AssetSpec ne référence pas les tokens) et arrive avec le store en Phase 5+.
- **Sémantique Phase 5+** (note de continuity) : store-backed, les flags alimentent la file de re-validation (yield report Phase 9, rebuild Phase 10) et ne sont **plus** un échec CI ; le rouge CI ne porte que sur la cohérence du repo (fixtures).

### Vocabulaire theme_anchors (MOT-03)
- **D-10:** **Literal fermé de 6 labels** : `primary, secondary, accent, background, success, danger` — même philosophie qu'ADR-03 pour RecipeId ; un label inconnu est rejeté au chargement ; nouveau label = évolution same-commit.
- **D-11:** **`ThemeAnchorId` = vocabulaire partagé same-commit** : `vocabulary.py` + `vocabulary.schema.ts` (même patron que RecipeId) — le Compiler Phase 3 (TS) assigne les `nm` depuis les anchors et le packager Phase 8 les consomme ; les deux couches valident le même set.
- **D-12:** **Anchors et noms de tokens palette = deux namespaces distincts**, validés indépendamment, **aucune cross-validation en Phase 2** — le mapping anchor→couleur est l'affaire du packaging Phase 8 (ADR-05). Ne pas inventer de couplage (l'exemple du doc le violerait : primary/background n'ont pas de token homonyme).

### Fixture prompt & audit de couverture (MOT-04, §5.6)
- **D-13:** **Mécanisme + template squelette** : module de rendu prompt-fixture (catalogue verbatim + hash injectés) + template minimal versionné avec placeholders `{{catalogue_json}}` / `{{catalogue_hash}}` ; le test asserte placeholder présent + hash injectable + enregistrement du hash au manifest. La Phase 6 remplit le template du RecipePicker, zéro refactor du mécanisme.
- **D-14:** **Audit de couverture §5.6 INCLUS et BLOQUANT** (job verify, rejeté à chaque changement de catalogue) : (A) tout état de la map mappe vers ≥ 1 recipe_id existant (état orphelin ou id inconnu = rouge) ; (B) tout recipe_id du catalogue apparaît dans ≥ 1 mapping (**recette morte = rouge** — chaque membre du catalogue fermé justifie son slot) ; (C) règle same-commit ADR-03 étendue : tout swap d'appartenance touche `vocabulary.py` + `vocabulary.schema.ts` + `catalogue.json` + **coverage-map** dans le même commit.
- **D-15:** **Coverage-map VERROUILLÉE** (donnée produit, fixture versionnée `fixtures/recipe-catalogue/coverage-map.json`) :
  - **Fintech** : succès paiement → draw-on, scale-pop · paiement refusé (alerte) → wiggle, slide · dismissal alerte (exit) → slide, fade · sync/paiement récurrent → orbit · palier solde atteint → pulse, scale-pop
  - **Dev tools** : déploiement réussi → draw-on, bounce · pipeline en cours → orbit, float · build échoué → wiggle, slide · commit/merge entrant → fade, slide · badge environnement prêt → scale-pop, pulse
  - **E-commerce** : ajout panier → scale-pop, slide · ajout favoris → pulse · confirmation commande → draw-on, fade · bannière promo → float, slide · erreur formulaire/stock → wiggle · carrousel produit → rotate, orbit

  Cohérences : les 10 recettes couvertes (aucune morte) ; états exit présents ; états continus → recettes loop (orbit, float, pulse) ; one-shot → enter. La cohérence trigger fine sera enforce au contrat RecipePicker (Phase 6), pas dans l'audit Phase 2.

### Extension du contrat AssetSpec
- **D-16:** **content_hashes étendu à 4 champs** : `svg_sha256`, `lottie_sha256`, `style_sha256`, `catalogue_sha256` — chaque manifest d'asset porte l'intégralité de ce qu'il a consommé (lecture directe du critère « enregistré dans chaque manifest »). Édition same-commit §4.14 (le mécanisme anticipé par le doc, exemple dotlottie_sha256 Phase 8) + miroir zod + nouveaux cas de rejet partagés — AssetSpec devient le 5e contrat traversant touché par la Phase 2.
- **D-17:** **Chargement conjoint des deux côtés** : la cross-référence `easing ∈ StyleSpec.easing_curves` est validée au chargement conjoint (catalogue + style) côté Py **ET** côté TS (`superRefine` zod) — la parité de rejet MOT-04 inclut « easing inconnu ».
- **D-18:** **verify.yml inchangé (doctrine byte-for-byte)** — les nouveaux tests sont ramassés par les étapes pytest/vitest existantes ; aucun changement du workflow CI.

### the agent's Discretion
- Organisation fine des modules (emplacement des loaders style/catalogue, du module de gate, du module prompt-fixture dans `lottie_forge/` et `src/`)
- Wording du template squelette (seuls les placeholders `{{catalogue_json}}` / `{{catalogue_hash}}` sont contractuels)
- `catalogue_version` initial (1.0.0 attendu) et formatage JSON du catalogue
- Structure interne des tests (patron D-06/D-07/D-08 de Phase 1 à répliquer, réorganisation libre sous D-01 de Phase 1)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spécification cœur de la phase
- `docs/project/05_Style.md` — Partie 5 entière (§5.1–§5.9) : principes, fixture style §5.2 (style.yaml canonique verbatim §5.2.2), StyleRefinement delta-only §5.3, gate de bump §5.4, catalogue §5.5 (schéma §5.5.1, table des 10 recettes §5.5.2, validateurs §5.5.3), audit §5.6, critères §5.7, extensions différées §5.9
- `docs/project/04_Modeles.md` §4.4 — vocabulaire clos RecipeId (patron à étendre à ThemeAnchorId) ; §4.7 — lock champ par champ d'AssetSpec (content_hashes 2 champs actuel) ; §4.14 — règle d'extension same-commit des modèles clos
- `.planning/ROADMAP.md` — Phase 2 (goal, 5 critères de succès, canonical refs)
- `.planning/REQUIREMENTS.md` — STY-01, STY-02 (partial), STY-03, MOT-01, MOT-02, MOT-03, MOT-04 (définitions testables)

### Stack, architecture & harnais hérité
- `docs/project/03_Stack.md` §3.6 — job CI `verify` (inchangé, D-18) ; §3.1–§3.2 pins
- `docs/project/02_Architecture.md` §2.7 — structure monorepo (emplacement fixtures/) ; §2.8 — ordre de construction
- `.planning/phases/01-contrats-de-donn-es-fronti-re-pydantic-zod-reconstruction/01-CONTEXT.md` — D-06/D-07/D-08 (harnais de rejet partagé JSON), D-04/D-05 (outillage), à répliquer pour les nouveaux contrats

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lottie_forge/domain/_shared.py` — `STRICT_CONFIG` (`extra="forbid", strict=True`) et `KebabToken` (StringConstraints pydantic-core, CR-01) : réutiliser tels quels pour `StyleRefinement`, `CatalogRecipe`, `RecipeCatalogue`
- `lottie_forge/domain/vocabulary.py` + `src/rpc/contracts/vocabulary.schema.ts` — patron RecipeId (invariant 8–12, rejet `disco-spin`, parité des deux côtés) à étendre avec `ThemeAnchorId` (D-11)
- `tests/bridge/fixtures.py` (builders `make_style_spec()`, `make_recipe()`, `make_asset()`, `make_pack()`) + `tests/bridge/rejection_loader.py` + `src/rpc/contracts/rejection-cases.ts` — harnais de rejet partagé D-06/D-07/D-08 : y ajouter les cas StyleRefinement/Catalogue et les nouveaux cas content_hashes 4 champs
- `fixtures/rejection-cases/{style-spec,recipe,asset-spec,pack-manifest}.json` — un fichier par contrat, extensions au même patron

### Established Patterns
- Bridge ordonné pytest→vitest→pytest, artefacts byte-identiques, zéro test skippé (junitxml) — la chaîne existante s'étend aux nouveaux contrats sans modification du workflow (D-18)
- Règle same-commit : `vocabulary.py` + `vocabulary.schema.ts` + `catalogue.json` + `coverage-map.json` (étendue, D-14C)
- `.gitattributes` eol=lf : prérequis du régime de hash octets bruts (D-02/D-03)
- Validateurs collect-all avec chemins d'erreur précis (patron PackManifest Phase 1) pour les validateurs agrégés §5.5.3

### Integration Points
- `AssetSpec.content_hashes` (lottie_forge/domain/asset.py + src/rpc/contracts/asset-spec.schema.ts + fixtures/rejection-cases/asset-spec.json) : extension 4 champs same-commit §4.14 (D-16)
- La gate `scan_stale_pins` consomme `AssetSpec.style_ref` (regex STYLE_REF_PATTERN existante, consommée « verbatim » selon le doc)
- Phase 3 : le Compiler assigne les `nm` Lottie depuis `theme_anchors` ; Phase 5 : la gate devient store-backed (source de pins injectable, D-06) ; Phase 6 : les agents consomment la prompt-fixture et le type `StyleRefinement`

</code_context>

<specifics>
## Specific Ideas

- `style.yaml` = valeurs de référence §5.2.2 **verbatim** (style_id example-style, version 1.0.0, viewBox 400×300, 4 tokens palette, 2 easing curves standard/entrance)
- Le catalogue est embarqué **verbatim** (+ hash) dans le prompt — pas de reformulation, pas de troncature (§5.1 principe 2)
- Les fills Lottie restent neutres (`[0.5,0.5,0.5,1.0]`) pour que `setTheme` ait un effet — principe §5.1 #5, à ne pas contredire dans les fixtures
- `family` reste une string libre du catalogue (PAS de Literal — §5.9 : le catalogue est la source des familles, pas de seconde liste)
- Vérifiabilité hors usine : tout hash se recalcule au `sha256sum` sur le fichier committé

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-style-verrouill-catalogue-de-recettes*
*Context gathered: 2026-08-30*
