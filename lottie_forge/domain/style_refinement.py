"""StyleRefinement -- the closed, delta-only style delta contract (STY-02, §5.3).

Mirrored field-for-field in TypeScript by ``src/rpc/contracts/style-refinement.schema.ts``
(DM-05). The model is the seam between "creative" (Phase 6 ``StyleRefiner``
LLM) and "deterministic compile" (Motion Compiler + Packager): the LLM is
constrained to declare deltas from a loaded StyleSpec -- never to smuggle in
a raw hex, a path, a numeric stroke thickness, or any other visual primitive.

Why this model is delta-only by construction
---------------------------------------------

The closed field set ``{sub_palette, motif, stroke_pick, radius_pick,
accent_weight}`` cannot carry a free-form visual primitive:

- ``sub_palette`` and ``motif`` are ``KebabToken`` lists -- the shared kebab
  regex ``^[a-z][a-z0-9-]*$`` rejects any string that resembles a hex
  (``"#fff"``), an SVG path fragment (``"<path"``), or any non-kebab
  primitive. ``sub_palette`` is a list of **names** drawn from the loaded
  StyleSpec's palette; the cross-reference (each entry in
  ``StyleSpec.palette``) is enforced at the Translator (Phase 7) where the
  loaded style spec is available. Phase 2 only ships the **type** + the
  structural gate (traceability "STY-02 partial").
- ``stroke_pick`` and ``radius_pick`` are closed ``Literal`` enums --
  exactly the three / three values declared in §5.2.2. A free numeric
  stroke thickness or radius is not expressible.
- ``accent_weight`` is the single bounded float (0..1) -- the only
  continuous knob the compiler understands for emphasis; the bounds are an
  anti-DoS guard.

Per ADR-01 no field here describes a SMIL or CSS-keyframe animation channel:
all motion ships as Lottie JSON produced by the deterministic Motion
Compiler.

Model conventions (mirror §4.4 / §4.7):

- ``model_config = STRICT_CONFIG`` -- ``extra="forbid"`` so unknown fields
  are rejected at construction time; ``strict=True`` so ``"0.5"`` for a
  float and ``1`` for a float alike are rejected.
- The five-field closure is asserted by ``tests/domain/test_style_refinement.py``
  -- adding a sixth field is a same-commit structural change to both this
  module and its zod mirror.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field

from lottie_forge.domain._shared import STRICT_CONFIG, KebabToken

StrokePick = Literal["thin", "default", "bold"]
"""Closed enum of stroke weight picks from the StyleSpec §5.2.2 envelope."""

RadiusPick = Literal["small", "medium", "large"]
"""Closed enum of corner-radius picks from the StyleSpec §5.2.2 envelope."""


class StyleRefinement(BaseModel):
    """A delta-only style refinement emitted by the Phase 6 ``StyleRefiner``.

    The LLM declares *what to emphasize* against a loaded StyleSpec -- it
    never gets to redefine hex colours, paths, stroke widths or radii. The
    ``sub_palette`` cross-reference (``name ⊆ StyleSpec.palette``) is
    enforced at the Translator (Phase 7) against the loaded style spec;
    Phase 2 ships the **type** + the structural gate (STY-02 partial).

    The closed field set ``{sub_palette, motif, stroke_pick, radius_pick,
    accent_weight}`` is asserted by ``tests/domain/test_style_refinement.py``
    -- a sixth field is a deliberate, same-commit structural change to both
    this model and its zod mirror.
    """

    model_config = STRICT_CONFIG

    sub_palette: list[KebabToken] = Field(min_length=1, max_length=16)
    motif: KebabToken | None = None
    stroke_pick: StrokePick = "default"
    radius_pick: RadiusPick = "medium"
    accent_weight: Annotated[float, Field(ge=0.0, le=1.0)] = 0.5


__all__ = ["RadiusPick", "StrokePick", "StyleRefinement"]
