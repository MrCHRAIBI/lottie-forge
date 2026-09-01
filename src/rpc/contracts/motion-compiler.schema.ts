import { z } from "zod";

import { ASSET_ID_PATTERN } from "./asset-spec.schema.js";
import { KeyframeShapeSchema } from "./catalogue.schema.js";
import { MotionParamsSchema } from "./recipe.schema.js";
/**
 * Phase 3 frozen contract — the zod mirror of the planned Pydantic
 * `RenderSpec` / `CompileResult` in `lottie_forge/domain/render_spec.py`
 * (§6.3.1 verbatim).
 *
 * **FREEZE — Phase 7 mirrors this module 1-for-1.** The Phase 7
 * `Translator` and Phase 6 `RecipePicker` agent mold into this contract;
 * every later fixture, golden and bridge depends on its exact byte
 * layout. A change here after Phase 3 is a migration of contracts +
 * fixtures + goldens — the plan-03-01 §6.3.1 freeze is structural.
 *
 * Decisions implemented (Phase 3 CONTEXT.md):
 *
 * - D-01 — geometry is 100% parametric: shape generator + parameter set,
 *   the compiler emits all path data. No free-form field crosses the
 *   boundary.
 * - D-02 — `role` ∈ `ThemeAnchorId ∪ {"neutral"}`. The 6 theme-anchor ids
 *   are imported from `vocabulary.schema.js` (the `THEME_ANCHOR_IDS`
 *   tuple); `"neutral"` is added at this layer. Never redeclare.
 * - D-06 — closed zod ranges on every numeric coordinate, radius, scale,
 *   points_count, rotation: a malformed RenderSpec cannot be constructed.
 * - D-07 — `components` is `min(1).max(8)` — empty/oversized specs are
 *   rejected at the gate.
 * - D-13 — field naming follows the Phase 1 snake_case convention
 *   verbatim. Any camelCase key anywhere = review rejection. Mirrored by
 *   the Phase 7 Pydantic class field names.
 * - D-14 — stroke widths are expressed only by token name
 *   (`stroke_width_token` ∈ `thin | default | bold`), never a free float.
 *   Token names come from `StyleSpec.stroke_widths.keys()` (D-14 contract).
 * - D-32 — `(component, role)` uniqueness enforced via `.superRefine`
 *   with one issue per duplicate occurrence at explicit path, never a
 *   silent dedup.
 * - D-34 — `transform` deltas carry their OWN closed ranges (`-1..1`
 *   for translate, `-360..360` for rotation, `0.1..4` for scale),
 *   separate from the `0..1` coordinate ranges. Cross-field
 *   `superRefine` (e.g. `corner_radius ≤ min(w,h)/2`, `r_inner < r_outer`)
 *   lives on the per-variant shape schema.
 *
 * ADR-01 / COM-02 — no field describes a SMIL or CSS-keyframe animation
 * channel. The motion vocabulary is `MotionParamsSchema`, re-used
 * AS-IS from `recipe.schema.js` (D-08: one motion truth). The catalogue
 * is the source for durations/easings; they do not appear in
 * RenderSpec (D-34).
 */
import type { StyleSpec } from "./style-spec.schema.js";
import { ThemeAnchorIdSchema } from "./vocabulary.schema.js";

/**
 * D-02 `role` derived union — `ThemeAnchorId ∪ {"neutral"}`. Built
 * from the imported tuple so the structural same-commit scan in
 * `tests/domain/test_vocabulary.py` cannot drift: a vocabulary change
 * edits `vocabulary.schema.ts` AND mirrors it here at type-check
 * time. The `"neutral"` token is intentionally a string literal added
 * at this layer so vocab.py stays a pure anchor id set.
 */
export const RENDER_SPEC_ROLES = [
  ...(ThemeAnchorIdSchema.options as unknown as readonly string[]),
  "neutral",
] as const;

export type RenderSpecRole = (typeof RENDER_SPEC_ROLES)[number];

export const RoleSchema = z.enum(RENDER_SPEC_ROLES);

/**
 * Stroke-width token closure — references the locked keys of
 * `StyleSpec.stroke_widths` per D-14. A free-float stroke width is
 * structurally impossible at the gate.
 */
export const STROKE_WIDTH_TOKENS = ["thin", "default", "bold"] as const;
export type StrokeWidthToken = (typeof STROKE_WIDTH_TOKENS)[number];
export const StrokeWidthTokenSchema = z.enum(STROKE_WIDTH_TOKENS);

