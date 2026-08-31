# lottie-forge

## What This Is

Une **usine industrielle** (pas un outil) de production d'illustrations : pipeline batch « pack-at-a-time » qui génère des **packs thématiques de 50 illustrations vectorielles animées cohérentes** (SVG + Lottie) avec exports dev-ready par asset (composants React/Vue, widget Flutter, Lottie JSON, SVG statique, variante dark-mode, manifest de traçabilité, rapport QA). Motorisation hybride : agents LLM non déterministes (idéation, style, composition) enveloppés dans des modules de code déterministes (Motion Compiler, SVG Sanitizer, Anim QA, Packager). Client final : développeurs web/mobile/desktop achetant des packs one-time (posture anti-subscription).

## Core Value

Un style visuel verrouillé + un vocabulaire de mouvement catalogué + des exports dev-ready — avec **first-pass yield > 70 %** et **coût unitaire < €0,05 / asset**. Si tout le reste échoue, un pack de 50 assets doit passer le QA du premier coup à plus de 70 %, à moins de €0,05 l'asset.

## Business Context

- **Customer** : développeurs web / mobile / desktop voulant des illustrations animées cohérentes sans abonnement à une stock library
- **Revenue model** : achat one-time de packs thématiques (anti-subscription explicite), licence perpétuelle
- **Success metric** : first-pass yield > 70 % et coût < €0,05/asset sur les 10 derniers packs (KPI-01/02)
- **Strategy notes** : différenciateur 4 piliers = style lock + recettes de mouvement + exports multi-frameworks + licence perpétuelle (voir `docs/project/01_Vision.md` §1.3)

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Contrats de données Phase 1 : modèles Pydantic (`StyleSpec`, `MotionRecipe`, `AssetSpec`, `PackManifest`) + miroirs zod stricts + bridge ordonné pytest→vitest→pytest + CI `verify` (reconstruction à l'identique du §1.8 / §2.5)
- [ ] StyleSpec + catalogue fermé de 10 recettes de mouvement, fixtures versionnés (Phase 2 doc)
- [ ] Motion Compiler (seul producteur de Lottie JSON) + SVG Sanitizer (gate dure) (Phase 3 doc)
- [ ] Anim QA automatisée pinnée (Playwright, frame walk, pixelmatch) (Phase 4 doc)
- [ ] Manifest Store (SQLite → DuckDB) + checkpointer crash-recoverable (Phase 5 doc)
- [ ] Agents LLM un par un (StyleRefiner, RecipePicker, Composer) derrière la frontière Pydantic (Phase 6 doc)
- [ ] Translator + Pack Orchestrator LangGraph (fan-out `Send` ×50, retry router) (Phase 7 doc)
- [ ] Packager multi-framework (React/Vue/Flutter/HTML + dark-mode) (Phase 8 doc)
- [ ] Observabilité (Langfuse self-host) + gardes coût/yield (Phase 9 doc)
- [ ] Hardening + 1er pack de 50 assets + ship-gate humain (Phase 10 doc)

### Out of Scope

- Éditeur d'illustration user-facing — hors métier (usine, pas outil)
- Génération on-the-fly / runtime — batch only, pack-at-a-time
- Raster PNG/WebP en sortie — vectoriel pur par design
- Pick-and-mix par asset — packs thématiques uniquement
- Subscription / metered licensing — one-time perpétuel, anti-subscription
- Grammaires de motion ouvertes — catalogue fermé 8–12 recettes
- Prompt playground public — pas d'exposition LLM
- Photoréalisme — illustration vectorielle
- Collab temps réel, analytics embarquées, app mobile native, auto-traduction — pas de texte par design
- SMIL / CSS keyframes sur SVG — ADR-01 : Lottie = seule surface de mouvement
- Temporal / Celery / Redis — SQLite checkpointer suffit (batch single-machine) ; Temporal réévalué plus tard (ADR-06)
- Bodymovin / After Effects — non pilotable par LLM

## Context

- **État réel du dépôt (2026-08-29)** : dépôt vide de code — uniquement `docs/project/` (cahier des charges aligné v2 en 13 parties) et `.opencode/` (GSD). Le §1.8 des docs (« Phase 1 complète ») décrit l'état cible hérité d'une session antérieure : **les contrats Phase 1 seront reconstruits ici** comme premier incrément.
- **Cahier des charges** : `docs/project/01_Vision.md` → `13_Hardening.md` — référence canonique ; les exigences y sont citées par ID (`DM-`, `STY-`, `MOT-`, `COM-`, `SAN-`, `QA-`, `EXP-`, `MFT-`, `ORC-`, `AGT-`, `OBS-`, `LIC-`, `KPI-`).
- **Doctrine « the gate is the gate »** : chaque critère de succès doit être enforce par CI/QA/contrat typé — jamais par convention ou revue manuelle seule.
- **Ligne de déterminisme** : aucun LLM ne produit jamais Lottie JSON, path data SVG, ni code de composant ; les agents ne produisent que des specs typées ; le Motion Compiler est le seul producteur de Lottie (§2.1).
- **Découpage milestones** : M1 = spine déterministe sans agents (Phases 1–5 : contrats → StyleSpec/recettes → compiler/sanitizer → Anim QA → manifest store) ; M2 = agents LLM + Translator/Orchestrator + packager + observabilité + hardening + 1er pack shippé (Phases 6–10).
- **Ordre de construction verrouillé** : suivre le §2.8 du cahier des charges (le schéma est le contrat ; le spine déterministe avant les agents).

## Constraints

- **Hygiène SVG** : pas d'élément `<text>`, pas de raster embarqué, IDs humains stables entre régénérations
- **Motion** : catalogue fermé de recettes (10 ids verrouillés : `fade, slide, bounce, pulse, draw-on, rotate, scale-pop, float, wiggle, orbit`, invariant 8–12) ; aucun keyframe SMIL/CSS ad-hoc
- **Qualité** : Anim QA automatisée sur chaque asset ; un asset échoué bloque le pack ; flake QA < 1 % en CI
- **Traçabilité** : manifest par asset (style_version, recipe_id, model_id, seeds, hashes, rapport QA, timestamp)
- **Coût** : < €0,05 / asset, garde pré-génération si projection dépassée (ORC-05)
- **Yield** : first-pass QA > 70 % avant intervention manuelle, garde fenêtre roulante (OBS-03)
- **Licence** : `perpetual-one-time` structurel (LIC-01/02, non contournable par construction)
- **Stack Python** : 3.12+, Pydantic 2.13.4 (pin exact), LangGraph 0.5+, LangChain 0.3+, OpenRouter, pytest 8, ruff
- **Stack TS** : TS ~5.9 (`verbatimModuleSyntax`), Vite 7.x (ADR-04, pas Vite 8), Vitest ^4, Biome ^2, Node 20 LTS, zod ^4, SVGO 4.x avec `removeViewBox`/`removeTitle` désactivés (ADR-02), lottie-web 5.13.0, resvg-js, pixelmatch
- **LLM** : two-tier cheap→expensive, idempotency keys salées, cache `(style_version, recipe_id, seed)`, parallélisme borné 5–8 assets, jamais de re-prompt free-form pour « fixer » un asset
- **Structure** : monorepo deux couches à la racine du dépôt (`src/` = TS déterministe, `lottie_forge/` = Python, frontière Pydantic↔zod, aucun `dict[str, Any]` ne traverse)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| ADR-01 : Lottie = seule source de mouvement ; SVG = compagnon statique | Cross-renderers ; SMIL/CSS incohérents | — Pending |
| ADR-02 : SVGO 4 avec `removeViewBox`/`removeTitle` désactivés + test de régression | Casse responsive + a11y sinon | — Pending |
| ADR-03 : catalogue fermé 8–12 recettes (10 verrouillés) | Le LLM ne peut que `Literal[...]` un id | ✓ Phase 2 — catalogue.json versionné + audit couverture D-14 bloquant |
| ADR-04 : Vite 7.x (pas Vite 8) | Écosystème subdeps aligné sur 7 | — Pending |
| ADR-05 : dark-mode dotLottie `themeId` + `theme_anchors` primaire ; `currentColor` fallback HTML/SVG pur | Bundle/DX confirmés par spike | — Pending |
| ADR-06 : ship-gate humain avant release ; pas de Temporal | « Humain = éditeur, pas producteur » | — Pending |
| Dépôt réellement à zéro : le §1.8 « Phase 1 complète » est à reconstruire | Contradiction docs/repo tranchée avec l'utilisateur (2026-08-29) | ✓ Phase 1 |
| Gate style_id côté loader (option b, D-16) : KebabToken + match répertoire, contrats intouchés | La frontière Py↔zod reste stable ; validation d'identité au chargement | ✓ Phase 2 |
| ContentHashes 4-champ same-commit §4.14 (D-16) + override `make_asset(content_hashes=None)` | Un seul régime sha256 (Sha256Hex réutilisé) ; les vrais sha branchés par 02-06 sans dupliquer le builder | ✓ Phase 2 |
| Gates bloquantes = tests ordinaires dans verify.yml existant (D-18) ; `scan_stale_pins` pure sans miroir zod (D-08) | Zéro edit CI ; la logique de re-validation s'écrit une fois (fixtures Ph2 → store Ph5+) | ✓ Phase 2 |
| Prompt-fixture catalogue verbatim : octets committés == texte embarqué == sha au manifest (D-13) | Pas de re-sérialisation — le LLM voit exactement les données hashées (§5.1 principe 2) | ✓ Phase 2 |
| Monorepo deux couches à la racine du dépôt | docs/ et .planning/ cohabitent avec le code | — Pending |
| Découpage 2 milestones : M1 déterministe sans agents, M2 agents + orchestration + ship | Le spine déterministe avant les agents = erreur la plus coûteuse évitée (§2.1) | — Pending |
| Roadmap suivant l'ordre de construction §2.8 | Séquencement justifié dans le cahier des charges | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-31 after Phase 2*
