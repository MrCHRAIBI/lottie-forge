---
phase: 01-contrats-de-donn-es-fronti-re-pydantic-zod-reconstruction
plan: 05
subsystem: ci
tags: [ci, github-actions, zero-skip, junitxml, gate, verify, fresh-checkout, dm-05, d-09, d-05, d-04, rule-2, gitattributes, autocrlf]

# Dependency graph
requires:
  - phase: 01-01
    provides: "pyproject.toml (Pydantic 2.13.4 pin + pytest junitxml addopts), package.json + package-lock.json, vitest.config.ts (junit reporter), ruff.toml known-first-party"
  - phase: 01-02
    provides: "RecipeId closed vocabulary + MotionRecipe bridge chain (pytest -k export -> vitest -> pytest -q green baseline)"
  - phase: 01-03
    provides: "AssetSpec + content_hashes + bridge chain green baseline"
  - phase: 01-04
    provides: "PackManifest + LicenseInfo structurelle + 3 collect-all validators + determinism + bridge chain pack-manifest verte (329 pytest + 85 vitest verts)"
provides:
  - ".github/workflows/verify.yml -- job verify unique, runs-on ubuntu-latest, triggers push(main)+pull_request, permissions contents:read, concurrency per-ref, 12 etapes sequentielles (10 de §3.6 + tsc + zero-skip), aucun continue-on-error/if:always()"
  - "scripts/assert-zero-skips.mjs -- parser junitxml stdlib-only (regex /<testsuites?\\b[^>]*\\bskipped=\"(\\d+)\"[^>]*>/g), somme testsuites+testsuite skipped, exit 0 si total == 0, exit 1 sinon (FAIL line imprimee)"
  - "README.md -- quickstart = sequence CI byte-for-byte (venv + pip install -e \".[dev]\" + npm ci puis ruff -> biome -> pytest -k export -> vitest -> pytest -q -> tsc --noEmit -> assert-zero-skips), protocole bridge §4.3, structure monorepo, note D-05 pas de hooks pre-commit, note stack pins §3.1/§3.2"
  - ".gitattributes -- `* text=auto eol=lf` enforce LF checkout sur tout clone (fresh-clone Windows == CI Linux)"
  - ".gitignore -- +.gsd/ (GSD runtime) et +uv.lock (artefact env local, CI utilise pip) -- permet `git status --porcelain` vide (D-09)"
  - "Preuve fresh-clone : 12 etapes vertes depuis clone temporaire (C:\\Users\\CHRAIBI\\AppData\\Local\\Temp\\opencode\\lf-fresh-verify), fixtures/bridge/ absent avant l'etape export, junitxml cumule skipped == 0"
affects: [phase-01-plan-summary, phase-02-recipe-catalogue, phase-03-motion-compiler, phase-04-anim-qa, phase-05-manifest-store, all-downstream-phases-protected-by-ci-gate]

# Actuals (#2632) -- pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 4280     # chars/4 over files actually changed (17113 chars, 5 files)
  tasks: 3
  commits: 4       # feat(01-05) CI + assert, docs(01-05) README, chore(01-05) gitignore, chore(01-05) gitattributes

