# Cahier des Charges Aligné — lottie-forge
## Partie 10 — Orchestrateur & Translator (LangGraph `Send`, retry router, garde de coût) (Phase 7)

> **Statut** : Partie 10 du cahier des charges aligné (Option B). Décrit l'intégration qui fait **tourner l'usine pour de vrai sur 50 assets** : état typé LangGraph, fan-out `Send`, sous-graphe par asset, Translator déterministe, retry router structuré et garde de coût pré-génération. Couvre ORC-01, ORC-02, ORC-03, ORC-05 (ORC-04 est câblé via le checkpointer de la Partie 8). Dépend des Parties 4 (contrats), 6 (backbone RPC), 8 (store/checkpoint), 9 (agents).
> **Références** : ROADMAP Phase 7 · REQUIREMENTS ORC · ARCHITECTURE.md Patterns 1/3/4/6 + Anti-Pattern 2 · PITFALLS 5, 9 · Parties 4, 6, 8, 9.

---

## 10.1 Objet & principes

| # | Principe | Traduction technique |
|---|----------|----------------------|
| 1 | **État typé, validé aux frontières** (Pattern 1) | `PackState`/`AssetState` = `BaseModel` Pydantic ; chaque frontière de nœud est auto-validée (`_coerce_state`) — un état invalide lève, ne corrompt pas |
| 2 | **Sous-graphe en tant que nœud** (Pattern 4) | Chaque asset = sous-graphe compilé passé comme nœud ; propre thread, propre scope de retry, propre scope d'observabilité |
| 3 | **Escalade = arête de graphe, pas prompt** (Pattern 6) | Le `retry_router` est une arête conditionnelle portant un **enum d'action** ; le LLM ne voit jamais son propre échec ; « fix it with a prompt » est **structurellement impossible** (Anti-Pattern 2) |
| 4 | **Parallélisme borné** | Fan-out `Send` ×50 mais exécution **5–8 assets concurrents**, jamais 50 (rate limits, pool Chromium, pic de coût) |
| 5 | **Garde de coût avant génération** (ORC-05) | Projection `cost_eur` calculée **avant tout appel LLM** ; rejet structuré visible au manifest |
| 6 | **Translator déterministe** | Fonction pure, golden-file testée, **aucun appel LLM reachable** ; seule colle entre sorties d'agents et `RenderSpec` |

---

## 10.2 État typé : `PackState` & `AssetState` (ORC-01)

```python
class BriefSlot(BaseModel):
    model_config = STRICT_CONFIG
    asset_id: AssetId                      # ^a-\d{3}$ (Partie 4)
    brief: Annotated[str, StringConstraints(max_length=512)]   # brief narratif ; pas de donnée libre non bornée

class AssetState(BaseModel):
    model_config = STRICT_CONFIG
    asset_id: AssetId
    brief: str
    seed: int                              # = hash(pack_id, asset_id, attempt) — déterministe par tentative
    refinement: StyleRefinement | None = None
    selection: RecipeSelection | None = None
    composition: CompositionSpec | None = None
    render_spec: RenderSpec | None = None
    qa_report: QAReport | None = None
    attempts: int = Field(default=0, ge=0, le=6)
    failed_recipes: list[RecipeId] = []    # exclues au swap (jamais re-choisies)
    tier: Literal["cheap", "frontier"] = "cheap"
    status: Literal["pending", "passed", "failed", "hard_fail", "rejected_cost"] = "pending"
    cost_eur: float = Field(default=0, ge=0, le=1000)

class PackState(BaseModel):
    model_config = STRICT_CONFIG
    pack_id: PackId
    style: StyleSpec
    catalogue: RecipeCatalogue
    slots: list[BriefSlot] = Field(min_length=50, max_length=50)   # pack fixe de 50
    results: Annotated[list[AssetState], operator.add] = []        # réducteur Send
```

- Les nœuds retournent des **dicts partiels** ; la coercion valide à chaque frontière. Test : injecter un état invalide → `ValidationError` au nœud suivant, jamais de state corrompu.

---

## 10.3 Topologie du graphe de pack

```
START → style_lock (DET : charge StyleSpec + hash snapshot ; fige le pin dans le manifest)
      → fan_out_assets (arête conditionnelle → list[Send("asset", AssetState)] × 50)   [ORC-02]
      → asset (sous-graphe compilé, passé comme nœud)
      → rollup_qa (DET : first-pass yield, yield par recette, par modèle)
      → write_pack_manifest (DET : agrégation → PackManifest, Partie 8)
      → END
```

