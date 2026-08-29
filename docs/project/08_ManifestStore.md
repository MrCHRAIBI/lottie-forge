# Cahier des Charges Aligné — lottie-forge
## Partie 8 — Manifest Store & Checkpoint LangGraph (SQLite) (Phase 5)

> **Statut** : Partie 8 du cahier des charges aligné (Option B). Décrit la mémoire durable de l'usine : le store SQLite (recettes, assets, rapports QA, manifests pack, ledger d'animation) et le checkpointer LangGraph qui rend un run de 50 assets crash-recoverable sans travail dupliqué. Couvre MFT-01→03, ORC-04. Dépend des Parties 4 (modèles `AssetSpec`/`PackManifest`), 7 (`QAReport`) et 6 (RPC déterministe).
> **Références** : ROADMAP Phase 5 · REQUIREMENTS MFT/ORC-04 · ARCHITECTURE.md (Pack Manifest Store, Pattern 4, scaling) · PITFALLS 9 (state drift, seeds, threads) · 01-03-SUMMARY (`model_dump()` = insert canonique) · Parties 4, 6, 7.

---

## 8.1 Objet & principes

| # | Principe | Traduction technique |
|---|----------|----------------------|
| 1 | **Le store est la source de vérité** | Assets, QA reports, rollups pack, licensing se lisent depuis SQLite — jamais depuis des fichiers épars ni de la mémoire vive ; le yield > 70 % (KPI-02) et le coût < €0,05 (KPI-01) se **calculent** depuis ce store |
| 2 | **Python écrit, TS lit** | Le backbone TypeScript n'écrit **jamais** dans le store ; il lit en read-only à des fins de QA |
| 3 | **Single-file, backup trivial** | Un seul fichier `.db` ; un `cp` documenté suffit (MFT-03) ; note de schéma expliquant l'upgrade DuckDB |
| 4 | **Schéma idempotent, module unique** | Toute la DDL créée idempotemment depuis un seul module `lottie_forge.store` |
| 5 | **Crash-recoverable, zéro travail dupliqué** | `langgraph-checkpoint-sqlite` câblé ; tuer un run de 50 assets en vol et le relancer reprend au dernier checkpoint (ORC-04) |
| 6 | **Identité & idempotence traçables** | `seed = hash(pack_id, asset_id)` ; chaque appel LLM écrit `(input, output, seed, model_id)` au ledger ; le nœud aval lit **l'enregistrement**, pas la sortie LLM live (Pitfall 9) |
| 7 | **WAL + write batch par pack** | Une transaction par pack en fin de run, pas une par asset (3ᵉ goulot SQLite, ARCHITECTURE.md) |

---

## 8.2 Schéma SQLite (5 tables, création idempotente)

```sql
PRAGMA journal_mode = WAL;   -- contention 50 assets ; upgrade analytique → DuckDB (note ci-dessous)

CREATE TABLE IF NOT EXISTS recipes (
  recipe_id         TEXT PRIMARY KEY,        -- vocabulaire clos RecipeId (Partie 4)
  family            TEXT NOT NULL,
  duration_ms       INTEGER NOT NULL CHECK (duration_ms BETWEEN 100 AND 10000),
  easing            TEXT NOT NULL,
  keyframe_shape    TEXT NOT NULL,
  intensity_min     REAL NOT NULL, intensity_max REAL NOT NULL,
  shapes_supported  TEXT NOT NULL,           -- JSON array
  trigger_points    TEXT NOT NULL,           -- JSON array
  theme_anchors     TEXT NOT NULL,           -- JSON array (≥ 1, non-PII)
  catalogue_version TEXT NOT NULL,
  catalogue_hash    TEXT NOT NULL            -- sha256 de catalogue.json (Partie 5)
);

CREATE TABLE IF NOT EXISTS assets (
  pack_id       TEXT NOT NULL,
  asset_id      TEXT NOT NULL,               -- ^a-\d{3}$
  style_ref     TEXT NOT NULL,               -- name@MAJOR.MINOR.PATCH (ancre STY-03)
  recipe_ref    TEXT NOT NULL,               -- RecipeId
  seed          INTEGER NOT NULL,            -- hash(pack_id, asset_id)
  manifest_json TEXT NOT NULL,               -- AssetManifest complet (MFT-01)
  svg_sha256    TEXT NOT NULL,               -- ^[a-f0-9]{64}$
  lottie_sha256 TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending|passed|failed|hard_fail|rejected_cost
  attempts      INTEGER NOT NULL DEFAULT 0,
  cost_eur      REAL NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (pack_id, asset_id)
);

CREATE TABLE IF NOT EXISTS qa_reports (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  pack_id          TEXT NOT NULL,
  asset_id         TEXT NOT NULL,
  attempt          INTEGER NOT NULL,
  passed           INTEGER NOT NULL,         -- 0/1
  renderer         TEXT NOT NULL,
  frame_count      INTEGER NOT NULL,
  frame_hashes     TEXT NOT NULL,            -- JSON array sha256
  pixel_diff_json  TEXT NOT NULL,
  theme_diff_pct   REAL NOT NULL,
  reason_codes     TEXT NOT NULL,            -- JSON array (vide ssi passed)
  qa_container_tag TEXT NOT NULL,            -- tag Docker pinné (Partie 7)
  created_at       TEXT NOT NULL,
  UNIQUE (pack_id, asset_id, attempt)
);

CREATE TABLE IF NOT EXISTS pack_manifests (
  pack_id          TEXT PRIMARY KEY,         -- ^pack-[a-z][a-z0-9-]*-\d{4}-\d{2}-\d{2}$
  style_version    TEXT NOT NULL,
  asset_count      INTEGER NOT NULL,
  cost_eur         REAL NOT NULL,
  first_pass_yield REAL NOT NULL,
  license_json     TEXT NOT NULL,            -- LicenseInfo (Partie 4, LIC-01/02)
  manifest_json    TEXT NOT NULL,            -- PackManifest complet
  created_at       TEXT NOT NULL
);   -- colonnes shippable/approved_by/approved_at ajoutées en Phase 10 (même commit que le ship-gate)

CREATE TABLE IF NOT EXISTS animation_ledger (
  idempotency_key_hash TEXT PRIMARY KEY,     -- sha256(sel_env + {pack,asset,stage,attempt})
  pack_id    TEXT NOT NULL,
  asset_id   TEXT NOT NULL,
  stage      TEXT NOT NULL,                  -- style_refiner|recipe_picker|composition_composer
  attempt    INTEGER NOT NULL,
  model_id   TEXT NOT NULL,
  tokens_in  INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  cost_eur   REAL NOT NULL,
  cache_hit  INTEGER NOT NULL DEFAULT 0,     -- 1 = réponse cachée, coût 0 (pas de double facturation)
  created_at TEXT NOT NULL
);
-- NOTE (MFT-03) : l'analytique yield/coût pourra migrer vers DuckDB ; le store SQLite reste
-- la source transactionnelle. Le mapping Pydantic → DuckDB est additif, jamais substitutif.
```

