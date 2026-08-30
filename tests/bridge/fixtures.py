"""Bridge fixture builders — single source of fixture truth (DM-05, §4.9).

These helpers build the canonical, fully-formed Python models that drive both
halves of the Python<->TypeScript bridge chain. The export test writes the
Python-side artifacts under ``fixtures/bridge/`` from these builders; the
TypeScript side reads and re-emits; the re-import test re-validates under
Pydantic strict. One source, zero drift.

Members
-------

- :func:`make_style_spec` -- the ``StyleSpec`` fixture for both the bridge
  suite (export + zod re-emit + re-import) and the domain negative suite.
- :func:`make_recipe` -- the ``MotionRecipe`` fixture for the recipe bridge
  chain (export + zod re-emit + re-import). Accepts an optional ``recipe_id``
  override (default ``"fade"``).
- :func:`make_asset` -- the ``AssetSpec`` fixture for the asset bridge
  chain (export + zod re-emit + re-import). The ``style_ref`` is pinned to
  the ``make_style_spec().style_version`` so the two fixtures stay
  consistent across the bridge.
- :func:`make_pack` -- the ``PackManifest`` fixture for the pack bridge
  chain. Composes two assets with distinct ``asset_id`` and the
  ``style_ref`` suffixed by the pack's ``style_version`` (mono-style
  by construction -- WR-01).

All float values are deliberately **fractional** (``2.5``, ``0.25``,
``0.5`` -- never integral ``2.0``) so Python and JavaScript format them
identically across the JSON hop (DM-05 precision probe resolution, §4.1 #6).
"""

from __future__ import annotations

from lottie_forge.domain.asset import AssetSpec, CompositionMeta, ContentHashes
from lottie_forge.domain.pack import LicenseInfo, PackManifest, PackTotals
from lottie_forge.domain.recipe import MotionParams, MotionRecipe
from lottie_forge.domain.style import (
    CornerRadii,
    EasingCurve,
    PaletteToken,
    Size,
    StrokeWidths,
    StyleSpec,
)
from lottie_forge.domain.vocabulary import RecipeId

__all__ = ["make_asset", "make_pack", "make_recipe", "make_style_spec"]


def make_style_spec() -> StyleSpec:
    """The single source of fixture truth for the StyleSpec bridge chain (DM-05).

    Phase 2 (plan 02-01) re-aligned this builder to the canonical values
    declared verbatim in ``docs/project/05_Style.md`` \u00a75.2.2 -- 400\u00d7300
    viewBox, bold stroke 4.0, radii 0.0/8.0/16.0, four palette tokens
    (ink/accent/surface/success) and two easing curves (standard /
    entrance with control points [0.2,0.0,0.2,1.0] / [0.0,0.0,0.2,1.0]).
    The committed YAML fixture is the canon verbatim -- this builder is
    the test-side mirror the bridge suite asserts deep-equality against.

    02-01 is the sole owner of this edit within Phase 2; plan 02-03
    (builders ``make_asset`` / ``_make_asset_for_pack``) consumes the
    aligned ``style_version`` for STY-03 re-validation consistency.
    """
    return StyleSpec(
        style_version="1.0.0",
        viewBox=Size(width=400, height=300),
        stroke_widths=StrokeWidths(thin=1.5, default=2.5, bold=4.0),
        corner_radii=CornerRadii(small=0.0, medium=8.0, large=16.0),
        palette=[
            PaletteToken(name="ink", hex="#1F2430"),
            PaletteToken(name="accent", hex="#FF6B4A"),
            PaletteToken(name="surface", hex="#F5F1EA"),
            PaletteToken(name="success", hex="#3E9B6E"),
        ],
        easing_curves=[
            EasingCurve(name="standard", control_points=[0.2, 0.0, 0.2, 1.0]),
            EasingCurve(name="entrance", control_points=[0.0, 0.0, 0.2, 1.0]),
        ],
    )


