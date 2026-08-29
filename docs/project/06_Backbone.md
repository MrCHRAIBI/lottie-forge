# Cahier des Charges Aligné — lottie-forge
## Partie 6 — Backbone déterministe : Motion Compiler & SVG Sanitizer (Phase 3)

> **Statut** : Partie 6 du cahier des charges aligné (Option B). Décrit la moitié déterministe TypeScript qui transforme les décisions typées (Parties 4–5) en artefacts réels : Lottie JSON canonique + SVG statique compagnon, puis valide ce SVG contre les contraintes dures. Couvre COM-01→04, SAN-01→05. Dépend des Parties 4–5 (contrats + catalogue). **Aucun LLM n'existe sur ce chemin de code.**
> **Références** : ROADMAP Phase 3 · REQUIREMENTS COM/SAN · ADR-01/02 · PITFALLS 1, 2, 7, 10 + Integration Gotchas · ARCHITECTURE.md (composants, Pattern 5) · Parties 1–5.

---

## 6.1 Objet & principes

| # | Principe | Traduction technique |
|---|----------|----------------------|
| 1 | **Le Motion Compiler est le SEUL producteur de Lottie JSON** (Pitfall 1) | Le LLM émet des recettes/specs ; jamais de JSON Lottie, jamais de path data |
| 2 | **Zéro LLM sur le chemin** (COM-02) | `package.json`/`tsconfig` du backbone : aucun import `langchain`/`openai`/`anthropic` ; grep CI bloquant |
| 3 | **Idempotence byte-for-byte** (COM-01) | Même `RenderSpec` → mêmes bytes ; golden files par recette ; pas d'horodatage ni d'ordre implicite dans la sortie |
| 4 | **Validation zod avant retour** (COM-03) | Le JSON émis est re-parsé contre le schéma zod typé `LottieJSON` avant d'être renvoyé ; un JSON invalide ne sort jamais |
| 5 | **SVG compagnon statique** (ADR-01) | Le SVG émis ne porte aucune animation (ni SMIL, ni CSS keyframes) |
| 6 | **IDs déterministes** (SAN-03) | Assignés par le compiler (jamais le LLM) : `{asset_id}_{component}_{role}` ; stables across régénération |
| 7 | **SVGO 4 verrouillé** (ADR-02, SAN-04) | `removeViewBox`/`removeTitle` **gardés désactivés** ; test de régression `viewBox` + `<title>` |

---

## 6.2 Structure des modules (`src/`)

```
src/
├── motion-compiler/
│   ├── compiler.ts            # renderSpecToLottie(renderSpec): LottieJSON (+ SVG compagnon)
│   ├── keyframe-emitter.ts    # recette (keyframe_shape, duration, easing, intensity) → keyframes Lottie
│   ├── transform-builder.ts   # blocs position/scale/rotation/opacity
│   ├── shape-builder.ts       # générateurs rect/ellipse/path/polystar/polyline (coordonnées normalisées + viewBox)
│   ├── color-resolver.ts      # tokens StyleSpec → couleurs concrètes ; fills neutres pour zones stylables
│   ├── markers.ts             # trigger points (enter/exit/loop)
│   ├── meta.ts                # champs g/a sanitizés (aucune donnée user-supplied)
│   └── __tests__/             # golden files byte-for-byte par recette
├── svg-sanitizer/
│   ├── sanitize.ts            # sanitizeSvg(svg): {svg, report}
│   ├── config.ts              # SVGO 4 : preset-default, removeViewBox/removeTitle désactivés
│   ├── plugins/               # forbid-text / forbid-raster / forbid-foreignobject / stabilize-ids
│   ├── constraint-report.ts   # rapport structuré (persisté au manifest)
│   └── __tests__/             # matrice de rejet + régression viewBox/title
└── rpc/
    ├── server.ts              # JSON-over-stdio : motion.compile, svg.sanitize (anim_qa.run / package.export ajoutés Phases 4/8)
    └── contracts/             # motion-compiler.schema.ts, sanitizer.schema.ts (zod)
```

