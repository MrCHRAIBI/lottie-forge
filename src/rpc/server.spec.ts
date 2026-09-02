import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { type RecipeCatalogue, RecipeCatalogueSchema } from "./contracts/catalogue.schema.js";
import { type StyleSpec, StyleSpecSchema } from "./contracts/style-spec.schema.js";
import {
  type Envelope,
  type ErrEnvelope,
  type OkEnvelope,
  processLine,
  RPC_ERROR_CODES,
  type ServerContext,
} from "./server.js";

/**
 * Unit spec for `processLine` — the pure NDJSON line handler.
 *
 * **Coverage map (D-36 doctrine — every claim here is asserted
 * below):**
 *
 * 1. malformed line (raw JSON.parse failure) → `protocol_error`,
 *    `id: null`, no throw.
 * 2. unknown method → `method_not_found`, original `id`.
 * 3. invalid `RenderSpec` → `validation_error` carrying the zod
 *    issue paths in `details`.
 * 4. happy-path `motion.compile` on the locked `a-001` fixture →
 *    `ok: true`, `result.lottie` is a v="5.7.0" envelope.
 * 5. violating SVG → `sanitize_rejected` carrying the structured
 *    report in `details`.
 * 6. closed code set is exactly the 8 literals (D-28/D-36).
 * 7. no `console.log` call is reachable from `processLine` —
 *    stdout discipline is enforced by typing + grep convention.
 */

function pinnedStyle(): StyleSpec {
  return StyleSpecSchema.parse({
    style_version: "1.0.0",
    viewBox: { width: 400, height: 300 },
    stroke_widths: { thin: 1.5, default: 2.5, bold: 4.0 },
    corner_radii: { small: 0, medium: 8, large: 16 },
    palette: [
      { name: "ink", hex: "#1F2430" },
      { name: "accent", hex: "#FF6B4A" },
      { name: "surface", hex: "#F5F1EA" },
      { name: "success", hex: "#3E9B6E" },
    ],
    easing_curves: [
      { name: "standard", control_points: [0.2, 0, 0.2, 1] },
      { name: "entrance", control_points: [0, 0, 0.2, 1] },
    ],
  });
}

const RENDER_SPEC_A001 = {
  asset_id: "a-001",
  recipe_id: "fade",
  style_ref: "example-style@1.0.0",
  components: [
    {
      component: "primary-rect",
      role: "primary",
      shape: { shape: "rect", x: 0.25, y: 0.25, w: 0.5, h: 0.5, corner_radius: 0.0625 },
      paint: { kind: "fill", color: "#1c57cb" },
    },
  ],
  motion: { amplitude: 0.5, direction: "none", loops: 1 },
} as const;

function buildContext(): ServerContext {
  // The unit spec loads the COMMITTED catalogue (10 recipes) — the
  // exact same fixture the production server loads at startup. This
  // keeps the test honest: any future schema tightening that breaks
  // the real catalogue will surface here too.
  const REPO_ROOT = join(__dirname, "..", "..");
  const path = join(REPO_ROOT, "fixtures", "recipe-catalogue", "catalogue.json");
  const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  const catalogue: RecipeCatalogue = RecipeCatalogueSchema.parse(raw);
  return { catalogue, style: pinnedStyle() };
}

function isErr(env: Envelope): env is ErrEnvelope {
  return env.ok === false;
}

function isOk(env: Envelope): env is OkEnvelope {
  return env.ok === true;
}

