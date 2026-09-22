type ToolcraftPerformanceProfileThresholdManifest = Readonly<{
  maxBatchCompletionMs?: number;
  maxDroppedFrameRatio: number;
  maxFrameGapMs: number;
  maxFrameGapP95Ms: number;
  maxLongTaskMs: number;
  maxVisibleOutputLatencyMs: number;
}>;

export const TOOLCRAFT_PERFORMANCE_PROFILE_MANIFEST: Readonly<{
  names: readonly [
    "interactive-continuous",
    "interactive-discrete",
    "batch-responsive",
    "initial-render",
  ];
  profiles: Readonly<
    Record<
      | "batch-responsive"
      | "initial-render"
      | "interactive-continuous"
      | "interactive-discrete",
      ToolcraftPerformanceProfileThresholdManifest
    >
  >;
  version: 1;
}>;
