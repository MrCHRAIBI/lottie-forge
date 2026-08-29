# Cahier des Charges Aligné — lottie-forge
## Partie 11 — Packager & Exports Multi-Frameworks (React/Vue/Flutter/HTML + dark-mode themeId) (Phase 8)

> **Statut** : Partie 11 du cahier des charges aligné (Option B). Décrit le dernier module déterministe : à partir d'**un seul Lottie JSON canonique**, génération des 4 exports dev-ready + variante dark-mode, et transformation du pack en **produit installable**. Couvre EXP-01→05. Dépend des Parties 6 (backbone, `nm` depuis `theme_anchors`), 7 (smoke test theming), 8 (store, `dotlottie_sha256`), 10 (RenderSpec/pipeline).
> **Références** : ROADMAP Phase 8 · REQUIREMENTS EXP-01→05 · ADR-04 (Vite 7) & ADR-05 (themeId primaire) · STACK.md (chaîne de rendu) · PITFALLS Integration Gotchas · Parties 6–10.

---

## 11.1 Objet & principes

| # | Principe | Traduction technique |
|---|----------|----------------------|
| 1 | **Le JSON est le contrat, les wrappers sont fins** | Un seul `source.lottie.json` canonique ; les 4 exports sont du codegen déterministe depuis ce JSON (Pattern 5) ; une customisation = 4 sorties régénérées |
| 2 | **Jamais de re-bundle de lottie-web** | `lottie-web`/`lottie-react`/`@lottiefiles/*` en `external`/`peerDependencies` ; pas 200 Ko de JS dupliqués par export |
| 3 | **Dark-mode sémantique, pas inversif** | Mécanisme primaire dotLottie `themeId` + `theme_anchors` (ADR-05) ; `currentColor`/CSS custom properties **uniquement** en fallback HTML/SVG pur |
| 4 | **Fills neutres dans le JSON, thèmes en données** | Le Lottie porte des fills neutres ; les palettes light+dark vivent dans des objets de thème versionnés — itérer sur le dark-mode **sans régénérer le Lottie** |
| 5 | **Deep-clone par rendu consommateur** | `structuredClone(animationData)` avant chaque `loadAnimation` (repeater lottie-web) ; jamais le même objet partagé entre deux instances |
| 6 | **Capacités par joueur** | Le JSON est partagé ; les templates de composants et `manifest_player_capabilities` sont par joueur ; un asset « SVG-renderer only » est exclu des exports Flutter/canvas |

---

## 11.2 Contrat RPC du Packager

```python
class PackageRequest(BaseModel):
    model_config = STRICT_CONFIG
    pack_id: PackId
    asset_id: AssetId
    lottie_sha256: str                       # ^[a-f0-9]{64}$ — le Packager ne recalcule rien
    theme_anchors: list[KebabToken]
    targets: list[Literal["react", "vue", "flutter", "html"]] = ["react", "vue", "flutter", "html"]
    emit_dotlottie: bool = True              # émet asset.lottie (zip) pour players dotLottie

class ExportEntry(BaseModel):
    model_config = STRICT_CONFIG
    target: Literal["react", "vue", "flutter", "html", "dotlottie"]
    path: str
    sha256: str
    size_bytes: int = Field(ge=0)

class PackageResult(BaseModel):
    model_config = STRICT_CONFIG
    exports: list[ExportEntry]
    dotlottie_sha256: str | None = None      # → ContentHashes (Partie 4), même commit modèle+colonne+schéma
```

- Exposé via `src/rpc/server.ts` : `package.export` (ajouté au serveur de la Partie 6) ; zod mirrors `package-request.schema.ts` / `package-result.schema.ts`.
- **Codegen pur** : templates versionnés dans `src/packager/templates/` ; mêmes entrées → mêmes bytes (golden files de templates).

---

## 11.3 Thèmes en données (`theme.ts`)

