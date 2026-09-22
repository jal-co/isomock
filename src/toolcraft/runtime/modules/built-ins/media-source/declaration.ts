import type { ToolcraftProductModuleContribution } from "../../contract/contribution";
import { requireValidContribution, hasExactTuple } from "../../contract/contribution-validation";
import { TOOLCRAFT_MEDIA_SOURCE_KINDS } from "../../contract/contribution";

export function validateContribution(contribution: ToolcraftProductModuleContribution): ToolcraftProductModuleContribution {
  switch (contribution.id) {
    case "media-source.policy":
      requireValidContribution(contribution.id,
        contribution.kind === "media-policy" && contribution.moduleId === "media-source" && contribution.policy === "source-workflow" && hasExactTuple(contribution.sourceKinds, TOOLCRAFT_MEDIA_SOURCE_KINDS));
      return contribution;
    case "media-source.persistence":
      requireValidContribution(contribution.id,
        contribution.kind === "persistence-requirement" && contribution.moduleId === "media-source" && contribution.slice === "media");
      return contribution;
    default:
      throw new Error(`Unknown Toolcraft module contribution id "${contribution.id}".`);
  }
}
