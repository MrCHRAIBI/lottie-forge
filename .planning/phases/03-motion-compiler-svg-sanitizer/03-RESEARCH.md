# Phase 3: Motion Compiler & SVG Sanitizer - Research

**Researched:** 2026-08-31
**Domain:** TypeScript déterministe — producteur Lottie JSON (bodymovin), sanitizer SVG (SVGO 4), RPC JSON-over-stdio
**Confidence:** HIGH (spécification canonique lue in-extenso, stack officielle vérifiée registre + docs officielles, codebase Phases 1–2 cartographié session présente)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Modèle RenderSpec & formes**
- **D-01:** Géométrie **100 % paramétrique** — type de shape fermé + paramètres (coords 0..1, rayons, points, rotation) ; le compiler génère tout le path data. Aucun champ libre ne traverse la frontière. — *Reversibility: costly (contrat gelé Ph 3).*
- **D-02:** IDs stables SAN-03 `{asset_id}_{component}_{role}` : **`role` ∈ ThemeAnchorId (6 anchors Literal Ph 2) ∪ {`neutral`}`** ; le `nm` Lottie du layer = l'anchor.
- **D-03:** **11 golden files** : 10 par recette (shape canonique tirée de sa `shapes_supported`) + 1 fixture « galerie » couvrant les 5 générateurs (rect, ellipse, path, polyline, polystar) dans un seul asset.
- **D-04:** Fixtures RenderSpec positives dans **`fixtures/render-specs/*.json`** commités + builder TS **`make_render_spec()`** source unique (patron `tests/bridge/fixtures.py` Ph 1).
- **D-05:** Compatibilité **shapes du component ⊆ `shapes_supported` de la recette** validée par cross-ref à l'entrée du compiler (rejet dur, patron D-17 Ph 2).
- **D-06:** **Ranges fermés zod** sur les paramètres de formes (coords 0..1, échelles > 0, points/opacité bornés) + cas de rejet paramétrés.
- **D-07:** RenderSpec bornée à **1..8 components** (range exact ajustable au planning).
- **D-08:** Le bloc motion réutilise **`MotionParams`** (contrat Phase 1, miroir zod existant) tel quel + intensité résolue.
- **D-09:** **Fills plats uniquement** — pas de gradient en Ph 3 ; fills neutres `[0.5,0.5,0.5,1.0]` sur les zones stylables (§6.3.2).
- **D-10:** **Z-order = ordre du tableau** components (premier = arrière-plan) — « ordre d'insertion préservé, aucun tri implicite ».
- **D-11:** Marquage **« SVG-renderer only » = meta de sortie** `renderer_support: "all" | "svg-only"` de `compile()` — persisté Ph 5, lu Ph 8.
- **D-12:** **`v = "5.7.0"`** — compat mobile maximale ; tout feature post-5.7.0 hors subset par défaut.
- **D-13:** **Naming des champs = convention JSON des contrats Phase 1 verbatim** (snake_case des miroirs existants). **Tout écart = rejet à la revue, sans discussion.**
- **D-14:** **Draw-on = trim-path** : couche stroke porte `paint: fill | stroke` et, pour stroke, une **référence par nom de token** à `StyleSpec.stroke_widths` (thin|default|bold) — jamais un float libre ; trim 0→1 émis par `keyframe-emitter` depuis le `keyframe_shape` ; tracé = shape paramétrique (liste de points bornée).

**Pose du SVG compagnon**
- **D-15:** Pose dérivée du **trigger** : recettes one-shot `enter` → **frame finale** ; recettes `loop` → **t=0** (dérivable du catalogue, zéro édition).
- **D-16:** `source.svg` = **couleurs concrètes résolues** (autonome, poster-ready) ; variante themable dérivée en Ph 8 (ADR-05).
- **D-17:** **Chaînage explicite** par l'appelant : `motion.compile` → `svg.sanitize`, deux méthodes RPC séparées — le compiler ne sanitise pas en interne.
- **D-18:** `<title>`/`<desc>` **dérivés déterministes par le compiler** depuis `asset_id` + `recipe_id` — zéro texte user-supplied.
- **D-19:** Structure DOM : **un `<g>` par component** portant l'ID stable — miroir des layers Lottie ; sérialisation déterministe.
- **D-20:** **Builder TS dédié** pour la sérialisation SVG (template strings contrôlés, ordre d'attributs et échappement fixés par le code) — zéro dépendance, pas de XMLSerializer ni de sérialisation par SVGO *(pour l'ÉMISSION compiler ; le sanitizer, lui, optimise via SVGO — ADR-02)*.
- **D-21:** **Traçabilité au manifest uniquement** (Ph 5) — pas de data-attributes ni commentaires de hashes dans le SVG.
- **D-22:** **viewBox seul**, sans width/height — « responsive garanti » ; dimensionnement au conteneur.

**Déterminisme floats & goldens (COM-01)**
- **D-23:** **Formateur décimal canonique maison** : précision fixée, pas de notation exponentielle, trailing zeros tronqués — indépendant du moteur (pas de `JSON.stringify` natif comme contrat de format). — *Reversibility: costly.*
- **D-24:** **JSON compact + newline final** — les goldens sont exactement les bytes livrés ; git-friendly sous `.gitattributes` eol=lf.
- **D-25:** Refresh des goldens : **script dédié `goldens:update`** + diff relu et **commité dans le même commit** que le changement de format — la CI ne fait que comparer, jamais régénérer.
- **D-26:** Preuve « deux compilations indépendantes → bytes identiques » : **double process spawn** (deux processus Node séparés ; bytes diffés entre eux **et** vs golden).

**Frontière RPC & parité (Pattern 5)**
- **D-27:** Framing **NDJSON** (une ligne = un message, corrélation par `id` numérique) — serveur chaud (§6.5). — *Reversibility: costly (réutilisé Ph 4/7/8).*
- **D-28:** Erreurs = **enveloppe `{id, ok, result|error:{code, message, details}}` avec codes fermés** (`parse_error`, `validation_error`, `compile_error`, `sanitize_rejected`, `internal`).
- **D-29:** Parité de rejet RenderSpec/LottieJSON : **`fixtures/rejection-cases/render-spec.json` (+ `lottie-json.json`) au format D-08 dès la Phase 3**, consommés par vitest ; en Ph 7 le pytest les branche sans réécriture. Gel §6.3.1 respecté (miroir Pydantic en Ph 7, pas avant).
- **D-30:** Client Python Phase 3 = **`lottie_forge/rpc/client.py` transport + enveloppe générique** (spawn serveur, cold-start, NDJSON, enveloppe D-28) ; la re-validation typée se branche en Ph 7. Le test d'intégration §6.6 passe dès la Phase 3.

**Sanitizer & IDs — compléments**
- **D-31:** **Gates SVG complètes** : allow-list inclut explicitement `<title>`, `<desc>` et la racine `<svg>` ; rejet dur des commentaires XML, des attributs `data-*`, des `width`/`height` sur la racine (cohérent D-22), et de tout élément/attribut préfixé (namespace unique `xmlns`, pas de `xmlns:xlink`). Test de self-consistance : pour chaque golden, `svg.sanitize(raw_svg)` rapporte **zéro élément rejeté**.
- **D-32:** **IDs 2/3 segments** : schéma 3 segments SAN-03 pour les **éléments shape** ; le `<g>` component porte le **préfixe 2 segments** (`{asset_id}_{component}`) ; `stabilize-ids` asserte shape ID = ID du `<g>` parent + `_{role}` ; unicité `(component, role)` par asset via `superRefine`, rejet dur, **jamais de dedup implicite**.

**Feature gate & motion/géométrie — compléments**
- **D-33:** **Gate de features** : enum `SupportedLottieFeature` dérivé au planning depuis les docs lottie-web 5.13 ; deux catégories **jamais confondues** — post-5.7.0 ou hors subset → rejet dur (`unsupported_feature`) ; ≤ 5.7.0 non supporté par un renderer secondaire → `renderer_support: "svg-only"` (test unitaire forçant la branche). Zéro expression vivante en sortie ; expression en entrée = **rejet dur** ; `// lottie:bake` **différé v2** (aucun code mort en Ph 3) — écart volontaire vs §6.3.4.
- **D-34:** **Compléments motion/géométrie** : `duration`/`easing` **jamais copiés dans la RenderSpec** (`recipe_ref` + catalogue pinné) ; markers/triggers **émis par le compiler** depuis `keyframe_shape` + catalogue, aucun trigger libre en entrée ; deltas de transform/motion avec **ranges fermés propres, séparés des coords 0..1** ; cross-field `superRefine` (ex. `corner_radius ≤ min(w,h)/2`).

**Formateur, RPC & preuves — compléments**
- **D-35:** **Formateur canonique** : sémantique **`toFixed(4)`** (tie spec-ES, déterministe cross-engine), `-0 → 0`, trailing zeros stripés, jamais d'exponentielle ; **même formateur pour les attributs numériques du SVG** ; matrice de tests unitaires à cas exacts.
- **D-36:** **Robustesse RPC** : stdout réservé au protocole (logs → stderr) ; ligne malformée → `{id: null, ok: false, error: {code: "protocol_error"}}` **sans crash** ; codes complétés : `protocol_error`, `method_not_found`, `unsupported_feature` ; pipelining permis, **client Ph 3 lockstep**.
- **D-37:** **Preuves** : double process avec **diff trois-voies** (A vs B vs golden) et **délai inter-process ≥ 1 s** (anti-horodatage) ; chaque cas de rejet D-29 porte le **code d'erreur attendu** ; pose = **switch exhaustif sans default** sur `keyframe_shape` + test de non-dégénérescence (ink visible) par golden + test d'**isomorphisme Lottie↔SVG** ; `goldens:update` **refuse si `CI=true`** et régénère les 11 atomiquement.

### the agent's Discretion
- Valeurs précises des ranges fermés (points, opacité, borne 1..8, deltas transform/motion — D-06/D-07/D-34) ; la précision du formateur est **fixée par D-35** (`toFixed(4)`)
- Organisation interne des modules (fichiers §6.2 déjà nommés par le doc, découpage fin libre)
- Encodage paramétrique précis des shapes (noms de champs selon D-13, valeurs par défaut)
- Contenu exact des fixtures `render-specs/` (poses représentatives, cas galerie)
- Détails SVGO (ordre des plugins custom, nombre de passes multipass — `prefixIds` exclu §6.4.2)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope (gradients = extension v2 déjà tracée dans le doc §6.8). `// lottie:bake` différé v2 (D-33) ; miroir Pydantic RenderSpec + Translator → Phase 7 (D-29/D-30).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COM-01 | Compiler idempotent byte-for-byte, goldens par recette | Formateur canonique D-35 (sémantique toFixed(4) spec-ES), sérialiseur JSON contrôlé (D-23/D-24), 11 goldens (D-03), double process spawn (D-26/D-37) ; pièges unités Lottie documentés (§Pitfalls 1–3) |
| COM-02 | Zéro import LLM backbone, grep CI bloquant | Test vitest ordinaire (ramassé par l'étape 09 `npx vitest run`, verify.yml **inchangé** — doctrine D-18 Ph 2) scannant `package.json`/`tsconfig.json`/`src/**` contre `langchain|openai|anthropic` |
| COM-03 | Re-validation zod `LottieJSON` avant retour | Schéma zod strict pinning `v: "5.7.0"`, `ddd: 0`, `ty: 4` — tout feature étranger = échec schéma = jamais émis (§Architecture Pattern 3) |
| COM-04 | Feature gate pinnée, rejet dur hors subset, `v` pinné | Enum `SupportedLottieFeature` + valeurs d'enum Lottie vérifiées spec officielle (constants page) ; bake différé v2 (D-33) ; branche `svg-only` testée synthétiquement |
| SAN-01/02/05 | Matrice de rejet text/raster/foreignObject/script/handlers/js: URIs/xlink externe | Plugins visiteur SVGO 4 collecteurs (API visitor-only vérifiée v4) placés AVANT `preset-default` + allow-list éléments/attributs ; SVGO `removeScripts` (v4) en défense en profondeur |
| SAN-03 | IDs stables `{asset_id}_{component}_{role}` | Assignment compiler déterministe + override SVGO `cleanupIds: false` (renomme les IDs — danger vérifié) + `collapseGroups: false` ; `stabilize-ids` assertion |
| SAN-04 | SVGO 4, removeViewBox/removeTitle désactivés + régression | **VERIFIÉ v4 : `removeViewBox`/`removeTitle` absents du preset-default v4** (migration v3→v4 officielle) ; MAIS `removeDesc` y est ENCORE — override `removeDesc: false` requis ; test de régression viewBox+title |
| SAN-05 | (couvert avec SAN-01/02) | idem |
</phase_requirements>

## Summary

La phase 3 construit la moitié déterministe TypeScript : Motion Compiler (seul producteur Lottie JSON, ADR-01) + SVG Sanitizer (gate dure d'hygiène, ADR-02) + frontière RPC JSON-over-stdio avec client Python de transport. Les 37 décisions D-01..D-074 verrouillent la totalité du design — la recherche confirme leur faisabilité technique et documente les pièges d'exécution. Le codebase existant (`src/rpc/contracts/*` — 7 schémas zod stricts, harnais de rejet D-08, `verify.yml` 12 étapes intouchable) fournit tous les patrons à répliquer ; les seules nouveautés structurelles sont `src/motion-compiler/`, `src/svg-sanitizer/`, `src/rpc/server.ts` et `lottie_forge/rpc/client.py`.

Deux vérifications externes conditionnent la correction du sanitizer : (1) **SVGO v4 a retiré `removeViewBox`/`removeTitle` du preset-default** (migration v3→v4 officielle — l'ADR-02 « gardés désactivés » est donc l'état *par défaut* en v4, et le test de régression reste obligatoire) mais **`removeDesc` y figure ENCORE** et doit être explicitement désactivé pour préserver `<desc>` (D-31) ; (2) **`cleanupIds` (actif par défaut) renomme les IDs** et `collapseGroups` peut aplatir les `<g>` — deux overrides requis pour SAN-03/D-19. Côté format Lottie, la spécification officielle (lottie.github.io) vérifie tous les champs émis : unités non triviales (opacité 0..100, échelle [100,100] = identité, trim s/e en 0..100, couleurs RGB 0..1), **ordre de rendu inversé** (premier élément du tableau = premier-plan — inversion obligatoire pour honorer D-10), keyframes `{t, h, i, o, s}` sans champ `e` legacy, keyframes scalaires au format vecteur `s:[v]`.

Une découverte d'infrastructure : **Node 20 (version CI) ne peut pas exécuter TypeScript nativement**, or le test d'intégration §6.6 fait spawn le serveur TS par pytest — `tsx` (devDep, engines node ≥18, 86M downloads/semaine) est le pont recommandé, réutilisé par `goldens:update` et le double process spawn D-26.

**Primary recommendation:** Construire dans l'ordre : (1) `src/shared/format.ts` (formateur D-35 + sérialiseur JSON déterministe) avec matrice unitaire exacte, (2) `src/rpc/contracts/motion-compiler.schema.ts` + `sanitizer.schema.ts` (RenderSpec fermé + LottieJSON gate + rejets D-29) — contrats d'abord, doctrine Ph 1, (3) shape/transform/keyframe/color builders + `compiler.ts` avec re-validation zod avant retour, (4) goldens + preuves D-26/D-37, (5) sanitizer + config SVGO verrouillée, (6) serveur RPC NDJSON + client Python + intégration §6.6, (7) test grep COM-02. Chaque gate = test ordinaire ramassé par les étapes existantes — **`verify.yml` reste byte-identique**.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Génération Lottie JSON + path data | TS déterministe (`src/motion-compiler/`) | — | ADR-01 : le compiler est le SEUL producteur ; zéro LLM (COM-02) |
| Génération SVG compagnon (raw) | TS déterministe (builder template strings, D-20) | — | Sérialisation contrôlée, zéro dépendance (D-20) |
| Gate hygiène SVG + optimisation | TS déterministe (`src/svg-sanitizer/` + SVGO 4) | — | ADR-02 : SVGO verrouillé ; rejet dur avant QA |
| Validation d'entrée/sortie (frontière) | zod `strictObject` (`src/rpc/contracts/`) | Pydantic (Ph 7 uniquement, gel §6.3.1) | Aucun `unknown` non validé ne traverse (§2.5) |
| Transport inter-process | NDJSON over stdio (`src/rpc/server.ts` ↔ `lottie_forge/rpc/client.py`) | — | Pattern 5 §2.6 ; framing réutilisé Ph 4/7/8 (D-27) |
| Orchestration compile→sanitize | Appelant (Python, Ph 7 ; test Py en Ph 3) | — | Chaînage explicite D-17 : la gate reste visible |
| Persistance hashes/manifest | **HORS SCOPE** — Phase 5 | — | `content_hashes` reçoit les sha des sorties (point d'accroche seulement) |
| Rendu pixel / QA | **HORS SCOPE** — Phase 4 (Playwright + lottie-web) | — | `renderer_support` (D-11) est la seule interface Ph 3→4/8 |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| typescript | ~5.9 (déjà installé) | Tout le backbone ; `verbatimModuleSyntax: true` | Pin projet §3.2 (7.0.2 existe au registre — volontairement ignoré) `[VERIFIED: npm registry — latest 7.0.2]` |
| zod | ^4 (4.5.4 au registre ; déjà installé) | Schémas RenderSpec/LottieJSON/sanitizer, gate re-validation | `z.strictObject` = `extra=forbid` ; utilisé par les 7 contrats existants `[VERIFIED: npm registry]` |
| svgo | 4.x (4.1.0 au registre) — **NOUVEAU** | Optimisation + pipeline sanitizer SVG | ADR-02/§3.2 pin projet ; imports nommés obligatoires en v4 `[VERIFIED: npm registry]` `[CITED: github.com/svg/svgo docs/06-migrations/01-migration-from-v3-to-v4.mdx]` |
| vitest | ^4 (4.1.11 au registre ; déjà installé) | Suites goldens/rejet/régression (`*.spec.ts` sous `src/`) | Config existante (`src/**/*.spec.ts`, junitxml bridge) `[VERIFIED: npm registry]` |
| tsx | 4.23.13 — **NOUVEAU (devDep)** | Exécuter le serveur TS depuis pytest + scripts (Node 20 CI ne strip pas les types) | engines `node >=18.16` ; standard de facto `[VERIFIED: npm registry]` `[CITED: npm view tsx engines]` |
| Node.js | 20 en CI (local 26.3.0), `engines >=20` | Runtime backbone | setup-node 20 dans verify.yml étape 03 (inchangé) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/node | ^20 (installé) | `child_process`, `fs`, `readline` pour serveur/scripts | tsc --noEmit vert |
| @biomejs/biome | ^2 (installé) | Lint/format `src/**/*.ts` | Déjà scopé ; nouveaux fichiers auto-ramassés |
| lottie-web | 5.13.0 — **PAS installé en Phase 3** | Référentiel du subset de features (COM-04) | La feature gate est un enum **de données** dérivé des docs lottie-web ; le runtime arrive en Phase 4 (Playwright) `[VERIFIED: npm registry — latest = 5.13.0 = pin exact]` |
| pytest (côté Py) | existant | Test d'intégration §6.6 (spawn serveur via tsx) | Étapes 08/10 existantes ramassent `tests/rpc/test_rpc_integration.py` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| tsx | `vite-node` (transitif vitest) | Dépendre d'un binaire transitif est fragile ; tsx = devDep explicite, 1 dep, zéro config |
| tsx | Node 22+ `--experimental-strip-types` | CI pinne Node 20 — indisponible ; écart stack interdit |
| SVGO custom plugins (visitor) | Regex/scan string du SVG | Regex sur XML = faille connue ; l'arbre XAST de SVGO est correct et l'API visitor est LA seule API v3/v4 (perItem supprimé) |
| `toMatchFileSnapshot` vitest | Comparaison manuelle Buffer | `toMatchFileSnapshot` auto-CRÉE le golden en local et se réécrit via `--update` — contredit D-25 (CI compare seulement, refresh scripté explicable) ; comparaison `Buffer.compare` = zéro magie `[CITED: vitest docs/api/expect.md v4.1.6]` |
| `JSON.stringify` pour les floats | Sérialiseur maison D-23 | `JSON.stringify` est déterministe mais émet le format shortest-roundtrip (ex. `0.30000000000000004`) — contredit D-23/D-35 (toFixed(4)) |

**Installation:**
```bash
npm install svgo@^4.1.0        # runtime (sanitizer)
npm install -D tsx@^4.23.13    # devDep (spawn TS depuis pytest + scripts)
# package-lock.json committé — npm ci échoue sur drift (doctrine 01-01)
```

## Package Legitimacy Audit

> Gate exécuté via `gsd-tools query package-legitimacy check --ecosystem npm svgo lottie-web tsx` + `npm view` (session présente).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| svgo | npm | ~10 ans (projet) ; dernier publish 4.1.0 le 2026-08-24 | 39.1M/semaine | github.com/svg/svgo (org officielle SVG) | [SUS] | **Gardé** — signal `too-new` = publish du patch 4.1.0 il y a 7 jours, pas l'âge du paquet. Autorité projet : ADR-02 + `docs/project/03_Stack.md` §3.2 pin **SVGO 4.x** `[CITED: docs/project/03_Stack.md §3.2]`. Pas de script postinstall. `checkpoint:human-verify` trivialement satisfait : la version 4.x est déjà décidée par l'utilisateur dans le stack verrouillé. Atténuation : pin `^4.1.0` + lockfile committé. |
| lottie-web | npm | 5.13.0 (2025-05-21) | 7.7M/semaine | github.com/airbnb/lottie-web | [OK] | **Non installé en Ph 3** (runtime Ph 4) ; latest registre = pin exact projet |
| tsx | npm | ~4 ans (projet) ; dernier publish 4.23.13 le 2026-08-30 | 86.3M/semaine | github.com/privatenumber/tsx | [SUS] | **Gardé** — même motif `too-new` (publish hier). Pas de postinstall. `checkpoint:human-verify` avant install ; fallback si refusé : `vite-node` (transitif vitest) — fragile, à éviter. |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `svgo`, `tsx` — les deux sont des paquets établis majeurs dont le signal positif ne vient que de la fraîcheur du dernier publish ; le planner insère le checkpoint avant `npm install`. Aucun nouveau paquet au-delà de ces deux-là.

## Architecture Patterns

### System Architecture Diagram

```
                    PHASE 3 — chemin 100 % déterministe (zéro LLM, COM-02)
                    ═══════════════════════════════════════════════════════

  fixtures/render-specs/*.json ──┐                                  fixtures/recipe-catalogue/catalogue.json
  (D-04, commités)               │                                  (MOT-04, chargé par le compiler)
                                 ▼                                               │
                    ┌─────────────────────────┐     cross-refs dur (D-05)        │
                    │  RenderSpecSchema (zod) │◄── shapes ⊆ shapes_supported ────┘
                    │  ranges fermés (D-06)   │◄── easing ∈ StyleSpec.easing_curves (cross-ref D-17 Ph 2)
                    └───────────┬─────────────┘
                                │ compile(renderSpec, catalogue, style)
                                ▼
        ┌──────────────────────── src/motion-compiler/ ────────────────────────┐
        │ shape-builder → path/rect/ellipse/polystar data (coords 0..1→viewBox)│
        │ transform-builder → ks (scale ≥ 0, ddd: 0)                           │
        │ keyframe-emitter → keyframe_shape → keyframes {t,s,i,o} (10 formes)  │
        │ color-resolver → fills neutres [0.5,0.5,0.5,1.0] (D-09)              │
        │ markers/meta → triggers cm/tm/dr ; <title>/<desc> dérivés (D-18)     │
        │ svg-builder → source.svg raw (template strings, D-20)                │
        └───────────┬──────────────────────────────────────────────────────────┘
                    │ re-validation zod LottieJSON AVANT retour (COM-03)
                    │ v:"5.7.0" pinné, ddd:0, ty:4, zéro expression (COM-04)
                    ▼
        CompileResult { lottie, svg, renderer_support: "all"|"svg-only" (D-11) }
                    │
                    │  (chaînage EXPLICITE par l'appelant — D-17)
                    ▼
        ┌──────────────────────── src/svg-sanitizer/ ──────────────────────────┐
        │ gates allow-list AVANT preset-default : forbid-text/raster/fo/security│
        │   → violations collectées → REJET dur (sanitize_rejected)            │
        │ SVGO optimize: preset-default + overrides {removeDesc:false,         │
        │   cleanupIds:false, collapseGroups:false} + multipass (ADR-02)       │
        │ stabilize-ids : assertion schéma 2/3 segments (SAN-03, non-rewrite)  │
        └───────────┬──────────────────────────────────────────────────────────┘
                    │ { svg, report } (contraintes vérifiées, rejets — MFT-01 Ph 5)
                    ▼
        Sorties finales : Lottie JSON bytes + SVG optimisé bytes
                    │
        ═══ RPC JSON-over-stdio (Pattern 5, D-27/D-28/D-36) ═══
        src/rpc/server.ts (NDJSON, stdout protocole seul, logs→stderr)
            ▲ spawn via tsx (Node 20 CI)
            │
        lottie_forge/rpc/client.py (transport lockstep + enveloppe D-28)
            │
        pytest tests/rpc/test_rpc_integration.py (§6.6 — étapes CI existantes)
```

### Recommended Project Structure

```
src/
├── shared/                          # nouveau (§2.7 le sanctionne : shared/)
│   ├── format.ts                    # fmt() toFixed(4) sémantique + sérialiseur JSON déterministe (D-23/D-35)
│   └── format.spec.ts               # matrice exacte : ties, négatifs, -0, bornes, exponentielle interdite
├── motion-compiler/
│   ├── compiler.ts                  # renderSpecToLottie() : orchestre + re-validation zod + renderer_support
│   ├── keyframe-emitter.ts          # switch exhaustif SANS default sur keyframe_shape (10 formes, D-37)
│   ├── transform-builder.ts         # blocs ks position/scale/rotation/opacity (scale ≥ 0 dur)
│   ├── shape-builder.ts             # 5 générateurs paramétriques → items Lottie + path data
│   ├── color-resolver.ts            # hex→RGB 0..1 ; fills neutres zones stylables (D-09)
│   ├── markers.ts                   # triggers émis depuis keyframe_shape + trigger_points (D-34)
│   ├── meta.ts                      # g/a constants ; <title>/<desc> depuis asset_id+recipe_id (D-18)
│   ├── svg-builder.ts               # sérialisation SVG raw déterministe (D-19/D-20/D-22)
│   ├── feature-gate.ts              # SupportedLottieFeature + classification all|svg-only (D-33)
│   └── __tests__/
│       ├── compiler.spec.ts         # goldens 11 byte-for-byte + re-validation COM-03
│       ├── determinism.spec.ts      # double process spawn, diff trois-voies, délai ≥ 1 s (D-26/D-37)
│       ├── ids.spec.ts              # SAN-03 : IDs stables entre 2 régénérations, diff = ∅
│       ├── feature-gate.spec.ts     # COM-04 : rejets + branche svg-only forcée
│       ├── make-render-spec.ts      # builder TS source unique (D-04, patron fixtures.py)
│       └── goldens/                 # 11 fichiers byte-exacts (D-03/D-24)
├── svg-sanitizer/
│   ├── sanitize.ts                  # sanitizeSvg(svg) → {svg, report} ; rejet → sanitize_rejected
│   ├── config.ts                    # config SVGO 4 verrouillée (voir Pattern 2)
│   ├── constraint-report.ts         # rapport structuré (persisté Ph 5)
│   ├── plugins/
│   │   ├── forbid-text.ts           # <text>/<tspan> (SAN-01)
│   │   ├── forbid-raster.ts         # <image>/data URIs base64 (SAN-02)
│   │   ├── forbid-foreignobject.ts  # <foreignObject> + <script> + handlers + js: URIs + xlink externe (SAN-05)
│   │   ├── forbid-structure.ts      # commentaires XML, data-*, width/height racine, préfixés (D-31)
│   │   └── stabilize-ids.ts         # assertion schéma IDs 2/3 segments (D-32, non-rewrite)
│   └── __tests__/
│       ├── sanitize.spec.ts         # matrice de rejet vitest test.each (SAN-01/02/05)
│       ├── svgo-regression.spec.ts  # ADR-02 : viewBox + <title> (+ <desc>) survivent
│       └── self-consistency.spec.ts # D-31 : sanitize(raw golden) → zéro rejet ; isomorphisme D-37
├── rpc/
│   ├── server.ts                    # NDJSON + enveloppe D-28 + codes D-36 ; methods motion.compile, svg.sanitize
│   └── contracts/
│       ├── motion-compiler.schema.ts # RenderSpec (GELÉ Ph 3) + LottieJSON gate + CompileResult (D-13/D-29)
│       ├── sanitizer.schema.ts       # requête sanitize + SanitizeReport
│       ├── render-spec-rejection.ts  # loader cas render-spec.json / lottie-json.json (étend rejection-cases.ts)
│       └── (7 schémas Ph 1–2 intouchés)
└── (scripts/)
    ├── update-goldens.mjs           # goldens:update — refuse si CI=true, régénère 11 atomiquement (D-25/D-37)
    └── compile-stdin.ts             # entry : RenderSpec JSON stdin → bytes stdout (réutilisé par D-26 + update-goldens)

lottie_forge/
└── rpc/
    └── client.py                    # transport NDJSON + enveloppe générique (D-30), zéro type métier

fixtures/
├── render-specs/*.json              # 11 RenderSpec positives commitées (D-04)
└── rejection-cases/
    ├── render-spec.json             # cas négatifs + expect_code (D-29/D-37, format D-08 étendu)
    └── lottie-json.json             # cas négatifs LottieJSON gate (D-29)
```

### Pattern 1: Formateur décimal canonique + sérialiseur JSON contrôlé (D-23/D-35)
**What:** Toute sortie numérique (Lottie ET attributs SVG) passe par `fmt()` ; le JSON est sérialisé par un walker maison (ordre d'insertion = ordre du code, floats via `fmt`, compact, `\n` final).
**Why:** `JSON.stringify` émet le format shortest-roundtrip ; `toFixed` est entièrement spécifié ECMA-262 donc cross-engine identique — D-35 l'a verrouillé.
**Example:**
```typescript
// Sémantique D-35 : toFixed(4), -0 → 0, trailing zeros stripés, jamais d'exponentielle.
export function fmt(n: number): string {
  if (Object.is(n, -0)) n = 0;                    // -0 → 0
  let s = n.toFixed(4);                            // spec-ES, cross-engine déterministe
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
}  // bornes projet (|x| < 1e21, coords 0..1, viewBox ≤ 2048) → toFixed n'émet JAMAIS d'exponentielle
```
### Pattern 2: Config SVGO 4 verrouillée (ADR-02, SAN-03/04, D-31)
**What:** plugins custom collecteurs AVANT `preset-default` (ils voient l'arbre brut), overrides minimaux justifiés, pas de `removeViewBox`/`removeTitle` ré-ajoutés (absents du preset v4 — ADR-02 = état par défaut v4 + test de régression), pas de `prefixIds` (§6.4.2).
**Example:**
```typescript
// Source: github.com/svg/svgo docs (migration v3→v4 + plugins-api) — imports NOMMÉS obligatoires v4
import { optimize, type Plugin } from "svgo";

const forbidText: Plugin = {
  name: "forbid-text",
  fn: () => ({
    element: {
      enter: (node, parentNode, collected) => {   // collected = accumulateur passé en closure réelle
        if (node.name === "text" || node.name === "tspan") violations.push(/* SAN-01 */);
      },
    },
  }),
};

