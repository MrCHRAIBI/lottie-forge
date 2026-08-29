# Cahier des Charges Aligné — lottie-forge
## Partie 7 — Pipeline Anim QA (Playwright pinné, frame walk, pixelmatch, smoke test theming) (Phase 4)

> **Statut** : Partie 7 du cahier des charges aligné (Option B). Décrit la **seule gate qui décide « cet asset est livrable »** : environnement Playwright pinné, frame walk déterministe, diff pixel tolérant, smoke test de theming, et `QAReport` structuré persisté au manifest. Couvre QA-01→04 (QA-05, ship-gate humain, est traité en Partie 12/Phase 10). Dépend de la Partie 6 (Motion Compiler + Sanitizer). **Aucun LLM sur ce chemin de code.**
> **Références** : ROADMAP Phase 4 · REQUIREMENTS QA-01→04 · PITFALLS 6, 7, 10 + Performance Traps · ARCHITECTURE.md (composant Anim QA, `src/anim-qa/`) · STACK.md (Playwright 1.61+, pixelmatch+pngjs, resvg-js) · Parties 4–6.

---

## 7.1 Objet & principes

| # | Principe | Traduction technique |
|---|----------|----------------------|
| 1 | **Anim QA est la seule gate « shippable »** | Un asset échoué **bloque le pack** (QA-03) ; pas de livraison « à l'œil » |
| 2 | **Structurel avant visuel** | La validation de schéma Lottie (zod) + la feature gate tournent **avant** tout diff pixel — on ne dépense pas de CPU Playwright sur un asset structurellement cassé |
| 3 | **Environnement unique pinné** | Un seul conteneur Docker Playwright (Chromium verrouillé), même image tag en local **et** en CI ; jamais de QA sur laptop non pinné (flake > 10 % sinon) |
| 4 | **Capture déterministe** | `setSpeed(0)` avant capture ; `goToAndStop(n, true)` par frame ; même ordre de `setTimeout` ; frame de référence = frame 0 ou frame canonique définie par marker |
| 5 | **`maxDiffPixels`, pas l'identité pixel** | Le diff significatif = « l'asset a bougé d'une façon que la recette ne prédit pas », pas « le pixel X est plus clair » (antialiasing, sub-pixel) |
| 6 | **QA mesure, ne répare jamais** | Un échec alimente le `retry_router` (Partie 9) via `reason_codes` ; QA n'émet aucune suggestion de « fix » free-form |

---

## 7.2 Environnement pinné (anti-flake, Pitfall 6)

