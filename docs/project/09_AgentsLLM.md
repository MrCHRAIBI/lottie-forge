# Cahier des Charges Aligné — lottie-forge
## Partie 9 — Agents LLM & Routeur de Coût (Phase 6)

> **Statut** : Partie 9 du cahier des charges aligné (Option B). Décrit les **trois agents purs** (StyleRefiner, RecipePicker, CompositionComposer), leurs modèles de sortie Pydantic, le routeur de modèles cheap-first, les idempotency keys salées et les snapshot tests. Couvre AGT-01→04, STY-02. Dépend des Parties 5 (fixtures StyleSpec + catalogue), 4 (contrats) et 8 (ledger). **Les agents proposent ; ils ne franchissent jamais la ligne de déterminisme (Partie 6).**
> **Références** : ROADMAP Phase 6 · REQUIREMENTS AGT/STY-02 · ARCHITECTURE.md Patterns 2 & 6 · PITFALLS 3, 4, 5, 9 · STACK.md (routage OpenRouter, tables de coût) · Parties 4, 5, 8.

---

## 9.1 Objet & principes

| # | Principe | Traduction technique |
|---|----------|----------------------|
| 1 | **Split agent / nœud** (Pattern 2) | L'agent = fonction pure `run(input) → output_model`, sans LangGraph ; le nœud = colle de graphe (Phase 7/Partie 10), sans prompting. Agents testables avec modèle mock ; nœuds testables avec agent mock |
| 2 | **Un agent = un modèle de sortie Pydantic** | `StyleRefinement`, `RecipeSelection`, `CompositionSpec` — jamais de `dict`, jamais de texte libre structuré |
| 3 | **Le LLM ne franchit jamais la ligne** | Aucun agent n'émet de SVG, de path data, de Lottie JSON ou de code (Anti-Pattern 1) ; la sortie est validée à la frontière et le Translator (Partie 10) résout tout en déterministe |
| 4 | **Fixtures de system prompt** (Pitfalls 3 & 4) | StyleSpec JSON + catalogue verbatim (+ hash) embarqués dans chaque prompt ; le modèle s'y réfère, ne les redéfinit pas |
| 5 | **Retry uniquement sur `ValidationError`** | Erreurs structurelles → retry borné (2) ; erreurs sémantiques → file de revue, **jamais** de re-prompt free-form « fix it » (Anti-Pattern 2) |
| 6 | **Escalade = arête déterministe, pas prompt** | Cheap → expensive par règle de routage ; le LLM ne voit jamais son propre échec (Pattern 6) |
| 7 | **Idempotence salée** | `{pack_id, asset_id, stage, attempt}` hashé avec sel par environnement ; même clé + même input = réponse cachée, jamais de double facturation (AGT-04) |

---

## 9.2 Modèles de sortie des agents

`StyleRefinement` est défini en Partie 5 (delta-only : `sub_palette`, `motif`, `stroke_pick`, `radius_pick`, `accent_weight`). La Phase 6 ajoute les deux autres contrats :

```python
class RecipeSelection(BaseModel):
    model_config = STRICT_CONFIG
    recipe_id: RecipeId                      # Literal clos importé (Partie 4) — invention impossible
    params: MotionParams                     # amplitude/direction/loops bornés (Partie 4)
    intensity: float = Field(ge=0, le=1)     # ⊆ recipe.intensity_range : vérifié au Translator
    seed: int = Field(ge=0)                  # = hash(pack_id, asset_id) ; retry = même seed (Pitfall 9)

class ShapeGroup(BaseModel):
    model_config = STRICT_CONFIG
    name: Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9-]{2,31}$", max_length=31)]
    role: Literal["hero", "support", "accent", "background"]
    geometry_hint: Literal["disc", "ring", "bar", "wave", "blob", "frame"]
    theme_role: KebabToken | None = None     # ancre de theming (MOT-03), non-PII

class CompositionSpec(BaseModel):
    model_config = STRICT_CONFIG
    groups: list[ShapeGroup] = Field(min_length=1, max_length=24)
    layout_hint: Literal["centered", "rule-of-thirds", "edge-anchored"]
    # AUCUN champ ne peut porter de path data / SVG / hex libre : test structurel « modèle clos »
```

- **Garantie delta/clos** : test structurel assertant que `CompositionSpec`/`RecipeSelection` n'exposent aucun champ texte libre non borné (même règle que `StyleRefinement`, Partie 5).
- Miroirs zod (`recipe-selection.schema.ts`, `composition-spec.schema.ts`) + parité de rejet (règle Partie 4).

---

## 9.3 Les trois agents

| Agent | Entrées (system prompt = fixtures) | Sortie | Tier par défaut | Snapshots |
|---|---|---|---|---|
| **StyleRefiner** (AGT-01, STY-02) | StyleSpec JSON verbatim + brief asset | `StyleRefinement` | cheap | golden output par style exemple (`example-style@1.0.0`) |
| **RecipePicker** (AGT-02) | Catalogue verbatim + hash + StyleSpec + brief | `RecipeSelection` | cheap | aucun id hors catalogue dans aucune sortie enregistrée ; cas adverses (`disco-spin`) rejetés |
| **CompositionComposer** (AGT-03) | StyleSpec + `StyleRefinement` + `RecipeSelection` + brief | `CompositionSpec` | **frontier** (composition = tâche la plus dure) | ≥ 3 compositions représentatives **par recette** |

- Agents = modules `lottie_forge/agents/{style_refiner,recipe_picker,composition_composer}.py` ; **zéro import LangGraph** dans `agents/` (le graphe arrive en Partie 10).
- Cache des sorties structurées par `(style_version, recipe_id, seed)` (Pitfall 5) : un re-render de pack ne ré-invoque aucun LLM.

