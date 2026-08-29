# lottie-forge

Une **usine industrielle** de production d'illustrations — pipeline batch
« pack-at-a-time » qui génère des packs thématiques de 50 illustrations
vectorielles animées cohérentes (SVG + Lottie) avec exports dev-ready par
asset (composants React/Vue, widget Flutter, Lottie JSON, SVG statique,
variante dark-mode, manifest de traçabilité, rapport QA).

**Core value** : style visuel verrouillé + vocabulaire de mouvement
catalogué + exports dev-ready — avec first-pass yield > 70 % et coût
unitaire < €0,05 / asset.

> Vision et contraintes métier détaillées dans
> [`docs/project/01_Vision.md`](docs/project/01_Vision.md).
> Modèles de données dans
> [`docs/project/04_Modeles.md`](docs/project/04_Modeles.md).
> Stack verrouillé dans [`docs/project/03_Stack.md`](docs/project/03_Stack.md).

---

## Quickstart

La séquence ci-dessous est **byte-for-byte identique** au job CI
[`verify`](.github/workflows/verify.yml). La CI est l'unique enforceur
des invariants — pas de hook pre-commit local (D-05) ; la séquence
manuelle ci-dessous en est l'équivalent local.

### Pré-requis

| Outil | Version | Justification |
|---|---|---|
| Python | 3.12 (et < 3.14) | `requires-python = ">=3.12,<3.14"` (pyproject.toml) |
| Node.js | 20 LTS | `engines.node = ">=20"` (package.json) — Vite 7 / Vitest 4 |
| `uv` | latest | Gestion venv + install des deps Python (résolu en CI via pip) |

### Installation locale (Windows)

```powershell
# 1. Venv + install Python deps (Pydantic 2.13.4 pin exact + pytest + ruff)
python -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[dev]"

# 2. Install Node deps reproductible (package-lock.json committed, §3.6)
npm ci
```

### Vérification complète — séquence CI byte-for-byte

Exécuter ces 7 commandes dans l'ordre — c'est exactement la suite que la
CI exécute sur `ubuntu-latest` (12 étapes dans le workflow, certaines
étapes de setup ne sont visibles qu'en CI : `checkout`, `setup-python`,
`setup-node`).

```bash
# Étape 6 — lint Python (ruff, isort, pyupgrade)
ruff check .

# Étape 7 — lint TS (Biome, scope src/**)
npx @biomejs/biome check .

# Étape 8 — bridge leg 1 : pytest export écrit fixtures/bridge/*.from-python.json
python -m pytest tests/ -q -k export

# Étape 9 — bridge leg 2 : vitest valide via zod et re-émet *.from-ts.json
npx vitest run

# Étape 10 — bridge leg 3 : pytest strict re-import des sorties TS
python -m pytest tests/ -q

# Étape 11 — type-check TS (z.infer<...> exports cohérents)
npx tsc --noEmit

# Étape 12 — gate zéro-skip : exit 1 si un junitxml contient skipped > 0
node scripts/assert-zero-skips.mjs fixtures/bridge/pytest-junit.xml fixtures/bridge/vitest-junit.xml
```

**Attendu** : chaque commande sort en `exit 0`. La commande 12 imprime
`total skipped: 0` puis sort en `exit 0`. Toute sortie non-nulle signifie
qu'un invariant est cassé — c'est l'inverse exact d'un skip silencieux :
la chaîne est half-silent ou green, jamais entre les deux (§4.2).

> L'install initiale (venv + pip + npm ci) n'est pas répétée à chaque
> run : c'est l'équivalent des étapes 4 et 5 de la CI.

---

## Structure du monorepo

Deux couches strictes à la racine, aucune `dict[str, Any]` ne traverse
la frontière (§2.5) :

```
.
├── lottie_forge/             # Python — orchestration + contrats
│   └── domain/               # Modèles Pydantic v2 strict (extra=forbid, strict=True)
│       ├── _shared.py        # STRICT_CONFIG, TOKEN_NAME_PATTERN, KebabToken
│       ├── vocabulary.py     # RecipeId clos — 10 ids (ADR-03, same-commit)
│       ├── style.py          # StyleSpec (DM-01)
│       ├── motion.py         # MotionRecipe + MotionParams (DM-02)
│       ├── asset.py          # AssetSpec (DM-03)
│       └── pack.py           # PackManifest + LicenseInfo (DM-04, LIC-01/02)
│
├── src/                      # TypeScript — backbone déterministe + exports
│   └── rpc/contracts/        # Miroirs zod strictObject des modèles Python
│       ├── vocabulary.schema.ts    # z.enum(RECIPE_IDS) — same-commit (ADR-03)
│       ├── style-spec.schema.ts    # StyleSpecSchema
│       ├── recipe.schema.ts        # MotionRecipeSchema
│       ├── asset-spec.schema.ts    # AssetSpecSchema
│       └── pack-manifest.schema.ts # PackManifestSchema + LicenseInfoSchema
│
├── tests/
│   ├── domain/               # Suites positives + rejet par modèle Py
│   └── bridge/               # Suites bilingues — pytest export + re-import
│
├── fixtures/
│   ├── rejection-cases/      # Cas de rejet partagés (D-06/D-07) — commités
│   └── bridge/               # Generated at test time — gitignored (§4.3)
│
├── scripts/
│   └── assert-zero-skips.mjs # Gate CI — exit 1 si junitxml skipped > 0
│
├── docs/project/             # Cahier des charges aligné (13 parties)
│   ├── 01_Vision.md          # Posture anti-subscription, piliers
│   ├── 03_Stack.md           # Verrouillage stack + §3.6 séquence CI
│   └── 04_Modeles.md         # Contrats Pydantic ↔ zod, §4.2 gates CI
│
├── .github/workflows/
│   └── verify.yml            # Job verify — 12 étapes ordonnées + gate
│
├── pyproject.toml            # Pydantic 2.13.4 pin exact + pytest junitxml
├── package.json              # zod ^4, vitest ^4, biome ^2, TS ~5.9
├── ruff.toml                 # known-first-party = lottie_forge+fixtures
├── vitest.config.ts          # junit reporter -> fixtures/bridge/
├── tsconfig.json             # strict + verbatimModuleSyntax + noEmit
└── biome.json                # scope src/** + formatter
```

