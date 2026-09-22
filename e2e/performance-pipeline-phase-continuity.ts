import type { ToolcraftPerformancePath } from "@/toolcraft/runtime";

import {
  TOOLCRAFT_PERFORMANCE_PIPELINE_METRIC_KEYS,
  type ToolcraftPerformancePipelineEvidence,
  type ToolcraftPerformancePipelineSnapshot,
} from "../src/app/test-evidence/browser-performance-contract";
import { pipelinePassMap } from "./performance-pipeline-invariants";

function snapshotsPreservePreparedBoundary(
  left: ToolcraftPerformancePipelineSnapshot,
  right: ToolcraftPerformancePipelineSnapshot,
  preparationPassIds: ReadonlySet<string>,
  retainedAccessPassIds: ReadonlySet<string>,
): boolean {
  if (left.disposed !== right.disposed || left.runtimeId !== right.runtimeId ||
    left.passes.length !== right.passes.length) return false;
  const rightByPass = pipelinePassMap(right);
  return left.passes.every((leftPass) => {
    const rightPass = rightByPass.get(leftPass.passId);
    if (!rightPass) return false;
    if (preparationPassIds.has(leftPass.passId)) {
      return TOOLCRAFT_PERFORMANCE_PIPELINE_METRIC_KEYS.every((key) =>
        key === "activeResources" || leftPass[key] <= rightPass[key]);
    }
    if (retainedAccessPassIds.has(leftPass.passId)) {
      return TOOLCRAFT_PERFORMANCE_PIPELINE_METRIC_KEYS.every((key) =>
        key === "cacheHits" ? leftPass[key] <= rightPass[key] : leftPass[key] === rightPass[key]);
    }
    return TOOLCRAFT_PERFORMANCE_PIPELINE_METRIC_KEYS.every(
      (key) => leftPass[key] === rightPass[key]);
  });
}

export function getPipelinePhaseContinuityErrors({ cold, path, sustained, warm }: {
  cold: ToolcraftPerformancePipelineEvidence;
  path: ToolcraftPerformancePath;
  sustained: ToolcraftPerformancePipelineEvidence;
  warm: ToolcraftPerformancePipelineEvidence;
}): string[] {
  if (path.interaction === "initial-render") return [];
  const preparationPassIds = new Set([...path.invalidates, ...path.preparationInvalidates]);
  const retainedAccessPassIds = new Set(path.retainedAccesses);
  const errors: string[] = [];
  if (!snapshotsPreservePreparedBoundary(cold.after, warm.before,
    preparationPassIds, retainedAccessPassIds)) {
    errors.push(`Path "${path.id}" must preserve monotonic pipeline counters across prepared phase boundary cold.after to warm.before.`);
  }
  if (!snapshotsPreservePreparedBoundary(warm.after, sustained.before,
    preparationPassIds, retainedAccessPassIds)) {
    errors.push(`Path "${path.id}" must preserve monotonic pipeline counters across prepared phase boundary warm.after to sustained.before.`);
  }
  return errors;
}
