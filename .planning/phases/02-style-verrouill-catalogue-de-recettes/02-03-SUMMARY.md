---
phase: 02-style-verrouill-catalogue-de-recettes
plan: 03
subsystem: contracts / bridge / rejection-harness
tags:
  - pydantic
  - zod
  - mirror-contract
  - content-hashes
  - bridge-chain
  - same-commit
  - d-16
  - d-18
  - sty-01
  - mot-04
requires:
  - 02-01 # sha256_hex + normalize_lf single implementation; ThemeAnchorId
  - 02-02 # StyleRefinement same-commit rhythm locked into this phase
provides:
  - ContentHashes Pydantic 4-champ clos
  - ContentHashesSchema zod strictObject 4-champ
  - make_asset override optionnel content_hashes=None
  - _make_asset_for_pack 4-hash
  - harnais de rejet étendu (23 cas asset-spec, 10 cas pack-manifest migrés)
affects:
  - lottie_forge/domain/asset.py
  - src/rpc/contracts/asset-spec.schema.ts
  - tests/bridge/fixtures.py
  - fixtures/rejection-cases/asset-spec.json
  - fixtures/rejection-cases/pack-manifest.json
  - tests/domain/test_asset.py
  - tests/domain/test_pack.py
  - tests/bridge/test_asset_bridge.py
  - tests/bridge/test_pack_bridge.py
  - src/rpc/contracts/asset-spec.spec.ts
  - src/rpc/contracts/pack-manifest.spec.ts
tech-stack:
  added: []
  patterns:
    - ContentHashes clos 4-champ {svg_sha256, lottie_sha256, style_sha256, catalogue_sha256} ; Sha256Hex réutilisé, second type interdit (D-16)
    - extension same-commit §4.14 des deux côtés (asset.py + asset-spec.schema.ts) pour AssetSpec -- 5e clé future (dotlottie_sha256 Phase 8) refusée par extra=forbid/strictObject
    - make_asset(content_hashes=None) override optionnel consommé par 02-06 ; placeholder deterministe tant que les vrais sha ne sont pas branchés
    - migration de données pack-manifest.json 2->4 champs en gardant UN seul mutation ciblée par cas (signature collect-all IN-08/DM-04/WR-01/LIC-01 préservée)
    - path-asymmetry Pydantic/zod documentée pour extra-keys (rejection-only sur le harnais, comme dm03-content-hashes-champ-extra Phase 1)
actuals:
  tokens: 17448
  tasks: 2
  commits: 2
key-files:
  created: []
  modified:
    - lottie_forge/domain/asset.py
    - src/rpc/contracts/asset-spec.schema.ts
    - tests/bridge/fixtures.py
    - fixtures/rejection-cases/asset-spec.json
    - fixtures/rejection-cases/pack-manifest.json
    - tests/domain/test_asset.py
    - tests/domain/test_pack.py
    - tests/bridge/test_pack_bridge.py
    - src/rpc/contracts/asset-spec.spec.ts
    - src/rpc/contracts/pack-manifest.spec.ts