def make_recipe(recipe_id: RecipeId = "fade") -> MotionRecipe:
    """The single source of fixture truth for the MotionRecipe bridge chain.

    Defaults are stable so bridge tests can rely on them without restating:

    - ``family="transform"`` (kebab, well under the 64-char bound)
    - ``duration_ms=1200`` (mid-range)
    - ``easing="ease-in-out"`` (kebab)
    - ``amplitude=0.5`` (mid-range; fractional for Py/JS format parity)
    - ``direction="up"``
    - ``loops=1``
    - ``theme_anchors=["primary"]`` -- a single, well-formed anchor so the
      default payload exercises the list branch, not just ``default_factory=[]``.
    """
    return MotionRecipe(
        recipe_id=recipe_id,
        family="transform",
        duration_ms=1200,
        easing="ease-in-out",
        params=MotionParams(amplitude=0.5, direction="up", loops=1),
        theme_anchors=["primary"],
    )


# 64-character lowercase hex strings used as fixtures (distinct values so
# the two ContentHashes fields carry independent identity through the
# JSON hop).
_ASSET_HASH_SVG = "a" * 64
_ASSET_HASH_LOTTIE = "0123456789abcdef" * 4  # 64 chars, lowercase hex, distinct


def make_asset() -> AssetSpec:
    """The single source of fixture truth for the AssetSpec bridge chain.

    Defaults are stable so bridge tests can rely on them without restating:

    - ``asset_id="a-001"`` (mid-slot in the 50-slot envelope)
    - ``style_ref`` pinned to ``make_style_spec().style_version`` so the
      asset-style re-validation gate (Phase 2 STY-03) stays consistent
      across the bridge.
    - ``recipe_ref="fade"`` (the canonical recipe from the closed
      vocabulary).
    - ``composition_meta.shape_group_names`` = two kebab tokens of 8/11
      chars each (well inside the 3..32 envelope).
    - ``content_hashes`` = distinct 64-char lowercase hex per field.
    """
    return AssetSpec(
        asset_id="a-001",
        style_ref=f"example-style@{make_style_spec().style_version}",
        recipe_ref="fade",
        composition_meta=CompositionMeta(
            shape_group_names=["bg-shape", "accent-shape"]
        ),
        content_hashes=ContentHashes(
            svg_sha256=_ASSET_HASH_SVG,
            lottie_sha256=_ASSET_HASH_LOTTIE,
        ),
    )


def _make_asset_for_pack(asset_id: str, style_version: str) -> AssetSpec:
    """Internal helper for ``make_pack`` -- an asset with custom id + pinned style_ref.

    Distinct content_hashes from ``make_asset()`` so a 2-asset pack carries
    independent identity for the two assets through the JSON hop (each
    ``lottie_sha256`` is unique).
    """
    return AssetSpec(
        asset_id=asset_id,
        style_ref=f"example-style@{style_version}",
        recipe_ref="fade",
        composition_meta=CompositionMeta(shape_group_names=["bg-shape"]),
        content_hashes=ContentHashes(
            svg_sha256=_ASSET_HASH_SVG,
            lottie_sha256=_ASSET_HASH_LOTTIE,
        ),
    )


def make_pack() -> PackManifest:
    """The single source of fixture truth for the PackManifest bridge chain.

    Defaults are stable so bridge tests can rely on them without restating:

    - ``pack_id="pack-nature-2026-03-15"`` (nominal form, valid date).
    - ``style_version`` = ``make_style_spec().style_version`` (1.0.0).
    - ``assets`` = 2 AssetSpecs with distinct ``asset_id`` (``a-001``,
      ``a-002``); every ``style_ref`` is suffixed by the pack's
      ``style_version`` (mono-style by construction -- WR-01).
    - ``totals.asset_count`` = 2 (matches len(assets)).
    - ``totals.cost_eur`` = 0.5 (fractional for Py/JS format parity).
    - ``totals.first_pass_yield`` = 0.75 (mid-range, < 1).
    - ``license`` = perpetual-one-time + commercial_use=True +
      attribution_required=False (the structural anti-subscription gate).
    """
    style_version = make_style_spec().style_version
    assets = [
        _make_asset_for_pack("a-001", style_version),
        _make_asset_for_pack("a-002", style_version),
    ]
    return PackManifest(
        pack_id="pack-nature-2026-03-15",
        style_version=style_version,
        assets=assets,
        totals=PackTotals(
            asset_count=len(assets),
            cost_eur=0.5,
            first_pass_yield=0.75,
        ),
        license=LicenseInfo(
            license_id="pack-license-std",
            terms="perpetual-one-time",
            commercial_use=True,
            attribution_required=False,
        ),
    )
