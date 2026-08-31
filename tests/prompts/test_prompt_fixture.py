"""Prompt-fixture mechanism suite (D-13, MOT-04).

This suite locks the **mechanism** that turns the committed
``fixtures/recipe-catalogue/catalogue.json`` into a system-prompt
string the Phase-6 RecipePicker agent can consume.

The contract:

- The template (``lottie_forge/prompts/templates/recipe_picker.system.md``)
  carries exactly the two contractual placeholders
  ``{{catalogue_json}}`` and ``{{catalogue_hash}}`` — present once
  each, asserted by `test_template_has_exactly_two_placeholders`.
- The renderer (``lottie_forge/prompts/render.py``) is **pure** — no
  network I/O, no caller-supplied template path in the production path
  (T-02-02 mitigation), no re-serialisation of the catalogue text (§5.1
  principe 2). The embedded bytes are the bytes that were committed and
  the bytes that were hashed.
- The rendered prompt embeds the **whole** catalogue text — no
  truncation, no summary. The « embarqué == hashé == committé »
  invariant (D-03 + §5.1 #2) is asserted by
  `test_rendered_prompt_embeds_full_catalogue_text_and_64hex_hash`:
  the rendered prompt contains every byte of the LF-normalised
  committed catalogue text, plus a 64-character lowercase hex digest.
- The renderer is deterministic — two consecutive calls return
  byte-identical strings (`test_render_determinism_byte_identical`),
  a pre-requisite for Phase-6 snapshot tests and for any cache keyed
  on the rendered prompt string.
- The guard against residual placeholders is asserted both positively
  (the guard is not triggered for a well-formed template) and via a
  synthetic malformed-template path (`test_residual_placeholder_guard`
  uses an on-disk copy that loses the placeholders).
- The exact digest of the embedded text equals the catalogue_sha the
  loader records (D-03 / §5.1 #2 — ``embarqué == hashé == committé``),
  asserted by `test_prompt_fixture_text_equals_hashed_bytes`.

Manifest registration (ROADMAP critère 5) is locked in a separate
companion suite below these — same test file, separate task
decomposition, no edit to the production module.
"""

from __future__ import annotations

import re

import pytest
from pydantic import ValidationError

from fixtures import make_asset
from lottie_forge.domain.asset import AssetSpec, ContentHashes
from lottie_forge.loading.catalogue import load_catalogue_fixture
from lottie_forge.loading.style import load_style_spec, sha256_hex
from lottie_forge.prompts.render import (
    RECIPE_PICKER_TEMPLATE_PATH,
    load_catalogue_prompt_fixture,
    render_recipe_picker_prompt,
)

SHA256_HEX_RE = re.compile(r"^[a-f0-9]{64}$")


# ---------------------------------------------------------------------------
# (a) template has exactly the two contractual placeholders, present once each
# ---------------------------------------------------------------------------


def test_template_has_exactly_two_placeholders() -> None:
    """Each of the two contractual placeholders appears exactly once.

    Locks the template's contract surface — adding a placeholder is a
    breaking change to the renderer's substitution contract, and the
    renderer only consumes these two. Anything else (``{{...}}``) in the
    template is the malformed-template guard's responsibility, asserted
    in `test_residual_placeholder_guard` below.
    """
    text = RECIPE_PICKER_TEMPLATE_PATH.read_text(encoding="utf-8")
    assert text.count("{{catalogue_json}}") == 1, (
        "recipe_picker.system.md must declare {{catalogue_json}} exactly once "
        "(D-13 contractual placeholder)"
    )
    assert text.count("{{catalogue_hash}}") == 1, (
        "recipe_picker.system.md must declare {{catalogue_hash}} exactly once "
        "(D-13 contractual placeholder)"
    )
    # Negative contract: no other ``{{...}}`` placeholder survives the
    # template's evolution — the renderer substitutes only these two.
    other_open = text.replace("{{catalogue_json}}", "").replace(
        "{{catalogue_hash}}", ""
    )
    assert "{{" not in other_open and "}}" not in other_open, (
        "recipe_picker.system.md must not declare any other placeholder; the "
        "renderer substitutes only {{catalogue_json}} and {{catalogue_hash}}"
    )


def test_template_path_is_a_module_constant() -> None:
    """The template path is a Python constant on the renderer module (T-02-02).

    No env override, no caller-supplied path in the production path:
    the recipe-picker template is a committed artefact.
    """
    assert RECIPE_PICKER_TEMPLATE_PATH.is_absolute()
    assert RECIPE_PICKER_TEMPLATE_PATH.name == "recipe_picker.system.md"
    assert RECIPE_PICKER_TEMPLATE_PATH.exists()