export const sanitizerConfig = {
  multipass: true,                                 // §6.4.2 « multipass autorisé »
  plugins: [
    forbidText, forbidRaster, forbidForeignObject, forbidStructure, // 1. REJET (collecte, aucunnettoyage silencieux)
    {                                               // 2. preset-default v4 — removeViewBox/removeTitle ABSENTS (ADR-02 ✓)
      name: "preset-default",
      params: {
        overrides: {
          removeDesc: false,    // <desc> autorisé D-31 — removeDesc est ENCORE dans le preset v4 !
          cleanupIds: false,    // SAN-03 — cleanupIds supprime/RENOMME les ids
          collapseGroups: false, // D-19 — préserve un <g> par component
        },
      },
    },
    stabilizeIds,                                   // 3. assertion IDs 2/3 segments (non-rewrite, D-32)
  ],
};
```
### Pattern 3: Re-validation zod avant retour (COM-03/COM-04)
**What:** `LottieJSONSchema` est un `strictObject` qui pinne les invariants du subset : `v: z.literal("5.7.0")`, `ddd: z.literal(0)`, layers = array de shape layers (`ty: z.literal(4)`), propriétés sans champ `x` (expression) — un JSON invalide ne peut structurellement pas sortir.
**When to use:** dernier acte de `compile()`, sur l'objet avant sérialisation ; échec → erreur `compile_error` (jamais de sortie partielle).
### Pattern 4: Harnais de rejet étendu (D-29/D-37)
**What:** `render-spec.json`/`lottie-json.json` au format D-08 (`case_id, ref, model, payload, expect_paths`) **+ `expect_code`** (code d'erreur fermé attendu) ; consommés par `test.each` vitest en Ph 3, pytest en Ph 7 sans réécriture.
### Pattern 5: Serveur NDJSON lockstep (D-27/D-28/D-36)
**Example:**
```typescript
// stdout = protocole seul ; logs → console.error (stderr) ; ligne malformée → protocol_error sans crash
import { createInterface } from "node:readline";
const rl = createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  let msg: unknown;
  try { msg = JSON.parse(line); } catch {
    write({ id: null, ok: false, error: { code: "protocol_error", message: "malformed line" } });
    return;
  }
  // dispatch method → parse zod → compile/sanitize → enveloppe {id, ok, result|error}
});
```

### Anti-Patterns to Avoid
- **Émettre des keyframes avec le champ `e` (legacy bodymovin)** : la spécification moderne ne définit que `s` par keyframe ; émettre `e` crée deux sources de vérité et rompt les goldens. Chaque keyframe porte son `s`.
- **Trier les layers/components** : D-10 interdit tout tri implicite ; l'ordre du tableau EST le z-order (avec l'inversion de rendu — Pitfall 1).
- **Passer des overrides `removeViewBox`/`removeTitle` à preset-default v4** : ces plugins n'y existent plus ; les ré-ajouter « au cas où » les RÉACTIVERAIT (comportement inverse de v3).
- **Laisser SVGO « nettoyer » au lieu de rejeter** : `removeScripts`/`removeComments` SVGO suppriment silencieusement — la gate doit REJETER (rapport + erreur) avant que preset-default ne mute l'arbre, d'où l'ordre des plugins.
- **Auto-création de goldens en local** : une comparaison `toMatchFileSnapshot` crée le fichier manquant sans `--update` — utiliser la comparaison Buffer explicite + `goldens:update` scripté.
- **Floats libres pour les stroke widths** : D-14 — référence token `thin|default|bold` uniquement, résolue côté compiler.
- **Régénérer les goldens en CI** : `goldens:update` refuse `CI=true` (D-37) ; la CI compare seulement.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parse/mutate/sérialiser l'arbre SVG pour les gates | Scanner XML regex ou parser XML maison | Plugins visiteur SVGO 4 (`element.enter(node, parentNode)`) sur l'arbre XAST | API visiteur = seule API v3/v4 (perItem supprimé) ; l'arbre est déjà là, les gates cohabitent avec l'optimisation `[CITED: github.com/svg/svgo docs/05-plugins-api.mdx]` |
| Détection/neutralisation `<script>`/handlers/URIs | Blacklist maison exhaustive sur la string finale | Nos gates collectrices + `removeScripts` v4 du preset (défense en profondeur) | `removeScripts` v4 couvre script + event handlers + script URIs — mais le REJET reste le nôtre (rapport MFT-01) `[CITED: svgo migration v3→v4]` |
| Rounding/formatage floats cross-engine | Strategies maison round-half-x | `Number.prototype.toFixed(4)` (sémantique ECMA-262) + strip | D-35 a choisi la sémantique ES précisément parce qu'elle est spécifiée au bit près, tous moteurs |
| Génération path data ellipse/rect/polystar | Math libre par dev | Algorithmes de rendu de la spec officielle (pseudo-code verbatim, constante E_t = 0.5519150244935105707435627) | La spec définit l'ordre des vertices et le sens de tracé — requis pour le trim path prévisible (draw-on) `[CITED: lottie.github.io/lottie-spec shapes page]` |
| Client JSON-RPC stdio | Framework RPC | readline + enveloppe fermée D-28 (~100 lignes) | Protocole NDJSON trivial, debuggable au pipe (D-27) ; un framework ajouterait surface + deps |

**Key insight:** tout ce qui est « juste du XML/JSON parse » existe déjà dans le stack verrouillé ; la valeur de la phase est dans la DÉTERMINISATION (formateur, ordre, pins) et les GATES (rejet vs nettoyage silencieux).

## Common Pitfalls

### Pitfall 1: Ordre de rendu Lottie INVERSÉ (D-10)
**What goes wrong:** components[0] = arrière-plan, mais le premier élément du tableau `layers`/`shapes` Lottie se rend AU-DESSUS (sémantique After Effects ; la spec : « Shapes are rendered in reverse order... the first object in the list will appear on top »).
**Why it happens:** convention AE contre-intuitive ; un mapping naïf inverse le z-order sans erreur visible immédiate.
**How to avoid:** émettre `layers = [...components].reverse()` (et dans chaque layer, ordonner les items pour que la pose voulue soit correcte) ; test d'isomorphisme D-37 + inspection de la pose.
**Warning signs:** la forme « arrière » masque la forme « avant » dans le rendu ; l'isomorphisme Lottie↔SVG diverge.
### Pitfall 2: Unités Lottie non triviales
**What goes wrong:** opacité Lottie = **0..100** (pas 0..1) ; échelle `[100,100]` = identité (pas `[1,1]`) ; trim path `s`/`e` = **pourcentages 0..100** ; couleurs = RGB **0..1** floats ; rotation en degrés horaire. Un fade émis `0→1` reste invisible ; une échelle `1.0` écrase l'asset à 1 %.
**How to avoid:** table de conversion centralisée (coords normalisées 0..1 RenderSpec → unités Lottie) testée unitairement ; keyframes d'opacité toujours en 0..100.
**Warning signs:** rendu noir/vide (opacité), asset microscopique (scale), draw-on invisible (trim à 1 au lieu de 100).
### Pitfall 3: Keyframes scalaires = format vecteur
**What goes wrong:** une propriété scalaire animée (rotation, opacité) utilise des keyframes **`s: [valeur]`** (tableau à 1 élément) — `s: valeur` nu est invalide.
**How to avoid:** l'emitter produit systématiquement `s` en tableau ; test golden le capture.
### Pitfall 4: Handles d'easing mal orientés
**What goes wrong:** `o` = handle SORTANT (premier point de contrôle), `i` = handle ENTRANT (second point de contrôle), portés par la **keyframe de départ** du segment ; `i`/`o` obligatoires SAUF dernière keyframe ou hold (`h: 1`). Inverser i/o accélère au lieu de ralentir.
**How to avoid:** mapping direct depuis `control_points [x1,y1,x2,y2]` : `o = {x: x1, y: y1}`, `i = {x: x2, y: y2}` (vectoriel : tableaux par dimension) `[CITED: lottie.github.io/lottie-spec properties page — easing handle semantics]` ; dernière keyframe sans `i`/`o`.
### Pitfall 5: SVGO v4 — removeDesc encore actif, removeViewBox/removeTitle absents
**What goes wrong:** (a) `removeDesc` est dans le preset-default v4 → `<desc>` (a11y, D-31) disparaît silencieusement ; (b) croire que `removeViewBox`/`removeTitle` sont actifs (comportement v3) et « les désactiver » via overrides est un no-op trompeur — en v4 ils sont déjà absents.
**How to avoid:** overrides exacts `{removeDesc: false, cleanupIds: false, collapseGroups: false}` ; test de régression asserte viewBox + `<title>` + `<desc>` après optimize.
**Warning signs:** diff de sanitize perd `<desc>` ; IDs courts (`a`, `b`) dans la sortie (cleanupIds actif).
### Pitfall 6: cleanupIds renomme les IDs stables (SAN-03)
**What goes wrong:** `cleanupIds` (actif par défaut) supprime les ids « inutilisés » et **raccourcit** les ids référencés (`a`, `a-1`...) — détruit le schéma `{asset_id}_{component}_{role}` et la stabilité inter-régénérations attendue par Ph 4/8.
**How to avoid:** override `cleanupIds: false` + `stabilize-ids` en assertion finale ; test SAN-03 sur la sortie **sanitisée** (pas seulement raw).
### Pitfall 7: `p` et `a` désalignés
**What goes wrong:** pour une transform « position pure », l'anchor `a` doit égaler `p` (spec : « To make the anchor point properly line up with the center of location, p and a should have the same value ») ; sinon rotation/scale tourne autour d'un pivot erroné.
**How to avoid:** transform-builder émet `a = p` pour les shapes centrées ; pivot explicite sinon (scale-pop).
### Pitfall 8: Node 20 n'exécute pas TS — le spawn pytest échoue
**What goes wrong:** le test d'intégration §6.6 (pytest spawn le serveur) échoue en CI (`node src/rpc/server.ts` ≠ exécutable sur Node 20 ; type-stripping natif = Node ≥ 22.6).
**How to avoid:** devDep `tsx` ; spawn `npx tsx src/rpc/server.ts` (client.py paramètre la commande) ; scripts `compile-stdin.ts` idem.
**Warning signs:** `ERR_UNKNOWN_FILE_EXTENSION` / SyntaxError sur les types TS dans le stderr du spawn.
### Pitfall 9: `.gitattributes` LF vs goldens sur Windows
**What goes wrong:** les goldens committés LF seraient convertis CRLF au checkout sans la règle `* text=auto eol=lf` → diff byte-for-byte échoue sur Windows.
**How to avoid:** la règle existe déjà (Phase 1) `[VERIFIED: .gitattributes — "* text=auto eol=lf"]` ; le writer Node écrit `\n` (jamais `os.EOL`) ; D-24 s'appuie dessus — ne PAS toucher à `.gitattributes`.
### Pitfall 10: Propriétés non-animées vs animées (`a: 0|1`)
**What goes wrong:** `k` porte la valeur directe si `a: 0`, un array de keyframes si `a: 1` ; oublier `a` ou émettre des keyframes pour une propriété statique gonfle les goldens et complique la gate.
**How to avoid:** transform-builder émet `a: 0` + valeur directe pour tout ce qui n'est pas la motion de la recette ; `a: 1` + keyframes seulement pour la propriété animée par `keyframe_shape`.
### Pitfall 11: Dernière keyframe avec `i`/`o` ou keyframes désordonnées
**What goes wrong:** la spec : keyframes ** ascendantes en `t`** ; `i`/`o` obligatoires sauf dernière keyframe ou hold — un `i`/`o` surnuméraire ou un `t` décroissant = JSON invalide (et la gate COM-03 doit le rejeter).
**How to avoid:** l'emitter trie et termine sans `i`/`o` ; cas de rejet `lottie-json.json` couvre ces deux violations.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | lottie-web 5.13 accepte les keyframes `s`-only (sans champ `e` legacy) | Pitfalls 1, Pattern keyframes | Si faux : rendu dégradé — mais la spec moderne normalise `s`-only et lottie-web suit ; testable Ph 4 frame-walk |
| A2 | Le champ écosystème `v` (string) reste la référence de compat (la spec communautaire normalise `ver` integer MMmmpp) — D-12 pinnant `v = "5.7.0"` reste le bon contrat | COM-04 | Faible : D-12 verbatim doc projet ; l'écosystème bodymovin utilise `v` |
| A3 | Node 20 CI ne peut pas exécuter TS nativement (type-stripping natif ≥ 22.6) → tsx requis | Pitfall 8, Stack | Si faux : tsx superflu mais inoffensif ; le spawn échoué serait détecté au premier test d'intégration |
| A4 | `fr = 60` et `op = round(duration_ms × fr / 1000)` comme règle de frames (planner peut choisir autre valeur entière déterministe) | Open Questions | Goldens invalidés si changé plus tard — décider AU PLANNING (reversibility D-23 analogue) |
| A5 | La sortie SVGO est déterministe pour (input, config, version) fixes — pas documenté explicitement, couvert par design et par le double-spawn D-26 si l'étendue inclut sanitize | Déterminisme | Si faux : goldens SVG sanitizés instables — le diff trois-voies le révélerait immédiatement |
| A6 | svgo exporte ses types TS (`import { optimize }`) compatibles NodeNext/verbatimModuleSyntax | Stack | tsc signalerait à la première compile ; contournement trivial (déclaration locale) |

## Open Questions (RESOLVED)

> RESOLVED at planning (all four pinned in the phase plans):
> - **Q1 (fr/op)** → plan 03-04 (`meta.ts`: fr = 60, ip = 0, op = Math.round(duration_ms × 60 / 1000) — the A4 rule, unit-tested).
> - **Q2 (golden container)** → plan 03-06 (combined envelope `{ lottie, svg, renderer_support }`, one file per fixture, 11 files).
> - **Q3 (svg-only set)** → plan 03-05 (branch forced synthetically via a masks/matting classification fixture; the real set fills in Ph 4/8).
> - **Q4 (SVGO floatPrecision)** → plan 03-04 (`config.ts`: override `floatPrecision: 4` on `cleanupNumericValues` + `convertPathData` — research recommendation adopted for D-35 fidelity).

1. **fr / op : cadence et arrondi des frames**
   - What we know: `duration_ms` catalogue 600..1500 (envelope pack) ; spec `fr`/`ip`/`op` libres.
   - What's unclear: valeur `fr` pinnée (60 ?) et règle d'arrondi `op` quand `duration_ms × fr / 1000` est non entier (ex. 700 ms × 60 = 42 ✓ ; 1100 × 60 = 66 ✓ — à 60 fps, tous les multiples de 100 ms sont exacts ; mais la borne autorise tout 100..10000).
   - Recommendation: `fr = 60` + règle `op = Math.round(...)` documentée dans `meta.ts` + testé ; décider au planning (A4).
2. **Conteneur des 11 goldens**
   - What we know: D-03 fixe 11 fichiers ; D-24 « goldens = exactement les bytes livrés » ; deux artefacts par fixture (Lottie + SVG).
   - What's unclear: golden = Lottie seul (SVG couvert par double-diff + self-consistency) ou enveloppe `{lottie, svg, renderer_support}` sérialisée (couvre les deux byte-exactement en 1 fichier) ?
   - Recommendation: enveloppe combinée (couvre COM-01 « sorties identiques » au sens plein) ; planner tranche.
3. **Set des features `svg-only` en Phase 3**
   - What we know: D-33 exige un test forçant la branche ; le compiler Ph 3 n'émet a priori que du « all ».
   - What's unclear: y a-t-il un feature émis Ph 3 réellement svg-only (ex. trim-path sur polystar dans les renderers non-SVG) ?
   - Recommendation: si aucun — la branche est testée par classification synthétique (fixture LottieJSON à base de masks/matting) ; le vrai set se remplira en Ph 4/8.
4. **Précision float des plugins numériques SVGO**
   - What we know: `cleanupNumericValues`/`convertPathData` ont `floatPrecision` défaut 3 ; D-35 impose toFixed(4) côté compiler.
   - What's unclear: le SVG final sanitisé doit-il garder 4 décimales (override floatPrecision: 4) ou la précision SVGO 3 suffit-elle (déterministe, plus petit) ?
   - Recommendation: override `floatPrecision: 4` sur ces deux params pour la fidélité géométrique ; discretion planner (D-details SVGO).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | backbone, tests, spawn | ✓ local / ✓ CI | 26.3.0 local / 20 CI | — |
| npm | install, lockfile | ✓ | 11.16.0 | — |
| Python 3.12 | test intégration §6.6 (pytest) | ✓ (.venv) / ✓ CI | 3.12.13 venv / 3.12 CI | — |
| tsx | spawn TS par pytest/scripts | ✗ à installer (devDep) | 4.23.13 ciblé | vite-node (transitif) — fragile |
| svgo | sanitizer | ✗ à installer | ^4.1.0 | Aucun (pin ADR-02) |
| lottie-web | Ph 4 seulement | ✗ non requis Ph 3 | 5.13.0 = pin | — |
| GitHub Actions verify.yml | ramassage des gates | ✓ inchangé (12 étapes) | — | — |

**Missing dependencies with no fallback:** none (svgo est requis mais il s'installe ; « no fallback » = aucun substitut autorisé au pin ADR-02).
**Missing dependencies with fallback:** tsx → vite-node en dépannage (déconseillé).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.x (config existante : `src/**/*.spec.ts`, env node, junitxml `fixtures/bridge/vitest-junit.xml`) + pytest 8 côté intégration |
| Config file | `vitest.config.ts` (existant, inchangé) |
| Quick run command | `npx vitest run src/motion-compiler src/svg-sanitizer src/shared` |
| Full suite command | `npx vitest run && python -m pytest tests/ -q` (miroir local des étapes 09/10 de verify.yml) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COM-01 | 11 goldens byte-for-byte (Buffer.compare) + double process spawn diff trois-voies, délai ≥ 1 s | golden + integration | `npx vitest run src/motion-compiler/__tests__/compiler.spec.ts src/motion-compiler/__tests__/determinism.spec.ts` | ❌ Wave 0 (créés en premier plan) |
| COM-01 | Formateur fmt() : ties, négatifs, -0, bornes, zéro exponentielle | unit | `npx vitest run src/shared/format.spec.ts` | ❌ Wave 0 |
| COM-02 | Zéro `langchain|openai|anthropic` dans package.json/tsconfig/src | CI gate (test ordinaire) | `npx vitest run src/rpc/contracts/no-llm-imports.spec.ts` | ❌ Wave 0 |
| COM-03 | Re-validation zod LottieJSON : JSON invalide ne sort jamais ; rejets `lottie-json.json` (test.each, expect_code) | unit/parametrized | `npx vitest run src/rpc/contracts` + `src/motion-compiler/__tests__/compiler.spec.ts` | ❌ Wave 0 |
| COM-04 | Feature gate : rejets durs (`unsupported_feature`), `v` pinné, branche svg-only forcée | unit | `npx vitest run src/motion-compiler/__tests__/feature-gate.spec.ts` | ❌ Wave 0 |
| SAN-01/02/05 | Matrice de rejet SVG adversariale (text/tspan/image/base64/foreignObject/script/handlers/js:/xlink externe/commentaires/data-*/préfixés) | parametrized | `npx vitest run src/svg-sanitizer/__tests__/sanitize.spec.ts` | ❌ Wave 0 |
| SAN-03 | IDs `{asset_id}_{component}_{role}` identiques entre 2 régénérations (diff = ∅) sur sortie SANITISÉE | unit | `npx vitest run src/motion-compiler/__tests__/ids.spec.ts` | ❌ Wave 0 |
| SAN-04 | ADR-02 : viewBox + `<title>` + `<desc>` survivent à optimize | regression | `npx vitest run src/svg-sanitizer/__tests__/svgo-regression.spec.ts` | ❌ Wave 0 |
| D-31/D-37 | Self-consistance (sanitize(raw golden) → 0 rejet), isomorphisme Lottie↔SVG, ink visible (non-dégénérescence) | unit | `npx vitest run src/svg-sanitizer/__tests__/self-consistency.spec.ts` | ❌ Wave 0 |
| §6.6/D-30 | Intégration Py→TS : client.py spawn serveur (tsx), motion.compile puis svg.sanitize, enveloppe D-28, codes fermés, protocol_error sans crash | integration | `python -m pytest tests/rpc/test_rpc_integration.py -q` | ❌ Wave 0 |
| D-25/D-37 | `goldens:update` refuse CI=true, régénère 11 atomiquement | script gate | `node scripts/update-goldens.mjs` (local) ; négatif : `CI=true node scripts/update-goldens.mjs` → exit 1 | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/motion-compiler src/svg-sanitizer src/shared` + `npx tsc --noEmit`
- **Per wave merge:** chaîne miroir locale complète : `ruff check . && npx @biomejs/biome check . && python -m pytest tests/ -q -k export && npx vitest run && python -m pytest tests/ -q && npx tsc --noEmit`
- **Phase gate:** chaîne 12 étapes verte (équivalent verify.yml) + goldens byte-exacts + zéro test skippé (assert-zero-skips)

