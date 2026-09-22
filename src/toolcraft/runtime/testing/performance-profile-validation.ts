import { getToolcraftPerformanceProfile } from "../performance/profile-catalog";
import { getToolcraftPerformanceProfileForInteraction } from "./performance-interaction-policy";
import type { ToolcraftPerformancePath } from "./performance-path-model";

export function getToolcraftPerformanceProfileErrors(
  paths: readonly ToolcraftPerformancePath[],
): string[] {
  return paths.flatMap((path) => {
    const expectedProfile = getToolcraftPerformanceProfileForInteraction(
      path.interaction,
    );
    getToolcraftPerformanceProfile(expectedProfile);
    return path.profile === expectedProfile
      ? []
      : [
          `Performance path "${path.id}" interaction ${path.interaction} requires central profile ${expectedProfile}, received ${path.profile}.`,
        ];
  });
}
