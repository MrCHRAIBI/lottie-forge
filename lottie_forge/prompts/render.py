r"""Recipe-picker system-prompt renderer + catalogue-fixture loader (D-13, MOT-04).

The Phase 6 RecipePicker agent will consume :func:`render_recipe_picker_prompt`
to fill its system prompt with the locked recipe catalogue. Phase 2 commits
the **mechanism** — pure function, no network, no agent — and proves it by
test:

- The template (``lottie_forge/prompts/templates/recipe_picker.system.md``)
  carries exactly the two contractual placeholders
  ``{{catalogue_json}}`` and ``{{catalogue_hash}}`` (§5.5.3 l.151).
- The rendered prompt embeds the catalogue **verbatim** — the raw committed
  bytes (LF-normalised, exactly the bytes that were hashed), never a
  re-serialised model-dump JSON (§5.1 principe 2 — pas de reformulation,
  pas de troncature).
- The sha256 logged onto the prompt is the **same** digest the
  ``CatalogueLoader`` computes on the same fixture, and the same digest
  ``AssetSpec.content_hashes.catalogue_sha256`` records at the manifest
  level. The loop prompt ↔ manifest is closed on a single value.

The template path is a module-level **constant** — no env override, no
user input, no caller-supplied path (T-02-02). The recipe-picker template
is a committed artefact; only the catalogue text + sha vary at runtime.

The whole module is network-free and intentionally small: every byte the
LLM ever sees in this slot is a byte that was committed to the repo
(§5.1 #2: catalogue = fixture de system prompt, embarqué en entier).
"""

from __future__ import annotations

from pathlib import Path

from lottie_forge.loading.catalogue import (
    CATALOGUE_FIXTURE_PATH,
    load_catalogue_fixture,
)
from lottie_forge.loading.style import normalize_lf

# Template path is a constant derived from this module's location — no
# env override, no caller-supplied path (T-02-02). The template lives at
# lottie_forge/prompts/templates/recipe_picker.system.md, sibling of the
# renderer. Storing it as a module constant means a caller cannot
# accidentally point the renderer at an uncommitted / attacker-supplied
# template.
RECIPE_PICKER_TEMPLATE_PATH: Path = (
    Path(__file__).resolve().parent / "templates" / "recipe_picker.system.md"
)
"""The committed system-prompt template for the RecipePicker (D-13).

The file is **versioned** — the renderer reads it at call time so a
template edit committed under a new sha is picked up by the next
render without code change. The placeholders
``{{catalogue_json}}`` / ``{{catalogue_hash}}`` are the only contractual
elements; the surrounding wording is at the agent's discretion
(``02-CONTEXT.md`` "the agent's Discretion").
"""

__all__ = [
    "RECIPE_PICKER_TEMPLATE_PATH",
    "load_catalogue_prompt_fixture",
    "render_recipe_picker_prompt",
]


def _read_template(template_path: Path = RECIPE_PICKER_TEMPLATE_PATH) -> str:
    """Read the committed template and return its UTF-8 text.

    Kept as a module-private helper so the public rendering function
    stays a one-liner. The template file is small and read once per call
    — file size is asserted by the test suite (no I/O-network, no
    template cache, no caller-supplied override).
    """
    return template_path.read_text(encoding="utf-8")


def render_recipe_picker_prompt(
    catalogue_json: str,
    catalogue_hash: str,
    *,
    template_path: Path = RECIPE_PICKER_TEMPLATE_PATH,
) -> str:
    """Return the rendered system prompt with the catalogue embedded verbatim.

    The function is **pure** (no I/O-network, no globals beyond the
    template-path constant): reads the template, substitutes the two
    placeholders, and raises ``ValueError`` if any placeholder token
    remains after substitution — a belt-and-braces guard so a partial
    catalogue never ships embedded in a prompt (T-02-10, low severity,
    mitigate by construction).

    Parameters
    ----------
    catalogue_json:
        The catalogue text to embed. **Must be the raw committed bytes,
        LF-normalised** — exactly the text :func:`load_catalogue_prompt_fixture`
        returns, exactly the text that produced ``catalogue_hash``. Re-
        serialising via ``model_dump_json`` would break the
        ``embarqué == hashé == committé`` invariant (§5.1 principe 2);
        callers wanting the fixture text use the loader.
    catalogue_hash:
        The 64-character lowercase hex digest of the LF-normalised
        catalogue bytes (D-03). Same regime as ``style_sha256`` — the
        ``Sha256Hex`` field on ``AssetSpec.content_hashes`` rejects any
        other form.
    template_path:
        Override only in tests. Defaults to the committed constant.

    Raises
    ------
    ValueError:
        If a placeholder token remains in the rendered prompt after
        substitution (malformed-template guard, T-02-10).
    """
    template = _read_template(template_path)
    rendered = template.replace("{{catalogue_json}}", catalogue_json).replace(
        "{{catalogue_hash}}", catalogue_hash
    )
    # Belt-and-braces: every place the catalogue replaced, the substring
    # is gone. A leftover ``{{...}}`` in the rendered prompt means the
    # template declared a placeholder we did not satisfy — fail loud so
    # it cannot silently ship as a literal token the LLM would echo back.
    if "{{" in rendered or "}}" in rendered:
        raise ValueError(
            "recipe_picker.system.md left an unsubstituted placeholder "
            f"after rendering; rendered prompt head: {rendered[:200]!r}"
        )
    return rendered


def load_catalogue_prompt_fixture() -> tuple[str, str]:
    """Return ``(catalogue_text, catalogue_sha256)`` for the committed fixture.

    The catalogue text is the **raw UTF-8 of the LF-normalised committed
    bytes**, exactly the bytes the loader hashed — i.e. ``embarqué ==
    hashé == committé`` (§5.1 principe 2). Never a re-serialised
    ``model_dump_json``: re-serialising would change the bytes (key order
    may differ, indent may shift) and break the hand-verifiability
    against ``sha256sum`` on the committed file.

    Returned ``catalogue_text`` is the same string ``render_recipe_picker_prompt``
    expects as its ``catalogue_json`` parameter; round-tripping the two
    is the natural way to compose the system prompt.
    """
    _, sha = load_catalogue_fixture(CATALOGUE_FIXTURE_PATH)
    catalogue_text = normalize_lf(CATALOGUE_FIXTURE_PATH.read_bytes()).decode("utf-8")
    return catalogue_text, sha
