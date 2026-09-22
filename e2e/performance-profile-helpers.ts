import {
  getToolcraftPerformanceProfile,
  type ToolcraftPerformancePath,
  type ToolcraftPerformanceScenario,
} from "@/toolcraft/runtime";

export type ToolcraftPerformancePathBudget = Readonly<{
  maxExportMs?: number;
  maxFrameGapMs: number;
  maxInteractionMs?: number;
  maxLongTaskMs: number;
  maxPreviewMs?: number;
}>;

function getExportCompletionBudget(
  path: ToolcraftPerformancePath,
  scenarios: readonly ToolcraftPerformanceScenario[],
  catalogCompletionMs: number | undefined,
): number | undefined {
  if (path.interaction !== "export") return undefined;

  const scenario = scenarios.find(
    (candidate) =>
      candidate.pathId === path.id && candidate.interaction === "export",
  );
  const productDeadline = scenario?.completionDeadlineMs;
  if (productDeadline === undefined) return catalogCompletionMs;
  if (catalogCompletionMs === undefined) return productDeadline;
  return Math.min(productDeadline, catalogCompletionMs);
}

export function getToolcraftPerformancePathBudget(
  path: ToolcraftPerformancePath,
  pathScenarios: readonly ToolcraftPerformanceScenario[] = [],
): ToolcraftPerformancePathBudget {
  const { thresholds } = getToolcraftPerformanceProfile(path.profile);
  const maxExportMs = getExportCompletionBudget(
    path,
    pathScenarios,
    thresholds.maxBatchCompletionMs,
  );
  return Object.freeze({
    maxFrameGapMs: thresholds.maxFrameGapMs,
    maxLongTaskMs: thresholds.maxLongTaskMs,
    ...(path.interaction === "initial-render"
      ? { maxPreviewMs: thresholds.maxVisibleOutputLatencyMs }
      : path.interaction !== "animation-frame" && path.interaction !== "export"
        ? { maxInteractionMs: thresholds.maxVisibleOutputLatencyMs }
        : {}),
    ...(maxExportMs === undefined ? {} : { maxExportMs }),
  });
}
