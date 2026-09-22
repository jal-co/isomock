import {
  assembleToolcraftModuleContributions,
  TOOLCRAFT_CONTRIBUTION_PHASE_TABLE,
  type ResolvedToolcraftModuleContributions,
} from "./assemble-module-contributions";
import type { ToolcraftProductModuleContribution } from "../../contract/contribution";
import { preflightToolcraftModuleContributions } from "./preflight-module-contributions";

export type { ResolvedToolcraftModuleContributions } from "./assemble-module-contributions";

export const resolveToolcraftModuleContributions = (
  contributions: readonly ToolcraftProductModuleContribution[],
  validateContribution: (contribution: ToolcraftProductModuleContribution) => ToolcraftProductModuleContribution,
): ResolvedToolcraftModuleContributions => {
  const preflight = preflightToolcraftModuleContributions(contributions, validateContribution);
  return assembleToolcraftModuleContributions(
    preflight,
    TOOLCRAFT_CONTRIBUTION_PHASE_TABLE,
  );
};
