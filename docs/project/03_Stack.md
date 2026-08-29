# Cahier des Charges Aligné — lottie-forge
## Partie 3 — Stack technologique verrouillé

> **Statut** : Partie 3 du cahier des charges aligné (Option B). Remplace `research/STACK.md` là où les ADR tranchent (Vite 7, SVGO désactivé, themeId).
> **Principe** : le stack est coupé le long de la ligne de faute LLM/déterministe. Python = orchestration + agents ; TypeScript = backbone déterministe + exports ; Pydantic/zod = contrats de frontière.
> **Confiance** : HAUTE pour les composants vérifiés docs officielles ; MOYENNE pour les coûts (re-vérification trimestrielle via `bench.yml`).

---

## 3.1 Côté Python (orchestrateur + agents LLM)

| Technologie | Version verrouillée | Rôle | Justification |
|---|---|---|---|
| Python | 3.12+ (`requires-python ">=3.12,<3.14"`) | Runtime orchestrateur | Baseline stable ; wheels Pydantic 2.13 et LangGraph |
| Pydantic | **2.13.4** (pin exact) | Source de vérité de la forme des données ; sorties d'agents ; manifests | `polymorphic_serialization`, `model_validate_json` strict |
| LangGraph | 0.5+ | Orchestration stateful multi-agents ; `Send` ; checkpointer | Mélange nœuds déterministes + agentiques |
| LangChain (Python) | 0.3+ | Model I/O, `with_structured_output`, `ToolStrategy(PydanticModel)` | Schema enforcement natif |
| OpenRouter + SDK directs (anthropic, openai) | latest | Routage coût/qualité ; le modèle est un **paramètre**, pas une constante | Un seul code path pour toutes les familles |
| pydantic-ai | 1.x (alternative) | Harness léger pour runs single-asset | **Ne jamais mélanger avec LangGraph dans un même pack** |
| httpx | 0.27+ | HTTP async | Standard |
| orjson | latest | Sérialisation JSON rapide | Perf agent layer |
| SQLite (stdlib) / DuckDB | default / upgrade | Manifest store, catalogue, ledger | Single-file, backup trivial |
| Langfuse (self-host) ou LangSmith | latest | Observabilité **obligatoire** (traces `pack_id` + `asset_id`) | Sans ça, yield debugging impossible |
| pytest 8 + pytest-asyncio ; ruff | latest | Tests + lint Python | Standards |

## 3.2 Côté TypeScript (backbone déterministe + exports)

| Technologie | Version verrouillée | Rôle | Justification |
|---|---|---|---|
| TypeScript | ~5.9 (`verbatimModuleSyntax: true`) | Tout le code exports + tooling | 6.0.x pas encore supporté par tous les subdeps |
| Vite | **7.x (ADR-04 — pas Vite 8)** | Library mode pour « publier un pack de composants » | Émet `dist/*.js` + `dist/*.cjs`, externalise `lottie-web` |
| Vitest | ^4 (happy-dom 20+) | Tests unitaires + DOM | Browser mode (Playwright) réservé à l'Anim QA |
| Biome | ^2 | Lint + format TS | Plus rapide qu'ESLint+Prettier ; scopé `src/**/*.ts` |
| Node.js | 20 LTS (`engines.node ">=20"`) | Runtime TS | Vite 7 / Vitest 4 exigent ≥ 20 |
| zod | ^4 | Miroirs runtime des contrats Pydantic | `z.strictObject` = `extra=forbid` |
| SVGO | 4.x | Optimisation + sanitization SVG | **ADR-02 : `removeViewBox`/`removeTitle` gardés DÉSACTIVÉS** + test de régression |
| @resvg/resvg-js | latest | SVG → PNG headless pour QA | > 95 % couverture de tests, zéro dépendance système |
| pixelmatch + pngjs | latest | Diff de frames vs baseline | Primitive QA |
| @types/node | ^20 | Type-check du code bridge | `tsc --noEmit` vert |

## 3.3 Chaîne de rendu Lottie / SVG (le contrat d'export)

| Technologie | Version | Rôle |
|---|---|---|
| lottie-web | 5.13.0 | Renderer de référence SVG/canvas ; moteur des wrappers |
| lottie-react | 3.1.0 | Composant React + hooks (peer react ^18.2 \|\| ^19) |
| @lottiefiles/dotlottie-web | 0.79.2 | Player Rust+WASM ; moteur Vue 3/Svelte ; `setTheme` |
| @lottiefiles/dotlottie-vue | 0.5+ | Composant Vue 3 ; `themeId` (fondement du dark-mode) |
| lottie-svg | vendored | Export HTML/SVG-only (< 30 KB) |
| lottie (Flutter) | 3.5.1 | Widget Flutter (`Lottie.asset`) |
| dotlottie_flutter | 0.1.7 | Player natif dotLottie (state machines/theming) |

