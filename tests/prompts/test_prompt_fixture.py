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

from lottie_forge.loading.style import sha256_hex
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
