import type { ToolcraftProductModuleContribution } from "../../contract/contribution";
import { requireValidContribution } from "../../contract/contribution-validation";

export function validateContribution(contribution: ToolcraftProductModuleContribution): ToolcraftProductModuleContribution {
  switch (contribution.id) {
    case "svg-export.action":
      requireValidContribution(contribution.id,
        contribution.kind === "panel-action" && contribution.moduleId === "svg-export" && contribution.role === "export-svg");
      return contribution;
    default:
      throw new Error(`Unknown Toolcraft module contribution id "${contribution.id}".`);
  }
}
