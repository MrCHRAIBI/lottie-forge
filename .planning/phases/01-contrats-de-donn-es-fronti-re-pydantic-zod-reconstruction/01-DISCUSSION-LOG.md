# Phase 1: Contrats de données & frontière Pydantic↔zod (reconstruction) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-29
**Phase:** 1 - Contrats de données & frontière Pydantic↔zod (reconstruction)
**Areas discussed:** Fidélité reconstruction, Outillage Python local, Cas de rejet partagés, Stratégie de branches

---

## Fidélité reconstruction

| Option | Description | Selected |
|--------|-------------|----------|
| Test-pour-test | Reproduire la suite de référence : mêmes classes, comptage cible 94/50, mêmes builders | |
| Parité de contrats | Mêmes gates/invariants, suite réécrite librement, comptage indicatif | |
| Hybride pragmatique | Mêmes invariants + cas piégeux obligatoires, réorganisation libre du reste | ✓ |

**User's choice:** Hybride pragmatique
**Notes:** Suivi de deux précisions : (1) les 4 cas piégeux à conserver obligatoirement sont accent\n (CR-01), 1200.0 (WR-06), rsplit @ (WR-01), Doublons + chemins précis (IN-08) — les 4 sélectionnés ; (2) le comptage 94/50 devient indicatif, les critères ROADMAP sont la seule mesure.

---

## Outillage Python local

| Option | Description | Selected |
|--------|-------------|----------|
| pip + venv | Séquence CI §3.6 identique (`pip install -e ".[dev]"`), zéro outil en plus | ✓ |
| uv local, pip CI | uv au quotidien, CI fidèle au doc | |
| uv partout | Rapide mais diverge du §3.6 | |

**User's choice:** pip + venv
**Notes:** Question complémentaire hooks git : « CI-only » sélectionné — pas de pre-commit, ruff/biome/tsc enforce en CI uniquement.

---

## Cas de rejet partagés

| Option | Description | Selected |
|--------|-------------|----------|
| Hybride JSON | Positifs via builders Python ; négatifs en fichiers JSON partagés pytest/vitest | ✓ |
| Builders + export | Les builders génèrent aussi les cas invalides | |
| Dupliqué | Suites maintenues en parallèle | |

**User's choice:** Hybride JSON
**Notes:** Emplacement : `fixtures/rejection-cases/`, un fichier par contrat. Format : réponse freeform de l'utilisateur retenue telle quelle — `{case_id, ref, model, payload, expect_paths?}` ; rejet toujours asserté des deux côtés ; `expect_paths` = parité des chemins d'erreur **par appartenance** (loc Pydantic normalisé ∈, path zod ∈), jamais sur le texte des messages ; `case_id` stable humain ; `ref` = ID documenté (CR-01, WR-01/04/06, DM-02, IN-08…).

---

## Stratégie de branches

| Option | Description | Selected |
|--------|-------------|----------|
| main direct | Commits atomiques sur main, branch protection au ship uniquement | ✓ |
| Branche par phase | Isolation plus forte, overhead merge constant | |
| Branche par plan | Granularité fine, overhead élevé | |

**User's choice:** main direct
**Notes:** Cohérent avec les commits atomiques GSD et la note §13.7 (branch protection activée au ship).

---

## the agent's Discretion

- Version initiale du package Python et backend de build (`pyproject.toml`)
- Organisation fine des fichiers `tests/domain/` et `tests/bridge/`
- Contenu du `.gitignore`
- Conventions de messages de commit
- Détails `ruff.toml` (hors `known-first-party` imposé)

## Deferred Ideas

Aucune — la discussion est restée dans le périmètre de la phase.
