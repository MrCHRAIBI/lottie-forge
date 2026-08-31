---
phase: 02-style-verrouill-catalogue-de-recettes
fixed_at: 2026-08-31T13:32:00Z
review_path: .planning/phases/02-style-verrouill-catalogue-de-recettes/02-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-08-31T13:32:00Z
**Source review:** .planning/phases/02-style-verrouill-catalogue-de-recettes/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (WR-01, WR-02, WR-03 + le finding Info accepté par adjudication)
- Fixed: 4
- Skipped: 0

**ID mapping note (IN-07):** l'adjudication utilisateur désigne par « IN-07 » le
finding décrit dans `<expected_fixes>` : `loadRejectionCases`
(`src/rpc/contracts/rejection-cases.ts`) qui accepte des fixtures sans `payload`
→ vert vacuous côté TS. Dans le corps du 02-REVIEW.md ce finding porte
l'identifiant **IN-05** ; l'IN-07 du REVIEW.md (double-read dans
`load_catalogue_prompt_fixture`, `render.py:144-145`) est l'un des 6 findings
Info **hors scope** (« ne pas toucher ») et n'a PAS été corrigé. Le fix suit la
description explicite de l'adjudication (fichier + comportement), pas le
numéro.

## Fixed Issues

### WR-01: `scan_stale_pins` — validation fail-closed de `current_version` (+ version pinnée extraite)

**Files modified:** `lottie_forge/gates/stale_pins.py`, `tests/domain/test_stale_pins.py`
**Commit:** `6e070cb` (`fix(02-05): WR-01 fail-closed version validation in scan_stale_pins`)
**Status:** fixed (la seule logique de classification modifiée est le fall-through
`_classify_bump`, désormais un `raise` défensif — comportement verrouillé par un
test de régression mutation-checked)

