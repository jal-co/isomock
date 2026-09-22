import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import { isToolcraftRuntimeOwnedTarget } from "../schema/runtime-targets";
import type {
  ToolcraftPerformanceSensitiveControl,
  ToolcraftUnclassifiedPerformanceControl,
} from "./performance-types";

export function collectToolcraftWorkloadControls(
  schema: ResolvedToolcraftAppSchema,
): ToolcraftPerformanceSensitiveControl[] {
  return (schema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.entries(section.controls)
      .filter(
        ([, control]) =>
          !isToolcraftRuntimeOwnedTarget(control.target) &&
          control.performanceRole === "workload",
      )
      .map(([controlId, control]) => ({
        control,
        controlId,
        target: control.target,
      })),
  );
}

export function collectToolcraftUnclassifiedPerformanceControls(
  schema: ResolvedToolcraftAppSchema,
): ToolcraftUnclassifiedPerformanceControl[] {
  return (schema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.entries(section.controls)
      .filter(
        ([, control]) =>
          control.type !== "panelActions" &&
          control.type !== "settingsTransfer" &&
          !isToolcraftRuntimeOwnedTarget(control.target) &&
          control.performanceRole !== "workload" &&
          control.performanceRole !== "responsiveness",
      )
      .map(([controlId, control]) => ({
        control,
        controlId,
        target: control.target,
      })),
  );
}
