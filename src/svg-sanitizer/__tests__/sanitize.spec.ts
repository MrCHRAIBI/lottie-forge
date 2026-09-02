import { describe, expect, it } from "vitest";

import type { SanitizerViolationCategory } from "../../rpc/contracts/sanitizer.schema.js";
import { sanitizeSvg } from "../sanitize.js";

/**
 * Phase 3 plan 03-07 — adversarial rejection matrix
 * (SAN-01 / SAN-02 / SAN-05 + D-31 structural gates).
 *
 * Parametrized `it.each` matrix over hand-authored adversarial SVG
 * strings. Every case asserts the gate:
 *
 *   1. `sanitizeSvg` returns `ok=false` (the gate is total — no
 *      silent cleaning, no pass).
 *   2. The expected violation category appears in the report
 *      (`some(v => v.category === expected)`) — gate-level
 *      assertion, never message text (D-08 discipline).
 *   3. The result envelope carries `code = "sanitize_rejected"`
 *      or the schema-level `code = "validation_error"`.
 *
 * **Coverage matrix (16 adversarial + 1 control + 1 collect-all):**
 *
 * | # | case                | expected gate             | SAN id    |
 * |---|---------------------|---------------------------|-----------|
 * | 1 | text                | forbidden-text            | SAN-01    |
 * | 2 | tspan               | forbidden-text            | SAN-01    |
 * | 3 | image               | forbidden-raster          | SAN-02    |
 * | 4 | base64 data URI     | forbidden-data-uri        | SAN-02    |
 * | 5 | foreignObject       | forbidden-foreignobject   | SAN-05    |
 * | 6 | script              | forbidden-script          | SAN-05    |
 * | 7 | on* event handler   | forbidden-handler         | SAN-05    |
 * | 8 | javascript: URI     | forbidden-handler         | SAN-05    |
 * | 9 | external xlink:href | forbidden-xlink-href      | SAN-05    |
 * |10 | javascript: in xlink| forbidden-handler         | SAN-05    |
 * |11 | XML comment         | forbidden-comment         | D-31      |
 * |12 | data-* attribute    | forbidden-data-attribute   | D-31      |
 * |13 | root width/height   | forbidden-dimension       | D-22 / D-31|
 * |14 | prefixed element    | forbidden-namespace       | D-31      |
 * |15 | uppercase TEXT      | forbidden-element (list)  | D-31      |
 * |16 | unknown element     | forbidden-element (list)  | D-31      |
 * |17 | empty-string input  | validation_error          | SAN-01    |
 * |18 | CLEAN minimal svg   | (no violations)           | (control) |
 *
 * Plus a **collect-all proof** (case 19): a fixture violating two
 * gates simultaneously yields BOTH violations in one report
 * (P4: never first-fail; never silently strip).
 *
 * The asset_id `a-099` is a synthetic slot chosen so the
 * `stabilize-ids` assertion does not fire on any case (the test
 * fixtures carry no IDs).
 */

const ASSET_ID = "a-099";

const ROOT_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">`;
const ROOT_CLOSE = `</svg>`;

interface AdversarialCase {
  readonly caseId: string;
  readonly svg: string;
  readonly expected: SanitizerViolationCategory;
  readonly sanitized_code?: "sanitize_rejected" | "validation_error";
}