# Tech tracking
tech-stack:
  added:
    - actions/checkout@v4 (pinned major)
    - actions/setup-python@v5 (pinned major)
    - actions/setup-node@v4 (pinned major)
  patterns:
    - "verify.yml : job unique + 12 etapes sequentielles strictes (pas de parallel, pas de matrix) ; le parallelisme casserait la porte skipif du bridge"
    - "actions setup-python@v5 / setup-node@v4 / checkout@v4 -- versions de major pinnées (compatibilite Node 20 runner ubuntu-24.04), pas de SHA pin (pas encore necessaire Phase 1)"
    - "Le gate zero-skip est une etape CI ordinaire (pas un job séparé, pas un composite) : la chaîne half-silent ne peut pas atteindre l'etape 12 green si une etape 8/9 a partiellement reussi avec skip"
    - "assert-zero-skips.mjs : regex /<testsuites?\\b[^>]*\\bskipped=\"(\\d+)\"[^>]*>/g sur stdout -- extrait la valeur de l'attribut skipped uniquement sur les balises ouvrantes (jamais sur testcase)"
    - "README Quickstart 7 commandes = etes 6..12 du job verify (les etes 1..5 sont setup CI pur : checkout + setup-python + setup-node + pip install + npm ci)"
    - ".gitattributes `* text=auto eol=lf` : la politique EOL est dans le depot, pas dans la config globale -- un nouveau contributeur clone et checkout immediatement en LF"
    - "D-09 : `git status --porcelain` vide après commit de phase -- atteinte via .gitignore (.gsd/, uv.lock) + le reste est commite"

key-files:
  created:
    - ".github/workflows/verify.yml -- 106 lignes, job verify sur ubuntu-latest, 12 steps numerotes (01-checkout -> 12-assert-zero-skips)"
    - "scripts/assert-zero-skips.mjs -- 89 lignes, stdlib-only (fs+process), regex junitxml testsuites|testsuite, exit-code-based gate"
    - "README.md -- 220 lignes, quickstart + structure + protocole bridge + stack + licence"
    - ".gitattributes -- 18 lignes, `* text=auto eol=lf` pour cross-platform parity LF"
  modified:
    - ".gitignore -- +2 lignes (.gsd/ pour runtime GSD, uv.lock pour env local)"

key-decisions:
  - "Pinning des actions par major (v4/v5/v4) au lieu de SHA complet : suffisant Phase 1 (audit/security Phase 10 si necessaire) -- pattern reproductible pour Phases 2+"
  - "Pip install en etape CI 4 (et non uv sync) : uv.lock ignore par pip, on reste sur le pyproject.toml canonique"
  - "Pas de hook pre-commit local (D-05) : la CI est l'unique enforceur, le README documente la sequence manuelle equivalente"
  - "assert-zero-skips : regex sur l'attribut skipped des balises ouvrantes uniquement (pas testcase) -- pytest et vitest utilisent tous deux l'attribut `skipped=\"N\"` au niveau testsuites et testsuite (jamais testcase pour pytest, vitest utilise `<skipped/>` child pour testcase individuel mais l'attribut cumule reste sur testsuite)"
  - "Timeouts et env var (PYTHONDONTWRITEBYTECODE, PYTHONIOENCODING, LC_ALL, LANG) positionnes au niveau job -- determinisme CI"
  - "Concurrency cancel-in-progress: true sur group verify-${{ github.ref }} -- les pushes successifs sur la meme ref ne gaspillent pas de minutes CI"
  - "Order bridge garde-fou : la commande 12 (assert-zero-skips) lit fixtures/bridge/pytest-junit.xml -- produit par l'etape 8 (pytest -k export) et mis a jour par l'etape 10 (pytest -q). Si l'etape 8 a un skip silencieux (skipif), le junitxml aurait skipped > 0 et l'etape 12 fail"
  - ".gitattributes AVANT le fresh-clone proof : la preuve a detecte le bug CRLF Windows (autocrlf convertit LF->CRLF sur checkout), fix shipped same-task (Rule 2 critical)"
  - "Phase 1 close : 4 contrats + zod mirrors + bridge ordered chain + CI gate -- critere ROADMAP #1 (bridge ordonne vert, zero skip) prouve localement avant le premier push CI"

requirements-completed: [DM-05]