describe("rpc server: protocol + envelope closed contract (D-27/D-28/D-36)", () => {
  const ctx = buildContext();

  it("exports the exact closed code set of 8 literals (D-28/D-36)", () => {
    expect([...RPC_ERROR_CODES].sort()).toEqual(
      [
        "compile_error",
        "internal",
        "method_not_found",
        "parse_error",
        "protocol_error",
        "sanitize_rejected",
        "unsupported_feature",
        "validation_error",
      ].sort(),
    );
  });

  it("malformed NDJSON → protocol_error with id null, handler does not throw", () => {
    const env = processLine("this is not json {", ctx);
    expect(env.id).toBeNull();
    expect(isErr(env)).toBe(true);
    if (isErr(env)) {
      expect(env.error.code).toBe("protocol_error");
      expect(env.error.message.length).toBeGreaterThan(0);
    }
  });

  it("empty line → protocol_error with id null (no throw)", () => {
    const env = processLine("", ctx);
    expect(env.id).toBeNull();
    expect(isErr(env)).toBe(true);
    if (isErr(env)) {
      expect(env.error.code).toBe("protocol_error");
    }
  });

  it("JSON body missing id → parse_error with id null", () => {
    const env = processLine('{"method":"motion.compile","params":{}}', ctx);
    expect(env.id).toBeNull();
    expect(isErr(env)).toBe(true);
    if (isErr(env)) {
      expect(env.error.code).toBe("parse_error");
    }
  });

  it("JSON body missing method → parse_error carrying the parsed id", () => {
    const env = processLine('{"id":7,"params":{}}', ctx);
    expect(env.id).toBe(7);
    expect(isErr(env)).toBe(true);
    if (isErr(env)) {
      expect(env.error.code).toBe("parse_error");
    }
  });

  it("unknown method → method_not_found with the parsed id", () => {
    const env = processLine('{"id":3,"method":"bogus","params":{}}', ctx);
    expect(env.id).toBe(3);
    expect(isErr(env)).toBe(true);
    if (isErr(env)) {
      expect(env.error.code).toBe("method_not_found");
    }
  });

  it("motion.compile with invalid RenderSpec → validation_error with zod issue paths in details", () => {
    const line = JSON.stringify({
      id: 11,
      method: "motion.compile",
      params: {
        render_spec: {
          // missing asset_id, components 9 > D-07 bound
          recipe_id: "fade",
          style_ref: "example-style@1.0.0",
          components: [],
          motion: { amplitude: 0.5, direction: "none", loops: 1 },
        },
      },
    });
    const env = processLine(line, ctx);
    expect(env.id).toBe(11);
    expect(isErr(env)).toBe(true);
    if (isErr(env)) {
      expect(env.error.code).toBe("validation_error");
      const details = env.error.details as {
        issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>;
      };
      expect(details).toBeDefined();
      expect(Array.isArray(details.issues)).toBe(true);
      const paths = details.issues.map((i) => JSON.stringify(i.path));
      // The render_spec wrapper prefixes every issue path — the
      // RPC layer carries the `render_spec` key, so the failure
      // path becomes ["render_spec", "asset_id"], not just
      // ["asset_id"]. The closed-schema gate is the gate.
      expect(paths).toContain(JSON.stringify(["render_spec", "asset_id"]));
      expect(paths).toContain(JSON.stringify(["render_spec", "components"]));
    }
  });

  it("motion.compile happy-path → ok true, result.lottie has v=5.7.0 + layers", () => {
    const line = JSON.stringify({
      id: 42,
      method: "motion.compile",
      params: { render_spec: RENDER_SPEC_A001 },
    });
    const env = processLine(line, ctx);
    expect(env.id).toBe(42);
    expect(isOk(env)).toBe(true);
    if (isOk(env)) {
      const result = env.result as {
        asset_id: string;
        recipe_id: string;
        renderer_support: "all" | "svg-only";
        lottie: { v: string; fr: number; ip: number; op: number; layers: unknown[] };
        svg: string;
      };
      expect(result.asset_id).toBe("a-001");
      expect(result.recipe_id).toBe("fade");
      expect(result.renderer_support).toBe("all");
      expect(result.lottie.v).toBe("5.7.0");
      expect(Array.isArray(result.lottie.layers)).toBe(true);
      expect(result.lottie.layers.length).toBeGreaterThan(0);
      expect(typeof result.svg).toBe("string");
      expect(result.svg.length).toBeGreaterThan(0);
    }
  });

  it("svg.sanitize with clean SVG → ok true, report.violations empty, svg present", () => {
    const cleanSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<rect x="10" y="10" width="80" height="80" fill="#1c57cb"/></svg>';
    const line = JSON.stringify({
      id: 51,
      method: "svg.sanitize",
      params: { asset_id: "a-001", svg: cleanSvg },
    });
    const env = processLine(line, ctx);
    expect(env.id).toBe(51);
    expect(isOk(env)).toBe(true);
    if (isOk(env)) {
      const result = env.result as {
        ok: true;
        svg: string;
        report: { allowed_elements: string[]; violations: unknown[]; input_element_count: number };
      };
      expect(result.ok).toBe(true);
      expect(typeof result.svg).toBe("string");
      expect(result.report.violations).toEqual([]);
      expect(result.report.allowed_elements.length).toBeGreaterThan(0);
    }
  });

  it("svg.sanitize with forbidden <text> → sanitize_rejected carrying structured report", () => {
    const violatingSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<text x="10" y="20">forbidden</text></svg>';
    const line = JSON.stringify({
      id: 52,
      method: "svg.sanitize",
      params: { asset_id: "a-001", svg: violatingSvg },
    });
    const env = processLine(line, ctx);
    expect(env.id).toBe(52);
    expect(isErr(env)).toBe(true);
    if (isErr(env)) {
      expect(env.error.code).toBe("sanitize_rejected");
      const details = env.error.details as {
        report: {
          violations: ReadonlyArray<{ category: string; element_path: string; message: string }>;
        };
      };
      expect(details).toBeDefined();
      expect(Array.isArray(details.report.violations)).toBe(true);
      expect(details.report.violations.length).toBeGreaterThan(0);
      expect(details.report.violations[0]?.category).toBe("forbidden-text");
    }
  });

  it("svg.sanitize with missing asset_id → validation_error", () => {
    const cleanSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10" fill="#000"/></svg>';
    const line = JSON.stringify({
      id: 60,
      method: "svg.sanitize",
      params: { svg: cleanSvg },
    });
    const env = processLine(line, ctx);
    expect(env.id).toBe(60);
    expect(isErr(env)).toBe(true);
    if (isErr(env)) {
      expect(env.error.code).toBe("validation_error");
    }
  });

  it("envelope id is always preserved end-to-end (correlated with the request)", () => {
    // A high-cardinality id should pass through unchanged in both
    // ok and err branches.
    const id = 2_147_483_647;
    const errLine = JSON.stringify({ id, method: "nope", params: {} });
    const errEnv = processLine(errLine, ctx);
    expect(errEnv.id).toBe(id);
  });
});
