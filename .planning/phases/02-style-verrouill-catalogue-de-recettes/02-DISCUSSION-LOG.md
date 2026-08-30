# Phase 2: Style verrouillé & catalogue de recettes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-30
**Phase:** 2 - Style verrouillé & catalogue de recettes
**Areas discussed:** Données des 10 recettes, Sémantique de la gate de bump, Vocabulaire theme_anchors, Fixture prompt + audit couverture

---

## Données des 10 recettes

### Q1 — Comment remplir intensity_range / shapes_supported / trigger_points des 8 recettes non spécifiées ?

| Option | Description | Selected |
|--------|-------------|----------|
| Je propose, tu valides | Valeurs proposées par l'agent, validation à la revue | |
| Tu spécifies ici | Valeurs dictées recette par recette, contrôle total | ✓ |
| Agent décide seul | Validation structurelle seulement | |

**User's choice:** Tu spécifies ici
**Notes:** Pour éviter 30 champs à dicter, une matrice complète a été proposée comme base (fade/draw-on verbatim §5.5.1, reste dérivé de la sémantique des keyframe_shape).

### Q2 — Matrice validée ou corrections ?

| Option | Description | Selected |
|--------|-------------|----------|
| Matrix validée telle quelle | Contenu verbatim catalogue.json | |
| Je dicte des corrections | Corrections recette par recette en texte libre | ✓ |

