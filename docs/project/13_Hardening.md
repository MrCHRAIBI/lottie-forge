# Cahier des Charges Aligné — lottie-forge
## Partie 13 — Hardening, Licence Perpétuelle & Ship-Gate Humain (premier pack) (Phase 10)

> **Statut** : Partie 13/13 — **clôture du cahier des charges v1**. Décrit le durcissement de production **sans changement d'architecture** : licence perpétuelle embarquée (expression runtime de la gate de données Partie 4), preview par pack servant de surface de revue, rebuild déterministe depuis le manifest, passe « looks done but isn't » en gate de release, et ship-gate humain. Couvre LIC-01→02, QA-05. Dépend des Parties 4 (LicenseInfo), 8 (store), 11 (layout/exports), 12 (yield guard).
> **Références** : ROADMAP Phase 10 · REQUIREMENTS LIC/QA-05 · ADR-06 (humain = éditeur, pas producteur) · PITFALLS « Looks Done But Isn't » · 01-03-SUMMARY (licence = runtime expression de la data gate) · 01-04-SUMMARY (branch protection au ship) · Parties 4–12.

---

## 13.1 Objet & principes

| # | Principe | Traduction technique |
|---|----------|----------------------|
| 1 | **Le hardening ne change pas l'architecture** | Uniquement des gates, des artefacts et des commandes qui font respecter la doctrine déjà construite (Parties 1–12) |
| 2 | **Humain = éditeur, pas producteur** (ADR-06) | Le ship-gate **approuve ou rejette** un pack ; il ne corrige jamais un asset à la main ; un rejet renvoie en planification/retry (Parties 5/10) |
| 3 | **La licence est un contrat, pas un PDF** | `license.txt` est **généré depuis `LicenseInfo`** (Partie 4) ; toute divergence licence/manifest est un échec CI |
| 4 | **Rebuild = preuve de déterminisme** | `rebuild --manifest` byte-identique est la définition opérationnelle d'« usine » vs « générateur one-shot » |
| 5 | **La checklist s'exécute, elle ne se relit pas** | Chaque ligne « looks done but isn't » est un check automatisé en gate de release |

---

## 13.2 Licence perpétuelle (LIC-01, LIC-02)

### 13.2.1 Chaîne de cohérence

```
LicenseInfo (Pydantic, Partie 4)          ← gate de données (Literal["perpetual-one-time"],
        │                                    commercial_use=True, attribution_required=False)
        ▼
pack_manifests.license_json (SQLite)      ← source de vérité persistée (Partie 8)
        ▼
license.txt généré (template déterministe) ← artefact runtime embarqué dans le pack
        ▼
gate CI : termes du license.txt == champs LicenseInfo du manifest
```

### 13.2.2 Template « lawyer-lite » versionné (`lottie_forge/templates/license.txt`)

```
lottie-forge — Pack License
License ID: <license_id>  ·  Pack: <pack_id>

1. GRANT — Licence perpétuelle, non exclusive, mondiale, d'utiliser,
   reproduire et afficher les assets de ce pack dans des produits
   personnels et commerciaux, y compris logiciels livrés, sites web
   et travaux client.
2. ONE-TIME — Acquise par un paiement unique. Pas d'abonnement, pas
   de renouvellement automatique, pas de tarification par siège, pas
   de comptage d'usage.
3. ATTRIBUTION — Optionnelle, jamais requise.
4. RESTRICTIONS — Interdit : revendre les assets en tant que
   bibliothèque d'assets autonome concurrente ; redistribuer les
   fichiers raw hors d'un produit fini.
5. NO WARRANTY — Fourni « en l'état ».
```

- **Génération déterministe** : seuls `license_id` et `pack_id` sont interpolés ; mêmes entrées → mêmes bytes.
- **Gate de cohérence CI** : parse du `license.txt` généré + assertion template-version + champs == `LicenseInfo` ; **grep interdits** (`subscription`, `auto-renew`, `per seat`, `attribution required`) → absence obligatoire.
- **Revue légale complète + indemnisation B2B** : différées v2 ; le template v1 suffit au lancement.

---

## 13.3 Preview par pack (`index.html`) — surface du ship-gate

