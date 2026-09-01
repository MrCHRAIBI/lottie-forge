/**
 * forbid-structure SVGO plugin — collector for D-31.
 *
 * Rejects structural violations of the D-31 doctrine (the
 * sanitizer's gate accepts `<title>`, `<desc>`, and the root
 * `<svg>`; everything else is either explicitly forbidden or
 * belongs to the named allow-list):
 *
 * - `<comment>` nodes — XML comments carry no semantic value to
 *   the SVG renderer and can leak data; rejected.
 * - `data-*` attributes — D-31 doctrine explicitly bans these.
 * - `width` / `height` on the **root** `<svg>` element — D-22
 *   viewBox-only regime (responsive garanti).
 * - Prefixed elements / attributes (e.g. `xlink:rect`,
 *   `inkscape:label`) — D-31 single namespace (`xmlns` only;
 *   no `xmlns:xlink`).
 *
 * The plugin only COLLECTS violations; it never mutates the AST
 * (P4 — never silently strip).
 */

import type { CustomPlugin } from "svgo";
import type { CollectedViolation } from "../constraint-report.js";

/** Regex pattern matching `data-*` attribute names. */
const DATA_ATTRIBUTE_PATTERN = /^data-/i;

/** Regex pattern matching any prefixed attribute (`xlink:…`, `inkscape:…`). */
const PREFIXED_ATTRIBUTE_PATTERN = /^[a-z]+:/i;

/** Regex pattern matching any prefixed element (`xlink:rect`, etc.). */
const PREFIXED_ELEMENT_PATTERN = /^[a-z]+:/i;

/**
 * Build the `forbid-structure` SVGO plugin. Each call returns a
 * fresh plugin instance with its own closure-captured
 * `violations` array.
 *
 * @param violations - the closure-scoped collector array the
 *                     orchestrator reads after the optimize pass.
 * @param rootPath  - the path prefix for breadcrumb paths.
 */
export function forbidStructurePlugin(
  violations: CollectedViolation[],
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
          // Prefixed elements (anything with a namespace prefix
          // in the name).
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
