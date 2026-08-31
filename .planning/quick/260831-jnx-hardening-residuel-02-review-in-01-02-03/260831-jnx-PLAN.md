---
phase: quick-260831-jnx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lottie_forge/domain/vocabulary.py
  - lottie_forge/loading/style.py
  - lottie_forge/prompts/render.py
  - tests/domain/test_pack.py
  - tests/prompts/test_prompt_fixture.py
  - src/rpc/contracts/pack-manifest.spec.ts
autonomous: true
requirements: [REVIEW-02-IN01, REVIEW-02-IN02, REVIEW-02-IN03, REVIEW-02-IN04, REVIEW-02-IN06, REVIEW-02-IN07]

estimate:
  tokens: 30000
  raw_tokens: 25000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - Zéro changement de comportement produit — suite complète verte : pytest 485 passed, vitest 156 passed (157 − le 1 bloc IN-08 dédoublonné, couverture reprise par le cas partagé), ruff + biome + tsc verts
    - vocabulary.py n'expose plus get_args (import mort + entrée __all__ supprimés) — schéma, validateurs et les 8 symboles restants de __all__ intacts
    - Le texte du prompt catalogue provient d'une lecture unique : texte et sha dérivés des mêmes octets normalisés (verrou existant test_prompt_fixture_text_equals_hashed_bytes)
    - La sonde IN-08 côté vitest n'a plus qu'une source : le cas partagé in08-doublons-asset-id du harnais it.each, dont expect_paths couvre exactement les 2 assertions du bloc supprimé
    - .github/workflows/verify.yml byte-identique (D-18) et les 4 fixtures verrouillées intouchées
  artifacts:
    - lottie_forge/domain/vocabulary.py
    - lottie_forge/loading/style.py
    - lottie_forge/prompts/render.py
    - tests/domain/test_pack.py
    - tests/prompts/test_prompt_fixture.py
    - src/rpc/contracts/pack-manifest.spec.ts
  key_links:
    - render.py:load_catalogue_text_and_sha → normalize_lf + sha256_hex sur un seul read_bytes (IN-07)
    - pack-manifest.spec.ts:it.each → fixtures/rejection-cases/pack-manifest.json expect_paths du cas in08-doublons-asset-id (IN-06)
---

<objective>
Hardening résiduel 02-REVIEW.md — appliquer les 6 findings Info restants (IN-01, IN-02, IN-03, IN-04, IN-06, IN-07) selon l'adjudication advisor déjà rendue. ZÉRO changement de comportement produit : retraits de surface API morte, corrections de commentaires, isolation de fixture de test, dédoublonnage de sonde, refactor lecture-unique additif.

Purpose: éliminer les dernières inconsistencies documentaires/structurelles relevées par la review de Phase 02 avant d'entrer en Phase 3 — chaque item est un risque de désinformation future (commentaire contredit par le code, double source de vérité, surface API morte sur un contrat verrouillé).
Output: 6 fichiers modifiés, 3 commits, suites vertes aux baselines attendues.
</objective>

<execution_context>
@.opencode/gsd-core/workflows/execute-plan.md
@.opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/02-style-verrouill-catalogue-de-recettes/02-REVIEW.md (sections IN-01, IN-02, IN-03, IN-04, IN-06, IN-07 — file:line de référence)

Sources exactes à lire avant chaque tâche (état actuel vérifié) :
- lottie_forge/domain/vocabulary.py (ligne 28 import, lignes 152-161 __all__)
- lottie_forge/loading/style.py (lignes 47-56 imports, lignes 135-151 gate)
- tests/domain/test_pack.py (lignes 398-417 test_triple_duplicate…in08)
- tests/prompts/test_prompt_fixture.py (lignes 153-183 test_residual_placeholder_guard)
- lottie_forge/prompts/render.py (lignes 35-39 imports, 158-174 load_catalogue_prompt_fixture)
- src/rpc/contracts/pack-manifest.spec.ts (lignes 190-261 harnais + bloc IN-08 inline)
- fixtures/rejection-cases/pack-manifest.json (cas in08-doublons-asset-id, expect_paths ligne 43)