key-decisions:
  - sha256_hex (lottie_forge/loading/style.py, plan 02-01) est la source unique du régime de hash D-02/D-03 ; aucun nouveau type n'est introduit dans ContentHashes, le Sha256Hex existant (pattern ^[a-f0-9]{64}$, min/max_length 64) est réutilisé tel quel pour les 4 champs.
  - extension same-commit §4.14 appliquée strictement (asset.py + asset-spec.schema.ts édités dans le même plan) ; la preuve de l'inviolabilité du verrou est le test dm03-content-hashes-5e-cle qui injecte dotlottie_sha256 et est rejeté par extra=forbid des deux côtés.
  - make_asset() expose un override optionnel content_hashes=None : la single source of fixture truth reste préservée, les appels existants (3 call sites : test_asset_bridge, test_pack_bridge, test_pack.py) restent byte-identiques par défaut, et plan 02-06 peut passer les vrais sha (sha256_hex(style.yaml) + sha256_hex(catalogue.json)) via ce paramètre sans dupliquer un second builder ; fixtures.py n'importe pas les loaders (pas de dépendance fixtures -> produit).
  - _make_asset_for_pack helper consommé par make_pack doit aussi passer aux 4 champs, sinon la construction de PackManifest lève une ValidationError dès make_pack() et le test d'export pack-manifest rougit.
  - migration des payloads pack-manifest.json : les mêmes deux littéraux deterministes 64-hex (fedcba9876543210*4, abcdef0123456789*4) sont utilisés pour style_sha256/catalogue_sha256 dans CHAQUE asset inline -- cohérence de la fixture truth ; chaque cas garde exactement UNE mutation ciblée (doublon asset_id pour in08, totals.asset_count faux pour totals-compte-incoherent, style_ref version mismatch pour mono-style-mismatch, etc.), les expect_paths d'origine sont préservés.
  - dm03-content-hashes-5e-cle en rejection-only (sans expect_paths) -- même convention que dm03-content-hashes-champ-extra Phase 1 : path-asymmetry documentée dans 02-PATTERNS (Pydantic field-level loc ≠ zod parent-object loc pour z.strictObject unrecognizedKeys).
  - trois cas as01-style-hash-uppercase / as02-catalogue-hash-short / as03-catalogue-hash-non-hex ajoutés au harnais asset-spec (format D-08) avec expect_paths [["content_hashes", "<field>"]] ; consommés à la fois par pytest parametrize et vitest it.each.
  - .github/workflows/verify.yml reste byte-identique (D-18) : les étapes 08-10 ramassent automatiquement pytest -k export / vitest run / pytest tests/ -q ; pas d'étape ajoutée.
patterns-established:
  - closure modelée : pour toute extension future d'un modèle clos (Phase 8 dotlottie_sha256, ou tout autre), la règle « édition same-commit » + test « 5e clé rejetée » (rejection-only ou expect_paths asymétrique) verrouille que le modèle ne peut pas être élargi sans éditer le contrat des deux côtés -- audit reproductible par le harnais partagé.
  - single source of fixture truth avec override optionnel : n'altère pas les call sites existants et permet au plan aval (02-06) de fournir les vrais sha sans dupliquer un builder ; la cohérence cross-bridge est garantie par le fait que fixtures.py n'importe pas les loaders.
  - migration de données de harnais de rejet : toute extension de contrat entraine la migration automatique des payloads du même contrat (asset-spec.json + pack-manifest.json) pour préserver la signature des validateurs collect-all (IN-08, DM-04, WR-01, LIC-01).
