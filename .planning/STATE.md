---
gsd_state_version: 1.0
current_phase: 3
current_phase_name: Motion Compiler & SVG Sanitizer
status: executing
stopped_at: Phase 3 Wave 1 complete (plan 03-01) — 7 more waves remain
last_updated: "2026-09-01T13:30:53Z"
last_activity: 2026-09-01
last_activity_desc: Phase 3 Wave 1 complete — npm legitimacy + format.ts socle
state_head: b52991d
progress:
  total_phases: 10
  completed_phases: 1
  total_plans: 19
  completed_plans: 12
  percent: 10
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-31)

**Core value:** Un style visuel verrouillé + un vocabulaire de mouvement catalogué + des exports dev-ready — first-pass yield > 70 % et coût < €0,05 / asset.
**Current focus:** Phase 3 — Motion Compiler & SVG Sanitizer

## Current Position

Phase: 3 (Motion Compiler & SVG Sanitizer) — Wave 1/7 complete
Plan: 03-01 ✓ (Wave 1) — npm legitimacy (svgo+tsx user-approved) + format.ts socle (D-23/D-24/D-35)
Status: Wave 1 done; Wave 2 (03-02, frozen contracts) unblocked
Last activity: 2026-09-01 — Completed plan 03-01 (12 min): svgo@^4.1.0 dep + tsx@^4.23.13 devDep installed past blocking-human checkpoint, src/shared/format.ts (fmt() + serializeDeterministicJson + writeDeterministicJson) shipped, 27/27 vitest cases green, tsc/biome clean, full 183-test suite still green
Progress: [██████████] 100% (12/19 plans — Phases 1–2 complete, Phase 3 Wave 1 done)

**Milestone 1 = Phases 1–5** (spine déterministe sans agents) · **Milestone 2 = Phases 6–10** (agents + orchestration + packager + observabilité + ship).

## Performance Metrics

**Velocity:**

- Total plans completed: 6
- Average duration: 17.8 min
- Total execution time: 178 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 4 plans | 74 min | 18.5 min |
| 02 | 6 | - | - |

**Recent Trend:**

