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

import re
from pathlib import Path
from typing import Final

from lottie_forge.loading.catalogue import CATALOGUE_FIXTURE_PATH
from lottie_forge.loading.style import normalize_lf, sha256_hex

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

_PLACEHOLDER_RE: Final[re.Pattern[str]] = re.compile(
    r"\{\{(catalogue_json|catalogue_hash)\}\}"
)
"""The two contractual placeholders (§5.5.3 l.151), compiled once.

Substitution through this pattern is **single-pass** (WR-02): ``re.sub``
never re-scans inserted text, so catalogue bytes containing the literal
token ``{{catalogue_hash}}`` are embedded verbatim instead of being
silently rewritten (``embarqué == hashé == committé``, §5.1 principe 2).
"""

__all__ = [
    "RECIPE_PICKER_TEMPLATE_PATH",
    "load_catalogue_prompt_fixture",
    "load_catalogue_text_and_sha",
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
    placeholders in a **single pass** (WR-02 — inserted text is never
    re-scanned, so catalogue bytes carrying a literal placeholder token
    stay verbatim), and raises ``ValueError`` if the template declares
    any placeholder beyond the two contractual ones — a belt-and-braces
    guard so a partial catalogue never ships embedded in a prompt
    (T-02-10, low severity, mitigate by construction).

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
        If the template declares a placeholder other than
        ``{{catalogue_json}}`` / ``{{catalogue_hash}}``
        (malformed-template guard, T-02-10).
    """
    template = _read_template(template_path)

    # Malformed-template guard (fail-closed, T-02-10): the template may
    # declare ONLY the two contractual placeholders. Strip them from the
    # TEMPLATE — before any substitution — and any leftover brace is a
    # declared-but-unsatisfiable token: fail loud. The guard lives on the
    # template, not on the rendered output, so catalogue text that itself
    # carries braces is embedded verbatim (WR-02) without a false alarm.
    residual_template = _PLACEHOLDER_RE.sub("", template)
    if "{{" in residual_template or "}}" in residual_template:
        raise ValueError(
            "recipe_picker.system.md left an unsubstituted placeholder "
            f"(only {{{{catalogue_json}}}} / {{{{catalogue_hash}}}} are "
            f"supported); template head: {template[:200]!r}"
        )

    # Single-pass substitution (WR-02): one scan over the template, each
    # placeholder replaced by its value, inserted text NEVER re-scanned.
    # A catalogue containing the literal token {{catalogue_hash}} stays
    # byte-verbatim instead of being rewritten with the real digest —
    # sequential str.replace calls would corrupt it silently (the hash
    # appearing twice, verbatim membership broken) with zero guard fire.
    def _substitute(match: re.Match[str]) -> str:
        return catalogue_json if match.group(1) == "catalogue_json" else catalogue_hash

    return _PLACEHOLDER_RE.sub(_substitute, template)


def load_catalogue_text_and_sha(path: Path = CATALOGUE_FIXTURE_PATH) -> tuple[str, str]:
    """Return ``(catalogue_text, catalogue_sha256)`` from a single read.

    Reads the fixture bytes **once**, normalises line endings to LF,
    and derives both the decoded text and its SHA-256 digest from the
    same byte buffer. The invariant « embarqué == hashé == committé »
    (§5.1 principe 2) is enforced **by construction**: a concurrent
    write between two independent reads of the same path can no longer
    let the embedded text diverge from the hashed bytes (IN-07).

    Parameters
    ----------
    path:
        Path to the catalogue fixture. Defaults to the committed
        constant ``CATALOGUE_FIXTURE_PATH``. Overridable only in
        tests that need to point at a fixture copy.

    Returns
    -------
    tuple[str, str]:
        ``(catalogue_text, catalogue_sha256)`` — ``catalogue_text`` is
        the UTF-8 decoding of the LF-normalised bytes, ``catalogue_sha256``
        is the 64-character lowercase hex digest of the same bytes
        (matches ``AssetSpec.content_hashes.catalogue_sha256``).
    """
    normalised = normalize_lf(path.read_bytes())
    return normalised.decode("utf-8"), sha256_hex(normalised)


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

    Thin wrapper around :func:`load_catalogue_text_and_sha` -- the
    single-read invariant is enforced there (IN-07); this function is
    retained for its stable, recognisable name.
    """
    return load_catalogue_text_and_sha()