**Règles de schéma** : pas de seconde liste de recettes en SQL (le vocabulaire clos reste validé à la frontière Pydantic avant INSERT, règle same-commit Partie 4) ; `dotlottie_sha256` ajouté en Phase 8 par édition même commit du modèle `ContentHashes` + colonne.

---

## 8.3 Module `lottie_forge/store/` & writers déterministes

```
lottie_forge/store/
├── db.py            # init_db(path) idempotent ; PRAGMA WAL ; exécute schema.sql ; conn read-only pour TS
├── schema.sql       # DDL ci-dessus + note DuckDB
├── assets.py        # insert_asset(conn, AssetManifest) ; get_asset ; list_by_pack
├── qa.py            # insert_qa_report(conn, QAReport) ; latest_for_asset
├── pack.py          # aggregate_pack(conn, pack_id) -> PackManifest ; insert_pack_manifest
└── ledger.py        # ledger_record(conn, LedgerEntry) ; cost_by_asset ; cost_by_pack
```

- **`AssetManifest`** (MFT-01) — composé, pas dupliqué :

```python
class StageModel(BaseModel):
    model_config = STRICT_CONFIG
    stage: Literal["style_refiner", "recipe_picker", "composition_composer"]
    model_id: str
    template_version: str            # version du prompt (agents/prompts/, Partie 9)

class AssetManifest(BaseModel):
    model_config = STRICT_CONFIG
    asset: AssetSpec                 # identité + refs + hashes (Partie 4)
    style_version: str               # pin redondant pour rebuild
    recipe_id: RecipeId
    seed: int                        # hash(pack_id, asset_id)
    stage_models: list[StageModel]   # fermée : 3 stages, jamais de dict ouvert
    qa_report: QAReport | None = None
    cost_eur: float = Field(ge=0, le=1000, default=0)
    timestamp: datetime              # exclu des content hashes (rebuild déterministe)
```

- **Insert canonique** : `model_dump()` du modèle Pydantic est « ce qu'on insère » (01-03-SUMMARY) ; `manifest_json` = `model_dump_json()` ; test de re-parse strict au read.
- **Agrégateur pack** (MFT-02) : `aggregate_pack` lit les lignes `assets` du pack et calcule `asset_count`, `cost_eur`, `first_pass_yield` (passed au 1ᵉʳ attempt / total), puis valide via le modèle `PackManifest` (trois validateurs agrégés + licence structurelle, Partie 4) avant INSERT — l'agrégat ne peut pas mentir.
- **Writers = nœuds déterministes** : `manifest_writer_node` (par asset) et `pack_manifest_node` (rollup) dans le graphe (Partie 10) ; aucun LLM sur ce chemin.

---

## 8.4 Checkpoint LangGraph (crash-recovery, ORC-04)

