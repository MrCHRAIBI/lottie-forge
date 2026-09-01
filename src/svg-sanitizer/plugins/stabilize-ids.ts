/**
 * stabilize-ids SVGO plugin — ID-scheme ASSERTER for D-32.
 *
 * The plugin does NOT rewrite IDs (the SVGO `cleanupIds` plugin
 * is explicitly disabled in the locked config, §6.4.2). It
 * records violations whenever an ID does not match the 2/3
 * segment scheme:
 *
 * - `<g>` component elements: 2 segments `${asset_id}_${component}`.
 * - Shape elements (`<rect>`, `<ellipse>`, …) inside a `<g>`:
 *   3 segments `${asset_id}_${component}_${role}` — the prefix
 *   MUST equal the parent `<g>`'s ID + `_${role}`.
 *
 * The plugin reads `asset_id` from a closure-captured variable
 * — the orchestrator passes the asset_id at plugin build time.
 *
 * If the parent `<g>` is missing, the plugin still records the
 * shape's ID as `id-mismatch` (the structural rule is that
 * every shape ID begins with the asset_id prefix).
 */

import type { CustomPlugin, XastElement } from "svgo";
import type { CollectedViolation } from "../constraint-report.js";

/**
 * Pattern: a stable shape ID is exactly 3 segments joined by `_`.
 *   `${asset_id}_${component}_${role}`
 *
 * The asset_id pattern is `^a-\d{3}$` (from
 * `asset-spec.schema.ts`); the segments inside the ID must not
 * themselves contain underscores (the D-32 simple-split rule).
 */
const ASSET_ID_PATTERN = /^a-\d{3}$/;

/**
 * Build the `stabilize-ids` SVGO plugin. Each call returns a
 * fresh plugin instance with its own closure-captured
 * `violations` array.
 *
 * @param violations - the closure-scoped collector array the
 *                     orchestrator reads after the optimize pass.
 * @param assetId   - the asset_id the sanitizer is validating
 *                    against (Phase 3 fixtures are 1:1, asset_id
 *                    is a string from the SanitizeRequest).
 */
export function stabilizeIdsPlugin(
  violations: CollectedViolation[],
  assetId: string,
): CustomPlugin {
  return {
    name: "stabilize-ids",
    fn: () => {
      // Track the parent `<g>` ID so shape elements can assert
      // the prefix match.
      let parentGroupId: string | null = null;

      return {
        element: {
          enter: (node: XastElement) => {
            const id = node.attributes.id;
            if (id === undefined) return;

            // The asset_id is the ID's first segment; we assert
            // every ID begins with the asset_id prefix.
            if (!id.startsWith(`${assetId}_`)) {
              violations.push({
                category: "id-mismatch",
                element_path: node.name,
                message: `<${node.name} id="${id}"> does not start with asset_id prefix "${assetId}_" (D-32)`,
              });
              return;
            }

            if (node.name === "g") {
              // 2-segment rule for `<g>`: `${asset_id}_${component}`.
              const segments = id.split("_");
              if (segments.length !== 2 || segments[0] !== assetId) {
                violations.push({
                  category: "id-mismatch",
                  element_path: node.name,
                  message: `<g id="${id}"> must carry 2 segments "${assetId}_${"{component}"}" (D-32)`,
                });
                return;
              }
              parentGroupId = id;
              return;
            }

            // Shape element — assert the 3-segment scheme.
            // `parentGroupId` is the ID of the enclosing `<g>`.
            if (parentGroupId === null) {
              violations.push({
                category: "id-mismatch",
                element_path: node.name,
                message: `<${node.name} id="${id}"> has no enclosing <g> — every shape element must live inside a 2-segment <g> (D-32)`,
              });
              return;
            }

            // Shape ID = parentGroupId + `_${role}` ⇒ 3 segments
            // total, prefix-equal to parentGroupId.
            if (!id.startsWith(`${parentGroupId}_`)) {
              violations.push({
                category: "id-mismatch",
                element_path: node.name,
                message: `<${node.name} id="${id}"> does not begin with parent <g> id "${parentGroupId}_" (D-32)`,
              });
              return;
            }

            const segments = id.split("_");
            if (segments.length !== 3 || segments[0] !== assetId) {
              violations.push({
                category: "id-mismatch",
                element_path: node.name,
                message: `<${node.name} id="${id}"> must carry 3 segments "${assetId}_${"{component}"}_${"{role}"}" (D-32)`,
              });
              return;
            }

            // Validate that asset_id itself matches the expected
            // pattern (D-32: `^a-\d{3}$`).
            if (!ASSET_ID_PATTERN.test(assetId)) {
              violations.push({
                category: "id-mismatch",
                element_path: node.name,
                message: `asset_id "${assetId}" does not match the locked pattern ^a-\\d{3}$ (D-32)`,
              });
            }
          },
          exit: (node: XastElement) => {
            // Restore `parentGroupId` when leaving a `<g>`.
            if (node.name === "g") {
              parentGroupId = null;
            }
          },
        },
      };
    },
  };
}
