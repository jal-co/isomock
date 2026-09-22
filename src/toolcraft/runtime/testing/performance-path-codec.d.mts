export type ToolcraftPerformancePathSignature = Readonly<{
  interaction:
    | "animation-frame"
    | "control-change"
    | "control-drag"
    | "export"
    | "initial-render"
    | "mask-drag"
    | "media-import"
    | "timeline-playback"
    | "timeline-scrub"
    | "viewport-drag"
    | "viewport-zoom";
  invalidates: readonly string[];
  preparationInvalidates: readonly string[];
  profile:
    | "batch-responsive"
    | "initial-render"
    | "interactive-continuous"
    | "interactive-discrete";
  retainedAccesses: readonly string[];
  runsOn: readonly (
    | "export-only"
    | "gpu"
    | "main"
    | "worker"
    | "worker-or-gpu"
  )[];
  workloadDimensions: readonly string[];
}>;

export declare const TOOLCRAFT_PIPELINE_INTERACTIONS: readonly ToolcraftPerformancePathSignature["interaction"][];

export declare function getToolcraftPerformanceProfileForInteractionId(
  interaction: ToolcraftPerformancePathSignature["interaction"],
): ToolcraftPerformancePathSignature["profile"];

export declare function decodeToolcraftPerformancePathId(
  pathId: unknown,
): ToolcraftPerformancePathSignature | undefined;

export declare function createToolcraftPerformancePathId(
  path: ToolcraftPerformancePathSignature,
): string;
