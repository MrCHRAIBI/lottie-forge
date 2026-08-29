# Cahier des Charges Aligné — lottie-forge
## Partie 2 — Architecture Cible : le split LLM/déterministe & les flux de données

> **Statut** : Partie 2 du cahier des charges aligné (Option B). Remplace `research/ARCHITECTURE.md` là où il y a conflit ; les décisions verrouillées (ADR-01→06) priment.
> **Contexte réel** : la Phase 1 est **déjà construite et vérifiée** (4 modèles Pydantic + miroirs zod + bridge ordonné + CI). Cette partie décrit l'architecture que les Phases 2→10 vont compléter.

---

## 2.1 Le principe non négociable : la ligne de déterminisme

L'architecture entière tient dans **un seul split** :

- **Agents LLM non déterministes** (idéation, style, composition, sélection de recette) remettent leurs sorties à des **modules de code déterministes** à travers une **frontière Pydantic typée**.
- **Aucun LLM ne produit jamais** : Lottie JSON, path data SVG, ou code de composant framework. Les agents ne produisent que des *recettes, specs et décisions*.
- Le **Motion Compiler est le SEUL producteur de Lottie JSON** (ADR-01 / Anti-Pattern 1).

```
[Agents LLM : StyleRefiner / RecipePicker / Composer]
        │  sorties = modèles Pydantic (StyleRefinement, RecipeSelection, CompositionSpec)
        ▼  ── frontière Pydantic : plus aucune implication LLM ──
[Translator DET] → [MotionCompiler TS] → [SVGSanitizer TS] → [AnimQA TS] → [ManifestWriter]
```

Construire les agents AVANT le backbone déterministe est **l'erreur la plus coûteuse** du projet (yield ~30 %, coût > €0.10/asset).

---

## 2.2 Les cinq piliers

| # | Pilier | Rôle |
|---|--------|------|
| 1 | **Style Spec (verrouillée, versionnée)** | Source de vérité « à quoi ressemble le pack ». Le LLM ne varie que le choix de recette fermée et la composition dans le style verrouillé. |
| 2 | **Pack Orchestrator (LangGraph)** | State machine top-level ; fan-out `Send` ×50 ; rollup QA ; émet le pack manifest. |
| 3 | **Asset Subgraph** | Par asset : Refiner → Picker → Composer → Translator → Compiler → Sanitizer → AnimQA → ManifestWriter. |
| 4 | **Backbone déterministe (TypeScript)** | Motion Compiler, SVG Sanitizer, Anim QA, Packager. Idempotent, sans effet de bord, containerisé ; appelé en JSON-over-stdio. |
| 5 | **Pack Manifest Store (SQLite → DuckDB)** | `recipes`, `assets`, `qa_reports`, `pack_manifests`, `animation_ledger`. Source de vérité des re-builds, du yield, du licensing. |

---

## 2.3 Responsabilités des composants

| Composant | Responsabilité | Déterminisme |
|---|---|---|
| Style Spec | Palette, strokes, viewBox, conventions ; hash snapshot dans chaque manifest | DET (lecture seule) |
| Pack Orchestrator | Valide la StyleSpec, fan-out, collecte, gate QA, pack manifest | Mixte |
| Style Refiner | Lit StyleSpec + brief → `StyleRefinement` (delta uniquement, jamais de SVG/path data) | LLM |
| Recipe Picker | Brief + catalogue fermé → `MotionRecipeSelection` (un id, params, seed) | LLM |
| Composition Composer | → `CompositionSpec` (groupes nommés + hints géométriques, pas de path data) | LLM |
| Translator | Combine Refinement + Selection + Composition → `RenderSpec` complète | DET |
| Motion Compiler | `RenderSpec` → Lottie JSON canonique + SVG statique compagnon | DET |
| SVG Sanitizer | Gate dure : pas `<text>`, pas raster, IDs stables, pas de SMIL | DET |
| Anim QA | Playwright pinné, frame walk `goToAndStop`, pixelmatch, theming smoke test → `QAReport` | DET |
| Packager | Un Lottie JSON → exports React/Vue/Flutter/HTML + variante dark-mode | DET |
| Manifest Writers | Persistance par asset + agrégation pack | DET |

---

## 2.4 Flux de données

### Build de pack end-to-end
`style_lock` (charge StyleSpec + hash) → `fan_out_assets` (`Send` ×50) → subgraph par asset → `rollup_qa` (yield) → `write_pack_manifest` → `package_exports`.

### Chemin critique par asset
StyleSpec + Brief → Refiner → Picker → Composer → *(frontière Pydantic)* → Translator → Compiler (RPC) → Sanitizer (RPC) → AnimQA (RPC) → retry_router → ManifestWriter.

### Retry router (structuré, jamais « fix it with a prompt »)
`pass` → ManifestWriter · `retry` → re-roll seed → swap recette → escalade modèle · `fail` → END (rollup yield).

---

## 2.5 Contrats de données clés (Pydantic ↔ zod)

Règle : **aucun `dict[str, Any]` ne traverse la frontière**. Le modèle Pydantic est la *spec* ; le schéma zod est la *gate runtime*.