requirements-completed: [MOT-04, STY-01]
coverage:
  - deliverable: AssetSpec ContentHashes 4-champ
    id: del-1
    description: Pydantic ContentHashes locked to {svg_sha256, lottie_sha256, style_sha256, catalogue_sha256}
    requirement: STY-01
    verification:
      - kind: automated
        ref: python -m pytest tests/domain/test_asset.py -q
        status: PASS
      - kind: automated
        ref: npx tsc --noEmit
        status: PASS
      - kind: automated
        ref: python -m pytest tests/ -q
        status: PASS
    human_judgment: false
  - deliverable: AssetSpecSchema ContentHashesSchema 4-champ
    id: del-2
    description: zod strictObject mirror of Pydantic ContentHashes
    requirement: STY-01
    verification:
      - kind: automated
        ref: python -m pytest tests/ -q -k export
        status: PASS
      - kind: automated
        ref: npx vitest run
        status: PASS
      - kind: automated
        ref: npx tsc --noEmit
        status: PASS
    human_judgment: false
  - deliverable: make_asset 4-hash + override optionnel
    id: del-3
    description: single source of fixture truth construit 4 content_hashes, accepte content_hashes=None ; plan 02-06 fournira les vrais sha via override
    requirement: MOT-04
    verification:
      - kind: automated
        ref: python -m pytest tests/ -q -k export
        status: PASS
      - kind: automated
        ref: python -m pytest tests/ -q
        status: PASS
    human_judgment: false
  - deliverable: _make_asset_for_pack 4-hash
    id: del-4
    description: helper interne consommé par make_pack construit 4 content_hashes ; make_pack reste constructible
    requirement: MOT-04
    verification:
      - kind: automated
        ref: python -m pytest tests/ -q
        status: PASS
    human_judgment: false
  - deliverable: pack-manifest.json migrated 2->4 content_hashes
    id: del-5
    description: chaque payload inline porte 4 content_hashes ; chaque cas garde exactement UNE mutation ciblée ; les signatures collect-all (in08-doublons-asset-id, totals-compte-incoherent, mono-style-mismatch) sont préservées par membership
    requirement: STY-01
    verification:
      - kind: automated
        ref: python -m pytest tests/ -q -k "rejection or bridge"
        status: PASS
      - kind: automated
        ref: npx vitest run
        status: PASS
    human_judgment: false
  - deliverable: harnais de rejet asset-spec étendu
    id: del-6
    description: 3 nouveaux cas as01/as02/as03 + dm03-content-hashes-5e-cle (lock 4-champ + dotlottie_sha256 smugglé)
    requirement: MOT-04
    verification:
      - kind: automated
        ref: python -m pytest tests/domain/test_asset.py tests/bridge/test_asset_bridge.py -q
        status: PASS
      - kind: automated
        ref: npx vitest run asset-spec
        status: PASS
    human_judgment: false
  - deliverable: chaîne bridge asset-spec verte (étapes ordonnées)
    id: del-7
    description: pytest -k export → npx vitest run → pytest -q, artéfact asset-spec.from-python.json contient 4 content_hashes, ré-import sous Pydantic strict byte-identique
    requirement: STY-01
    verification:
      - kind: automated
        ref: python -m pytest tests/ -q -k export
        status: PASS
      - kind: automated
        ref: npx vitest run
        status: PASS
      - kind: automated
        ref: python -m pytest tests/ -q
        status: PASS
    human_judgment: false
  - deliverable: aucune modification du workflow CI (D-18)
    id: del-8
    description: .github/workflows/verify.yml byte-identique avant/après ce plan
    requirement: D-18
    verification:
      - kind: automated
        ref: git diff --exit-code -- .github/workflows/verify.yml
        status: PASS
    human_judgment: false
duration: 11 min
completed: 2026-08-30T17:02:00Z
status: complete
---

# Phase 2 Plan 03: ContentHashes 4-champ + chaîne bridge verte

**One-liner :** Extension same-commit §4.14 (D-16) de `AssetSpec.content_hashes` de 2 à 4 champs (`svg_sha256`, `lottie_sha256`, `style_sha256`, `catalogue_sha256`), réutilisation du `Sha256Hex` existant (aucun second type de hash), édition mirror Py↔TS, migration des payloads de rejet, builders `make_asset`/`_make_asset_for_pack` à 4 hash avec override optionnel, et chaîne bridge asset-spec verte (pytest -k export → vitest → pytest -q, byte-identique) — sans modification de `.github/workflows/verify.yml` (D-18).

## Performance