### Wave 0 Gaps
- [ ] `src/shared/format.ts` + `format.spec.ts` — socle du déterminisme (tout le reste en dépend)
- [ ] `src/rpc/contracts/motion-compiler.schema.ts` + `sanitizer.schema.ts` + loaders rejet étendus (`expect_code`)
- [ ] `fixtures/render-specs/*.json` (11, via `make_render_spec()`) + `fixtures/rejection-cases/render-spec.json` + `lottie-json.json`
- [ ] `npm install svgo@^4.1.0` + `npm install -D tsx` (après checkpoint:human-verify) + `scripts/compile-stdin.ts` + `scripts/update-goldens.mjs`
- [ ] Répertoire `src/motion-compiler/__tests__/goldens/` créé par `goldens:update` puis committé same-commit (D-25)

## Security Domain

> `security_enforcement: true`, ASVS level 1 (config.json). Phase = compilateur local + gate de sanitization — pas d'auth/session/crypto ; la SAN-05 EST une surface sécurité (XSS par SVG).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — (aucune surface) |
| V3 Session Management | no | — |
| V4 Access Control | no | — (processus local mono-opérateur) |
| V5 Input Validation | **yes** | zod strictObject à CHAQUE frontière (RenderSpec, requêtes RPC) + allow-list SVG éléments/attributs (SAN-01/02/05) ; parse JSON gardé (try/catch → protocol_error, D-36) |
| V6 Cryptography | no | — (sha256 = intégrité, pas crypto applicative ; libnode/crypto natif en Ph 5) |
| V14 Config | yes (léger) | stdout réservé protocole (logs→stderr) — anti-mixing channels ; `g`/`a` meta constants — zéro donnée user-supplied (§6.3.2, anti information-disclosure) |

