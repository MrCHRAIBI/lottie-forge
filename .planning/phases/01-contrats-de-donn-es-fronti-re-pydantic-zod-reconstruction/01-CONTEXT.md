# Phase 1: Contrats de données & frontière Pydantic↔zod (reconstruction) - Context

**Gathered:** 2026-08-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Reconstruire depuis un dépôt vide de code la couche contrat complète de lottie-forge : les 4 modèles Pydantic stricts (`StyleSpec`, `MotionRecipe`, `AssetSpec`, `PackManifest` + `RecipeId` vocabulaire clos), leurs miroirs zod (`z.strictObject`), le harnais de parité (vocabulaire, clés schéma, rejet, round-trip ordonné pytest→vitest→pytest), le protocole de bridge bilingue et la CI `verify` (10 étapes ordonnées + `tsc --noEmit` + zéro test skippé asserté). La licence perpétuelle one-time est structurelle dès cette phase. Périmètre fixé par ROADMAP.md (DM-01→05) ; la référence cible est l'état décrit en Partie 4 du cahier des charges (« construite et vérifiée en Phase 1 »).

</domain>

<decisions>
## Implementation Decisions

### Fidélité de reconstruction
- **D-01:** Approche **hybride pragmatique** : mêmes invariants et gates que la référence (§4.12), reprise obligatoire des cas de test les plus piégeux, réorganisation libre du reste de la suite. Pas de reprise test-pour-test.
- **D-02:** Quatre cas piégeux verrouillés comme **à conserver obligatoirement** dans la suite réécrite :
  1. `accent\n` (CR-01) — `KebabToken` validé par pydantic-core (`StringConstraints`), parité de rejet Py/zod ;
  2. `1200.0` (WR-06) — test bridge documentant l'asymétrie pinnée (zod accepte un float integral en int, Pydantic strict rejette ; Python = autorité la plus stricte, re-validation au re-import) ;
  3. `rsplit("@", 1)` (WR-01) — vérification pack-level du suffixe de version de `style_ref` par opérations string, pas de regex re-dérivée ;
  4. Doublons + chemins précis (IN-08) — sonde d'adjacence (doublons `asset_id` rejetés, jamais fusionnés) + chemins d'erreur précis `["assets", idx, "asset_id"]` côté zod (stratégie collect-all).
- **D-03:** Le comptage de référence **94 pytest / 50 vitest est indicatif** (ordre de grandeur), pas contractuel. La seule mesure = critères de succès ROADMAP (bridge vert depuis fresh checkout, zéro test skippé, rejets miroirs). La note « blocker » de STATE.md citant 94/50 en cible est interprétée selon D-03.

### Outillage Python local
- **D-04:** **pip + venv nus** au quotidien (Windows) — séquence d'installation identique à la CI (`pip install -e ".[dev]"`, §3.6). Pas d'uv, pas de poetry. Parité locale/CI maximale.
- **D-05:** **Pas de hooks git locaux (pre-commit)** — ruff / biome / tsc enforce en CI uniquement, complétés par la séquence de commandes documentée (README = séquence CI byte-for-byte).

### Cas de rejet miroirs (parité Py↔TS)
- **D-06:** Partage **hybride JSON** : cas positifs via builders Python (`make_style_spec()`, `make_recipe()`, `make_asset()`, `make_pack()` dans `tests/bridge/fixtures.py`, §4.3) ; cas négatifs (rejets) dans des **fichiers JSON de cas partagés** lus par `pytest` (parametrize) **et** `vitest` (`test.each`) — une seule source, zéro drift entre suites.
- **D-07:** Emplacement : `fixtures/rejection-cases/<contrat>.json` — **un fichier par contrat** (`style-spec.json`, `recipe.json`, `asset-spec.json`, `pack-manifest.json` ; extensions Phase 2+ au même patron), commités, cohabitant avec `fixtures/style-specs/` et `fixtures/recipe-catalogue/` de l'arborescence §2.7. — **Reversibility:** costly — changer d'emplacement ou de format toucherait tous les fichiers de cas plus les deux loaders (pytest + vitest).
- **D-08:** Format d'un cas de rejet (spécification exacte de l'utilisateur) :
  ```json
  { "case_id": "...", "ref": "...", "model": "...", "payload": { }, "expect_paths": ["..."] }
  ```
  Règles : `case_id` stable et humain ; `ref` = ID documenté (CR-01, WR-01/04/06, DM-02, IN-08…) ; les deux suites **assertent toujours le rejet** (parité §4.2) ; quand `expect_paths` est présent (sondes IN-08, cross-fields, WR-04), assertion **en plus** de la parité des **chemins d'erreur par appartenance** : chemin attendu ∈ `loc` des `errors()` Pydantic (normalisés en liste) **ET** ∈ `path` des issues zod — **jamais sur le texte des messages** ; `expect_paths` absent = rejet seul.

