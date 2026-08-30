"""Bridge steps 1 + 3 for the style fixture + the loader-side gates (DM-04, \u00a75.2).

This suite exercises every contract boundary introduced with the
``fixtures/style-specs/example-style/`` directory:

- The **loader** (``lottie_forge/loading/style.py``) is the only code
  path that turns the committed YAML into a ``StyleSpec``; it computes
  the D-02 sha256 on the LF-normalised raw bytes, applies the
  ``style_id`` gate (KebabToken + directory-name match + strip) before
  ``StyleSpec.model_validate`` and returns ``(spec, sha)``.
- The **bridge** ordered chain traverses the fixture through the
  canonical pytest \u2192 vitest \u2192 pytest route: we export the StyleSpec as
  JSON, hand it to zod (``style-fixture.spec.ts``) for re-emission, then
  strict-Pydantic-re-validate the TS artefact.
- The **anti-drift** assertion (``fixture \u2261 make_style_spec()``) keeps
  the test-side builder aligned with the YAML canon verbatim \u2014 if
  anyone changes the YAML without updating the builder (or vice versa),
  the test goes red before the bridge ever runs.
- The **palette.json** sync check (D-04) byte-compares the committed
  palette.json against a re-derived one \u2014 a second source of truth is
  the canonical drift: ``the gate is the gate``.
- The **gate** rejection cases lock the three ``style_id`` failure
  modes (absent / wrong-format / diverges-from-directory); each error
  message cites its cause.

The re-import step is gated by ``skipif`` on the presence of the TS
artefact (``fixtures/bridge/style-fixture.from-ts.json``) \u2014 a guard
of order, not a way to silently skip. CI runs the chain in lockstep
so the artefact is always present and no test is skipped.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import pytest

from fixtures import make_style_spec
from lottie_forge.domain.style import StyleSpec
from lottie_forge.loading.style import (
    STYLE_FIXTURE_PATH,
    load_style_spec,
    normalize_lf,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
BRIDGE_DIR = REPO_ROOT / "fixtures" / "bridge"
PALETTE_FIXTURE = REPO_ROOT / "fixtures" / "style-specs" / "example-style" / "palette.json"
FROM_PYTHON = BRIDGE_DIR / "style-fixture.from-python.json"
FROM_TS = BRIDGE_DIR / "style-fixture.from-ts.json"


# ---------- (a) Loader contract -- YAML \u2192 StyleSpec + sha ----------


def test_loader_returns_documented_style_version() -> None:
    """The committed fixture is the Phase-2 canon verbatim \u2014 identity check."""
    spec, sha = load_style_spec()
    assert spec.style_version == "1.0.0"
    assert spec.viewBox.width == 400
    assert spec.viewBox.height == 300


def test_loader_sha_is_stable_64_char_lowercase_hex() -> None:
    """Two reads of the same fixture must yield the same sha; format invariants."""
    _, sha_first = load_style_spec()
    _, sha_second = load_style_spec()
    assert sha_first == sha_second
    assert len(sha_first) == 64
    assert sha_first == sha_first.lower()
    # Every char is in [0-9a-f].
    assert all(c in "0123456789abcdef" for c in sha_first)


def test_loader_sha_matches_manual_sha256sum() -> None:
    """Independently recompute the digest; assert equality with loader output.

    This is the ``sha256sum`` hand-verifiability lock (D-02 / \u00a75.2.2):
    a developer can run ``sha256sum style.yaml`` outside the factory
    (after LF normalisation, e.g. by stripping ``\\r``) and observe the
    exact same digest. The loader is not a black box.
    """
    raw_bytes = STYLE_FIXTURE_PATH.read_bytes()
    normalised = normalize_lf(raw_bytes)
    independent = hashlib.sha256(normalised).hexdigest()
    _, sha = load_style_spec()
    assert sha == independent


def test_loader_sha_does_not_use_post_serde_json_bytes() -> None:
    """The hash is of the YAML bytes, never a re-serialised JSON (D-02).

    Re-asserts the prohibition (\u00a7 "prohibitions") on hashing a JSON
    blob produced by ``StyleSpec.model_dump_json``: such a hash would
    drift with Pydantic's serialisation choices and break the factory's
    hand-verifiability against ``sha256sum``.
    """
    spec, sha = load_style_spec()
    # If the loader used the JSON serialisation, the hash would equal
    # sha256(model_dump_json().encode("utf-8")). Assert it does NOT.
    serialised_json_hash = hashlib.sha256(spec.model_dump_json().encode("utf-8")).hexdigest()
    assert sha != serialised_json_hash


# ---------- (b) Loader contract -- style_id gate rejections ----------


@pytest.fixture()
def tmp_style_copy(tmp_path: Path) -> Path:
    """Copy the committed YAML verbatim into ``tmp_path/style.yaml``.

    Each gate test mutates only its own copy \u2014 isolation between
    parametrised cases, no edits of the committed fixture, no shared
    state across tests. The copy is held under a directory named
    ``example-style`` so that **only** the gate-relevant mutation
    (mutate / drop / replace ``style_id``) controls the outcome; the
    directory-name vs value match is set up clean.
    """
    fixture_dir = tmp_path / "example-style"
    fixture_dir.mkdir()
    target = fixture_dir / "style.yaml"
    target.write_bytes(STYLE_FIXTURE_PATH.read_bytes())
    return target


def _mutate_style_id_in_copy(copy: Path, *, drop: bool = False, replace: str | None = None) -> Path:
    """Mutate the ``style_id`` line in ``copy`` and return a fresh copy.

    - ``drop=True`` removes the line entirely.
    - ``replace="<value>"`` rewrites the value (used for the
      ``wrong-style`` and ``Wrong_Style`` cases).
    """
    raw = copy.read_bytes().decode("utf-8")
    lines = raw.splitlines()
    mutated = [
        line for line in lines if not line.startswith("style_id:")
    ]
    if replace is not None:
        mutated.insert(0, f"style_id: {replace}")
    mutated_text = "\n".join(mutated) + "\n"
    out = copy.with_name("style-mutated.yaml")
    out.write_bytes(mutated_text.encode("utf-8"))
    return out


def test_gate_rejects_style_id_absent(tmp_style_copy: Path) -> None:
    """No ``style_id`` key \u2192 loader rejects, message names the cause."""
    mutated = _mutate_style_id_in_copy(tmp_style_copy, drop=True)
    with pytest.raises(ValueError, match="style_id.*absent"):
        load_style_spec(mutated)


def test_gate_rejects_style_id_diverging_from_directory(tmp_style_copy: Path) -> None:
    """``style_id: wrong-style`` under directory ``example-style`` \u2192 rejected."""
    mutated = _mutate_style_id_in_copy(tmp_style_copy, replace="wrong-style")
    with pytest.raises(ValueError, match="does not match the fixture directory"):
        load_style_spec(mutated)


def test_gate_rejects_style_id_non_kebab(tmp_style_copy: Path) -> None:
    """``style_id: Wrong_Style`` is not a KebabToken \u2192 rejected (CR-01 lock)."""
    mutated = _mutate_style_id_in_copy(tmp_style_copy, replace="Wrong_Style")
    with pytest.raises(ValueError, match="kebab-case token"):
        load_style_spec(mutated)


# ---------- (c) Anti-drift -- fixture \u2261 builder ----------


def test_loaded_fixture_is_deep_equal_to_builder() -> None:
    """The fixture is the canon; the builder is its Phase-2 aligned mirror.

    If they ever diverge the **fix** is to update ``make_style_spec``
    to match the YAML \u2014 never the reverse (the fixture is verbatim
    \u00a75.2.2). A regression here means someone edited one half without
    the other; the bridge chain immediately echoes the drift through
    every downstream artefact, so this gate must be tight.
    """
    loaded, _ = load_style_spec()
    builder = make_style_spec()
    assert loaded == builder
    assert loaded.model_dump_json() == builder.model_dump_json()


# ---------- (d) palette.json sync (D-04) ----------


def test_palette_json_is_in_sync_with_derived() -> None:
    """Recompute palette.json from the loaded fixture; assert byte-equality.

    The committed ``palette.json`` is a **derived** artefact \u2014 the YAML
    is the single source of truth (D-04). Drift between the YAML and
    the JSON file is by definition a regeneration bug; this test is the
    gate that turns the regeneration into a red CI (\"the gate is the
    gate\").
    """
    spec, _ = load_style_spec()
    derived = [
        {"name": token.name, "hex": token.hex} for token in spec.palette
    ]
    # Stable serialisation: indent=2, ensure_ascii=False, single trailing LF.
    expected = json.dumps(derived, indent=2, ensure_ascii=False) + "\n"
    actual_bytes = PALETTE_FIXTURE.read_bytes()
    assert actual_bytes.decode("utf-8") == expected, (
        "palette.json is out of sync with style.yaml. Regenerate via:\n"
        "  python -c \"from lottie_forge.loading.style import load_style_spec;"
        " import json; spec, _ = load_style_spec();"
        " open('palette.json', 'w', newline='').write("
        "json.dumps([{'name': t.name, 'hex': t.hex} for t in spec.palette],"
        " indent=2, ensure_ascii=False) + chr(10))\""
    )


# ---------- (e) Bridge ordered chain (pytest \u2192 vitest \u2192 pytest) ----------


def test_export_style_fixture() -> None:
    """Step 1: write the Python-side bridge artefact for the TypeScript half.

    Envelope shape: ``{"style_sha256": "...", "spec": {...}}``. The
    zod test (``style-fixture.spec.ts``) consumes the envelope, asserts
    ``style_sha256`` matches the loader's sha (and the SHA256_HEX
    regex), parses ``spec`` under ``StyleSpecSchema``, deep-equals it
    against a re-derivation, and re-emits the same envelope to
    ``style-fixture.from-ts.json``. Step 3 then strict-re-validates the
    TS artefact back under Pydantic.
    """
    BRIDGE_DIR.mkdir(parents=True, exist_ok=True)
    spec, sha = load_style_spec()
    envelope: dict[str, Any] = {
        "style_sha256": sha,
        "spec": json.loads(spec.model_dump_json()),
    }
    FROM_PYTHON.write_text(json.dumps(envelope), encoding="utf-8")

    assert FROM_PYTHON.exists()
    # The exported envelope must re-read under StyleSpec.model_validate
    # (spec round-trip) and the sha must match the loader's sha (no
    # drift between the bridge writer and the loader).
    reloaded_envelope = json.loads(FROM_PYTHON.read_text(encoding="utf-8"))
    assert reloaded_envelope["style_sha256"] == sha
    assert StyleSpec.model_validate(reloaded_envelope["spec"]) == spec


@pytest.mark.skipif(
    not FROM_TS.exists(),
    reason=(
        "TS bridge artefact missing -- run "
        "`npx vitest run style-fixture` between export and re-import"
    ),
)
def test_reimport_style_fixture() -> None:
    """Step 3: the TS-re-emitted artefact must re-validate under strict Pydantic.

    Reads ``fixtures/bridge/style-fixture.from-ts.json`` (the envelope
    re-emitted by ``style-fixture.spec.ts``), re-validates ``spec``
    under strict Pydantic, and asserts deep-equality with the loader's
    spec. The ``style_sha256`` round-trip through TS is the canonical
    hand-off surface for ``AssetSpec.content_hashes.style_sha256`` in
    plan 02-03 -- a sha that does not survive the bridge is a content-
    hash gate breach before the manifest even arrives.
    """
    spec, sha = load_style_spec()
    payload = json.loads(FROM_TS.read_text(encoding="utf-8"))

    # The TS side may re-serialise the envelope in any field order; we
    # compare semantically, not byte-for-byte.
    assert payload["style_sha256"] == sha
    assert StyleSpec.model_validate(payload["spec"]) == spec
