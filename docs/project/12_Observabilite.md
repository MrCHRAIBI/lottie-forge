# Cahier des Charges Aligné — lottie-forge
## Partie 12 — Observabilité, Coût & Yield Guards (Langfuse, gardes €0,05 / 70 %) (Phase 9)

> **Statut** : Partie 12 du cahier des charges aligné (Option B). Décrit la surface de mesure de l'usine : traçage Langfuse de chaque appel LLM et nœud déterministe, ledger de coût par asset, yield-report CLI, et gardes roulantes coût/yield qui bloquent ou flagguent — **jamais de « fix » automatique**. Couvre OBS-01→03, KPI-01→02. Dépend des Parties 8 (ledger), 9 (routeur), 10 (cost_screen, rollup), 7 (flake).
> **Références** : ROADMAP Phase 9 · REQUIREMENTS OBS/KPI · STACK.md (tables de coût, confiance MOYENNE) · PITFALLS 5 · Parties 7–11.

---

## 12.1 Objet & principes

| # | Principe | Traduction technique |
|---|----------|----------------------|
| 1 | **Mesuré, pas supposé** | Chaque KPI (yield, coût) se **calcule depuis le store SQLite** (`animation_ledger` + `qa_reports` + `assets`) — jamais depuis des logs applicatifs |
| 2 | **Le coût est un champ de contrat** | `cost_eur` par asset vit dans le manifest (OBS-02) ; c'est une donnée de produit, auditable post-hoc |
| 3 | **L'observabilité est obligatoire** | Sans trace taguée `pack_id` + `asset_id`, le debugging de yield est impossible → aucun appel LLM ne passe hors tracing (OBS-01) |
| 4 | **Les gardes échouent fort, l'humain décide** | Une violation bloque ou flaggue (ADR-06) ; aucune garde ne modifie le routage ni ne relance un asset (doctrine « humain = éditeur ») |
| 5 | **La table de prix est une donnée versionnée** | `prices.yaml` versionné ; re-vérification trimestrielle mécanique via `bench.yml` (les prix LLM dérivent mensuellement) |

---

## 12.2 Traçage (OBS-01)

### 12.2.1 Backend & hiérarchie