**User's choice:** 3 corrections justifiées puis matrice VERROUILLÉE :
1. `slide` → trigger_points `enter,exit` (slide-out canonique ; états de sortie des verticales §5.6 ; inversion compileur identique au exit de fade)
2. `wiggle` → intensity_range `[0.1,0.5]` (oscillation amortie à 1.0 = artefact, même logique que le plafond float)
3. `pulse` → intensity_range `[0.1,0.8]` ET trigger_points `enter,loop` (respiration ambiante plafonnée + one-shot d'apparition valide)
**Notes:** « Le reste est accepté tel quel. À faire valider par les validateurs structurels (§5.5.3) + audit de couverture §5.6. » Matrice finale transcrite dans CONTEXT.md D-01.

### Q3 — Le hash sha256 du style porte sur quoi ?

| Option | Description | Selected |
|--------|-------------|----------|
| Octets bruts du YAML | sha256 des octets commités, LF garanti par .gitattributes + loader | ✓ |
| Hash du JSON canonique | Insensible au formatage mais non vérifiable hors usine | |

**User's choice:** Octets bruts du YAML
**Notes:** Vérifiable au sha256sum à la main ; leçon CRLF Phase 1 citée.

### Q4 — palette.json commité comment ?

| Option | Description | Selected |
|--------|-------------|----------|
| Généré + test de sync | Dérivé du YAML, CI rouge si dérive | ✓ |
| Seconde source manuelle | Risque de drift, contre la source unique | |
| Différé en Phase 4 | Seulement quand un consommateur existe | |

**User's choice:** Généré + test de sync
**Notes:** —

### Q5 — baseline-frames/ en Phase 2 ?

**User's choice:** (note agent acceptée) Non créé — le doc §5.2.1 interdit de le committer vide, naît en Phase 4.

---

## Sémantique de la gate de bump

### Q1 — Que signifie « flaggé » concrètement en Phase 2 ?

| Option | Description | Selected |
|--------|-------------|----------|
| Fonction pure + test simulé | Flags structurés, rouge seulement dans le test de bump simulé | ✓ (partiel) |
| CI rouge sur pin stale | Tout pin stale parmi les fixtures = verify rouge | ✓ (combiné) |
| Rapport informatif | Artefact de revue sans pouvoir bloquant | |

**User's choice:** Combinaison tranchée des options 1 et 2 : fonction pure `scan_stale_pins(pins, current_version) -> flags structurés` à source injectable (fixtures Ph2 → store Ph5) + DEUX tests bloquants dans verify : (a) bump simulé → flags attendus, (b) garde permanente → zéro pin stale sur fixtures commitées. Rapport informatif exclu (« the gate is the gate »).
**Notes:** Sémantique Phase 5+ : store-backed, les flags alimentent la file de re-validation (yield Ph9, rebuild Ph10) et ne sont plus un échec CI ; le rouge CI ne porte que sur la cohérence du repo.

### Q2 — Structure des flags et parité TS ?

| Option | Description | Selected |
|--------|-------------|----------|
| Modèle Pydantic, sans zod | Gate côté Python, rien ne traverse la frontière | ✓ |
| Parité bridge complète | Miroir zod + cas de rejet partagés | |

**User's choice:** Modèle Pydantic, sans zod
**Notes:** —

### Q3 — Scope de re-validation calculé ou déclaratif ?

| Option | Description | Selected |
|--------|-------------|----------|
| Scope déclaratif en Ph2 | bump_class dérivé semver + scope déclaratif ; usage tokens → Phase 5+ | ✓ |
| Usage tokens calculé dès Ph2 | Nécessiterait d'enrichir AssetSpec, hors périmètre | |

**User's choice:** Scope déclaratif en Ph2
**Notes:** AssetSpec ne référence pas les tokens — la résolution d'usage arrivera avec le store.

---

## Vocabulaire theme_anchors

### Q1 — Liste fermée ou KebabToken ouvert ?

| Option | Description | Selected |
|--------|-------------|----------|
| Literal fermé 6 labels | primary, secondary, accent, background, success, danger — rejet au chargement | ✓ |
| KebabToken ouvert | Souple mais recolorisation silencieusement ratée possible | |

**User's choice:** Literal fermé 6 labels
**Notes:** Même philosophie qu'ADR-03 ; nouveau label = évolution same-commit.

### Q2 — Où vit le vocabulaire ThemeAnchorId ?

| Option | Description | Selected |
|--------|-------------|----------|
| Vocabulaire partagé same-commit | vocabulary.py + vocabulary.schema.ts, patron RecipeId | ✓ |
| Python-only | TS reçoit des données déjà validées | |

**User's choice:** Vocabulaire partagé same-commit
**Notes:** Compiler Ph3 (TS) et packager Ph8 consomment les anchors.

### Q3 — Relation anchors ↔ tokens palette ?

| Option | Description | Selected |
|--------|-------------|----------|
| Namespaces distincts | Validés indépendamment, mapping anchor→couleur = Ph8 (ADR-05) | ✓ |
| Cross-validation anchor↔palette | Couplage précoce que l'exemple du doc viole déjà | |

**User's choice:** Namespaces distincts
**Notes:** Noté pour éviter qu'un agent n'invente un couplage.

---

## Fixture prompt + audit couverture

### Q1 — Câblage prompt-fixture : avec ou sans template versionné ?

| Option | Description | Selected |
|--------|-------------|----------|
| Mécanisme + template squelette | Placeholders {{catalogue_json}}/{{catalogue_hash}}, test asserteur, Ph6 remplit | ✓ |
| Mécanisme seul, template en Ph6 | Critère « câblé au template versionné » virtuel jusqu'en Ph6 | |

**User's choice:** Mécanisme + template squelette
**Notes:** —

### Q2 — Audit de couverture §5.6 : inclus, et avec quelle coverage-map ?

| Option | Description | Selected |
|--------|-------------|----------|
| Audit inclus, mapping à valider | Je propose le mapping, tu valides | |
| Audit inclus, map minimale | 2-3 états par verticale, enrichie en Ph6 | |
| Différé en Phase 6 | Structure seulement quand les agents consomment | ✓ (variante utilisateur) |

**User's choice:** Audit INCLUS en Phase 2 avec coverage-map COMPLÈTE verrouillée (donnée produit, même statut que la matrice). Mécanique bloquante : (A) tout état → ≥ 1 recipe_id existant ; (B) tout recipe_id → ≥ 1 mapping (recette morte = rouge) ; (C) same-commit étendu à la coverage-map. Map complète fintech/dev tools/e-commerce dictée (16 états, transcrite dans CONTEXT.md D-15).
**Notes:** « La cohérence trigger fine sera enforce au contrat RecipePicker (Phase 6), pas dans l'audit Phase 2. »

### Q3 — Où atterrissent style_sha256 et catalogue_sha256 ?

| Option | Description | Selected |
|--------|-------------|----------|
| 2 hashes par asset | content_hashes étendu à 4 champs, same-commit §4.14 + zod + rejets | ✓ |
| Style asset / catalogue pack | Sémantique splitée, critère « chaque manifest » partiel | |

**User's choice:** 2 hashes par asset
**Notes:** AssetSpec devient le 5e contrat traversant touché par la Phase 2.

### Q4 — Verrous finals (texte libre avant écriture)

**User's choice:** Deux verrous inscrits au CONTEXT.md :
1. catalogue_sha256 = même régime que style_sha256 (octets bruts committés, LF normalisé, sha256sum hors usine, verbatim dans le prompt)
2. Points déjà résolus, pas des zones d'ombre : chargement conjoint TS avec parité de rejet « easing inconnu » des deux côtés (Py + zod superRefine) ; verify.yml zéro changement (nouveaux tests ramassés par les étapes existantes)

---

## the agent's Discretion

- Organisation fine des modules (loaders style/catalogue, module de gate, module prompt-fixture)
- Wording du template squelette (placeholders contractuels uniquement)
- catalogue_version initial et formatage JSON du catalogue
- Structure interne des tests (patron D-06/D-07/D-08 répliqué, réorganisation libre)
- baseline-frames/ non créé (note agent acceptée)

## Deferred Ideas

None — discussion stayed within phase scope
