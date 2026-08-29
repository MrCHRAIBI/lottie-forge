"""Domain models — the Python side of the bridge (Pydantic v2).

Every model in this package is ``STRICT_CONFIG`` (no coercion, no unknown fields)
and is mirrored field-for-field in TypeScript by ``src/rpc/contracts/`` modules
(``z.strictObject``, see ``docs/project/04_Modeles.md`` §4.9).
"""

from lottie_forge.domain._shared import STRICT_CONFIG, TOKEN_NAME_PATTERN, KebabToken
from lottie_forge.domain.style import (
    CornerRadii,
    EasingCurve,
    PaletteToken,
    Size,
    StrokeWidths,
    StyleSpec,
)

__all__ = [
    "CornerRadii",
    "EasingCurve",
    "KebabToken",
    "PaletteToken",
    "Size",
    "STRICT_CONFIG",
    "StrokeWidths",
    "StyleSpec",
    "TOKEN_NAME_PATTERN",
]
