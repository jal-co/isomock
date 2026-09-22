export type ToolcraftFrameDistributionMetrics = Readonly<{
  droppedFrameCount: number;
  droppedFrameRatio: number;
  frameGapP50Ms: number;
  frameGapP95Ms: number;
  frameGapP99Ms: number;
  maxFrameGapMs: number;
  sampleCount: number;
}>;

const defaultFrameIntervalMs = 1_000 / 60;
const droppedFrameThresholdMs = defaultFrameIntervalMs * 1.5;

function nearestRank(
  sortedSamples: readonly number[],
  percentile: number,
): number {
  if (sortedSamples.length === 0) return 0;
  const index = Math.max(0, Math.ceil(percentile * sortedSamples.length) - 1);
  return sortedSamples[index] ?? 0;
}

export function getToolcraftFrameDistributionMetrics(
  frameGapsMs: readonly number[],
): ToolcraftFrameDistributionMetrics {
  if (
    frameGapsMs.some(
      (sample) => !Number.isFinite(sample) || sample < 0,
    )
  ) {
    throw new Error(
      "Toolcraft frame-gap samples must be finite numbers greater than or equal to zero.",
    );
  }

  const sorted = [...frameGapsMs].sort((left, right) => left - right);
  const droppedFrameCount = sorted.filter(
    (sample) => sample > droppedFrameThresholdMs,
  ).length;
  return Object.freeze({
    droppedFrameCount,
    droppedFrameRatio:
      sorted.length === 0 ? 0 : droppedFrameCount / sorted.length,
    frameGapP50Ms: nearestRank(sorted, 0.5),
    frameGapP95Ms: nearestRank(sorted, 0.95),
    frameGapP99Ms: nearestRank(sorted, 0.99),
    maxFrameGapMs: sorted.at(-1) ?? 0,
    sampleCount: sorted.length,
  });
}
