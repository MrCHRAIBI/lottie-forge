"""Recipe-catalogue loader + the D-17 joint easing cross-reference (§5.5.3 #3).

The committed ``fixtures/recipe-catalogue/catalogue.json`` is product data
(D-01 × §5.5.2 verbatim): this loader is the Python read path that turns its
bytes into a validated :class:`~lottie_forge.domain.catalogue.RecipeCatalogue`
and reports the reproducible ``catalogue_sha256`` (D-03 -- same single hash
implementation as the D-02 style regime, reused from
:mod:`lottie_forge.loading.style`).

**The easing cross-reference lives HERE, not on the model (D-17).**
§5.5.3 validator 3 is a cross-reference between two fixtures -- a recipe's
``easing`` must name a curve declared in the loaded ``StyleSpec``. That is
joint-loading state, not per-object state, so:

- :func:`validate_easing_cross` is a **pure** collect-all function (no I/O)
  taking the catalogue and the set of valid easing names -- reusable by
  tests with arbitrary pairs; one ``InitErrorDetails`` per offending recipe,
  type ``unknown_easing``, loc ``("recipes", idx, "easing")``.
- :func:`load_catalogue_with_style` loads both committed fixtures and
  applies the cross-check with the style's real curve names -- a catalogue
  easing outside the StyleSpec fails the load, hard.

The TS mirror of the joint check is ``JointCatalogueStyleSchema``
(``src/rpc/contracts/catalogue.schema.ts``) -- same paths under the
``catalogue`` prefix (MOT-04 "easing inconnu" rejection parity, D-17).
"""

from __future__ import annotations

from collections.abc import Set as AbstractSet
from pathlib import Path

from pydantic_core import InitErrorDetails, PydanticCustomError, ValidationError

from lottie_forge.domain.catalogue import RecipeCatalogue
from lottie_forge.domain.style import StyleSpec
from lottie_forge.loading.style import (
    load_style_spec,
    normalize_lf,
    sha256_hex,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
CATALOGUE_FIXTURE_PATH: Path = REPO_ROOT / "fixtures" / "recipe-catalogue" / "catalogue.json"
"""The committed catalogue product data (D-01 × §5.5.2 verbatim)."""

COVERAGE_MAP_PATH: Path = REPO_ROOT / "fixtures" / "recipe-catalogue" / "coverage-map.json"
"""The committed D-15 coverage map (blocking audit consumes it in plan 02-05)."""

__all__ = [
    "CATALOGUE_FIXTURE_PATH",
    "COVERAGE_MAP_PATH",
    "load_catalogue_fixture",
    "load_catalogue_with_style",
    "validate_easing_cross",
]


def load_catalogue_fixture(path: Path = CATALOGUE_FIXTURE_PATH) -> tuple[RecipeCatalogue, str]:
    """Load the catalogue fixture at ``path`` and return ``(catalogue, sha256_hex)``.

    The sha256 is computed on the **LF-normalised raw bytes** (D-03 -- the
    same regime as the style hash; verifiable with ``sha256sum`` against the
    committed file outside the factory).
    """
    normalised = normalize_lf(path.read_bytes())
    sha = sha256_hex(normalised)
    catalogue = RecipeCatalogue.model_validate_json(normalised)
    return catalogue, sha


def validate_easing_cross(
    catalogue: RecipeCatalogue, easing_names: AbstractSet[str]
) -> None:
    """Reject any recipe whose ``easing`` is outside ``easing_names`` (pure).

    Collect-all: every offending recipe produces exactly one
    ``InitErrorDetails`` (type ``unknown_easing``) at the precise loc
    ``("recipes", idx, "easing")``; all violations raise together via
    ``ValidationError.from_exception_data`` -- the path-parity counterpart
    of the ``JointCatalogueStyleSchema`` ``superRefine`` on the TS side
    (D-17 / MOT-04 "easing inconnu").

    No I/O, no fixture access -- the caller supplies the valid-name set, so
    tests can exercise arbitrary (catalogue, names) pairs.
    """
    details: list[InitErrorDetails] = []
    for idx, recipe in enumerate(catalogue.recipes):
        if recipe.easing not in easing_names:
            details.append(
                InitErrorDetails(
                    type=PydanticCustomError(
                        "unknown_easing",
                        "easing {easing!r} for recipe {id!r} is not declared "
                        "in the loaded StyleSpec.easing_curves",
                        {"easing": recipe.easing, "id": recipe.id},
                    ),
                    loc=("recipes", idx, "easing"),
                    input=recipe.easing,
                )
            )
    if details:
        raise ValidationError.from_exception_data(
            RecipeCatalogue.__name__,
            details,
        )


def load_catalogue_with_style() -> tuple[RecipeCatalogue, StyleSpec, str, str]:
    """Load both committed fixtures jointly and cross-check the easings.

    Returns ``(catalogue, style, style_sha256, catalogue_sha256)``. A
    catalogue easing that no ``StyleSpec.easing_curves`` entry declares
    fails the load with the collect-all ``unknown_easing`` error -- the
    committed pair (10 recipes over ``standard`` / ``entrance``) passes.
    """
    style, style_sha = load_style_spec()
    catalogue, catalogue_sha = load_catalogue_fixture()
    validate_easing_cross(catalogue, {curve.name for curve in style.easing_curves})
    return catalogue, style, style_sha, catalogue_sha
