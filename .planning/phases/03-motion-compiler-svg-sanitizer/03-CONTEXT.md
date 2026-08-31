# Phase 3: Motion Compiler & SVG Sanitizer - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning

<domain>
## Phase Boundary

La moitié déterministe TypeScript prend vie : le **Motion Compiler**, seul producteur de Lottie JSON (ADR-01), transforme des `RenderSpec` typées en Lottie canonique + SVG compagnon statique ; le **SVG Sanitizer** enforce la gate dure d'hygiène (allow-list, SVGO 4 verrouillé ADR-02, IDs stables) ; les deux modules sont exposés en JSON-over-stdio (`motion.compile`, `svg.sanitize`) avec un client Python de test d'intégration. Aucun LLM n'existe sur ce chemin de code (COM-01→04, SAN-01→05). Le contrat zod `motion-compiler.schema.ts` est **gelé en Phase 3** ; le miroir Pydantic et le Translator arrivent en Phase 7 (§6.3.1 verbatim).

</domain>

<decisions>
## Implementation Decisions

### Modèle RenderSpec & formes
- **D-01:** Géométrie **100 % paramétrique** — type de shape fermé + paramètres (coords 0..1, rayons, points, rotation) ; le compiler génère tout le path data. Aucun champ libre ne traverse la frontière, même résolu par le Translator. — **Reversibility:** costly — le contrat est gelé en Phase 3 et le Translator (Ph 7) + les agents (Ph 6) se coulent dedans ; le changer après coup = migration des contrats + fixtures + goldens.
- **D-02:** IDs stables SAN-03 `{asset_id}_{component}_{role}` : **`role` ∈ ThemeAnchorId (6 anchors Literal Ph 2) ∪ {`neutral`}`** pour les couches non stylables ; le `nm` Lottie du layer = l'anchor — packager Ph 8 et smoke theming Ph 4 itèrent exactement sur ce set (aligné D-11 Ph 2).
- **D-03:** **11 golden files** : 10 par recette (shape canonique tirée de sa `shapes_supported`) + 1 fixture « galerie » couvrant les 5 générateurs (rect, ellipse, path, polyline, polystar) dans un seul asset.
- **D-04:** Fixtures RenderSpec positives dans **`fixtures/render-specs/*.json`** commités + builder TS **`make_render_spec()`** source unique (patron `tests/bridge/fixtures.py` Ph 1).
- **D-05:** Compatibilité **shapes du component ⊆ `shapes_supported` de la recette** validée par cross-ref à l'entrée du compiler (RenderSpec + catalogue chargés) — rejet dur, philosophie de la cross-ref easing D-17 Ph 2.
- **D-06:** **Ranges fermés zod** sur les paramètres de formes (coords 0..1, échelles > 0, points/opacité bornés) + cas de rejet paramétrés — une spec invalide est impossible à construire.
- **D-07:** RenderSpec bornée à **1..8 components** (range exact ajustable au planning).
- **D-08:** Le bloc motion réutilise **`MotionParams`** (contrat Phase 1, miroir zod existant) tel quel + intensité résolue — une seule source de vérité du mouvement, le catalogue reste la source des durées/easings.
- **D-09:** **Fills plats uniquement** — pas de gradient émis en Phase 3 (extension v2) ; fills neutres `[0.5,0.5,0.5,1.0]` sur les zones stylables (§6.3.2, condition du `setTheme`).
- **D-10:** **Z-order = ordre du tableau** components (premier = arrière-plan) — §6.3.5 verbatim « ordre d'insertion préservé, aucun tri implicite ».
- **D-11:** Marquage **« SVG-renderer only » = meta de sortie** `renderer_support: "all" | "svg-only"` de `compile()` — persisté au manifest Ph 5, lu par le packager Ph 8, sans toucher au contrat gelé.
- **D-12:** **`v = "5.7.0"`** — doc §6.3.4 verbatim, compat mobile maximale (lottie-android/ios/Flutter) ; tout feature post-5.7.0 hors subset par défaut.
- **D-13:** **Naming des champs = convention JSON des contrats Phase 1 verbatim** (parité de clés Py↔zod déjà prouvée par le bridge). Aucune convention locale nouvelle dans RenderSpec — **tout écart = rejet à la revue, sans discussion**.
- **D-14:** **Draw-on = trim-path** : la couche stroke porte `paint: fill | stroke` et, pour stroke, une **référence par nom de token** à `StyleSpec.stroke_widths` (thin|default|bold) — jamais un float libre ; le trim 0→1 est émis par `keyframe-emitter` depuis le `keyframe_shape` de la recette ; le tracé est une shape paramétrique comme les autres (liste de points bornée).

### Pose du SVG compagnon
- **D-15:** Pose dérivée du **trigger** (dérivable du catalogue, zéro édition) : recettes one-shot `enter` (draw-on, bounce…) → **frame finale** ; recettes `loop` (orbit, float, pulse) → **t=0**.
- **D-16:** `source.svg` = **couleurs concrètes résolues** (autonome, poster-ready, rendu identique partout) ; la variante themable est **dérivée en Phase 8** (ADR-05) par substitution déterministe hex → `var(--anchor)`/currentColor.
- **D-17:** **Chaînage explicite** par l'appelant : `motion.compile` → `svg.sanitize`, deux méthodes RPC séparées (§6.5 verbatim) — la gate reste visible dans le pipeline (« the gate is the gate »), le compiler ne sanitise pas en interne.
- **D-18:** `<title>`/`<desc>` **dérivés déterministes par le compiler** depuis `asset_id` + `recipe_id` — zéro texte user-supplied (esprit meta.ts §6.3.2), a11y présente dès la Phase 3.
- **D-19:** Structure DOM : **un `<g>` par component** portant l'ID stable — miroir des layers Lottie, régions theming identifiables structurellement pour la Ph 4/8 ; sérialisation déterministe.
- **D-20:** **Builder TS dédié** pour la sérialisation SVG (template strings contrôlés, ordre d'attributs et échappement fixés par le code) — zéro dépendance, pas de XMLSerializer ni de sérialisation par SVGO.
- **D-21:** **Traçabilité au manifest uniquement** (MFT-01 Ph 5) — pas de data-attributes ni commentaires de hashes dans le SVG ; le SVG reste du rendu pur, identifiable par ses IDs.
- **D-22:** **viewBox seul**, sans width/height — « responsive garanti » §6.3.2 verbatim ; dimensionnement au conteneur.

### Déterminisme floats & goldens (COM-01)
- **D-23:** **Formateur décimal canonique maison** pour les floats : précision fixée (valeur exacte au planning), pas de notation exponentielle, trailing zeros tronqués — indépendant du moteur JS (pas de `JSON.stringify` natif comme contrat de format). — **Reversibility:** costly — changer de régime de format invalide les 11 goldens et tous les hashes enregistrés des sorties.
- **D-24:** **JSON compact + newline final** — les goldens sont exactement les bytes livrés ; git-friendly sous `.gitattributes` eol=lf.
- **D-25:** Refresh des goldens : **script dédié `goldens:update`** + diff relu et **commité dans le même commit** que le changement de format (discipline same-commit, miroir D-14 Ph 2) — la CI ne fait que comparer, jamais régénérer.
- **D-26:** Preuve « deux compilations indépendantes → bytes identiques » : **double process spawn** (deux processus Node séparés compilent chaque fixture ; bytes diffés entre eux **et** vs golden) — capte l'état module/caches implicites, doctrine rebuild Ph 10.

### Frontière RPC & parité (Pattern 5)
- **D-27:** Framing **NDJSON** (une ligne = un message, requêtes/réponses corrélées par `id` numérique) — debuggable au pipe, sûr avec le JSON compact (D-24), serveur chaud (§6.5). — **Reversibility:** costly — le framing est implémenté des deux côtés et réutilisé Ph 4/7/8 ; le changer = réécriture transport Py + TS.
- **D-28:** Erreurs = **enveloppe `{id, ok, result|error:{code, message, details}}` avec codes fermés** (Literal : `parse_error`, `validation_error`, `compile_error`, `sanitize_rejected`, `internal`) — re-typés côté Py en Ph 7, jamais de message libre comme contrat.
- **D-29:** Parité de rejet RenderSpec/LottieJSON : **`fixtures/rejection-cases/render-spec.json` (+ `lottie-json.json`) au format D-08 dès la Phase 3**, consommés par vitest ; en Ph 7 le pytest les branche en parametrize sans réécriture. Gel §6.3.1 respecté (miroir Pydantic en Ph 7, pas avant).
- **D-30:** Client Python Phase 3 = **`lottie_forge/rpc/client.py` transport + enveloppe générique** (spawn serveur, cold-start, NDJSON, enveloppe D-28) ; la re-validation typée se branche en Ph 7 avec les miroirs, sans refactor du transport. Le test d'intégration §6.6 passe dès la Phase 3.

### Sanitizer & IDs — compléments
- **D-31:** **Gates SVG complètes du sanitizer** : l'allow-list inclut explicitement `<title>`, `<desc>` et la racine `<svg>` ; rejet dur des commentaires XML, des attributs `data-*`, des `width`/`height` sur la racine (cohérent D-22), et de tout élément/attribut préfixé (namespace unique `xmlns`, pas de `xmlns:xlink`). Test de self-consistance : pour chaque golden, `svg.sanitize(raw_svg)` rapporte **zéro élément rejeté**.
- **D-32:** **IDs 2/3 segments** : le schéma 3 segments SAN-03 (`{asset_id}_{component}_{role}`) porte sur les **éléments shape** ; le `<g>` component porte le **préfixe 2 segments** (`{asset_id}_{component}`) ; `stabilize-ids` asserte shape ID = ID du `<g>` parent + `_{role}` ; unicité `(component, role)` par asset enforce par `superRefine`, rejet dur, **jamais de dedup implicite**.

### Feature gate & motion/géométrie — compléments
- **D-33:** **Gate de features** : enum `SupportedLottieFeature` dérivé au planning depuis les docs lottie-web 5.13 ; deux catégories **jamais confondues** — post-5.7.0 ou hors subset → rejet dur (code `unsupported_feature`) ; ≤ 5.7.0 non supporté par un renderer secondaire → `renderer_support: svg-only` (test unitaire forçant la branche). Zéro expression vivante en sortie ; toute expression en entrée = **rejet dur** ; `// lottie:bake` **différé v2** (aucun code mort en Ph 3) — écart volontaire vs §6.3.4.
- **D-34:** **Compléments motion/géométrie** : `duration`/`easing` **jamais copiés dans la RenderSpec** (`recipe_ref` + catalogue pinné) ; markers/triggers **émis par le compiler** depuis `keyframe_shape` + catalogue, aucun trigger libre en entrée ; les deltas de transform/motion ont leurs **propres ranges fermés, séparés des coords 0..1** (sinon slide interdit ou brèche dans la borne) ; cross-field `superRefine` (ex. `corner_radius ≤ min(w,h)/2`).

### Formateur, RPC & preuves — compléments
- **D-35:** **Formateur canonique** : sémantique **`toFixed(4)`** (tie spec-ES, déterministe cross-engine), `-0 → 0`, trailing zeros stripés, jamais de notation exponentielle ; **même formateur pour les attributs numériques du SVG** ; matrice de tests unitaires à cas exacts (ties, négatifs, `-0`, bornes).
- **D-36:** **Robustesse RPC** : stdout réservé au protocole (logs → stderr) ; ligne malformée → `{id: null, ok: false, error: {code: "protocol_error"}}` **sans crash** ; enum de codes complété : `protocol_error`, `method_not_found`, `unsupported_feature` en sus des cinq de D-28 ; pipelining permis par le protocole, **client Ph 3 lockstep**.
- **D-37:** **Preuves** : double process avec **diff trois-voies** (A vs B vs golden) et **délai inter-process ≥ 1 s** (anti-horodatage) ; chaque cas de rejet D-29 porte le **code d'erreur attendu** ; pose = **switch exhaustif sans default** sur `keyframe_shape` + test de non-dégénérescence (ink visible) par golden + test d'**isomorphisme Lottie↔SVG** ; `goldens:update` **refuse si `CI=true`** et régénère les 11 atomiquement.

### the agent's Discretion
- Valeurs précises des ranges fermés (points, opacité, borne 1..8, deltas transform/motion — D-06/D-07/D-34) ; la précision du formateur est **fixée par D-35** (`toFixed(4)`)
- Organisation interne des modules (fichiers §6.2 déjà nommés par le doc, découpage fin libre)
- Encodage paramétrique précis des shapes (noms de champs selon D-13, valeurs par défaut)
- Contenu exact des fixtures `render-specs/` (poses représentatives, cas galerie)
- Détails SVGO (ordre des plugins custom, nombre de passes multipass — `prefixIds` exclu §6.4.2)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spécification cœur de la phase
- `docs/project/06_Backbone.md` — Partie 6 entière (§6.1–§6.8) : principes, structure des modules `src/` §6.2, Motion Compiler §6.3 (contrat E/S §6.3.1, keyframes §6.3.2, theming `nm` §6.3.3, feature gate + pin `v` §6.3.4, goldens §6.3.5), SVG Sanitizer §6.4 (allow-list §6.4.1, SVGO §6.4.2, plugins + rapport §6.4.3), frontière RPC §6.5, tests §6.6, extensions différées §6.8
- `docs/project/02_Architecture.md` — §2.5 (contrats de frontière, aucun `dict[str, Any]`), §2.7 (structure monorepo), §2.9 (ADR-01 Lottie seul mouvement, ADR-02 SVGO verrouillé), Pattern 5 JSON-over-stdio (cold-start une fois par pack)
- `.planning/ROADMAP.md` — Phase 3 (goal, 5 critères de succès)
- `.planning/REQUIREMENTS.md` — COM-01→04, SAN-01→05 (définitions testables)

### Contrats & données héritées
- `docs/project/04_Modeles.md` — §4.4 (vocabulaire clos RecipeId), §4.7 (AssetSpec lock), §4.14 (règle d'extension same-commit des modèles clos)
- `docs/project/05_Style.md` — §5.2.2 (StyleSpec : viewBox, easing_curves, stroke_widths), §5.5 (catalogue : durées, easings, keyframe_shape, intensity_range, shapes_supported, trigger_points, theme_anchors), §5.1 principe 5 (fills neutres)
- `docs/project/03_Stack.md` — pins (SVGO 4, lottie-web 5.13.0, TS ~5.9 verbatimModuleSyntax, zod ^4, Vite 7, Biome ^2, Node 20), §3.6 job CI `verify` inchangé

### Patterns des phases précédentes
- `.planning/phases/01-contrats-de-donn-es-fronti-re-pydantic-zod-reconstruction/01-CONTEXT.md` — D-06/D-07/D-08 (harnais de rejet partagé JSON, format des cas), convention naming JSON des contrats (D-13 ci-dessus la rend obligatoire)
- `.planning/phases/02-style-verrouill-catalogue-de-recettes/02-CONTEXT.md` — D-10/D-11/D-12 (ThemeAnchorId, anchors ≠ tokens), D-14 (same-commit catalogue), D-17 (cross-ref easing, patron des cross-refs), D-18 (verify.yml inchangé)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/rpc/contracts/*.schema.ts` — patron `z.strictObject` à suivre pour `motion-compiler.schema.ts` (gelé Ph 3) et `sanitizer.schema.ts` ; `vocabulary.schema.ts` fournit ThemeAnchorId/RecipeId à réimporter (jamais re-déclarer)
- `fixtures/rejection-cases/` + `src/rpc/contracts/rejection-cases.ts` + `tests/bridge/rejection_loader.py` — harnais partagé D-08 à étendre avec `render-spec.json` / `lottie-json.json` (D-29)
- `tests/bridge/fixtures.py` (builders `make_*`) — patron à répliquer côté TS : `make_render_spec()`
- `fixtures/recipe-catalogue/catalogue.json` — chargé par le compiler pour les cross-refs (shapes_supported D-05, easing, trigger_points)
- `lottie_forge/domain/_shared.py` (`STRICT_CONFIG`, `KebabToken`) — référence des conventions fermées dont D-13 impose le verbatim

### Established Patterns
- Bridge ordonné pytest→vitest→pytest, artefacts byte-identiques, zéro test skippé (junitxml) — **verify.yml inchangé** (D-18 Ph 2) ; les gates Phase 3 sont des tests ordinaires ramassés par les étapes existantes
- Règle same-commit (étendue ici aux goldens : D-25) et `.gitattributes` eol=lf (prérequis du régime bytes)
- Hash octets bruts LF (D-02/D-03 Ph 2) — régime qui s'appliquera aux `content_hashes` des sorties compiler

### Integration Points
- Sorties `compile()` (Lottie + SVG) → hashées dans `AssetSpec.content_hashes` (`lottie_sha256`, `svg_sha256`) au store Ph 5
- `nm`/theme anchors → consommés par Anim QA (Ph 4, smoke theming §7) et Packager (Ph 8, ADR-05)
- `src/rpc/server.ts` → étendu Ph 4 (`anim_qa.run`) et Ph 8 (`package.export`) — le framing D-27 et l'enveloppe D-28 sont le contrat de tous ces ajouts
- `lottie_forge/rpc/client.py` (nouveau) → transport réutilisé par l'orchestrateur Ph 7
- `renderer_support` (D-11) → persisté au manifest Ph 5, lu par le packager Ph 8 pour exclure/refuser les exports Flutter/canvas

</code_context>

<specifics>
## Specific Ideas

- **Naming = convention Phase 1 verbatim, tout écart = rejet à la revue sans discussion** (méta-règle utilisateur D-13)
- **Jamais de float libre pour les largeurs de trait** — référence token `stroke_widths` uniquement (D-14)
- Les fills Lottie restent neutres `[0.5,0.5,0.5,1.0]` pour que `setTheme` ait un effet (§5.1 #5) — à ne pas contredire dans fixtures ni goldens
- Les goldens sont **exactement les bytes livrés** (compact + EOF) — pas de pretty-print de revue
- La CI ne régénère jamais les goldens : elle compare seulement (D-25) ; `goldens:update` refuse en CI et ne tourne qu'en local (D-37)
- **`// lottie:bake` différé v2 — aucun code mort en Phase 3** : une expression en entrée est rejetée dur, jamais bakée (D-33, écart volontaire vs §6.3.4)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope (gradients = extension v2 déjà tracée dans le doc §6.8)

</deferred>

---

*Phase: 03-motion-compiler-svg-sanitizer*
*Context gathered: 2026-08-31*
