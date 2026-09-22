import { expect, test } from "@playwright/test";

import type { ToolcraftBrowserRuntimeRequirement } from "../src/app/test-evidence/browser-runtime-contract";
import { getToolcraftBrowserRequirementOwnershipErrors } from "./browser-runtime-requirement-ownership";

const acceptance = [{
  browser: {
    budget: "standard",
    file: "e2e/app-controls.spec.ts",
    testName: "browser: render scale",
  },
  id: "renderer.render-scale",
  renderScaleCoverage: {
    kind: "selected-backing-pixels" as const,
    states: ["interaction", "playback", "steady"] as const,
  },
}];

const requirements: ToolcraftBrowserRuntimeRequirement[] = acceptance[0]
  .renderScaleCoverage.states.map((state) => ({
    evidenceType: "canvas-render-scale-backing",
    requirementId: `${acceptance[0].id}#${state}`,
    target: "canvas.renderScale",
    testName:
      acceptance[0].browser === false ? "" : acceptance[0].browser.testName,
  }));

test("accepts only the exact closed render-scale state expansion", () => {
  expect(
    getToolcraftBrowserRequirementOwnershipErrors(acceptance, requirements),
  ).toEqual([]);
});

test("rejects a missing render-scale state requirement", () => {
  expect(
    getToolcraftBrowserRequirementOwnershipErrors(
      acceptance,
      requirements.slice(0, -1),
    ),
  ).toEqual([
    "Browser acceptance row \"renderer.render-scale\" must derive exactly renderer.render-scale#interaction, renderer.render-scale#playback, renderer.render-scale#steady; received renderer.render-scale#interaction, renderer.render-scale#playback.",
  ]);
});

test("rejects an extra or arbitrary render-scale suffix", () => {
  expect(
    getToolcraftBrowserRequirementOwnershipErrors(acceptance, [
      ...requirements,
      {
        ...requirements[0],
        requirementId: "renderer.render-scale#arbitrary",
      },
    ]),
  ).toEqual([
    "Browser acceptance row \"renderer.render-scale\" must derive exactly renderer.render-scale#interaction, renderer.render-scale#playback, renderer.render-scale#steady; received renderer.render-scale#interaction, renderer.render-scale#playback, renderer.render-scale#steady, renderer.render-scale#arbitrary.",
  ]);
});

test("an arbitrary suffix cannot replace a required base requirement", () => {
  expect(
    getToolcraftBrowserRequirementOwnershipErrors(
      [{
        browser: {
          budget: "standard",
          file: "e2e/app-controls.spec.ts",
          testName: "browser: ordinary",
        },
        id: "ordinary.output",
      }],
      [{
        ...requirements[0],
        requirementId: "ordinary.output#arbitrary",
        testName: "browser: ordinary",
      }],
    ),
  ).toEqual([
    "Browser acceptance row \"ordinary.output\" must derive its exact base runtime requirement.",
  ]);
});
