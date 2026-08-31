---
phase: 02-style-verrouill-catalogue-de-recettes
plan: 05
subsystem: gates / rejection-harness / bridge
tags:

  - pydantic
  - pytest
  - vitest
  - rejection-harness
  - blocking-gates
  - stale-pins
  - semver
  - d-06
  - d-07
  - d-08
  - d-09
  - d-14
  - d-18
  - sty-03
  - mot-01
  - mot-02
  - mot-03

requires:

  - 02-01 # load_style_spec (version courante de la fixture), STYLE_REF_PATTERN, sha256_hex
  - 02-02 # harnais de rejet étendu (CONTRACT_FILES côté py + ts, entrée style-refinement)
  - 02-04 # catalogue.json + coverage-map.json + validateurs (locs attendus par expect_paths)

provides:

  - fixtures/rejection-cases/catalogue.json — 15 cas intrinsèques D-08 (disco-spin, theme_anchors vide, doublons, bornes, extra keys)
  - entrée "catalogue" dans les DEUX loaders du harnais (rejection_loader.py + rejection-cases.ts) — membership de chemins uniquement
  - audit de couverture §5.6 BLOQUANT : A (état orphelin/id inconnu = rouge) + B (recette morte = rouge) + cohérences D-15 exit/loop
  - règle same-commit ADR-03 étendue à 4 fichiers + scan seconde déclaration THEME_ANCHOR_IDS + miroir ts lockstep
  - lottie_forge.gates.stale_pins — scan_stale_pins() PURE, PinRecord, StalePinFlag, BumpClass, StaleScope, BUMP_SCOPE (pas de miroir zod, D-08)
  - deux tests bloquants STY-03 : bump simulé paramétré + garde permanente zéro-pin-stale avec assert de non-vacuité (D-07)

