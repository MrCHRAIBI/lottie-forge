---
phase: 02-style-verrouill-catalogue-de-recettes
reviewed: 2026-08-31T02:55:00Z
depth: standard
files_reviewed: 44
files_reviewed_list:
  - fixtures/bridge/style-refinement.schema-keys.json
  - fixtures/recipe-catalogue/catalogue.json
  - fixtures/recipe-catalogue/coverage-map.json
  - fixtures/rejection-cases/asset-spec.json
  - fixtures/rejection-cases/catalogue.json
  - fixtures/rejection-cases/pack-manifest.json
  - fixtures/rejection-cases/style-refinement.json
  - fixtures/style-specs/example-style/palette.json
  - fixtures/style-specs/example-style/style.yaml
  - lottie_forge/domain/asset.py
  - lottie_forge/domain/catalogue.py
  - lottie_forge/domain/style_refinement.py
  - lottie_forge/domain/vocabulary.py
  - lottie_forge/gates/__init__.py
  - lottie_forge/gates/stale_pins.py
  - lottie_forge/loading/__init__.py
  - lottie_forge/loading/catalogue.py
  - lottie_forge/loading/style.py
  - lottie_forge/prompts/__init__.py
  - lottie_forge/prompts/render.py
  - lottie_forge/prompts/templates/recipe_picker.system.md
  - pyproject.toml
  - src/rpc/contracts/asset-spec.schema.ts
  - src/rpc/contracts/asset-spec.spec.ts
  - src/rpc/contracts/catalogue.schema.ts
  - src/rpc/contracts/catalogue.spec.ts
  - src/rpc/contracts/pack-manifest.spec.ts
  - src/rpc/contracts/rejection-cases.ts
  - src/rpc/contracts/style-fixture.spec.ts
  - src/rpc/contracts/style-refinement.schema.ts
  - src/rpc/contracts/style-refinement.spec.ts
  - src/rpc/contracts/vocabulary.schema.ts
  - src/rpc/contracts/vocabulary.spec.ts
  - tests/bridge/fixtures.py
  - tests/bridge/rejection_loader.py
  - tests/bridge/test_catalogue_bridge.py
  - tests/bridge/test_pack_bridge.py
  - tests/bridge/test_style_fixture_bridge.py
  - tests/domain/test_asset.py
  - tests/domain/test_catalogue.py
  - tests/domain/test_pack.py
  - tests/domain/test_stale_pins.py
  - tests/domain/test_style_refinement.py
  - tests/domain/test_vocabulary.py
  - tests/prompts/test_prompt_fixture.py
findings:
  critical: 0
  warning: 3
  info: 7
  total: 10
status: findings_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-08-31T02:55:00Z
**Depth:** standard
**Files Reviewed:** 44
**Status:** findings_found

## Summary

Phase 2 delivers the style-lock / recipe-catalogue layer: strict Pydantic domain models (`AssetSpec` 4-hash extension, `CatalogRecipe`/`RecipeCatalogue`, `StyleRefinement`), the STY-03 stale-pin gate, the D-02/D-03 fixture loaders (style YAML + catalogue JSON + joint easing cross-reference), the prompt-rendering mechanism, the zod mirrors, and the shared pytest↔vitest rejection harness. The work is high quality: the Py↔TS mirror parity is genuinely tight (bounds, regexes, loc/path shapes, collect-all semantics and closed enums all verified against the Phase-1 counterparts `_shared.py`, `style.py`, `pack.py`, `style-spec.schema.ts`, `pack-manifest.schema.ts`), fixtures follow the one-mutation-per-case discipline, and the D-08 no-mirror rule for Python-only gate types holds (no `PinRecord`/`scan_stale_pins` symbols anywhere under `src/`).

Both suites were executed during review: **pytest 472 passed**, **vitest 150 passed**. The three warnings below are defects those suites do **not** cover — all three were confirmed by targeted runtime probes against the shipped code, not by inspection alone.

Key concerns, in order of severity:

1. `scan_stale_pins` accepts an **unvalidated** `current_version` and crashes (`IndexError`/`ValueError`) or silently misclassifies (4-segment input → `patch`/`sampled`) on malformed injected input — the exact injected-input trust boundary this gate was designed around (D-06).
2. `render_recipe_picker_prompt` uses sequential `str.replace`, so catalogue text containing `{{catalogue_hash}}` is **silently rewritten** — the "embarqué == hashé == committé" invariant the module exists to enforce is broken with no guard firing.
3. `ASSET_ID_GATE_PATTERN` is a re-derived literal in `gates/stale_pins.py`, contradicting that same file's own "imported verbatim (no re-derivation)" doctrine and creating a silent-drift risk against `AssetSpec`.

