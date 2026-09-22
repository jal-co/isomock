import { expect, test } from "@playwright/test";

import { getToolcraftFrameDistributionMetrics } from "./performance-frame-metrics";

test("browser perf: frame metrics use nearest-rank visible samples", () => {
  expect(getToolcraftFrameDistributionMetrics([10, 12, 15, 20, 40])).toEqual({
    droppedFrameCount: 1,
    droppedFrameRatio: 0.2,
    frameGapP50Ms: 15,
    frameGapP95Ms: 40,
    frameGapP99Ms: 40,
    maxFrameGapMs: 40,
    sampleCount: 5,
  });
});

test("browser perf: frame metrics reject invalid samples", () => {
  expect(() => getToolcraftFrameDistributionMetrics([16, Number.NaN])).toThrow(
    /finite numbers/iu,
  );
});
