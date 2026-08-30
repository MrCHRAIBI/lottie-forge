# Phase 2: Style verrouillé & catalogue de recettes - Pattern Map

**Mapped:** 2026-08-30
**Files analyzed:** 29 (14 new, 15 counting modifications to shared harness files)
**Analogs found:** 24 / 29 (5 fixture/mechanism files have no codebase analog — content is locked verbatim in CONTEXT.md D-01/D-15 or docs §5.2.2; their *surrounding mechanisms* all have analogs)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `fixtures/style-specs/example-style/style.yaml` | config/product-data | file-I/O | content verbatim docs §5.2.2 (l.35-49); hash mechanism = D-02 + `.gitattributes` | content-locked |
| `fixtures/style-specs/example-style/palette.json` | derived-data | transform | `fixtures/bridge/style-spec.from-python.json` generation+sync-test pattern (`test_style_spec_bridge.py` l.41-59) | partial |
| `fixtures/recipe-catalogue/catalogue.json` | product-data | file-I/O | `fixtures/rejection-cases/*.json` (committed JSON read by both Py+TS); `fixtures/bridge/vocabulary.json` (Py-exported, TS-deep-equal) | role-match |
| `fixtures/recipe-catalogue/coverage-map.json` | product-data | file-I/O | none (structure locked in D-15); consumed by audit test (D-14) | none |
| `lottie_forge/domain/style_refinement.py` *(placement at agent's discretion)* | model | request-response (LLM-output validation) | `lottie_forge/domain/style.py` + `recipe.py` | exact |
| `lottie_forge/domain/catalogue.py` (`RecipeCatalogue`, `CatalogRecipe`) | model | file-I/O (loads committed JSON) | `lottie_forge/domain/pack.py` (collect-all validators) + `recipe.py` (bounded fields) | exact |
| style loader module (YAML→StyleSpec + sha256) *(discretion)* | service/utility | file-I/O + transform | `tests/bridge/rejection_loader.py` (repo-root file loading); bridge export test (validate-then-assert) | role-match |
| catalogue loader + palette.json derivation *(discretion)* | service/utility | transform | `tests/bridge/rejection_loader.py`; palette derivation = single-source doctrine of `tests/bridge/fixtures.py` | role-match |
| `scan_stale_pins(pins, current_version)` gate module *(discretion)* | utility | transform (pure function) | `vocabulary.py::assert_recipe_count` (pure guard, l.77-101) + STRICT_CONFIG flag model (D-08) | role-match |
| prompt-fixture render module *(discretion)* | utility | transform | none (no prompt code exists yet — Phase 6); template contract in D-13 | none |
| prompt template w/ `{{catalogue_json}}`/`{{catalogue_hash}}` | template | transform | none (skeleton is D-13, placeholders contractual) | none |
| `src/rpc/contracts/style-refinement.schema.ts` | contract mirror | request-response | `src/rpc/contracts/style-spec.schema.ts` | exact |
| `src/rpc/contracts/catalogue.schema.ts` | contract mirror | file-I/O | `pack-manifest.schema.ts` (aggregated superRefine) via `style-spec.schema.ts` l.71-89 pattern | exact |
| `fixtures/rejection-cases/style-refinement.json` | test-data | batch | `fixtures/rejection-cases/style-spec.json` | exact |
| `fixtures/rejection-cases/catalogue.json` | test-data | batch | `fixtures/rejection-cases/recipe.json`, `style-spec.json` | exact |
| `tests/domain/test_style_refinement.py` | test | batch | `tests/domain/test_style_spec.py` pattern | exact |
| `tests/domain/test_catalogue.py` | test | batch | `tests/domain/test_vocabulary.py` (structural scans) + `test_pack.py` (collect-all) | exact |
| loader/gate/audit test files | test | batch | `tests/bridge/test_style_spec_bridge.py` (export+assert), `test_vocabulary.py` (same-commit scan) | role-match |
| `src/rpc/contracts/style-refinement.spec.ts` | test | batch | `src/rpc/contracts/style-spec.spec.ts` | exact |
| `src/rpc/contracts/catalogue.spec.ts` | test | batch | `style-spec.spec.ts` (rejection harness + key parity) | exact |
| `tests/bridge/test_{style_refinement,catalogue}_bridge.py` | test | batch | `tests/bridge/test_style_spec_bridge.py` | exact |
| **MOD** `lottie_forge/domain/vocabulary.py` (+`ThemeAnchorId`) | model/vocabulary | n/a | same file, `RecipeId` block l.30-101 | exact (self) |
| **MOD** `src/rpc/contracts/vocabulary.schema.ts` (+`ThemeAnchorIdSchema`) | contract/vocabulary | n/a | same file, `RECIPE_IDS` block l.18-51 | exact (self) |
| **MOD** `lottie_forge/domain/asset.py` (`ContentHashes` → 4 fields) | model | n/a | same file, `ContentHashes` l.99-111; §4.14 rule in docstring l.38-44 | exact (self) |
| **MOD** `src/rpc/contracts/asset-spec.schema.ts` (`ContentHashesSchema` → 4) | contract | n/a | same file, l.51-62 | exact (self) |
| **MOD** `fixtures/rejection-cases/asset-spec.json` (+4-field cases) | test-data | batch | same file, existing case format | exact (self) |
| **MOD** `tests/bridge/fixtures.py` (`make_asset` 4 hashes, new builders) | test-fixture | transform | same file l.97-130 | exact (self) |
| **MOD** `tests/bridge/rejection_loader.py` (+2 `CONTRACT_FILES` entries) | test-harness | file-I/O | same file l.28-33 | exact (self) |
| **MOD** `src/rpc/contracts/rejection-cases.ts` (+2 entries) | test-harness | file-I/O | same file l.27-32 | exact (self) |

**Unchanged by doctrine (D-18):** `.github/workflows/verify.yml` — steps 08-10 (`pytest -k export` l.85, `npx vitest run` l.89, `pytest tests/ -q` l.95) already pick up any new test file. **Zero workflow edits.**

## Pattern Assignments

### `lottie_forge/domain/style_refinement.py` (model, request-response)

**Analog:** `lottie_forge/domain/style.py` + `lottie_forge/domain/recipe.py`

**Imports & shared-infra pattern** (`_shared.py` lines 21-33) — reuse verbatim, never re-declare:
```python
from typing import Annotated
from pydantic import ConfigDict, StringConstraints

STRICT_CONFIG = ConfigDict(extra="forbid", strict=True)
TOKEN_NAME_PATTERN = r"^[a-z][a-z0-9-]*$"
# CR-01 (D-02 #1): validation owned by pydantic-core, not a hand-rolled validator.
KebabToken = Annotated[str, StringConstraints(pattern=TOKEN_NAME_PATTERN, max_length=64)]
```

**Model skeleton with bounded fields + Literal** (`style.py` lines 88-107 shows the canonical shape; `recipe.py` lines 50-62 shows the Literal-enum pattern):
```python
class EasingCurve(BaseModel):
    model_config = STRICT_CONFIG
    name: KebabToken
    control_points: list[ControlPoint] = Field(min_length=4, max_length=4)

# recipe.py — closed Literal pattern to replicate for stroke_pick/radius_pick:
Direction = Literal["up", "down", "left", "right", "none"]
class MotionParams(BaseModel):
    model_config = STRICT_CONFIG
    amplitude: Annotated[float, Field(ge=0.0, le=1.0)]
    direction: Direction
    loops: Annotated[int, Field(ge=1, le=10)]
```

**StyleRefinement target** (docs §5.3 lines 60-68, delta-only): all fields from `{STRICT_CONFIG, KebabToken, Literal["thin","default","bold"], Literal["small","medium","large"], Field(ge=0, le=1)}` — **no** hex/path/SVG-capable field. Optional field pattern (`motif: KebabToken | None = None`) matches plain Pydantic optional syntax already used across domain models. Delta-only structural test = assert closed field set + KebabToken rejects `"#fff"` and `"<path"` (§5.3 l.71).

---

### `lottie_forge/domain/catalogue.py` — `RecipeCatalogue` / `CatalogRecipe` (model, file-I/O)

**Analog:** `lottie_forge/domain/pack.py` (aggregated validators) + `recipe.py` (bounded per-recipe fields)

**CatalogRecipe fields** (`recipe.py` lines 65-82 — base envelope; §5.5.1 JSON shows catalogue uses `id`, not `recipe_id`):
```python
class MotionRecipe(BaseModel):
    model_config = STRICT_CONFIG
    recipe_id: RecipeId                      # imported from vocabulary, never re-derived
    family: KebabToken                       # stays FREE string per D-01/§5.9 — NOT a Literal
    duration_ms: Annotated[int, Field(ge=100, le=10_000)]
    easing: KebabToken
    params: MotionParams
    theme_anchors: list[KebabToken] = Field(default_factory=list, max_length=16)
```
CatalogRecipe adds: `keyframe_shape` (Literal, e.g. "opacity-ramp"), `intensity_range` (ordered tuple 0..1), `shapes_supported` ⊆ `{rect, ellipse, path, polyline, polystar}`, `trigger_points` ⊆ `{enter, exit, loop}` (§5.5.3 l.143). Pack-range duration check 600..1500 keeps model bounds 100..10000 (§5.5.3 validator 4).

**Collect-all aggregated validators** (`pack.py` lines 183-294 — copy this exact strategy for §5.5.3 validators 1-4):
```python
@model_validator(mode="after")
def _validate_pack_invariants(self) -> Self:
    details: list[InitErrorDetails] = []
    # ...each failing invariant appends one InitErrorDetails with precise loc:
    details.append(InitErrorDetails(
        type=PydanticCustomError("duplicate_asset_id", "duplicate asset_id {id!r} ...",
                                 {"id": asset.asset_id, ...}),
        loc=("assets", idx, "asset_id"),
        input=asset.asset_id,
    ))
    if details:
        raise ValidationError.from_exception_data(self.__class__.__name__, details)
    return self
```
Validator mapping: (1) ids ⊆ `RecipeId` import + unique + 8-12 invariant → loc `("recipes", idx, "id")`; (2) `theme_anchors` ≥ 1 (MOT-03) with labels from the new `ThemeAnchorId`; (3) `easing ∈ StyleSpec.easing_curves` — **at joint load** (D-17), see Shared Patterns; (4) pack-range durations.

**Imports rule** (`recipe.py` line 44): `from lottie_forge.domain.vocabulary import RECIPE_IDS, RecipeId` — the vocabulary module is the single source of truth; never re-declare id lists.

---

### MOD `lottie_forge/domain/vocabulary.py` + `src/rpc/contracts/vocabulary.schema.ts` — `ThemeAnchorId` (D-10/D-11)

**Analog:** the existing `RecipeId` block in the same files — replicate the exact structure.

**Python side** (`vocabulary.py` lines 30-41, 49-60, 77-101):
```python
RECIPE_IDS: Final[tuple[str, ...]] = ("fade", ..., "orbit")

RecipeId = Literal["fade", "slide", "bounce", "pulse", "draw-on",
                   "rotate", "scale-pop", "float", "wiggle", "orbit"]

def assert_recipe_count(ids: tuple[str, ...]) -> None:
    count = len(ids)
    if count < MIN_RECIPE_COUNT or count > MAX_RECIPE_COUNT:
        raise ValueError(f"recipe count must satisfy {MIN_RECIPE_COUNT} <= n <= ...")

# Runtime self-check at import time (line 101):
assert_recipe_count(RECIPE_IDS)
```
Add alongside: `THEME_ANCHOR_IDS: Final[tuple[str, ...]] = ("primary","secondary","accent","background","success","danger")` + `ThemeAnchorId = Literal[...]` (D-10, closed set of 6; unknown label rejected at load). No count invariant needed (fixed 6) — but keep the get_args == tuple lockstep test (`test_vocabulary.py` line 66: `assert get_args(RecipeId) == RECIPE_IDS`).

**TypeScript side** (`vocabulary.schema.ts` lines 18-37, 47-51):
```typescript
export const RECIPE_IDS = ["fade", ..., "orbit"] as const;
export type RecipeId = (typeof RECIPE_IDS)[number];
export const RecipeIdSchema = z.enum(RECIPE_IDS);
// module-eval runtime invariant:
if (RECIPE_IDS.length < MIN_RECIPE_COUNT || ...) { throw new Error(...); }
```
Add `THEME_ANCHOR_IDS`, `type ThemeAnchorId`, `ThemeAnchorIdSchema = z.enum(THEME_ANCHOR_IDS)` mirroring the same block.

**Same-commit rule extension (D-14C):** membership changes now touch `vocabulary.py` + `vocabulary.schema.ts` + `catalogue.json` + `coverage-map.json` in ONE commit. Extend the structural scan (see Shared Patterns).

---

### MOD `lottie_forge/domain/asset.py` + `src/rpc/contracts/asset-spec.schema.ts` — `content_hashes` 4 fields (D-16)

**Analog:** the current 2-field models in the same files.

**Python** (`asset.py` lines 69-82, 99-111):
```python
SHA256_HEX_PATTERN = r"^[a-f0-9]{64}$"
Sha256Hex = Annotated[str, Field(pattern=SHA256_HEX_PATTERN, min_length=64, max_length=64)]

class ContentHashes(BaseModel):
    """...The Phase-8 dotlottie_sha256 extension is added by editing this model
    in the same commit (rule §4.14), not by smuggling a third key past extra="forbid"."""
    model_config = STRICT_CONFIG
    svg_sha256: Sha256Hex
    lottie_sha256: Sha256Hex
```
→ add `style_sha256: Sha256Hex` and `catalogue_sha256: Sha256Hex` (same-commit edit §4.14, exactly as the docstring anticipates). Reuse `Sha256Hex`; do not create a second hash type.

**TypeScript** (`asset-spec.schema.ts` lines 45, 51, 59-62):
```typescript
export const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const Sha256HexSchema = z.string().regex(SHA256_HEX_PATTERN).length(64);
export const ContentHashesSchema = z.strictObject({
  svg_sha256: Sha256HexSchema,
  lottie_sha256: Sha256HexSchema,
});
```
→ add the two fields identically.

---

### `src/rpc/contracts/style-refinement.schema.ts` + `catalogue.schema.ts` (contract mirrors)

**Analog:** `style-spec.schema.ts` (full mirror anatomy) + `recipe.schema.ts` (vocabulary import)

**Mirror header + regex constants** (`style-spec.schema.ts` lines 1-19):
```typescript
import { z } from "zod";
/** zod mirror of the Pydantic `StyleSpec` in `lottie_forge/domain/style.py` (DM-05). ... */
export const STYLE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
export const TOKEN_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
```

**strictObject + superRefine cross-field** (`style-spec.schema.ts` lines 71-89) — this is the zod template for the catalogue's aggregated validators §5.5.3 AND the joint-load easing cross-ref (D-17):
```typescript
export const StyleSpecSchema = z
  .strictObject({ /* fields mirroring Pydantic exactly */ })
  .superRefine((spec, ctx) => {
    const names = spec.palette.map((token) => token.name);
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: "custom", path: ["palette"], message: "palette token names must be unique" });
    }
  });
```

**Vocabulary import rule** (`recipe.schema.ts` lines 1-3, 32-38):
```typescript
import { RecipeIdSchema } from "./vocabulary.schema.js";
export const MotionRecipeSchema = z.strictObject({
  recipe_id: RecipeIdSchema,
  family: z.string().regex(TOKEN_NAME_PATTERN).max(64),
  theme_anchors: z.array(...).max(16).default([]),
});
```
Note `verbatimModuleSyntax` (AGENTS.md): relative imports carry the `.js` extension. For `catalogue.schema.ts`, `theme_anchors` items become `ThemeAnchorIdSchema` (D-11). The D-17 easing cross-ref is a `superRefine` over the jointly-loaded `{catalogue, style}` pair on the TS side too — parity of rejection includes "easing inconnu".

---

### Rejection fixtures + harness registration (new contracts + content_hashes cases)

**Analog:** `fixtures/rejection-cases/style-spec.json` + both loaders

**Case format D-08** (`style-spec.json` lines 1-21, verbatim shape):
```json
[
  {
    "case_id": "cr01-accent-newline",
    "ref": "CR-01",
    "model": "StyleSpec",
    "payload": { ... full valid payload with ONE mutation ... },
    "expect_paths": [["palette", 1, "name"]]
  }
]
```
Rules visible in the existing file: every payload is a complete valid object with one targeted mutation; `expect_paths` optional (absent = rejection-only, e.g. extra-key cases lines 102-140); paths are loc-tuples matching on BOTH sides.

**Registration** — add entries in both loaders (`rejection_loader.py` lines 28-33 / `rejection-cases.ts` lines 27-32):
```python
CONTRACT_FILES: dict[str, str] = {
    "style-spec": "style-spec.json",
    "recipe": "recipe.json",
    "asset-spec": "asset-spec.json",
    "pack-manifest": "pack-manifest.json",
    # Phase 2: "style-refinement": "style-refinement.json", "catalogue": "catalogue.json",
}
```

**Pytest consumption** (`test_style_spec_bridge.py` lines 78-89):
```python
_REJECTION_CASES = load_rejection_cases("style-spec")

@pytest.mark.parametrize("case", _REJECTION_CASES, ids=lambda c: c.case_id)
def test_bridge_rejection_case(case) -> None:
    with pytest.raises(ValidationError):
        StyleSpec.model_validate(case.payload)
```

**Vitest consumption** (`style-spec.spec.ts` lines 80-97):
```typescript
describe("style-spec rejection harness (mirror of pytest)", () => {
  const cases = loadRejectionCases("style-spec");
  it.each(cases.map((c) => [c.case_id, c]))("%s -> zod rejects the shared payload", (_caseId, c) => {
    const result = StyleSpecSchema.safeParse(c.payload);
    expect(result.success).toBe(false);
    if (result.success) return;
    const actualPaths = new Set(result.error.issues.map((issue) => JSON.stringify(issue.path)));
    for (const expected of c.expect_paths) {
      expect(actualPaths.has(JSON.stringify(expected))).toBe(true);
    }
  });
});
```
New cases to add: StyleRefinement (hex-like `"#fff"`, svg-like `"<path"` in KebabToken fields, unknown Literal value, out-of-bounds accent_weight, extra key); Catalogue (`disco-spin` id, `theme_anchors: []`, unknown easing — MOT-04 parity, duplicate ids, >12 recipes, out-of-order intensity_range); asset-spec (4th/5th hash key → strict rejection, bad digest format on `style_sha256`).

---

### `fixtures/style-specs/example-style/` + loaders + palette.json (D-01→D-04)

**Content analog:** docs §5.2.2 lines 35-49 are the verbatim `style.yaml` values (`style_id: example-style`, `1.0.0`, viewBox 400×300, 4 palette tokens, 2 easing curves). `baseline-frames/` NOT created (D-05).

**Loader mechanism analog** (`rejection_loader.py` lines 25-26 for repo-root resolution; bridge export test for validate-then-assert):
```python
REPO_ROOT = Path(__file__).resolve().parents[2]
```
Loader contract (§5.2.2 rules + D-02): read raw bytes → **normalize CRLF→LF** → hash `sha256` of normalized bytes → `yaml.safe_load` → `StyleSpec.model_validate`. Hash is of the committed file's bytes (LF form, guaranteed by `.gitattributes` line 18: `* text=auto eol=lf`), verifiable via `sha256sum` outside the factory. The YAML never crosses the Py↔TS boundary — only validated JSON does (§5.2.2 last rule).

**palette.json sync-test analog** (`test_style_spec_bridge.py` lines 41-59 — generate + assert re-readable):
```python
def test_export_style_spec() -> None:
    spec = make_style_spec()
    FROM_PYTHON.write_text(spec.model_dump_json(), encoding="utf-8")
    # ... assert artifact re-reads under the strict model:
    assert StyleSpec.model_validate_json(FROM_PYTHON.read_text(encoding="utf-8")) == spec
```
D-04 replicates this shape: a test derives palette.json content from `style.yaml` and asserts byte-equality with the committed file — divergence reddens CI.

---

### `fixtures/recipe-catalogue/catalogue.json` + `coverage-map.json` (D-01, D-15)

**Content:** locked verbatim — the 10-recipe matrix (D-01 table: `intensity_range`/`shapes_supported`/`trigger_points`) + §5.5.2 table (`id, family, duration_ms, easing, keyframe_shape, theme_anchors`) + §5.5.1 JSON envelope (`catalogue_version: "1.0.0"`, `recipes: [...]`). `family` stays a free string (D-01 note / §5.9: catalogue is the source of families — no second list). Coverage-map: 3 verticals × state→recipe_id mappings per D-15 (all 10 recipes covered, exit states present, loop states → orbit/float/pulse).

**Consumption analog** (`fixtures/bridge/vocabulary.json` pattern): committed JSON read directly by Python (`RecipeCatalogue.model_validate(json.loads(...))`) and TS (`RecipeCatalogueSchema.parse(...)`) — MOT-04 "chargement bilingue" with a deep-equal parity test (§5.5.3 l.150). This is NOT the 3-step bridge chain (no `.from-python.json`/`.from-ts.json` artifacts for the catalogue); the ordered bridge chain applies to the **style fixture** instead (§5.2.2 explicitly routes style through it).

---

### `scan_stale_pins` gate (D-06→D-09) + audit test (D-14)

**Analog:** `vocabulary.py::assert_recipe_count` (pure function, l.77-101) + STRICT_CONFIG flag model + structural scan test

```python
def assert_recipe_count(ids: tuple[str, ...]) -> None:
    """Raise ValueError if ... outside the closed range..."""
    count = len(ids)
    if count < MIN_RECIPE_COUNT or count > MAX_RECIPE_COUNT:
        raise ValueError(f"recipe count must satisfy ... got {count}")
```
D-06: pure function, source of pins **injectable** (fixtures now, manifest store Phase 5+), consumes `AssetSpec.style_ref` via `STYLE_REF_PATTERN` (`asset.py` line 65: `r"^[a-z][a-z0-9-]*@\d+\.\d+\.\d+$"`) — consume verbatim, no re-derivation (WR-01: `rsplit("@", 1)` pattern from `pack.py` line 270). D-08: flags are a Pydantic strict model (`asset_id, pinned_version, current_version, bump_class, scope`) — **no zod mirror**, the gate is Python-only. D-09: bump_class by semver diff in-function; scope declarative in Phase 2.

**Two blocking tests (D-07)** — pattern from the domain suites: (a) bump simulé = parametrized flags-assertion suite (`test_vocabulary.py` lines 105-126 boundary style); (b) garde permanente = scan committed fixtures, assert zero stale pins. Both run inside existing verify steps (D-18).

**Structural scan test pattern** (`test_vocabulary.py` lines 168-195 — template for the D-14C extended same-commit scan and the D-14 coverage audit):
```python
def test_only_vocabulary_schema_ts_declares_the_id_list() -> None:
    offenders: list[str] = []
    for ts_path in CONTRACTS_DIR.glob("*.ts"):
        if ts_path.name == "vocabulary.schema.ts": continue
        if ts_path.name.endswith(".spec.ts"): continue
        text = ts_path.read_text(encoding="utf-8")
        if re.search(r"export\s+const\s+RECIPE_IDS\b", text):
            offenders.append(ts_path.relative_to(REPO_ROOT).as_posix())
    assert offenders == [], f"... offenders: {offenders}"
```
Coverage audit (D-14): load `catalogue.json` + `coverage-map.json`, assert (A) every mapped id ∈ RecipeId, (B) every catalogue id appears ≥ 1 time (no dead recipe), run on every catalogue change.

---

### Prompt-fixture mechanism (D-13) + template

**No analog.** Mechanism contract: render module injects catalogue JSON verbatim + its sha256 (same regime as D-02/D-03) into a versioned skeleton template whose only contractual elements are the `{{catalogue_json}}` / `{{catalogue_hash}}` placeholders. Test asserts: placeholder present in template, hash injectable, hash recorded at manifest level (§5.5.3 l.151). Phase 6 fills the template with zero refactor of the mechanism.

## Shared Patterns

### Strictness & shared types
**Source:** `lottie_forge/domain/_shared.py` lines 25-33
**Apply to:** every new/extended Pydantic model (`StyleRefinement`, `CatalogRecipe`, `RecipeCatalogue`, stale-pin flags) — `STRICT_CONFIG` + `KebabToken` imported, never redefined. zod side: every object is `z.strictObject` (mirrors `extra="forbid"`), bounds mirror Pydantic exactly — one-sided bound = drift.

### Closed vocabulary, same-commit
**Source:** `vocabulary.py` lines 30-68 + `vocabulary.schema.ts` lines 18-51 + `test_vocabulary.py` lines 161-228
**Apply to:** `ThemeAnchorId` (D-10/D-11) and catalogue ids — single declaration site per side, downstream files import; membership changes touch `vocabulary.py` + `vocabulary.schema.ts` + `catalogue.json` + `coverage-map.json` in one commit (D-14C). Extend the structural scan to the 4-file rule.

### Collect-all validators with precise locs
**Source (Py):** `pack.py` lines 183-294 (`InitErrorDetails` + `ValidationError.from_exception_data`) · **Source (TS):** `style-spec.schema.ts` lines 71-89 (`.superRefine` + `ctx.addIssue` with `path`)
**Apply to:** catalogue validators §5.5.3 (Py) and `catalogue.schema.ts` (TS); paths compared in the rejection harness, never message text (D-08).

### Shared rejection harness (D-06/D-07/D-08 of Phase 1, replicated)
**Source:** `tests/bridge/rejection_loader.py` + `src/rpc/contracts/rejection-cases.ts` + `fixtures/rejection-cases/*.json` + the two consuming suites (`test_style_spec_bridge.py` l.78-89, `style-spec.spec.ts` l.80-97)
**Apply to:** `style-refinement.json`, `catalogue.json`, asset-spec 4-field cases — one JSON, two loaders, parametrized both sides, path-membership only.

### Bridge ordered chain (pytest export → vitest → pytest re-import)
**Source:** `tests/bridge/test_style_spec_bridge.py` lines 41-72 + `style-spec.spec.ts` lines 38-62 (hard-throw on missing artifact, never silent skip) + `verify.yml` steps 08-10
**Apply to:** the style fixture traversal (§5.2.2). Catalogue/rejection fixtures are read directly by both sides (MOT-04) — deep-equal parity instead.

### Hash regime: raw committed bytes, LF-normalized
**Source:** `.gitattributes` line 18 (`* text=auto eol=lf`) + D-02/D-03
**Apply to:** `style_sha256` (style.yaml bytes) and `catalogue_sha256` (catalogue.json bytes) — normalize LF before hashing, verifiable via `sha256sum` outside the factory. All 4 `content_hashes` fields on AssetSpec use the existing `Sha256Hex` type.

### CI doctrine: byte-for-byte, zero-skip
**Source:** `.github/workflows/verify.yml` (12 sequential steps, no `continue-on-error`) + step 12 zero-skip gate
**Apply to:** D-18 — verify.yml untouched; new pytest/vitest files are auto-collected. Tests fail loud (throw/pytest.raises), never skip.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `fixtures/recipe-catalogue/coverage-map.json` | product-data | file-I/O | No mapping-style fixture exists; structure fully locked in D-15 (content is data, not code) |
| `fixtures/style-specs/example-style/style.yaml` | config | file-I/O | Values are verbatim docs §5.2.2; loader + hash mechanisms do have analogs (above) |
| prompt-fixture render module | utility | transform | No prompt-generation code exists yet (agents arrive Phase 6); mechanism contract = D-13 |
| prompt template skeleton | template | transform | Versioned file with 2 contractual placeholders (D-13); wording at agent's discretion |
| `fixtures/recipe-catalogue/catalogue.json` (content) | product-data | file-I/O | Content locked verbatim by D-01 matrix + §5.5.2; its loading/validation has exact analogs |

For these, the planner should use CONTEXT.md D-01/D-13/D-15 and docs `05_Style.md` §5.2.2/§5.5.1/§5.5.2 as the content source — they are intentionally data-locked, not pattern-derived.

## Metadata

**Analog search scope:** `lottie_forge/domain/`, `src/rpc/contracts/`, `tests/domain/`, `tests/bridge/`, `fixtures/`, `.github/workflows/`, repo root (`.gitattributes`), `docs/project/05_Style.md`
**Files scanned:** 20 source/test/fixture files read in full + 1 doc (197 lines)
**Pattern extraction date:** 2026-08-30
**Key line anchors:** STRICT_CONFIG `_shared.py:25` · KebabToken `_shared.py:33` · RecipeId block `vocabulary.py:30-101` / `vocabulary.schema.ts:18-51` · collect-all `pack.py:183-294` · superRefine `style-spec.schema.ts:71-89` · ContentHashes `asset.py:99-111` / `asset-spec.schema.ts:59-62` · rejection case format `style-spec.json:1-21` · harness loaders `rejection_loader.py:28-33` / `rejection-cases.ts:27-32` · bridge chain `test_style_spec_bridge.py:41-89` / `style-spec.spec.ts:31-97` · structural scan `test_vocabulary.py:161-228` · hash policy `.gitattributes:18` · CI `verify.yml:44-106` · style.yaml verbatim `05_Style.md:35-49` · StyleRefinement sketch `05_Style.md:60-68` · catalogue schema+validators `05_Style.md:94-151`
