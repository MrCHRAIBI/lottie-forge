"""StyleSpec domain suite — positive (boundaries) and rejection (mirrored with TS).

Two halves:

(a) **Positive boundary** — the reference fixture, every field at the
    accepted bound exactly (``width=16`` and ``2048``, floats at the
    inclusive lower and upper limits, lists at ``min_length`` and
    ``max_length``). Resolution of the DM-05 boundary probe.

(b) **Rejection suite** — driven by :func:`tests.bridge.rejection_loader
    .load_rejection_cases` so the same cases run identically on the TypeScript
    side (``src/rpc/contracts/style-spec.spec.ts``). For every case we
    assert:

    1. ``StyleSpec.model_validate(payload)`` raises ``ValidationError``.
    2. When ``expect_paths`` is present, each expected path is **a member**
       of the Pydantic ``errors()`` loc-tuples -- never a message-text
       comparison (D-08).

CR-01 (``"accent\\n"`` in a palette name) is locked in by the shared fixture
``fixtures/rejection-cases/style-spec.json`` (case_id ``cr01-accent-newline``)
and validated here.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from fixtures import make_style_spec
from lottie_forge.domain.style import (
    CornerRadii,
    EasingCurve,
    PaletteToken,
    Size,
    StrokeWidths,
    StyleSpec,
)
from tests.bridge.rejection_loader import load_rejection_cases


def _loc_as_tuple(error: dict) -> tuple:
    """Pydantic v2 ``errors()`` returns loc as a tuple of str/int entries."""
    return tuple(error["loc"])


def _payload_accepted(**overrides: object) -> StyleSpec:
    """Build a reference fixture with overridable fields for boundary probes."""
    base = make_style_spec().model_dump()
    base.update(overrides)  # type: ignore[arg-type]
    return StyleSpec.model_validate(base)


# ---------- (a) Positive boundary ----------


def test_reference_fixture_is_accepted() -> None:
    spec = make_style_spec()
    assert spec.style_version == "1.0.0"


@pytest.mark.parametrize(
    "width,height",
    [(16, 16), (2048, 2048), (16, 2048), (2048, 16)],
)
def test_viewbox_dimension_bounds_accepted(width: int, height: int) -> None:
    spec = _payload_accepted(viewBox=Size(width=width, height=height))
    assert spec.viewBox.width == width
    assert spec.viewBox.height == height


@pytest.mark.parametrize(
    "thin,default,bold",
    [
        (0.25, 0.5, 16.0),
        (1.5, 8.25, 15.75),
        (0.25, 8.0, 16.0),  # thin at lower bound, bold at upper bound
    ],
)
def test_stroke_width_bounds_accepted(thin: float, default: float, bold: float) -> None:
    spec = _payload_accepted(stroke_widths=StrokeWidths(thin=thin, default=default, bold=bold))
    assert spec.stroke_widths.thin == thin


@pytest.mark.parametrize(
    "small,medium,large",
    [
        (0.0, 24.0, 48.0),
        (4.5, 4.5, 4.5),  # inclusive equality
        (12.0, 12.0, 48.0),
    ],
)
def test_corner_radius_bounds_accepted(small: float, medium: float, large: float) -> None:
    spec = _payload_accepted(corner_radii=CornerRadii(small=small, medium=medium, large=large))
    assert spec.corner_radii.small == small


@pytest.mark.parametrize("count", [2, 8, 16])
def test_palette_length_bounds_accepted(count: int) -> None:
    palette = [
        PaletteToken(name=f"c{i:02d}", hex=f"#{i:06X}") for i in range(count)
    ]
    spec = _payload_accepted(palette=palette)
    assert len(spec.palette) == count


@pytest.mark.parametrize("count", [2, 4, 8])
def test_easing_curves_length_bounds_accepted(count: int) -> None:
    curves = [
        EasingCurve(name=f"curve-{i}", control_points=[0.0, 0.25, 0.75, 1.0])
        for i in range(count)
    ]
    spec = _payload_accepted(easing_curves=curves)
    assert len(spec.easing_curves) == count


# ---------- (b) Rejection suite (mirrored with TS via shared JSON) ----------


_REJECTION_CASES = load_rejection_cases("style-spec")


@pytest.mark.parametrize("case", _REJECTION_CASES, ids=lambda c: c.case_id)
def test_rejection_case(case) -> None:
    with pytest.raises(ValidationError) as exc_info:
        StyleSpec.model_validate(case.payload)

    errors = exc_info.value.errors()
    actual_locs = {_loc_as_tuple(e) for e in errors}

    if not case.expect_paths:
        # No path constraint -- assert rejection only.
        assert errors, f"Expected at least one ValidationError, got none for {case.case_id}"
        return

    for expected in case.expect_paths:
        # Membership: the expected loc must appear among the actual ones.
        # Implemented as tuple-in-set; loc tuples are hashable.
        assert tuple(expected) in actual_locs, (
            f"{case.case_id}: expected loc {tuple(expected)!r} not found in "
            f"{sorted(actual_locs)!r}"
        )