const ADVERSARIAL_CASES: ReadonlyArray<AdversarialCase> = [
  {
    caseId: "01-text-element",
    svg: `${ROOT_OPEN}<text x="10" y="20">hello</text>${ROOT_CLOSE}`,
    expected: "forbidden-text",
  },
  {
    caseId: "02-tspan-element",
    svg: `${ROOT_OPEN}<text><tspan>world</tspan></text>${ROOT_CLOSE}`,
    expected: "forbidden-text",
  },
  {
    caseId: "03-image-element",
    svg: `${ROOT_OPEN}<image href="x.png"/>${ROOT_CLOSE}`,
    expected: "forbidden-raster",
  },
  {
    caseId: "04-base64-data-uri",
    svg: `${ROOT_OPEN}<a href="data:image/png;base64,iVBORw0KGgo="><rect/></a>${ROOT_CLOSE}`,
    expected: "forbidden-data-uri",
  },
  {
    caseId: "05-foreign-object",
    svg: `${ROOT_OPEN}<foreignObject><div/></foreignObject>${ROOT_CLOSE}`,
    expected: "forbidden-foreignobject",
  },
  {
    caseId: "06-script-element",
    svg: `${ROOT_OPEN}<script>alert(1)</script>${ROOT_CLOSE}`,
    expected: "forbidden-script",
  },
  {
    caseId: "07-onclick-handler",
    svg: `${ROOT_OPEN}<rect onclick="alert(1)"/>${ROOT_CLOSE}`,
    expected: "forbidden-handler",
  },
  {
    caseId: "08-javascript-uri-href",
    svg: `${ROOT_OPEN}<a href="javascript:alert(1)"><rect/></a>${ROOT_CLOSE}`,
    expected: "forbidden-handler",
  },
  {
    caseId: "09-external-xlink-href",
    // The `use` element is also outside the D-31 allow-list —
    // the case asserts forbidden-xlink-href (defense-in-depth
    // proof: the URI gate fires AND the allow-list gate also
    // fires for the host element). The `xmlns:xlink`
    // declaration is required to make the XML parser accept
    // the prefixed attribute; it ALSO fires the
    // forbidden-attribute gate (defense in depth).
    svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 400 300"><use xlink:href="https://example.com/foo"/></svg>`,
    expected: "forbidden-xlink-href",
  },
  {
    caseId: "10-javascript-uri-xlink",
    // Same defense-in-depth shape as case 9: javascript: URI
    // through the xlink: prefix — both the URI gate and the
    // allow-list gate fire (the host element is outside the
    // closed 9-name set). The `xmlns:xlink` declaration
    // carries its own forbidden-attribute violation.
    svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 400 300"><a xlink:href="javascript:alert(1)"><rect/></a></svg>`,
    expected: "forbidden-handler",
  },
  {
    caseId: "11-xml-comment",
    svg: `${ROOT_OPEN}<!-- secret payload --><rect/>${ROOT_CLOSE}`,
    expected: "forbidden-comment",
  },
  {
    caseId: "12-data-attribute",
    svg: `${ROOT_OPEN}<rect data-foo="bar"/>${ROOT_CLOSE}`,
    expected: "forbidden-data-attribute",
  },
  {
    caseId: "13-root-width-and-height",
    svg: `${ROOT_OPEN.slice(0, -1)} width="400" height="300">${ROOT_CLOSE}`,
    expected: "forbidden-dimension",
  },
  {
    caseId: "14-prefixed-element",
    // `<xlink:rect>` is a foreign-namespace element. The
    // forbidden-namespace gate fires from the prefix; the
    // forbidden-element gate also fires (the prefixed name is
    // not in the closed allow-list). The case asserts the
    // namespace gate. The `xmlns:xlink` declaration carries
    // its own forbidden-attribute violation (defense in depth).
    svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 400 300"><xlink:rect/></svg>`,
    expected: "forbidden-namespace",
  },
  {
    caseId: "15-uppercase-text",
    // The case-variant of `<text>` — case-sensitive exact
    // name match against the allow-list. `forbid-text` does
    // NOT fire (its check is exact-name `text`, lowercase).
    // The allow-list gate fires via `forbidden-element` —
    // the proof of allow-list semantics (NOT blacklist).
    svg: `${ROOT_OPEN}<TEXT x="10" y="20">hello</TEXT>${ROOT_CLOSE}`,
    expected: "forbidden-element",
  },
  {
    caseId: "16-unknown-element",
    // A web-component-shaped name. Never in the allow-list;
    // the gate fires via `forbidden-element`. The proof:
    // there is no whitelist of "harmless" elements the gate
    // tolerates — anything outside the closed 9-name set is
    // rejected.
    svg: `${ROOT_OPEN}<web-component><rect/></web-component>${ROOT_CLOSE}`,
    expected: "forbidden-element",
  },
  {
    caseId: "17-empty-string-input",
    // SAN-01 empty edge — empty string input is a structured
    // `validation_error` (code at the envelope), not a pass,
    // not a thrown error.
    svg: "",
    expected: "forbidden-element",
    sanitized_code: "validation_error",
  },
];

