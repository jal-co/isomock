import { expect, test } from "@playwright/test";

import {
  getToolcraftPerformanceProfile,
  type ToolcraftPerformancePath,
} from "@/toolcraft/runtime";

import {
  TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_ATTACHMENT_NAME,
  TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_CONTENT_TYPE,
  serializeToolcraftPerformanceMeasurement,
} from "../src/app/test-evidence/browser-performance-measurement-contract";
import { evaluateToolcraftPerformanceMeasurements } from "./browser-performance-measurement-report";

const path: ToolcraftPerformancePath = {
  id: "initial",
  interaction: "initial-render",
  invalidates: ["preview"],
  preparationInvalidates: [],
  profile: "initial-render",
  retainedAccesses: [],
  runsOn: ["main"],
  targets: ["preview"],
  workloadDimensions: [],
};

function attachment(phase: "cold" | "sustained" | "warm", p95Ms = 16) {
  return {
    body: serializeToolcraftPerformanceMeasurement({
      evidenceType: "performance-measurement-metrics",
      kind: path.interaction === "animation-frame" ? "animation-frames" : "interaction",
      metrics: {
        droppedFrameCount: 0,
        droppedFrameRatio: 0,
        durationMs: 1,
        frameGapP50Ms: Math.min(10, p95Ms),
        frameGapP95Ms: p95Ms,
        frameGapP99Ms: p95Ms,
        longTaskCount: 0,
        longTaskMaxMs: 0,
        maxFrameGapMs: p95Ms,
        sampleCount: 3,
      },
      pathId: path.id,
      phase,
      profile: path.profile,
    }),
    contentType: TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_CONTENT_TYPE,
    name: TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_ATTACHMENT_NAME,
  };
}

test("measurement report independently accepts all canonical phases", () => {
  const evaluation = evaluateToolcraftPerformanceMeasurements({
    attachments: [attachment("cold"), attachment("warm"), attachment("sustained")],
    expectedPaths: [path],
  });

  expect(evaluation.errors).toEqual([]);
  expect(evaluation.report?.observations).toHaveLength(3);
});

test("measurement report rejects missing phases and central profile violations", () => {
  const threshold = getToolcraftPerformanceProfile(path.profile).thresholds
    .maxFrameGapP95Ms;
  const evaluation = evaluateToolcraftPerformanceMeasurements({
    attachments: [attachment("cold", threshold + 1)],
    expectedPaths: [path],
  });

  expect(evaluation.errors.join("\n")).toContain("p95 frame gap");
  expect(evaluation.errors.join("\n")).toContain(
    `Missing performance measurement phase "warm"`,
  );
});
