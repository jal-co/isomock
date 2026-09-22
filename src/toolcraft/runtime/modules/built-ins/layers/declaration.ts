import type { ToolcraftProductModuleContribution } from "../../contract/contribution";
import { requireValidContribution } from "../../contract/contribution-validation";

export function validateContribution(contribution: ToolcraftProductModuleContribution): ToolcraftProductModuleContribution {
  switch (contribution.id) {
    case "layers.surface":
      requireValidContribution(contribution.id,
        contribution.kind === "panel-surface" && contribution.moduleId === "layers" && contribution.surface === "layers" && contribution.configuration === true);
      return contribution;
    case "layers.persistence":
      requireValidContribution(contribution.id,
        contribution.kind === "persistence-requirement" && contribution.moduleId === "layers" && contribution.slice === "layers");
      return contribution;
    default:
      throw new Error(`Unknown Toolcraft module contribution id "${contribution.id}".`);
  }
}
