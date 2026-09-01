/**
 * forbid-text SVGO plugin — collector for SAN-01.
 *
 * Rejects `<text>` and `<tspan>` elements (SVG embedded text
 * glyphs — a hard-ban per SAN-01). The plugin only COLLECTS
 * violations into the closure-scoped `violations` array; it
 * never mutates the AST (P4 — never silently strip).
 *
 * **Pattern:** every gate plugin in `src/svg-sanitizer/plugins/`
 * returns a visitor that pushes `CollectedViolation` entries
 * into the same closure. The orchestrator (`sanitize.ts`) reads
 * the array after SVGO returns the optimized output.
 */

import type { CustomPlugin } from "svgo";
import type { CollectedViolation, ElementSnapshot } from "../constraint-report.js";

/**
 * Build the `forbid-text` SVGO plugin. Each call returns a
 * fresh plugin instance with its own closure-captured
 * `violations` array — the orchestrator owns the array and
 * passes it in.
 *
 * @param violations - the closure-scoped collector array the
 *                     orchestrator reads after the optimize pass.
 * @param rootPath  - the path prefix the orchestrator uses to
 *                    build breadcrumb-style element paths.
 */
export function forbidTextPlugin(violations: CollectedViolation[], rootPath = "svg"): CustomPlugin {
  return {
    name: "forbid-text",
    fn: () => ({
      element: {
        enter: (node) => {
          if (node.name === "text" || node.name === "tspan") {
            const snapshot: ElementSnapshot = {
              name: node.name,
              path: rootPath,
              attributes: node.attributes,
            };
            violations.push({
              category: "forbidden-text",
              element_path: snapshot.path,
              message: `<${node.name}> is forbidden (SAN-01) — text glyphs are not allowed; use a pre-rendered path`,
            });
          }
        },
      },
    }),
  };
}