```python
from langgraph.checkpoint.sqlite import SqliteSaver

checkpointer = SqliteSaver(conn)                      # fichier jumeau checkpoints.db (single-file)
graph = builder.compile(checkpointer=checkpointer)

config_pack  = {"configurable": {"thread_id": f"pack:{pack_id}"}}
config_asset = {"configurable": {"thread_id": f"asset:{pack_id}:{asset_id}"}}  # rebuild unitaire
```

- **Thread par asset** : chaque asset = un thread ; chaque retry = un **nouveau checkpoint du même thread** ; replay depuis un known-good checkpoint via `thread_id + checkpoint_id` (Pitfall 9).
- **`durability="exit"`** sur les nœuds RPC longs (Motion Compiler / Anim QA) : persistance atomique sur exception.
- **Reprise sans doublon** : au restart avec le même `thread_id`, le fan-out `Send` saute les slots terminaux (état checkpointé) ; les nœuds vérifient `assets.status` avant de rejouer ; un asset complété n'est **jamais** re-facturé (ledger PK = idempotency hash).
- **Retry = même seed** : un retry utilise le même `seed` ; un seed différent = **nouvelle identité d'asset**, pas le même asset (Pitfall 9).

---

## 8.5 Ledger d'animation & idempotence (anti double-facturation)

- Chaque appel LLM écrit une ligne `animation_ledger` avec `idempotency_key_hash = sha256(sel_env + {pack_id, asset_id, stage, attempt})` — le **sel par environnement** empêche les identifiers de fuiter chez le provider ; le mapping clair ne vit que dans le store local (PITFALLS security).
- Même clé + même input → `cache_hit = 1`, `cost_eur = 0` : le provider renvoie la réponse cachée, le ledger le prouve.
- Le ledger alimente : la garde de coût pré-génération (Partie 11 / Phase 9), le `cost_eur` par asset (OBS-02), et le yield report (`lottie_forge.cli.yield_report`).

---

## 8.6 Backup, concurrence & lecture TS

- **Backup documenté** : `PRAGMA wal_checkpoint(TRUNCATE);` puis `cp lottie_forge.db backup.db` ; test d'intégration : restaurer le `.bak` et relire le pack manifest.
- **Concurrence** : WAL actif ; **une transaction par pack** en fin de run (write batch), pas une par asset.
- **Lecture TS** : le backbone ouvre le store en **read-only** à des fins de QA ; jamais d'écriture cross-langage.

---

## 8.7 Tests & critères de succès (Phase 5)

| Ce qui doit être VRAI | Mécanisme |
|---|---|
| Schéma `recipes/assets/qa_reports/pack_manifests/animation_ledger` créé idempotemment depuis un seul module `lottie_forge.store` | `init_db()` ×2 sans erreur ; liste de tables == 5 ; `PRAGMA integrity_check` ok |
| Chaque asset écrit embarque un manifest JSON capturant `style_version`, `recipe_id`, `model_id`, seeds de prompt, content hashes, `QAReport`, timestamp (MFT-01) | insert → re-parse `manifest_json` sous `AssetManifest` strict ; assertion de présence des champs |
| L'agrégateur pack calcule count / `cost_eur` / first-pass yield / license id depuis les lignes assets (MFT-02) | `aggregate_pack` sur fixtures 2 assets → totaux exacts ; validateurs `PackManifest` verts (Partie 4) |
| `langgraph-checkpoint-sqlite` câblé : run 50 assets tué en vol puis relancé reprend au dernier checkpoint **sans travail dupliqué** (ORC-04) | test subprocess : SIGKILL après K assets ; restart même `thread_id` ; assert `attempts` inchangés, lignes ledger non dupliquées, slots terminaux sautés |
| Store single-file, backup trivial (`cp` documenté) ; note DuckDB dans le schéma (MFT-03) | backup + restore + lecture du pack manifest depuis le `.bak` |

---

## 8.8 Couverture des exigences

| Exigence | Couverture |
|---|---|
| MFT-01 | §8.2 (`assets.manifest_json`) + §8.3 (`AssetManifest`) |
| MFT-02 | §8.3 (`aggregate_pack` → `PackManifest`) |
| MFT-03 | §8.2 (single-file + note DuckDB) + §8.6 (backup `cp`) |
| ORC-04 | §8.4 (SqliteSaver, threads, `durability="exit"`, test kill/restart) |
| (Pitfall 9) | §8.4/§8.5 (seed déterministe, enregistrement `(input,output,seed,model_id)`, replay) |

---

## 8.9 Extensions différées

- **DuckDB** pour l'analytique (v1.x/v2) — le chemin de migration est documenté, jamais substitutif.
- Colonnes `shippable/approved_by/approved_at` → Phase 10 (ship-gate humain, Partie 12), même commit que la gate.
- `dotlottie_sha256` → Phase 8 (Packager), même commit modèle + colonne.
- Rapports QA **par renderer** (AQA-02, v2) : la colonne `renderer` existe déjà ; l'extension est additive.
- Pool Playwright + écritures parallèles multi-packs → scaling production (ARCHITECTURE.md).

---

*Fin de la Partie 8. Partie suivante : **Partie 9 — Agents LLM & routeur de coût (Phase 6)**.*