---

## 6.3 Motion Compiler

### 6.3.1 Contrat d'entrée / sortie

- **Entrée** : `RenderSpec` (toute forme, keyframe et token couleur résolus) + recette du catalogue (Partie 5) + StyleSpec chargée. Le contrat zod `motion-compiler.schema.ts` est **figé en Phase 3** ; le miroir Pydantic et le Translator qui le produisent arrivent en Phase 7 — la forme est validée dès la Phase 3 par fixtures.
- **Sorties** : `LottieJSON` canonique **+** `source.svg` statique compagnon (ADR-01).

### 6.3.2 Émission des keyframes & transforms

- `keyframe-emitter` : `keyframe_shape` de la recette → keyframes Lottie ; `duration_ms` du catalogue ; **easing résolu depuis `StyleSpec.easing_curves`** (control points → handles d'easing Lottie) ; `intensity` scale l'amplitude ; `loops` du `MotionParams`.
- `transform-builder` : scale **toujours non négatif** (negative stretch = corruption d'export, rejet dur) ; pas de 3D (`ddd: 0`).
- `shape-builder` : système de coordonnées normalisé 0..1 + `viewBox` (responsive garanti).
- `color-resolver` : tokens palette → couleurs concrètes ; **fills neutres `[0.5,0.5,0.5,1.0]`** pour les layers stylables — seule condition pour que `setTheme` ait un effet (Pitfall 8).
- `meta.ts` : champs `g`/`a` constants sanitizés ; aucune donnée user-supplied (anti information-disclosure).

### 6.3.3 Contrat de theming (theme_anchors → `nm`)

- Le compiler assigne le `nm` des shape layers depuis `theme_anchors` de la recette (Partie 5) — jamais de noms auto-générés (`g123`).
- Le générateur dark-mode (Phase 8) itère sur les **mêmes ancres** ; le smoke test de theming (Phase 4) vérifie le diff light/dark > 5 % dans les régions attendues.

### 6.3.4 Gate de features & pin de version spec (COM-04, Pitfalls 7 & 10)

- **`SupportedLottieFeature` enum** à la frontière : subset lottie-web 5.13 (shapes, transforms, easing simple, masks `add`, matte). Rejet dur : 3D, audio/vidéo/image sequences, negative stretch, track matte canvas/html, expressions non supportées (`wiggle()`, `noise()`, `gaussRandom()`, …).
- **Pin de version** : champ `v` émis à la version pinnée (ex. `5.7.0+`) ; la gate rejette tout feature introduit après la version pinnée ; les patches compat-page (pre-4.4.14 / pre-5.7.15) ne doivent jamais s'appliquer.
- **Fallback déterministe** : expression nécessaire → **bake en keyframes** (`// lottie:bake`) par le compiler ; jamais d'expression vivante dans la sortie.
- **Politique deux renderers** : un asset nécessitant un feature hors subset est flaggé « SVG-renderer only » dans le manifest ; le Packager (Phase 8) l'exclut des exports Flutter/canvas ou refuse de le livrer.

### 6.3.5 Déterminisme & golden files

- Test golden **byte-for-byte** par recette (deux compilations indépendantes → bytes identiques) ; ordre d'insertion préservé, aucun tri implicite ; floats formatés de façon stable.

---

## 6.4 SVG Sanitizer

### 6.4.1 Gate structurelle par allow-list (SAN-01/02/05)

| Autorisés | Rejetés (avant QA) |
|---|---|
| `<path> <rect> <circle> <ellipse> <polygon> <polyline> <line> <g> <defs> <use> <linearGradient> <radialGradient> <stop> <clipPath> <mask> <filter> <style>` | `<text>`, `<tspan>` (SAN-01) · `<image>`, data URIs base64 (SAN-02) · `<foreignObject>`, `<script>`, event handlers (`onclick`…), URIs `javascript:`, `xlink:href` externe (SAN-05) |

### 6.4.2 Configuration SVGO 4 (SAN-04, ADR-02)

- `preset-default` avec `removeViewBox` / `removeTitle` **explicitement gardés désactivés** (absents du preset v4 ; ne pas les ré-ajouter en mode suppression).
- **Test de régression** : assert que `viewBox` et `<title>` survivent à l'optimisation (responsive + a11y).
- Multipass autorisé ; `prefixIds` **non utilisé** (les IDs sont déjà stables et nommés via `stabilize-ids`).

### 6.4.3 Plugins custom & rapport

- `forbid-text.ts`, `forbid-raster.ts`, `forbid-foreignobject.ts`, `stabilize-ids.ts` (schéma `{asset_id}_{component}_{role}`, non ré-écriture).
- `sanitizeSvg(svg) → { svg, report }` : rapport structuré (contraintes vérifiées, éléments rejetés) persisté au manifest (traçabilité MFT-01).

---

## 6.5 Frontière RPC (JSON-over-stdio, Pattern 5)

- `src/rpc/server.ts` expose `motion.compile` et `svg.sanitize` ; cold-start **une fois par pack**, processus chaud pendant le run.
- Chaque requête/réponse validée par zod (TS) **et** Pydantic (Python, re-validation côté client) ; aucun `unknown` non validé ne traverse.

```ts
serve({
  "motion.compile": async (req: unknown) => motionCompilerRequest.parse(req) && motionCompiler.compile(parsed),
  "svg.sanitize":   async (req: unknown) => sanitizerRequest.parse(req) && sanitizeSvg(parsed.svg),
});
```

---

## 6.6 Tests & critères de succès (Phase 3)

| Ce qui doit être VRAI | Mécanisme |
|---|---|
| Lottie JSON idempotent, parse zod, golden byte-for-byte | `__tests__/` golden par recette (COM-01) |
| Zéro import LLM dans le backbone | grep CI sur `package.json`/`tsconfig`/sources (COM-02) |
| JSON valide avant retour | parse zod `LottieJSON` dans le compiler (COM-03) |
| Subset lottie-web 5.13 couvert, features non supportés rejetés, `v` pinné | `SupportedLottieFeature` + tests de rejet + bake fallback (COM-04) |
| `<text>`/`<tspan>`/`<image>`/base64/`<foreignObject>`/`<script>`/handlers/`javascript:`/xlink externe rejetés | matrice de rejet Vitest (SAN-01/02/05) |
| `viewBox` + `<title>` survivent à SVGO | test de régression (SAN-04, ADR-02) |
| IDs `{asset_id}_{component}_{role}` stables | diff de deux régénérations = ∅ changement d'ID (SAN-03) |
| Modules exposés JSON-over-stdio | `src/rpc/server.ts` + test d'intégration client Py (Pattern 5) |

---

## 6.7 Couverture des exigences

| Exigence | Couverture |
|---|---|
| COM-01 | §6.3.5 (golden byte-for-byte) + §6.3.1 |
| COM-02 | §6.1 #2 (grep CI) |
| COM-03 | §6.3.1 #4 (validation zod avant retour) |
| COM-04 | §6.3.4 (enum + pin `v` + bake) |
| SAN-01 / SAN-02 | §6.4.1 (allow-list) |
| SAN-03 | §6.4.3 (`stabilize-ids`) + §6.3.2 |
| SAN-04 | §6.4.2 (SVGO désactivé + régression) |
| SAN-05 | §6.4.1 (rejet sécurité) |

---

## 6.8 Extensions différées

- **Multi-renderer QA** (lottie-web/react/vue/Flutter) → Phase 4 ; rapports par renderer (AQA-02) → v2.
- **Matrice mobile** lottie-ios/android → spike Phase 4 (Pitfall 10).
- **Passe d'optimisation de taille du Lottie JSON** (sans changement visuel) → v2.
- `anim_qa.run` / `package.export` sur le même serveur RPC → Phases 4/8.

---

*Fin de la Partie 6. Partie suivante : **Partie 7 — Anim QA (Playwright pinné, frame walk, pixelmatch, smoke test theming) (Phase 4)**.*