### Known Threat Patterns for ce stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via SVG (`<script>`, `on*` handlers, `javascript:` URIs, `<foreignObject>`, xlink externe) | Tampering/Elevation | Allow-list dur + rejet rapporté AVANT optimisation (nos gates) ; `removeScripts` SVGO v4 en profondeur ; le SVG consommé par des tiers (packs vendus) — rejet, jamais nettoyage silencieux |
| Raster/base64 embarqué (exfiltration, poids, non-vectoriel) | Tampering | `forbid-raster` : `<image>` + toute data URI base64 (SAN-02) |
| Fuite de données user dans `<title>`/`<desc>`/meta | Information Disclosure | D-18 : dérivation déterministe depuis `asset_id`+`recipe_id` uniquement ; `meta.ts` constantes |
| Ligne NDJSON hostile (spawn par un tiers) | DoS/Tampering | Parse gardé, réponse `protocol_error` sans crash (D-36) ; pas d'eval ; zod à l'entrée de chaque méthode |
| Injection via noms de champs/ids | Tampering | D-01/D-13 : modèles clos + patterns kebab (KebabToken) ; ids construits depuis `asset_id` (`^a-\d{3}$`) + tokens — aucun texte libre |

## Code Examples

### Émission d'un bloc transform conforme (unités vérifiées spec)
```typescript
// Source: lottie.github.io/lottie-spec — helpers (Transform) + properties (Property/Keyframe)
// scale [100,100] = identité ; opacity 0..100 ; scalaires animés → keyframes s:[v]
const opacityProp = (animated: boolean, frames: {t: number; v: number}[]) =>
  animated
    ? { a: 1, k: frames.map(({t, v}, i) => ({
        t,
        s: [fmtNum(v * 100)],                       // PITFALL 2 : 0..100
        ...(i === frames.length - 1 ? {} : {        // PITFALL 11 : dernière keyframe sans i/o
          o: { x: oX, y: oY },                      // handles depuis control_points[0..1]
          i: { x: iX, y: iY },
        }),
      })) }
    : { a: 0, k: Math.round(v * 100) };
```