- **Conteneur** : image Docker officielle Playwright, **Chromium uniquement**, tag **verrouillé** (ex. `mcr.microsoft.com/playwright:v1.61.x-noble`) ; flags `--no-sandbox --disable-dev-shm-usage`.
- **Même image** utilisée en local et en CI ; le tag est enregistré dans chaque `QAReport.qa_container_tag` (traçabilité anti-flake).
- **CI** : job `container` (ou `docker run`) avec l'image pinnée, exécutable depuis un fresh checkout ; **10 runs consécutifs** sur le même input sans flake (cible **< 1 %**).
- **Interdit** : lancer Anim QA sur la machine du développeur et attendre le même résultat que la CI (le rendu varie par OS/navigateur/alimentation — c'est exactement le flake que le pin élimine).

---

## 7.3 Ordonnancement des étapes (gate ordonnée)

```
LottieJSON (sortie Motion Compiler, Partie 6)
   │
   ▼  Étape 1 — Validation structurelle (structural.ts)
   │  Parse zod du LottieJSON (subset strict) — rejet immédiat si shape invalide
   ▼  Étape 2 — Feature gate
   │  SupportedLottieFeature enum (Partie 6) : rejet 3D, audio/vidéo,
   │  negative stretch, expressions non supportées, track matte canvas/html
   ▼  Étape 3 — Diff structurel d'asset
   │  nb de layers, ids de layers, nb de keyframes == sortie attendue de la recette
   ▼  Étape 4 — Frame walk + pixelmatch (frame-walker.ts + diff.ts)
   │  Frame canonique + 3 frames échantillonnées ; diff vs baseline ; maxDiffPixels
   ▼  Étape 5 — Smoke test theming (dark-mode.ts côté QA)
   │  Rendu avec thème dark (dotLottie setTheme) vs sans thème ;
   │  assert diff pixel > 5 % dans les régions des theme_anchors
   ▼
QAReport {passed, reason_codes, stats} → retry_router / ManifestWriter
```

**Justification de l'ordre** : les étapes 1–3 sont quasi gratuites (pas de navigateur) ; elles éliminent les cassures structurelles avant le coût Chromium. Les étapes 4–5 sont les seules à consommer du Playwright.

---

## 7.4 Baseline & échantillonnage des frames

- **Baseline** : générée depuis la sortie **figée** de la recette (RenderSpec → Motion Compiler) + StyleSpec ; PNG canoniques dans `fixtures/style-specs/example-style/baseline-frames/` (générés en Phase 4, pas committés vides) ; régénérée uniquement si le hash de la recette change.
- **Frame canonique** : frame 0 (ou marker `enter` de la recette) ; **si elle échoue, l'asset est rejeté sans lire les autres** (économie de QA).
- **Frames échantillonnées** : 3 frames fixes (25 % / 50 % / 75 % de la durée) — **pas** de régression frame-par-frame (trap performance > 20 assets).
- **Diff structurel** : `nb layers`, `layer ids` (stables, schéma `{asset_id}_{component}_{role}`), `nb keyframes` — égalité stricte attendue ; catche les vraies dérives sans flaker.
- **Poster SVG statique** : capture avec `animations: 'disabled'` (pattern canonique Playwright) ; rendu SVG→PNG via **resvg-js** (reproductible cross-OS, zéro dépendance système).

---

## 7.5 Seuils & calibration (spike Phase 4)

| Seuil | Valeur / règle | Calibration |
|---|---|---|
| `maxDiffPixels` par asset | à calibrer | Spike sur le **premier asset fait main** : mesurer le bruit d'antialiasing du conteneur pinné ; seuil = bruit observé × marge ; documenté dans `docs/qa.md` |
| Frame canonique | échec = rejet immédiat | — |
| Smoke test theming | diff light/dark **> 5 %** dans les régions `theme_anchors` | Sinon `reason_codes: ["theme:noop"]` (Pitfall 8) |
| Multi-renderer (scaffold) | diff **≤ 2 %** vs référence par player | Rapport complet par renderer différé v2 (AQA-02) |
| Flake rate CI | **< 1 %** | 10 runs consécutifs même input |
| Pack | **un seul asset au-delà de son seuil = pack échoué** (QA-03) | Pas de moyenne : pas d'asset cassé livré |

---

## 7.6 `QAReport` — le contrat persisté

```python
class PixelDiffStats(BaseModel):
    model_config = STRICT_CONFIG
    max: int = Field(ge=0)
    mean: float = Field(ge=0)
    p95: int = Field(ge=0)
    frames_above_tolerance: int = Field(ge=0)

class QAReport(BaseModel):
    model_config = STRICT_CONFIG
    passed: bool
    renderer: Literal["lottie-web-svg"]      # v1 ; colonne renderer étendue en v2 (AQA-02)
    frame_count: int = Field(ge=1)
    frame_hashes: list[str]                  # sha256 hex minuscules
    pixel_diff: PixelDiffStats
    theme_diff_pct: float = Field(ge=0, le=100)
    reason_codes: list[str] = []             # vide ssi passed ; un code par invariant échoué
    qa_container_tag: str                    # tag Docker pinné (traçabilité anti-flake)
    timestamp: datetime                      # exclu des content hashes (rebuild déterministe)
```

- Miroir zod `QAReportSchema` (`z.strictObject`) + parité de rejet (Partie 4).
- **`reason_codes` non vide si `passed == false`** : chaque échec est explicable et agrégable pour le yield report (Partie 11). Codes canoniques : `structural:schema`, `feature:3D`, `stretch:negative`, `shape:layers`, `pixel:canonical`, `pixel:p95`, `theme:noop`.
- Persisté au manifest par asset (MFT-01) ; le retry_router (Partie 9) consomme `passed` + `reason_codes` — **jamais** l'inverse (QA ne choisit pas la réparation).

---

## 7.7 Multi-renderer scaffold (Pitfalls 7 & 10)

- **Phase 4 (livré)** : QA complète sur **lottie-web 5.13** (renderer SVG) + **scaffold** de passes pour `lottie-react` 3.1, `@lottiefiles/dotlottie-vue` 0.5+, `lottie` Flutter 3.5.1 (mêmes fixtures, mêmes seuils).
- **Colonne `renderer`** dans le manifest dès le scaffold ; un asset flaggé « SVG-renderer only » (feature hors subset) est exclu des exports Flutter/canvas par le Packager (Partie 10) ou refusé au ship.
- **Différé v2 (AQA-02)** : rapports QA **par renderer** (lottie-ios / lottie-android inclus) au lieu d'un run Playwright unique ; matrice mobile complète.

---

## 7.8 Structure des modules (`src/anim-qa/`)

```
src/anim-qa/
├── runner.ts          # entrée Playwright (conteneur pinné) ; expose anim_qa.run via src/rpc/server.ts
├── frame-walker.ts    # lottie.goToAndStop(n, true) par frame ; setSpeed(0) ; ordre de capture fixe
├── diff.ts            # pixelmatch + pngjs ; maxDiffPixels ; stats max/mean/p95
├── baseline.ts        # génération baseline depuis recette figée + StyleSpec ; resvg-js pour posters
├── structural.ts      # validation zod du LottieJSON + feature gate + diff structurel (avant pixel)
├── report.ts          # QAReport (zod mirror) ; reason_codes canoniques
└── __tests__/         # Vitest (unit) ; la QA complète tourne dans le conteneur pinné, pas en unit
```

- Exposé en RPC JSON-over-stdio : `anim_qa.run` (ajouté à `src/rpc/server.ts`, Partie 6).
- **Déterministe** : mêmes entrées (LottieJSON + baseline + tag conteneur) → même `QAReport` (hors `timestamp`).

---

## 7.9 Tests & critères de succès (Phase 4)

| Ce qui doit être VRAI | Mécanisme |
|---|---|
| Conteneur pinné (chromium verrouillé) charge chaque Lottie via lottie-web 5.13 et parcourt toutes les frames en `goToAndStop(n, true)` (QA-01) | Job CI `container` image pinnée ; test d'intégration |
| Chaque frame comparée à la baseline via pixelmatch ; `maxDiffPixels` par asset enforce ; **pack échoué si un asset dépasse** (QA-02/03) | `diff.ts` + rollup orchestrator (Partie 9) ; test de seuil |
| Smoke test theming : rendu avec thème vs sans thème, diff **> 5 %** régions attendues | `runner.ts` (setTheme dotLottie) ; cas `theme:noop` en rejet |
| `QAReport` Pydantic émis par asset (pass/fail, frame count, frame hashes, pixel-diff stats), stocké au manifest ; validation zod structurelle **avant** tout pixel diff (QA-04) | `report.ts` + miroir Pydantic (Partie 4) ; ordre 7.3 |
| QA exécutable en CI depuis fresh checkout, **sans flake sur 10 runs consécutifs** même input | Workflow CI dédié (image pinnée) ; métrique flake < 1 % |

---

## 7.10 Couverture des exigences

| Exigence | Couverture |
|---|---|
| QA-01 | §7.2 (conteneur pinné) + §7.4 (frame walk `goToAndStop`) |
| QA-02 | §7.4/§7.5 (pixelmatch + `maxDiffPixels` calibré) |
| QA-03 | §7.5 (un asset au-delà du seuil = pack échoué) |
| QA-04 | §7.6 (`QAReport` structuré, persisté au manifest, zod avant pixel) |

---

## 7.11 Extensions différées

- **AQA-01** : baseline enrichie de frames de référence choisies à la main (en plus de la baseline StyleSpec) — v2.
- **AQA-02** : rapports QA par renderer (lottie-web / ios / android / flutter) — v2.
- **Pool Playwright** en production (plusieurs packs/jour) ; en v1, QA sérielle par asset, parallèle entre packs.
- Calibration continue des seuils (dérive saisonnière des rendus Chromium) — revue trimestrielle avec `bench.yml`.

---

*Fin de la Partie 7. Partie suivante : **Partie 8 — Manifest Store & Checkpoint LangGraph (SQLite) (Phase 5)**.*