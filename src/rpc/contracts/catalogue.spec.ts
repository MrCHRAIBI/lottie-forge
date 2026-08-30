import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CatalogRecipeSchema, JointCatalogueStyleSchema, KEYFRAME_SHAPES, RecipeCatalogueSchema, SHAPE_NAMES, TRIGGER_POINTS } from "./catalogue.schema.js";
import { loadRejectionCases } from "./rejection-cases.js";
import { RECIPE_IDS } from "./vocabulary.schema.js";

/**
 * Bilingual loading parity for the recipe catalogue (MOT-04, plan 02-04).
 *
 * The committed `fixtures/recipe-catalogue/catalogue.json` is read DIRECTLY
 * (§5.5.3 l.150) — no 3-artefact bridge for the catalogue itself. This spec
 * proves zero drift between the layers:
 *
 * 1. `RecipeCatalogueSchema.parse` accepts the committed file; the recipe
 *    order equals the canonical `RECIPE_IDS` tuple (loaders never reorder).
 * 2. The parsed model deep-equals the Python-exported artifact
 *    (`fixtures/bridge/catalogue.from-python.json`, written by
 *    `pytest tests/bridge/test_catalogue_bridge.py -k export`).
 * 3. Schema-key parity + tuple lockstep (KEYFRAME_SHAPES / SHAPE_NAMES /
 *    TRIGGER_POINTS) against `catalogue.schema-keys.json`.
 * 4. Local mutations prove the §5.5.3 superRefine invariants reject with
 *    the SAME paths as the Python collect-all validator (duplicate id at
 *    ["recipes", idx, "id"], pack duration at ["recipes", idx,
 *    "duration_ms"], ordered intensity at ["recipes", idx, "intensity_range"]).
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");
const COMMITTED = join(REPO_ROOT, "fixtures", "recipe-catalogue", "catalogue.json");
const FROM_PYTHON = join(REPO_ROOT, "fixtures", "bridge", "catalogue.from-python.json");
const SCHEMA_KEYS = join(REPO_ROOT, "fixtures", "bridge", "catalogue.schema-keys.json");

interface SchemaKeysPayload {
  model: string;
  keys: string[];
  recipe_keys: string[];
  keyframe_shapes: string[];
  shape_names: string[];
  trigger_points: string[];
}

describe("catalogue bilingual loading (MOT-04, §5.5.3)", () => {
  it("loads the committed catalogue.json directly, in canonical order", () => {
    const committed = JSON.parse(readFileSync(COMMITTED, "utf-8"));
    const catalogue = RecipeCatalogueSchema.parse(committed);

    expect(catalogue.recipes).toHaveLength(10);
    expect(catalogue.recipes.map((r) => r.id)).toEqual([...RECIPE_IDS]);
    // MOT-03: at least one theme anchor per recipe (field-level bound).
    for (const recipe of catalogue.recipes) {
      expect(recipe.theme_anchors.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("deep-equals the Python-exported artifact (zero drift)", () => {
    let fromPython: unknown;
    try {
      fromPython = JSON.parse(readFileSync(FROM_PYTHON, "utf-8"));
    } catch {
      throw new Error(
        `Bridge export artefact missing at ${FROM_PYTHON} -- run ` +
          "`python -m pytest tests/bridge/test_catalogue_bridge.py -k export` first.",
      );
    }
    const committed = JSON.parse(readFileSync(COMMITTED, "utf-8"));

    const parsedCommitted = RecipeCatalogueSchema.parse(committed);
    const parsedArtifact = RecipeCatalogueSchema.parse(fromPython);
    expect(parsedCommitted).toEqual(parsedArtifact);
  });

  it("matches schema keys and closed-set tuples with the Python side", () => {
    let keys: SchemaKeysPayload;
    try {
      keys = JSON.parse(readFileSync(SCHEMA_KEYS, "utf-8")) as SchemaKeysPayload;
    } catch {
      throw new Error(
        `Bridge export artefact missing at ${SCHEMA_KEYS} -- run ` +
          "`python -m pytest tests/bridge/test_catalogue_bridge.py -k export` first.",
      );
    }
    const committed = JSON.parse(readFileSync(COMMITTED, "utf-8"));
    const parsed = RecipeCatalogueSchema.parse(committed);

    expect(keys.model).toBe("RecipeCatalogue");
    expect(Object.keys(parsed).sort()).toEqual([...keys.keys].sort());
    expect(Object.keys(parsed.recipes[0]).sort()).toEqual([...keys.recipe_keys].sort());
    expect([...KEYFRAME_SHAPES]).toEqual(keys.keyframe_shapes);
    expect([...SHAPE_NAMES]).toEqual(keys.shape_names);
    expect([...TRIGGER_POINTS]).toEqual(keys.trigger_points);
  });

  it("rejects a duplicate recipe id at [recipes, idx, id] (superRefine mirror)", () => {
    const committed = JSON.parse(readFileSync(COMMITTED, "utf-8"));
    const mutated = {
      ...committed,
      recipes: committed.recipes.map((r: Record<string, unknown>, i: number) =>
        i === 1 ? { ...r, id: "fade" } : r,
      ),
    };
    const result = RecipeCatalogueSchema.safeParse(mutated);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("recipes.1.id");
    }
  });

  it("rejects a pack-range duration at [recipes, idx, duration_ms]", () => {
    const committed = JSON.parse(readFileSync(COMMITTED, "utf-8"));
    const mutated = {
      ...committed,
      recipes: committed.recipes.map((r: Record<string, unknown>, i: number) =>
        i === 3 ? { ...r, duration_ms: 500 } : r,
      ),
    };
    const result = RecipeCatalogueSchema.safeParse(mutated);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("recipes.3.duration_ms");
    }
  });

  it("rejects an unordered intensity_range at [recipes, idx, intensity_range]", () => {
    const committed = JSON.parse(readFileSync(COMMITTED, "utf-8"));
    const mutated = {
      ...committed,
      recipes: committed.recipes.map((r: Record<string, unknown>, i: number) =>
        i === 0 ? { ...r, intensity_range: [1.0, 0.2] } : r,
      ),
    };
    const result = RecipeCatalogueSchema.safeParse(mutated);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("recipes.0.intensity_range");
    }
  });

  it("rejects disco-spin and empty theme_anchors at the schema boundary", () => {
    const committed = JSON.parse(readFileSync(COMMITTED, "utf-8"));

    const disco = {
      ...committed,
      recipes: committed.recipes.map((r: Record<string, unknown>, i: number) =>
        i === 0 ? { ...r, id: "disco-spin" } : r,
      ),
    };
    expect(RecipeCatalogueSchema.safeParse(disco).success).toBe(false);

    const noAnchors = {
      ...committed,
      recipes: committed.recipes.map((r: Record<string, unknown>, i: number) =>
        i === 0 ? { ...r, theme_anchors: [] } : r,
      ),
    };
    const result = RecipeCatalogueSchema.safeParse(noAnchors);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("recipes.0.theme_anchors");
    }
    // CatalogRecipeSchema is exported and usable standalone.
    expect(CatalogRecipeSchema.safeParse(committed.recipes[0]).success).toBe(true);
  });
});

describe("D-17 joint load: easing cross-reference (catalogue + style)", () => {
  const committed = JSON.parse(readFileSync(COMMITTED, "utf-8"));

  function loadCommittedStyle(): unknown {
    // The style fixture envelope is exported by pytest -k export (plan 02-01).
    const envelopePath = join(REPO_ROOT, "fixtures", "bridge", "style-fixture.from-python.json");
    const envelope = JSON.parse(readFileSync(envelopePath, "utf-8")) as {
      style_sha256: string;
      spec: unknown;
    };
    return envelope.spec;
  }

  it("parses the committed pair green (10 easings over standard/entrance)", () => {
    const joint = JointCatalogueStyleSchema.parse({
      catalogue: committed,
      style: loadCommittedStyle(),
    });
    expect(joint.catalogue.recipes).toHaveLength(10);
    expect(joint.style.easing_curves.map((c) => c.name).sort()).toEqual(["entrance", "standard"]);
  });

  it("rejects an unknown easing at [catalogue, recipes, idx, easing] (MOT-04 parity)", () => {
    const mutatedCatalogue = {
      ...committed,
      recipes: committed.recipes.map((r: Record<string, unknown>, i: number) =>
        i === 0 ? { ...r, easing: "overshoot" } : r,
      ),
    };
    const result = JointCatalogueStyleSchema.safeParse({
      catalogue: mutatedCatalogue,
      style: loadCommittedStyle(),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("catalogue.recipes.0.easing");
    }
  });

  it("rejects entrance recipes when the style loses the entrance curve", () => {
    const style = loadCommittedStyle() as {
      easing_curves: Array<{ name: string; control_points: number[] }>;
    };
    const amputated = {
      ...style,
      easing_curves: style.easing_curves.filter((c) => c.name !== "entrance"),
    };
    const result = JointCatalogueStyleSchema.safeParse({
      catalogue: committed,
      style: amputated,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues.filter((issue) => issue.path.join(".").endsWith("easing"));
      // draw-on (4), bounce (2), scale-pop (6) reference entrance.
      // Path shape: ["catalogue", "recipes", idx, "easing"] -> idx = path[2].
      const offending = issues.map((issue) => issue.path[2] as number).sort((a, b) => a - b);
      expect(offending).toEqual([2, 4, 6]);
    }
  });
});

/**
 * Shared rejection harness (D-06/D-08) — mirror of the pytest suite
 * `tests/bridge/test_catalogue_bridge.py::test_catalogue_rejection_case`.
 *
 * Both suites consume `fixtures/rejection-cases/catalogue.json`: 15
 * intrinsic catalogue rejections, each payload = the full valid 10-recipe
 * catalogue with ONE mutation. Assertion rules (D-08): zod safeParse must
 * reject; each `expect_paths` entry must appear among the issue paths
 * (membership only — never message text). Literal-in-list mutations carry
 * the item index at the path tail, matching the pydantic v2 locs.
 */
describe("catalogue rejection harness (mirror of pytest)", () => {
  const cases = loadRejectionCases("catalogue");

  it.each(cases.map((c) => [c.case_id, c]))(
    "%s -> zod rejects the shared payload",
    (_caseId, c) => {
      const result = RecipeCatalogueSchema.safeParse(c.payload);
      expect(result.success).toBe(false);
      if (result.success) return; // narrow for TS

      const actualPaths = new Set(result.error.issues.map((issue) => JSON.stringify(issue.path)));
      for (const expected of c.expect_paths) {
        const key = JSON.stringify(expected);
        expect(actualPaths.has(key)).toBe(true);
      }
    },
  );
});
