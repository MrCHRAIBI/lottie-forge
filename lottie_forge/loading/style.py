"""StyleSpec loader -- the Phase 2 reference fixture comes home (DM-04, \u00a75.2).

The committed fixture ``fixtures/style-specs/example-style/style.yaml`` is
the **single source of truth** of the pack's visual style (STY-01, \u00a75.2).
This loader is the only code that turns those bytes into a validated
``StyleSpec`` and reports the reproducible sha256 used for content-hash
manifests (``style_sha256`` in ``AssetSpec.content_hashes``, plan 02-03).

Hash regime (D-02, locked)
---------------------------

The hash is computed on **raw committed bytes** with line endings
normalised to LF first. The cross-platform contract is locked by
``.gitattributes`` (``* text=auto eol=lf``) so every checkout yields the
same bytes; ``normalize_lf`` is a belt-and-braces against edge cases
(a clone on a host with ``core.autocrlf`` misconfigured, a stray CRLF
inserted by a non-git editor). The resulting digest matches what
``sha256sum`` reports against the same file outside the factory -- the
doc (\u00a75.2.2) makes that hand-verifiability explicit.

Why this lives entirely in the loader (decision, D-16 option (b))
-----------------------------------------------------------------

The verbatim YAML carries a top-level ``style_id`` field that does **not**
belong to the contract -- the locked ``StyleSpec`` model in
``lottie_forge/domain/style.py`` declares no such field (no contract edit
across the bridge, per D-16: ``AssetSpec`` is the only 5th contract the
phase introduces). To keep that contract clean we validate ``style_id``
**in the loader only**:

1. read raw bytes, normalise LF, hash (sha256), log onto the manifest;
2. ``yaml.safe_load`` -- never ``yaml.load`` (T-02-01: arbitrary-object
   construction would be a tampering vector);
3. apply the gate on the parsed mapping: ``style_id`` must be present,
   must match the ``KebabToken`` envelope (CR-01, pydantic-core-anchored
   validation -- no hand-rolled validator), and must equal the directory
   name the file lives in (rejects a literal copy that has been moved
   under a different ``style_id`` without renaming the directory);
4. strip the ``style_id`` key from the mapping;
5. ``StyleSpec.model_validate`` the remaining mapping.

Every gate failure cites its cause in the exception message -- a fixture
rejection is debuggable from the traceback alone, not a hunt across the
loader code (T-02-04, deliberate).
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import yaml
from pydantic import TypeAdapter

from lottie_forge.domain._shared import KebabToken
from lottie_forge.domain.style import StyleSpec

# Repo-root resolution. The fixture lives at a *constant* absolute path
# under the repo root -- there is no env override, no user-input override
# (T-02-02). The loader is a fixture loader; nothing else can ask it to
# load a different file. Plan 02-04 (``lottie_forge/loading/catalogue.py``)
# follows the same pattern.
REPO_ROOT = Path(__file__).resolve().parents[2]
STYLE_FIXTURE_PATH: Path = (
    REPO_ROOT / "fixtures" / "style-specs" / "example-style" / "style.yaml"
)
"""The committed StyleSpec fixture (``\u00a75.2.2`` verbatim).

