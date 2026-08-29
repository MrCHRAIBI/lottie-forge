---
phase: 01-contrats-de-donn-es-fronti-re-pydantic-zod-reconstruction
plan: 04
subsystem: contracts
tags: [pydantic, zod, bridge, pack-manifest, license-structural, vitest, pytest, dm-04, lic-01, lic-02, in-08, wr-01, determinism]

# Dependency graph
requires:
  - phase: 01-01
    provides: "StyleSpec strict contract + zod strictObject mirror + _shared.py (STRICT_CONFIG) + bridge ordered chain pattern"
  - phase: 01-02
    provides: "RecipeId closed vocabulary + MotionRecipe Pydantic/zod + bridge ordered chain green from the recipe contract"
  - phase: 01-03
    provides: "AssetSpec strict contract + zod mirror + make_asset() fixture (style_ref pinned to make_style_spec().style_version) + bridge ordered chain green from the asset contract"
provides:
  - "PackManifest Pydantic strict contract (DM-04, §4.8) -- pack_id ^pack-[a-z][a-z0-9-]*-\\d{4}-\\d{2}-\\d{2}$ nominal form (IN-07), style_version ^\\d+\\.\\d+\\.\\d+$, assets 1..50 of AssetSpec, totals, license"
  - "LicenseInfo structurelle (LIC-01/02) -- terms Literal[\"perpetual-one-time\"] + validateurs commercial_use=True AND attribution_required=False; une licence abonnement ne peut pas etre construite"
  - "PackTotals -- asset_count: int >= 1, cost_eur: float 0..1000, first_pass_yield: float 0..1"
  - "3 validateurs agreges SEPARES (un invariant chacun, collect-all) : unicite asset_id (IN-08 adjacency probe, one issue per duplicate index), coherence totals.asset_count == len(assets), mono-style (WR-01 rsplit+\"@\" + comparaison exacte, pas de regex re-derivee)"
  - "PackManifestSchema zod strictObject mirror -- z.literal(\"perpetual-one-time\") + superRefine (gate + belt), AssetSpecSchema importé (ADR-03), superRefine collect-all pour les 3 invariants avec paths symetriques Python (loc precise vs zod path: [])"
  - "make_pack() fixture -- compose 2 assets mono-style par construction (style_ref suffixe exactement par style_version du pack), totals coherents, license perpetuelle valide"
  - "fixtures/rejection-cases/pack-manifest.json -- 10 shared rejection cases (IN-08 doublons collect-all, totals-compte, WR-01 mono-style, assets-vide, assets-51, 3 voies license, cost-eur, pack-id form) consommé par pytest parametrize ET vitest test.each"
  - "Sonde determinisme byte-identique (critere ROADMAP n°5, §4.1 #6) -- deux constructions independantes du meme PackManifest produisent model_dump_json() byte-identique"
  - "Bridge ordered chain pack-manifest verte -- pytest -k export -> npx vitest run -> pytest -q (skipif guard d'ordre), byte-identical JSON artifacts"
affects: [phase-01-plan-05, phase-05-manifest-store, phase-06-agents, phase-08-packager, all-downstream-phases-consuming-pack-manifest]

# Actuals (#2632) -- pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 24894    # chars/4 over files actually changed (99575 chars total, 9 files)
  tasks: 2
  commits: 3       # test(01-04) RED, feat(01-04) GREEN Python, feat(01-04) zod mirror + bridge + harness

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PACK_ID_PATTERN constant r'^pack-[a-z][a-z0-9-]*-\\d{4}-\\d{2}-\\d{2}$' -- IN-07 nominal form only, pas de validation calendrier"
    - "LICENSE_ID_PATTERN constant r'^[a-z0-9-]+$' -- kebab-digit envelope pour license_id"
    - "LicenseTerms = Literal[\"perpetual-one-time\"] -- closed gate structurel anti-subscription (LIC-01/02, critere ROADMAP n°4)"
    - "LicenseInfo model_validator(mode=\"after\") -- belt enforcing commercial_use == True AND attribution_required == False; gate + belt sur deux couches differentes"
    - "3 model_validators agreges SEPARES avec pydantic_core.ValidationError.from_exception_data + InitErrorDetails -- strategy collect-all Py analogue au superRefine TS"
    - "Mono-style via rsplit(\"@\", 1) + comparaison exacte (WR-01, D-02 #3) -- PAS de regex re-derivee susceptible de quirks d'ancrage $"
    - "IN-08 adjacency probe : doublons asset_id rejetes avec loc=[\"assets\", idx, \"asset_id\"] PAR duplicate, jamais fusion/deduplication silencieuse"
    - "make_pack() style_refs pinnés sur make_style_spec().style_version -- mono-style par construction, STY-03 consistency preserved"
    - "Path-asymmetry documentee : LicenseInfo superRefine utilise path=[] (vide) cote TS pour mirror le loc=(\"license\",) cote Py -- le path effectif est ["license"] quand imbriqué dans PackManifest"
    - "Schema-key parity verifie : Object.keys(PackManifestSchema.shape) == sorted(model_json_schema().properties)"

