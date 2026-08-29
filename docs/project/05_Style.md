# Cahier des Charges Aligné — lottie-forge
## Partie 5 — Verrouillage du Style & Catalogue de Recettes (Phase 2)

> **Statut** : Partie 5 du cahier des charges aligné (Option B). Décrit la couche **données** de la cohérence : StyleSpec versionnée en YAML hashé, catalogue fermé de recettes en JSON versionné, `StyleRefinement` delta-only, gate de re-validation sur bump de version. Couvre STY-01→03, MOT-01→04. Dépend de la Partie 4 (Phase 1 construite : `StyleSpec`, `MotionRecipe`, bridge, `KebabToken`).
> **Références** : ROADMAP Phase 2 · REQUIREMENTS STY/MOT · PITFALLS 3, 4, 8 + UX (durées, easings) · ADR-03 · Parties 1–4.

---

## 5.1 Objet & principes

| # | Principe | Traduction technique |
|---|----------|----------------------|
| 1 | **Le style est une donnée, pas une prose** (Pitfall 4) | `StyleSpec` = fixture YAML versionné + hashé, injecté en JSON dans chaque system prompt ; le LLM s'y réfère, ne le redéfinit jamais |
| 2 | **Le catalogue est un fixture de system prompt** (Pitfall 3) | Le JSON complet du catalogue est **embarqué** dans chaque appel de génération ; la contrainte est dans le contexte, pas dans un doc optionnel |
| 3 | **Le recipe id est le seul contrat de motion** | Le LLM choisit un `id` clos + intensité ; le compilateur possède timing, easing, keyframes |
| 4 | **Le theming est un contrat de catalogue** (Pitfall 8) | Chaque recette déclare `theme_anchors` ; le Motion Compiler assigne les `nm` depuis ces ancres ; le dark-mode recolorera réellement |
| 5 | **Palettes dans la StyleSpec, fills neutres dans le Lottie** | Le Lottie JSON porte des fills neutres (`[0.5,0.5,0.5,1.0]`) que le thème écrase au runtime — seule condition pour que `setTheme` ait un effet |
| 6 | **Durées & easings possédés par le catalogue** | Chaque recette a `duration_ms` + `easing` (référence à `easing_curves` de la StyleSpec) ; le compilateur applique uniformément (UX : pas de 200 ms à côté de 4 s) |

---

## 5.2 Fixture StyleSpec : le style en données versionnées

### 5.2.1 Arborescence livrée

```
fixtures/style-specs/example-style/
├── style.yaml          # source de vérité canonique (chargée par Python via pyyaml)
├── palette.json        # export plat des tokens (consommateurs / QA)
└── baseline-frames/    # PNG canoniques — générés en Phase 4 (Anim QA), pas committés vides
```

### 5.2.2 `style.yaml` canonique (valeurs de référence Phase 2)

```yaml
style_id: example-style
style_version: 1.0.0
viewBox: { width: 400, height: 300 }
stroke_widths: { thin: 1.5, default: 2.5, bold: 4.0 }
corner_radii: { small: 0.0, medium: 8.0, large: 16.0 }
palette:
  - { name: ink,     hex: "#1F2430" }
  - { name: accent,  hex: "#FF6B4A" }
  - { name: surface, hex: "#F5F1EA" }
  - { name: success, hex: "#3E9B6E" }
easing_curves:
  - { name: standard,  control_points: [0.2, 0.0, 0.2, 1.0] }
  - { name: entrance,  control_points: [0.0, 0.0, 0.2, 1.0] }
```

Règles :
- `style_version` **requis** `^\d+\.\d+\.\d+$` (Partie 4) ; **hash sha256** du YAML canonique enregistré dans chaque manifest et chaque prompt.
- **Single-style par pack** (STY-01) : déjà structurel via le validateur `PackManifest` mono-style (Partie 4) ; la fixture est l'unique entrée de ce pin.
- **Chargement bilingue sans drift** : Python (`pyyaml` — dépendance dé-réservée, note IN-02) → `StyleSpec.model_validate` ; passage TS via le **bridge ordonné** de la Partie 4 (export Py → validate/re-emit zod → re-import strict), avec deep-equal + parité de clés JSON-schema. Le YAML ne traverse jamais directement la frontière : seul le JSON validé la traverse.

---

## 5.3 `StyleRefinement` : le contrat delta-only (STY-02)

