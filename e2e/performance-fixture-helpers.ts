import { expect } from "@playwright/test";

import {
  areToolcraftFixtureValuesEqual,
  type ToolcraftEnvelopePerformanceConfig,
  type ToolcraftPerformanceCompiledFixturePlan,
  type ToolcraftPerformanceExecutedFixtureCheckpoint,
} from "@/toolcraft/runtime";

import {
  executeToolcraftCompiledPathFixtureApplications,
  type ToolcraftCompiledFixtureApplications,
} from "./performance-compiled-fixture-runtime";
import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";

export async function applyToolcraftPerformancePathCompiledFixture(
  config: ToolcraftEnvelopePerformanceConfig,
  pathId: string,
  plan: ToolcraftPerformanceCompiledFixturePlan,
  selector: "development" | "maximum",
  applications: ToolcraftCompiledFixtureApplications,
  evidenceTarget?: string,
): Promise<ToolcraftPerformanceExecutedFixtureCheckpoint> {
  return executeToolcraftCompiledPathFixtureApplications({
    applications,
    assertObservation: (observedMagnitude, expectedMagnitude, dimensionId) => {
      expect(
        areToolcraftFixtureValuesEqual(observedMagnitude, expectedMagnitude),
        `Toolcraft performance path "${pathId}" must observe compiled dimension "${dimensionId}" after complete fixture application.`,
      ).toBe(true);
    },
    attachEvidence: ({ id, target }) =>
      attachToolcraftBrowserRuntimeEvidence({
        evidenceType: "performance-compiled-fixture",
        requirementId: id,
        target: evidenceTarget ?? target,
      }),
    config,
    pathId,
    plan,
    requirementId: pathId,
    selector,
  });
}