## 3.4 Routage LLM & discipline de coût (cible < €0,05/asset)

| Modèle | ~Input | ~Output | Usage |
|---|---|---|---|
| claude-sonnet-4-6 | €3/MTok | €15/MTok | Composition haute fidélité ; final-pass flaggé |
| gpt-5.x / gpt-5-mini | €2,5/MTok | €10/MTok | Workhorse tool-calling |
| gemini-2.5-pro | €1,8/MTok | €9/MTok | Fallback multimodal |
| gpt-5-mini / claude-haiku-4 | €0,3/MTok | €1,5/MTok | First-pass cheap ; classifieur QA |
| Open-weight local (vLLM) | compute | compute | Embedding + draft style-locked |

Règles : two-tier cheap→expensive ; idempotency keys `{pack_id, asset_id, stage, attempt}` **hashées avec sel par env** ; cache par `(style_version, recipe_id, seed)` ; parallélisme borné 5–8 assets ; budget token/asset dans le manifest ; rejet pré-génération si projection > €0,05. Coûts = MEDIUM confiance → `bench.yml` trimestriel.

## 3.5 Durabilité & état

- **Défaut (10 premiers packs)** : `langgraph-checkpoint-sqlite` (crash-recoverable, zéro infra).
- **Plus tard** : Inngest (serverless) ou Temporal (gates humains multi-jours).
- **Jamais** : Celery. **Skip** : Redis (batch 50 assets single-machine).

## 3.6 CI & outillage dev (prouvé en Phase 1)

- GitHub Actions, job unique `verify` sur `ubuntu-latest` : checkout → setup-python 3.12 → setup-node 20 → `pip install -e ".[dev]"` (quoté YAML) → `npm ci` → `ruff check .` → `npx @biomejs/biome check .` → `pytest -k export` → `npx vitest run` → `pytest -q`.
- `package-lock.json` committé (`npm ci` échoue sur drift) ; deps Python pinnées.
- README quickstart = séquence CI byte-for-byte ; `fixtures/bridge/` généré au test, gitignoré.

## 3.7 Matrice de compatibilité (extraits verrouillés)

| Package | Version | Compatible avec |
|---|---|---|
| lottie-react 3.1.0 | peer react ^18.2 \|\| ^19 | lottie-web ^5.13.0 |
| dotlottie-web 0.79.2 | Node ≥ 18.17 | dotlottie-vue ≥ 0.5, dotlottie-react ≥ 0.8 (`setWasmUrl` requis) |
| lottie (Flutter) 3.5.1 | Dart ≥ 3.6, Flutter ≥ 3.27 | Pure-Dart |
| Pydantic 2.13.4 | Python ≥ 3.9 (3.14 via backport) | pydantic-core interne |
| LangGraph 0.5+ | Python ≥ 3.10 | langgraph-checkpoint-sqlite |
| Vite 7.x | Node ≥ 20.19 / 22.12 | @vitejs/plugin-react 4.x |
| Vitest 4.x / Playwright 1.61+ | Node ≥ 20 / ≥ 18 | Vite 7+, happy-dom 20+ / Chromium 140+ |
| SVGO 4.x / TS 5.9.x | Node ≥ 18 | Biome 2 |

## 3.8 Interdits (avec raisons)

| À éviter | Pourquoi | À la place |
|---|---|---|
| Bodymovin (After Effects) | Outil designer, non pilotable par LLM | Motion Compiler recipe→JSON |
| SMIL `<animate*>` / CSS keyframes sur SVG | Incohérent cross-renderers ; pas rendu par lottie-web | Lottie JSON unique ; SVG statique (ADR-01) |
| `<text>`, raster, `<foreignObject>` | Contraintes dures ; casse theming/Lottie | Glyphs-as-paths ; vectoriel pur |
| Vite 8 | Écosystème subdeps pas prêt | Vite 7 (ADR-04) |
| SVGO `removeViewBox`/`removeTitle` activés | Casse responsive + a11y | Gardés désactivés + régression (ADR-02) |
| gpt-4o / gpt-4-turbo | Schema enforcement faible, coût élevé | gpt-5.x / claude-sonnet-4-6 / mini-haiku |
| CrewAI en production | Breaking changes, peu Pydantic-native | LangGraph (CrewAI = prototypage) |
| Celery ; Redis (batch single-machine) | Legacy / inutile | SQLite checkpointer |
| librsvg / Inkscape ; Jest 29 ; Redux Toolkit | Non reproductible / legacy / surdimensionné | resvg-js ; Vitest 4 ; Zustand 5 |
| Re-bundle raw lottie-web par export | +200 Ko dupliqués | `external` en library mode |
| Prompt free-text pour « fixer » un asset | Rend le yield inmesurable | Re-roll seed → swap recette → escalade modèle |

---

*Fin de la Partie 3. Partie suivante : **Partie 4 — Modèles de données & contrats de frontière (état réel Phase 1)**.*