- `fan_out_assets` lit `slots` et émet 50 `Send` ; la réduction se fait via le réducteur `operator.add` de `results`.
- `rollup_qa` et `write_pack_manifest` sont les nœuds déterministes qui alimentent le yield report (Partie 12/Phase 9) et le manifest (Partie 8).

---

## 10.4 Sous-graphe d'asset & retry router (ORC-03)

```
cost_screen → refine → pick_recipe → compose → translate
   → compile_motion (RPC) → sanitize_svg (RPC) → anim_qa (RPC)
   → retry_router ── pass ─────────────→ write_manifest → END
                 ├─ reroll_seed  → compose          (attempts < 2)
                 ├─ swap_recipe  → pick_recipe      (2 ≤ attempts < 4 ; + escalate tier si attempts ≥ 3)
                 └─ hard_fail    → END              (attempts ≥ 4 ; status hard_fail, rollup yield)
```

**Échelle d'escalade (ordre unique et obligatoire)** :

| Étape | Condition | Action | Cible |
|---|---|---|---|
| 1 | QA fail, `attempts < 2` | **re-roll seed** (seed = `hash(pack, asset, attempt)`) | `compose` |
| 2 | QA fail, `2 ≤ attempts < 4` | **swap recette** (`failed_recipes` exclu ; RecipePicker re-sélectionne) | `pick_recipe` |
| 3 | `attempts ≥ 3` | **escalade de tier** `cheap → frontier` pour les appels suivants | (paramètre de nœud) |
| 4 | `attempts ≥ 4` | **hard fail** structuré | `END` |

- Les arêtes ne portent **que l'enum d'action** (`pass|reroll_seed|swap_recipe|hard_fail`) — aucun texte libre ne circule ; les prompts restent les templates versionnés de la Partie 9.
- `ValidationError` répétée côté agents (retries bornés Partie 9) = échec **dur** → alimente le router, jamais de re-prompt de rattrapage.
- **Discipline de seed** : seed déterministe par `(pack, asset, attempt)` → replay crash-recovery identique (Partie 8) ET re-roll reproductible ; la clé d'idempotence incluant `attempt`, aucune double facturation (ledger, Partie 8).

---

## 10.5 Translator déterministe (colle LLM ↔ compiler)

- `translate(refinement, selection, composition, style, catalogue) → RenderSpec` — **fonction pure**, golden-file testée ; grep CI : aucun import `langchain/openai/anthropic` reachable depuis `graph/nodes/translator_node.py` (même gate que COM-02).
- **Cross-checks structurels** (échouent en `ValidationError`, jamais silencieux) :
  1. `refinement.sub_palette ⊆ style.palette` (noms) ;
  2. `selection.intensity ⊆ recipe.intensity_range` ;
  3. `stroke_pick`/`radius_pick` résolus depuis les champs bornés de `style` ;
  4. `theme_roles ⊆ recipe.theme_anchors` ;
  5. `geometry_hint` ∈ `recipe.shapes_supported` ∩ capacités compiler (`SupportedLottieFeature`, Partie 6).
- **`RenderSpec` Pydantic** (le miroir zod est figé depuis la Phase 3 / Partie 6) :

```python
class RenderShape(BaseModel):
    model_config = STRICT_CONFIG
    name: ShapeGroupName
    kind: Literal["rect", "ellipse", "path", "polystar", "polyline"]
    geometry: GeometryBlock                 # coordonnées normalisées 0..1 + viewBox
    fill_token: KebabToken | None           # résolu depuis style.palette
    stroke_token: KebabToken | None
    stroke_width_pick: Literal["thin", "default", "bold"] | None
    theme_role: KebabToken | None           # → nm de layer (Partie 6)

class RenderSpec(BaseModel):
    model_config = STRICT_CONFIG
    asset_id: AssetId
    style_version: str
    recipe_id: RecipeId
    seed: int
    viewBox: Size
    shapes: list[RenderShape] = Field(min_length=1, max_length=24)
    keyframes: list[KeyframeBlock]          # résolus : durée, easing (courbe style), intensité, loops
    markers: list[Marker]                   # enter/exit/loop
```

- Sortie **byte-identique** pour mêmes entrées (deux traductions indépendantes → mêmes bytes).

---

## 10.6 Parallélisme borné (ORC-02)

- `Send` ×50 émis d'un coup ; l'exécution est bornée par un **limiteur de concurrence** `asyncio.Semaphore(N)` avec `N ∈ [5, 8]` (config `max_concurrent_assets`) enveloppant les appels RPC/LLM du sous-graphe.
- Jamais 50 concurrents : protège les rate limits frontier, le pool Chromium (Partie 7) et le pic de coût ; le fan-out reste structurellement parallèle (ORC-02 satisfait : parallélisme réel, borné).

