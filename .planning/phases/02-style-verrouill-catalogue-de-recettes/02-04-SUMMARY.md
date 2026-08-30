---
phase: 02-style-verrouill-catalogue-de-recettes
plan: 04
subsystem: domain
tags: [pydantic, zod, catalogue, fixtures, lottie, motion-recipes]
requires:
  - phase: 02-01
    provides: ThemeAnchorId vocabulary, sha256_hex/normalize_lf hash regime, loader pattern
  - phase: 02-02
    provides: shared rejection harness registration pattern
  - phase: 01
    provides: collect-all validator pattern (pack.py), zod superRefine mirror pattern
provides:
  - CatalogRecipe/RecipeCatalogue strict models (py) + CatalogRecipeSchema/RecipeCatalogueSchema (zod) with §5.5.3 collect-all invariants
  - catalogue.json (10 recipes verbatim D-01 × §5.5.2) + coverage-map.json (D-15, 16 states) product fixtures
  - Bilingual direct loading without drift (deep-equal + keys parity + tuple lockstep, MOT-04)
  - D-17 joint easing cross-reference both sides (validate_easing_cross pure + JointCatalogueStyleSchema superRefine)
  - catalogue_sha256 in the D-03 raw-bytes LF regime
affects: [02-05 (audit + stale-pins consume catalogue/coverage-map), 02-06 (prompt fixture renders catalogue), phase-3 compiler (theme_anchors), phase-6 RecipePicker]
actuals:
  tokens: 14500
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns:
    - "collect-all catalogue invariants via one model_validator + ValidationError.from_exception_data (pack.py pattern)"
    - "superRefine mirror with identical paths ([recipes, idx, field]) on the TS side"
    - "pure cross-reference function at joint load (validate_easing_cross) -- model stays per-object, cross-fixture state lives in the loader (D-17)"
    - "product data as committed verbatim fixtures, never agent-invented (D-01/D-15)"
key-files:
  created:
    - lottie_forge/domain/catalogue.py
    - lottie_forge/loading/catalogue.py
    - tests/domain/test_catalogue.py
    - tests/bridge/test_catalogue_bridge.py
    - src/rpc/contracts/catalogue.schema.ts
    - src/rpc/contracts/catalogue.spec.ts
    - fixtures/recipe-catalogue/catalogue.json
    - fixtures/recipe-catalogue/coverage-map.json
  modified: []
key-decisions:
  - "CatalogRecipe is a standalone strict model sharing types with MotionRecipe by import -- §5.5.1 locks the JSON key as id (not recipe_id) and carries no params, so Python inheritance would impose params the locked JSON does not have"
  - "easing ∈ StyleSpec.easing_curves is validated at JOINT loading (loader pure function + zod joint schema), not on the model -- cross-fixture state, D-17"
  - "coverage-map.json carries no zod mirror -- it never crosses the Py↔TS boundary (§4.10); its blocking audit is plan 02-05"
  - "Literal-in-list rejection locs carry the item index (theme_anchors,1) -- tests assert by field prefix there, exact loc elsewhere"
patterns-established:
  - "joint-load parity pattern: py pure function + ts superRefine with catalogued prefix paths"
  - "schema-keys bridge artifact carries model keys AND closed-set tuples for py/ts lockstep"
requirements-completed: [MOT-01, MOT-02, MOT-03, MOT-04]
coverage:
  - id: D1
    description: "CatalogRecipe/RecipeCatalogue strict models with §5.5.3 collect-all invariants (id uniqueness per-excess-occurrence, pack durations 600..1500, ordered intensity, 8..12 bounds, MOT-03 anchors >=1)"
    requirement: MOT-01
    verification:
      - kind: unit
        ref: "tests/domain/test_catalogue.py#test_valid_catalogue_ten_recipes + rejection suite (18 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "catalogue.json = 10 locked recipes verbatim (D-01 × §5.5.2), loaded by both layers without drift (deep-equal + keys parity)"
    requirement: MOT-04
    verification:
      - kind: integration
        ref: "tests/bridge/test_catalogue_bridge.py#test_committed_catalogue_loads_both_sides_without_drift"
        status: pass
      - kind: integration
        ref: "src/rpc/contracts/catalogue.spec.ts#deep-equals the Python-exported artifact"
        status: pass
    human_judgment: false
  - id: D3
    description: "Disco-spin / unknown anchor / unknown shape-or-trigger / bad version rejected at the schema boundary both sides (closed vocabularies)"
    requirement: MOT-02
    verification:
      - kind: unit
        ref: "tests/domain/test_catalogue.py#test_disco_spin_at_catalogue_level"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/catalogue.spec.ts#rejects disco-spin and empty theme_anchors"
        status: pass
    human_judgment: false
  - id: D4
    description: "coverage-map.json committed as D-15 product data (16 states, 3 verticals, exact mappings)"
    requirement: MOT-01
    verification:
      - kind: unit
        ref: "tests/bridge/test_catalogue_bridge.py#test_coverage_map_product_data_loads"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-17 joint easing cross-reference: easing outside StyleSpec rejects the load both sides with path parity ([recipes, idx, easing] / [catalogue, recipes, idx, easing])"
    requirement: MOT-04
    verification:
      - kind: integration
        ref: "tests/bridge/test_catalogue_bridge.py#test_style_without_entrance_rejects_entrance_recipes"
        status: pass
      - kind: integration
        ref: "src/rpc/contracts/catalogue.spec.ts#rejects entrance recipes when the style loses the entrance curve"
        status: pass
    human_judgment: false
  - id: D6
    description: "catalogue_sha256 computed on LF-normalised committed bytes (D-03), 64 lowercase hex, stable"
    requirement: MOT-04
    verification:
      - kind: unit
        ref: "tests/bridge/test_catalogue_bridge.py#test_catalogue_sha256_d03_regime"
        status: pass
    human_judgment: false
