import type { ToolcraftProductModuleContribution } from "../../contract/contribution";
import { requireValidContribution } from "../../contract/contribution-validation";
import { TOOLCRAFT_MAX_MASKS, toolcraftMaskTargets } from "./contracts";

export function validateContribution(contribution: ToolcraftProductModuleContribution): ToolcraftProductModuleContribution {
  requireValidContribution(contribution.id, contribution.id === "masks.settings" && contribution.kind === "control-section" && contribution.moduleId === "masks" && contribution.placement.slot === "product-settings");
  if (contribution.id !== "masks.settings") throw new Error("Invalid masks contribution.");
  const { items, apply, show } = contribution.section.controls;
  requireValidContribution(contribution.id, items?.type === "collectionActions" && items.target === toolcraftMaskTargets.items && items.identityField === "id" && items.selectionTarget === toolcraftMaskTargets.selection && items.hardMaxItems === TOOLCRAFT_MAX_MASKS && apply?.target === toolcraftMaskTargets.apply && show?.target === toolcraftMaskTargets.show);
  return contribution;
}