affects:

  - Phase 5 (store-backed scan_stale_pins — même ancre AssetSpec.style_ref)
  - Phase 6 (les agents ne peuvent piocher que des ids que l'audit A/B garantit vivants)
  - job verify (les gates sont des tests pytest/vitest ramassés par les étapes existantes, D-18)

tech-stack:
  added: []
  patterns:

    - gate = test ordinaire : toute gate bloquante de la phase est un pytest/vitest ramassé par verify.yml existant — zéro edit workflow (D-18)
    - fonction pure à source injectable : scan_stale_pins(pins, current_version) sans I/O — fixtures Phase 2 aujourd'hui, store Phase 5+ demain, logique écrite une fois
    - harnais de rejet à entrée déclarative : ajouter un contrat = une entrée dans CONTRACT_FILES (py) + mapping ts, consommation parametrize/it.each automatique
    - audit de couverture recoupé : A/B croisent coverage-map × catalogue × RECIPE_IDS — falsification exige un commit incohérent détectable (T-02-08)
    - downgrade pinné > courant classé major par sûreté (scope le plus conservateur, documenté en docstring)

actuals:
  tokens: 41000
  tasks: 3
  commits: 4
key-files:
  created:

    - fixtures/rejection-cases/catalogue.json
    - lottie_forge/gates/__init__.py
    - lottie_forge/gates/stale_pins.py
    - tests/domain/test_stale_pins.py
  modified:

    - tests/bridge/rejection_loader.py
    - src/rpc/contracts/rejection-cases.ts
    - tests/bridge/test_catalogue_bridge.py
    - src/rpc/contracts/catalogue.spec.ts
    - tests/domain/test_vocabulary.py

key-decisions:

  - harnais catalogue en membership de chemins : chaque expect_paths trouve son loc/path dans les erreurs pydantic ET zod (cat08 intensity-out-of-bounds porte l'INDEX de l'élément fautif en fin de loc — violation par-élément dans le tuple, contrairement à cat07 qui valide la relation entre éléments)
  - l'audit A/B est BLOQUANT dans le job verify (D-14) : état orphelin, id inconnu, recette morte = rouge — avec messages citant la verticale et le state_id (T-02-06 accept)
  - règle C structurelle : set(catalogue ids) == set(RECIPE_IDS) asserté + interdiction de toute seconde déclaration de THEME_ANCHOR_IDS hors vocabulary.schema.ts ; miroir ts asserte set(THEME_ANCHOR_IDS) == les 6 labels (lockstep de surface)
  - PinRecord/StalePinFlag SANS miroir zod (D-08, règle §4.10) : la gate vit côté Python, rien ne traverse la frontière — un miroir serait une seconde source de vérité pour un type qui ne quitte jamais Python
  - STYLE_REF_PATTERN importé de asset.py verbatim (pas de re-dérivation) ; extraction de version par rsplit("@", 1) — discipline WR-01
  - garde permanente : extraction des pins UNIQUEMENT des payloads qui valident sous leur contrat (AssetSpec/PackManifest payload par payload) + baseline make_asset/make_pack ; payloads de rejet = rejection-only hors périmètre (y compris mono-style-mismatch full-format example-style@2.0.0) ; assert total >= 1 anti-scan-vide

patterns-established:

  - gate pure injectable : la logique de re-validation s'écrit une fois au niveau fixtures et se re-branche sur le store Phase 5+ sans refactor — seule la source de pins change
  - classification semver in-fonction : major d'abord puis minor puis patch, premier composant différent = classe ; downgrade → major par sûreté
  - extension du harnais par entrée déclarative : catalogue rejoint style-spec + recipe + asset-spec + pack-manifest + style-refinement dans le même dict CONTRACT_FILES, même format D-08

requirements-completed: [MOT-01, MOT-02, MOT-03, STY-03]
coverage:

  - deliverable: Harnais de rejet catalogue — 15 cas intrinsèques consommés des deux côtés (membership de chemins)
    id: del-1
    description: fixtures/rejection-cases/catalogue.json (format D-08, model RecipeCatalogue, une mutation par cas) enregistré dans rejection_loader.py ET rejection-cases.ts ; parametrize pytest + it.each vitest
    requirement: MOT-01
    verification:

      - kind: automated
        ref: python -m pytest tests/bridge/test_catalogue_bridge.py -q
        status: pass

      - kind: automated
        ref: npx vitest run catalogue
        status: pass
    human_judgment: false

  - deliverable: Audit de couverture §5.6 bloquant (D-14 A/B) + cohérences D-15 exit/loop
    id: del-2
    description: A — 16 états tous mappés vers des ids existants (état orphelin/id inconnu = rouge) ; B — union des ids mappés == set des 10 ids du catalogue (recette morte = rouge) ; états exit → slide/fade, continus → orbit/float/pulse
    requirement: MOT-02
    verification:

      - kind: automated
        ref: python -m pytest tests/bridge/test_catalogue_bridge.py -q
        status: pass
    human_judgment: false

  - deliverable: Règle same-commit ADR-03 étendue à 4 fichiers (D-14C) + lockstep THEME_ANCHOR_IDS
    id: del-3
    description: set(catalogue ids) == set(RECIPE_IDS) structurel ; aucune seconde déclaration de RECIPE_IDS ni THEME_ANCHOR_IDS hors les fichiers vocabulary ; miroir ts sur les 6 labels
    requirement: MOT-02
    verification:

      - kind: automated
        ref: python -m pytest tests/domain/test_vocabulary.py -q
        status: pass

      - kind: automated
        ref: npx vitest run vocabulary
        status: pass
    human_judgment: false

  - deliverable: scan_stale_pins pure (D-06/D-08/D-09) — PinRecord/StalePinFlag STRICT_CONFIG, BUMP_SCOPE déclaratif
    id: del-4
    description: fonction pure à source injectable, rsplit WR-01, bump_class par diff semver in-fonction (downgrade → major), scope patch→sampled / minor→tokens_touched / major→all, ordre stable, doublons jamais fusionnés
    requirement: STY-03
    verification:

      - kind: automated
        ref: python -m pytest tests/domain/test_stale_pins.py::test_simulated_bump_flags_with_exact_class_and_scope -q
        status: pass

      - kind: automated
        ref: python -m pytest tests/domain/test_stale_pins.py::test_duplicate_pins_never_merge -q
        status: pass
    human_judgment: false

  - deliverable: Garde permanente STY-03 bloquante avec assert de non-vacuité (D-07)
    id: del-5
    description: extraction des pins des seuls payloads contractuellement valides (AssetSpec/PackManifest + baseline make_asset/make_pack) ; total >= 1 asserté ; tout pin ≠ version courante = échec dur ; payloads de rejet hors périmètre (docstring)
    requirement: STY-03
    verification:

      - kind: automated
        ref: python -m pytest tests/domain/test_stale_pins.py::test_permanent_guard_zero_stale_pins_nonempty_scan -q
        status: pass
    human_judgment: false

  - deliverable: Doctrine CI préservée (D-18) — zéro modification du workflow verify
    id: del-6
    description: .github/workflows/verify.yml byte-identique — les gates sont des tests ordinaires ramassés par les étapes existantes
    requirement: STY-03
    verification:

      - kind: automated
        ref: git diff --exit-code -- .github/workflows/verify.yml
        status: pass
    human_judgment: false

duration: ~30 min (session 1 : Tasks 1-2, ~17 min · interruption · session reprise : Task 3 close-out, ~13 min)
completed: 2026-08-31T02:15:50+01:00
status: complete
---

# Phase 2 Plan 05: Gates bloquantes — harnais catalogue, audit D-14, scan_stale_pins

**Gates bloquantes de la Phase 2 posées dans le job verify existant : harnais de rejet catalogue 15 cas en miroir (MOT-04), audit de couverture §5.6 bloquant A/B + règle same-commit 4 fichiers (D-14), gate STY-03 `scan_stale_pins` pure + bump simulé et garde permanente bloquants (D-07) — zéro edit de verify.yml (D-18).**

## Performance

- **Duration:** ~30 min actives sur deux sessions (interruption entre Task 2 et Task 3, reprise en close-out)
- **Tasks:** 3
- **Files:** 4 créés, 5 modifiés
- **Tests:** 462 pytest passed (+70 vs baseline 392) ; 150 vitest passed (+25 vs 125) ; ruff / biome / tsc verts
- **Chaîne ordonnée:** pytest -k export (18) → npx vitest run (150) → pytest -q (462) — verte

## Accomplishments

1. **Harnais de rejet catalogue (Task 1)** : `fixtures/rejection-cases/catalogue.json` — 15 cas intrinsèques au format D-08 (disco-spin, theme_anchors vide, doublons d'ids, bornes 7/13 recettes, anchor inconnu, intensité non-ordonnée et hors-bornes par élément, shape/trigger/keyframe_shape inconnus, durée hors pack-range, mauvaise version, extra key). Enregistré dans les DEUX loaders (`CONTRACT_FILES` py + mapping ts) ; consommation parametrize (15 cas pytest) et it.each (15 cas vitest), membership de chemins uniquement. ROADMAP critère 2 (volets disco-spin et theme_anchors vide) prouvé des deux côtés.
2. **Audit de couverture bloquant (Task 2)** : A — chaque verticale/état de coverage-map.json mappe vers ≥ 1 recipe_id existant du catalogue ET de RECIPE_IDS (état orphelin ou id inconnu = rouge) ; B — l'union des ids mappés == set des 10 ids (recette morte = rouge, ids cités dans le message) ; cohérences D-15 assertées (exit → slide/fade, continu → orbit/float/pulse). Règle C : `set(catalogue ids) == set(RECIPE_IDS)` structurelle + interdiction de seconde déclaration de THEME_ANCHOR_IDS + miroir ts lockstep sur les 6 labels.
3. **Gate STY-03 (Task 3)** : `lottie_forge/gates/stale_pins.py` — `scan_stale_pins(pins, current_version)` PURE à source injectable ; `PinRecord`/`StalePinFlag` en STRICT_CONFIG SANS miroir zod (D-08) ; `BUMP_SCOPE` déclaratif {patch→sampled, minor→tokens_touched, major→all} ; classification semver in-fonction, downgrade → major par sûreté ; ordre stable, doublons jamais fusionnés. Deux tests bloquants : bump simulé paramétré (PATCH échantillonné / MINOR tokens_touched / MAJOR tous) et garde permanente (extraction sous contrat des seuls payloads valides + baseline builders, assert non-vacuité total >= 1, zéro pin stale sur le dépôt committé).

## Task Commits

1. **Task 1: Cas de rejet partagés catalogue.json + enregistrement dans les deux loaders** - `4296e5a` (feat)
2. **Task 2: Audit de couverture bloquant (D-14 A/B) + same-commit 4 fichiers (C)** - `4daca7c` (feat) + fix `9a1b2bc` (ruff E501)
3. **Task 3: Gate scan_stale_pins pure + les deux tests bloquants (D-07)** - `8e4ce09` (feat, commit de close-out après reprise)

## Files Created/Modified

- **CRÉÉ** `fixtures/rejection-cases/catalogue.json` — 15 cas D-08, model RecipeCatalogue, une mutation par cas
- **CRÉÉ** `lottie_forge/gates/__init__.py` — package des gates bloquantes
- **CRÉÉ** `lottie_forge/gates/stale_pins.py` — scan_stale_pins() pure, PinRecord, StalePinFlag, BumpClass, StaleScope, BUMP_SCOPE
- **CRÉÉ** `tests/domain/test_stale_pins.py` — bump simulé paramétré + garde permanente + sondes d'adjacence (downgrade, ordre mixte, doublons)
- **MOD** `tests/bridge/rejection_loader.py` — entrée "catalogue" dans CONTRACT_FILES
- **MOD** `src/rpc/contracts/rejection-cases.ts` — même entrée côté ts
- **MOD** `tests/bridge/test_catalogue_bridge.py` — parametrize 15 cas + audits A/B + cohérences D-15
- **MOD** `src/rpc/contracts/catalogue.spec.ts` — it.each miroir 15 cas (+ réformatage d'import biome au close-out)
- **MOD** `tests/domain/test_vocabulary.py` — règle C + scan THEME_ANCHOR_IDS

## Decisions Made

- **Membership de chemins, jamais de message** : les expect_paths des 15 cas visent les locs pydantic et paths zod ; cat08 (intensity hors-bornes) porte l'INDEX de l'élément fautif en fin de loc — violation par-élément dans le tuple, distincte de cat07 (relation entre éléments, arrêt au champ).
- **Pas de miroir zod pour les types de gate (D-08 §4.10)** : PinRecord/StalePinFlag ne traversent jamais la frontière Py↔TS — un miroir créerait une seconde source de vérité.
- **STYLE_REF_PATTERN importé verbatim** (asset.py), extraction `rsplit("@", 1)` — zéro re-dérivation du pattern ou du parsing (WR-01).
- **Garde permanente : extraction sous contrat payload par payload** — seuls les payloads qui valident (AssetSpec / PackManifest) contribuent des pins, complétés par la baseline make_asset()/make_pack() ; les payloads de rejet (y compris mono-style-mismatch full-format example-style@2.0.0) sont rejection-only hors périmètre ; `assert total >= 1` rend un scan silencieusement vide rouge.
- **Downgrade → major par sûreté** : pinné > courant classe major (scope le plus conservateur), documenté en docstring.

## Deviations from Plan

**1. [Rule 1 - Bug] Réformatage d'import dans catalogue.spec.ts committé au close-out (8e4ce09)**
- **Found during:** reprise Task 3 — fichier laissé modifié par la session interrompue.
- **Issue:** import multi-lignes non committé avec le Task 1 (reformatage biome cosmetic, +8/-1).
- **Fix:** inclus au commit de close-out du Task 3.
- **Verification:** npx biome check . vert, vitest 150 passed.

---

**Total deviations:** 1 auto-fixed (cosmetic)
**Impact on plan:** Aucun — réformatage sans changement sémantique.

## Issues Encountered

- **Interruption de session entre Task 2 et Task 3** : l'exécution initiale s'est arrêtée après le commit `9a1b2bc` en laissant les fichiers du Task 3 non committés et le SUMMARY absent. Reprise en mode close-out : vérification que le travail en flight était complet et vert (72 passed ciblés), revue du module contre le contrat du plan (STRICT_CONFIG, import verbatim, pureté, downgrade→major, assert non-vacuité), commit `8e4ce09`, puis batterie de vérification complète (chaîne ordonnée + ruff/biome/tsc + D-18).

## User Setup Required

None - aucune configuration externe requise.

## Next Phase Readiness

- **Plan 02-06 (prompt-fixture + manifest)** peut démarrer : les gates bloquantes de la phase sont en place et vertes ; `scan_stale_pins` attend son branchement store-backed Phase 5+ (même ancre `AssetSpec.style_ref`) ; 02-06 branchera les vrais sha via l'override `make_asset(content_hashes=...)` livré par 02-03.
- **Gates vertes** : 462 pytest ✓, 150 vitest ✓, ruff/biome/tsc ✓, `git diff .github/workflows/verify.yml` ✓ (vide). Aucune dette ouverte issue de ce plan.

---
*Phase: 02-style-verrouill-catalogue-de-recettes*
*Completed: 2026-08-31*