describe("sanitizeSvg — adversarial rejection matrix (SAN-01/02/05 + D-31)", () => {
  it.each(ADVERSARIAL_CASES.map((c) => [c.caseId, c] as const))(
    "%s — returns ok=false with the expected violation category",
    (_caseId, c) => {
      let result: ReturnType<typeof sanitizeSvg>;
      try {
        result = sanitizeSvg({ asset_id: ASSET_ID, svg: c.svg });
      } catch (error) {
        throw new Error(
          `sanitizeSvg threw on adversarial input (${c.caseId}): ${(error as Error).message}`,
        );
      }
      // Gate is total — never a pass.
      expect(result.ok).toBe(false);
      if (result.ok) {
        // Narrowing guard for the type system.
        throw new Error(
          `sanitizeSvg passed an adversarial input (${c.caseId}) — the gate failed`,
        );
      }
      // The expected gate appears in the report (gate-level
      // assertion, never message text — D-08 discipline).
      const categories = new Set(result.report.violations.map((v) => v.category));
      expect(categories.has(c.expected)).toBe(true);
      // The result envelope carries the expected code.
      if (c.sanitized_code !== undefined) {
        expect(result.code).toBe(c.sanitized_code);
      } else {
        expect(result.code).toBe("sanitize_rejected");
      }
    },
  );
});

describe("sanitizeSvg — clean control proves the matrix teeth are selective", () => {
  it("CLEAN minimal svg: one g + one path, proper ids, title + desc + viewBox → ok=true with zero violations", () => {
    // A representative compiler-output: one component (primary-rect),
    // 2-segment group ID + 3-segment shape ID, the a-099 slot.
    const clean = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><title>Asset a-099 — fade</title><desc>Motion-compiled illustration for asset a-099 (recipe fade).</desc><g id="a-099_primary-rect"><rect id="a-099_primary-rect_primary" x="100" y="75" width="200" height="150" rx="25" fill="#1c57cb"/></g></svg>`;
    let result: ReturnType<typeof sanitizeSvg>;
    try {
      result = sanitizeSvg({ asset_id: ASSET_ID, svg: clean });
    } catch (error) {
      throw new Error(
        `sanitizeSvg threw on a clean control input: ${(error as Error).message}`,
      );
    }
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(
        `sanitizeSvg rejected a clean input: ${JSON.stringify(result.report.violations)}`,
      );
    }
    expect(result.report.violations).toEqual([]);
    // The D-31 allow-list hits are present (svg, title, desc, g, rect).
    expect(result.report.allowed_elements).toEqual(
      expect.arrayContaining(["desc", "g", "rect", "svg", "title"]),
    );
    // viewBox + title + desc survive the optimize pass (SAN-04).
    expect(result.svg).toContain("viewBox=");
    expect(result.svg).toContain("<title>");
    expect(result.svg).toContain("<desc>");
  });
});

describe("sanitizeSvg — collect-all proof (P4: never first-fail)", () => {
  it("a fixture violating two gates simultaneously yields BOTH violations in one report", () => {
    // `<text>` triggers the forbidden-text gate; the data-foo
    // attribute triggers the forbidden-data-attribute gate.
    // Both must appear in a single report — the gate never
    // first-fails, the gate never silently cleans.
    const twoGates = `${ROOT_OPEN}<text data-foo="bar">hello</text>${ROOT_CLOSE}`;
    const result = sanitizeSvg({ asset_id: ASSET_ID, svg: twoGates });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const categories = new Set(result.report.violations.map((v) => v.category));
    expect(categories.has("forbidden-text")).toBe(true);
    expect(categories.has("forbidden-data-attribute")).toBe(true);
    // Defense-in-depth: the allow-list gate ALSO fires (text
    // is outside the closed 9-name set) — the test asserts at
    // least the two named categories are present.
    expect(result.report.violations.length).toBeGreaterThanOrEqual(2);
  });

  it("an external xlink:href on a non-allow-listed element yields BOTH gates in one report", () => {
    // The host element `<use>` is outside the D-31 allow-list
    // (forbidden-element). The `xlink:href` URI is external
    // (forbidden-xlink-href). Both must be in the same report.
    // The `xmlns:xlink` declaration is required to make the
    // XML parser accept the prefixed attribute; it also fires
    // the forbidden-attribute gate.
    const twoGates = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 400 300"><use xlink:href="https://example.com/foo"/></svg>`;
    const result = sanitizeSvg({ asset_id: ASSET_ID, svg: twoGates });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const categories = new Set(result.report.violations.map((v) => v.category));
    expect(categories.has("forbidden-xlink-href")).toBe(true);
    expect(categories.has("forbidden-element")).toBe(true);
    expect(result.report.violations.length).toBeGreaterThanOrEqual(2);
  });
});