- **Langfuse self-hosted** par défaut (aucune donnée de pack ne quitte l'infra) ; **LangSmith cloud** en alternative configurée par variable d'environnement — le code ne change pas (callback handler standard).
- **Fallback dev (jamais de perte silencieuse)** : si le backend est injoignable, les événements sont spoolés en JSONL local (`traces/spool/`) et ré-envoyés au prochain run ; un warning est émis. Le **ledger SQLite reste la source de vérité** du coût/yield, indépendamment de Langfuse.

```
trace(pack_run, pack_id, style_version)
 └── span(asset a-017, asset_id, seed)
      ├── span(stage style_refiner, attempt, model_id, idempotency_key, cache_hit)
      ├── span(stage recipe_picker, …, recipe_id)
      ├── span(stage composition_composer, …)
      ├── span(rpc motion_compiler, DET, durée, bytes_out, lottie_sha256)
      ├── span(rpc svg_sanitizer, DET, …)
      ├── span(rpc anim_qa, DET, qa_passed, frame_count)
      └── span(retry_router, décision, reason_codes)
```

### 12.2.2 Tags obligatoires

Chaque génération LLM et chaque span déterministe porte : `pack_id`, `asset_id`, `idempotency_key` (**hashé avec sel**, Partie 9), `stage`, `attempt`, `model_id`, `style_version`, `cache_hit` ; plus `recipe_id` dès qu'il existe. Le `QAReport` (Partie 7) et les content hashes sont attachés en metadata du span asset (cross-linking trace ↔ manifest).

---

## 12.3 Ledger de coût & table de prix (OBS-02)

### 12.3.1 Calcul

`cost_tracker.py` : `cost_eur = tokens_in/1e6 × price_in(model) + tokens_out/1e6 × price_out(model)`, prix lus depuis **`lottie_forge/observability/prices.yaml`** :

```yaml
version: 2026-08-27          # bump obligatoire à chaque mise à jour
currency: EUR
models:
  claude-sonnet-4-6: { input_per_mtok: 3.0,  output_per_mtok: 15.0 }
  gpt-5.x:         { input_per_mtok: 2.5,  output_per_mtok: 10.0 }
  gemini-2.5-pro:  { input_per_mtok: 1.8,  output_per_mtok: 9.0 }
  gpt-5-mini:      { input_per_mtok: 0.3,  output_per_mtok: 1.5 }
  claude-haiku-4:  { input_per_mtok: 0.3,  output_per_mtok: 1.5 }
```

- Le modèle Pydantic `PricesTable` valide le YAML au chargement (bornes > 0, `version` requis) ; un **prix manquant pour un `model_id` utilisé = erreur dure**, pas de coût par défaut.
- **Cache hit** : ligne ledger `cache_hit: true`, `cost_eur: 0` — le taux de hit est mesurable (re-builds gratuits par construction, Partie 8).
- Écriture dans `animation_ledger` (schéma Partie 8) ; `PackManifest.totals.cost_eur` (MFT-02) = **somme du ledger** pour le pack, calculée par l'agrégateur — jamais saisie.
- **Confiance MOYENNE** sur les prix (STACK.md) → `bench.yml` trimestriel (§12.6).

### 12.3.2 Modèles Python-only (pas de miroir zod)

```python
class CostEntry(BaseModel):
    model_config = STRICT_CONFIG
    idempotency_key_hash: str            # ^[a-f0-9]{64}$ (PK ledger)
    pack_id: PackId
    asset_id: AssetId
    stage: Literal["style_refiner", "recipe_picker", "composition_composer"]
    attempt: int = Field(ge=1, le=6)
    model_id: str
    tokens_in: int = Field(ge=0)
    tokens_out: int = Field(ge=0)
    cost_eur: float = Field(ge=0, le=1000)
    cache_hit: bool = False
    created_at: datetime                 # exclu des content hashes (rebuild déterministe)
```

Aucun de ces payloads ne traverse la frontière Py↔TS → **pas de miroir zod** (règle Partie 4 : seul ce qui traverse a un miroir).

---

## 12.4 Gardes roulantes (OBS-03, KPI-01/02)

| Garde | Seuil | Moment | Effet |
|---|---|---|---|
| **Coût pré-génération** (ORC-05, implémentée Partie 10) | projection > €0,05/asset | avant tout appel LLM | `rejected_cost` structuré au manifest |
| **Yield guard** (OBS-03) | first-pass **< 70 %** sur fenêtre roulante 10 packs | après rollup QA | pack **non shippable** ; blocage du ship-gate humain (Partie 13) jusqu'à revue |
| **Cost KPI** (KPI-01) | moyenne **> €0,05**/asset sur 10 packs | après agrégation | violation **explicite** dans le yield-report avec contributeurs (recette/modèle/stage) ; décision humaine, pas de blocage auto |
| **Usage frontier** | > 30 % des appels | report | signal de dérive du routage cheap-first (Partie 9) |
| **Flake QA** | > 1 % en CI | CI | gate Partie 7 |

- **Projection** (entrée de la garde ORC-05) : `Σ_stages median_tokens(stage, tier) × price(tier) × (1 + retry_factor)` ; médianes observées sur les 10 derniers packs depuis le ledger ; `retry_factor` = 30 % cheap / 5 % expensive (Pitfall 5).
- Aucune garde ne modifie le routage : elles **mesurent et bloquent/flagguent** ; la réparation est une décision humaine (ADR-06).

---

## 12.5 Yield Reporter (CLI)

- `python -m lottie_forge yield-report <pack-id>` (+ `--window 10` roulant) ; agrégation **SQL pure** sur `animation_ledger` + `qa_reports` + `assets` ; sortie Markdown écrite dans le pack (`yield-report.md`, layout Partie 11) :

```
## Pack pack-example-style-2026-08-27
first-pass yield: 78 % (39/50) · coût moyen: €0,041/asset · cache hit: 12 %
| recette | yield 1er passage | coût moyen | retries |
| fade    | 92 %              | €0,032     | 1       |
| draw-on | 55 %  ← contributeur principal | €0,061 | 6 |
Top coût: a-017 (€0,089, 2 escalades frontier) → trace: lf://…
```

- Le yield se calcule sur les rapports de **première tentative** (`attempt == 1`) ; les tentatives suivantes alimentent l'analyse de retries, pas le KPI.
- **Résumé LLM optionnel** (gpt-5-mini) en section séparée, étiqueté *« commentaire, non mesuré »* — **jamais** utilisé par les gardes ni recopié dans le manifest.

---

## 12.6 Re-vérification trimestrielle des prix (`bench.yml`)

- Workflow GitHub Actions (schedule trimestriel + dispatch manuel) : exécute un **fixture fixe de prompts** contre chaque modèle de la table + appels de sonde ; compare coût réel vs prédit ; **dérive > 10 % → issue automatique** avec la table à mettre à jour.
- Mise à jour = PR qui bump `prices.yaml.version` ; les reports historiques restent calculables (chaque ligne ledger garde son `model_id` ; rien n'est réécrit).
- Mode **dry-run par défaut en CI** (parse de la table, aucun appel externe) ; les appels réels derrière dispatch manuel + secret.

---

## 12.7 Tests & critères de succès (Phase 9)

| Ce qui doit être VRAI | Mécanisme |
|---|---|
| Langfuse trace chaque appel LLM **et** nœud déterministe, tagué `pack_id` + `asset_id` + `idempotency_key` (+ stage/attempt/model_id) (OBS-01) | harness transport mocké ; assertion des tags sur chaque événement émis ; spool JSONL testé (backend injoignable → warning + ré-envoi) |
| `cost_eur` calculé correctement depuis tokens + `prices.yaml` ; prix manquant = erreur dure ; `totals.cost_eur` == somme ledger (OBS-02) | tests unitaires `cost_tracker` + test d'intégration agrégateur |
| `yield-report` sur ledger fixture montre coût < €0,05 **et** yield > 70 %, **ou rend la violation et ses contributeurs explicites** | test d'intégration CLI (critère de succès Phase 9) |
| Yield guard flaggue un pack < 70 % et le rend **non shippable** (OBS-03) | test unitaire de la garde + liaison ship-gate Partie 13 |
| `bench.yml` parse la table et exécute le dry-run sans appel externe en CI | test de workflow |

---

## 12.8 Couverture des exigences

| Exigence | Couverture |
|---|---|
| OBS-01 | §12.2 (hiérarchie de trace, tags obligatoires, spool sans perte) |
| OBS-02 | §12.3 (cost_tracker, prices.yaml versionné, ledger, totals agrégés) |
| OBS-03 | §12.4 (yield guard fenêtre 10 packs → blocage ship-gate) |
| KPI-01 | §12.4 + §12.5 (cost KPI roulant + violation explicite) |
| KPI-02 | §12.4 + §12.5 (yield KPI roulant) |

---

## 12.9 Extensions différées

- **COH-01→03** : score de cohérence pack-level (variance stroke/palette/amplitude) + gate CI — v2, après stabilisation du yield ; en v1 le ship-gate humain (Partie 13) est le juge de cohérence.
- **AQA-02** : rapports QA par renderer (lottie-ios/android) alimentant un yield par joueur — v2.
- **DuckDB** pour l'analytique (chemin de migration documenté Partie 8, MFT-03) si les agrégations SQLite deviennent lentes.
- Dashboard web de coût/yield — hors v1 (le report Markdown + les traces suffisent).
- **GTM-04** (milestone 2) : la boucle feedback ventes lit le yield-report comme entrée de planification de packs.

---

*Fin de la Partie 12. Partie suivante : **Partie 13 — Hardening, licence perpétuelle & ship-gate humain (premier pack) (Phase 10)**.*