import type { ToolcraftProductModuleContribution } from "../../contract/contribution";
import { requireValidContribution } from "../../contract/contribution-validation";

export function validateContribution(contribution: ToolcraftProductModuleContribution): ToolcraftProductModuleContribution {
  switch (contribution.id) {
    case "timeline.surface":
      requireValidContribution(contribution.id,
        contribution.kind === "panel-surface" && contribution.moduleId === "timeline" && contribution.surface === "timeline");
      return {
        ...contribution, configuration: {
          ...(contribution.configuration.defaultDurationSeconds === undefined ? {} : { defaultDurationSeconds: contribution.configuration.defaultDurationSeconds }),
          ...(contribution.configuration.enabled === undefined ? {} : { enabled: contribution.configuration.enabled }),
          ...(contribution.configuration.mode === undefined ? {} : { mode: contribution.configuration.mode }),
        }
      };
    case "timeline.persistence":
      requireValidContribution(contribution.id,
        contribution.kind === "persistence-requirement" && contribution.moduleId === "timeline" && contribution.slice === "timeline");
      return contribution;
    default:
      throw new Error(`Unknown Toolcraft module contribution id "${contribution.id}".`);
  }
}
