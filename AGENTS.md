<!-- GSD:project-start source:PROJECT.md -->

## Project

**lottie-forge**

Une **usine industrielle** (pas un outil) de production d'illustrations : pipeline batch « pack-at-a-time » qui génère des **packs thématiques de 50 illustrations vectorielles animées cohérentes** (SVG + Lottie) avec exports dev-ready par asset (composants React/Vue, widget Flutter, Lottie JSON, SVG statique, variante dark-mode, manifest de traçabilité, rapport QA). Motorisation hybride : agents LLM non déterministes (idéation, style, composition) enveloppés dans des modules de code déterministes (Motion Compiler, SVG Sanitizer, Anim QA, Packager). Client final : développeurs web/mobile/desktop achetant des packs one-time (posture anti-subscription).

**Core Value:** Un style visuel verrouillé + un vocabulaire de mouvement catalogué + des exports dev-ready — avec **first-pass yield > 70 %** et **coût unitaire < €0,05 / asset**. Si tout le reste échoue, un pack de 50 assets doit passer le QA du premier coup à plus de 70 %, à moins de €0,05 l'asset.

### Constraints

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

<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->

## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