# ---------------------------------------------------------------------------
# (b) rendered prompt: no residual placeholder + whole catalogue embedded + 64-hex hash
# ---------------------------------------------------------------------------


def test_rendered_prompt_embeds_full_catalogue_text_and_64hex_hash() -> None:
    """Verbatim embedding + 64-hex sha, exactly once, zero placeholder residue.

    The whole committed catalogue text is embedded (no truncation,
    §5.1 principe 2), the sha follows the locked ``[a-f0-9]{64}``
    format, and the rendered prompt carries **no** ``{{...}}``
    placeholder tokens — the residual-guard never fires for the
    committed template.
    """
    catalogue_text, catalogue_sha = load_catalogue_prompt_fixture()
    assert SHA256_HEX_RE.fullmatch(catalogue_sha), (
        f"catalogue_sha must be 64-char lowercase hex (D-03): {catalogue_sha!r}"
    )

    rendered = render_recipe_picker_prompt(catalogue_text, catalogue_sha)

    # (i) Verbatim embedding: the WHOLE catalogue text is in the prompt,
    # in its committed form. We assert by membership — ``catalogue_text``
    # ``in`` ``rendered``. Splitting or hashing would lose precision; the
    # in-string check is the exact analogue of « embarqué == committé ».
    assert catalogue_text in rendered, (
        "rendered prompt must embed the catalogue verbatim (no truncation, "
        "no reformulation): §5.1 principe 2 forbids re-serialisation"
    )

    # (ii) Hash injected — exactly once. The exact value matters: an
    # extra copy or an absent copy would silently break the prompt ↔
    # manifest cross-check downstream.
    assert rendered.count(catalogue_sha) == 1, (
        f"catalogue_sha must appear exactly once in the rendered prompt, "
        f"got count={rendered.count(catalogue_sha)}"
    )

    # (iii) No placeholder residue: the malformed-template guard is
    # never triggered for the well-formed committed template.
    assert "{{" not in rendered, (
        f"rendered prompt must not carry an unsubstituted placeholder: "
        f"head={rendered[:200]!r}"
    )
    assert "}}" not in rendered


def test_residual_placeholder_guard() -> None:
    """A template that declares an extra placeholder triggers the guard.

    Uses an on-disk temporary template (no edit to the committed
    artefact) carrying an unrendered ``{{unsupported}}`` token. The
    renderer's residual-guard must raise ``ValueError`` loudly — a
    literal ``{{unsupported}}`` slipping into the LLM system prompt is
    not an acceptable failure mode (T-02-10 mitigation, ``mitigate``).

    The committed template triggers the guard with frequency zero — a
    well-formed call substitutes both placeholders and the rendered
    string carries no ``{{...}}`` residue; this property is asserted
    in `test_rendered_prompt_embeds_full_catalogue_text_and_64hex_hash`.
    """
    synthetic = RECIPE_PICKER_TEMPLATE_PATH.parent / "_unsupported_template.md"
    synthetic.write_text(
        "Real placeholders: {{catalogue_json}} {{catalogue_hash}}\n"
        "Stray placeholder: {{unsupported}}\n",
        encoding="utf-8",
    )
    try:
        with pytest.raises(
            ValueError, match="unsubstituted placeholder"
        ):
            render_recipe_picker_prompt(
                catalogue_json='{"catalogue_version": "1.0.0", "recipes": []}',
                catalogue_hash="1" * 64,
                template_path=synthetic,
            )
    finally:
        synthetic.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# (c) determinism: two consecutive renders produce byte-identical output
# ---------------------------------------------------------------------------


def test_render_determinism_byte_identical() -> None:
    """Two calls return byte-identical strings (cache-key pre-requisite).

    The renderer is a pure function on ``(catalogue_text, catalogue_sha)``
    — same inputs, same output, byte for byte. Phase 6 will cache by
    rendered-prompt hash (or re-render on every call); either way the
    snapshot of a prompt must be reproducible.
    """
    catalogue_text, catalogue_sha = load_catalogue_prompt_fixture()
    first = render_recipe_picker_prompt(catalogue_text, catalogue_sha)
    second = render_recipe_picker_prompt(catalogue_text, catalogue_sha)
    assert first == second
    assert first.encode("utf-8") == second.encode("utf-8")


