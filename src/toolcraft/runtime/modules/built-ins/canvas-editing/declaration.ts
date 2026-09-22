import type { ToolcraftProductModuleContribution } from "../../contract/contribution";
import { requireValidContribution, hasExactTuple } from "../../contract/contribution-validation";
import { TOOLCRAFT_CANVAS_EDITING_OPERATIONS } from "../../contract/contribution";

export function validateContribution(contribution: ToolcraftProductModuleContribution): ToolcraftProductModuleContribution {
  switch (contribution.id) {
    case "canvas-editing.behavior":
      requireValidContribution(contribution.id,
        contribution.kind === "canvas-behavior" && contribution.moduleId === "canvas-editing" && contribution.behavior === "editing" && hasExactTuple(contribution.operations, TOOLCRAFT_CANVAS_EDITING_OPERATIONS));
      return contribution;
    default:
      throw new Error(`Unknown Toolcraft module contribution id "${contribution.id}".`);
  }
}