---

## 10.7 Garde de coût pré-génération (ORC-05)

- **Nœud `cost_screen`** (premier du sous-graphe, avant `refine`) :

```
projected = Σ_stages median_tokens(stage, tier) × price(tier) × (1 + retry_factor)
si projected > 0.05 → status = "rejected_cost" → END (aucun appel LLM)
```

- `median_tokens` = médianes observées sur les 10 derniers packs depuis `animation_ledger` (Partie 8) ; `price(tier)` depuis la table de coûts versionnée (Partie 12/Phase 9) ; `retry_factor` = 30 % cheap / 5 % expensive (Pitfall 5).
- Le rejet est une **défaillance structurée visible au manifest** : ligne `assets` avec `status="rejected_cost"`, `cost_eur=0`, raison dans le rapport de pack ; le yield rollup le compte (pas de silence).
- Test : asset au budget dépassé → **zéro ligne ledger LLM** créée, manifest contient le rejet.

---

## 10.8 Câblage checkpoint & reprise (ORC-04 via Partie 8)

- `graph.compile(checkpointer=SqliteSaver(...))` ; `thread_id = f"pack:{pack_id}"` (+ threads asset pour rebuild unitaire).
- Au restart, le fan-out saute les slots terminaux (`status ∈ {passed, hard_fail, rejected_cost}`) ; aucun nœud complété n'est rejoué ni re-facturé (ledger PK = idempotency hash).
- `durability="exit"` sur les nœuds RPC longs (compile/sanitize/qa).

---

## 10.9 Séparation nœuds / agents

- `lottie_forge/graph/nodes/{style_lock,fan_out,cost_screen,refine_node,pick_recipe_node,compose_node,translator_node,compile_node,sanitize_node,qa_node,retry_router,rollup_qa,write_manifest}_node.py` = colle LangGraph : extraction d'entrée, appel de l'agent **pur** (Partie 9), merge d'état, écriture ledger, tags de trace (`pack_id`, `asset_id`, `idempotency_key`).
- Les agents (Partie 9) restent **agnostiques du graphe** ; testables avec transport mocké.

---

## 10.10 Tests & critères de succès (Phase 7)

| Ce qui doit être VRAI | Mécanisme |
|---|---|
| Translator pur, golden-file testé, combine `StyleRefinement + RecipeSelection + CompositionSpec` → `RenderSpec` ; aucun LLM reachable | golden files byte-identiques + grep d'imports sur `translator_node.py` |
| `PackState` (BaseModel) drive la machine ; chaque frontière de nœud auto-validée | test de coercion : état invalide injecté → `ValidationError` au nœud suivant |
| Fan-out ×50 via `Send`, parallélisme borné 5–8 (pas 50) | test d'intégration : compteur de concurrence RPC mocké ≤ 8 pendant un run de 50 slots |
| `retry_router` escalade dans l'ordre seed → recette → tier → hard fail ; « fix it with a prompt » impossible | tests unitaires du router (échelle) + test structurel : aucune arête ne transporte de texte libre (enum d'action seulement) |
| Rejet pré-génération si projection > €0,05 ; rejet visible au manifest en défaillance structurée | test `cost_screen` : zéro ligne ledger LLM + `status="rejected_cost"` dans le manifest |
| Run 50 assets tué/relancé reprend sans travail dupliqué (ORC-04 câblé) | test subprocess kill/restart (recette Partie 8) sur le graphe compilé |

---

## 10.11 Couverture des exigences

| Exigence | Couverture |
|---|---|
| ORC-01 | §10.2 (PackState/AssetState BaseModel + coercion aux frontières) |
| ORC-02 | §10.3 (`Send` ×50) + §10.6 (borne 5–8) |
| ORC-03 | §10.4 (échelle seed → recette → tier → hard fail ; arêtes enum) |
| ORC-05 | §10.7 (`cost_screen`, projection, rejet structuré) |
| ORC-04 | §10.8 (checkpointer câblé au compile ; reprise sans doublon) |

---

## 10.12 Extensions différées

- Routage adaptatif par recette piloté par le yield report (Partie 12/Phase 9).
- Chunking dynamique du fan-out selon la capacité du pool Chromium (scaling production, ARCHITECTURE.md).
- Orchestration durable Inngest/Temporal uniquement si des gates multi-jours apparaissent (ADR-06 maintient le ship-gate humain simple en Phase 10/Partie 13).

---

*Fin de la Partie 10. Partie suivante : **Partie 11 — Packager & exports multi-frameworks (React/Vue/Flutter/HTML + dark-mode themeId) (Phase 8)**.*