# Cahier des Charges Aligné — lottie-forge
## Partie 4 — Modèles de Données & Contrats de Frontière (Pydantic ↔ zod)

> **Statut** : Partie 4 du cahier des charges aligné (Option B). Décrit la couche contrat **telle que construite et vérifiée en Phase 1** (94 pytest + 50 vitest verts, ruff/biome/tsc verts), plus les contrats à venir des Phases 2→8.
> **Références** : REQUIREMENTS DM-01→05, LIC-01/02 · ADR-01/03 · 01-01→01-04 SUMMARYs + audit-fix (commits 6f78122→4d91bf7) · Parties 1–3.

---

## 4.1 Principes de la couche contrat

| # | Principe | Traduction technique |
|---|----------|----------------------|
| 1 | **Le contrat est la source de vérité** | Chaque payload cross-boundary est un modèle Pydantic v2 ; jamais de `dict[str, Any]` ni de JSON non typé |
| 2 | **Double représentation identique** | Pydantic = *spec* ; zod = *gate runtime* TS ; parité testée (4.2) |
| 3 | **Strict partout** | `ConfigDict(extra="forbid", strict=True)` côté Python ; `z.strictObject` côté TS ; aucune coercion (`"2.5"` rejeté pour un float) |
| 4 | **Enveloppes bornées (anti-DoS)** | `max_length` sur toute chaîne, min/max sur toute liste, bornes sur tout numérique ; regex plates (pas de backtracking catastrophique) |
| 5 | **Vocabulaires fermés** | `Literal[...]` / `z.enum(...)` ; le LLM *choisit* dans un clos, n'*invente* jamais |
| 6 | **Déterminisme de sérialisation** | `model_dump_json()` byte-identique pour contenus égaux ; floats **fractionnaires uniquement** (jamais `2.0`, toujours `2.5`) pour parité de formatage Py/JS |
| 7 | **Aucun canal de motion ad-hoc (ADR-01)** | Aucun champ n'exprime SMIL/CSS-keyframe ; le seul vocabulaire de motion = recette (`recipe_id` + params) |

---

## 4.2 Harnais de parité & règle same-commit

Quatre mécanismes indépendants verrouillent la parité :

| Mécanisme | Ce qu'il verrouille |
|---|---|
| **Parité de vocabulaire** | Listes closes identiques des deux côtés + invariant 8–12 asserté (ADR-03) |
| **Parité de schéma (keys)** | `Object.keys(Schema.shape)` (zod) == clés `properties` de `model_json_schema()` (Py) |
| **Parité de rejet** | Mêmes payloads invalides rejetés par Pydantic strict ET zod `safeParse` (suites miroirs négatives paramétrées) |
| **Round-trip ordonné** | Py dump → zod validate/re-emit (`JSON.parse(JSON.stringify(parsed))`) → Py strict re-import, égalité profonde |

**Règle same-commit (ADR-03)** : tout changement d'appartenance d'un vocabulaire clos touche `vocabulary.py` **et** `vocabulary.schema.ts` (et `catalogue.json` dès la Phase 2) dans le **même commit**. Un test structurel interdit toute seconde liste d'ids hardcodée.

**Gates CI associées** : `npx tsc --noEmit` (type-check des `z.infer` exportés) ; CI asserte **zéro test bridge skippé** (junitxml + assertion `skipped == 0`) — une chaîne bridge à moitié silencieuse ne peut pas passer au vert.

---

## 4.3 Protocole de bridge bilingue (ordonné)

1. `python -m pytest tests/ -q -k export` — construit les fixtures via les *single sources of fixture truth* (`make_style_spec()`, `make_recipe()`, `make_asset()`, `make_pack()` dans `tests/bridge/fixtures.py`) ; écrit `fixtures/bridge/*.from-python.json`.
2. `npx vitest run` — valide avec zod, asserte l'égalité profonde, exécute les rejets miroirs, ré-émet `*.from-ts.json`.
3. `python -m pytest tests/ -q` — re-valide la sortie TS sous Pydantic strict ; asserte l'égalité avec l'original.