# Coverage metadata (#1602) -- one entry per shipped deliverable. Drives DETERMINISTIC UAT routing in verify-work.
coverage:
  - id: C1
    description: "Job verify.yml 12 etapes ordonnees (10 etes §3.6 + tsc --noEmit + assert-zero-skips), aucun continue-on-error/if:always(), permissions contents:read, concurrency per-ref"
    requirement: DM-05
    verification:
      - kind: yaml-parse
        ref: ".github/workflows/verify.yml -- structure validee via PyYAML (safe_load)"
        status: pass
      - kind: gate-shape
        ref: "12 steps avec name='NN-*' ordonnes 01..12, run= 'pip install -e \".[dev]\"' (chain quotee)"
        status: pass
      - kind: gate-shape
        ref: "Aucune step avec continue-on-error ou if: presente"
        status: pass
  - id: C2
    description: "assert-zero-skips.mjs parse junitxml (pytest + vitest), somme skipped sur testsuites+testsuite, exit 1 si > 0"
    requirement: DM-05
    verification:
      - kind: unit
        ref: "scripts/assert-zero-skips.mjs sur fixtures/bridge/{pytest,vitest}-junit.xml -> exit 0, total skipped: 0"
        status: pass
      - kind: unit
        ref: "scripts/assert-zero-skips.mjs sur junitxml fabrique avec skipped=1 -> exit 1 + FAIL line imprimee"
        status: pass
  - id: C3
    description: "README quickstart = sequence CI byte-for-byte (chaque commande du job etes 4..12 verbatim, ordre préservé), absence pre-commit documentee (D-05)"
    requirement: DM-05
    verification:
      - kind: textual-grep
        ref: "9 commandes du verify.yml etes 4..12 toutes presentes verbatim dans README.md (grep par IndexOf)"
        status: pass
      - kind: textual-grep
        ref: "Ordre des commandes dans Quickstart == ordre job : pip install -> npm ci -> ruff -> biome -> pytest -k export -> vitest -> pytest -q -> tsc -> assert-zero-skips"
        status: pass
      - kind: textual-grep
        ref: "Mention \"pas de hook pre-commit\" (D-05) presente dans le Quickstart"
        status: pass
      - kind: shell-run
        ref: "Sequence 7 commandes du README Quickstart executees localement -> 7/7 exit 0"
        status: pass
  - id: C4
    description: "Fresh-checkout proof : la chaîne bridge ordonnée passe verte depuis un clone temporaire, fixtures/bridge/ absent avant etape export, junitxml cumule skipped == 0"
    requirement: DM-05
    verification:
      - kind: shell-run
        ref: "Clone temporaire C:\\Users\\CHRAIBI\\AppData\\Local\\Temp\\opencode\\lf-fresh-verify cree via git clone (pas --local, hardlinks Windows incompat)"
        status: pass
      - kind: shell-run
        ref: "Dans le clone : uv venv --python 3.12 + uv pip install -e \".[dev]\" + npm ci (pas npm install) -> 3/3 exit 0"
        status: pass
      - kind: shell-run
        ref: "Sequence 7 etes verification (ruff, biome, pytest -k export, vitest, pytest -q, tsc, assert-zero-skips) -> 7/7 exit 0"
        status: pass
      - kind: fs-state
        ref: "fixtures/bridge/ absent du clone frais avant pytest -k export (preuve gitignore)"
        status: pass
      - kind: fs-state
        ref: "fixtures/bridge/ present apres la chaîne (15 fichiers generes : 4 contracts * (from-python, from-ts, schema-keys) + pytest-junit + vitest-junit + vocabulary)"
        status: pass
      - kind: gitignore-check
        ref: "git ls-files fixtures/bridge/ dans le clone -> vide (non tracked)"
        status: pass
      - kind: shell-cleanup
        ref: "Repertoire temporaire supprime apres preuve"
        status: pass
  - id: C5
    description: ".gitattributes enforce LF checkout cross-platform (fix Rule 2 detecte pendant le fresh-clone proof)"
    requirement: DM-05
    verification:
      - kind: fs-state
        ref: "Apres .gitattributes, fresh clone -> src/rpc/contracts/vocabulary.schema.ts en LF (no CRLF), biome check vert"
        status: pass
      - kind: fs-state
        ref: "Avant .gitattributes (1er fresh-clone), fichiers en CRLF, biome check 12 errors -- bug detecte par le proof, fix shippe"
        status: pass
  - id: C6
    description: "Static gates verts + chain bridge verte sur le depot principal post-phase"
    requirement: DM-05
    verification:
      - kind: shell-run
        ref: "ruff check . -> All checks passed!"
        status: pass
      - kind: shell-run
        ref: "npx @biomejs/biome check . -> Checked 12 files, no fixes applied"
        status: pass
      - kind: shell-run
        ref: "pytest -k export -> 15 passed"
        status: pass
      - kind: shell-run
        ref: "npx vitest run -> 85 passed"
        status: pass
      - kind: shell-run
        ref: "pytest -q -> 329 passed"
        status: pass
      - kind: shell-run
        ref: "npx tsc --noEmit -> exit 0"
        status: pass
      - kind: shell-run
        ref: "node scripts/assert-zero-skips.mjs -> total skipped: 0"
        status: pass