---

## Protocole de bridge bilingue (ordonné — §4.3)

La parité Pydantic ↔ zod est enforce par une chaîne à 3 legs exécutée
dans cet ordre strict, avec garde `skipif` sur l'artefact TS manquant :

1. **Export Py** : `python -m pytest tests/ -q -k export` — les
   *single sources of fixture truth* (`tests/bridge/fixtures.py`)
   produisent les payloads initiaux et écrivent
   `fixtures/bridge/<contract>.from-python.json` +
   `<contract>.schema-keys.json`.
2. **Validate / re-emit TS** : `npx vitest run` — chaque miroir zod
   valide le payload Py, asserte l'égalité profonde (round-trip),
   exécute les rejets miroirs, et ré-émet
   `fixtures/bridge/<contract>.from-ts.json`.
3. **Strict re-import Py** : `python -m pytest tests/ -q` — le payload
   TS est re-validé sous Pydantic strict. Toute divergence byte échoue.

**Ordre-garde skipif** : la leg 3 skip si l'artefact TS manque. En CI la
chaîne est lockstep (les 3 legs se suivent), donc aucun skip silencieux
n'est possible — le gate zéro-skip (étape 12) ferme la boucle.

**Hygiène** : `fixtures/bridge/` est gitignoré (généré au test-time,
jamais committé). `fixtures/rejection-cases/` est committé — c'est la
source unique des cas de rejet partagés entre pytest parametrize ET
vitest test.each (D-06/D-07).

**Déterminisme fresh-checkout** : `ruff.toml` porte
`[lint.isort] known-first-party = ["lottie_forge", "fixtures"]` — le
lint produit un résultat identique avec ou sans artefacts de test sur
disque. La CI ubuntu == le local Windows (§4.3).

---

## Stack verrouillé

Pins exacts — toute déviation requiert une revue et un commit commun
entre `pyproject.toml` et `package.json`.

### Python (§3.1)

| Package | Version | Rôle |
|---|---|---|
| `pydantic` | **2.13.4** (pin exact) | Source de vérité des contrats |
| `pytest` | ≥ 8 | Tests + `addopts --junitxml=fixtures/bridge/pytest-junit.xml` |
| `ruff` | latest | Lint + import sort (linters only, no formatter) |
| Python | 3.12+ (< 3.14) | Runtime — wheels Pydantic 2.13 + pin `requires-python` |

### TypeScript (§3.2)

| Package | Version | Rôle |
|---|---|---|
| `zod` | ^4 | Miroirs runtime des contrats Pydantic |
| `typescript` | ~5.9 | `verbatimModuleSyntax: true` |
| `vitest` | ^4 | Tests + junit reporter |
| `@biomejs/biome` | ^2 | Lint + format, scope `src/**` |
| `@types/node` | ^20 | Type-check du code bridge |
| Node.js | 20 LTS | `engines.node ">=20"` |

### Notes d'outillage

- **Pas de hooks pre-commit (D-05)** : la CI est l'unique enforceur.
  Cette séquence manuelle en est l'équivalent local — pas de raccourci.
- **Lint identique local/CI** : grâce à `ruff.toml`
  `known-first-party = ["lottie_forge", "fixtures"]` (§4.3).
- **`package-lock.json` committé** : `npm ci` échoue sur drift (D-09).
- **Fixtures `bridge/` gitignorées** : générées au test-time, jamais
  committées.

---

## Licence

Code sous licence propriétaire — voir [`LICENSE`](LICENSE) (à venir
Phase 10 / hardening).

Le **produit** (les packs d'illustrations générés par cette usine)
est distribué sous licence **perpetual-one-time** (anti-subscription
structurel, LIC-01/02). Cette posture est enforce par le contrat
`LicenseInfo` (zod `z.literal("perpetual-one-time")` + validateur belt)
— une licence de forme abonnement est structurellement impossible à
construire.