Fixture data (`catalogue.json` 10 recipes, `coverage-map.json` 16 states, 4 rejection-case files totalling 56 cases) was sampled structurally per review scope: format consistency, one-mutation discipline, `expect_paths` plausibility, and cross-checked loc shapes against both validators. No data defects found; the entrance-recipe indices asserted in `catalogue.spec.ts` ([2, 4, 6] = bounce/draw-on/scale-pop) match the committed catalogue.

## Critical Issues

_None found._ No security vulnerabilities, data-loss risks, or crashes on the production paths were demonstrated. (The `scan_stale_pins` crash in WR-01 is loud/fail-closed on current call sites, hence Warning-tier.)

## Warnings

### WR-01: `scan_stale_pins` does not validate the injected `current_version` — unhandled crashes and silent misclassification

**File:** `lottie_forge/gates/stale_pins.py:84-99` (`_classify_bump`), `:102-127` (`scan_stale_pins`)
**Severity:** WARNING
**Issue:** `PinRecord.style_ref` is regex-validated (3 numeric segments guaranteed), but `current_version: str` is injected with **no validation at all**. Confirmed by probe:

| `current_version` | behavior |
|---|---|
| `"1.0"` | `IndexError: list index out of range` (unhandled — `current_parts[2]`) |
| `"abc"`, `"1.0.x"` | `ValueError: invalid literal for int()` (unhandled) |
| `"1.0.0.0"` (vs pinned `"1.0.0"`) | **flagged but classified `patch`/`sampled`** — the narrowest re-validation scope — and the inline comment `# identical versions never reach this function` is false: they do reach it, when the strings differ but the first 3 components tie |

The module docstring positions this function as *the* reusable gate whose pin source is injected "by the caller (committed fixtures today, the manifest store in Phase 5+)" — i.e. the input surface is explicitly expected to widen. A malformed version from a future store-backed caller produces either an opaque crash inside a CI gate or, worse, a 4-segment diff scoped down to `sampled`.