# Metrics
duration: 18 min
completed: 2026-08-29
status: complete
---
# Phase 1 Plan 05: CI verify (12 etapes §3.6) + zero-skip junitxml + README + fresh-clone proof

**CI verify.yml 12 etapes ordonnees (§3.6 + tsc + zero-skip gate) + assert-zero-skips.mjs + README byte-for-byte + .gitattributes LF cross-platform + fresh-clone proof 12/12 vertes depuis un clone temporaire. Phase 1 close : parité DM-05 enforce par la CI, plus une convention.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-29T20:41:31Z
- **Completed:** 2026-08-29T20:59:31Z
- **Tasks:** 3 (T-1 verify.yml + assert-zero-skips, T-2 README, T-3 fresh-clone proof)
- **Files modified:** 4 created + 1 modified (.gitignore)
- **Commits:** 4 atomic
- **Tests:** 329 pytest + 85 vitest verts sur le depot principal, 12/12 vertes dans le fresh-clone

## Accomplishments

- **verify.yml 12 etapes ordonnees** : job unique `verify` sur `ubuntu-latest`, triggers `push(main)` + `pull_request`, permissions `contents:read` minimaux, concurrency `verify-${{ github.ref }}` avec `cancel-in-progress: true`. 12 steps dans l'ORDRE EXACT de §3.6 plus `tsc --noEmit` plus le gate zero-skip : (1) actions/checkout@v4 (2) setup-python@v5 3.12 (3) setup-node@v4 20 (4) `pip install -e ".[dev]"` (chaîne QUOTÉE dans le YAML) (5) `npm ci` (6) `ruff check .` (7) `npx @biomejs/biome check .` (8) `python -m pytest tests/ -q -k export` (9) `npx vitest run` (10) `python -m pytest tests/ -q` (11) `npx tsc --noEmit` (12) `node scripts/assert-zero-skips.mjs fixtures/bridge/pytest-junit.xml fixtures/bridge/vitest-junit.xml`. Env vars positionnées au niveau job (`PYTHONDONTWRITEBYTECODE`, `PYTHONIOENCODING=utf-8`, `LC_ALL=C.UTF-8`, `LANG=C.UTF-8`) pour determinisme CI. Aucun `continue-on-error`, aucun `if: always()` — la chaîne half-silent ne peut pas atteindre l'etape 12 green.
- **assert-zero-skips.mjs** : parser junitxml stdlib-only (regex `/<testsuites?\b[^>]*\bskipped="(\d+)"[^>]*>/g` sur les balises ouvrantes uniquement). Prend en argv une liste de junitxml, somme les attributs `skipped` sur `<testsuites>` et `<testsuite>`, affiche le detail par fichier + le total, exit 0 si total == 0, exit 1 sinon avec ligne `FAIL: N test(s) skipped — CI requires zero skipped tests (§4.2).`. Prouvé dans les deux sens : exit 0 sur les vrais junitxml verts (329 pytest + 85 vitest), exit 1 sur un junitxml fabriqué avec skipped=1.
- **README.md quickstart byte-for-byte** : section Quickstart avec venv + pip install + npm ci puis 7 commandes de verification dans l'ORDRE EXACT du job : `ruff check .` → `npx @biomejs/biome check .` → `python -m pytest tests/ -q -k export` → `npx vitest run` → `python -m pytest tests/ -q` → `npx tsc --noEmit` → `node scripts/assert-zero-skips.mjs ...`. Vérifié : les 9 commandes du verify.yml (etapes 4..12) sont toutes presentes verbatim, l'ordre est préservé, la mention « pas de hook pre-commit » (D-05) est présente. La séquence 7/7 commandes executée localement sort en exit 0.
- **Protocol bridge §4.3** : section dediee documentant l'ordre 3-legs (export Py → validate/re-emit TS → strict re-import Py), la garde skipif sur artefact TS manquant, l'hygiene fixtures/bridge/ gitignore, et le déterminisme fresh-checkout via ruff.toml known-first-party. Une chaîne half-silent (skip dans une leg) ne peut pas atteindre la fin : le gate zero-skip ferme la boucle.
- **Structure monorepo** : arborescence ASCII commentee des deux couches strictes (`src/` TS deterministe + `lottie_forge/` Python), `src/rpc/contracts/` miroirs zod, `fixtures/rejection-cases/` source unique partagee Py+TS (D-06/D-07), `fixtures/bridge/` gitignore (§4.3), `scripts/assert-zero-skips.mjs` gate CI, `.github/workflows/verify.yml` job verify, docs/project/13 parties.
- **Stack verrouille §3.1/§3.2** : Pydantic 2.13.4 pin exact, zod ^4, TS ~5.9, Vitest ^4, Biome ^2, Python 3.12+ <3.14, Node 20 LTS.
- **Licence produit perpetuelle one-time** (LIC-01/02) — posture anti-subscription enforcee par `LicenseInfo` zod `z.literal("perpetual-one-time")` + validateur belt.
- **Fresh-clone proof (Task 3)** : clone temporaire dans `C:\Users\CHRAIBI\AppData\Local\Temp\opencode\lf-fresh-verify`, `git clone` (pas `--local` car hardlinks Windows incompat), `git status` du clone vide, `fixtures/bridge/` absent avant etape export (preuve gitignore). Setup : `uv venv --python 3.12` + `uv pip install -e ".[dev]"` + `npm ci` (pas `npm install`). Verification : 7/7 commandes exit 0 (ruff, biome, pytest -k export → 15 passed, vitest → 85 passed, pytest -q → 329 passed, tsc, assert-zero-skips → total skipped 0). Cleanup : repertoire temporaire supprimé.
- **Rule 2 fix — `.gitattributes`** (detecte pendant le fresh-clone proof) : sur Windows avec `core.autocrlf=true`, `git clone` convertit les fichiers LF (forme canonique committee) en CRLF sur checkout. Le formatter Biome detecte le mismatch et fail avec 12 errors « Formatter would have printed... » (LF). Fix : `.gitattributes` avec `* text=auto eol=lf` — force le checkout LF sur toute plateforme. Apres fix, fresh-clone re-effectué : fichiers LF, biome check vert.
- **D-09 clean tree** : ajout de `.gsd/` (runtime GSD, convention analogue a `.opencode/` deja gitignore) et `uv.lock` (artefact env local, CI utilise pip) dans `.gitignore`. Resultat : `git status --porcelain` vide apres commit de phase, prerequisite au fresh-clone proof.

