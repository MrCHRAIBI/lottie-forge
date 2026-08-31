# Phase 3: Motion Compiler & SVG Sanitizer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-31
**Phase:** 3-Motion Compiler & SVG Sanitizer
**Areas discussed:** Modèle RenderSpec & formes, Pose du SVG compagnon, Déterminisme floats & goldens, Frontière RPC & parité

---

## Modèle RenderSpec & formes

| Option | Description | Selected |
|--------|-------------|----------|
| 100 % paramétrique | Type fermé + paramètres, compiler génère tout le path data | ✓ |
| Paths résolus dans la spec | Chaînes `d` résolues par le Translator | |
| Hybride (path uniquement) | Paramétrique sauf champ `d` pour le type path | |

**User's choice:** 100 % paramétrique (D-01)

| Option | Description | Selected |
|--------|-------------|----------|
| anchor ∪ neutral | role ∈ ThemeAnchorId ∪ {neutral} | ✓ |
| Kebab libre | KebabToken ouvert | |
| Rôles structurels | fill/stroke/bg découplé des anchors | |

**User's choice:** anchor ∪ neutral (D-02)

| Option | Description | Selected |
|--------|-------------|----------|
| 10 recettes + galerie | 11 goldens, galerie couvre les 5 générateurs | ✓ |
| Matrice recette × forme | ≈ 35+ goldens exhaustifs | |
| 1 par recette seulement | Générateurs implicitement couverts | |

**User's choice:** 10 recettes + galerie (D-03)

| Option | Description | Selected |
|--------|-------------|----------|
| fixtures/ + builder TS | fixtures/render-specs/ + make_render_spec() | ✓ |
| Co-localisé __tests__ | Inputs des goldens dans __tests__/ | |
| Dérivés des builders Py | Dérivation des builders Python existants | |

**User's choice:** fixtures/ + builder TS (D-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Cross-ref à l'entrée | Parse croise RenderSpec + catalogue | ✓ |
| Check runtime compiler | Erreur runtime TS dans le code | |
| Reporté aux agents | Aucune vérification en Ph 3 | |