### Draw-on : trim path en pourcentages
```typescript
// Source: lottie.github.io/lottie-spec — shapes (Trim Path tm : s/e en 0..100)
// D-14 : trim 0→100 émis par keyframe-emitter depuis keyframe_shape "trim-path"
{ ty: "tm", s: { a: 0, k: 0 }, e: { a: 1, k: [
    { t: 0, s: [0], o: {x: x1, y: y1}, i: {x: x2, y: y2} },
    { t: lastFrame, s: [100] },
  ] }, o: { a: 0, k: 0 }, m: 1 }   // m: 1 = Parallel (constants page)
```

### IDs stables + inversion z-order (D-02/D-10/D-32)
```typescript
// components[0] = arrière-plan (D-10) ; layers[0] Lottie = PREMIER-plan (spec)
// → inversion à l'émission ; role ∈ ThemeAnchorId ∪ {"neutral"} (D-02)
const layers = [...spec.components].reverse().map((c) => ({
  ty: 4, nm: c.role,                              // nm = anchor (D-02, theming Ph 4/8)
  ind: deterministicIndex, ip: 0, op, ddd: 0,
  ks: buildTransform(c),
  shapes: [ groupWithId(`${spec.asset_id}_${c.component}`, /* ... */) ],
}));
// shapes elements: id `${asset_id}_${component}_${role}` (3 segments, D-32)
```