duration: 38min
completed: 2026-08-30
status: complete
---

# Phase 2 Plan 04: RecipeCatalogue + fixtures produit Summary

**Catalogue fermé de 10 recettes en données produit versionnées (D-01 × §5.5.2 verbatim), chargé bilingue sans drift, avec validateurs collect-all §5.5.3 et cross-référence easing conjointe D-17 des deux côtés**

## Performance

- **Duration:** 38 min
- **Started:** 2026-08-30T19:05Z
- **Completed:** 2026-08-30T19:55Z
- **Tasks:** 3
- **Files modified:** 8 (+2 artefacts bridge générés au test, gitignorés)

## Accomplishments

- `CatalogRecipe`/`RecipeCatalogue` Pydantic strict + miroir zod `strictObject` avec les invariants agrégés §5.5.3 en collect-all (locs precis, miroirs superRefine aux mêmes chemins)
- `catalogue.json` verbatim (contenu verrouillé D-01 × §5.5.2, ordre canonique RECIPE_IDS) + `coverage-map.json` D-15 (16 états, 3 verticales)
- Chargement bilingue MOT-04 prouvé : deep-equal + parité de clés + lockstep KEYFRAME_SHAPES/SHAPE_NAMES/TRIGGER_POINTS via artefacts bridge
- D-17 : `validate_easing_cross` (pure) + `JointCatalogueStyleSchema` rejettent un easing hors StyleSpec des deux côtés, parité de chemins — ROADMAP critère 2 (volet easing) verrouillé
- `catalogue_sha256` au régime D-03 (octets bruts LF), prêt pour `content_hashes` (02-03)

## Task Commits

1. **Task 1: Modèles CatalogRecipe + RecipeCatalogue collect-all §5.5.3** - `dfe01eb` (feat)
2. **Task 2: Fixtures produit + miroir zod + parité bilingue** - `778b083` (feat)
3. **Task 3: Chargement conjoint easing D-17** - `56ba18b` (feat)

## Files Created/Modified

- `lottie_forge/domain/catalogue.py` - CatalogRecipe, RecipeCatalogue, KeyframeShape + validateurs collect-all
- `lottie_forge/loading/catalogue.py` - CATALOGUE_FIXTURE_PATH, COVERAGE_MAP_PATH, load_catalogue_fixture, validate_easing_cross, load_catalogue_with_style
- `tests/domain/test_catalogue.py` - 34 tests (positifs + rejets loc-membership + lockstep)
- `tests/bridge/test_catalogue_bridge.py` - export/parity/hash/coverage-map + 6 tests conjoints D-17
- `src/rpc/contracts/catalogue.schema.ts` - CatalogRecipeSchema, RecipeCatalogueSchema, JointCatalogueStyleSchema + tuples lockstep
- `src/rpc/contracts/catalogue.spec.ts` - 10 tests (parité bilingue + superRefine + joint load)
- `fixtures/recipe-catalogue/catalogue.json` - données produit verrouillées (10 recettes)
- `fixtures/recipe-catalogue/coverage-map.json` - D-15 verbatim (16 états)

## Decisions Made

- CatalogRecipe standalone (types partagés par import, pas d'héritage) : le JSON §5.5.1 verrouille la clé `id` sans `params` — hériter de MotionRecipe imposerait params (décision du plan, documentée en docstring)
- Cross-référence easing au chargement conjoint (loader), pas sur le modèle : état cross-fixtures (D-17)
- Pas de miroir zod pour coverage-map.json (ne traverse pas la frontière, §4.10)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Literal-in-list locs carry the item index**
- **Found during:** Task 1 (test run)
- **Issue:** pydantic v2 emits loc ("theme_anchors", 1) for a bad list ITEM (Literal mismatch), not ("theme_anchors",) — three membership assertions failed
- **Fix:** tests assert by field-name prefix for item-level Literals; exact locs kept for field-level and collect-all rejections
- **Files modified:** tests/domain/test_catalogue.py
- **Verification:** 34/34 catalogue tests pass
- **Committed in:** dfe01eb

**2. [Rule 1 - Bug] Python repr syntax leaked into TS template literals**
- **Found during:** Task 2 (vitest PARSE_ERROR on `${recipe.id!r}`)
- **Fix:** replaced with `${recipe.id}` (twice — re-introduced once in Task 3, re-fixed)
- **Files modified:** src/rpc/contracts/catalogue.schema.ts
- **Verification:** vitest catalogue 10/10
- **Committed in:** 778b083 / 56ba18b

---

**Total deviations:** 2 auto-fixed (2 × Rule 1 bugs)
**Impact on plan:** Corrective uniquement — aucun changement de périmètre ni de contrat.

## Issues Encountered
- None beyond the two deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02-05 peut consommer `catalogue.json`/`coverage-map.json` : harnais de rejets intrinsèques, audit bloquant D-14 (A/B/C), gate `scan_stale_pins`
- Plan 02-06 rendra le catalogue verbatim + `catalogue_sha256` dans le template de prompt
- Noté : les cas de rejet conjoints D-17 vivent dans ces suites dédiées, PAS dans le harnais partagé (le harnais catalogue de 02-05 couvre les rejets intrinsèques)

---
*Phase: 02-style-verrouill-catalogue-de-recettes*
*Completed: 2026-08-30*