/**
 * D-06 — coordinates are closed [0..1] (normalized viewport-relative
 * coordinates). Both endpoint and dimension fields share this bound.
 */
const COORD_MIN = 0;
const COORD_MAX = 1;
const coordRange = (): z.ZodNumber => z.number().min(COORD_MIN).max(COORD_MAX);

/**
 * Polygon path/polyline point count — D-06 closed range; small enough
 * to render deterministically, large enough for any practical asset.
 */
const POINTS_MIN = 2;
const POINTS_MAX = 64;
const pointTuple = (): z.ZodTuple<[z.ZodNumber, z.ZodNumber]> =>
  z.tuple([coordRange(), coordRange()]);
const pointArray = (): z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber]>> =>
  z.array(pointTuple()).min(POINTS_MIN).max(POINTS_MAX);

export const PointSchema = z.strictObject({
  x: coordRange(),
  y: coordRange(),
});

/**
 * D-01 closed shape union — five generators only
 * (`SHAPE_NAMES`: rect, ellipse, path, polyline, polystar). Discriminated
 * on the literal `shape` field so an unmatched variant is rejected
 * BEFORE the per-variant field check.
 */
export const ShapeInputSchema = z.discriminatedUnion("shape", [
  z
    .strictObject({
      shape: z.literal("rect"),
      x: coordRange(),
      y: coordRange(),
      w: z.number().min(0).max(1),
      h: z.number().min(0).max(1),
      corner_radius: z.number().min(0).max(0.5).default(0),
    })
    .superRefine((rect, ctx) => {
      // D-34 cross-field: corner_radius <= min(w,h)/2 -- a rect
      // larger-than-half-the-radius cannot render.
      const maxAllowed = Math.min(rect.w, rect.h) / 2;
      if (rect.corner_radius > maxAllowed) {
        ctx.addIssue({
          code: "custom",
          path: ["corner_radius"],
          message: `corner_radius (${rect.corner_radius}) must be <= min(w, h)/2 = ${maxAllowed}`,
        });
      }
    }),
  z.strictObject({
    shape: z.literal("ellipse"),
    cx: coordRange(),
    cy: coordRange(),
    rx: z.number().min(0).max(1),
    ry: z.number().min(0).max(1),
  }),
  z.strictObject({
    shape: z.literal("path"),
    points: pointArray(),
    closed: z.boolean().default(false),
  }),
  z.strictObject({
    shape: z.literal("polyline"),
    points: pointArray(),
  }),
  z
    .strictObject({
      shape: z.literal("polystar"),
      cx: coordRange(),
      cy: coordRange(),
      points_count: z.number().int().min(3).max(12),
      r_outer: z.number().min(0).max(1),
      r_inner: z.number().min(0).max(1),
      rotation_deg: z.number().min(-360).max(360).default(0),
    })
    .superRefine((star, ctx) => {
      // D-34 cross-field: a star requires r_inner < r_outer --
      // equal radii degenerates to a circle and breaks renderer.
      if (!(star.r_inner < star.r_outer)) {
        ctx.addIssue({
          code: "custom",
          path: ["r_inner"],
          message: `r_inner (${star.r_inner}) must be strictly less than r_outer (${star.r_outer})`,
        });
      }
    }),
]);

/**
 * D-14 paint union — fill-only or stroke+token. The stroke variant
 * declares `stroke_width_token` instead of a free float (closed enum of
 * `StyleSpec.stroke_widths` keys); bare `stroke_width` keys are
 * rejected by `z.strictObject`.
 */
export const PaintSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("fill"),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  z.strictObject({
    kind: z.literal("stroke"),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    stroke_width_token: StrokeWidthTokenSchema,
  }),
]);

/**
 * D-34 — transform deltas carry their OWN closed ranges, separate from
 * the 0..1 coordinate ranges (slide's `translate_dx` would otherwise be
 * capped at 1 unit and a bounce's overshoot would breach the coord
 * bound). All fields are optional with safe defaults.
 */
export const TransformDeltaSchema = z.strictObject({
  translate_dx: z.number().min(-1).max(1).default(0),
  translate_dy: z.number().min(-1).max(1).default(0),
  rotation_deg: z.number().min(-360).max(360).default(0),
  scale: z.number().min(0.1).max(4).default(1),
});

/**
 * A single component of a RenderSpec — a shape painted and positioned
 * within the asset's viewport. One component = one Lottie shape layer
 * in the output (D-19 mirrored structure).
 */