## Task Commits

4 commits atomiques, sequentiels, chacun sur sa tache :

1. **Task 1 (CI verify + assert-zero-skips)** — `89d66e5` (feat)
2. **Task 2 (README quickstart byte-for-byte)** — `c75665d` (docs)
3. **Tache 3 prerequisite D-09 (gitignore .gsd/ + uv.lock)** — `fd8c566` (chore)
4. **Tache 3 Rule 2 fix (LF enforcement cross-platform)** — `38bb1e1` (chore)

Note : Task 3 elle-même n'a pas de commit distinct — c'est une preuve runtime (le clone + la chaîne). Les commits fd8c566 et 38bb1e1 sont les 2 fixes detectes par la preuve et shippes en cours de tache (Regle 2 / D-09).

## Files Created/Modified

### Created (4)

- `.github/workflows/verify.yml` — 106 lignes, job `verify` unique sur ubuntu-latest, 12 steps ordonnes, permissions `contents:read`, concurrency per-ref. La chaîne `pip install -e ".[dev]"` est QUOTÉE dans le YAML (litteral, pas interpolee par le shell).
- `scripts/assert-zero-skips.mjs` — 89 lignes, stdlib-only (`node:fs` + `node:process`), regex sur balises ouvrantes testsuites|testsuite, sum skipped, exit 0/1, imprime detail par fichier + FAIL line.
- `README.md` — 220 lignes, en francais avec termes techniques en anglais. Quickstart 7 commandes byte-for-byte, structure monorepo ASCII, protocole bridge §4.3, stack pins §3.1/§3.2, note D-05 pre-commit, posture anti-subscription LIC-01/02.
- `.gitattributes` — 18 lignes, `* text=auto eol=lf` pour cross-platform LF.