### Enveloppe RPC fermée (D-28/D-36)
```typescript
type RpcError = { code: "parse_error" | "validation_error" | "compile_error"
  | "sanitize_rejected" | "internal" | "protocol_error" | "method_not_found"
  | "unsupported_feature"; message: string; details?: unknown };
type RpcResponse = { id: number | null; ok: true; result: unknown }
  | { id: number | null; ok: false; error: RpcError };
// une ligne NDJSON par message ; stdout JAMAIS pollué (logs → stderr)
```

## Sources

### Primary (HIGH confidence)
- `docs/project/06_Backbone.md` §6.1–§6.8 — spécification cœur (lu intégralement session présente)
- `docs/project/02_Architecture.md` §2.5/§2.7/§2.9 — ADR-01/02, monorepo, Pattern 5
- `docs/project/03_Stack.md` §3.2/§3.6/§3.8 — pins, CI, interdits
- `03-CONTEXT.md` D-01..D-37 — décisions verrouillées
- Codebase lu session présente : `src/rpc/contracts/{vocabulary,recipe,catalogue,style-spec}.schema.ts`, `rejection-cases.ts`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `biome.json`, `.gitattributes`, `.github/workflows/verify.yml`, `fixtures/recipe-catalogue/catalogue.json`, `fixtures/style-specs/example-style/style.yaml`, `tests/bridge/fixtures.py`
- npm registry (`npm view`) : svgo 4.1.0, lottie-web 5.13.0, zod 4.5.4, vitest 4.1.11, typescript 7.0.2 (latest — non retenu), tsx 4.23.13 (engines node ≥18.16)