Contraintes ABSOLUES (de l'adjudication, non négociables) :
- Aucun contrat traversant modifié : lottie_forge/domain/*.py (hors import mort/__all__ de vocabulary.py) et src/rpc/contracts/*.schema.ts intouchés
- .github/workflows/verify.yml byte-identique (D-18)
- Données verrouillées intouchées : fixtures/rejection-cases/catalogue.json, fixtures/recipe-catalogue/catalogue.json, fixtures/recipe-catalogue/coverage-map.json, fixtures/style-specs/example-style/style.yaml
- Environnement : Windows PowerShell 5.1, venv .venv\Scripts\python.exe

Convention commits : fix(02-…)/refactor(02-…) + suffixe (REVIEW …) comme l'historique (6e070cb, e1f2aff, 072dcd8, 49c3c17). Ce lot traverse les plans 02-01→02-06 : scope phase `02` retenu pour éviter une fausse attribution à un seul plan.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Hygiène Python non-contrat — IN-02 (style.py) + IN-03 (test_pack.py) + IN-04 (test_prompt_fixture.py)</name>
  <files>lottie_forge/loading/style.py, tests/domain/test_pack.py, tests/prompts/test_prompt_fixture.py</files>
  <read_first>
    - lottie_forge/loading/style.py lignes 47-56 (bloc imports) et 110-163 (_enforce_style_id_gate)
    - tests/domain/test_pack.py lignes 398-417
    - tests/prompts/test_prompt_fixture.py lignes 41-56 (imports) et 153-183 (test_residual_placeholder_guard)
    - 02-REVIEW.md sections IN-02, IN-03, IN-04
  </read_first>
  <action>
    Trois édits chirurgicaux, zéro changement de logique :

    IN-02 (lottie_forge/loading/style.py) :
    1. Monter `from pydantic import TypeAdapter` au niveau module — l'insérer dans le bloc third-party entre les imports stdlib et les imports lottie_forge, avant `import yaml` (ordre alphabétique isort : pydantic < yaml). Pydantic est déjà une dépendance directe (pin 2.13.4).
    2. Dans `_enforce_style_id_gate` : supprimer l'import fonction-local `from pydantic import TypeAdapter` et son commentaire explicatif dans le bloc try ; l'appel `TypeAdapter(KebabToken).validate_python(value)` reste inchangé, le `except Exception` + noqa BLE001 et la traduction ValueError restent inchangés.
    3. Corriger le commentaire au-dessus du try (actuellement lignes 135-138) : il affirme que la validation déclenche un type d'exception incorrect ("or similar") — la remplacer par un commentaire nommant le vrai type : `pydantic.ValidationError`. C'est le seul contentieux : le message d'erreur traduit (ValueError) et le comportement restent identiques.

    IN-03 (tests/domain/test_pack.py, lignes 413-415) : réécrire le commentaire du test `test_triple_duplicate_asset_id_yields_one_issue_per_pair_in08`. Le commentaire actuel affirme que l'index 0 n'apparaît pas dans les issues — c'est faux : le validateur collect-all de `lottie_forge/domain/pack.py` émet une issue `duplicate_asset_id_first` à `("assets", 0, "asset_id")` (le test frère `test_duplicate_asset_id_is_rejected_in08` ligne 395 l'asserte déjà). Nouveau commentaire : idx 0 est couvert par l'issue first-occurrence (`duplicate_asset_id_first`) ; ce test asserte les index dupliqués (1, 2) conformément au contrat collect-all. AUCUNE assertion modifiée — les deux asserts existants (idx 1, idx 2) restent tels quels.

    IN-04 (tests/prompts/test_prompt_fixture.py, test_residual_placeholder_guard) : écrire le template synthétique dans tmp_path au lieu du répertoire packagé. Ajouter `from pathlib import Path` aux imports du module, ajouter le paramètre `tmp_path: Path` à la signature du test, remplacer l'assignation de `synthetic` (actuellement `RECIPE_PICKER_TEMPLATE_PATH.parent / "_unsupported_template.md"`) par `tmp_path / "_unsupported_template.md"`. Adapter une phrase du docstring pour nommer l'isolation tmp_path (pas de fichier parasite dans templates/ packagé, sûr sous pytest-xdist). Conserver le try/finally unlink (symétrie, inoffensif). `RECIPE_PICKER_TEMPLATE_PATH` reste importé (utilisé par 2 autres tests du module).
  </action>
  <verify>
    <automated>.venv\Scripts\python.exe -m pytest tests/domain/test_pack.py tests/prompts/test_prompt_fixture.py -q; .venv\Scripts\python.exe -m ruff check lottie_forge tests; if (Select-String -Path lottie_forge\loading\style.py -Pattern "or similar" -Quiet) { throw "IN-02: stale comment still present" }; .venv\Scripts\python.exe -m pytest tests/prompts/test_prompt_fixture.py::test_residual_placeholder_guard -q; if (Test-Path lottie_forge\prompts\templates\_unsupported_template.md) { throw "IN-04: stray template in packaged dir" }</automated>
  </verify>
  <done>
    - pytest : les 2 fichiers de test passent (485 baseline global inchangé — aucun test ajouté/supprimé)
    - ruff vert (l'import mort au niveau fonction aurait été signalé ; l'import module-level est utilisé)
    - Aucune occurrence du commentaire obsolète "or similar" dans style.py
    - Aucun fichier parasite dans lottie_forge/prompts/templates/ après exécution du test de garde
    - Les asserts des tests IN-08 (test_pack.py) sont byte-inchangés
  </done>
</task>

<task type="auto">
  <name>Task 2: IN-01 chirurgical — retirer get_args du re-export de vocabulary.py (fichier contrat)</name>
  <files>lottie_forge/domain/vocabulary.py</files>
  <read_first>
    - lottie_forge/domain/vocabulary.py lignes 26-28 (import), 152-161 (__all__)
    - 02-REVIEW.md section IN-01
  </read_first>
  <action>
    Modification limitée STRICTEMENT à deux lignes du contrat vocabulary.py :
    1. Ligne 28 : `from typing import Final, Literal, get_args` → `from typing import Final, Literal`.
    2. Ligne 160 : supprimer l'entrée `"get_args",` de `__all__` (il reste 8 symboles : MAX_RECIPE_COUNT, MIN_RECIPE_COUNT, RECIPE_IDS, RecipeId, THEME_ANCHOR_IDS, ThemeAnchorId, assert_recipe_count — soit 7 — vérifier le compte final à 7).

    Vérifié en amont du plan : AUCUN consommateur n'importe get_args depuis ce module — les 13 sites d'import de lottie_forge.domain.vocabulary (catalogue.py, asset.py, recipe.py, tests/*, bridge/*) n'y référencent que RECIPE_IDS/RecipeId/ThemeAnchorId/assert_recipe_count/MIN/MAX ; get_args est importé from typing là où il sert.

    INTERDIT : toucher RECIPE_IDS, RecipeId, ThemeAnchorId, THEME_ANCHOR_IDS, assert_recipe_count, le self-check d'import, ou TOUT docstring. Les docstrings mentionnant `typing.get_args` (blocs RecipeId et ThemeAnchorId) décrivent la fonction typing utilisée par les tests — elles restent telles quelles. Zéro changement de schéma, de validateur, de Literal : c'est un fichier contrat, la modification se limite à l'import mort + __all__ (adjudication IN-01).

    Commit : refactor(02): IN-01 retire le re-export mort get_args de vocabulary (02-REVIEW)
  </action>
  <verify>
    <automated>.venv\Scripts\python.exe -c "from lottie_forge.domain import vocabulary; assert 'get_args' not in vocabulary.__all__, 'get_args still in __all__'; print('all_len', len(vocabulary.__all__))"; if (Select-String -Path lottie_forge\domain\vocabulary.py -Pattern 'from typing import .*get_args' -Quiet) { throw "IN-01: get_args still imported" }; if (Select-String -Path lottie_forge\domain\vocabulary.py -Pattern '"get_args",' -Quiet) { throw "IN-01: get_args still in __all__" }; .venv\Scripts\python.exe -m pytest tests/domain/test_vocabulary.py tests/bridge/test_vocabulary_bridge.py -q</automated>
  </verify>
  <done>
    - get_args absent de la ligne d'import ET de __all__ ; __all__ contient exactement 7 entrées
    - git diff sur vocabulary.py = 2 lignes modifiées, rien d'autre (aucun docstring/schéma/validateur touché)
    - Les suites vocabulary (domain + bridge) passent
  </done>
</task>

<task type="auto">
  <name>Task 3: IN-06 + IN-07 — dédoublonner la sonde IN-08 vitest + lecture unique du catalogue dans render.py</name>
  <files>src/rpc/contracts/pack-manifest.spec.ts, lottie_forge/prompts/render.py</files>
  <read_first>
    - src/rpc/contracts/pack-manifest.spec.ts lignes 172-261 (harnais it.each + bloc IN-08 inline)
    - fixtures/rejection-cases/pack-manifest.json lignes 2-44 (cas in08-doublons-asset-id, expect_paths)
    - lottie_forge/prompts/render.py lignes 29-39 (imports), 71-75 (__all__), 158-174 (load_catalogue_prompt_fixture)
    - lottie_forge/loading/style.py lignes 97-107 (sha256_hex — à réutiliser, PAS de réimplémentation)
    - 02-REVIEW.md sections IN-06, IN-07
  </read_first>
  <action>
    IN-06 (src/rpc/contracts/pack-manifest.spec.ts) : supprimer INTÉGRALEMENT le bloc `it("IN-08 collect-all: duplicate asset_id yields one issue per index", …)` (lignes 208-261, payload inline ~60 lignes). Couverture identique à prouver : le cas partagé `in08-doublons-asset-id` du harnais `it.each` (lignes 193-206) porte `expect_paths: [["assets",0,"asset_id"], ["assets",1,"asset_id"]]` — exactement les 2 assertions du bloc supprimé, vérifiées en membership par la boucle du harnais. Un seul modèle de rejet acceptable : read-only sur la fixture (fixtures/rejection-cases/pack-manifest.json n'est PAS modifiée). Le commentaire de règle D-08 au-dessus du describe (mentionnant le cas IN-08 collect-all) reste exact — il documente le harnais et la fixture, il ne change pas. Après suppression, aucun import ne devient inutilisé (PackManifestSchema reste consommé par le harnais et le test d'export). NB : le comptage vitest passe de 157 à 156 (un bloc `it` supprimé, cas repris par it.each) — c'est le résultat attendu, pas une régression.

    IN-07 (lottie_forge/prompts/render.py) — wrapper additif à lecture unique :
    1. Étendre l'import : `from lottie_forge.loading.style import normalize_lf` → ajouter `sha256_hex` (ordre alphabétique : normalize_lf, sha256_hex).
    2. Ajouter la fonction publique `load_catalogue_text_and_sha(path: Path = CATALOGUE_FIXTURE_PATH) -> tuple[str, str]` : un SEUL appel à `path.read_bytes()`, normalisation `normalize_lf` une fois, retour `(normalised.decode("utf-8"), sha256_hex(normalised))` — texte et sha dérivés des mêmes octets, divergence impossible par construction. Docstring nommant l'invariant (embarqué == hashé == committé, lecture unique IN-07).
    3. `load_catalogue_prompt_fixture` délègue : son corps devient `return load_catalogue_text_and_sha()` — signature publique inchangée (tuple[str, str], consommée par 4 sites dans test_prompt_fixture.py).
    4. Ajouter `"load_catalogue_text_and_sha"` à `__all__`.
    5. NE PAS toucher lottie_forge/loading/catalogue.py : la signature de `load_catalogue_fixture` reste inchangée (adjudication IN-07 — wrapper additif dans render.py uniquement).

    Pas de nouveau test requis : `test_prompt_fixture_text_equals_hashed_bytes` (sha256_hex(text.encode()) == sha) est exactement le verrou de régression de la cohérence lecture-unique.

    Commit : fix(02): IN-06 sonde IN-08 deduplie + IN-07 lecture unique catalogue (02-REVIEW)
  </action>
  <verify>
    <automated>node -e "const c=require('./fixtures/rejection-cases/pack-manifest.json').find(x=>x.case_id==='in08-doublons-asset-id'); if(JSON.stringify(c.expect_paths)!==JSON.stringify([['assets',0,'asset_id'],['assets',1,'asset_id']])) throw new Error('IN-06 coverage drift')"; npx vitest run; .venv\Scripts\python.exe -m pytest tests/prompts/test_prompt_fixture.py -q; .venv\Scripts\python.exe -m ruff check lottie_forge; npx biome check src/rpc/contracts/pack-manifest.spec.ts; npx tsc --noEmit</automated>
  </verify>
  <done>
    - node : expect_paths du cas partagé == [["assets",0,"asset_id"],["assets",1,"asset_id"]] — preuve automatisée que la couverture d'assertions du bloc supprimé est intégralement reprise
    - vitest : 156 passed (157 − 1 bloc dédoublonné) ; plus aucun payload IN-08 inline dans pack-manifest.spec.ts
    - pytest test_prompt_fixture.py vert (verrou sha256(text)==sha toujours passant sur le chemin lecture-unique)
    - ruff + biome + tsc verts ; fixtures/rejection-cases/pack-manifest.json et lottie_forge/loading/catalogue.py inchangés
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

Aucune nouvelle surface introduite : lot doc/test/refactor interne, zéro changement de comportement produit (adjudication). Les trust boundaries existants (fixtures committées → loaders, template → renderer) ne sont ni élargis ni modifiés.

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-Q-01 | Tampering | fixtures/rejection-cases/*, fixtures/recipe-catalogue/*, fixtures/style-specs/* | high | mitigate | Gates négatifs en vérification finale : git diff --exit-code sur les 4 fixtures verrouillées + verify.yml (D-18) — toute mutation est bloquante |
| T-Q-02 | Information Disclosure (commentaires faux) | test_pack.py, style.py, vocabulary.py | low | mitigate | IN-02/IN-03 corrigent des commentaires contredits par le code — le risque documenté (mainteneur "réparant" le validateur pour matcher un commentaire faux) est éliminé à la source |
| T-Q-03 | Denial of Service (divergence lecture double) | render.py load_catalogue_prompt_fixture | low | mitigate | IN-07 : texte et sha dérivés d'un seul read_bytes — la divergence devient impossible par construction ; verrou existant test_prompt_fixture_text_equals_hashed_bytes |
</threat_model>

<verification>
Chaîne complète locale (miroir ordonné de verify.yml, exécutée après les 3 tâches) :

```powershell
.venv\Scripts\python.exe -m ruff check .
npx biome check .
.venv\Scripts\python.exe -m pytest tests/ -q          # attendu: 485 passed
npx vitest run                                         # attendu: 156 passed (157 - 1 bloc IN-08 dedup)
npx tsc --noEmit
git diff --exit-code -- .github/workflows/verify.yml   # vide (D-18)
git diff --exit-code -- fixtures/rejection-cases/catalogue.json fixtures/recipe-catalogue/catalogue.json fixtures/recipe-catalogue/coverage-map.json fixtures/style-specs/example-style/style.yaml  # vide
git diff --exit-code -- "src/rpc/contracts/*.schema.ts"  # vide — aucun miroir zod touché
git diff --name-only -- lottie_forge/domain/           # doit lister UNIQUEMENT vocabulary.py
```

Pont bridge : aucun contrat modifié ⇒ les artifacts fixtures/bridge/ et la chaîne export→vitest→reimport restent byte-identiques (le `-k export` de la suite pytest complète le revalide).
</verification>

<success_criteria>
- Les 6 findings IN-01/02/03/04/06/07 appliqués exactement selon l'adjudication (ni plus, ni moins)
- Zéro changement de comportement produit : 485 pytest + 156 vitest + ruff + biome + tsc verts
- Aucun contrat traversant modifié (hors import mort/__all__ de vocabulary.py, limité à 2 lignes) ; verify.yml byte-identique ; 4 fixtures verrouillées intouchées
- 3 commits atomiques convention fix/refactor(02-…) avec suffixe (REVIEW)
</success_criteria>

<output>
Créer `.planning/quick/260831-jnx-hardening-residuel-02-review-in-01-02-03/260831-jnx-SUMMARY.md` une fois le plan exécuté.
</output>