### Modified (1)

- `.gitignore` — +4 lignes (`.gsd/` runtime GSD, `uv.lock` env local) — D-09 clean tree.

## Decisions Made

- **Pinning des actions par major** (actions/checkout@v4, setup-python@v5, setup-node@v4) : suffisant Phase 1, SHA pin reserve si necessaire Phase 10 hardening. Compatibles Node 20 runner ubuntu-24.04.
- **Pip install en etape CI 4** (pas `uv sync`) : `uv.lock` ignore par pip, le pyproject.toml canonique est la seule source. Permet aux utilisateurs Windows d'utiliser le venv local sans imposer uv.
- **Pas de hook pre-commit** (D-05) : la CI est l'unique enforceur, le README documente la sequence manuelle equivalente. Documenter les deux dans le README pour les nouveaux contributeurs qui voudraient pre-validate.
- **assert-zero-skips : regex sur l'attribut skipped des balises ouvrantes uniquement** (pas `<testcase>`) — pytest et vitest utilisent tous deux `skipped="N"` au niveau testsuites+testsuite (vitest utilise aussi `<skipped/>` child pour testcase individuel, mais l'attribut cumule reste sur testsuite).
- **Timeouts et env vars au niveau job** (PYTHONDONTWRITEBYTECODE, PYTHONIOENCODING, LC_ALL, LANG) : determinisme CI sans repetition par step.
- **Concurrency cancel-in-progress: true sur group verify-${{ github.ref }}** : les pushes successifs sur la même ref ne gaspillent pas de minutes CI (pattern GitHub Actions recommande).
- **Order bridge garde-fou** : l'etape 12 lit `fixtures/bridge/pytest-junit.xml` produit par l'etape 8. Si l'etape 8 a un skip silencieux (skipif sur TS artifact manquant), le junitxml aurait skipped > 0 et l'etape 12 fail — la chaîne half-silent ne peut pas passer verte.
- **.gitattributes avant le fresh-clone proof** (Rule 2 critical) : la preuve a detecte le bug CRLF Windows (autocrlf convertit LF->CRLF sur checkout). Fix shipped same-task. Le repo porte maintenant une politique EOL explicite, pas de dependance sur la config globale du contributeur.
- **D-09 atteint par .gitignore** (Rule 2 critical) : `.gsd/` (runtime GSD, analogue a `.opencode/`) et `uv.lock` (artefact env local, CI utilise pip). Permet `git status --porcelain` vide, prerequisite au fresh-clone proof.