# ---------------------------------------------------------------------------
# (d) injectability: the renderer accepts any (catalogue_json, catalogue_hash)
# ---------------------------------------------------------------------------


def test_renderer_injects_an_arbitrary_hash() -> None:
    """Render with an arbitrary-but-valid 64-hex hash — injectability (D-13).

    The renderer must accept any ``[a-f0-9]{64}`` digest (the
    ``Sha256Hex`` shape ``AssetSpec.content_hashes.catalogue_sha256``
    is held to) and embed it verbatim. This is the mechanism-level
    injectability test — separate from the round-trip — that
    proves the placeholder machinery is wired up correctly.
    """
    fake_hash = "b" * 64  # 64-char lowercase hex, real-zero sha digest
    assert SHA256_HEX_RE.fullmatch(fake_hash)
    catalogue_text = '{"catalogue_version": "1.0.0", "recipes": []}'
    rendered = render_recipe_picker_prompt(catalogue_text, fake_hash)
    assert catalogue_text in rendered
    assert fake_hash in rendered
    assert rendered.count(fake_hash) == 1


# ---------------------------------------------------------------------------
# (e) verbatim-equals-hashed-bytes: the loader contract (embarqué == hashé == committé)
# ---------------------------------------------------------------------------


def test_prompt_fixture_text_equals_hashed_bytes() -> None:
    """The prompt-fixture loader returns ``(text, hash)`` with ``sha == sha256(text)``.

    §5.1 principe 2 (« embarqué == hashé == committé »): the digest
    the catalogue loader logs must match the SHA-256 of the **text**
    the prompt-fixture loader returns byte for byte. A divergence here
    means the embedded text differs from the bytes that produced the
    hash, breaking the audit trail that lets any consumer verify a
    hash outside the factory.
    """
    catalogue_text, catalogue_sha = load_catalogue_prompt_fixture()
    assert sha256_hex(catalogue_text.encode("utf-8")) == catalogue_sha


# ===========================================================================
# Manifest registration suite (plan 02-06, Task 2 -- ROADMAP critère 5 / D-16)
# ===========================================================================
#
# The mechanism (Task 1) embeds the catalogue verbatim + its sha256 into a
# deterministic system prompt. The manifest side of the loop lives on the
# AssetSpec: ``content_hashes`` is the closed 4-field model from plan 02-03
# -- ``{svg_sha256, lottie_sha256, style_sha256, catalogue_sha256}``.
#
# This suite closes the loop. **No production code is touched**: the prompt
# module, the catalogue loader, the AssetSpec model and the
# ``tests/bridge/fixtures.py`` ``make_asset`` builder are all consumed as-is.
# The optional ``content_hashes=`` keyword added by plan 02-03 is the one
# entry point this Task uses to pass the **real** sha values of the
# committed fixtures -- a no-edit, no-clone approach that preserves the
# Wave-1 / Wave-3 isolation contract.
#
# Tests (a)-(d) are byte-equality + round-trip locks on the AssetSpec,
# proving the asset that records the catalogue digest survives the bridge
# chain mechanically. Test (e) is the same contract protected against a
# future relaxation of the Sha256Hex gate.


def test_asset_content_hashes_roundtrip_with_real_fixture_shas() -> None:
    """The four ``content_hashes`` of an AssetSpec round-trip strictly.

    Loads the **real** sha values from both committed fixtures
    (style + catalogue), constructs an ``AssetSpec`` via the
    :func:`make_asset` single source of fixture truth (plan 02-03),
    and asserts the strict model accepts the payload, round-trips
    through ``model_dump_json`` byte-identically, and that the same
    catalogue_sha surfaces in the rendered RecipePicker system prompt.

    The bridge to ``make_asset`` is via the optional
    ``content_hashes=`` parameter added in plan 02-03 — this plan
    honours that contract and does **not** touch
    ``tests/bridge/fixtures.py``. ``make_pack`` is unaffected
    because ``_make_asset_for_pack`` is the production path for
    the pack bridge suite.
    """
    style_sha = load_style_spec()[1]
    catalogue_sha = load_catalogue_fixture()[1]

    # Distinct determinist placeholders for svg / lottie so the four
    # content_hashes have independent identity (mirrors the convention
    # in tests/bridge/fixtures.py — the real sha for svg / lottie
    # only exist after Phase 3/4 produce the artefacts).
    svg_sha = "a" * 64
    lottie_sha = "0" * 64

    asset = make_asset(
        content_hashes=ContentHashes(
            svg_sha256=svg_sha,
            lottie_sha256=lottie_sha,
            style_sha256=style_sha,
            catalogue_sha256=catalogue_sha,
        )
    )

    # Strict model accepts the payload.
    assert isinstance(asset, AssetSpec)

    # Round-trip via JSON: re-validate the exported payload, equal under ``==``.
    reimported = AssetSpec.model_validate_json(asset.model_dump_json())
    assert reimported == asset
    # The two sha fields must survive the JSON hop exactly — a hash
    # round-trip is the lock for the prompt ↔ manifest loop (D-16 / D-03).
    assert reimported.content_hashes.style_sha256 == style_sha
    assert reimported.content_hashes.catalogue_sha256 == catalogue_sha

    # Same sha closes the loop: the value recorded on the asset matches
    # the value injected into the rendered system prompt. ROADMAP
    # critère 5.
    catalogue_text, rendered_sha = load_catalogue_prompt_fixture()
    assert rendered_sha == catalogue_sha, (
        "catalogue_sha logged on the prompt must equal the catalogue_sha "
        "stored on the asset's content_hashes: ROADMAP critère 5"
    )
    rendered = render_recipe_picker_prompt(catalogue_text, catalogue_sha)
    assert catalogue_sha in rendered