Override only in tests that need to point the loader at a fixture copy
under a different name (the ``style_id`` gate test does exactly this).
"""

__all__ = [
    "REPO_ROOT",
    "STYLE_FIXTURE_PATH",
    "load_style_spec",
    "normalize_lf",
    "sha256_hex",
]


def normalize_lf(raw: bytes) -> bytes:
    """Return ``raw`` with every CRLF replaced by a single LF.

    This is the LF normalisation step of the D-02 hash regime. It is
    deliberately idempotent (``b"\\n\\n"`` is unchanged by another call)
    and is applied to the **raw committed bytes** of the fixture before
    they are hashed or parsed -- so a stray carriage return (Windows
    checkout glitch, manual edit) cannot drift the hash.

    The function does not invent content: a file written with CRLF
    becomes the LF file you would have committed; a file already in LF
    is unchanged.
    """
    return raw.replace(b"\r\n", b"\n")


def sha256_hex(data: bytes) -> str:
    """SHA-256 digest of ``data`` as 64 lowercase hex chars.

    This is the **single** implementation of the D-02 / D-03 hash regime
    across the factory -- the recipe-catalogue loader (plan 02-04) reuses
    this function for ``catalogue_sha256``. The lowercase invariant is
    critical: ``[a-f0-9]{64}`` is the locked regex for every
    ``Sha256Hex`` field on ``AssetSpec.content_hashes`` (\u00a74.7); a
    uppercase digest would be rejected on the way in.
    """
    return hashlib.sha256(data).hexdigest()


def _enforce_style_id_gate(mapping: dict, fixture_path: Path) -> None:
    """Apply the loader-side ``style_id`` gate, then strip the key.

    Three failure modes -- each cites its cause in the error:

    - ``style_id`` **absent** from the mapping (fixture edited without
      adding a top-level identity field);
    - ``style_id`` value **not a KebabToken** (CR-01 lock: pydantic-core
      ``StringConstraints`` rejects this; we do not duplicate the regex);
    - ``style_id`` value **diverges from the directory name** (fixture
      was moved under a different name without renaming the directory).

    A passing gate leaves ``fixture_path.parent.name`` as the verified
    identity of the loaded style. The key is then stripped from the
    mapping so the rest can be validated against the contract-clean
    ``StyleSpec`` model.
    """
    if "style_id" not in mapping:
        raise ValueError(
            f"style fixture gate: 'style_id' key absent from "
            f"{fixture_path} (the fixture must declare its identity; "
            f"see \u00a75.2.2)"
        )
    value = mapping["style_id"]
    expected_dir_name = fixture_path.parent.name
# KebabToken is an ``Annotated[str, StringConstraints(pattern=..., max_length=64)]``;
    # calling ``TypeAdapter(KebabToken).validate_python(value)`` runs
    # pydantic-core's anchored regex (CR-01) and raises
    # ``pydantic.ValidationError`` on a bad value. We translate that into
    # a ValueError whose message names the rule that's failed.
    try:
        TypeAdapter(KebabToken).validate_python(value)
    except Exception as exc:  # noqa: BLE001 -- the gate owns the message; the underlying type only contributes "invalid"
        raise ValueError(
            f"style fixture gate: 'style_id' value {value!r} is not a "
            f"kebab-case token (KebabToken / §5.2.2: lowercase letter, "
            f"then lowercase/digit/-; max 64 chars; CR-01)"
        ) from exc
    if value != expected_dir_name:
        raise ValueError(
            f"style fixture gate: 'style_id' value {value!r} does not "
            f"match the fixture directory name {expected_dir_name!r} "
            f"(a fixture must declare its own directory as identity; "
            f"\u00a75.2.2)"
        )
    # Gate passed -- strip so StyleSpec.model_validate sees only its
    # declared fields. ``StyleSpec`` uses ``extra="forbid"`` so a stray
    # ``style_id`` key in the mapping would otherwise be rejected by the
    # model itself; the strip makes that gate explicit at the loader.
    del mapping["style_id"]


def load_style_spec(path: Path = STYLE_FIXTURE_PATH) -> tuple[StyleSpec, str]:
    """Load the StyleSpec fixture at ``path`` and return ``(spec, sha256_hex)``.

    The sha256 is computed on the **LF-normalised raw bytes** of the file
    (D-02). It is stable across two reads of the same committed fixture,
    and matches ``sha256sum`` against the same file outside the factory
    -- the doc (\u00a75.2.2) makes that hand-verifiability explicit.

    The ``style_id`` gate (see module docstring) runs before
    ``StyleSpec.model_validate``; on a passing gate the key is stripped
    so the strict model never sees a field it does not declare (no
    contract edit, per D-16).

    Parameters
    ----------
    path:
        Path to a YAML fixture. Defaults to the committed
        ``fixtures/style-specs/example-style/style.yaml``. Tests that
        need to point at a mutated copy under a different name pass the
        mutated path explicitly.
    """
    raw = path.read_bytes()
    normalised = normalize_lf(raw)
    sha = sha256_hex(normalised)

    # yaml.safe_load -- never yaml.load (T-02-01).
    # The committed fixture is a mapping; we assert that shape here so a
    # stray YAML list / scalar fails loud (and named) rather than
    # propagating into StyleSpec.model_validate as a TypeError.
    parsed = yaml.safe_load(normalised)
    if not isinstance(parsed, dict):
        raise ValueError(
            f"style fixture gate: {path} did not parse as a YAML mapping "
            f"(got {type(parsed).__name__}); \u00a75.2.2 requires a top-level mapping"
        )

    _enforce_style_id_gate(parsed, path)
    spec = StyleSpec.model_validate(parsed)
    return spec, sha