```json
{
  "theme_id": "dark",
  "style_ref": "example-style@1.0.0",
  "rules": [
    { "id": "primary", "kind": "color", "value": [0.12, 0.14, 0.19, 1.0] },
    { "id": "accent",  "kind": "color", "value": [1.00, 0.42, 0.29, 1.0] }
  ]
}
```

- `rules[].id` ∈ vocabulaire `theme_anchors` (non-PII, Partie 5) ; **`rules[].id` == `nm` des shape layers** assignés par le Motion Compiler (Partie 6) — sans ce match, `setTheme` est un no-op (Pitfall 8).
- `applyTheme(json, themeId)` : fonction **déterministe** qui réécrit les fills des layers dont le `nm` matche ; utilisée (a) au runtime par le wrapper React, (b) au packaging pour pré-appliquer les variantes Flutter.
- Les thèmes light+dark sont embarqués dans le **manifest de pack** ; le smoke test QA (Partie 7) est rejoué sur la sortie **packagée** (EXP-05).

---

## 11.4 Les quatre exports

### 11.4.1 React (`lottie-react` 3.1) — EXP-01
- `assets/a-XXX/react/src/Asset.tsx` : rendu via `lottie-react` ; **prop `theme`** ; `lottie-react` n'ayant pas d'API `setTheme`, la prop applique `applyTheme(structuredClone(animation), theme)` via `useMemo` + mise à jour sans re-mount (équivalent déterministe de « setTheme on prop change » ; décision verrouillée — le thème reste une **donnée**, le JSON canonique unique).
- `structuredClone` à chaque mount (règle 11.1 #5) ; enum `Theme` typé exporté ; variante `LottieLight` optionnelle (< 10 Ko).
- `package.json` par asset : `peerDependencies { react: "^18.2.0 || ^19.0.0", lottie-react: "^3.1.0" }`, metadata licence.

### 11.4.2 Vue (`@lottiefiles/dotlottie-vue` 0.5+) — EXP-02
- `assets/a-XXX/vue/src/Asset.vue` : composant `DotLottieVue` ; **prop `theme` réactive** → `player.setTheme(theme)` dans un `watch` (API native, ROADMAP SC) ; `setWasmUrl` obligatoire pour self-hosting CSP.
- `DotLottieWorker` : toutes les méthodes **await**ées (pitfall worker).

### 11.4.3 Flutter (`lottie` 3.5.1) — EXP-03
- `assets/a-XXX/flutter/lib/asset.dart` : `Lottie.asset(...)` ; le package `lottie` n'ayant pas de theming runtime, le Packager émet **deux JSON pré-appliqués** (`asset-light.json`, `asset-dark.json`) via `applyTheme` au packaging ; le widget choisit selon `Brightness`.
- **Cache `LottieComposition`** : charger une fois, partager le controller — jamais re-décoder par build.
- `pubspec.yaml` généré : `lottie: ^3.5.1` (+ `dotlottie_flutter: ^0.1.7` si state machines) ; note FFI Windows/Linux.

### 11.4.4 HTML pur (`lottie-svg` vendored / `lottie-web` 5.13) — EXP-04
- `assets/a-XXX/html/embed.html` : embed sans runtime lourd via `lottie-svg` (< 30 Ko) ; fallback `lottie-web` 5.13 si features requises.
- **Theming fallback (ADR-05)** : CSS custom properties + `currentColor` sur le SVG compagnon uniquement ; poster statique capturé avec `animations: 'disabled'`.

---

## 11.5 Layout de package & build Vite 7 (ADR-04)

```
pack-example-style-2026-08-27/
├── manifest.json · yield-report.md (Partie 12) · license.txt + index.html (Partie 13)
└── assets/a-000/
    ├── source.lottie.json · source.svg · asset.lottie (zip)
    ├── manifest.json · qa-report.json
    ├── react/  (package.json, src/Asset.tsx, dist/*.js + dist/*.cjs)
    ├── vue/    (package.json, src/Asset.vue)
    ├── flutter/(pubspec.yaml, lib/asset.dart, assets/*-light.json, assets/*-dark.json)
    └── html/   (embed.html)
```

- **Vite 7 library mode** : `build.lib` multi-entrées ; émission `dist/*.js` (ESM) + `dist/*.cjs` ; `rolldownOptions.external` = `react`, `vue`, `lottie-web`, `lottie-react`, `@lottiefiles/*` ; `verbatimModuleSyntax`.
- **`dotlottie_sha256`** : l'artefact `asset.lottie` existant désormais, le champ est ajouté à `ContentHashes` (Partie 4) par **édition même commit** du modèle Pydantic + schéma zod + colonne store (règle same-commit).

---

## 11.6 Règles d'intégration consommateur (documentées par package)

| Règle | Pourquoi |
|---|---|
| `structuredClone(animationData)` par rendu | Repeater lottie-web : partage d'objet = fuite/corruption |
| `setTheme` dans `watch`/`useEffect` (Vue/React) | Dark-mode mis à jour sans re-mount |
| Cacher `LottieComposition`, partager le controller (Flutter) | Évite le re-décodage par build |
| `await` sur `DotLottieWorker` | Méthodes async uniquement |
| JSON embarqué **inline**, jamais `path:` remote par défaut | Supply-chain : CDN compromis = JSON malveillant |
| Documenter SDK minimum (lottie-android 3.0+ / lottie-ios 3.0+) | Pitfall 10 : spec drift chez les vieux clients |

---

## 11.7 Tests & critères de succès (Phase 8)

| Ce qui doit être VRAI | Mécanisme |
|---|---|
| React (lottie-react 3.1) et Vue (dotlottie-vue 0.5+) rendent le **même** JSON ; prop `theme` met à jour au changement (setTheme natif Vue ; applyTheme déterministe React) | Smoke renders Vitest (happy-dom) + test de changement de prop (couleurs attendues modifiées) |
| Widget Flutter (lottie 3.5.1) rend depuis le même JSON ; `pubspec.yaml` généré par asset | Test de codegen (pubspec parse YAML valide) + render check manuel/CI optionnel |
| Export HTML rend via lottie-web 5.13 / lottie-svg vendored | Smoke test HTML (poster + player) |
| Variante dark générée via `themeId` + `theme_anchors` ; **smoke test theming passe sur la sortie packagée** (EXP-05) | Re-run du smoke test Partie 7 sur `asset.lottie` + thèmes du manifest (diff > 5 %) |
| `package.json`/`pubspec.yaml` par asset avec deps versionnées + metadata licence | Test structurel de codegen (champs requis présents, ranges exacts) |
| Codegen déterministe ; jamais de re-bundle lottie-web | Golden files de templates ; grep `external`/`peerDependencies` dans le build |

---

## 11.8 Couverture des exigences

| Exigence | Couverture |
|---|---|
| EXP-01 | §11.4.1 (React + prop theme) |
| EXP-02 | §11.4.2 (Vue + setTheme natif) |
| EXP-03 | §11.4.3 (Flutter + pubspec) |
| EXP-04 | §11.4.4 (HTML lottie-web / lottie-svg) |
| EXP-05 | §11.3 + §11.7 (themeId + theme_anchors ; smoke test packagé) |

---

## 11.9 Extensions différées

- Interactivité consommateur (scroll/cursor) : `useLottieInteractivity` (React) / événements dotLottie (Vue) — v2.
- Knobs de timing dans les wrappers (play-on-hover, scroll-trigger) — features wrapper, pas pipeline.
- Variante bundle extrême (`.lottie` + wasm) **par défaut** — aujourd'hui option configurée.
- Rapports QA par renderer (AQA-02, v2) ; la colonne `renderer` existe déjà (Partie 7).

---

*Fin de la Partie 11. Partie suivante : **Partie 12 — Observabilité, Coût & Yield Guards (Langfuse, gardes €0,05 / 70 %) (Phase 9)**.*