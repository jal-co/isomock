const profiles = Object.freeze({
  "batch-responsive": Object.freeze({
    maxBatchCompletionMs: 8_000,
    maxDroppedFrameRatio: 0.15,
    maxFrameGapMs: 80,
    maxFrameGapP95Ms: 50,
    maxLongTaskMs: 80,
    maxVisibleOutputLatencyMs: 500,
  }),
  "initial-render": Object.freeze({
    maxDroppedFrameRatio: 0.2,
    maxFrameGapMs: 120,
    maxFrameGapP95Ms: 80,
    maxLongTaskMs: 80,
    maxVisibleOutputLatencyMs: 1_500,
  }),
  "interactive-continuous": Object.freeze({
    maxDroppedFrameRatio: 0.1,
    maxFrameGapMs: 80,
    maxFrameGapP95Ms: 34,
    maxLongTaskMs: 50,
    maxVisibleOutputLatencyMs: 500,
  }),
  "interactive-discrete": Object.freeze({
    maxDroppedFrameRatio: 0.15,
    maxFrameGapMs: 80,
    maxFrameGapP95Ms: 50,
    maxLongTaskMs: 80,
    maxVisibleOutputLatencyMs: 500,
  }),
});

export const TOOLCRAFT_PERFORMANCE_PROFILE_MANIFEST = Object.freeze({
  names: Object.freeze([
    "interactive-continuous",
    "interactive-discrete",
    "batch-responsive",
    "initial-render",
  ]),
  profiles,
  version: 1,
});
