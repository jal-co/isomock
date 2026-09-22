import type { ToolcraftPipelineInteraction } from "./performance-types";
import type { ToolcraftPerformanceProfileName } from "./performance-workload-types";
import { getToolcraftPerformanceProfileForInteractionId } from "./performance-path-codec.mjs";

export function getToolcraftPerformanceProfileForInteraction(
  interaction: ToolcraftPipelineInteraction,
): ToolcraftPerformanceProfileName {
  return getToolcraftPerformanceProfileForInteractionId(interaction);
}
