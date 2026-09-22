import { expect, test } from "@playwright/test";

import type {
  ToolcraftPerformancePath,
  ToolcraftPerformanceScenario,
} from "@/toolcraft/runtime";

import {
  getToolcraftPerformancePathBudget,
} from "./performance-profile-helpers";

const interactionPath = {
  id: "performance-path:interaction",
  interaction: "control-drag",
  invalidates: ["preview"],
  preparationInvalidates: [],
  profile: "interactive-continuous",
  retainedAccesses: [],
  runsOn: ["main"],
  targets: ["render.amount"],
  workloadDimensions: [],
} as const satisfies ToolcraftPerformancePath;

const exportPath = {
  id: "performance-path:export",
  interaction: "export",
  invalidates: ["output"],
  preparationInvalidates: [],
  profile: "batch-responsive",
  retainedAccesses: [],
  runsOn: ["worker"],
  targets: ["export.image"],
  workloadDimensions: [],
} as const satisfies ToolcraftPerformancePath;

function interactionScenario(
  path: typeof interactionPath,
): ToolcraftPerformanceScenario {
  return {
    automated: true,
    automatedTestName: "perf: interaction path scenario",
    browser: true,
    browserTestName: "browser perf: interaction path scenario",
    coversTargets: path.targets,
    expectedObservable: "The protected interaction stays responsive.",
    fixture: "compiled interaction fixture",
    id: "scenario-control-drag",
    interaction: "control-drag",
    pathId: path.id,
  };
}

function exportScenario(
  completionDeadlineMs?: number,
): ToolcraftPerformanceScenario {
  return {
    actionValue: "export.png",
    automated: true,
    automatedTestName: "perf: export path scenario",
    browser: true,
    browserTestName: "browser perf: export path scenario",
    completionEvidence: "download",
    controlLabel: "Export PNG",
    coversTargets: exportPath.targets,
    expectedObservable: "The protected export completes.",
    fixture: "compiled export fixture",
    id: "scenario-export",
    interaction: "export",
    pathId: exportPath.id,
    ...(completionDeadlineMs === undefined ? {} : { completionDeadlineMs }),
  };
}

test("browser perf: central profiles own responsiveness thresholds", () => {
  const budget = getToolcraftPerformancePathBudget(interactionPath, [
    interactionScenario(interactionPath),
  ]);

  expect(budget).toMatchObject({
    maxFrameGapMs: 80,
    maxInteractionMs: 500,
    maxLongTaskMs: 50,
  });
});

test("browser perf: export paths accept only a stricter product completion deadline", () => {
  const budget = getToolcraftPerformancePathBudget(exportPath, [
    exportScenario(2_000),
  ]);

  expect(budget).toMatchObject({
    maxExportMs: 2_000,
    maxFrameGapMs: 80,
    maxLongTaskMs: 80,
  });
  expect(budget).not.toHaveProperty("maxInteractionMs");
});

test("browser perf: export paths use the central deadline by default", () => {
  expect(
    getToolcraftPerformancePathBudget(exportPath, [exportScenario()]),
  ).toMatchObject({
    maxExportMs: 8_000,
    maxFrameGapMs: 80,
    maxLongTaskMs: 80,
  });
});