- Last 4 plans: 01-01 (20 min) → 01-02 (14 min) → 01-03 (7 min) → 01-04 (33 min) → 03-01 (12 min)
- Trend: 01-04 slower (PackManifest + 3 collect-all validators + LicenseInfo structurelle + determinism probe) — within estimate band (~33 min vs estimate confidence low); 03-01 well under 30K-token low-confidence estimate (install + formatter socle, no LLM)

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P02 | 14 min | 3 tasks | 15 files |
| Phase 01 P03 | 7 min | 2 tasks | 10 files |
| Phase 01 P04 | 33 min | 2 tasks | 9 files |
| Phase 01 P05 | 18 | 3 tasks | 5 files |
| Phase 02-01 P02-01 | 28 | 3 tasks | 12 files |
| Phase 02-02 P02-02 | 12 min | 3 tasks | 8 files |
| Phase 02-03 P02-03 | 11 | 2 tasks | 10 files |
| Phase 02-04 P02-04 | 38min | 3 tasks | 8 files |
| Phase 02 P06 | 11 min | 2 tasks | 4 files |
| Phase 03-01 P03-01 | 12 min | 3 tasks | 4 files (1 checkpoint approved) |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- **ADR-01** : Lottie = seule source de mouvement ; SVG = compagnon statique (ni SMIL, ni CSS keyframes)
- **ADR-02** : SVGO 4 avec `removeViewBox`/`removeTitle` désactivés + test de régression
- **ADR-03** : catalogue fermé 8–12 recettes (10 ids verrouillés) ; le LLM ne peut que `Literal[...]` un id
- **ADR-04** : Vite 7.x (pas Vite 8) pour la couche export
- **ADR-05** : dark-mode dotLottie `themeId` + `theme_anchors` primaire ; `currentColor` fallback HTML/SVG pur
- **ADR-06** : ship-gate humain avant release ; pas de Temporal à ce stade
- **Session 2026-08-29** : dépôt réellement à zéro → les contrats Phase 1 (§1.8) sont à reconstruire comme premier incrément
- **Session 2026-08-29** : découpage 2 milestones — M1 spine déterministe sans agents (Phases 1–5), M2 agents + orchestration + packager + observabilité + ship (Phases 6–10)
- **Session 2026-08-29** : monorepo deux couches à la racine du dépôt (`src/` TS, `lottie_forge/` Python)
- **Session 2026-08-29** : roadmap suit l'ordre exact §2.8 après feedback utilisateur (agents = Phase 6, Translator/Orchestrator = Phase 7, packager = Phase 8 ; boundary M1 après la Phase 5 ; le packager, déterministe, ne consomme que les sorties compiler/QA/store + les RenderSpec du Translator)
- **Plan 01-01 (2026-08-29)** : StyleSpec contract + zod strictObject mirror delivered ; bridge chain ordonnée verte (pytest -k export → npx vitest run → pytest -q, byte-identical JSON artifacts). Rejection harness partagé (D-06/D-08) — fixtures/rejection-cases/style-spec.json (19 cas) consommé par pytest parametrize ET vitest test.each via loaders symétriques (tests/bridge/rejection_loader.py + src/rpc/contracts/rejection-cases.ts). CR-01 verrouillé — KebabToken validé par pydantic-core via StringConstraints (pas de validateur fait main, fix §4.6 D-02 #1). Schema-key parité: Object.keys(StyleSpecSchema.shape) == sorted(model_json_schema()['properties']). Path-asymmetry documentée: 3 cas (dm01-extra-key-top-level, dm01-extra-key-nested, dm01-palette-duplicate-name) utilisent rejection-only mode (Pydantic field-level loc ≠ zod parent-object loc pour z.strictObject unrecognizedKeys / .superRefine uniqueness).
- [Phase 01]: Plan 01-02 (2026-08-29): RecipeId vocabulary clos (10 ids canonique fade/slide/bounce/pulse/draw-on/rotate/scale-pop/float/wiggle/orbit, invariant 8-12 asserté des deux côtés) + MotionRecipe/MotionParams Pydantic strict (recipe_id importé du vocabulaire, ADR-03 same-commit, nested extra=forbid) + zod strictObject mirror (recipeIdSchema importé du vocabulary.schema.ts) + bridge ordered chain verte (pytest -k export → vitest → pytest -q) avec WR-06 pinned asymmetry documentée (TS accepte 1200.0 / Pydantic strict rejette, Python = autorité au re-import) + 13 cas de rejet partagés dans fixtures/rejection-cases/recipe.json consommés par pytest parametrize ET vitest test.each (D-06/D-08). 164 pytest passed, 42 vitest passed, ruff/biome/tsc all green.
- [Phase 01]: Plan 01-03 (2026-08-29): AssetSpec Pydantic strict (asset_id ^a-\d{3}$, style_ref STY-03 pin name@MAJOR.MINOR.PATCH dots literal, recipe_ref = RecipeId importé du vocabulaire ADR-03, composition_meta nested strict, content_hashes locked 2-field model) + AssetSpecSchema zod strictObject mirror (nested CompositionMetaSchema + ContentHashesSchema strict, recipe_id imported from vocabulary.schema.ts ADR-03 same-commit, no second declaration) + bridge ordered chain verte (pytest -k export → vitest → pytest -q, byte-identical JSON artifacts) + 20 shared rejection cases dans fixtures/rejection-cases/asset-spec.json (DM-03 empty/encoding probes, STY-03 partial/four-segment versions, DM-02 disco-spin au niveau asset, CR-01 non-ASCII shape-group name, content_hashes uppercase/short/non-hex + closed 2-field lock) consommés par pytest parametrize ET vitest test.each (D-06/D-08). 260 pytest passed (+23 from reimport asset-spec), 65 vitest passed (+23 from asset-spec.spec.ts), ruff/biome/tsc all green. make_asset() helper as single source of fixture truth for asset bridge chain (style_ref pinné sur make_style_spec().style_version pour STY-03 re-validation consistency).
- [Phase 01]: PackManifest (DM-04) + LicenseInfo structurelle anti-subscription (LIC-01/02) + 3 validateurs collect-all (IN-08 / WR-01 / compte coherence) avec chemin d'erreur precis via pydantic_core.ValidationError.from_exception_data. Mono-style via rsplit@ + comparaison exacte (WR-01 lock, D-02 #3). Determinisme byte-identique (critere ROADMAP n°5) prouve deux constructions independantes -> meme model_dump_json(). 10 shared rejection cases (IN-08 doublons, WR-01 mono-style, LIC-01 3 voies license, DM-04 assets/totals/pack_id form) consommes par pytest parametrize ET vitest test.each (D-06/D-08). Bridge ordered chain pack-manifest verte : pytest -k export -> vitest -> pytest -q, byte-identical JSON artifacts. 329 pytest + 85 vitest + ruff/biome/tsc all green. Le jeu de contrats Phase 1 est complet : 4 contrats (StyleSpec + MotionRecipe + AssetSpec + PackManifest) tous livres avec Pydantic strict + zod strictObject mirror + bridge chain verte + rejection harness partage. — Critere ROADMAP n°4 (anti-subscription structurelle) verouille par Literal + validateur belt. Critere ROADMAP n°5 (determinisme byte-identique) verouille par test dedie. IN-08 adjacency probe : doublons asset_id rejetes avec one issue per duplicate index, jamais fusion/deduplication silencieuse.
- [Phase 01]: Phase 1 close : parite DM-05 enforce par CI (verify.yml 12 etapes ordonnees + assert-zero-skips gate + README byte-for-byte + fresh-clone proof 12/12 vertes). Le job verify est le garde-fou permanent pour Phases 2+. Doctrine " the gate is the gate\
- [Phase 01]: .gitattributes * text=auto eol=lf : force cross-platform LF checkout. Detecte par le fresh-clone proof : sur Windows avec core.autocrlf=true, git checkout convertit LF en CRLF, biome formatter fail avec 12 errors. Fix Rule 2 critical : la doctrine " CI == local verify\
- [Phase 02]: PyYAML gate cleared by human (pypi.org legitimacy verified); install via uv pip (pip not bootstrapped in venv)
- [Phase 02]: Loader-side style_id gate (option b, D-16): KebabToken + directory-name match via pydantic-core (CR-01), strip before StyleSpec.model_validate; StyleSpec + StyleSpecSchema contracts untouched
- [Phase 02]: ThemeAnchorId closed Literal explicit form (no star-unpack of THEME_ANCHOR_IDS) mirroring the RecipeId lockstep pattern; 6 labels primary/secondary/accent/background/success/danger; anchors and palette token names stay in distinct namespaces (D-12)
- [Phase 02]: StyleRefinement delta-only closed 5-field model + zod strictObject mirror + 10-case shared rejection harness (D-06/D-08 phase 1) — STY-02 partial delivered, §5.3 verbatim — Closed model + KebabToken regex make hex/path/svg primitives inexprimables; the structural gate replaces a per-field validator.
- [Phase 02]: ContentHashes 4-champ same-commit §4.14 (D-16) + migration harnais de rejet ; make_asset(content_hashes=None) override consommé par 02-06 pour les vrais sha, builder inchangé.
- [Phase 02]: Gates bloquantes (02-05) : audit couverture D-14 A/B + règle same-commit 4 fichiers + scan_stale_pins PURE sans miroir zod (D-08, downgrade→major) ; 15 rejets catalogue en miroir pytest/vitest.
- [Phase 02]: Prompt-fixture verbatim (02-06, D-13) : catalogue octets committés == texte embarqué == sha au manifest ; ROADMAP critère 5 verrouillé, MOT-04 livré.
- [Audit M1 2026-08-31] : dispositions explicites F-1..F-4 ajoutées à v1-MILESTONE-AUDIT.md (Task 3 quick 260831-l1s) — **F-1** (DM-04/STY-01/MOT-04) : clôture planifiée en Phase 5 ; le plan MFT-02 doit livrer un test de composition fixture→sha→pin→manifest (pointeur à relire au planning Phase 5). **F-2** (DM-02/MOT-03) : redondance de détection de drift INTENTIONNELLE, pas une seconde source — un bump de vocabulaire = édition same-commit 3 fichiers (`vocabulary.py` + `vocabulary.schema.ts` + `vocabulary.spec.ts`), contraignant pour les consommateurs agents Phase 6. **F-3** (STY-03) : par design (découplage voulu), aucune action. **F-4** (DM-05) : gitignore `fixtures/bridge/` DÉFENDU — ne jamais le « corriger », les comparaisons committed-vs-exported du harnais bridge en dépendent ; intouchable dans ce projet. Solde bookkeeping concomitant : ROADMAP Phase 1 `Complete | 2026-08-29` (preuve 01-VERIFICATION 8/8 truths, 0 code gap, item humain CI laissé explicitement ouvert) ; recompte JSON `fixtures/rejection-cases/style-spec.json` = 19 cas confirmé, prose 01-01-SUMMARY + entrée STATE 01-01 alignées (sous-comptes 17/19/1/19/1 = 57 cohérent avec `--collect-only`).
- [Phase 03]: Plan 03-01 (2026-09-01, 12 min) : Wave 1 livré. svgo@^4.1.0 (dep, official SVG org, 39.1M DL/sem, no postinstall, ADR-02 + §3.2 pin) + tsx@^4.23.13 (devDep, privatenumber, 86.3M DL/sem, no postinstall, Node 20 CI type-strip natif indisponible — Pitfall 8) installés et lockfile commit après blocage-human gate T-03-SC approuvé. src/shared/format.ts = `fmt()` (D-35 : toFixed(4) spec-ES + -0→0 + strip trailing zeros + throw on non-finite + throw on |x|≥1e21) + `serializeDeterministicJson()` (walker main, JSON.stringify ONLY pour string-escape contract, clé insertion-order, compact, jamais sur float-bearing paths) + `writeDeterministicJson()` (file terminator `\n` literal, jamais os.EOL — Pitfall 9). 27/27 vitest cases green (exact-case matrix sur IEEE-754-exact + 0.1+0.2=0.3 + 1/3=0.3333), `npx tsc --noEmit` clean, `npx @biomejs/biome check src/shared/` clean, full 183-test suite still green. Trois ajustements self-corrected dans `format.spec.ts` (Rule 1 — bug dans les EXPECTATIONS initiales, pas dans l'implémentation) : `fmt(0.03125)→"0.0313"` (toFixed(4) cappe à 4 décimales), `fmt(0.015625)→"0.0156"` (IEEE-754 round-down), `fmt(-0.00001)→"0"` (résidual-`-0` re-map D-35), et `(2**50)`/`(2**60)` substitué à `1e21-1e12` pour le test de borne (évite l'incertitude IEEE-754). **SOCLE BYTE-AUTHORITY VERROUILLÉ** — tout byte Phase 3 (compiler, sanitizer, goldens, payloads RPC Ph4/7/8) routé par `fmt()`. SDK state-update commands ont fail (STATE.md format stale pré-Phase-3, pas de compteur numérique de plan) — orchestrator a fait les edits manuels sur STATE.md/ROADMAP.md.

### Blockers/Concerns

- None blocking — Phases 01–03 Wave 1 delivered (bridge pattern replicated across 6 contrats, rejection harness 6 fixtures, gates bloquantes vertes 485 pytest / 156 vitest, format.ts byte-authority verrouillé). 02-REVIEW.md : 10/10 findings résolus — WR-01/02/03 + IN-05 fixés avec tests de régression mutation-checkés (02-REVIEW-FIX.md), IN-01/02/03/04/06/07 fixés en quick task 260831-jnx. **Note SDK** : `gsd_run query state.*` commands retournent "Cannot parse Current Plan or Total Plans in Phase from STATE.md" parce que STATE.md est en format stale pré-Phase-3 ("Plan: Not started", pas de compteur numérique) ; le tracking d'infrastructure state n'a pas été bootstrappé pour Phase 3. Les shared-file writes sont faites manuellement par l'orchestrator après chaque wave. À corriger via une quick task si la friction grossit.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260831-jnx | Hardening résiduel 02-REVIEW — IN-01/02/03/04/06/07 (6 items Info, zéro comportement produit) | 2026-08-31 | b9b9726 | [260831-jnx-hardening-residuel-02-review-in-01-02-03](./quick/260831-jnx-hardening-residuel-02-review-in-01-02-03/) |
| 260831-l1s | Bookkeeping audit M1 — REQUIREMENTS vérifié (déjà à jour 909d05d), ROADMAP Phase 1 Complete, recompte JSON 19 cas style-spec (prose alignée), dispositions F-1..F-4 | 2026-08-31 | da3acdc | [260831-l1s-bookkeeping-audit-m1-planning-only-docs](./quick/260831-l1s-bookkeeping-audit-m1-planning-only-docs/) |

## Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(voir REQUIREMENTS.md §v2 : GTM, COH, AQA, CAT, WPR, DuckDB, signature crypto…)* | | | | |

## Session Continuity

Last session: 2026-09-01T13:30:53Z
Stopped at: Phase 3 Wave 1 complete (plan 03-01) — 7 waves remain
Resume file: .planning/phases/03-motion-compiler-svg-sanitizer/03-02-PLAN.md
