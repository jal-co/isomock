import {
  compileToolcraftPerformanceFixturePlan,
  defineToolcraftDiscreteFixtureAdapter,
  deriveToolcraftPerformancePaths,
  type ToolcraftEnvelopePerformanceConfig,
} from "@/toolcraft/runtime";
import { describe, expect, it, vi } from "vitest";

import {
  executeToolcraftCompiledPathFixtureApplications,
} from "../../e2e/performance-compiled-fixture-runtime";
import { appSchema } from "./app-schema";

function createDiscreteFixture() {
  const adapter = defineToolcraftDiscreteFixtureAdapter({
    dimensionId: "count",
    domain: {
      attestation: "All reachable runtime fixture options are enumerated.",
      kind: "runtime-state",
      path: "fixture.count",
    },
    entries: [
      { appliedValue: "option-20", value: 20 },
      { appliedValue: "option-60", value: 60 },
      { appliedValue: "option-100", value: 100 },
    ],
  });
  const baseConfig: ToolcraftEnvelopePerformanceConfig = {
    fixtureAdapters: { dimensions: { count: adapter } },
    rendererPipeline: {
      interactionInvalidation: [
        {
          interaction: "control-change",
          invalidates: ["preview"],
          targets: ["fixture.count"],
        },
      ],
      passes: [
        {
          cost: {
            dimensions: ["count"],
            frequency: "interaction",
            relationship: "linear",
          },
          id: "preview",
          inputs: ["fixture.count"],
          invalidatedBy: ["fixture.count"],
          kind: "composite",
          output: "preview",
          quality: "full",
          runsOn: "main",
        },
      ],
      runtimeId: "fixture-helper-test",
    },
    rendererStrategy: "canvas-2d",
    scenarios: [],
    usesCustomRenderer: true,
    workloadEnvelope: {
      dimensions: [
        {
          defaultValue: 20,
          id: "count",
          interactiveMax: 100,
          mapping: "direct",
          source: { kind: "runtime-state", path: "fixture.count" },
          unit: "items",
        },
      ],
    },
  };
  const [path] = deriveToolcraftPerformancePaths(appSchema, baseConfig);
  if (!path) throw new Error("Expected the fixture helper test path.");
  const config: ToolcraftEnvelopePerformanceConfig = {
    ...baseConfig,
    scenarios: [
      {
        automated: true,
        automatedTestName: "perf: compiled fixture helper",
        browser: true,
        browserTestName: "browser perf: compiled fixture helper",
        coversTargets: path.targets,
        expectedObservable: "The exact compiled fixture is applied and observed.",
        fixture: "compiled fixture",
        id: "compiled-fixture-helper",
        interaction: "control-change",
        pathId: path.id,
        target: "fixture.count",
      },
    ],
  };

  return {
    adapter,
    config,
    path,
    plan: compileToolcraftPerformanceFixturePlan(config, path),
  };
}

describe("compiled browser fixture helper", () => {
  it("does no work for an unavailable checkpoint and applies an available maximum once", async () => {
    const { adapter, config, path, plan } = createDiscreteFixture();
    const runtimeApply = vi.spyOn(adapter, "apply");
    const runtimeObserve = vi.spyOn(adapter, "observe");
    const applyValue = vi.fn();
    const observeValue = vi.fn(() => "option-100");
    const assertObservation = vi.fn((actual, expected) => {
      expect(actual).toBe(expected);
    });
    const attachEvidence = vi.fn();
    const applications = { count: { applyValue, observeValue } };

    await expect(
      executeToolcraftCompiledPathFixtureApplications({
        applications,
        assertObservation,
        attachEvidence,
        config,
        pathId: path.id,
        plan,
        requirementId: path.id,
        selector: "development",
        target: "fixture.count",
      }),
    ).rejects.toThrow(/cannot reach exact normalized development pressure 0\.8/u);
    expect(runtimeApply).not.toHaveBeenCalled();
    expect(runtimeObserve).not.toHaveBeenCalled();
    expect(applyValue).not.toHaveBeenCalled();
    expect(observeValue).not.toHaveBeenCalled();
    expect(assertObservation).not.toHaveBeenCalled();
    expect(attachEvidence).not.toHaveBeenCalled();

    await expect(
      executeToolcraftCompiledPathFixtureApplications({
        applications,
        assertObservation,
        attachEvidence,
        config,
        pathId: path.id,
        plan,
        requirementId: path.id,
        selector: "maximum",
        target: "fixture.count",
      }),
    ).resolves.toMatchObject({
      applied: { count: "option-100" },
      observed: { count: 100 },
      values: { count: 100 },
    });
    expect(runtimeApply).toHaveBeenCalledTimes(1);
    expect(runtimeObserve).toHaveBeenCalledTimes(2);
    expect(applyValue).toHaveBeenCalledTimes(1);
    expect(observeValue).toHaveBeenCalledTimes(1);
    expect(assertObservation).toHaveBeenCalledTimes(1);
    expect(attachEvidence).toHaveBeenCalledTimes(1);
  });

  it("executes the canonical path fixture without product-authored scenarios", async () => {
    const { config, path, plan } = createDiscreteFixture();
    const applyValue = vi.fn();
    const observeValue = vi.fn(() => "option-100");
    const assertObservation = vi.fn();
    const attachEvidence = vi.fn();

    await expect(
      executeToolcraftCompiledPathFixtureApplications({
        applications: { count: { applyValue, observeValue } },
        assertObservation,
        attachEvidence,
        config: { ...config, scenarios: [] },
        pathId: path.id,
        plan,
        requirementId: path.id,
        selector: "maximum",
        target: "fixture.count",
      }),
    ).resolves.toMatchObject({
      applied: { count: "option-100" },
      observed: { count: 100 },
      values: { count: 100 },
    });
    expect(applyValue).toHaveBeenCalledWith("option-100");
    expect(observeValue).toHaveBeenCalledTimes(1);
    expect(assertObservation).toHaveBeenCalledWith(100, 100, "count");
    expect(attachEvidence).toHaveBeenCalledWith({
      id: path.id,
      target: "fixture.count",
    });
  });
});
