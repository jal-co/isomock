import type { ResolvedToolcraftAppSchema } from "@/toolcraft/runtime";

import {
  getToolcraftControlSectionInventoryStructureErrors,
  getToolcraftSectionInventoryById,
} from "./control-section-inventory-structure";
import { getToolcraftControlSelectorInventoryErrors } from "./control-selector-inventory";
import type { ToolcraftControlSectionInventoryEntry } from "./types";

export { getToolcraftSectionInventoryById };

export function getToolcraftControlSectionInventoryErrors(
  schema: ResolvedToolcraftAppSchema,
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[],
): string[] {
  return [
    ...getToolcraftControlSectionInventoryStructureErrors(
      schema,
      sectionInventory,
    ),
    ...getToolcraftControlSelectorInventoryErrors(schema, sectionInventory),
  ];
}