**Fix:** validate once at function entry, reusing an existing pattern (no re-derivation, per WR-03's lesson):

```python
from lottie_forge.domain.style import STYLE_VERSION_PATTERN
from pydantic import TypeAdapter

_SEMVER = TypeAdapter(Annotated[str, StringConstraints(pattern=STYLE_VERSION_PATTERN)])

def scan_stale_pins(pins, current_version: str) -> list[StalePinFlag]:
    _SEMVER.validate_python(current_version)  # raises ValidationError with a precise message
    ...
```

and in `_classify_bump`, replace the fall-through comment with a defensive raise (or reject ≠3-segment inputs before splitting) so "equal on all 3 components but different strings" cannot masquerade as `patch`.

### WR-02: `render_recipe_picker_prompt` sequential `.replace()` lets catalogue text rewrite itself — silent break of the "embarqué == hashé == committé" invariant

**File:** `lottie_forge/prompts/render.py:114-127`
**Severity:** WARNING
**Issue:** Placeholders are substituted with two sequential `str.replace` calls. If `catalogue_json` contains the literal token `{{catalogue_hash}}`, the *second* replace substitutes the hash **inside the catalogue text**. Probe-confirmed with `catalogue_json = '{"note": "subst me: {{catalogue_hash}}"}'`:

- embedded text ≠ input text (`evil_catalogue in rendered` → `False`) — the verbatim guarantee is broken;
- the hash appears **twice** in the rendered prompt (breaks the "exactly once" cross-check contract locked by `test_rendered_prompt_embeds_full_catalogue_text_and_64hex_hash`);
- the residual-placeholder guard (`"{{" in rendered`) does **not** fire — zero braces remain, so the corruption is fully silent.

The committed catalogue cannot trigger this today (every field is kebab/Literal/bounded-numeric — no free-text field can carry braces), which keeps this at Warning. But `catalogue_json` is a public, arbitrary-string parameter of the one module whose stated purpose (§5.1 principe 2, module docstring "every byte the LLM ever sees in this slot is a byte that was committed") is byte-exactness of that very parameter. If Phase 6 ever feeds it anything less trusted than the committed fixture, this becomes a prompt-content injection vector (LLM-facing substitution into a system prompt).

**Fix:** single-pass substitution (order-independent, no re-scanning of inserted text):

```python
import re

def _substitute(match: re.Match[str]) -> str:
    return catalogue_json if match.group(1) == "catalogue_json" else catalogue_hash

rendered = re.sub(r"\{\{(catalogue_json|catalogue_hash)\}\}", _substitute, template)
```

or, minimally: raise `ValueError` up front when `"{{" in catalogue_json or "}}" in catalogue_json`, turning the silent corruption into a loud rejection.

### WR-03: `ASSET_ID_GATE_PATTERN` re-derived as a second literal instead of importing `ASSET_ID_PATTERN` — violates the module's own no-re-derivation doctrine

**File:** `lottie_forge/gates/stale_pins.py:42-43` (declaration), `:68` (use)
**Severity:** WARNING
**Issue:** `PinRecord.asset_id` validates against a locally re-declared `ASSET_ID_GATE_PATTERN = r"^a-\d{3}$"`, while the sibling field in the same model imports `STYLE_REF_PATTERN` from `lottie_forge.domain.asset` "verbatim (no re-derivation)" (docstring, line 62-64). The import is free — the module already imports from `domain.asset`. The project's locked doctrine (single-source constants; "a bound that exists on one side and not the other is drift"; WR-01 "no regex re-derivation") makes this an inconsistency by the codebase's own rules: if `ASSET_ID_PATTERN` is ever edited (e.g. the §4.7 note reserves `a-050`…`a-999` for later phases — a plausible future widening), the gate silently keeps the stale 3-digit copy and `PinRecord` diverges from `AssetSpec` with no test designed to catch it.

**Fix:**

```python
from lottie_forge.domain.asset import ASSET_ID_PATTERN, STYLE_REF_PATTERN

class PinRecord(BaseModel):
    model_config = STRICT_CONFIG
    asset_id: Annotated[str, Field(pattern=ASSET_ID_PATTERN)]
    style_ref: Annotated[str, Field(pattern=STYLE_REF_PATTERN, max_length=128)]
```

and delete `ASSET_ID_GATE_PATTERN` (it is not in `__all__`, so removal is contained).

## Info

### IN-01: `vocabulary.py` re-exports `get_args` in `__all__` — dead public API surface

**File:** `lottie_forge/domain/vocabulary.py:28,160`
**Severity:** INFO
**Issue:** `get_args` is imported from `typing`, never used inside the module, and then exported via `__all__`. No consumer imports it from this module (tests and `catalogue.py` all import it from `typing`). It is accidental API surface on a locked contract module.
**Fix:** remove `get_args` from the import line and from `__all__`.

### IN-02: `_enforce_style_id_gate` — comment misdocuments the raised exception type; `TypeAdapter` import is function-local

**File:** `lottie_forge/loading/style.py:135-146`
**Severity:** INFO
**Issue:** The comment states validation "raises ``TypeError`` (or similar) on a bad value"; the actual exception from `TypeAdapter(KebabToken).validate_python(...)` is `pydantic.ValidationError`. Harmless today only because `except Exception` is broad. The `from pydantic import TypeAdapter` inside the function body is also inconsistent with the module's top-level import style.
**Fix:** move the import to module level and correct the comment to name `pydantic.ValidationError`.

### IN-03: Test comment contradicts the implementation it documents (IN-08 triple-duplicate case)

**File:** `tests/domain/test_pack.py:413-415`
**Severity:** INFO
**Issue:** The comment claims "idx 1 (dup with 0) and idx 2 (dup with 0 and 1) both surface, **but idx 0 itself does not**." The implementation (`lottie_forge/domain/pack.py:241-261`) explicitly emits a `duplicate_asset_id_first` issue at `("assets", first_idx, "asset_id")` — for three identical ids, `("assets", 0, "asset_id")` **does** appear, exactly as the sibling test `test_duplicate_asset_id_is_rejected_in08` (line 395) asserts. The test passes only because it never asserts absence; the stale comment could mislead a future maintainer into "fixing" the collect-all validator to match the comment.
**Fix:** rewrite the comment: idx 0 surfaces via the first-occurrence issue; the test asserts the duplicate indices (1, 2) per the collect-all contract.

### IN-04: Synthetic template written into the package's `templates/` directory instead of `tmp_path`

**File:** `tests/prompts/test_prompt_fixture.py:167-183`
**Severity:** INFO
**Issue:** `test_residual_placeholder_guard` writes `_unsupported_template.md` next to the committed `recipe_picker.system.md` (inside `lottie_forge/prompts/templates/`). The `try/finally` unlink covers the happy path, but a hard kill leaves a stray `.md` inside the packaged template directory, and parallel runners (pytest-xdist) share the fixed path. Every other mutation-style test in the repo correctly isolates via `tmp_path` (cf. `tmp_style_copy` in `test_style_fixture_bridge.py`).
**Fix:** write the synthetic template to `tmp_path / "_unsupported_template.md"` (the fixture is already available in this test module's context).

### IN-05: `loadRejectionCases` performs no shape validation — a malformed fixture entry yields a vacuous green on the TS side

**File:** `src/rpc/contracts/rejection-cases.ts:53-66`
**Severity:** INFO
**Issue:** The loader trusts the JSON unconditionally (`entry.payload` may be `undefined`). A fixture entry missing `payload` produces `Schema.safeParse(undefined)` → rejection → **the "must be rejected" assertion passes vacuously**, while the Python loader (`rejection_loader.py:70` `entry["payload"]`) raises `KeyError` at load time. The one-source-zero-drift harness would silently diverge in exactly the scenario it exists to prevent.
**Fix:** fail loud in the loader when `entry.payload` is absent (and/or validate `case_id`/`model` presence), mirroring the Python side's strictness.

### IN-06: IN-08 duplicate-`asset_id` payload duplicated inline in the vitest spec despite existing in the shared fixture

**File:** `src/rpc/contracts/pack-manifest.spec.ts:208-261`
**Severity:** INFO
**Issue:** The dedicated `IN-08 collect-all` test hand-builds a 60-line payload that is byte-equivalent in intent to shared case `in08-doublons-asset-id` in `fixtures/rejection-cases/pack-manifest.json`, whose `expect_paths` already asserts **both** `["assets",0,"asset_id"]` and `["assets",1,"asset_id"]`. Two sources for the same probe is the maintenance-drift pattern the shared-fixture doctrine (D-06: "one source, zero drift") exists to eliminate.
**Fix:** drop the inline payload and rely on the shared case (or reduce the inline test to a minimal two-field probe with a comment explaining the redundancy).

### IN-07: `load_catalogue_prompt_fixture` reads the fixture twice — hash and embedded text can diverge

**File:** `lottie_forge/prompts/render.py:144-145`
**Severity:** INFO
**Issue:** The function calls `load_catalogue_fixture(CATALOGUE_FIXTURE_PATH)` (read #1, hashed inside) and then re-reads the bytes directly (read #2) for the text. A concurrent modification between the two reads yields text ≠ hashed bytes — precisely the invariant this loader documents. Single-process CI makes this theoretical today, but the fix is also the cleaner API.
**Fix:** have `load_catalogue_fixture` (or a small wrapper) return `(text, sha)` from a single read: `text = normalised.decode("utf-8")`.

## Verification Notes

Findings were verified empirically, not just by inspection:

- **pytest:** 472 passed (full suite, 0.9s). **vitest:** 150 passed (8 files).
- **WR-01 probe:** `scan_stale_pins([pin@1.0.0], "1.0")` → `IndexError`; `"abc"` → `ValueError`; `"1.0.0.0"` → flag classified `patch`/`sampled`.
- **WR-02 probe:** catalogue text containing `{{catalogue_hash}}` is rewritten (verbatim membership `False`, hash occurs twice, no guard exception).
- **Negative-result probes (drift hypotheses tested and refuted):** NaN vs `Field(ge=…, le=…)` — pydantic-core **rejects** NaN on `accent_weight` and `IntensityBound`, so no Py↔zod NaN drift exists; `$`-trailing-newline parity ("accent\n") is locked by shared case `sr03-kebab-newline` on both engines; loc/path shapes for tuple-element and literal-in-list rejections (`cat06` → `["recipes",0,"theme_anchors",0]`, `cat08` → `["recipes",0,"intensity_range",0]`) match on both sides.
- **Doctrine checks:** D-08 holds (no TS mirror of `PinRecord`/`StalePinFlag`/`scan_stale_pins` anywhere under `src/`); no debug artifacts (`print`/`console.log`/`TODO`/`FIXME`) in reviewed source; `pyproject.toml` keeps `pydantic==2.13.4` pinned and `verify.yml` untouched; `fixtures/bridge/` is correctly gitignored (generated artifacts, hard-fail-with-instructions consumers).
- **Fixture sampling:** asset-spec.json (21 cases), pack-manifest.json (10 cases), style-refinement.json (10 cases), catalogue.json (15 cases) — one-mutation discipline holds; `expect_paths` sampled against both validators' actual loc behavior; `catalogue.json` committed data matches `RECIPE_DATA` in `test_catalogue.py` field-for-field; `coverage-map.json` = 16 unique states across 3 verticals with ≥1 recipe each.

---

_Reviewed: 2026-08-31T02:55:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
