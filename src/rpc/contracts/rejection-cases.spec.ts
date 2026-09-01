import { describe, expect, it } from "vitest";
import { assertRejectionEntryShape, loadRejectionCases } from "./rejection-cases.js";

/**
 * Shape-guard suite for the shared rejection-case loader (IN-07, D-06).
 *
 * The loader must fail LOUD when a fixture entry is missing a required
 * field (`case_id`, `ref`, `model`, `payload`) -- most critically
 * `payload`: a `Schema.safeParse(undefined)` on a payload-less entry
 * "rejects" and would make the `must be rejected` assertion pass
 * vacuously, while the Python loader (`tests/bridge/rejection_loader.py`)
 * raises `KeyError` at load time. One source, zero drift -- including
 * failure modes.
 *
 * The guard is exercised directly (unit) because the committed fixture
 * files are locked data: no malformed fixture is ever committed to
 * exercise the rejection path. Each `toThrow` test fails if the guard is
 * removed or neutered; the `loadRejectionCases` sweep pins non-vacuity
 * (the real committed files still load, with every entry shape-valid).
 */

const BASE_ENTRY = { case_id: "x", ref: "example-style@1.0.0", model: "StyleSpec" };

describe("rejection-case loader shape guard (IN-07)", () => {
  it("throws on an entry without payload (vacuous-green guard)", () => {
    expect(() => assertRejectionEntryShape({ ...BASE_ENTRY }, "asset-spec.json")).toThrow(
      /payload/,
    );
  });

  it("throws on a null payload", () => {
    expect(() =>
      assertRejectionEntryShape({ ...BASE_ENTRY, payload: null }, "asset-spec.json"),
    ).toThrow(/payload/);
  });

  it("throws on a non-object payload", () => {
    expect(() =>
      assertRejectionEntryShape({ ...BASE_ENTRY, payload: "nope" }, "asset-spec.json"),
    ).toThrow(/payload/);
  });

  it("throws when case_id is missing", () => {
    expect(() =>
      assertRejectionEntryShape(
        { ref: "example-style@1.0.0", model: "StyleSpec", payload: {} },
        "asset-spec.json",
      ),
    ).toThrow(/case_id/);
  });

  it("throws when model is missing", () => {
    expect(() =>
      assertRejectionEntryShape(
        { case_id: "x", ref: "example-style@1.0.0", payload: {} },
        "asset-spec.json",
      ),
    ).toThrow(/model/);
  });

  it("accepts a well-formed entry without the optional expect_paths", () => {
    expect(() =>
      assertRejectionEntryShape({ ...BASE_ENTRY, payload: {} }, "asset-spec.json"),
    ).not.toThrow();
  });

  it("loads every committed fixture with non-empty, shape-valid cases", () => {
    // Non-vacuity: the real committed files still load through the
    // guarded loader -- the guard must never reject the shipped data.
    for (const contract of [
      "asset-spec",
      "pack-manifest",
      "style-refinement",
      "catalogue",
      "render-spec",
      "lottie-json",
    ]) {
      const cases = loadRejectionCases(contract);
      expect(cases.length).toBeGreaterThan(0);
      for (const c of cases) {
        expect(c.case_id).toBeTruthy();
        expect(typeof c.payload).toBe("object");
      }
    }
  });
});