**Hygiène** : `fixtures/bridge/` généré au test-time, **gitignoré** ; suites d'import en `skipif` si `*.from-ts.json` manquant (garde d'ordre, rendue impossible en CI par 4.2) ; une seule source de vérité par fixture.

**Déterminisme fresh-checkout** : `ruff.toml` porte `[lint.isort] known-first-party = ["lottie_forge", "fixtures"]` — le lint est identique avec ou sans artefacts de test sur disque (CI ubuntu == local Windows).

---

## 4.4 Vocabulaire clos `RecipeId` (DM-02, ADR-03)

- **10 ids verrouillés Phase 1** (ordre canonique) : `fade`, `slide`, `bounce`, `pulse`, `draw-on`, `rotate`, `scale-pop`, `float`, `wiggle`, `orbit`.
- Invariant **8 ≤ n ≤ 12** asserté des deux côtés.
- Python : `RecipeId = Literal[*RECIPE_IDS]` (star-unpack 3.12 sur le tuple canonique de `domain/vocabulary.py`) ; TS : `z.enum(RECIPE_IDS)` + `type RecipeId = typeof RECIPE_IDS[number]`.
- Rejet de tout id hors catalogue (`disco-spin` → `ValidationError`) ; 10 ids paramétrés en tests positifs ; bornes 100–10000 sur `duration_ms` en strict (`"1200"` string rejeté).
- Le catalogue de **données** (durées, easings, `theme_anchors`) arrive en Phase 2 (Partie 5) ; les ids ci-dessus en sont la clé primaire.

---

## 4.5 `StyleSpec` (DM-01)

| Champ | Type / bornes | Règles |
|---|---|---|
| `style_version` | `str`, regex `^\d+\.\d+\.\d+$` (points **échappés** des deux côtés) | **Requis, sans défaut** — une spec non pinnée ne peut pas exister |
| `viewBox` | `Size{width,height: int 16..2048}` | — |
| `stroke_widths` | `StrokeWidths{thin,default,bold: float 0.25..16}` | Cross-field strict : `thin < default < bold` |
| `corner_radii` | `CornerRadii{small,medium,large: float 0..48}` | Cross-field : `small <= medium <= large` |
| `palette` | `list[PaletteToken]` 2..16 | Noms kebab **uniques** ; `hex` regex `^#[0-9a-fA-F]{6}$` |
| `easing_curves` | `list[EasingCurve]` 2..8 | `control_points` : exactement 4 floats 0..1 |

- `max_length 64` sur noms kebab (convention post-audit WR-04, appliquée Py+zod même commit).
- Cross-field en `model_validator` (Py) / `.superRefine` (TS), équivalence prouvée par suites miroirs.
- Constantes partagées (`STRICT_CONFIG`, `TOKEN_NAME_PATTERN`) dans `domain/_shared.py` (pas dupliquées par modèle).

---

## 4.6 `MotionRecipe` + `MotionParams` (DM-02)

| Champ | Type / bornes | Règles |
|---|---|---|
| `recipe_id` | `RecipeId` importé (jamais redéclaré) | Rejet hors catalogue |
| `family` | `str` kebab, max 64 | Libre en v1 ; resserrement `Literal` possible Phase 2 |
| `duration_ms` | `int` 100..10000 | Strict |
| `easing` | `str` kebab | Référencera `easing_curves` de la StyleSpec en Phase 2 |
| `params` | `MotionParams` (nested, même config strict) | `amplitude: float 0..1` ; `direction: Literal["up","down","left","right","none"]` ; `loops: int 1..10` |
| `theme_anchors` | `list[KebabToken]`, max 16, défaut `[]` | Min 1 imposé au niveau **catalogue** en Phase 2 (MOT-03) |

**Contrainte `KebabToken` (fix CR-01)** : la validation des items est possédée par **pydantic-core**, pas par un validateur fait main (le `$` de `re` acceptait `"accent\n"` côté Python alors que zod rejetait) :

```python
KebabToken = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9-]*$", max_length=64)]
```

