/**
 * forbid-raster SVGO plugin — collector for SAN-02.
 *
 * Rejects raster embeds (`<image>` element + any `data:` URI
 * referencing base64-encoded payloads). The plugin only COLLECTS
 * violations into the closure-scoped `violations` array; it
 * never mutates the AST (P4 — never silently strip).
 */

import type { CustomPlugin } from "svgo";
import type { CollectedViolation } from "../constraint-report.js";

/** Regex pattern matching base64-encoded data URIs. */
const BASE64_DATA_URI_PATTERN = /^data:[^;]*;base64,/i;

/**
 * Build the `forbid-raster` SVGO plugin. Each call returns a
 * fresh plugin instance with its own closure-captured
 * `violations` array.
 *
 * @param violations - the closure-scoped collector array the
 *                     orchestrator reads after the optimize pass.
 * @param rootPath  - the path prefix for breadcrumb paths.
 */
export function forbidRasterPlugin(
  violations: CollectedViolation[],
  rootPath = "svg",
): CustomPlugin {
  return {
    name: "forbid-raster",
    fn: () => ({
      element: {
        enter: (node) => {
          if (node.name === "image") {
            violations.push({
              category: "forbidden-raster",
              element_path: rootPath,
              message: `<image> is forbidden (SAN-02) — raster embeds are not allowed; lottie-forge emits vector-only assets`,
            });
            return;
          }
          // Any element carrying a `xlink:href` or `href` attribute
          // that points to a base64 data URI is a raster embed.
          for (const attrName of ["xlink:href", "href"]) {
            const attrValue = node.attributes[attrName];
            if (typeof attrValue === "string" && BASE64_DATA_URI_PATTERN.test(attrValue)) {
              violations.push({
                category: "forbidden-data-uri",
                element_path: rootPath,
                message: `<${node.name} ${attrName}="data:…;base64,…"> is forbidden (SAN-02) — base64 data URIs are not allowed`,
              });
              return;
            }
          }
        },
      },
    }),
  };
}
