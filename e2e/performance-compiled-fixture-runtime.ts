import {
  executeToolcraftPerformanceFixtureCheckpoint,
  type ToolcraftEnvelopePerformanceConfig,
  type ToolcraftPerformanceCompiledFixturePlan,
  type ToolcraftPerformanceExecutedFixtureCheckpoint,
} from "@/toolcraft/runtime";

export type ToolcraftCompiledFixtureApplications = Record<
  string,
  {
    applyValue: (value: unknown) => Promise<void> | void;
    observeValue: () => Promise<unknown> | unknown;
  }
>;

type ExecuteCompiledPathFixtureOptions = {
  applications: ToolcraftCompiledFixtureApplications;
  assertObservation: (
    actual: number,
    expected: number,
    dimensionId: string,
  ) => Promise<void> | void;
  attachEvidence: (requirement: {
    id: string;
    target?: string;
  }) => Promise<void> | void;
  config: ToolcraftEnvelopePerformanceConfig;
  pathId: string;
  plan: ToolcraftPerformanceCompiledFixturePlan;
  requirementId: string;
  selector: "development" | "maximum";
  target?: string;
};

function assertCompiledFixtureApplications(
  plan: ToolcraftPerformanceCompiledFixturePlan,
  applications: ToolcraftCompiledFixtureApplications,
): void {
  const dimensionIds = [...plan.dimensionIds].sort();
  const applicationIds = Object.keys(applications).sort();
  const missing = dimensionIds.filter((dimensionId) => !applications[dimensionId]);
  const extra = applicationIds.filter(
    (dimensionId) => !dimensionIds.includes(dimensionId),
  );

  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Compiled Toolcraft performance path "${plan.pathId}" requires exact dimension applications. Missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}.`,
    );
  }
}

async function executeCompiledFixtureApplications({
  applications,
  assertObservation,
  attachEvidence,
  config,
  plan,
  pathId,
  requirementId,
  selector,
  target,
}: ExecuteCompiledPathFixtureOptions): Promise<ToolcraftPerformanceExecutedFixtureCheckpoint> {
  if (pathId !== plan.pathId) {
    throw new Error(
      `Toolcraft performance fixture requirement "${requirementId}" must use compiled path "${plan.pathId}".`,
    );
  }

  const checkpoint = executeToolcraftPerformanceFixtureCheckpoint(
    config,
    plan,
    selector,
  );
  assertCompiledFixtureApplications(plan, applications);

  for (const dimensionId of plan.dimensionIds) {
    await applications[dimensionId]!.applyValue(checkpoint.applied[dimensionId]);
  }

  for (const dimensionId of plan.dimensionIds) {
    const observedProductValue = await applications[dimensionId]!.observeValue();
    const adapter = config.fixtureAdapters!.dimensions[dimensionId]!;
    const observedMagnitude = (adapter.observe as (value: unknown) => number)(
      observedProductValue,
    );
    await assertObservation(
      observedMagnitude,
      checkpoint.values[dimensionId]!,
      dimensionId,
    );
  }

  await attachEvidence({ id: requirementId, ...(target ? { target } : {}) });
  return checkpoint;
}

export async function executeToolcraftCompiledPathFixtureApplications({
  applications,
  assertObservation,
  attachEvidence,
  config,
  pathId,
  plan,
  requirementId,
  selector,
  target,
}: ExecuteCompiledPathFixtureOptions): Promise<ToolcraftPerformanceExecutedFixtureCheckpoint> {
  return executeCompiledFixtureApplications({
    applications,
    assertObservation,
    attachEvidence,
    config,
    pathId,
    plan,
    requirementId,
    selector,
    target,
  });
}
