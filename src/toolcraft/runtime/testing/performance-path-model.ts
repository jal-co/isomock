import type {
  ToolcraftPipelineInteraction,
  ToolcraftRenderPassRunLocation,
} from "./performance-types";
import type { ToolcraftPerformanceProfileName } from "./performance-workload-types";

export type ToolcraftPerformancePath = {
  id: string;
  interaction: ToolcraftPipelineInteraction;
  invalidates: readonly string[];
  preparationInvalidates: readonly string[];
  profile: ToolcraftPerformanceProfileName;
  retainedAccesses: readonly string[];
  runsOn: readonly ToolcraftRenderPassRunLocation[];
  targets: readonly string[];
  workloadDimensions: readonly string[];
};
