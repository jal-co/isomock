import { expect, test } from "@playwright/test";

import type { ToolcraftComponentAcceptance } from "../src/app/app-acceptance";
import { deriveToolcraftBrowserRuntimeRequirements } from "./browser-runtime-evidence-requirements";

const testName = "browser: specialized behavior";

function requirement(
  overrides: Partial<ToolcraftComponentAcceptance>,
): ToolcraftComponentAcceptance {
  return {
    automated: true,
    automatedTestName: "acceptance: specialized behavior",
    browser: {
      budget: "standard",
      file: "e2e/app-controls.spec.ts",
      testName: testName,
    },
    componentType: "runtime",
    evidence: "command-side-effect",
    expectedObservable: "The specialized behavior is visible.",
    fixture: "A specialized runtime fixture.",
    id: "runtime.specialized",
    kind: "runtime",
    userAction: "Exercise specialized behavior.",
    ...overrides,
  };
}

test("specialized acceptance metadata derives executable runtime evidence", () => {
  const requirements = deriveToolcraftBrowserRuntimeRequirements([
    requirement({ canvasHandle: {
      outputObservable: "The handle changes output.",
      testId: "focus-handle",
      writesTarget: "focus.position",
    } }),
    requirement({
      id: "runtime.timeline",
      timelineCoverage: "playback",
      timelinePlaybackCoverage: "all-playback-behavior",
    }),
    requirement({ id: "runtime.keyframes", timelineCoverage: "keyframes" }),
    requirement({ id: "runtime.layers", layerCoverage: "reorder" }),
    requirement({ id: "runtime.reference", referenceCoverage: "renderer-state" }),
    requirement({ id: "runtime.compound", controlPartCoverage: ["curves.points"] }),
  ]);

  expect(requirements.map(({ evidenceType, requirementId }) => ({
    evidenceType,
    requirementId,
  }))).toEqual(expect.arrayContaining([
    { evidenceType: "canvas-handle-interaction", requirementId: "runtime.specialized" },
    { evidenceType: "canvas-export-clean", requirementId: "runtime.specialized" },
    { evidenceType: "timeline-duration", requirementId: "runtime.timeline" },
    { evidenceType: "timeline-loop", requirementId: "runtime.timeline" },
    { evidenceType: "timeline-pause-resume", requirementId: "runtime.timeline" },
    { evidenceType: "timeline-rendered-frame", requirementId: "runtime.timeline" },
    { evidenceType: "timeline-scrub", requirementId: "runtime.timeline" },
    { evidenceType: "timeline-keyframes", requirementId: "runtime.keyframes" },
    { evidenceType: "layer-reorder", requirementId: "runtime.layers" },
    { evidenceType: "reference-parity", requirementId: "runtime.reference" },
    { evidenceType: "compound-control-part", requirementId: "runtime.compound#curves.points" },
  ]));
  expect(
    requirements.find(
      (item) => item.evidenceType === "canvas-export-clean",
    ),
  ).toMatchObject({
    requirementId: "runtime.specialized",
    testName,
  });
});