- **Wall-clock** : ~11 min (16:51 UTC baseline → 17:02 UTC fin), bien dans la bande estimate `confidence: low` du plan.
- **Tests** : 392 pytest passed (+23 vs baseline — nouveaux cas d'harnais + bridge 4-hash) ; 125 vitest passed (+23) ; ruff / biome / tsc propres.
- **Vérification ordonnée** : `pytest -k export` → `npx vitest run` → `pytest -q` enchainés, artéfact `asset-spec.from-python.json` contient les 4 content_hashes, `reimported == asset` byte-identique.

## Accomplishments

1. **Extension same-commit du contrat AssetSpec** : `ContentHashes` Pydantic et `ContentHashesSchema` zod édits en synchro, 4 champs clos (`svg_sha256`, `lottie_sha256`, `style_sha256`, `catalogue_sha256`), `Sha256Hex` réutilisé (aucun second type de hash introduit), `extra="forbid"` / `strictObject` rejette un 5e champ tel que `dotlottie_sha256` (règle §4.14 honorée en prévision de la Phase 8).
2. **Tests modèle étendus** : `tests/domain/test_asset.py` — assertions de lock à 4 champs, tests d'uppercase/short/non-hex sur les 2 NOUVEAUX champs, smoke-test `dotlottie_sha256` smugglé ; `tests/domain/test_pack.py` — `_asset_payload` à 4 content_hashes ; miroir vitest à jour.
3. **Builders fixture unique** : `make_asset()` à 4 hash deterministes (`ASSET_HASH_STYLE=fedcba9876543210*4`, `ASSET_HASH_CATALOGUE=abcdef0123456789*4`) avec override optionnel `content_hashes=None` consommé par plan 02-06 ; `_make_asset_for_pack` helper à 4 hash pour préserver `make_pack()` constructible ; `fixtures.py` reste sans dépendance aux loaders produit.
4. **Migration des payloads de rejet** :
   - `fixtures/rejection-cases/asset-spec.json` : tous les cas existants migrés 2→4, 3 nouveaux cas `as01-style-hash-uppercase`, `as02-catalogue-hash-short`, `as03-catalogue-hash-non-hex` ajoutés au format D-08, et `dm03-content-hashes-5e-cle` injectant `dotlottie_sha256` (rejection-only — path-asymmetry documentée).
   - `fixtures/rejection-cases/pack-manifest.json` : 51 assets inline + 5 cas license/cost/pack-id migrés 2→4 ; chaque cas garde exactement UNE mutation ciblée ; les 3 signatures collect-all (in08-doublons-asset-id, totals-compte-incoherent, mono-style-mismatch) conservées par membership.
5. **Chaîne bridge verte** : bridge asset-spec ordonné pytest -k export → vitest → pytest -q, artéfact `from-python.json` carries 4 content_hashes ; re-import sous Pydantic strict byte-identique ; harnais de rejet étendu partagé entre pytest parametrize et vitest it.each.
6. **Doctrine CI préservée** : `.github/workflows/verify.yml` byte-identique (vérifié via `git diff --exit-code -- .github/workflows/verify.yml` → vide) — les étapes 08-10 ramassent automatiquement les nouveaux tests.

## Task Commits

| Task | Hash | Sujet | Fichiers modifiés |
|------|------|-------|-------------------|
| 1 | 3189fc3 | feat(02-03): ContentHashes 4-field same-commit extension (D-16) | asset.py, asset-spec.schema.ts, test_asset.py, asset-spec.spec.ts (4 fichiers) |
| 2 | 01c704d | feat(02-03): fixture builders 4-hash + migration pack-manifest + new rejection cases (D-16) | fixtures.py, asset-spec.json, pack-manifest.json, test_pack_bridge.py, test_pack.py, pack-manifest.spec.ts (6 fichiers) |

## Files Created/Modified

- **MOD** `lottie_forge/domain/asset.py` : `ContentHashes` étendu à 4 champs (Sha256Hex réutilisé), docstring §4.7 mise à jour pour refléter la 4-champ closure et anticiper `dotlottie_sha256` Phase 8.
- **MOD** `src/rpc/contracts/asset-spec.schema.ts` : `ContentHashesSchema` strictObject étendu à 4 champs (Sha256HexSchema réutilisé), docstring en miroir du modèle Py.
- **MOD** `tests/domain/test_asset.py` : assertions `test_content_hashes_close_model_has_exactly_four_fields` ; `test_content_hash_svg_uppercase_too_short_non_hex` mis à jour pour passer 4 hashes ; nouveaux tests `test_content_hash_style_uppercase`, `test_content_hash_catalogue_too_short`, `test_content_hash_catalogue_non_hex` ; smoke `test_content_hashes_fifth_field_is_rejected` (dotlottie_sha256) ; constructeur à 4 hashes.
- **MOD** `tests/bridge/fixtures.py` : `make_asset(content_hashes=None)` à 4 hashes deterministes + override optionnel ; `_make_asset_for_pack` à 4 hashes ; suppression de l'import inutilisé `Any`.
- **MOD** `fixtures/rejection-cases/asset-spec.json` : 18 cas existants migrés 2→4 ; 3 nouveaux cas `as01/as02/as03` avec expect_paths précis ; `dm03-content-hashes-5e-cle` en rejection-only.
- **MOD** `fixtures/rejection-cases/pack-manifest.json` : 9 cas avec assets inline migrés 2→4 (51 assets `assets-51` + 2 in08 + 2 totals + 1 mono-style + license-3 + cost-eur + pack-id), signatures d'origine préservées.
- **MOD** `tests/domain/test_pack.py` : `_asset_payload` à 4 hashes deterministes.
- **MOD** `tests/bridge/test_pack_bridge.py` : `test_in08_duplicate_asset_id_collect_all_on_bridge` payload à 4 hashes.
- **MOD** `src/rpc/contracts/asset-spec.spec.ts` : docstring mise à jour pour refléter 4-field model (zéro hard-code à migrer côté TS).
- **MOD** `src/rpc/contracts/pack-manifest.spec.ts` : `IN-08 collect-all` payload à 4 hashes.

## Decisions Made

- **Régime de hash unique réutilisé** : `Sha256Hex` (`^[a-f0-9]{64}$` minuscules, min/max 64) reste le seul type de hash, aucun `StyleSha256Hex` ou `CatalogueSha256Hex` introduit — la cohérence cross-champ du harnais en dépend.
- **Extension same-commit §4.14** : `asset.py` + `asset-spec.schema.ts` édités au même plan (Task 1) ; la preuve de fermeture est `dm03-content-hashes-5e-cle` qui injecte `dotlottie_sha256` et se fait rejeter par les deux côtés (extra=forbid / strictObject).
- **Override optionnel au builder** : `make_asset(content_hashes=None)` plutôt qu'un second builder — la single source of fixture truth est préservée, les 3 call sites existants (test_asset_bridge, test_pack_bridge, test_pack.py) restent byte-identiques par défaut, et plan 02-06 fournit les vrais sha via le paramètre.
- **Pas d'import des loaders dans fixtures.py** : `tests/bridge/fixtures.py` reste sans dépendance aux modules `lottie_forge/loading/*` ; les valeurs 4-hash pour style_sha256/catalogue_sha256 sont des littéraux deterministes (placeholders) que 02-06 remplacera par `sha256_hex(style.yaml)` et `sha256_hex(catalogue.json)`.
- **Migration pack-manifest comme migration de données et non réécriture** : les mêmes deux littéraux deterministes 64-hex sont collés dans CHAQUE asset inline (51 + 2 + 2 + 1 + 1 + 1 + 1 + 1 + 1 = 60 assets sur 9 cas, plus `assets-vide` sans asset) — cohérence de la fixture truth avec `make_asset()`.
- **Path-asymmetry Pydantic/zod pour extra-keys** : `dm03-content-hashes-5e-cle` en `rejection-only` (pas d'`expect_paths`) — même convention que `dm03-content-hashes-champ-extra` Phase 1, documentée dans `02-PATTERNS.md`.
- **Bloc de 4 hashes deterministes sur `_make_asset_for_pack`** : nécessaire sinon `make_pack()` lève `ValidationError("style_sha256: Field required")` dès la construction du PackManifest et le test d'export `pack-manifest` rougit avant même `pytest -k export`.

## Deviations from Plan

**1. [Rule 1 - Bug] `dm03-content-hashes-5e-cle` ajusté en rejection-only (chemin asymétrique documenté)**

- **Found during:** Task 2 — premier run `pytest tests/ -q` après migration pack-manifest + nouveau cas asset-spec.
- **Issue:** Pydantic v2 émet `loc = ('content_hashes', 'dotlottie_sha256')` pour un `extra="forbid"` violé (le nom de la clé rejetée est la composante finale du loc), tandis que zod `strictObject` émet `loc = ['content_hashes']` (loc parent uniquement). Avec `expect_paths: [["content_hashes"]]`, l'assertion du harnais Py échoue (`('content_hashes',) not in {('content_hashes', 'dotlottie_sha256')}`).
- **Fix:** `expect_paths` retiré pour `dm03-content-hashes-5e-cle` — le test rejette seulement (rejection-only), exactement la même convention que `dm03-content-hashes-champ-extra` Phase 1 (path-asymmetry documentée dans `02-PATTERNS.md` section "Asymétrie pinnée"). Aucun edit côté TS n'a été nécessaire (le harnais vitest `expect(result.success).toBe(false)` n'inspecte les paths que si `expect_paths` est non-vide ; pour `expect_paths: []` l'assertion du test est satisfaite par le seul fait que le payload soit rejeté).
- **Files modified:** `fixtures/rejection-cases/asset-spec.json`.
- **Commit:** fait partie de 01c704d (`feat(02-03): fixture builders 4-hash + migration pack-manifest + new rejection cases (D-16)`).
- **Justification:** Le plan suggérait `expect_paths [["content_hashes"]]` pour `dm03-content-hashes-5e-cle`. La réalité de l'asymétrie (déjà documentée Phase 1) impose une rejection-only pour rester portable sur les deux côtés sans introduire un nouveau mechanism de path-mapping. Pas de refonte : convention déjà en place, on s'y conforme.

## Issues Encountered

- **F401 `typing.Any` unused import** : `from typing import Any` ajouté préventivement dans `tests/bridge/fixtures.py` lors du refactor mais inutilisé (la signature de `make_asset` typée `ContentHashes | None` n'a pas besoin d'`Any`). Détecté par `ruff check .` après le commit Task 2 ; corrigé localement avant le commit (intégré dans le même commit 01c704d — un seul delta pour Task 2).
- **IN-08 collect-all hard-coded payloads mis à jour** : `test_in08_duplicate_asset_id_collect_all_on_bridge` (test_pack_bridge.py) et `IN-08 collect-all` (pack-manifest.spec.ts) construisaient leurs payloads directement en code avec 2 content_hashes — la règle §4.7 du nouveau modèle aurait fait échouer l'assertion au niveau `style_sha256: Field required` AVANT d'atteindre le validateur collect-all IN-08. Corrigé à 4 hashes pour que la signature `loc=("assets", 0, "asset_id") AND loc=("assets", 1, "asset_id")` soit effectivement trouvée par membership.
- **3 cas Phase 1 manifestement hard-codés en 2-hash** : `test_domain/test_pack.py` (helper `_asset_payload`), `test_bridge/test_pack_bridge.py` (IN-08 hard-coded), `pack-manifest.spec.ts` (IN-08 hard-coded) — tous migrés à 4 hashes dans le même commit Task 2.

## User Setup Required

**None** — aucune dépendance externe, aucune migration de base, aucune clé d'API, aucun edit de fichier hors-repo. Toutes les modifications sont committées dans 2 commits atomiques prêts à pousser.

## Next Phase Readiness

- **Plan 02-04 (catalogue + coverage-map + joint-load)** peut démarrer : `ContentHashes` est prêt à recevoir le vrai `catalogue_sha256` dès que le loader catalogue (D-03) est en place ; le call site `make_asset(content_hashes=...)` est le point d'entrée propre.
- **Plan 02-06 (prompt-fixture + manifest)** peut brancher les vrais sha via `sha256_hex(normalize_lf(style.yaml.read_bytes()))` et `sha256_hex(normalize_lf(catalogue.json_path.read_bytes()))` ; les loaders `lottie_forge/loading/style.py` (D-02) et `lottie_forge/loading/catalogue.py` (D-03, plan 02-04) utilisent déjà `sha256_hex` (signature 02-01, single implementation) — pas de ré-implémentation.
- **Phase 8 dotlottie_sha256** future extension : suit le même pattern (édition same-commit du modèle + miroir zod + nouveau cas de rejet `dm03-content-hashes-6e-cle` en rejection-only ou avec path asymétrique documenté). La règle §4.14 est armée et l'audit est reproductible.
- **Gates vertes** : `pytest` 392 ✓, `vitest` 125 ✓, `ruff` ✓, `biome` ✓, `tsc --noEmit` ✓, `git diff .github/workflows/verify.yml` ✓ (vide). Aucune dette technique ouverte issue de ce plan.

---

*Phase 02, Plan 03 — ContentHashes 4-champ same-commit extension (D-16). Bridge asset-spec vert, harnais de rejet étendu, ContentHashes fermé à 4 champs, doctrine CI préservée.*
