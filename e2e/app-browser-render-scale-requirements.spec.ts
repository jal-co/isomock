import { expect, test } from "@playwright/test";
import {
  defineToolcraft,
  type ToolcraftPerformancePath,
} from "@/toolcraft/runtime";

import type { ToolcraftComponentAcceptance } from "../src/app/app-acceptance";
import {
  deriveToolcraftBrowserRuntimeRequirements,
  deriveToolcraftPerformancePathRuntimeRequirements,
} from "./browser-runtime-evidence-requirements";

function renderScaleAcceptance(
  states: readonly ("interaction" | "playback" | "steady")[],
): ToolcraftComponentAcceptance {
  return {
    automated: true,
    automatedTestName: "canvas render scale acceptance",
    browser: {
      budget: "standard",
      file: "e2e/app-controls.spec.ts",
      testName: "browser: canvas render scale backing pixels",
    },
    componentType: "canvas-render-scale",
    evidence: "rendered-pixels",
    expectedObservable:
      "Canvas backing pixels match the selected resolution scale.",
    fixture: "A visible raster canvas.",
    id: "canvas.render-scale",
    kind: "runtime",
    renderScaleCoverage: {
      kind: "selected-backing-pixels",
      states,
    },
    target: "canvas.renderScale",
    userAction: "Change resolution scale and exercise each renderer state.",
  };
}

test("render-scale coverage derives one exact functional requirement per state", () => {
  const requirements = deriveToolcraftBrowserRuntimeRequirements([
    renderScaleAcceptance(["interaction", "playback", "steady"]),
  ]);

  expect(
    requirements.filter(
      ({ evidenceType }) => evidenceType === "canvas-render-scale-backing",
    ),
  ).toEqual([
    {
      evidenceType: "canvas-render-scale-backing",
      requirementId: "canvas.render-scale#interaction",
      target: "canvas.renderScale",
      testName: "browser: canvas render scale backing pixels",
    },
    {
      evidenceType: "canvas-render-scale-backing",
      requirementId: "canvas.render-scale#playback",
      target: "canvas.renderScale",
      testName: "browser: canvas render scale backing pixels",
    },
    {
      evidenceType: "canvas-render-scale-backing",
      requirementId: "canvas.render-scale#steady",
      target: "canvas.renderScale",
      testName: "browser: canvas render scale backing pixels",
    },
  ]);
});

test("render-scale backing replaces generic visual-change evidence", () => {
  const requirements = deriveToolcraftBrowserRuntimeRequirements([
    renderScaleAcceptance(["interaction", "steady"]),
  ]);

  expect(requirements.map(({ evidenceType }) => evidenceType)).not.toContain(
    "product-observable-change",
  );
  expect(requirements.map(({ evidenceType }) => evidenceType)).toEqual([
    "canvas-render-scale-backing",
    "canvas-render-scale-backing",
  ]);
});

test("render-scale functional requirements remain separate from performance evidence", () => {
  const requirements = deriveToolcraftBrowserRuntimeRequirements([
    renderScaleAcceptance(["interaction", "steady"]),
  ]);

  expect(requirements.map(({ evidenceType }) => evidenceType)).toContain(
    "canvas-render-scale-backing",
  );
  expect(requirements.map(({ evidenceType }) => evidenceType)).not.toContain(
    "performance-render-scale",
  );
});

const unrelatedPerformancePaths = [
  {
    id: "performance-path:color",
    interaction: "control-drag",
    invalidates: ["composite"],
    preparationInvalidates: [],
    profile: "live-interaction",
    retainedAccesses: [],
    runsOn: ["main"],
    targets: ["appearance.color"],
    workloadDimensions: [],
  },
  {
    id: "performance-path:viewport",
    interaction: "viewport-drag",
    invalidates: ["composite"],
    preparationInvalidates: [],
    profile: "frame-budget",
    retainedAccesses: [],
    runsOn: ["main"],
    targets: [],
    workloadDimensions: [],
  },
] as const satisfies readonly ToolcraftPerformancePath[];

test("every raster performance path derives cold, warm, and sustained 2x requirements", () => {
  const requirements = deriveToolcraftPerformancePathRuntimeRequirements(
    unrelatedPerformancePaths,
    defineToolcraft({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true, renderScale: true },
        panels: {},
      },
      modules: [],
    }),
  ).filter(({ evidenceType }) => evidenceType === "performance-render-scale");

  expect(requirements).toEqual([
    expect.objectContaining({ requirementId: "performance-path:color#cold" }),
    expect.objectContaining({ requirementId: "performance-path:color#warm" }),
    expect.objectContaining({
      requirementId: "performance-path:color#sustained",
    }),
    expect.objectContaining({
      requirementId: "performance-path:viewport#cold",
    }),
    expect.objectContaining({
      requirementId: "performance-path:viewport#warm",
    }),
    expect.objectContaining({
      requirementId: "performance-path:viewport#sustained",
    }),
  ]);
});

test("vector performance paths derive no raster quality requirements", () => {
  const requirements = deriveToolcraftPerformancePathRuntimeRequirements(
    unrelatedPerformancePaths,
    defineToolcraft({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {},
      },
      modules: [],
    }),
  );

  expect(requirements.map(({ evidenceType }) => evidenceType)).not.toContain(
    "performance-render-scale",
  );
});
