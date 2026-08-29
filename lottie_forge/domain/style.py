"""StyleSpec — the locked, versioned visual style contract (DM-01).

Mirrored field-for-field in TypeScript by ``src/rpc/contracts/style-spec.schema.ts``
(DM-05). Every model here is strict (``strict=True``, no coercion) and closed
(``extra="forbid"``, unknown fields rejected), matching ``z.strictObject`` on the
TypeScript side -- unknown fields are rejected at both ends of the bridge.

Per ADR-01 no field describes a SMIL or CSS-keyframe animation channel: motion
ships as Lottie JSON produced by the Motion Compiler (Phase 3).

``style_version`` has **no default** -- a style spec cannot exist unpinned, so
style drift is always detectable downstream.
"""

from typing import Annotated, Self

from pydantic import BaseModel, Field, model_validator

from lottie_forge.domain._shared import STRICT_CONFIG, KebabToken

STYLE_VERSION_PATTERN = r"^\d+\.\d+\.\d+$"
"""Numeric MAJOR.MINOR.PATCH triple -- no pre-release suffixes in v1."""

HEX_COLOR_PATTERN = r"^#[0-9a-fA-F]{6}$"

Dimension = Annotated[int, Field(ge=16, le=2048)]
StrokeWidth = Annotated[float, Field(ge=0.25, le=16)]
CornerRadius = Annotated[float, Field(ge=0, le=48)]
ControlPoint = Annotated[float, Field(ge=0, le=1)]


class Size(BaseModel):
    """Canvas dimensions of the illustration viewBox, in user units."""

    model_config = STRICT_CONFIG

    width: Dimension
    height: Dimension


class StrokeWidths(BaseModel):
    """The three stroke weights available to a pack, strictly increasing."""

    model_config = STRICT_CONFIG

    thin: StrokeWidth
    default: StrokeWidth
    bold: StrokeWidth

    @model_validator(mode="after")
    def _weights_strictly_increase(self) -> Self:
        if not self.thin < self.default < self.bold:
            raise ValueError(
                f"stroke widths must strictly increase: "
                f"thin ({self.thin}) < default ({self.default}) < bold ({self.bold})"
            )
        return self


class CornerRadii(BaseModel):
    """The three corner radii available to a pack, non-decreasing."""

    model_config = STRICT_CONFIG

    small: CornerRadius
    medium: CornerRadius
    large: CornerRadius

    @model_validator(mode="after")
    def _radii_non_decreasing(self) -> Self:
        if not self.small <= self.medium <= self.large:
            raise ValueError(
                f"corner radii must not decrease: "
                f"small ({self.small}) <= medium ({self.medium}) <= large ({self.large})"
            )
        return self


class PaletteToken(BaseModel):
    """A named colour token -- the only way a shape may reference a colour."""

    model_config = STRICT_CONFIG

    name: KebabToken
    hex: str = Field(pattern=HEX_COLOR_PATTERN)


class EasingCurve(BaseModel):
    """A named cubic-bezier easing curve, as exactly four control-point scalars."""

    model_config = STRICT_CONFIG

    name: KebabToken
    control_points: list[ControlPoint] = Field(min_length=4, max_length=4)


class StyleSpec(BaseModel):
    """The locked visual style of a pack -- versioned, numeric, and bounded."""

    model_config = STRICT_CONFIG

    style_version: str = Field(pattern=STYLE_VERSION_PATTERN, max_length=32)
    viewBox: Size  # noqa: N815 -- mirrors the SVG attribute name across the bridge
    stroke_widths: StrokeWidths
    corner_radii: CornerRadii
    palette: list[PaletteToken] = Field(min_length=2, max_length=16)
    easing_curves: list[EasingCurve] = Field(min_length=2, max_length=8)

    @model_validator(mode="after")
    def _palette_names_are_unique(self) -> Self:
        names = [token.name for token in self.palette]
        if len(set(names)) != len(names):
            duplicates = sorted({name for name in names if names.count(name) > 1})
            raise ValueError(f"palette token names must be unique (duplicates: {duplicates})")
        return self
