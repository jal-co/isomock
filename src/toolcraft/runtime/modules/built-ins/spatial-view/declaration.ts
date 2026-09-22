import type { ToolcraftProductModuleContribution } from "../../contract/contribution";
import { requireValidContribution, hasExactTuple } from "../../contract/contribution-validation";
import { TOOLCRAFT_SPATIAL_VIEW_OPERATIONS } from "../../contract/contribution";

export function validateContribution(contribution: ToolcraftProductModuleContribution): ToolcraftProductModuleContribution {
  switch (contribution.id) {
    case "spatial-view.behavior":
      requireValidContribution(contribution.id,
        contribution.kind === "canvas-behavior" && contribution.moduleId === "spatial-view" && contribution.behavior === "spatial-view" && hasExactTuple(contribution.operations, TOOLCRAFT_SPATIAL_VIEW_OPERATIONS));
      return contribution;
    default:
      throw new Error(`Unknown Toolcraft module contribution id "${contribution.id}".`);
  }
}