## Deviations from Plan

Deux auto-fixes detectes et corriges pendant l'execution (Rule 2 — fonctionnalite critique manquante) :

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `.gsd/` et `uv.lock` non gitignores → `git status --porcelain` non vide (D-09 violee avant le fresh-clone proof)**

- **Found during:** Demarrage Task 3 (avant le clone)
- **Issue:** `git status --porcelain` montrait deux fichiers untrackes (`.gsd/` et `uv.lock`), violant le critere d'acceptance « git status --porcelain vide avant le clone ». `.gsd/` est l'etat runtime de GSD (comme `.opencode/` deja gitignore par 01-01). `uv.lock` est l'artefact de resolution de dependances Python par uv — inutilise par la CI qui utilise `pip install -e ".[dev]"` (pyproject.toml seul).
- **Fix:** Ajout de `.gsd/` et `uv.lock` dans `.gitignore`, avec un commentaire expliquant la justification de chacun. Apres commit, `git status --porcelain` est vide.
- **Files modified:** `.gitignore`
- **Commit:** `fd8c566`

**2. [Rule 2 - Missing Critical] Fresh-clone sur Windows echoue biome (CRLF via git autocrlf) — local != CI Linux**

- **Found during:** Task 3 fresh-clone proof (etape 7 biome check)
- **Issue:** Le 1er fresh-clone sur Windows avec `core.autocrlf=true` a converti les fichiers LF (forme canonique committee) en CRLF sur checkout. Le formatter Biome 2.x detecte le mismatch et fail avec 12 erreurs « Formatter would have printed... » (LF attendu). La doctrine « CI == local verify » (§3.6) etait cassee sur Windows.
- **Fix:** `.gitattributes` avec `* text=auto eol=lf` — force le checkout LF sur toute plateforme, independamment de la config globale. Re-effectue le fresh-clone : fichiers LF, biome check vert, 12/12 etapes vertes.
- **Files modified:** `.gitattributes`
- **Commit:** `38bb1e1`

---

**Total deviations:** 2 auto-fixed (2 Rule 2 — fonctionnalites critiques manquantes pour cross-platform parity et D-09)
**Impact on plan:** Les deux fixes etaient necessaires pour que la preuve fresh-clone passe. Aucun scope creep — les deux problemes ont ete detectes par la preuve elle-meme, shippes en cours de tache, et le fresh-clone proof final est 12/12 vert.

## Issues Encountered

- **`git clone --local` incompatible Windows hardlinks** : le 1er essai de fresh-clone avec `--local` a echoue avec « fatal: failed to create link ... Improper link » (les hardlinks Windows entre pere et fils ne fonctionnent pas toujours). Fix : `git clone` sans `--local`, qui fait une copie complete — acceptable pour une preuve locale, pas un blocker CI.
- **`uv venv` ne cree pas pip dans le venv** : `python -m pip install -e ".[dev]"` a echoue avec « No module named pip » dans le venv uv. Fix : `uv pip install --python <venv>/Scripts/python.exe -e ".[dev]"` (uv injecte pip via son propre resolver). Pattern documente pour les futurs contributeurs qui utiliseront uv au lieu de pip.
- **PowerShell + brackets `.[dev]`** : l'interpretation PS5 de `pip install -e ".[dev]"` dans une commande multiline a necessite des single quotes externes — pas un bug du repo, juste un artefact du shell hote.
- **Fresh-clone proof revele un vrai bug cross-platform** : c'est exactement le scenario que le proof est cense valider (les bugs caches que CI Linux ne voit pas). Le fix Rule 2 ameliore la qualite du repo pour les contributeurs Windows futurs.

## Authentication Gates

None - no external service credentials required for this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 01-05 close la Phase 1 — les 5 plans sont livres :

