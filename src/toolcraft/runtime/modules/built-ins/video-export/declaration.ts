import type { ToolcraftProductModuleContribution } from "../../contract/contribution";
import { requireValidContribution } from "../../contract/contribution-validation";
import { TOOLCRAFT_ARTIFACT_SETTINGS_PERFORMANCE_ROLES } from "../../contract/contribution";
import { hasCanonicalControlRoles } from "../../contract/control-section-validation";

export function validateContribution(contribution: ToolcraftProductModuleContribution): ToolcraftProductModuleContribution {
  switch (contribution.id) {
    case "video-export.action":
      requireValidContribution(contribution.id,
        contribution.kind === "panel-action" && contribution.moduleId === "video-export" && contribution.role === "export-video");
      return contribution;
    case "video-export.settings":
      requireValidContribution(contribution.id,
        contribution.kind === "control-section" && contribution.moduleId === "video-export" && contribution.placement?.slot === "artifact-settings" && hasCanonicalControlRoles(contribution.section?.controls, TOOLCRAFT_ARTIFACT_SETTINGS_PERFORMANCE_ROLES["video-export.settings"]));
      return contribution;
    default:
      throw new Error(`Unknown Toolcraft module contribution id "${contribution.id}".`);
  }
}