```python
class StyleRefinement(BaseModel):
    model_config = STRICT_CONFIG                     # extra=forbid, strict=True
    sub_palette: list[KebabToken] = Field(min_length=1, max_length=16)   # noms ⊆ StyleSpec.palette
    motif: KebabToken | None = None                  # rôle sémantique ("sunset", "mono") — jamais une valeur visuelle
    stroke_pick: Literal["thin", "default", "bold"] = "default"
    radius_pick: Literal["small", "medium", "large"] = "medium"
    accent_weight: float = Field(ge=0, le=1, default=0.5)
```

- **Delta-only par construction** : aucun champ ne peut porter un hex libre, un path, un `<svg>` ou une épaisseur numérique hors Literal. Le check « `sub_palette` ⊆ palette de la StyleSpec chargée » est exécuté au **Translator** (Partie 7/Phase 7) contre la spec chargée ; la Phase 2 livre le **type** + les bornes (traceability « STY-02 partial »).
- **Test structurel delta-only** : assertion que l'ensemble des champs est exactement celui déclaré (modèle clos) + `KebabToken` rejette les payloads hex-like/svg-like (`"#fff"`, `"<path"`).
- Miroir zod `StyleRefinementSchema` (`z.strictObject`, mêmes Literal/bornes) + parité de rejet.
- L'agent `StyleRefiner` qui émet ce modèle arrive en **Phase 6** (snapshots dorés par style exemple) ; la Phase 2 = type + gate.

---

## 5.4 Gate de re-validation sur bump de version (STY-03)

| Bump | Déclencheur | Effet de la gate |
|---|---|---|
| PATCH | retouche sans changement visuel mesurable | re-validation **échantillonnée** des assets pinnés |
| MINOR | ajout de token/courbe rétro-compatible | re-validation des assets utilisant les tokens touchés |
| MAJOR | changement visuel (épaisseurs, rayons, palette) | re-validation de **tous** les assets pinnés sur la version antérieure |

Mécanique :
- **Phase 2** : job de validation qui scanne fixtures + `AssetSpec.style_ref` (`name@MAJOR.MINOR.PATCH`, ancre Partie 4) ; tout pin ≠ version courante de la fixture chargée est **flaggé** (suite de tests dédiée : bump simulé → flags attendus).
- **Phase 5+** : la gate devient **store-backed** (scan `assets.style_ref` du manifest store, MFT) et alimente le yield report (Phase 9) ; le rebuild déterministe (Phase 10) consomme la même ancre.
- Un pack ne mélange **jamais** deux suffixes de version (validateur mono-style déjà structurel, Partie 4).

---

## 5.5 Catalogue de recettes : le mouvement en données (MOT-01→04)

### 5.5.1 Schéma de `fixtures/recipe-catalogue/catalogue.json`

```json
{
  "catalogue_version": "1.0.0",
  "recipes": [
    {
      "id": "fade",
      "family": "opacity",
      "duration_ms": 800,
      "easing": "standard",
      "keyframe_shape": "opacity-ramp",
      "intensity_range": [0.0, 1.0],
      "shapes_supported": ["rect", "ellipse", "path"],
      "trigger_points": ["enter", "exit"],
      "theme_anchors": ["primary", "accent"]
    },
    {
      "id": "draw-on",
      "family": "stroke",
      "duration_ms": 1200,
      "easing": "entrance",
      "keyframe_shape": "trim-path",
      "intensity_range": [0.2, 1.0],
      "shapes_supported": ["path", "polyline"],
      "trigger_points": ["enter"],
      "theme_anchors": ["accent"]
    }
  ]
}
```

### 5.5.2 Les 10 recettes verrouillées (ADR-03, invariant 8–12)

| id | family | duration_ms | easing | keyframe_shape | theme_anchors |
|---|---|---|---|---|---|
| fade | opacity | 800 | standard | opacity-ramp | primary, accent |
| slide | transform | 1000 | standard | translate-in | primary |
| bounce | transform | 1200 | entrance | overshoot-settle | primary, accent |
| pulse | scale | 900 | standard | scale-breath | accent |
| draw-on | stroke | 1200 | entrance | trim-path | accent |
| rotate | transform | 1100 | standard | angular-in | primary |
| scale-pop | scale | 700 | entrance | pop-settle | primary, accent |
| float | transform | 1400 | standard | sine-drift | primary, background |
| wiggle | transform | 800 | standard | damped-oscillation | accent |
| orbit | transform | 1500 | standard | circular-path | primary, accent |

### 5.5.3 Modèle `RecipeCatalogue` + validateurs niveau catalogue

