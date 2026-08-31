---
phase: 2
slug: style-verrouill-catalogue-de-recettes
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-31
---

# Phase 2 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| dépôt → loader | fixtures committées (`style.yaml`, `catalogue.json`, `coverage-map.json`) parsées et hashées au chargement | données de style/catalogue internes, sensibilité faible — intégrité critique (future entrée prompt LLM Phase 6) |
| pip/uv → venv | installation du paquet `pyyaml` (chaîne d'approvisionnement) | dépendance tierce — risque typosquatting |
| payload entrant → modèles | tout dict/JSON soumis aux contrats Pydantic/zod (StyleRefinement, ContentHashes, CatalogRecipe) | futur output LLM (Phase 6) — surface d'injection |
| fixtures committées → gates | catalogue/coverage-map/rejection-cases lus par les tests bloquants | pins de versions + couverture — falsifiable pour masquer un trou |
| template versionné → prompt rendu | substitution de placeholders sur fichier committé | contenu catalogue embarqué — future entrée LLM |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-02-SC | Tampering | pip install pyyaml (02-01) | high | mitigate | Gate bloquante humaine : légitimité PyYAML confirmée sur pypi.org/project/PyYAML avant installation (`cfe22a6`, 02-01-SUMMARY) ; `pyyaml>=6.0.2,<7` pinné dans pyproject.toml | closed |
| T-02-01 | Tampering | parsing YAML/JSON (02-01, 02-04) | medium | mitigate | `yaml.safe_load` exclusif, jamais `yaml.load` nu (`lottie_forge/loading/style.py:192`) ; JSON via `model_validate_json`/`JSON.parse`, aucun eval | closed |
| T-02-02 | Tampering | chemins de fixtures/template (02-01, 02-04, 02-05, 02-06) | low | mitigate | Constantes `REPO_ROOT` (`loading/style.py:63`, `loading/catalogue.py:43`), template à chemin relatif module (`prompts/render.py`) — aucune override env/user | closed |
| T-02-03 | Tampering | régime de hash sha256 (02-01) | medium | mitigate | `normalize_lf` + `sha256_hex` impl unique (`loading/style.py:98`), test de reproductibilité deux lectures → même sha (`tests/bridge/test_catalogue_bridge.py:101`), `.gitattributes` eol=lf | closed |
| T-02-04 | Repudiation | messages d'erreur Pydantic (02-01) | low | accept | Risque documenté — voir Accepted Risks Log | closed |
| T-02-04 | DoS | bornes des listes/strings (02-02 → 02-05) | medium | mitigate | Bornes systématiques : `sub_palette` 1..16, tokens max 64 (KebabToken), recipes 8..12, anchors 1..16, shapes 1..5, triggers 1..3, durées 100..10000, `Sha256Hex` 64/64 — côté py ET miroirs zod | closed |
| T-02-05 | Tampering | injection de visuel via delta + catalogue embarqué (02-02, 02-06) | medium | mitigate | Modèles clos `extra="forbid"` (`STRICT_CONFIG`) : hex/path/svg inexprimables (rejets sr01/sr02 bloquants des deux côtés) ; injection verbatim single-pass WR-02 jamais re-scannée + hash D-03 (`prompts/render.py:97-99`) | closed |
| T-02-06 | Information Disclosure | messages d'erreur/audit (02-02 → 02-06) | low | accept | Risque documenté — voir Accepted Risks Log | closed |
| T-02-07 | Tampering | hash de contenu falsifiable (02-03) | medium | mitigate | `Sha256Hex` strict (64 hex minuscules, `domain/asset.py:85`) dans `ContentHashes` clos 4 champs `extra="forbid"` — 5e champ ou digest malformé rejeté des deux côtés | closed |
| T-02-08 | Tampering | catalogue/coverage-map falsifiés (02-04, 02-05) | medium | mitigate | Audit de couverture D-14 A/B bloquant (`test_catalogue_bridge.py:223-277`) + règle D-14C same-commit 4 fichiers (`test_vocabulary.py:339`) — toute altération exige un commit visible cohérent | closed |
| T-02-09 | Tampering | contournement de la gate de bump (02-05) | medium | mitigate | `scan_stale_pins` (`gates/stale_pins.py:124`) + garde permanente avec assert de non-vacuité (`test_stale_pins.py:206`) — le bump frauduleux rougit le verify | closed |
| T-02-10 | Tampering | placeholder résiduel dans le prompt (02-06) | low | mitigate | Garde `ValueError` si `{{`/`}}` subsiste après rendu (`prompts/render.py:136-139`) + test d'absence de résidu (`tests/prompts/test_prompt_fixture.py`) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

Note : l'ID `T-02-04` est réutilisé entre plans avec deux sens distincts (Repudiation en 02-01, DoS bornes en 02-02+). Les deux lignes sont conservées telles qu'écrites à plan-time ; aucune ambiguïté de mitigation.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-02-04 (Repudiation) | Les erreurs Pydantic citent l'input — outil local mono-opérateur, aucune surface exposée ; pas de partie adverse à répudier | Utilisateur (disposition plan-time, 02-01-PLAN) | 2026-08-31 |
| AR-02 | T-02-06 (Information Disclosure) | Messages d'erreur/audit locaux mono-opérateur citant ids/chemins de loc ; les harnais comparent les chemins de loc seuls, jamais les messages | Utilisateur (disposition plan-time, 02-02 → 02-06) | 2026-08-31 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-31 | 12 | 12 | 0 | gsd-secure-phase (L1 grep-depth, ASVS L1, block_on: high) |

Méthode : registre authorié à plan-time (`register_authored_at_plan_time: true`), classification L1 par grep — chaque disposition `mitigate` vérifiée par son implémentation dans le dépôt (références fichier:ligne dans le registre) ; les dispositions `accept` documentées ci-dessus. `threats_open: 0` + ASVS L1 → vérification grep-depth suffisante (short-circuit workflow), auditor L2/L3 non requis.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-31
