import type { ToolcraftUserRequestEvidence } from "./user-request-evidence";
import type { ToolcraftControlSectionInventoryEntry } from "./types";

/** An explicitly requested application mode; ordinary entity selectors stay local. */
export type ToolcraftProductModeIntent = Readonly<{
  request: ToolcraftUserRequestEvidence;
  /** Controls independent of this mode, including controls gated by local selectors. */
  sharedTargets: readonly string[];
}>;

export function getToolcraftProductModeTargets(
  inventory: readonly ToolcraftControlSectionInventoryEntry[],
): ReadonlySet<string> {
  return new Set(inventory.flatMap((section) =>
    (Array.isArray(section.finiteSelectors) ? section.finiteSelectors : [])
      .filter((selector) => selector?.role === "branch" && selector.productMode !== undefined)
      .map((selector) => selector.target),
  ));
}