key-files:
  created:
    - "lottie_forge/domain/pack.py -- PackManifest + PackTotals + LicenseInfo + 3 model_validators agreges (collect-all via from_exception_data) + PACK_ID_PATTERN + LICENSE_ID_PATTERN"
    - "tests/domain/test_pack.py -- 53 tests (positive boundary 14 + rejection 27 + helpers 4 + determinism 1 + IN-07 explicit 1 + licence instantiation 6)"
    - "src/rpc/contracts/pack-manifest.schema.ts -- LicenseInfoSchema (z.literal + superRefine) + PackTotalsSchema + PackManifestSchema (strictObject nested AssetSpecSchema + superRefine collect-all) + types"
    - "src/rpc/contracts/pack-manifest.spec.ts -- bridge validate + re-emit + schema-key parity + 3 voies license (terms literal, commercial_use, attribution_required) + 10-case rejection test.each + IN-08 collect-all explicit"
    - "tests/bridge/test_pack_bridge.py -- test_export_pack + test_reimport_pack (skipif guard) + mono-style pin consistency + totals coherence + determinism probe + 10-case rejection parametrize + IN-08 collect-all bridge mirror"
    - "fixtures/rejection-cases/pack-manifest.json -- 10 shared rejection cases (IN-08 doublons, totals-compte, WR-01 mono-style, assets-vide, assets-51, license-terms, license-commercial-use-false, license-attribution-required-true, cost-eur, pack-id form)"
  modified:
    - "tests/bridge/fixtures.py -- make_pack() added (compose 2 assets mono-style par construction, totals coherents, license perpetuelle valide); _make_asset_for_pack() helper pour shape_group_names constant"
    - "tests/bridge/rejection_loader.py -- CONTRACT_FILES etendu avec cle 'pack-manifest' (D-06)"
    - "src/rpc/contracts/rejection-cases.ts -- CONTRACT_FILES etendu avec cle 'pack-manifest' (D-06)"

key-decisions:
  - "PACK_ID_PATTERN = r'^pack-[a-z][a-z0-9-]*-\\d{4}-\\d{2}-\\d{2}$' -- forme nominale seulement, PAS de validation calendrier (IN-07). Une date impossible comme 13e mois est acceptee si la forme matche, documente par test explicite test_pack_id_calendar_impossible_date_accepted_in07"
  - "LicenseTerms = Literal[\"perpetual-one-time\"] -- closed gate structurel anti-subscription. Une licence abonnement (subscription-monthly/yearly/free/empty) est REJETEE a l'instanciation (avant meme le validateur)"
  - "LicenseInfo model_validator belt : commercial_use == True ET attribution_required == False -- la gate (Literal) + la ceinture (validateur) operent sur 2 couches differentes, toutes deux bloquent les formes abonnement"
  - "3 validateurs pack SEPARES (un invariant chacun) avec collect-all via pydantic_core.ValidationError.from_exception_data + InitErrorDetails -- permet la parite de chemin d'erreur avec le superRefine TS (loc=["assets", idx, \"asset_id\"] vs path:[\"assets\", idx, \"asset_id\"])"
  - "IN-08 emit one issue PER duplicate index (collect-all) : le doublon (idx=N) ET l'original (idx=first_idx) sont tous deux signales -- jamais une seule issue agregee, jamais de deduplication silencieuse"
  - "Mono-style via rsplit(\"@\", 1) + comparaison exacte (WR-01) -- symetrie TS via style_ref.split(\"@\").pop(). Aucune regex re-derivee cote Py ou TS"
  - "make_pack() style_refs pinnés sur make_style_spec().style_version -- mono-style par construction ; la gate de re-validation STY-03 Phase 2 reste coherente avec les fixtures precedentes"
  - "Path-asymmetry documentee pour LicenseInfo : standalone -> loc=() / path=[], dans PackManifest -> loc=(\"license\",) / path=[\"license\"]. Le harness de rejet partage utilise loc=[\"license\"] (la voie imbriquee, qui est le cas frequent en pratique)"
  - "MakePack avec 2 assets (a-001, a-002) + cost_eur fractionnaire 0.5 + first_pass_yield 0.75 (mid-range) -- valeurs boundary-safe pour determinisme byte-identique (fractional floats pour Py/JS format parity)"
  - "Bridge ordered chain verte : 15 export + 85 vitest (20 pack-manifest + 65 autres) + 329 pytest (53 pack + 276 autres) -- tous exit 0, 0 skipped"

requirements-completed: [DM-04, DM-05]

