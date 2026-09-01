/**
 * forbid-foreignobject SVGO plugin — collector for SAN-05.
 *
 * Rejects the security-surface SVGO elements + attributes:
 *
 * - `<foreignObject>` — embedded HTML/JS can execute in the host
 *   page (SAN-05, XSS via SVG).
 * - `<script>` — script execution.
 * - Event-handler attributes (`onclick`, `onload`, etc.) — script
 *   execution triggered by user interaction.
 * - `javascript:` URIs in `xlink:href` / `href` — script
 *   execution via URI scheme.
 * - External `xlink:href` URIs (http://, https://, ftp://) —
 *   external resource loading (SAN-05: "xlink:href externe").
 *
 * The plugin only COLLECTS violations into the closure-scoped
 * `violations` array; it never mutates the AST (P4 — never
 * silently strip).
 */

import type { CustomPlugin } from "svgo";
import type { CollectedViolation } from "../constraint-report.js";

/** Regex pattern matching any external URI scheme. */
const EXTERNAL_URI_PATTERN = /^(https?|ftp):\/\//i;

/** Regex pattern matching the `javascript:` URI scheme. */
const JAVASCRIPT_URI_PATTERN = /^javascript:/i;

/** Regex pattern matching any `on*` event-handler attribute name. */
const EVENT_HANDLER_PATTERN = /^on[a-z]+$/i;

/**
 * Build the `forbid-foreignobject` SVGO plugin. Each call
 * returns a fresh plugin instance with its own closure-captured
 * `violations` array.
 *
 * @param violations - the closure-scoped collector array the
 *                     orchestrator reads after the optimize pass.
 * @param rootPath  - the path prefix for breadcrumb paths.
 */
export function forbidForeignObjectPlugin(
  violations: CollectedViolation[],
  rootPath = "svg",
): CustomPlugin {
  return {
    name: "forbid-foreignobject",
    fn: () => ({
      element: {
        enter: (node) => {
          // Forbidden elements.
          if (node.name === "foreignObject") {
            violations.push({
              category: "forbidden-foreignobject",
              element_path: rootPath,
              message: `<foreignObject> is forbidden (SAN-05) — embedded HTML can execute in the host page`,
            });
            return;
          }
          if (node.name === "script") {
            violations.push({
              category: "forbidden-script",
              element_path: rootPath,
              message: `<script> is forbidden (SAN-05) — script execution is never allowed`,
            });
            return;
          }

          // Forbidden attribute patterns.
          for (const [attrName, attrValue] of Object.entries(node.attributes)) {
            // Event handlers — `onclick`, `onload`, etc.
            if (EVENT_HANDLER_PATTERN.test(attrName)) {
              violations.push({
                category: "forbidden-handler",
                element_path: rootPath,
                message: `<${node.name} ${attrName}="…"> is forbidden (SAN-05) — event handlers can execute script`,
              });
              continue;
            }
            // `javascript:` URIs.
            if (typeof attrValue === "string" && JAVASCRIPT_URI_PATTERN.test(attrValue.trim())) {
              violations.push({
                category: "forbidden-handler",
                element_path: rootPath,
                message: `<${node.name} ${attrName}="javascript:…"> is forbidden (SAN-05) — javascript: URIs execute script`,
              });
              continue;
            }
            // External URIs in `xlink:href` / `href`.
            if (attrName === "xlink:href" || attrName === "href") {
              if (typeof attrValue === "string" && EXTERNAL_URI_PATTERN.test(attrValue.trim())) {
                violations.push({
                  category: "forbidden-xlink-href",
                  element_path: rootPath,
                  message: `<${node.name} ${attrName}="${attrValue.slice(0, 32)}…"> is forbidden (SAN-05) — external URIs are not allowed`,
                });
              }
            }
          }
        },
      },
    }),
  };
}