| Contrat | Direction | Purpose |
|---|---|---|
| `RenderSpec` | Py → TS | Entrée du Motion Compiler |
| `LottieJSON` | TS → Py | Sortie du compiler ; entrée Sanitizer/AnimQA/Packager |
| `SVG` (string) | TS → Py | Sortie du Sanitizer ; persistée |
| `QAReport` | TS → Py | Sortie d'Anim QA ; persistée |
| `PackageRequest` / `PackageResult` | Py ↔ TS | Entrée/sortie du Packager |

**Déjà construit (Phase 1, vérifié par bridge)** : `StyleSpec`, `RecipeId`/vocabulaire fermé (10 ids), `MotionRecipe`, `AssetSpec`, `PackManifest` + miroirs zod stricts (`z.strictObject`, `extra=forbid`/`strict=True` des deux côtés) + parité de rejet + parité de clés JSON-schema.

**Protocole bridge (détecteur de drift)** : `pytest export` → `vitest validate/re-emit` → `pytest strict re-import`, ordonné, dans le même job CI ; artefacts `fixtures/bridge/` générés au test et gitignorés.

---

## 2.6 Patterns architecturaux

1. **État typé = `BaseModel` Pydantic** (pas `TypedDict`) : `_coerce_state` valide à chaque nœud.
2. **Split agent / nœud** : l'agent = fonction pure `run(input) → output_model` ; le nœud = colle LangGraph. Testables séparément.
3. **Map-Reduce `Send`** pour le fan-out ×50 (seul moyen d'atteindre < €0.05/asset).
4. **Subgraph as a node** : isolation par asset (propre checkpoint, retry, scope d'observabilité).
5. **JSON over stdio** pour la frontière Py↔TS ; cold-start une fois par pack.
6. **`ModelRetry` cheap-tier + escalade déterministe** : jamais de re-prompt free-form.
7. **Catalogue de recettes versionné = vocabulaire fermé** : le LLM ne peut que `Literal[...]` un id.

---

## 2.7 Structure du dépôt (monorepo deux couches)

```
lottie-forge/
 ├── pyproject.toml / package.json / tsconfig.json / biome.json / ruff.toml
 ├── src/                      # TS déterministe (motion-compiler/, svg-sanitizer/, anim-qa/, packager/, rpc/, shared/)
 │   └── rpc/contracts/        # miroirs zod (*.schema.ts)
 ├── lottie_forge/             # Python orchestrateur + agents
 │   ├── domain/               # schéma canonique Pydantic (style, recipe, asset, pack, …)
 │   ├── agents/  ├── graph/  ├── store/  ├── cli/  └── observability/
 ├── fixtures/                 # style-specs/, recipe-catalogue/, test-prompts/
 ├── tests/                    # domain/ + bridge/
 └── docs/
```

`src/` = TS seul ; `lottie_forge/` = Python seul ; `domain/` = schéma canonique mirroré en zod ; `agents/` et `graph/nodes/` strictement séparés ; `graph/` possède le fan-out `Send`.

---

## 2.8 Ordre de construction (pourquoi cet ordre)

| Phase | Livrable | Pourquoi d'abord |
|---|---|---|
| 1 ✅ | Modèles + miroirs zod + bridge + CI | Le schéma est le contrat |
| 2 | StyleSpec + catalogue recettes (fixtures versionnés) | Racines de la cohérence ; entrée du compiler |
| 3 | Motion Compiler + SVG Sanitizer | Seul producteur de Lottie ; gate dure |
| 4 | Anim QA pinnée | La seule gate « shippable » ; feedback loop |
| 5 | Manifest Store + checkpointer SQLite | Yield mesuré ; crash-recoverable |
| 6 | Agents LLM (un par un) | Maintenant que le spine existe |
| 7 | Translator + Orchestrator (`Send`) | L'intégration |
| 8 | Packager multi-framework | Dernier module déterministe |
| 9 | Observabilité + gardes coût/yield | Mesurer, pas supposer |
| 10 | Hardening + 1er pack + ship-gate humain | Ne change pas l'architecture |

**Erreurs de séquencement à éviter** : agents avant compiler ; skip Anim QA ; LLM auteur de Lottie JSON ; logique agent dans les nœuds ; pipeline LLM custom en TS ; pas de checkpointer.

---

## 2.9 Gardes structurelles dérivées de l'architecture

- **ADR-01** : Lottie = seule source de mouvement ; SVG = compagnon statique (ni SMIL, ni CSS keyframes).
- **ADR-02** : SVGO 4 avec `removeViewBox`/`removeTitle` **désactivés** + test de régression (`viewBox`/`<title>` survivent).
- **ADR-03** : catalogue fermé 8–12 recettes (10 verrouillés en Phase 1).
- **ADR-04** : Vite 7.x (pas 8) pour la couche export.
- **ADR-05** : dark-mode `themeId` + `theme_anchors` primaire ; `currentColor` fallback HTML/SVG pur seulement.
- **ADR-06** : ship-gate humain (Phase 10) ; pas de Temporal à ce stade.
- **Coût** : garde pré-génération €0.05/asset ; idempotency keys salées ; parallélisme borné 5–8 ; cache `(style_version, recipe_id, seed)`.
- **Yield** : garde 70 % premier passage ; QA pinnée (flake < 1 %).

---

*Fin de la Partie 2. Partie suivante : Partie 3 — Stack technologique verrouillé.*