# Coverage metadata (#1602) -- one entry per shipped deliverable. Drives DETERMINISTIC UAT routing in verify-work.
coverage:
  - id: D1
    description: "PackManifest Pydantic strict contract avec PackTotals + LicenseInfo structurelle (Literal + validateur anti-subscription), pack_id forme nominale IN-07, assets 1..50, mono-style gate (WR-01 rsplit)"
    requirement: DM-04
    verification:
      - kind: unit
        ref: "tests/domain/test_pack.py#test_reference_fixture_is_accepted"
        status: pass
      - kind: unit
        ref: "tests/domain/test_pack.py#test_license_info_valid_envelope_is_accepted"
        status: pass
      - kind: unit
        ref: "tests/domain/test_pack.py#test_pack_id_nominal_form_is_accepted[pack-nature-2026-03-15|pack-n-2026-01-01|pack-foo-bar-baz-2025-12-31|pack-x-2026-13-45]"
        status: pass
      - kind: unit
        ref: "tests/domain/test_pack.py#test_pack_id_calendar_impossible_date_accepted_in07"
        status: pass
      - kind: unit
        ref: "tests/domain/test_pack.py#test_assets_length_bounds_accepted[1|25|50]"
        status: pass
      - kind: unit
        ref: "tests/domain/test_pack.py#test_totals_cost_eur_bounds_accepted[0.0|1000.0|0.5|999.99]"
        status: pass
      - kind: unit
        ref: "tests/domain/test_pack.py#test_totals_first_pass_yield_bounds_accepted[0.0|1.0|0.5|0.75]"
        status: pass
    human_judgment: false
  - id: D2
    description: "LicenseInfo structurelle anti-subscription (LIC-01/02) -- 3 voies de rejet : terms literal hors abonnement, commercial_use=False, attribution_required=True. Une licence abonnement est impossible a construire."
    requirement: DM-04
    verification:
      - kind: unit
        ref: "tests/domain/test_pack.py#test_license_terms_outside_literal_is_rejected[subscription-monthly|subscription-yearly|free|'']"
        status: pass
      - kind: unit
        ref: "tests/domain/test_pack.py#test_license_commercial_use_false_is_rejected"
        status: pass
      - kind: unit
        ref: "tests/domain/test_pack.py#test_license_attribution_required_true_is_rejected"
        status: pass
      - kind: unit
        ref: "tests/domain/test_pack.py#test_license_info_constructor_rejects_subscription_terms"
        status: pass
      - kind: unit
        ref: "tests/domain/test_pack.py#test_license_info_constructor_rejects_commercial_use_false"
        status: pass
      - kind: unit
        ref: "tests/domain/test_pack.py#test_license_info_constructor_rejects_attribution_required_true"
        status: pass
    human_judgment: false
  - id: D3
    description: "PackManifest rejection suite -- pack_id wrong form, assets vide/51, totals.asset_count mismatch, cost_eur hors bornes, first_pass_yield hors bornes, doublons asset_id (IN-08 collect-all), mono-style mismatch (WR-01)"
    requirement: DM-04
    verification:
      - kind: unit
        ref: "tests/domain/test_pack.py#test_pack_id_wrong_form_is_rejected[pack-nature-2026-03-15-extra|Pack-nature-2026-03-15|pack-Nature-2026-03-15|1pack-nature-2026-03-15|pack--2026-03-15|pack-nature-2026-3-15|'']"
        status: pass
      - kind: unit
        ref: "tests/domain/test_pack.py#test_assets_empty_is_rejected"
        status: pass
      - kind: unit
        ref: "tests/domain/test_pack.py#test_assets_above_max_length_is_rejected"
        status: pass
      - kind: unit
        ref: "tests/domain/test_pack.py#test_totals_asset_count_mismatch_is_rejected"
        status: pass
      - kind: unit
        ref: "tests/domain/test_pack.py#test_totals_cost_eur_out_of_range_is_rejected[-0.01|-1.0|1000.01|1001.0]"
        status: pass
      - kind: unit
        ref: "tests/domain/test_pack.py#test_totals_first_pass_yield_out_of_range_is_rejected[-0.1|-0.01|1.1|1.01]"
        status: pass
      - kind: unit
        ref: "tests/domain/test_pack.py#test_duplicate_asset_id_is_rejected_in08"
        status: pass
      - kind: unit
        ref: "tests/domain/test_pack.py#test_triple_duplicate_asset_id_yields_one_issue_per_pair_in08"
        status: pass
      - kind: unit
        ref: "tests/domain/test_pack.py#test_mono_style_mismatch_is_rejected_wr01"
        status: pass
      - kind: unit
        ref: "tests/domain/test_pack.py#test_mono_style_valid_when_suffix_matches_style_version_wr01"
        status: pass
    human_judgment: false
  - id: D4
    description: "Determinisme byte-identique (critere ROADMAP n°5) -- deux PackManifest de contenu egal construits independamment produisent model_dump_json() byte-identique"
    requirement: DM-04
    verification:
      - kind: unit
        ref: "tests/domain/test_pack.py#test_two_constructs_with_equal_content_serialize_byte_identical_determinism"
        status: pass
      - kind: unit
        ref: "tests/bridge/test_pack_bridge.py#test_two_constructs_with_equal_content_serialize_byte_identical_determinism"
        status: pass
    human_judgment: false
  - id: D5
    description: "PackManifest zod strictObject mirror avec LicenseInfo (z.literal + superRefine), 3 superRefine collect-all symetriques au Py, paths ['assets', idx, 'asset_id'/'style_ref'] / ['totals', 'asset_count'] / ['license']"
    requirement: DM-05
    verification:
      - kind: unit
        ref: "src/rpc/contracts/pack-manifest.spec.ts#exposes the locked regex constants (parity contract)"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/pack-manifest.spec.ts#preserves schema-key parity with the Pydantic model_json_schema()"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/pack-manifest.spec.ts#rejects a subscription license at instantiation (gate + belt)"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/pack-manifest.spec.ts#rejects commercial_use=false (belt, path [] standalone)"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/pack-manifest.spec.ts#rejects attribution_required=true (belt, path [] standalone)"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/pack-manifest.spec.ts#accepts a well-formed perpetual license"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/pack-manifest.spec.ts#rejects PackTotals out-of-bounds (cost_eur)"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/pack-manifest.spec.ts#rejects PackTotals out-of-bounds (first_pass_yield)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Bridge chain pack-manifest verte (pytest -k export -> npx vitest run -> pytest -k reimport) avec skipif guard d'ordre, byte-identical JSON artifacts"
    requirement: DM-05
    verification:
      - kind: unit
        ref: "tests/bridge/test_pack_bridge.py#test_export_pack"
        status: pass
      - kind: unit
        ref: "tests/bridge/test_pack_bridge.py#test_reimport_pack"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/pack-manifest.spec.ts#validates and re-emits the Python-exported PackManifest"
        status: pass
      - kind: unit
        ref: "tests/bridge/test_pack_bridge.py#test_pack_assets_style_refs_are_pinned_to_pack_style_version"
        status: pass
      - kind: unit
        ref: "tests/bridge/test_pack_bridge.py#test_pack_totals_asset_count_matches_assets_length"
        status: pass
      - kind: unit
        ref: "tests/bridge/test_pack_bridge.py#test_in08_duplicate_asset_id_collect_all_on_bridge"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/pack-manifest.spec.ts#IN-08 collect-all: duplicate asset_id yields one issue per index"
        status: pass
    human_judgment: false
  - id: D7
    description: "Rejection harness pack-manifest mirror (D-06/D-08) -- fixtures/rejection-cases/pack-manifest.json (10 cas) consommé par pytest parametrize ET vitest test.each"
    requirement: DM-05
    verification:
      - kind: unit
        ref: "tests/bridge/test_pack_bridge.py#test_bridge_rejection_case[in08-doublons-asset-id]"
        status: pass
      - kind: unit
        ref: "tests/bridge/test_pack_bridge.py#test_bridge_rejection_case[totals-compte-incoherent]"
        status: pass
      - kind: unit
        ref: "tests/bridge/test_pack_bridge.py#test_bridge_rejection_case[mono-style-mismatch]"
        status: pass
      - kind: unit
        ref: "tests/bridge/test_pack_bridge.py#test_bridge_rejection_case[assets-vide]"
        status: pass
      - kind: unit
        ref: "tests/bridge/test_pack_bridge.py#test_bridge_rejection_case[assets-51]"
        status: pass
      - kind: unit
        ref: "tests/bridge/test_pack_bridge.py#test_bridge_rejection_case[license-terms-hors-literal]"
        status: pass
      - kind: unit
        ref: "tests/bridge/test_pack_bridge.py#test_bridge_rejection_case[license-commercial-use-false]"
        status: pass
      - kind: unit
        ref: "tests/bridge/test_pack_bridge.py#test_bridge_rejection_case[license-attribution-required-true]"
        status: pass
      - kind: unit
        ref: "tests/bridge/test_pack_bridge.py#test_bridge_rejection_case[cost-eur-hors-bornes]"
        status: pass
      - kind: unit
        ref: "tests/bridge/test_pack_bridge.py#test_bridge_rejection_case[pack-id-forme-invalide]"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/pack-manifest.spec.ts#in08-doublons-asset-id -> zod rejects the shared payload"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/pack-manifest.spec.ts#totals-compte-incoherent -> zod rejects the shared payload"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/pack-manifest.spec.ts#mono-style-mismatch -> zod rejects the shared payload"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/pack-manifest.spec.ts#assets-vide -> zod rejects the shared payload"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/pack-manifest.spec.ts#assets-51 -> zod rejects the shared payload"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/pack-manifest.spec.ts#license-terms-hors-literal -> zod rejects the shared payload"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/pack-manifest.spec.ts#license-commercial-use-false -> zod rejects the shared payload"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/pack-manifest.spec.ts#license-attribution-required-true -> zod rejects the shared payload"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/pack-manifest.spec.ts#cost-eur-hors-bornes -> zod rejects the shared payload"
        status: pass
      - kind: unit
        ref: "src/rpc/contracts/pack-manifest.spec.ts#pack-id-forme-invalide -> zod rejects the shared payload"
        status: pass
    human_judgment: false
  - id: D8
    description: "Static gates verts (ruff check, biome check, tsc --noEmit) sur l'ensemble du dépot ; 329 pytest + 85 vitest + chain bridge pack-manifest verte"
    requirement: DM-05
    verification:
      - kind: unit
        ref: ".venv/Scripts/python.exe -m ruff check ."
        status: pass
      - kind: unit
        ref: "npx @biomejs/biome check ."
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: unit
        ref: "uv run python -m pytest tests/ -q"
        status: pass
      - kind: unit
        ref: "npx vitest run"
        status: pass
    human_judgment: false

