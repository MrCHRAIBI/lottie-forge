import { z } from "zod";

/**
 * zod mirror of the Pydantic `StyleSpec` in `lottie_forge/domain/style.py` (DM-05).
 *
 * Every object is a `z.strictObject` so unknown keys are rejected, matching
 * `extra="forbid"` on the Pydantic side -- unknown fields are rejected at both
 * ends of the bridge. Bounds, regexes and array lengths mirror the Python
 * model exactly: a bound that exists on one side and not the other is drift.
 *
 * Per ADR-01 no field describes a SMIL or CSS-keyframe animation channel.
 */

/** Numeric MAJOR.MINOR.PATCH triple -- no pre-release suffixes in v1. */
export const STYLE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
/** Stable kebab-case token: lowercase letter, then lowercase/digit/- only. */
export const TOKEN_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
/** RGB hex colour with `#` prefix, six hex digits. */
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const SizeSchema = z.strictObject({
  width: z.number().int().min(16).max(2048),
  height: z.number().int().min(16).max(2048),
});

export const StrokeWidthsSchema = z
  .strictObject({
    thin: z.number().min(0.25).max(16),
    default: z.number().min(0.25).max(16),
    bold: z.number().min(0.25).max(16),
  })
  .superRefine((widths, ctx) => {
    if (!(widths.thin < widths.default && widths.default < widths.bold)) {
      ctx.addIssue({
        code: "custom",
        message: `stroke widths must strictly increase: thin (${widths.thin}) < default (${widths.default}) < bold (${widths.bold})`,
      });
    }
  });

export const CornerRadiiSchema = z
  .strictObject({
    small: z.number().min(0).max(48),
    medium: z.number().min(0).max(48),
    large: z.number().min(0).max(48),
  })
  .superRefine((radii, ctx) => {
    if (!(radii.small <= radii.medium && radii.medium <= radii.large)) {
      ctx.addIssue({
        code: "custom",
        message: `corner radii must not decrease: small (${radii.small}) <= medium (${radii.medium}) <= large (${radii.large})`,
      });
    }
  });

export const PaletteTokenSchema = z.strictObject({
  name: z.string().regex(TOKEN_NAME_PATTERN).max(64),
  hex: z.string().regex(HEX_COLOR_PATTERN),
});

export const EasingCurveSchema = z.strictObject({
  name: z.string().regex(TOKEN_NAME_PATTERN).max(64),
  control_points: z.tuple([
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.number().min(0).max(1),
  ]),
});

export const StyleSpecSchema = z
  .strictObject({
    style_version: z.string().regex(STYLE_VERSION_PATTERN).max(32),
    viewBox: SizeSchema,
    stroke_widths: StrokeWidthsSchema,
    corner_radii: CornerRadiiSchema,
    palette: z.array(PaletteTokenSchema).min(2).max(16),
    easing_curves: z.array(EasingCurveSchema).min(2).max(8),
  })
  .superRefine((spec, ctx) => {
    const names = spec.palette.map((token) => token.name);
    if (new Set(names).size !== names.length) {
      ctx.addIssue({
        code: "custom",
        path: ["palette"],
        message: "palette token names must be unique",
      });
    }
  });

export type StyleSpec = z.infer<typeof StyleSpecSchema>;
export type Size = z.infer<typeof SizeSchema>;
export type StrokeWidths = z.infer<typeof StrokeWidthsSchema>;
export type CornerRadii = z.infer<typeof CornerRadiiSchema>;
export type PaletteToken = z.infer<typeof PaletteTokenSchema>;
export type EasingCurve = z.infer<typeof EasingCurveSchema>;