---

## 9.4 Templates de prompts versionnés

- `lottie_forge/agents/prompts/{style_refiner,recipe_picker,composition_composer}.md` — **versionnés** (`template_version` semver) ; la version utilisée est enregistrée dans `AssetManifest.stage_models/prompt_versions` (Partie 8).
- Le prompt RecipePicker embarque le **catalogue verbatim + son hash** (Partie 5) ; le prompt StyleRefiner embarque la StyleSpec JSON + sa version (Partie 5) — la version est un **paramètre**, pas une constante (Anti-Pattern 7).
- Tout changement de template = bump de version = invalidation du cache des sorties concernées.

---

## 9.5 Routeur de modèles & discipline de coût (AGT-04, Pitfall 5)

| Stage | Draft (cheap) | Escalade (frontier) | Déclencheur d'escalade |
|---|---|---|---|
| style_refiner | gpt-5-mini / claude-haiku-4 | claude-sonnet-4-6 / gpt-5.x | `ValidationError` répétée (échec **dur**) |
| recipe_picker | gpt-5-mini / claude-haiku-4 | claude-sonnet-4-6 / gpt-5.x | idem |
| composition_composer | claude-sonnet-4-6 / gpt-5.x | — (déjà frontier ; échec → re-roll seed au retry router, Partie 10) | — |

- **Accès** : OpenRouter (un API, plusieurs familles) ; SDK directs anthropic/openai en fallback ; le **modèle est un paramètre**, jamais une constante.
- **Budget** : chaque appel écrit `tokens_in/tokens_out/model_id/cost_eur` dans `animation_ledger` (Partie 8) ; la garde de coût pré-génération (ORC-05) arrive avec l'orchestrateur (Partie 10).
- **Jamais de free-form retry** : l'escalade est une règle de routage déterministe, pas un chat de rattrapage.

### Idempotency keys (sécurité, PITFALLS)

```python
raw  = f"{pack_id}|{asset_id}|{stage}|{attempt}"
key  = sha256(f"{env_salt}|{raw}".encode()).hexdigest()   # sel par environnement
```

- Le mapping clair ne vit **que** dans le ledger local ; le provider ne voit que le hash (anti fuite de structure de pack).
- Même clé + même input → réponse cachée côté provider → **jamais de double facturation** (AGT-04).

---

## 9.6 Snapshot tests & déterminisme

- **Snapshots = réponses provider enregistrées** dans `fixtures/agent-snapshots/` (transport mocké) : la CI ne fait **aucun appel API** ; les tests sont déterministes et gratuits.
- Suites : (a) golden outputs valides → modèles attendus ; (b) **cas adverses enregistrés** (id hors catalogue, path data dans une composition, hex libre dans un refinement) → `ValidationError` ; (c) parité de rejet avec les miroirs zod.
- **Smoke live optionnel** (gpt-5-mini) derrière une variable d'environnement, hors CI — pour dérive de modèle, pas pour la gate.
- `output_retries = 2` uniquement sur `ValidationError` ; erreurs sémantiques → file de revue (Pitfall 9).

---

## 9.7 Tests & critères de succès (Phase 6)

| Ce qui doit être VRAI | Mécanisme |
|---|---|
| `StyleRefiner` pur, seule sortie `StyleRefinement` delta ; snapshots dorés par style exemple (AGT-01, STY-02) | tests unitaires transport mocké + assertion structurelle « aucun champ SVG/path » |
| `RecipePicker` ne retourne **jamais** un id hors catalogue ; snapshots le prouvent (AGT-02) | snapshots paramétrés + cas adverses `disco-spin` rejetés à la frontière Pydantic |
| `CompositionComposer` émet `CompositionSpec` ; ≥ 3 compositions représentatives par recette (AGT-03) | fixtures de snapshots par recette (10 recettes × ≥ 3) |
| Agents invoqués via OpenRouter avec idempotency keys **salées** ; même clé + input ne facture jamais deux fois (AGT-04) | test de dérivation de clé (sel) + test de cache provider mocké ; mapping clair absent des payloads |
| Routeur cheap-first : drafts Haiku-class, frontier seulement sur échec dur ; prompts versionnés dans `agents/prompts/` | tests unitaires du routeur (escalade = règle) + test de versioning de template |

---

## 9.8 Couverture des exigences

| Exigence | Couverture |
|---|---|
| AGT-01 | §9.2/§9.3 (StyleRefiner pur + snapshots) |
| AGT-02 | §9.2/§9.3 (RecipeSelection clos + snapshots adverses) |
| AGT-03 | §9.2/§9.3 (CompositionSpec + ≥ 3 snapshots/recette) |
| AGT-04 | §9.5 (OpenRouter + idempotency keys salées + cache) |
| STY-02 | §9.2 (delta-only structurel ; vérification ⊆ StyleSpec au Translator, Partie 10) |

---

## 9.9 Extensions différées

- Colle LangGraph (`*_node.py`, `Send`, retry router) → **Partie 10 / Phase 7** ; les agents restent agnostiques du graphe.
- Smoke live anti-dérive de modèle en CI hebdomadaire → v1.x.
- A/B multi-modèles par stage piloté par le yield report → Phase 9.
- Alternative pydantic-ai : **non mélangée** avec LangGraph dans un même pack (STACK.md) — décision maintenue LangGraph.

---

*Fin de la Partie 9. Partie suivante : **Partie 10 — Orchestrateur & Translator (LangGraph `Send`, retry router, garde de coût ORC-05) (Phase 7)**.*