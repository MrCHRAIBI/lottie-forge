# Cahier des Charges — lottie-forge
## Partie 1 — Vision, Positionnement & Invariants

> **Document** : Spécification produit — source de vérité unique pour la vision et les contraintes fondamentales.
> **Périmètre de cette partie** : définition du produit, valeur cœur, contraintes non négociables, décisions architecturales verrouillées (ADR), exclusions, KPIs. Les parties suivantes déclinent l'architecture, le stack, les contrats et chaque phase de construction.

---

## 1.1 Ce qu'est lottie-forge

- **Une usine, pas un outil.** Pipeline de production industrielle qui génère des **packs thématiques de 50 illustrations vectorielles animées cohérentes** (SVG + Lottie), par lots (pack-at-a-time), jamais à la volée.
- **Motorisation hybride** : agents LLM non déterministes (idéation, style, composition) **enveloppés dans** des modules de code déterministes (Motion Compiler, SVG Sanitizer, Anim QA, Packager). Le LLM propose des décisions structurées ; le code produit, valide et package.
- **Livrables dev-ready par asset** : composant React, composant Vue, widget Flutter, Lottie JSON, SVG statique compagnon, variante dark-mode, manifest de traçabilité, rapport QA.

## 1.2 Valeur cœur

> Un style visuel verrouillé + un vocabulaire de mouvement catalogué + des exports dev-ready — avec **first-pass yield > 70 %** et **coût unitaire < €0,05 / asset**.

C'est la métrique de succès unique : un pack de 50 assets qui passe le QA du premier coup à plus de 70 %, à moins de €0,05 l'asset (tokens LLM + compute QA + packaging inclus).

## 1.3 Contexte business

| Élément | Définition |
|---|---|
| Client | Développeurs web / mobile / desktop ayant besoin d'illustrations animées cohérentes **sans s'abonner** à une stock library |
| Revenu | Achat **one-time** de packs thématiques (posture anti-subscription explicite) |
| Différenciateur 4 piliers | Style lock + recettes de mouvement + exports multi-frameworks + licence perpétuelle claire |

## 1.4 Contraintes dures (non négociables)

| Domaine | Contrainte |
|---|---|
| Hygiène SVG | Pas d'élément `<text>`, pas de raster embarqué, IDs humains **stables** entre régénérations |
| Motion | Catalogue **fermé** de recettes ; aucun keyframe SMIL/CSS ad-hoc ; **Lottie = seule surface de mouvement** (ADR-01) |
| Qualité | Anim QA automatisée sur **chaque** asset ; un asset échoué bloque le pack |
| Traçabilité | Manifest par asset : style_version, recipe_id, model_id, seeds de prompt, hashes de contenu, rapport QA, timestamp |
| Coût | < €0,05 / asset |
| Yield | First-pass QA > 70 % avant intervention manuelle |
| Échelle | Packs de 50 assets en batch, pas de génération one-off |
| Licence | Perpétuelle, one-time, anti-subscription |

## 1.5 Décisions architecturales verrouillées (ADR)

| ADR | Décision | Conséquence opérationnelle |
|---|---|---|
| 01 | Lottie = seule source de mouvement ; SVG = compagnon **statique** | Aucun champ SMIL/CSS-keyframe dans aucun modèle ; GIF/MP4 = artefacts marketing uniquement |
| 02 | SVGO 4 avec `removeViewBox` / `removeTitle` **gardés désactivés** | Test de régression assertant que `viewBox` et `<title>` survivent (SAN-04) |
| 03 | Catalogue fermé **8–12** recettes nommées | 10 ids verrouillés ; tout changement d'appartenance = un commit touchant les deux modules de vocabulaire |
| 04 | **Vite 7.x** (pas Vite 8) | Écosystème des subdeps aligné sur 7 |
| 05 | Dark mode : dotLottie `themeId` + `theme_anchors` primaire ; `currentColor` fallback **HTML/SVG pur uniquement** | Le spike Phase 8 confirme (bundle/DX), ne redécide pas |
| 06 | **Ship-gate humain** avant release ; pas de Temporal | Doctrine « humain = éditeur, pas producteur » (QA-05) |

## 1.6 Exclusions & hors scope (jamais construit)

- Éditeur d'illustration user-facing
- Génération on-the-fly / runtime
- Raster PNG/WebP
- Pick-and-mix par asset
- Subscription / metered licensing
- Grammaires de motion ouvertes
- Prompt playground public
- Photoréalisme
- Collab temps réel
- Analytics embarquées
- App mobile native
- Auto-traduction (pas de texte par design)

## 1.7 KPIs & gardes

| KPI / Garde | Cible | Où elle est mesurée |
|---|---|---|
| KPI-01 | Coût moyen < €0,05 / asset sur les 10 derniers packs | Manifest (`cost_eur`) + yield report |
| KPI-02 | First-pass yield > 70 % sur les 10 derniers packs | Store SQLite (`qa_reports`) |
| Garde coût | Rejet pré-génération si projection > €0,05 | Orchestrateur (ORC-05) |
| Garde yield | Flag si fenêtre roulante < 70 % | Yield guard (OBS-03) |
| Flake QA | < 1 % en CI | Conteneur Playwright pinné |

## 1.8 Lecture du document

- Chaque partie suivante mappe sur les phases du ROADMAP ; les exigences sont citées par ID (`DM-`, `STY-`, `MOT-`, `COM-`, `SAN-`, `QA-`, `EXP-`, `MFT-`, `ORC-`, `AGT-`, `OBS-`, `LIC-`, `KPI-`).
- **Doctrine « the gate is the gate »** : chaque critère de succès est enforce par CI/QA/contrat typé — jamais par convention ou revue manuelle seule.
- Les ADR de cette partie priment sur toute instruction contradictoire dans les parties suivantes.

---

*Fin de la Partie 1. Partie suivante : **Partie 2 — Architecture cible** (split LLM/déterministe, 5 piliers, flux de données, contrats).*