**Applied fix:**
- Garde d'entrée fail-closed : `_SEMVER = TypeAdapter(Annotated[str,
  StringConstraints(pattern=STYLE_VERSION_PATTERN)])` avec
  `STYLE_VERSION_PATTERN` **importé** de `lottie_forge.domain.style` (pas de
  re-dérivation). `scan_stale_pins` valide `current_version` à l'entrée ET la
  version pinnée extraite (`rsplit("@", 1)[1]`) — défense en profondeur.
  Toute version malformée (`"1.0"`, `"abc"`, `"1.0.0.0"`, …) →
  `pydantic.ValidationError` explicite à la frontière, jamais `IndexError` /
  `ValueError` brut, jamais classification silencieuse.
- `_classify_bump` : le commentaire mensonger « identical versions never reach
  this function » est remplacé par un `raise ValueError` défensif — le cas
  « égalité numérique sur les 3 composantes mais chaînes différentes »
  (`1.0.0` vs `01.0.0`, qui passe le pattern) ne peut plus masquer un
  `patch`/`sampled`.

**Regression tests** (`tests/domain/test_stale_pins.py`, tous mutation-checked :
stash du fix source → 9/9 échouent ; pop → 9/9 verts) :
- `test_malformed_current_version_fails_closed[ seven ids ]` (two-segments,
  non-numeric, non-numeric-patch, four-segments, empty, v-prefix, empty-segment)
- `test_four_segment_diff_is_rejected_not_downscoped` (la sonde exacte du review)
- `test_numeric_tie_with_different_strings_fails_closed` (`01.0.0` vs `1.0.0`)

**Verification evidence:** probe pydantic (ValidationError, sous-classe
ValueError, sur `1.0`/`abc`/`1.0.0.0` ; `01.0.0` accepté par le pattern →
couvert par le raise défensif) ; mutation-check : sans le fix, 9 failed /
8 deselected, dont `DID NOT RAISE` et `DID NOT RAISE ValueError` (le
comportement silencieux d'avant) ; avec le fix : 18 passed sur le fichier.

### WR-02: `render_recipe_picker_prompt` — substitution single-pass, invariant « embarqué == hashé == committé » restauré

**Files modified:** `lottie_forge/prompts/render.py`, `tests/prompts/test_prompt_fixture.py`
**Commit:** `e1f2aff` (`fix(02-06): WR-02 single-pass placeholder substitution in prompt renderer`)
**Status:** fixed

**Applied fix:**
- Les deux `str.replace` séquentiels sont remplacés par **une** passe
  `re.sub(r"\{\{(catalogue_json|catalogue_hash)\}\}", _substitute, template)`
  (`_PLACEHOLDER_RE` compilée une fois, niveau module) : le texte inséré n'est
  JAMAIS re-scanné, donc un catalogue contenant le token littéral
  `{{catalogue_hash}}` est embarqué verbatim au lieu d'être réécrit
  silencieusement avec le vrai hash.
- Garde fail-closed conservée et déplacée au bon endroit : les placeholders
  connus sont retirés du **template avant substitution** ; tout `{` restant
  dans le template = placeholder non satisfaisable → `ValueError` (« left an
  unsubstituted placeholder », phrase conservée pour l'existing guard test).
  La garde ne porte plus sur le rendu, donc un catalogue contenant des
  accolades quelconques reste verbatim sans fausse alerte.

**Regression tests** (`tests/prompts/test_prompt_fixture.py`, mutation-checked :
stash du fix → 3/3 échouent sur l'ancien code séquentiel ; pop → verts) :
- `test_catalogue_text_carrying_placeholder_tokens_stays_verbatim[hash-token-in-catalogue]`
  — échoue si régression vers `.replace()` séquentiels (membership verbatim
  cassé + hash dupliqué, exactement les deux symptômes du review)
- `test_catalogue_text_carrying_placeholder_tokens_stays_verbatim[json-token-in-catalogue]`
- `test_catalogue_text_with_foreign_braces_is_verbatim_not_rejected` (accolades
  étrangères = données, plus jamais un déclenchement de garde)

**Verification evidence:** `test_rendered_prompt_embeds_full_catalogue_text_and_64hex_hash`,
`test_template_has_exactly_two_placeholders` et `test_residual_placeholder_guard`
(la garde template malformée reste rouge sur un `{{unsupported}}`) restent
verts — 13 passed sur le module ; mutation-check 3 failed / 10 deselected sans
le fix (`ValueError` de l'ancienne garde + corruption séquentielle).

### WR-03: `ASSET_ID_GATE_PATTERN` supprimé — `ASSET_ID_PATTERN` importé verbatim

**Files modified:** `lottie_forge/gates/stale_pins.py`, `tests/domain/test_stale_pins.py`
**Commit:** `072dcd8` (`fix(02-05): WR-03 import ASSET_ID_PATTERN verbatim, drop re-derived gate copy`)
**Status:** fixed

**Applied fix:** pré-vérifié identique avant fusion (`r"^a-\d{3}$"` des deux
côtés) ; `PinRecord.asset_id` valide désormais contre `ASSET_ID_PATTERN`
**importé** de `lottie_forge.domain.asset` (même ligne d'import que
`STYLE_REF_PATTERN`), la déclaration littérale locale `ASSET_ID_GATE_PATTERN`
est supprimée (absente de `__all__`, removal contenu — vérifié par grep : plus
aucune référence hors le test d'absence). Docstring de `PinRecord` mise à jour
(« imported verbatim (no re-derivation, WR-03) »).

**Regression tests** (`tests/domain/test_stale_pins.py`, mutation-checked :
stash du fix → échec `AttributeError: ASSET_ID_PATTERN` ; pop → vert) :
- `test_gate_imports_asset_id_pattern_verbatim_no_rederivation` — asserte
  l'identité par `is` entre `stale_pins.ASSET_ID_PATTERN` et le pattern du
  domaine (pas une simple égalité de chaîne) ET l'absence de
  `ASSET_ID_GATE_PATTERN` sur le module.

**Verification evidence:** mutation-check 1 failed (AttributeError) sans le
fix ; 18 passed sur `tests/domain/test_stale_pins.py` avec ; `ruff check` vert.

### IN-07 (adjudication) / IN-05 (REVIEW.md): garde fail-loud sur les entrées de fixture sans payload

**Files modified:** `src/rpc/contracts/rejection-cases.ts`, `src/rpc/contracts/rejection-cases.spec.ts` (nouveau fichier de test)
**Commit:** `49c3c17` (`fix(02-06): IN-07 fail-loud shape guard in rejection-case loader (REVIEW IN-05)`)
**Status:** fixed

**Applied fix:** **wrapper additif** — la signature exportée
`loadRejectionCases(contract: string): RejectionCase[]` est inchangée, les 6
spec files consommateurs ne sont pas touchés. Ajout de
`assertRejectionEntryShape(entry, filename)` : si `case_id`, `ref`, `model` ou
`payload` (objet non-null) manque → `Error` explicite au chargement, miroir du
`KeyError` Python (`rejection_loader.py:70`). Sans elle, une entrée sans
payload donnait `Schema.safeParse(undefined)` → rejet → assertion
« must be rejected » **passée vacuement** pendant que Python raise — la
divergence exacte que le harnais one-source-zero-drift existe pour empêcher.
La fonction est exportée uniquement pour être testable en unitaire sans
toucher aux fixtures verrouillées. `RawRejectionEntry` (champs `unknown`)
remplace le cast inline ; validate-then-cast documenté dans le code.

**Regression tests** (`src/rpc/contracts/rejection-cases.spec.ts`, nouveau
fichier — justifié : fixtures verrouillées intouchables, donc la garde se
teste en unitaire ; mutation-checked : stash du fix → 6/7 failed ; pop → verts) :
- `throws on an entry without payload (vacuous-green guard)`
- `throws on a null payload` / `throws on a non-object payload`
- `throws when case_id is missing` / `throws when model is missing`
- `accepts a well-formed entry without the optional expect_paths`
- `loads every committed fixture with non-empty, shape-valid cases`
  (non-vacuité : les 4 fixtures committées chargent toujours, garde jamais
  faussement positive)

**Verification evidence:** mutation-check 6 failed / 1 passed sans la garde ;
`vitest run` 9 files / 157 tests verts ; `tsc --noEmit` exit 0 ; `biome check`
exit 0 (fichiers reformatés via `biome format --write` ciblé sur ces 2 fichiers
uniquement).

## Verification (batterie complète post-fix)

**Lieu d'exécution :** worktree d'isolement
`.claude/worktrees/rf-02-15328-1788178344` (branche `gsd-reviewfix/02-15328`,
base `6367ecb`) — ces nombres sont reproductibles depuis cette arbre ; le
`node_modules`/venv résolus depuis le checkout principal (le worktree n'en
contient pas par conception). Le pipeline bridge est en 3 étapes
(pytest export → vitest → pytest re-import) ; dans un worktree frais il a été
exécuté dans l'ordre officiel, d'où les 5 skips transitoires du premier pass
pytest (artefacts `.from-ts.json` pas encore générés) — le pass final est
complet.

1. `pytest tests/ -q` → **485 passed, 0 skipped** (baseline 472 + 13 tests de régression Python)
2. `vitest run` → **157 passed / 9 files** (baseline 150 + 7 tests TS)
3. `ruff check .` → **All checks passed**
4. `biome check .` → **Checked 18 files, exit 0**
5. `tsc --noEmit` → **exit 0**
6. `git diff --exit-code -- .github/workflows/verify.yml` → **vide** (working tree ET plage `6367ecb..HEAD`) — D-18 respecté
7. Fichiers touchés par les 4 commits (`git diff --name-only 6367ecb HEAD`) :
   `lottie_forge/gates/stale_pins.py`, `lottie_forge/prompts/render.py`,
   `src/rpc/contracts/rejection-cases.ts`, `src/rpc/contracts/rejection-cases.spec.ts`,
   `tests/domain/test_stale_pins.py`, `tests/prompts/test_prompt_fixture.py`
   — **aucun** fichier verrouillé (`fixtures/rejection-cases/*`,
   `fixtures/recipe-catalogue/*`, `fixtures/style-specs/*`), aucun contrat
   traversant (`lottie_forge/domain/*.py`, `src/rpc/contracts/*.schema.ts`)
   modifié, D-08 respecté (aucun miroir TS de `PinRecord`/`StalePinFlag`/
   `scan_stale_pins` ajouté).

## Skipped Issues

None — tous les findings in-scope ont été corrigés.

Les 6 findings Info hors scope (adjudication : « ne pas toucher ») ne ont pas
été modifiés : IN-01, IN-02, IN-03, IN-04, IN-06 et l'IN-07 littéral du
REVIEW.md (double-read `render.py`) — ce dernier étant couvert par la note de
mapping en tête de rapport.

---

_Fixed: 2026-08-31T13:32:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
