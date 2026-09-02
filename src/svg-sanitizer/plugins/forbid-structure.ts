/**
 * forbid-structure SVGO plugin — collector for D-31.
 *
 * Rejects structural violations of the D-31 doctrine. The sanitizer's
 * gate is total: every element enter is compared against a closed
 * allow-list (D-31 / ADR-02), and the named structural violations
 * (comments, data-*, root width/height, prefixed namespaces) are
 * also collected.
 *
 * **Closed element allow-list (D-31 / SAN-01..05):**
 *
 * The compiler only emits the following element names (every shape
 * generator in `src/motion-compiler/shape-builder.ts` produces one of
 * these). Any element NOT in this set is a structural violation:
 *
 *     svg, title, desc, g, path, rect, ellipse, polyline, polygon
 *
 * The comparison is case-sensitive — `<TEXT>` (uppercase) is NOT in
 * the allow-list, because XML names are case-sensitive and the
 * compiler never emits uppercase. This is the proof of allow-list
 * semantics (NOT blacklist — there is no fallback list of "harmless"
 * elements the gate tolerates).
 *
 * **Attribute-level structural checks (D-31):**
 *
 * - `data-*` attributes are explicitly banned (D-31 doctrine:
 *   traceability lives in the manifest only; the SVG stays pure
 *   render identifiable by its IDs).
 * - `width` / `height` on the ROOT `<svg>` element only (D-22 —
 *   viewBox-only regime). Child elements like `<rect width="…">`
 *   carry width/height without violation.
 * - Prefixed elements / attributes (e.g. `xlink:rect`, `inkscape:label`)
 *   — D-31 single namespace doctrine. `xlink:href` and `href` are
 *   pass-through (they are checked by `forbid-foreignobject` for the
 *   URI scheme); other prefixed attributes are `forbidden-attribute`.
 * - XML comments are rejected (carry no semantic value, can leak data).
 *
 * The plugin only COLLECTS violations; it never mutates the AST
 * (P4 — never silently strip). It also populates a closure-scoped
 * `matchedAllowed` set the orchestrator uses to build the
 * `allowed_elements` field of `SanitizeReport`.
 */

import type { CustomPlugin } from "svgo";
import type { CollectedViolation } from "../constraint-report.js";

/**
 * D-31 closed allow-list of element names. Exactly what the
 * compiler emits (D-19 / D-31). Case-sensitive — the comparison
 * is exact-string against `node.name`. Nine elements — the set
 * is closed and the module-level guard below proves it.
 */
export const ALLOWED_ELEMENTS: ReadonlySet<string> = new Set([
  "svg",
  "title",
  "desc",
  "g",
  "path",
  "rect",
  "ellipse",
  "polyline",
  "polygon",
]);

/**
 * Module-level invariant: the allow-list is closed at exactly
 * nine element names (D-31). A future drift that adds or
 * removes a name fails the module evaluation before any consumer
 * instantiates (mirror of `vocabulary.schema.ts` lines 74-78).
 */
if (ALLOWED_ELEMENTS.size !== 9) {
  throw new Error(
    `D-31 allow-list must contain exactly 9 element names; got ${ALLOWED_ELEMENTS.size}`,
  );
}

/** Regex pattern matching `data-*` attribute names. */
const DATA_ATTRIBUTE_PATTERN = /^data-/i;

/** Regex pattern matching any prefixed attribute (`xlink:…`, `inkscape:…`). */
const PREFIXED_ATTRIBUTE_PATTERN = /^[a-z]+:/i;

/** Regex pattern matching any prefixed element (`xlink:rect`, etc.). */
const PREFIXED_ELEMENT_PATTERN = /^[a-z]+:/i;

/**
 * Build the `forbid-structure` SVGO plugin. Each call returns a
 * fresh plugin instance with its own closure-captured
 * `violations` array and `matchedAllowed` set.
 *
 * @param violations    - the closure-scoped collector array the
 *                        orchestrator reads after the optimize pass.
 * @param matchedAllowed - the closure-scoped Set populated with
 *                        every element name that fell inside the
 *                        closed allow-list (D-31). The orchestrator
 *                        converts the Set to a sorted array for the
 *                        public report.
 * @param rootPath      - the path prefix for breadcrumb paths.
 */
export function forbidStructurePlugin(
  violations: CollectedViolation[],
  matchedAllowed: Set<string> = new Set(),
  rootPath = "svg",
): CustomPlugin {
  return {
    name: "forbid-structure",
    fn: () => ({
      comment: {
        enter: () => {
          violations.push({
            category: "forbidden-comment",
            element_path: rootPath,
            message: `<!-- ... --> is forbidden (D-31) — XML comments are not part of the SVG byte contract`,
          });
        },
      },
      element: {
        enter: (node) => {
          // D-31 / ADR-02 — closed allow-list gate (case-sensitive
          // exact name match). Any element name outside the
          // 9-name set is a structural violation. This is the
          // gate that catches case variants (`<TEXT>`), unknown
          // elements (`<web-component>`), and any element the
          // compiler never emits.
          if (ALLOWED_ELEMENTS.has(node.name)) {
            matchedAllowed.add(node.name);
          } else {
            violations.push({
              category: "forbidden-element",
              element_path: rootPath,
              message: `<${node.name}> is not in the D-31 closed allow-list (svg, title, desc, g, path, rect, ellipse, polyline, polygon) — every element must be in the set the compiler can emit`,
            });
          }

          // Prefixed elements (anything with a namespace prefix
          // in the name) — D-31 single xmlns namespace.
          if (PREFIXED_ELEMENT_PATTERN.test(node.name)) {
            violations.push({
              category: "forbidden-namespace",
              element_path: rootPath,
              message: `<${node.name}> is forbidden (D-31) — single xmlns namespace only; no prefixed elements`,
            });
            return;
          }

          // width/height on the root <svg> only (D-22).
          if (node.name === "svg") {
            for (const dim of ["width", "height"]) {
              if (node.attributes[dim] !== undefined) {
                violations.push({
                  category: "forbidden-dimension",
                  element_path: rootPath,
                  message: `<svg ${dim}="…"> is forbidden (D-22) — viewBox-only regime; remove ${dim}`,
                });
              }
            }
          }

          // data-* attributes (D-31 explicit ban).
          // Prefixed attributes (single-namespace doctrine).
          for (const attrName of Object.keys(node.attributes)) {
            if (DATA_ATTRIBUTE_PATTERN.test(attrName)) {
              violations.push({
                category: "forbidden-data-attribute",
                element_path: rootPath,
                message: `<${node.name} ${attrName}="…"> is forbidden (D-31) — data-* attributes are not allowed`,
              });
            } else if (PREFIXED_ATTRIBUTE_PATTERN.test(attrName)) {
              // Allow `xlink:href` / `href` rejection covered by
              // forbid-foreignobject — that collector emits
              // `forbidden-xlink-href` for the specific external
              // URI case. Other prefixed attributes are banned
              // generically here.
              if (attrName !== "xlink:href" && attrName !== "href") {
                violations.push({
                  category: "forbidden-attribute",
                  element_path: rootPath,
                  message: `<${node.name} ${attrName}="…"> is forbidden (D-31) — single xmlns namespace only; no prefixed attributes`,
                });
              }
            }
          }
        },
      },
    }),
  };
}