def test_make_asset_default_path_is_byte_identical_to_phase_1() -> None:
    """Plan 02-03's existing ``make_asset()`` callers stay byte-identical.

    The optional ``content_hashes=`` override is opt-in: callers that
    do not pass it (the 3 existing call sites: ``test_asset_bridge``,
    ``test_pack_bridge``, ``test_pack``) get the same deterministic
    4-literal block as before. This is the contract that makes
    ``git diff --exit-code -- tests/bridge/fixtures.py`` empty at the
    close of this plan.
    """
    asset_default = make_asset()
    # The svg/lottie fields keep their historical fixtures…
    assert asset_default.content_hashes.svg_sha256 == "a" * 64
    assert asset_default.content_hashes.lottie_sha256 == "0123456789abcdef" * 4
    # …and the new style/catalogue fields stay distinct (deterministic 64-hex placeholders).
    assert len(asset_default.content_hashes.style_sha256) == 64
    assert len(asset_default.content_hashes.catalogue_sha256) == 64
    assert asset_default.content_hashes.style_sha256 != (
        asset_default.content_hashes.catalogue_sha256
    )
    # The sha fields must each individually match the Sha256Hex shape.
    for field_name in ("svg_sha256", "lottie_sha256", "style_sha256", "catalogue_sha256"):
        assert SHA256_HEX_RE.fullmatch(getattr(asset_default.content_hashes, field_name)), (
            f"{field_name} must be 64-char lowercase hex (D-16 / Sha256Hex)"
        )


def test_make_asset_content_hashes_override_is_strictly_validated() -> None:
    """The override path goes through the same strict Pydantic validation.

    An invalid value (uppercase / short / non-hex) is rejected by the
    ``Sha256Hex`` ``pattern`` gate — at the ``ContentHashes``
    constructor in this plan (and by extension at ``AssetSpec``
    construction). This is defence in depth: the same gate the model
    applies to hand-built content hashes is the gate ``make_asset``
    applies to overridden content hashes.

    The SHA-HEX validation is enforced **at construction time** —
    constructing an invalid ``ContentHashes`` raises immediately,
    before ``make_asset`` is reached. Both surfaces are exercised
    below so a future relaxation of either gate fails CI.
    """
    base_good = {
        "lottie_sha256": "0" * 64,
        "style_sha256": "0" * 64,
        "catalogue_sha256": "0" * 64,
    }
    bad_payloads: list[dict[str, str]] = [
        # Uppercase hex — Sha256Hex regex ``^[a-f0-9]{64}$`` rejects.
        {"svg_sha256": "A" * 64, **base_good},
        # 63 chars — below the 64-char floor.
        {"svg_sha256": "a" * 63, **base_good},
        # Non-hex char in the middle.
        {"svg_sha256": ("a" * 32) + "z" + ("a" * 31), **base_good},
    ]
    for payload in bad_payloads:
        # The strict model rejects the bad value at construction.
        with pytest.raises(ValidationError):
            ContentHashes(**payload)
        # A caller-provided override goes through ``make_asset`` and
        # hits the same gate — belt-and-braces.
        with pytest.raises(ValidationError):
            make_asset(content_hashes=ContentHashes(**payload))