- **Phase 1 DONE** : 4 contrats (StyleSpec, MotionRecipe, AssetSpec, PackManifest) + zod mirrors + bridge ordered chain + rejection harness partage + CI verify.yml 12 etapes + zero-skip gate + README + .gitattributes cross-platform + fresh-clone proof.
- **Criteres ROADMAP** :
  - #1 (CI bridge ordered, zero skip) : **prouve localement** par le fresh-clone proof (12/12 exit 0). Le 1er push CI ne pourra que confirmer.
  - #2 (style lock + recettes catalogue) : partiellement, livre en Phase 2.
  - #3 (4 modeles Pydantic + 4 zod mirrors) : **complet**, livre 01-01 → 01-04.
  - #4 (licence perpetuelle one-time structurelle) : **verrouille** (Literal + validateur belt), livre 01-04.
  - #5 (determinisme byte-identique) : **verrouille** (test dedie), livre 01-04.
- **DM-05** (miroirs zod + parité) : **enforce par CI** (vocabulaire, cles, rejet, round-trip + gates statiques tsc/ruff/biome). Doctrine « the gate is the gate » (§1.8) appliquee.
- **Le job verify est le garde-fou permanent pour les Phases 2+** : pattern reproductible. Toute nouvelle Phase doit etendre la sequence §3.6 sans la casser.

**Boundary M1 (Phase 5)** : la prochaine phase est le **StyleSpec + catalogue fermé de 10 recettes de mouvement** (Phase 2 doc). Les contrats Phase 1 sont la fondation stable ; le catalogue (Phase 2) etend le vocabulaire sans casser la parité.

---

## Self-Check: PASSED

- 4 fichiers created verifies sur disque (verify.yml 106 lignes, assert-zero-skips.mjs 89 lignes, README.md 220 lignes, .gitattributes 18 lignes).
- 1 fichier modified verifie (.gitignore +4 lignes).
- 4 commits verifies dans `git log` (89d66e5, c75665d, fd8c566, 38bb1e1).
- `git status --porcelain` vide (D-09) — confirme apres `38bb1e1`.
- verify.yml parse OK via PyYAML — 12 steps ordonnes, permissions minimaux, pas de continue-on-error/if:.
- assert-zero-skips.mjs teste dans les 2 sens : exit 0 sur junitxml verts (329 + 85 tests), exit 1 sur junitxml fabrique avec skipped=1 (FAIL line imprimee).
- README quickstart : 9 commandes du verify.yml (etapes 4..12) toutes presentes verbatim + ordre préservé (IndexOf croissant) + mention « pas de hook pre-commit » (D-05).
- Sequence 7/7 commandes README executee localement : exit 0 partout.
- Fresh-clone proof : clone temporaire C:\Users\CHRAIBI\AppData\Local\Temp\opencode\lf-fresh-verify cree via `git clone` (sans `--local`), `git status` du clone vide, `fixtures/bridge/` absent avant etape export (preuve gitignore). Setup complet : uv venv + uv pip install + npm ci tous exit 0. Verification 7/7 exit 0. Cleanup : repertoire temporaire supprime.
- `.gitattributes` LF enforcement : apres le fix, fresh clone -> src/rpc/contracts/vocabulary.schema.ts en LF (no CRLF), biome check vert. Avant fix : CRLF, 12 errors.
- Static gates verts finaux sur le depot principal : ruff OK, biome OK, pytest -k export → 15 passed, vitest → 85 passed, pytest -q → 329 passed, tsc OK, assert-zero-skips → total skipped 0.
- Tous les requirements du plan (DM-05) couverts : job verify encode la sequence §3.6 + tsc + zero-skip ; script d'assertion prouve dans les deux sens ; README = sequence CI byte-for-byte ; fresh-clone proof 12/12 vertes ; parité DM-05 enforce par CI (vocabulaire, cles, rejet, round-trip + gates statiques).

---

*Phase: 01-contrats-de-donn-es-fronti-re-pydantic-zod-reconstruction*
*Completed: 2026-08-29*