export const ComponentSchema = z.strictObject({
  component: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/)
    .max(64),
  role: RoleSchema,
  shape: ShapeInputSchema,
  paint: PaintSchema,
  transform: TransformDeltaSchema.optional(),
});

/**
 * RenderSpec — the deterministic, frozen-at-Phase-3 input contract.
 *
 * Field-by-field lock:
 *
 * - `asset_id` — `^a-\d{3}$` (50 slots; ASSET_ID_PATTERN re-used from
 *   asset-spec.schema.js, never redeclared here).
 * - `recipe_id` — RecipeIdSchema from vocabulary.schema.js.
 * - `style_ref` — STY-03 pin `name@MAJOR.MINOR.PATCH`, three numeric
 *   segments joined by literal dots (escape `\.` on both sides — a
 *   loose dot slips a 4-segment version past the gate).
 * - `components` — `min(1).max(8)` (D-07) — empty/oversized specs are
 *   rejected at the gate.
 *
 * Cross-field superRefines:
 * - D-13 meta-rule: unknown top-level keys are rejected by `z.strictObject`.
 * - D-32 `(component, role)` uniqueness — one issue per duplicate at
 *   explicit path `["components", idx, "role"]` (mirrors the recipe
 *   id uniqueness doctrine).
 */
export const RenderSpecSchema = z
  .strictObject({
    asset_id: z.string().regex(ASSET_ID_PATTERN).max(6),
    recipe_id: z.enum([
      "fade",
      "slide",
      "bounce",
      "pulse",
      "draw-on",
      "rotate",
      "scale-pop",
      "float",
      "wiggle",
      "orbit",
    ] as const),
    style_ref: z
      .string()
      .regex(/^[a-z][a-z0-9-]*@\d+\.\d+\.\d+$/)
      .max(128),
    components: z.array(ComponentSchema).min(1).max(8),
    motion: MotionParamsSchema,
  })
  .superRefine((spec, ctx) => {
    // D-32 (component, role) uniqueness -- one issue per duplicate
    // occurrence at ["components", idx, "role"], never a silent dedup.
    const seen = new Set<string>();
    spec.components.forEach((component, idx) => {
      const key = `${component.component}|${component.role}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["components", idx, "role"],
          message: `duplicate (component, role) pair (${component.component}, ${component.role}) at index ${idx}`,
        });
      } else {
        seen.add(key);
      }
    });
  });

/**
 * Renderer-support declaration (D-11) — meta on `CompileResult`. Two
 * values only: `"all"` (the Lottie JSON uses only the canonical
 * subset below 5.7.1 and works on every renderer the docs mention)
 * and `"svg-only"` (the emit path produced a feature that one of
 * lottie-android/ios/Flutter cannot render, so the asset ships with
 * the static SVG fallback). Persisted at the Phase 5 manifest, read
 * by the Phase 8 packager.
 */
export const RendererSupportSchema = z.enum(["all", "svg-only"] as const);
export type RendererSupport = z.infer<typeof RendererSupportSchema>;

/**
 * Closed envelope of `CompileResult` — frozen at the Phase 3 gate.
 * `lottie` is RE-VALIDATED against the structural rules in
 * `LottieJSONSchema` (Task 2) before any return, so an invalid Lottie
 * can never cross this boundary. `svg` carries the raw companion
 * output (validation is the sanitizer's job, D-17).
 */
export const CompileRequestSchema = z.strictObject({
  render_spec: RenderSpecSchema,
  style: z.custom<StyleSpec>(),
  catalogue: z.custom<unknown>(),
});

export type RenderSpec = z.infer<typeof RenderSpecSchema>;
export type Component = z.infer<typeof ComponentSchema>;
export type ShapeInput = z.infer<typeof ShapeInputSchema>;
export type Paint = z.infer<typeof PaintSchema>;
export type TransformDelta = z.infer<typeof TransformDeltaSchema>;
export type CompileRequest = z.infer<typeof CompileRequestSchema>;
export type AnimatableProperty = z.infer<typeof AnimatablePropertySchema>;
export type Keyframe = z.infer<typeof KeyframeSchema>;
export type Transform = z.infer<typeof TransformSchema>;

// Re-export the imported keyframe-shape schema so consumers see it
// through the Phase 3 frozen-contract surface (Task 2 wiring).
export { KeyframeShapeSchema };

/* ===========================================================================
 * LottieJSON re-validation gate — Task 2
 *
 * The compiler RE-EMITS a Lottie JSON object after producing it. This schema
 * pins exactly the subset it is allowed to produce and rejects everything
 * else (adjacent pinned literals, expression channels, legacy keyframe
 * endpoints, malformed keyframe sequences, out-of-unit values). COM-03 —
 * an invalid Lottie cannot parse through the gate; COM-04 — every structural
 * Pin (5.7.0, ddd=0, ty=4, no `x` keys, no `e` keys, s:[v], ascending t,
 * last-keyframe-without-handles, op>=ip, scale>=0, opacity 0..100) is
 * structurally enforced here.
 *
 * D-33 deliberately omits the bake convention and any expression-baking
 * path: an expression key found in input is hard-rejected with
 * `unsupported_feature` (NOT in this schema -- that reject happens at the
 * gate feature-gate layer). The strictObject rejection of unknown keys is
 * what makes a stray `x` (the expression channel key) and `e` (the legacy
 * keyframe endpoint key) structurally impossible.
 * ===========================================================================
 */

/**
 * Keyframe-easing handle pair. `i` (in) and `o` (out) carry per-dimension
 * values `{x, y}` where each is either a scalar (linear easings) or a
 * 1-element array (bezier curves — the Lottie spec nests per-dimension
 * arrays even when there is a single per-dimension point). The hybrid
 * form is the actual emit shape; we accept it.
 */
const EaseHandlePerDimensionSchema = z.union([z.number(), z.array(z.number()).min(1)]);
const EaseHandleScalarSchema = z.strictObject({
  x: EaseHandlePerDimensionSchema,
  y: EaseHandlePerDimensionSchema,
});

const EaseHandleSchema = z.union([EaseHandleScalarSchema, z.array(EaseHandleScalarSchema).min(1)]);

/**
 * Pitfall 3 + COM-04: `s` is always a 1-element array (NOT a bare scalar)
 * because the Lottie runtime requires an array slot even when the value is
 * a single number. Scalar `s` would crash the renderer.
 */
const KeyframeValueSchema = z.array(z.number()).min(1);

/**
 * Pitfall 11: animated keyframe sequence invariants. Last keyframe MUST
 * carry no `i`/`o`; every intermediate keyframe MUST carry both. Times
 * MUST strictly ascend. The `s` array wraps whatever shape the value is
 * (number for op/scale/opacity, 3-tuple for transform colors, etc.).
 *
 * StrictObject alone rejects unknown keys (the legacy `e` endpoint
 * field is structurally impossible), and D-12 pins `t` to the closed
 * `>= 0` range. Per-keyframe rules (single keyframe carrying no
 * handles) live on the array-level schema below.
 */
export const KeyframeSchema = z.strictObject({
  t: z.number().min(0),
  s: KeyframeValueSchema,
  h: z.literal(1).optional(),
  i: EaseHandleSchema.optional(),
  o: EaseHandleSchema.optional(),
});

/**
 * Pitfall 11 superRefine at array level: ascending t, every keyframe
 * EXCEPT the last carries i AND o, the last carries NEITHER. The legacy
 * `e` field would be rejected by `z.strictObject` (unknown key, D-12).
 */
const KeyframeArraySchema = z
  .array(KeyframeSchema)
  .min(1)
  .superRefine((keyframes, ctx) => {
    for (let i = 0; i < keyframes.length - 1; i += 1) {
      const kf = keyframes[i];
      const nextKf = keyframes[i + 1];
      if (kf.t >= nextKf.t) {
        ctx.addIssue({
          code: "custom",
          path: [i, "t"],
          message: `keyframes must be strictly ascending in t; got t=${kf.t} at index ${i} >= t=${nextKf.t} at index ${i + 1}`,
        });
      }
      if (kf.i === undefined || kf.o === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [i],
          message: `every intermediate keyframe must carry i and o (Pitfall 11); missing at index ${i}`,
        });
      }
      if (nextKf.i !== undefined || nextKf.o !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [i + 1],
          message: `the last keyframe must carry no i or o (Pitfall 11); present at index ${i + 1}`,
        });
      }
    }
    // Final last-keyframe check (in case of single-keyframe arrays).
    const last = keyframes[keyframes.length - 1];
    if (last !== undefined && (last.i !== undefined || last.o !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: [keyframes.length - 1],
        message: `the last keyframe must carry no i or o (Pitfall 11); present at index ${keyframes.length - 1}`,
      });
    }
  });

/**
 * COM-04: an animated property is a `k` array of keyframes; a static
 * property is a `k` value (number or n-tuple). The `a` flag (0/1)
 * discriminates, and `x` (the expression channel) is an unknown key
 * rejected by `z.strictObject` — making expressions structurally
 * impossible at the gate.
 */
const StaticPropertyValueSchema = z.union([
  z.number(),
  z.tuple([z.number()]),
  z.tuple([z.number(), z.number()]),
  z.tuple([z.number(), z.number(), z.number()]),
]);

export const AnimatablePropertySchema = z.discriminatedUnion("a", [
  z.strictObject({
    a: z.literal(0),
    k: StaticPropertyValueSchema,
  }),
  z.strictObject({
    a: z.literal(1),
    k: KeyframeArraySchema,
  }),
]);

/** True iff `values` contains a number outside [0, 100]. */
function isOpacityOutOfRange(values: readonly unknown[]): boolean {
  return values.some((v) => typeof v === "number" && (v < 0 || v > 100));
}

/** True iff `values` contains a number < 0 (negative stretch). */
function hasNegativeScale(values: readonly unknown[]): boolean {
  return values.some((v) => typeof v === "number" && v < 0);
}

/**
 * Transform layer schema — every animated block is a separate
 * AnimatableProperty. Scale carries a `>= 0` invariant (negative scale
 * = negative stretch = corrupted/reflected asset, COM-04). Opacity
 * carries the `0..100` unit gate (Pitfall 2). Both invariants apply to
 * animated AND static values — the gate is the gate.
 */
export const TransformSchema = z
  .strictObject({
    o: AnimatablePropertySchema.optional(),
    r: AnimatablePropertySchema.optional(),
    p: AnimatablePropertySchema.optional(),
    s: AnimatablePropertySchema.optional(),
    a: AnimatablePropertySchema.optional(),
  })
  .superRefine((transform, ctx) => {
    // Negative stretch gate on scale (animated + static).
    if (transform.s !== undefined) {
      if (transform.s.a === 1) {
        transform.s.k.forEach((kf, idx) => {
          if (hasNegativeScale(kf.s)) {
            ctx.addIssue({
              code: "custom",
              path: ["s", "k", idx, "s"],
              message: `scale value must be >= 0 (negative stretch rejected, COM-04); got at index ${idx}`,
            });
          }
        });
      } else {
        const k = transform.s.k;
        const outOfRange =
          (typeof k === "number" && k < 0) || (Array.isArray(k) && hasNegativeScale(k));
        if (outOfRange) {
          ctx.addIssue({
            code: "custom",
            path: ["s", "k"],
            message: `static scale value must be >= 0 (negative stretch rejected, COM-04)`,
          });
        }
      }
    }
    // Opacity 0..100 unit gate (animated + static).
    if (transform.o !== undefined) {
      if (transform.o.a === 1) {
        transform.o.k.forEach((kf, idx) => {
          if (isOpacityOutOfRange(kf.s)) {
            ctx.addIssue({
              code: "custom",
              path: ["o", "k", idx, "s"],
              message: `opacity must be within 0..100 (Pitfall 2); out-of-bounds at index ${idx}`,
            });
          }
        });
      } else {
        const k = transform.o.k;
        const outOfRange =
          (typeof k === "number" && (k < 0 || k > 100)) ||
          (Array.isArray(k) && isOpacityOutOfRange(k));
        if (outOfRange) {
          ctx.addIssue({
            code: "custom",
            path: ["o", "k"],
            message: `static opacity must be within 0..100 (Pitfall 2)`,
          });
        }
      }
    }
  });

/**
 * Closed type enum over the shape-item types the compiler is allowed
 * to emit — any other `ty` is a structural reject (the runtime crashes
 * on unknown shape items). Trim items (`tm`) carry the trim-path data
 * for draw-on; the `s`/`e` properties are bounded 0..100 (Pitfall 2)
 * and `m` is fixed to 1 (the Lottie renderer interprets m=0 differently).
 */
const LottieShapeItemSchema = z.union([
  z.strictObject({
    ty: z.literal("gr"),
    it: z.array(z.unknown()),
  }),
  z.strictObject({
    ty: z.literal("rc"),
    p: StaticPropertyValueSchema,
    s: StaticPropertyValueSchema,
    r: StaticPropertyValueSchema,
  }),
  z.strictObject({
    ty: z.literal("el"),
    p: StaticPropertyValueSchema,
    s: StaticPropertyValueSchema,
  }),
  z.strictObject({
    ty: z.literal("sh"),
    ks: StaticPropertyValueSchema,
  }),
  z.strictObject({
    ty: z.literal("sr"),
    p: StaticPropertyValueSchema,
    pt: z.number().int(),
    or: StaticPropertyValueSchema,
    ir: StaticPropertyValueSchema,
    is: StaticPropertyValueSchema,
    os: StaticPropertyValueSchema,
    r: StaticPropertyValueSchema,
  }),
  z.strictObject({
    ty: z.literal("fl"),
    c: StaticPropertyValueSchema,
    o: z.number().min(0).max(100),
  }),
  z.strictObject({
    ty: z.literal("st"),
    c: StaticPropertyValueSchema,
    o: z.number().min(0).max(100),
    w: StaticPropertyValueSchema,
    lc: z.union([z.literal(1), z.literal(2)]),
    lj: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  }),
  z
    .strictObject({
      ty: z.literal("tm"),
      s: StaticPropertyValueSchema,
      e: StaticPropertyValueSchema,
      o: StaticPropertyValueSchema,
      m: z.literal(1),
      ix: z.number().int(),
    })
    .superRefine((tm, ctx) => {
      // Trim s/e unit gate 0..100 (Pitfall 2).
      for (const key of ["s", "e"] as const) {
        const v = tm[key] as unknown[];
        if (v.some((x) => typeof x === "number" && (x < 0 || x > 100))) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `trim property ${key} must be within 0..100 (Pitfall 2); got ${v}`,
          });
        }
      }
    }),
]);

/**
 * Shape layer schema — `ty` is LITERAL 4 (shape layer only). `ddd` is
 * LITERAL 0 (3D is hard-rejected; Pitfall 1). `nm` mirrors the theme
 * anchor / `neutral` (D-02 closed set).
 */
export const LottieShapeLayerSchema = z.strictObject({
  ddd: z.literal(0),
  ind: z.number().int().min(1),
  ty: z.literal(4),
  nm: z.string().min(1).max(64),
  ip: z.number().int().min(0),
  op: z.number().int().min(1),
  ks: TransformSchema,
  shapes: z.array(LottieShapeItemSchema).min(1),
});

/**
 * LottieJSON re-validation gate — pins the literal `v="5.7.0"` (D-12),
 * `ddd=0` (3D reject), shape-layer-only `ty=4`, no assets array, non-empty
 * layers, and `op >= ip` (negative-stretch reject). COM-03 schema layer.
 *
 * `assets` is permitted as an empty array (the compiler must NOT
 * reference precomps); a non-empty assets array is a corruption signal
 * the sanitizer-style audit can surface later.
 */
export const LottieJSONSchema = z
  .strictObject({
    v: z.literal("5.7.0"),
    fr: z.number().min(1).max(120),
    ip: z.number().int().min(0),
    op: z.number().int().min(1),
    ddd: z.literal(0),
    assets: z.array(z.unknown()).length(0),
    layers: z.array(LottieShapeLayerSchema).min(1),
  })
  .superRefine((lottie, ctx) => {
    // COM-04 — op >= ip (negative stretch rejected at the gate).
    if (!(lottie.op >= lottie.ip)) {
      ctx.addIssue({
        code: "custom",
        path: ["op"],
        message: `op (${lottie.op}) must be >= ip (${lottie.ip}); negative stretch rejected`,
      });
    }
  });

export type LottieJSON = z.infer<typeof LottieJSONSchema>;
export type LottieShapeLayer = z.infer<typeof LottieShapeLayerSchema>;
export type LottieShapeItem = z.infer<typeof LottieShapeItemSchema>;

/**
 * CompileResult — the compiler's emit envelope. `lottie` carries the
 * output that was just re-validated by `LottieJSONSchema.safeParse`; the
 * schema-level check ensures by construction that the embedded value is
 * a valid subset. `svg` carries the raw companion output (sanitization
 * is the sanitizer's job; the compiler never sanitizes internally, D-17).
 */
export const CompileResultSchema = z.strictObject({
  asset_id: z.string().regex(ASSET_ID_PATTERN).max(6),
  recipe_id: z.enum([
    "fade",
    "slide",
    "bounce",
    "pulse",
    "draw-on",
    "rotate",
    "scale-pop",
    "float",
    "wiggle",
    "orbit",
  ] as const),
  renderer_support: RendererSupportSchema,
  lottie: LottieJSONSchema,
  svg: z.string().min(1),
});

export type CompileResult = z.infer<typeof CompileResultSchema>;