Cas de parité de rejet `"accent\n"` testé des deux côtés ; `fullmatch` explicite dans `test_vocabulary.py`.

---

## 4.7 `AssetSpec` (DM-03)

| Champ | Type / bornes | Règles |
|---|---|---|
| `asset_id` | regex `^a-\d{3}$` | 50 slots, exactement 3 chiffres |
| `style_ref` | regex `^[a-z][a-z0-9-]*@\d+\.\d+\.\d+$` | **Pin name@version triple** = ancre de dérive STY-03 ; version partielle rejetée |
| `recipe_ref` | `RecipeId` | Vocabulaire clos réutilisé au niveau asset |
| `composition_meta` | `CompositionMeta{shape_group_names: list 1..24, kebab ^[a-z][a-z0-9-]{2,31}$}` | Métadonnées Phase 1 ; le `CompositionSpec` agent (Phase 6) **étendra**, ne remplacera pas |
| `content_hashes` | `ContentHashes` **modèle clos 2 champs** | `svg_sha256`, `lottie_sha256` : `^[a-f0-9]{64}$` minuscules ; pas de mapping ouvert ; `dotlottie_sha256` ajouté en Phase 8 par édition même commit |

**Vérification pack-level de `style_ref` par opérations string (WR-01)** : `rsplit("@", 1)` + comparaison exacte — aucune regex re-dérivée susceptible de quirks d'ancrage `$`.

---

## 4.8 `PackManifest` + licence structurelle (DM-04, LIC-01/02)

| Champ | Type / bornes | Règles |
|---|---|---|
| `pack_id` | regex `^pack-[a-z][a-z0-9-]*-\d{4}-\d{2}-\d{2}$` | Date **nominale** : forme seulement, pas de validation calendrier (non miroirable en zod) — documenté (IN-07) |
| `style_version` | regex `^\d+\.\d+\.\d+$` | Un pack est **mono-style** |
| `assets` | `list[AssetSpec]` 1..50 | Pack vide rejeté |
| `totals` | `PackTotals{asset_count ge 1, cost_eur 0..1000, first_pass_yield 0..1}` | `asset_count == len(assets)` |
| `license` | `LicenseInfo` | Ci-dessous |