**User's choice:** Cross-ref à l'entrée (D-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Ranges fermés zod | Coords 0..1, échelles > 0, points/opacité bornés | ✓ |
| Types seuls | Ranges à la charge des agents Ph 6 | |
| Ranges minimaux | Seulement ce qui casse le rendu | |

**User's choice:** Ranges fermés zod (D-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Borné 1..8 | Coût de compilation borné, goldens lisibles | ✓ |
| Component unique | Un seul component par asset | |
| Non borné | Liste libre | |

**User's choice:** Borné 1..8 (D-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Réutiliser MotionParams | Contrat Ph 1 réutilisé + intensité résolue | ✓ |
| Champs inline dédiés | Duplication de la sémantique motion | |
| Re-dérivation compiler | Le compiler re-décide le mouvement | |

**User's choice:** Réutiliser MotionParams (D-08)

| Option | Description | Selected |
|--------|-------------|----------|
| Fills plats only | Pas de gradient émis, extension v2 | ✓ |
| Gradients émis | Nécessiterait d'étendre StyleSpec | |
| Champ réservé | Champ mort dans le contrat | |

**User's choice:** Fills plats only (D-09)

| Option | Description | Selected |
|--------|-------------|----------|
| Ordre du tableau | Insertion préservée, aucun tri | ✓ |
| Champ z trié | Tri explicite par le compiler | |

**User's choice:** Ordre du tableau (D-10)

| Option | Description | Selected |
|--------|-------------|----------|
| Meta de sortie | renderer_support: "all" \| "svg-only" dans la sortie | ✓ |
| Champ d'entrée | Flag porté par la RenderSpec | |
| Reporté Ph 5 | Naît au manifest | |

**User's choice:** Meta de sortie (D-11)

| Option | Description | Selected |
|--------|-------------|----------|
| v = "5.7.0" | Doc §6.3.4 verbatim, compat mobile | ✓ |
| v = "5.9.0" | Subset plus riche, risque Flutter | |
| v = "5.13.0" | Sémantiquement faux (format ≠ player) | |

**User's choice:** v = "5.7.0" (D-12)

**Free-text (clôture area 1) — deux méta-règles :**
1. Naming des champs : réutilisation verbatim de la convention JSON des contrats Phase 1 (parité de clés Py↔zod déjà prouvée par le bridge). Aucune convention locale nouvelle dans RenderSpec. Tout écart = rejet à la revue, sans discussion. → D-13
2. Encodage draw-on (trim-path) : la couche stroke porte `paint: fill | stroke` + pour stroke une référence par nom de token à `StyleSpec.stroke_widths` (thin|default|bold) — jamais un float libre ; le trim 0→1 est émis par keyframe-emitter depuis le keyframe_shape de la recette ; le tracé lui-même est une shape paramétrique comme les autres (liste de points bornée). → D-14

**Notes:** L'utilisateur a demandé 3 tours de questions sur cette area (8 questions + 2 méta-règles) avant de clore.

---

## Pose du SVG compagnon

| Option | Description | Selected |
|--------|-------------|----------|
| Par trigger : fin ou t=0 | one-shot enter → frame finale ; loop → t=0 | ✓ |
| t=0 universel | draw-on invisible à t=0 | |
| Champ dans le catalogue | Édition du contrat catalogue Ph 2 | |
| Finale universelle | Trompeur pour les loop | |

**User's choice:** Par trigger : fin ou t=0 (D-15)

| Option | Description | Selected |
|--------|-------------|----------|
| Concret, theming en Ph 8 | Couleurs résolues ; substitution hex→var(--anchor) en Ph 8 | ✓ |
| currentColor natif | SVG brut rend noir sans wrapper CSS | |
| Deux variantes | source.svg + source-theme.svg | |

**User's choice:** Concret, theming en Ph 8 (D-16)

| Option | Description | Selected |
|--------|-------------|----------|
| Chaînage explicite | motion.compile → svg.sanitize par l'appelant | ✓ |
| Sanitize interne | compile() sanitise en interne | |
| Les deux | Redondance de la preuve de gate | |

**User's choice:** Chaînage explicite (D-17)

| Option | Description | Selected |
|--------|-------------|----------|
| Dérivé compiler | Depuis asset_id + recipe_id, zéro texte libre | ✓ |
| Champ RenderSpec | Texte user-supplied (LLM Ph 6/7) | |
| Absent en Ph 3 | Perte d'a11y §13 | |

**User's choice:** Dérivé compiler (D-18)

| Option | Description | Selected |
|--------|-------------|----------|
| <g> par component | ID stable par groupe, miroir layers Lottie | ✓ |
| Paths à plat | Régions theming non identifiables | |
| Nesting profond | Hiérarchie non décrite par le catalogue | |

**User's choice:** <g> par component (D-19)

| Option | Description | Selected |
|--------|-------------|----------|
| Builder dédié | Template strings contrôlés, zéro dépendance | ✓ |
| DOM + XMLSerializer | Ordre d'attributs dépendant du runtime | |
| SVGO sérialise | 2ᵉ source de vérité du format | |

**User's choice:** Builder dédié (D-20)

| Option | Description | Selected |
|--------|-------------|----------|
| Manifest only | Traçabilité MFT-01, SVG = rendu pur | ✓ |
| data-attributes | Surface de drift avec le manifest | |
| Commentaire hashes | Circularité des hashes du SVG | |

**User's choice:** Manifest only (D-21)

| Option | Description | Selected |
|--------|-------------|----------|
| viewBox seul | « responsive garanti » §6.3.2 verbatim | ✓ |
| width/height + viewBox | Figé une taille intrinsèque | |
| Champ size optionnel | Besoin non démontré | |

**User's choice:** viewBox seul (D-22)

**Notes:** 2ᵉ tour demandé sur cette area (8 questions au total).

---

## Déterminisme floats & goldens

| Option | Description | Selected |
|--------|-------------|----------|
| Formateur canonique | Précision fixée, pas d'exponentielle, indépendant du moteur | ✓ |
| JSON.stringify natif | Format dépendant de V8/version Node | |
| Entiers d'abord | Précision perdue sur les easings | |

**User's choice:** Formateur canonique (D-23)

| Option | Description | Selected |
|--------|-------------|----------|
| Compact | Goldens = bytes livrés | ✓ |
| Pretty-print | Artefact golden ≠ artefact livré | |
| Compact + EOF | Git-friendly, un octet de plus | |

**User's choice:** Compact + EOF — l'utilisateur a choisi la variante newline final plutôt que le compact strict recommandé (D-24)

| Option | Description | Selected |
|--------|-------------|----------|
| Script dédié + same-commit | goldens:update + diff relu, CI ne régénère jamais | ✓ |
| Flag vitest | UPDATE_GOLDENS=1, risque d'invocation accidentelle | |
| Auto-update | Changement accidentel « passe » sans revue | |

**User's choice:** Script dédié + same-commit (D-25)

| Option | Description | Selected |
|--------|-------------|----------|
| Double process | Spawn de 2 process Node, diff entre eux et vs golden | ✓ |
| Double appel in-process | Partage runtime V8 et caches | |
| Les deux | Redondance coûteuse | |

**User's choice:** Double process (D-26)

---

## Frontière RPC & parité

| Option | Description | Selected |
|--------|-------------|----------|
| NDJSON + id | Une ligne = un message, corrélation par id | ✓ |
| Content-Length (LSP) | Framing binaire overkill | |
| Lockstep sans id | Aucune évolutivité pipelining | |

**User's choice:** NDJSON + id (D-27)

| Option | Description | Selected |
|--------|-------------|----------|
| Enveloppe + codes fermés | {id, ok, result\|error:{code,...}}, Literal | ✓ |
| JSON-RPC 2.0 | Codes numériques opaques, champs never-used | |
| Strings libres | Rien de testable structurellement | |

**User's choice:** Enveloppe + codes fermés (D-28)

| Option | Description | Selected |
|--------|-------------|----------|
| Harnais JSON dès Ph 3 | fixtures/rejection-cases/ vitest, branchement pytest Ph 7 sans réécriture | ✓ |
| Inline puis harnais Ph 7 | Réécriture/double travail en Ph 7 | |
| Miroir anticipé | Contredit le gel §6.3.1 | |

**User's choice:** Harnais JSON dès Ph 3 (D-29)

| Option | Description | Selected |
|--------|-------------|----------|
| Transport + enveloppe | lottie_forge/rpc/client.py, re-validation typée Ph 7 | ✓ |
| Client typé complet | Miroirs Pydantic dès Ph 3 (contredit le gel) | |
| Client test-only | Transport réécrit en Ph 7 (preuve jetée) | |

**User's choice:** Transport + enveloppe (D-30)

---

## Ajouts utilisateur post-discussion (2026-08-31)

> Décisions fournies free-text par l'utilisateur après clôture des 4 areas — numérotées D-31 → D-37, reportées verbatim dans CONTEXT.md.

| # | Sujet |
|---|-------|
| D-31 | Gates SVG complètes du sanitizer : allow-list étendue (`<title>`, `<desc>`, racine `<svg>`) ; rejet dur commentaires XML, `data-*`, width/height racine, préfixes namespace ; self-consistance sur chaque golden |
| D-32 | IDs 2/3 segments : 3 segments sur les shapes, préfixe 2 segments sur le `<g>` ; unicité (component, role) par superRefine, jamais de dedup implicite |
| D-33 | Gate de features : 2 catégories jamais confondues (rejet dur `unsupported_feature` vs `renderer_support: svg-only`) ; expressions = rejet dur ; `// lottie:bake` différé v2 |
| D-34 | Motion/géométrie : duration/easing jamais copiés (recipe_ref + catalogue pinné) ; triggers émis par le compiler ; ranges deltas séparés des coords 0..1 ; cross-field superRefine |
| D-35 | Formateur canonique : sémantique `toFixed(4)`, `-0 → 0`, trailing zeros stripés ; même formateur pour le SVG ; tests à cas exacts |
| D-36 | Robustesse RPC : stdout réservé au protocole, `protocol_error` sans crash, 3 codes en sus (8 total), pipelining permis / client lockstep |
| D-37 | Preuves : diff trois-voies + délai ≥ 1 s, code attendu par cas de rejet, switch exhaustif sans default, ink visible, isomorphisme Lottie↔SVG, `goldens:update` refuse si `CI=true` |

**User's choice:** free-text (les 7 décisions, acceptées telles quelles)
**Notes:** D-33 est un écart volontaire vs §6.3.4 (bake différé v2, aucune expression bakée en Ph 3) — signalé dans CONTEXT.md §specifics.

---

## the agent's Discretion

- Précision décimale exacte du formateur canonique (D-23) et valeurs des ranges fermés (D-06/D-07)
- Organisation interne des modules (fichiers §6.2 déjà nommés, découpage fin libre)
- Encodage paramétrique précis des shapes (noms de champs selon D-13)
- Contenu exact des fixtures render-specs/ (poses représentatives, cas galerie)
- Détails SVGO (ordre des plugins custom, passes multipass)

## Deferred Ideas

None — discussion stayed within phase scope (gradients = extension v2 déjà tracée §6.8 du doc)