- `RecipeCatalogue { catalogue_version: ^\d+\.\d+\.\d+$ ; recipes: list[CatalogRecipe] 8..12 }` ; `CatalogRecipe` **étend** `MotionRecipe` (Partie 4) avec `keyframe_shape` Literal, `intensity_range` tuple 0..1 ordonné, `shapes_supported` ⊆ `{rect, ellipse, path, polyline, polystar}`, `trigger_points` ⊆ `{enter, exit, loop}`.
- Validateurs agrégés (un par invariant, message pinpoint, miroir zod `superRefine`) :
  1. **ids ⊆ `RecipeId`** (vocabulary.py importé, jamais redéclaré) + unicité + invariant 8–12 ;
  2. **`theme_anchors` ≥ 1** par recette (MOT-03) — labels **non-PII** (`primary`, `secondary`, `accent`, `background`, `success`, `danger`) en `KebabToken` ;
  3. **`easing` ∈ noms de `StyleSpec.easing_curves`** — cross-référence validée au chargement **conjoint** (catalogue + style) ;
  4. **Durées cohérentes** : plage pack 600..1500 ms pour le motion primaire (bornes modèle 100..10000 conservées, Partie 4).
- **Règle same-commit étendue** : tout changement d'appartenance touche `vocabulary.py` **et** `vocabulary.schema.ts` **et** `catalogue.json` dans le même commit (ADR-03).
- **Chargement bilingue (MOT-04)** : JSON committé lu **directement** par Python (`RecipeCatalogue`) et TS (`RecipeCatalogueSchema`) ; test de parité deep-equal + parité de rejet (`disco-spin`, `theme_anchors: []`, easing inconnu).
- **Fixture de system prompt** : le catalogue verbatim + son hash sont câblés dans le template de prompt du RecipePicker (`agents/prompts/`, Phase 6) ; un test asserte le placeholder + l'enregistrement du hash au manifest.

---

## 5.6 Audit de couverture motion (flag de recherche Phase 2)

- Verticales cibles : **fintech, dev tools, e-commerce** (états héro : succès paiement, déploiement, ajout panier…).
- Méthode : mapper chaque état requis à une recette existante ; un trou de couverture se traite par **swap d'appartenance** dans la plage 8–12 (same-commit, §5.5.3), **jamais** par invention hors catalogue.
- L'audit est **rejoué à chaque changement de catalogue** (test de mapping fixture → recettes).

---

## 5.7 Tests & critères de succès (Phase 2)

| Ce qui doit être VRAI | Mécanisme |
|---|---|
| Fixture `fixtures/style-specs/example-style/` existe (YAML hashé), chargée Py **et** TS sans drift | Bridge ordonné : deep-equal + parité de clés ; test de hash |
| `catalogue.json` contient 8–12 recettes déclarant `id, family, duration_ms, easing, keyframe_shape, theme_anchors` | `RecipeCatalogue` + `RecipeCatalogueSchema` ; parité de rejet |
| `MotionRecipe` rejette tout id inconnu (`disco-spin` → `ValidationError`) | Suite Phase 4 ré-assertée (Literal clos) |
| `StyleRefinement` existe en type **delta-only** (jamais SVG/path data) | Test structurel modèle clos + rejets KebabToken |
| Un bump de `style_version` flaggue tous les assets pinnés sur l'ancienne version | Job de gate (fixtures-level Phase 2 ; store-backed Phase 5) |

---

## 5.8 Couverture des exigences

| Exigence | Couverture |
|---|---|
| STY-01 | §5.2 (fixture unique + pin mono-style structurel Partie 4) |
| STY-02 (partial) | §5.3 (type delta-only ; agent Phase 6) |
| STY-03 | §5.4 (gate de bump, ancre `style_ref`) |
| MOT-01 | §5.5 (catalogue fermé 8–12 en données) |
| MOT-02 (partial) | §5.5.3 (ids ⊆ vocabulaire clos ; RecipePicker Phase 6) |
| MOT-03 | §5.5.3 (`theme_anchors` ≥ 1, non-PII) |
| MOT-04 | §5.5.3 (fixture versionnée chargée par les deux couches) |

---

## 5.9 Extensions différées

- Snapshots `StyleRefiner` / `RecipePicker` → Phase 6 ; baseline-frames générés → Phase 4 ; gate store-backed → Phase 5/9.
- `family` resserré en `Literal` : **non** — le catalogue reste la source des familles (pas de seconde liste).
- Seconde StyleSpec (COH-02) et bibliothèque de styles (CAT-02) → v1.x/v2 ; le mécanisme de la Partie 5 est conçu pour être réutilisable, pas single-style par accident.

---

*Fin de la Partie 5. Partie suivante : **Partie 6 — Backbone déterministe : Motion Compiler & SVG Sanitizer (Phase 3)**.*