# Metrics
duration: 33 min
completed: 2026-08-29
status: complete
---

# Phase 1 Plan 04: PackManifest + licence structurelle + 3 validateurs collect-all + déterminisme Summary

**PackManifest strict contract locked end-to-end (Pydantic strict + zod strictObject nested mirror) with LicenseInfo structurelle anti-subscription (Literal + validateur belt) and 3 collect-all validateurs (IN-08 doublons / coherence compte / WR-01 mono-style). Bridge chain pack-manifest verte (pytest -k export -> vitest -> pytest -q), 10 shared rejection cases (pytest parametrize + vitest test.each), determinisme byte-identique prouve des deux cotes.**

## Performance

- **Duration:** 33 min
- **Started:** 2026-08-29T21:00:00Z
- **Completed:** 2026-08-29T21:33:29Z
- **Tasks:** 2 (T-1 PackManifest + LicenseInfo TDD RED+GREEN, T-2 zod mirror + bridge + 10-cas rejection harness)
- **Files modified:** 6 created, 3 modified (9 total)
- **Tests:** 329 pytest passed (was 276, +53 from test_pack.py), 85 vitest passed (was 65, +20 from pack-manifest.spec.ts), 0 skipped

## Accomplishments

- **PackManifest Pydantic strict** : `pack_id` regex `^pack-[a-z][a-z0-9-]*-\d{4}-\d{2}-\d{2}$` forme nominale (IN-07, pas de validation calendrier) ; `style_version` regex `^\d+\.\d+\.\d+$` (mono-style gate) ; `assets: list[AssetSpec] 1..50` ; `totals: PackTotals` nested strict ; `license: LicenseInfo` structurel. STRICT_CONFIG partout, extra=forbid + strict=True.
- **LicenseInfo structurelle anti-subscription (LIC-01/02)** : `license_id: ^[a-z0-9-]+$` ; `terms: Literal["perpetual-one-time"]` (gate) ; `commercial_use: bool` + `attribution_required: bool` + `model_validator(mode="after")` belt imposant commercial_use==True ET attribution_required==False. Une licence abonnement (`"subscription-monthly"`, `"subscription-yearly"`, `"free"`, etc.) est REJETEE à l'instanciation des deux côtés. Criterion ROADMAP n°4 satisfait.
- **PackTotals nested strict** : `asset_count: int >= 1` ; `cost_eur: float 0..1000` ; `first_pass_yield: float 0..1`. Strict partout, pas de coercion numérique (`-0.5` ou `1500.0` rejetés avec `loc=["totals","cost_eur"]`).
- **3 validateurs agrégés séparés** : un invariant chacun, message pinpoint, stratégie collect-all via `pydantic_core.ValidationError.from_exception_data` + `InitErrorDetails` portant les loc exactes. L'ordre compte — compte coherence d'abord (cheap short-circuit), puis unicité IN-08 (one issue per duplicate), puis mono-style WR-01 (rsplit + comparaison exacte, no regex).
- **IN-08 adjacency probe lock** : 2 doublons `a-001` produisent issues à la fois `("assets", 0, "asset_id")` ET `("assets", 1, "asset_id")` ; 3 doublons produisent issues à `("assets", 1, "asset_id")` ET `("assets", 2, "asset_id")`. Jamais une seule issue agrégée, jamais de deduplication silencieuse, jamais de fusion.
- **WR-01 mono-style lock** : `style_ref.rsplit("@", 1)[1] != style_version` du pack -> rejeté avec `loc=("assets", idx, "style_ref")`. Symétrie TS via `style_ref.split("@").pop()`. Aucune regex re-dérivée.
- **IN-07 lock explicite** : `pack-x-2026-13-45` (13e mois, 45e jour) ACCEPTÉ. Test dédié `test_pack_id_calendar_impossible_date_accepted_in07` documentant le comportement. La forme regex prime sur la validité calendrier — mirror en zod impossible sans calendar library.
- **Mirror zod strictObject** : `PackManifestSchema` (z.strictObject nested) avec `LicenseInfoSchema` + `PackTotalsSchema` + `AssetSpecSchema` (réutilisé ADR-03). `z.literal("perpetual-one-time")` est la gate, `.superRefine` la belt. Path-asymmetry documentée : `superRefine` sur LicenseInfo utilise `path: []` pour mirror le `loc=("license",)` côté Py (quand imbriqué dans PackManifest).
- **make_pack() helper** : single source of fixture truth pour la chaîne bridge pack. Compose 2 assets avec `asset_id` distincts et `style_ref` pinné sur `make_style_spec().style_version` (mono-style par construction). `totals.asset_count == len(assets)` enforced. License perpetuelle valide.
- **Bridge ordered chain verte** : `pytest -k export` écrit `fixtures/bridge/pack-manifest.from-python.json` + `pack-manifest.schema-keys.json` → `npx vitest run pack-manifest` valide/re-émet `pack-manifest.from-ts.json` → `pytest -k reimport` re-valide strict. Skipif guard sur `pack-manifest.from-ts.json` manquant — chaîne lockstep CI, jamais de skip silencieux (§4.2).
- **Schema-key parity** : `Object.keys(PackManifestSchema.shape)` == sorted(`model_json_schema().properties`) asserted via `pack-manifest.schema-keys.json`.
- **Rejection harness partagé (D-06/D-08)** : `fixtures/rejection-cases/pack-manifest.json` (10 cas : in08-doublons-asset-id, totals-compte-incoherent, mono-style-mismatch, assets-vide, assets-51, license-terms-hors-literal, license-commercial-use-false, license-attribution-required-true, cost-eur-hors-bornes, pack-id-forme-invalide) consommé par pytest parametrize ET vitest test.each. Paths assertés via appartenance (D-08), jamais via texte de message.
- **Sonde déterminisme byte-identique** : `tests/domain/test_pack.py::test_two_constructs_with_equal_content_serialize_byte_identical_determinism` (Py domain) + `tests/bridge/test_pack_bridge.py::test_two_constructs_with_equal_content_serialize_byte_identical_determinism` (Py bridge) — deux constructions indépendantes du même `PackManifest` produisent `model_dump_json()` byte-identique (critère ROADMAP n°5, §4.1 #6).
- **TDD cycle documenté** : commit `37d59b9` (test RED avec ModuleNotFoundError) → commit `d25c336` (feat GREEN Python, 53 tests pack passent) → commit `f54d168` (feat zod mirror + bridge + 10-cas harness). Les trois commits sont visibles dans `git log`.
- **Static gates verts** : ruff check, biome check, tsc --noEmit, pytest -q, vitest run, ordered bridge chain — tous exit 0.

## Task Commits

Each task was committed atomically (D-09 direct-on-main):

1. **Task 1a: PackManifest domain test suite (TDD RED)** — `37d59b9` (test)
2. **Task 1b: PackManifest + LicenseInfo + 3 validateurs + déterminisme (TDD GREEN)** — `d25c336` (feat)
3. **Task 2: PackManifest zod mirror + bridge + 10-cas rejection harness + biome formatting** — `f54d168` (feat)

## Files Created/Modified

### Created (6)

- `lottie_forge/domain/pack.py` — PackManifest + PackTotals + LicenseInfo + 2 pattern constants (PACK_ID_PATTERN, LICENSE_ID_PATTERN) + 3 model_validators agreges via pydantic_core.ValidationError.from_exception_data
- `tests/domain/test_pack.py` — 53 tests (positive boundary 14 + rejection 27 + helpers 4 + determinism 1 + IN-07 explicit 1 + licence instantiation 6)
- `src/rpc/contracts/pack-manifest.schema.ts` — LicenseInfoSchema (z.literal + superRefine) + PackTotalsSchema + PackManifestSchema (strictObject nested AssetSpecSchema + superRefine collect-all) + types
- `src/rpc/contracts/pack-manifest.spec.ts` — bridge validate + re-emit + schema-key parity + 3 voies license (terms literal, commercial_use, attribution_required) + 10-case rejection test.each mirror + IN-08 collect-all explicit
- `tests/bridge/test_pack_bridge.py` — test_export_pack + test_reimport_pack (skipif guard) + mono-style pin consistency + totals coherence + determinism probe + 10-case rejection parametrize + IN-08 collect-all bridge mirror
- `fixtures/rejection-cases/pack-manifest.json` — 10 shared rejection cases (IN-08 / WR-01 / LIC-01 / DM-04)

### Modified (3)

- `tests/bridge/fixtures.py` — make_pack() added (compose 2 assets mono-style par construction) + _make_asset_for_pack() helper
- `tests/bridge/rejection_loader.py` — CONTRACT_FILES etendu avec cle 'pack-manifest' (D-06)
- `src/rpc/contracts/rejection-cases.ts` — CONTRACT_FILES etendu avec cle 'pack-manifest' (D-06)

## Decisions Made

- **PACK_ID_PATTERN** = `r"^pack-[a-z][a-z0-9-]*-\d{4}-\d{2}-\d{2}$"` — forme nominale SEULEMENT (IN-07). Une date calendar-impossible (`2026-13-45`) est acceptée par construction. La validation calendrier en zod demanderait une calendar library — out-of-scope Phase 1. Documenté par test explicite `test_pack_id_calendar_impossible_date_accepted_in07` avec keyword `in07` pour le harness `-k`.
- **LicenseTerms = Literal["perpetual-one-time"]** — closed gate structurel anti-subscription. Toutes les formes abonnement (`subscription-monthly`, `subscription-yearly`, `free`, `""`) REJETÉES à l'instanciation avant même que le validateur (belt) ne s'exécute. Criterion ROADMAP n°4 verrouillé structuralement.
- **LicenseInfo model_validator (belt)** — commercial_use == True ET attribution_required == False. La gate (Literal) + la belt (validateur) opèrent sur 2 couches différentes ; une subscription ne peut pas être construite par les deux voies.
- **3 validateurs agrégés séparés** — un invariant chacun, message pinpoint. Pas de validateur combiné qui retournerait un seul message d'erreur général. Le compte coherence est vérifié d'abord (cheap short-circuit), puis l'unicité IN-08 (one issue per duplicate), puis mono-style WR-01. Ordre = performance + debuggabilité.
- **IN-08 emit one issue PER duplicate index (collect-all)** — le doublon ET l'original sont signalés (`("assets", N, "asset_id")` ET `("assets", first_idx, "asset_id")`). Le cas triple-duplicate produit 2 issues (`("assets", 1, ...)` + `("assets", 2, ...)`), pas une agrégée. Jamais de deduplication silencieuse, jamais de fusion.
- **Mono-style via rsplit("@", 1) + comparaison exacte (WR-01)** — symétrie TS via `style_ref.split("@").pop()`. Aucune regex re-dérivée (le `^` anchor de Python `re` et le `$` anchor de zod peuvent diverger en pratique, le `rsplit + exact ==` est immune à ces quirks).
- **make_pack() style_refs pinnés sur make_style_spec().style_version** — mono-style par construction. La gate de re-validation STY-03 Phase 2 reste cohérente avec les fixtures précédentes (StyleSpec 01-01, AssetSpec 01-03).
- **Path-asymmetry documentée** — pour LicenseInfo : standalone -> Py `loc=()` / TS `path=[]`, dans PackManifest -> Py `loc=("license",)` / TS `path=["license"]`. Le harness de rejet partage utilise la voie imbriquée (cas fréquent en pratique) avec `expect_paths: [["license"]]`. Test standalone dans `pack-manifest.spec.ts` vérifie `path: []` pour mirror le `loc=()` Py.
- **MakePack avec 2 assets + cost_eur 0.5 + first_pass_yield 0.75** — valeurs boundary-safe. Fractional floats pour Py/JS format parity (`0.5` sérialise identiquement des deux côtés, `0.75` aussi). `asset_count=2` est trivialement le double, simplifie le test determinism.

## Deviations from Plan

Two auto-fixes applied during execution:

### Auto-fixed Issues

**1. [Rule 1 - Bug] LicenseInfo validator returned None when commercial_use=False or attribution_required=True**
- **Found during:** Task 1 GREEN (first pytest run after implementing `lottie_forge/domain/pack.py`)
- **Issue:** The `@model_validator(mode="after")` `_terms` function had its `return self` line **indented inside the `if self.attribution_required is not False:` block**, so when the check passed (valid license), the function correctly returned `self`, but when ANY of the two checks failed, the function fell through without a return — returning `None` implicitly. Pydantic then built the model from the validator's return value, treating `None` as a successful validation (with all subsequent field access crashing).
- **Fix:** Moved `return self` out of the inner `if` block to the function level. The validator now always returns `self` (or raises `ValueError`). Verified by `test_license_info_constructor_rejects_*` — all 3 reject-via-validateur cases now correctly raise `ValidationError`.
- **Files modified:** `lottie_forge/domain/pack.py`
- **Verification:** 53 pytest pack tests pass; LicenseInfo constructor rejects commercial_use=False, attribution_required=True, and subscription-monthly at instantiation.
- **Committed in:** `d25c336` (T-1 feat commit)

**2. [Rule 1 - Bug] Zod superRefine path nested under parent field name — `["license", "license"]` instead of `["license"]`**
- **Found during:** Task 2 zod mirror first vitest run after implementing `pack-manifest.schema.ts`
- **Issue:** `LicenseInfoSchema.superRefine` initially used `path: ["license"]` for the commercial_use/attribution_required issues. But zod prefixes the parent field name automatically, producing an effective path of `["license", "license"]` when LicenseInfo sits inside PackManifest. The Python equivalent (validator on the LicenseInfo model) yields `loc=("license",)` because the Python validator is rooted at LicenseInfo itself (not nested under PackManifest).
- **Fix:** Changed `path: ["license"]` to `path: []` in LicenseInfoSchema's superRefine. The effective zod path becomes `["license"]` (parent field name prepended), matching the Python `loc=("license",)`. The standalone LicenseInfoSchema test (no parent) asserts `path: []`, mirroring the Python `loc=()`.
- **Files modified:** `src/rpc/contracts/pack-manifest.schema.ts` + `src/rpc/contracts/pack-manifest.spec.ts` (added explicit path-asymmetry comment)
- **Verification:** 20 vitest tests pass; rejection harness 10/10 cases green.
- **Committed in:** `f54d168` (T-2 feat commit)

**3. [Rule 3 - Blocking] `assets-51` rejection case had only 1 asset, not 51**
- **Found during:** Task 2 first vitest run after rejection harness JSON load
- **Issue:** The `assets-51` rejection case in `fixtures/rejection-cases/pack-manifest.json` was written with a single asset payload — the case passed validation (1 asset is within the 1..50 envelope) instead of being rejected by the `max_length: 50` bound. The vitest assertion `expect(result.success).toBe(false)` failed.
- **Fix:** Expanded the case payload to all 51 assets (`a-001` through `a-051`), each with the same shape_group_names / content_hashes / style_ref. Added `expect_paths: [["assets"]]` for the path membership assertion. The `assets-51` case now genuinely triggers the `max_length: 50` bound on both sides.
- **Files modified:** `fixtures/rejection-cases/pack-manifest.json`
- **Verification:** 10/10 vitest rejection harness cases pass; the bridge pytest parametrize also rejects this payload with `loc=["assets"]`.
- **Committed in:** `f54d168` (T-2 feat commit)

---

**Total deviations:** 3 auto-fixed (3 bugs — wrong validator return, wrong zod path, malformed rejection case)
**Impact on plan:** All auto-fixes necessary for correctness — the validator was structurally broken (returning None instead of raising), the zod path was structurally misaligned with Py, and the rejection case didn't exercise the bound it claimed to. No scope creep.

## Issues Encountered

- **`return self` indentation trap** — easy to put the `return` inside an `if` block by reflex, and Python silently returns `None` instead of raising `ValueError`. Pydantic treats `None` as a successful validation, producing a "NoneType has no attribute X" error far from the root cause. Lesson: always put `return self` at the function level for `@model_validator(mode="after")`.
- **Zod `superRefine` path nesting** — zod prefixes the parent field name on issues added by `.superRefine` inside a nested schema. Using `path: ["license"]` inside `LicenseInfoSchema` (nested in `PackManifestSchema.license`) produces `["license", "license"]`, not `["license"]`. The fix is to use `path: []` in the nested superRefine and let zod prepend the parent field name — which matches the Python `loc=("license",)` for the same validator path.
- **Large fixture file** — `assets-51` case is 51 asset payloads (~16 KB). Hand-writing them is tedious but it's the right thing for the shared JSON (single source of truth, D-06). A Python helper that emits this JSON would be over-engineering for a 1-shot test case.
- **Biome formatting** — the initial `pack-manifest.schema.ts` had one formatting violation (multi-line `message:` formatting). Fixed via `npx @biomejs/biome check . --write` before the final commit.

## Authentication Gates

None - no external service credentials required for this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 01-04 completes the PackManifest layer (DM-04, LIC-01/02) on top of StyleSpec (01-01), MotionRecipe (01-02) and AssetSpec (01-03). Next plans in the wave:

- **01-05 (CI verify.yml + README)** — adds the 10-step ordered CI workflow + zero-skip junitxml assertion. All green from this plan: `ruff`, `biome`, `tsc --noEmit`, `pytest -k export` (15), `npx vitest run` (85), `pytest -q` (329). The PackManifest bridge (53 + 20 = 73 tests) is part of that green baseline.

Phase 1 criterion #3 (DM-04 PackManifest) is satisfied from this plan : unicité, compte, mono-style, totals, licence — tous validés des deux côtés avec probes empty/encoding/mismatch/doublons résolus en critères testés.

Phase 1 criterion #4 (anti-subscription structurelle) is satisfied from this plan : la licence perpétuelle one-time est la SEULE forme constructible, Literal + validateur belt, gate + belt sur 2 couches différentes.

Phase 1 criterion #5 (DM-05 bridge parité) gains the PackManifest contract on top of the StyleSpec + MotionRecipe + AssetSpec contracts : 4 zod mirrors now in lockstep, 4 shared rejection JSONs, 1 ordered bridge chain.

Le jeu de contrats Phase 1 est COMPLET : 4 contrats (StyleSpec, MotionRecipe, AssetSpec, PackManifest) tous livrés avec Pydantic strict + zod strictObject mirror + bridge chain verte + rejection harness partagé + static gates verts.

---

## Self-Check: PASSED

- All 6 created key files verified on disk (`lottie_forge/domain/pack.py`, `tests/domain/test_pack.py`, `src/rpc/contracts/pack-manifest.schema.ts`, `src/rpc/contracts/pack-manifest.spec.ts`, `tests/bridge/test_pack_bridge.py`, `fixtures/rejection-cases/pack-manifest.json`).
- All 3 modified key files verified (`tests/bridge/fixtures.py`, `tests/bridge/rejection_loader.py`, `src/rpc/contracts/rejection-cases.ts`).
- All 3 commits verified in git log (`37d59b9`, `d25c336`, `f54d168`).
- Ordered bridge chain green from clean state: `pytest -k export` (15 passed) → `npx vitest run` (85 passed) → `pytest -q` (329 passed, 0 skipped).
- Static gates: `npx tsc --noEmit` clean · `ruff check .` all checks passed · `npx @biomejs/biome check .` no fixes applied.
- `fixtures/bridge/` artifacts gitignored (`pack-manifest.from-python.json` + `pack-manifest.from-ts.json` + `pack-manifest.schema-keys.json` generated, not tracked) — `git check-ignore -v` exits 0 on all three.
- `fixtures/rejection-cases/pack-manifest.json` committed (D-07) — 10 shared rejection cases covering IN-08 doublons, WR-01 mono-style, LIC-01 license (3 voies), DM-04 totals/assets/pack_id form.
- The 10 case_ids present in pytest bridge suite AND vitest test.each — same case_id namespace across both sides (D-06).
- Plan's `requirements: [DM-04, DM-05]` — DM-04 covered by PackManifest positive boundary + comprehensive rejection suite + LicenseInfo structurelle + 3 collect-all validateurs + déterminisme byte-identique; DM-05 covered by zod strictObject mirror + schema-key parity + bridge ordered chain + rejection harness + static gates.
- `pytest -k license` 11/11 pass ; `pytest -k in08` 2/2 pass ; `pytest -k wr01` 2/2 pass ; `pytest -k determinism` 1/1 pass ; `pytest -k in07` 1/1 pass.
- LicenseInfo 3 voies de rejet testées au niveau constructeur standalone (instantiation impossible) ET au niveau PackManifest (validation impossible) — gate + belt symmetry.

---

*Phase: 01-contrats-de-donn-es-fronti-re-pydantic-zod-reconstruction*
*Completed: 2026-08-29*