- **Grille des 50 assets** rendue via `lottie-web` 5.13 ; **toggle light/dark global** appelant `setTheme` sur chaque player (vérifie EXP-05 à l'œil, en complément du smoke test automatisé).
- Chaque cellule : aperçu animé + lien vers `manifest.json` + `qa-report.json` + affichage `style_ref` / `recipe_ref` (traçabilité lisible par l'humain).
- **JSON embarqués inline**, jamais `path:` remote (supply-chain, Partie 11) ; poster statique en fallback ; `<title>`/`<desc>` présents (a11y).
- `preview_sha256` = hash de l'`index.html` généré (déterministe) ; enregistré à l'approval (13.5).
- Différence avec WPR-01 (v2) : `index.html` est l'artefact de **revue/achat livré avec le pack**, pas un portail public filtrable.

---

## 13.4 Rebuild déterministe depuis le manifest

- **Commande** : `python -m lottie_forge rebuild --manifest pack.json`.
- **Mécanique** : lit le manifest (style_version, hash catalogue, seeds, recettes) → re-exécute **Translator → Motion Compiler → SVG Sanitizer** (aucun LLM : sorties d'agents rejouées depuis le cache/ledger, Parties 8–9) → compare `sha256` des artefacts régénérés aux hashes stockés (`svg_sha256`, `lottie_sha256`, `dotlottie_sha256`) ; **tout mismatch = échec dur**.
- **Conditions structurelles** (déjà posées ailleurs, ici exigées comme gate) : entrées pinnées (style, catalogue, version du package compiler) ; sérialisation déterministe (Partie 4) ; horodatages exclus des content hashes ; SVGO multipass déterministe ; IDs stables (Partie 6).
- **Test CI** : rebuild d'un pack fixture → comparaison sha256 vs hashes du manifest.

---

## 13.5 Ship-gate humain (QA-05, ADR-06)

```
python -m lottie_forge ship --approve <pack-id> --reviewer <human-id>
python -m lottie_forge ship --reject  <pack-id> --reason "<motif>"
```

| Élément | Règle |
|---|---|
| État par défaut | `pack_manifests.shippable = 0` à la création |
| Préconditions à l'approval | gates CI `verify` + `release-gate` verts ; yield guard **non bloquant** (Partie 12) ; cohérence licence verte ; `preview_sha256` calculé |
| Approval | `shippable = 1` + `approved_by` + `approved_at` + `preview_sha256` (colonnes ajoutées au store **même commit** que la gate, Partie 8) ; tag immuable `pack-<style>-<date>` |
| Rejet | raison persistée ; le pack repart en retry/planning — **jamais d'édition manuelle d'asset** |
| Anti-contournement | L'étape packaging/upload lit `shippable` ; `0` → refus de tag et de publication ; le futur publishing GTM-03 (v2) lit le même flag |

---

## 13.6 Passe « looks done but isn't » (gate de release CI)

Chaque ligne de la checklist PITFALLS devient un check automatisé ; le pack ne passe pas en ship-gate tant que l'un échoue.

| # | Vérification | Check automatisé | Preuve produite en |
|---|---|---|---|
| 1 | Lottie `v` pinné, pas « latest » | assert `v == <pin>` sur tous les JSON | Partie 6 |
| 2 | Aucun negative stretch | assert scale ≥ 0 sur toutes les layers | Partie 6 |
| 3 | Zéro `<text>` / raster / `<foreignObject>` / `<script>` / handlers | gate allow-list SAN | Partie 6 |
| 4 | `viewBox` + `<title>` survivent à SVGO | test de régression ADR-02 | Partie 6 |
| 5 | IDs stables across régénération | diff de deux rebuilds = ∅ | Parties 6/13 |
| 6 | Keyframes traçables à une recette (zéro orpheline, zéro SMIL) | gate motion-source | Partie 6 |
| 7 | Expressions interdites ou bakées | `SupportedLottieFeature` | Partie 6 |
| 8 | Multi-renderer QA vert | diff ≤ 2 % vs référence par player | Partie 7 |
| 9 | Theming réel : `setTheme` dans `useEffect`/`watch` + diff light/dark > 5 % | grep templates codegen + smoke test **sur sortie packagée** | Parties 7/11 |
| 10 | Les 4 exports rendent | smoke renders Vitest/HTML | Partie 11 |
| 11 | Manifest peuplé depuis le run réel (pas hardcodé) | assert provenance ledger/store | Partie 8 |
| 12 | `license.txt` == `LicenseInfo` | diff structuré CI + grep interdits | **cette partie** |
| 13 | Rebuild byte-identique | sha256 artefacts == hashes manifest | **cette partie** |

---

## 13.7 Premier pack end-to-end en CI & hygiène de release

- **Job `release-dry-run`** (tous push/PR, **sans secrets**) : agents LLM remplacés par les snapshots enregistrés (Partie 9) → chaîne complète (compiler → sanitizer → QA → packager → manifest → preview → gates) produit l'**artefact téléchargeable** : 4 exports × 50 assets + `manifest.json` + `yield-report.md` + `license.txt` + `index.html`.
- **Run réel** sur `main` avec secret OpenRouter (restreint) : premier pack véritable ; **calibration attendue** — un dépassement des cibles (€0,05 / 70 %) au premier pack est une calibration, pas un échec ; le yield-report rend la violation et ses contributeurs explicites (Partie 12) ; l'humain décide (ADR-06).
- **Hygiène** : pas de secrets dans logs/artefacts ; packs tagués immuables (toute correction = nouveau tag) ; **branch protection `main`** activée au ship avec status checks `verify` + `release-gate` requis (note 01-04-SUMMARY).

---

## 13.8 Tests & critères de succès (Phase 10)

| Ce qui doit être VRAI | Mécanisme |
|---|---|
| `license.txt` dans chaque pack : perpetual one-time, commercial use, attribution optionnelle, zéro wording subscription (LIC-01/02) | test unitaire du générateur + gate CI cohérence + grep interdits |
| `index.html` rend 50 assets + toggle light/dark utilisable comme surface de revue | test d'intégration (50 players montés, `setTheme` appelé) + revue humaine |
| `rebuild --manifest` régénère SVG + Lottie **byte-identiques** (hashes match) | test CI sha256 sur pack fixture |
| Passe « looks done but isn't » verte en CI (tableau 13.6) | job `release-gate` exécutant les 13 checks |
| Premier pack end-to-end en CI (fresh checkout) produit l'artefact complet téléchargeable | `release-dry-run` (fixtures) + run réel sur `main` |
| Pack **non approuvé** jamais tagué shippable ; approval explicite enregistré | test : `shippable` reste 0 sans `ship --approve` ; audit `approved_by/at` + `preview_sha256` |

---

## 13.9 Couverture des exigences

| Exigence | Couverture |
|---|---|
| LIC-01 | §13.2 (template + génération depuis `LicenseInfo` + gate CI) |
| LIC-02 | §13.2 (commercial use, attribution optionnelle ; restrictions limitées au cas « bibliothèque concurrente ») |
| QA-05 | §13.5 (approval explicite + audit + anti-contournement) |
| (transverse) | §13.4/13.6 ré-exécutent comme **gates de release** les preuves produites en Phases 3, 4, 8, 9, 11 |

---

## 13.10 Clôture du cahier des charges v1

| Partie | Phase | Exigences principales |
|---|---|---|
| 1–3 | — | Vision/invariants · architecture · stack verrouillé |
| 4 | 1 ✅ | DM-01→05 (+ LIC structurel) — **construit et vérifié** |
| 5 | 2 | STY-01→03, MOT-01→04 |
| 6 | 3 | COM-01→04, SAN-01→05 |
| 7 | 4 | QA-01→04 |
| 8 | 5 | MFT-01→03, ORC-04 |
| 9 | 6 | AGT-01→04, STY-02 |
| 10 | 7 | ORC-01/02/03/05 |
| 11 | 8 | EXP-01→05 |
| 12 | 9 | OBS-01→03, KPI-01/02 |
| 13 | 10 | LIC-01/02, QA-05 |

**Les 50 exigences v1 sont couvertes ; chaque piège critique de PITFALLS.md est prévenu par une gate automatisée ou le ship-gate humain.** Extensions différées (v2/milestone 2) : revue légale complète + indemnisation B2B, WPR-01/02 (portail public), GTM-01→04, COH-01→03, AQA-01/02, signature cryptographique des artefacts, DuckDB, dashboard web.

**Prochaines étapes opérationnelles** : (1) solder l'ouvert CI — `ruff check --fix .` (5× I001) + commit + push pour verdir `verify` ; (2) injecter ce cahier des charges dans GSD (`gsd-ingest-docs` / nouveau projet) ; (3) dérouler les phases 2→10 dans l'ordre, chaque phase héritant des gates CI de la Phase 1.

---

*Fin de la Partie 13 — et du cahier des charges aligné v1 (13 parties).*