### Secondary (MEDIUM confidence)
- `[CITED: github.com/svg/svgo docs/06-migrations/01-migration-from-v3-to-v4.mdx]` — v4 : imports nommés, removeViewBox/removeTitle retirés du preset, removeScripts renommé, API publique restreinte
- `[CITED: svgo.dev/docs/preset-default/]` — liste complète du preset (removeDesc encore présent ; cleanupIds, collapseGroups actifs)
- `[CITED: github.com/svg/svgo docs/05-plugins-api.mdx]` — API visiteur custom plugins
- `[CITED: github.com/colinhacks/zod docs + src/v4]` — safeParse/superRefine/strictObject sémantique
- `[CITED: github.com/vitest-dev/vitest docs/api/expect.md v4.1.6]` — toMatchFileSnapshot (await requis, auto-création locale, --update)

### Tertiary (LOW confidence — vérifiées sur docs officielles mais via webfetch)
- `[CITED: lottie.github.io/lottie-spec/latest/ — composition, layers, shapes, properties, helpers, constants]` — tous les champs/unités/énumérations cités dans ce document ; schema JSON machine lisible disponible (specs/schema/) pour génération éventuelle de types

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pins projet + vérification registre session présente
- Architecture: HIGH — §6.2 nomme les fichiers, D-01..D-37 verrouillent le comportement, codebase cartographié
- Pitfalls: HIGH — chaque piège ancré sur spec officielle ou migration doc SVGO v4 vérifiée
- Format Lottie: MEDIUM-HIGH — spec officielle communautaire (WIP documentée) + D-12 verbatim ; compat lottie-web s-only keyframes = A1

**Research date:** 2026-08-31
**Valid until:** 2026-09-30 (stack verrouillé ; svgo 4.1.0/tsx récents — lockfile commute les dérives)