### Stratégie de branches
- **D-09:** **Commits atomiques directs sur `main`** pendant les phases (style GSD) ; branch protection `main` activée uniquement au ship (note §13.7 / 01-04-SUMMARY).

### the agent's Discretion
- Version initiale du package Python (`pyproject.toml`), backend de build (hatchling/setuptools — doit supporter `pip install -e ".[dev]"`)
- Organisation fine des fichiers dans `tests/domain/` et `tests/bridge/` (libre sous D-01)
- Contenu précis du `.gitignore` (`venv/`, `__pycache__/`, `node_modules/`, `dist/`, `fixtures/bridge/`…)
- Conventions de messages de commit (style conventionnel court type GSD)
- Détails `ruff.toml` (`known-first-party = ["lottie_forge", "fixtures"]` imposé, reste libre)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contrats & harnais de parité (cœur de la phase)
- `docs/project/04_Modeles.md` — Partie 4 entière (§4.1–§4.14) : principes de la couche contrat, harnais de parité + règle same-commit, protocole de bridge, définition champ par champ des 4 modèles, miroirs zod + asymétrie pinnée WR-06, schémas d'IDs/hashes, surface de tests cible §4.12, extensions différées §4.14
- `docs/project/02_Architecture.md` §2.5 — contrats de frontière Py↔TS (quels modèles traversent, règle « aucun dict[str, Any] ») ; §2.7 — structure du monorepo ; §2.8 — ordre de construction
- `docs/project/01_Vision.md` §1.8 — état cible de la Phase 1 (référence de reconstruction) et §1.5 — ADR-01→06

### Stack & CI
- `docs/project/03_Stack.md` §3.1–§3.2 — pins versions Python/TS ; §3.6 — job CI `verify` 10 étapes (README = séquence byte-for-byte) ; §3.8 — interdits
- `.planning/ROADMAP.md` — Phase 1 (goal, 5 critères de succès, canonical refs)
- `.planning/REQUIREMENTS.md` — DM-01→05 (définitions testables)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Aucun — dépôt vide de code (greenfield confirmé en session d'initialisation). Seuls `docs/project/` et `.opencode/` existent.

### Established Patterns
- Patterns imposés par le cahier des charges (à établir dès cette phase) : `ConfigDict(extra="forbid", strict=True)` partagé via `domain/_shared.py` (`STRICT_CONFIG`, `TOKEN_NAME_PATTERN`) ; builders de fixtures en source unique (`tests/bridge/fixtures.py`) ; `KebabToken` = `Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9-]*$", max_length=64)]` possédé par pydantic-core
- CI : GitHub Actions job unique `verify` sur `ubuntu-latest` (séquence §3.6) ; `fixtures/bridge/` généré au test, gitignoré

### Integration Points
- `pyproject.toml` / `package.json` / `tsconfig.json` / `biome.json` / `ruff.toml` à créer à la racine du dépôt (monorepo deux couches, décision d'initialisation)
- Les contrats livrés ici sont l'entrée de toutes les phases suivantes (Phase 2 : `RecipeCatalogue` étend `MotionRecipe` ; Phase 3 : `RenderSpec`/`LottieJSON` ; Phase 6 : `StyleRefinement` étend le pattern delta-only)

</code_context>

<specifics>
## Specific Ideas

- Format de cas de rejet spécifié verbatim par l'utilisateur (D-08) — inclut la parité de chemins par appartenance, jamais sur le texte des messages
- La CI doit asserterr **zéro test bridge skippé** (junitxml + `skipped == 0`, §4.2) — une chaîne bridge à moitié silencieuse ne peut pas passer au vert
- Déterminisme fresh-checkout : `ruff.toml` porte `[lint.isort] known-first-party = ["lottie_forge", "fixtures"]` (§4.3, CI ubuntu == local Windows)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-contrats-de-donn-es-fronti-re-pydantic-zod-reconstruction*
*Context gathered: 2026-08-29*