**Trois validateurs agrégés séparés** (un invariant chacun, message pinpoint ; stratégie **collect-all** avec chemins précis `["assets", idx, "asset_id"]` côté zod, IN-08) :
1. **Unicité** des `asset_id` (sonde d'adjacence : doublons rejetés, jamais fusionnés) ;
2. **Cohérence de compte** `totals.asset_count == len(assets)` ;
3. **Mono-style** : suffixe version de chaque `style_ref` == `style_version` du pack.

**Licence structurelle** : `LicenseInfo{license_id: ^[a-z0-9-]+$; terms: Literal["perpetual-one-time"]; commercial_use: bool; attribution_required: bool}` + `model_validator` imposant `commercial_use == True` et `attribution_required == False`. Une licence de type abonnement **ne peut pas être construite** (le `Literal` est la gate ; le validateur la ceinture). Miroir zod : `z.literal` + `superRefine`.

**Sonde de déterminisme** : deux packs de contenu égal construits indépendamment → `model_dump_json()` **byte-identique**.

---

## 4.9 Miroirs zod & asymétrie pinnée (DM-05)

- Chaque modèle Python a son miroir `z.strictObject` (nested compris) ; exports `export type X = z.infer<typeof XSchema>` depuis `src/rpc/contracts/`.
- **Asymétrie pinnée (WR-06)** : `z.number().int()` accepte `1200.0` là où Pydantic strict rejette `1200.0` — non fermable côté zod → **pinné délibérément** : test bridge documentant que **Python est l'autorité la plus stricte** ; toute entrée TS est traitée comme non fiable et re-validée au re-import.
- Builders de fixtures partagés (`tests/bridge/fixtures.py`) ; imports fonction-level hoistés ; `_hex` dédupliqué (le test importe depuis le modèle).

---

## 4.10 Contrats cross-boundary : existants & à venir

| Contrat | Direction | Rôle | Livré en |
|---|---|---|---|
| `StyleSpec` / `RecipeId` / `MotionRecipe` / `AssetSpec` / `PackManifest` | Py ↔ TS | Contrats de style, motion, traçabilité, agrégation, licence | **Phase 1 ✔** |
| `StyleRefinement` | Py (agent) | Delta-only à la StyleSpec — jamais de SVG/path data (STY-02) | Phase 6 |
| `RecipeCatalogue` | fixture Py + TS | Catalogue versionné chargé des deux côtés (MOT-04) | Phase 2 |
| `RenderSpec` | Py → TS | Entrée du Motion Compiler | Phase 3 |
| `LottieJSON` | TS → Py | Sortie canonique ; subset strict validé zod | Phase 3 |
| `SVG` (string) | TS → Py | Sortie du Sanitizer, persistée | Phase 3 |
| `QAReport` | TS → Py | Sortie d'Anim QA, persistée | Phase 4 |
| `PackageRequest` / `PackageResult` | Py ↔ TS | Entrée/sortie du Packager | Phase 8 |

**Règle** : aucun `dict[str, Any]` ne traverse la frontière ; seul ce qui traverse a un miroir zod (les payloads purement Python — coût, yield — n'en ont pas).

---

## 4.11 Schémas d'IDs, versions & hashes

- `asset_id` : `a-\d{3}` · `pack_id` : `pack-<slug>-YYYY-MM-DD` · `style_ref` : `name@MAJOR.MINOR.PATCH`.
- **IDs SVG/Lottie** : assignés par le **Motion Compiler** (jamais le LLM) selon `{asset_id}_{component}_{role}` — stables across régénérations (base du theming, hooks CSS, manifest).
- Hashes de contenu : sha256 hex 64 minuscules ; modèle clos ; extension par **édition même commit** (règle 4.2).

---

## 4.12 Surface de tests & gates (état réel post-audit)

- **pytest : 94** · **vitest : 50** · `ruff` / `biome` / `tsc --noEmit` verts ; chaîne bridge ordonnée verte depuis checkout frais.
- Suites de rejet paramétrées miroirées (strict typing, bornes, patterns, extra keys, longueurs de listes, cross-field, unicité palette, `accent\n`).
- CI `verify` (ubuntu-latest) : 10 étapes ordonnées (checkout → py 3.12 → node 20 → `pip install -e ".[dev]"` → `npm ci` → ruff → biome → `pytest -k export` → vitest → `pytest -q`) + `tsc --noEmit` + zero-skip asserté.
- `pyyaml` déclaré réservé Phase 2 (commentaire pyproject, IN-02) — pas retiré.

---

## 4.13 Couverture des exigences

| Exigence | Couverture |
|---|---|
| DM-01 | StyleSpec strict, champs numériques versionnés bornés |
| DM-02 | MotionRecipe, vocabulaire clos 8–12, ids inconnus rejetés |
| DM-03 | AssetSpec (asset_id, style_ref pin, recipe_ref, composition_meta, content_hashes clos) |
| DM-04 | PackManifest (unicité, compte, mono-style, totals, licence) |
| DM-05 | Miroirs zod + parité (schéma, rejet, round-trip) + gates CI |
| LIC-01/02 | Licence perpétuelle one-time **structurelle** (Literal + validateur) |
| STY-01/03 | Mono-style + pin `name@version` comme ancre de re-validation |

---

## 4.14 Extensions différées (règle « même commit »)

- `dotlottie_sha256` dans `ContentHashes` → Phase 8 (quand l'artefact existe).
- `family` de `MotionRecipe` resserré en `Literal` → Phase 2 si le catalogue le justifie.
- `theme_anchors` min 1 par recette (MOT-03) → validateur niveau catalogue Phase 2.
- `CompositionSpec` / `MotionRecipeSelection` (sorties d'agents) → Phase 6 ; ils **étendent** les métadonnées Phase 1, ne les remplacent pas.

---

*Fin de la Partie 4. Partie suivante : **Partie 5 — Verrouillage du Style & Catalogue de Recettes (Phase 2)**.*