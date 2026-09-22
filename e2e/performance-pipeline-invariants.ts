import type {
  AnyToolcraftRendererPipelineRegistration,
  ToolcraftPerformancePath,
  ToolcraftRenderPass,
} from "@/toolcraft/runtime";

import {
  TOOLCRAFT_PERFORMANCE_PIPELINE_METRIC_KEYS,
  type ToolcraftPerformancePipelineEvidence,
  type ToolcraftPerformancePipelineMetricKey,
  type ToolcraftPerformancePipelinePassSnapshot,
  type ToolcraftPerformancePipelineSnapshot,
} from "../src/app/test-evidence/browser-performance-contract";

export type ToolcraftPerformancePipelinePassDelta = Readonly<
  Record<ToolcraftPerformancePipelineMetricKey, number>
>;

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function pipelinePassMap(
  snapshot: ToolcraftPerformancePipelineSnapshot,
): ReadonlyMap<string, ToolcraftPerformancePipelinePassSnapshot> {
  return new Map(snapshot.passes.map((pass) => [pass.passId, pass] as const));
}

export function getPipelinePassDelta(
  before: ToolcraftPerformancePipelinePassSnapshot,
  after: ToolcraftPerformancePipelinePassSnapshot,
): ToolcraftPerformancePipelinePassDelta {
  return Object.freeze(
    Object.fromEntries(
      TOOLCRAFT_PERFORMANCE_PIPELINE_METRIC_KEYS.map((key) => [
        key,
        after[key] - before[key],
      ]),
    ) as Record<ToolcraftPerformancePipelineMetricKey, number>,
  );
}

export function createCanonicalZeroPipelineSnapshot(
  registration: AnyToolcraftRendererPipelineRegistration,
): ToolcraftPerformancePipelineSnapshot {
  return Object.freeze({
    disposed: false,
    passes: Object.freeze(
      registration.passes
        .map((pass) =>
          Object.freeze({
            activeResources: 0,
            cacheHits: 0,
            cacheMisses: 0,
            durationMax: 0,
            durationTotal: 0,
            executions: 0,
            passId: pass.id,
            resourceCreations: 0,
            resourceDisposals: 0,
            transfers: 0,
          }),
        )
        .sort((left, right) => compareCodeUnits(left.passId, right.passId)),
    ),
    runtimeId: registration.runtimeId,
  });
}

function getPassSetErrors({
  canonicalPassIds,
  label,
  snapshot,
}: {
  canonicalPassIds: readonly string[];
  label: string;
  snapshot: ToolcraftPerformancePipelineSnapshot;
}): string[] {
  const actual = new Set(snapshot.passes.map((pass) => pass.passId));
  const expected = new Set(canonicalPassIds);
  const errors: string[] = [];
  for (const passId of canonicalPassIds) {
    if (!actual.has(passId)) {
      errors.push(`${label} is missing canonical pass "${passId}".`);
    }
  }
  for (const passId of [...actual].sort(compareCodeUnits)) {
    if (!expected.has(passId)) {
      errors.push(`${label} contains unknown pass "${passId}".`);
    }
  }
  return errors;
}

function getSnapshotInvariantErrors(
  snapshot: ToolcraftPerformancePipelineSnapshot,
  label: string,
): string[] {
  const errors: string[] = [];
  if (snapshot.disposed) {
    errors.push(`${label} must observe an active, non-disposed pipeline runtime.`);
  }
  for (const pass of snapshot.passes) {
    if (pass.cacheMisses !== pass.executions) {
      errors.push(
        `${label} pass "${pass.passId}" must record one cache miss per execution cumulatively.`,
      );
    }
    if (pass.durationMax > pass.durationTotal) {
      errors.push(
        `${label} pass "${pass.passId}" durationMax cannot exceed durationTotal.`,
      );
    }
    if (pass.resourceDisposals > pass.resourceCreations) {
      errors.push(
        `${label} pass "${pass.passId}" resourceDisposals cannot exceed resourceCreations.`,
      );
    }
    if (
      pass.activeResources !==
      pass.resourceCreations - pass.resourceDisposals
    ) {
      errors.push(
        `${label} pass "${pass.passId}" activeResources must equal resourceCreations minus resourceDisposals cumulatively.`,
      );
    }
  }
  return errors;
}

function snapshotsMatch(
  left: ToolcraftPerformancePipelineSnapshot,
  right: ToolcraftPerformancePipelineSnapshot,
): boolean {
  if (
    left.disposed !== right.disposed ||
    left.runtimeId !== right.runtimeId ||
    left.passes.length !== right.passes.length
  ) {
    return false;
  }
  const rightByPass = pipelinePassMap(right);
  return left.passes.every((leftPass) => {
    const rightPass = rightByPass.get(leftPass.passId);
    return (
      rightPass !== undefined &&
      TOOLCRAFT_PERFORMANCE_PIPELINE_METRIC_KEYS.every(
        (key) => leftPass[key] === rightPass[key],
      )
    );
  });
}

export function getPipelineObservationInvariantErrors({
  canonicalPassIds,
  evidence,
  passDefinitions,
  path,
  registration,
}: {
  canonicalPassIds: readonly string[];
  evidence: ToolcraftPerformancePipelineEvidence;
  passDefinitions: ReadonlyMap<string, ToolcraftRenderPass>;
  path: ToolcraftPerformancePath;
  registration: AnyToolcraftRendererPipelineRegistration;
}): string[] {
  const label = `Path "${path.id}", phase "${evidence.phase}"`;
  const errors: string[] = [];
  if (evidence.profile !== path.profile) {
    errors.push(
      `${label} profile "${evidence.profile}" does not match canonical profile "${path.profile}".`,
    );
  }
  for (const [snapshotName, snapshot] of [
    ["before", evidence.before],
    ["after", evidence.after],
  ] as const) {
    if (snapshot.runtimeId !== registration.runtimeId) {
      errors.push(
        `${label} ${snapshotName}.runtimeId "${snapshot.runtimeId}" does not match executable registration runtimeId "${registration.runtimeId}".`,
      );
    }
    errors.push(
      ...getPassSetErrors({
        canonicalPassIds,
        label: `${label} ${snapshotName}`,
        snapshot,
      }),
      ...getSnapshotInvariantErrors(snapshot, `${label} ${snapshotName}`),
    );
  }

  if (
    path.interaction === "initial-render" &&
    !snapshotsMatch(
      evidence.before,
      createCanonicalZeroPipelineSnapshot(registration),
    )
  ) {
    errors.push(
      `${label} initial-render before snapshot must be the canonical zero lifecycle snapshot.`,
    );
  }

  const beforeByPass = pipelinePassMap(evidence.before);
  const afterByPass = pipelinePassMap(evidence.after);
  const invalidatedPassIds = new Set(path.invalidates);
  const retainedAccessPassIds = new Set(path.retainedAccesses);
  for (const passId of canonicalPassIds) {
    const before = beforeByPass.get(passId);
    const after = afterByPass.get(passId);
    if (!before || !after) continue;
    const delta = getPipelinePassDelta(before, after);
    for (const key of TOOLCRAFT_PERFORMANCE_PIPELINE_METRIC_KEYS) {
      if (key !== "activeResources" && delta[key] < 0) {
        errors.push(
          `${label} pass "${passId}" counter "${key}" decreased from ${before[key]} to ${after[key]}.`,
        );
      }
      if (
        !invalidatedPassIds.has(passId) &&
        !retainedAccessPassIds.has(passId) &&
        delta[key] !== 0
      ) {
        errors.push(
          `${label} pass "${passId}" changed ${key} outside canonical path.invalidates (${before[key]} -> ${after[key]}).`,
        );
      }
    }

    const definition = passDefinitions.get(passId);
    if (!definition) continue;
    const cache =
      definition.lifecycle?.cache ??
      (definition.cacheKey ? "memoized" : "none");
    if (cache === "none" && (before.cacheHits !== 0 || after.cacheHits !== 0)) {
      errors.push(
        `${label} no-cache pass "${passId}" cannot record cache hits; cumulative cacheHits must remain zero.`,
      );
    }
    if (
      cache !== "retained-resource" &&
      (before.resourceCreations !== 0 ||
        before.resourceDisposals !== 0 ||
        before.activeResources !== 0 ||
        after.resourceCreations !== 0 ||
        after.resourceDisposals !== 0 ||
        after.activeResources !== 0)
    ) {
      errors.push(
        `${label} pass "${passId}" without retained-resource lifecycle cannot create or dispose resources.`,
      );
    }
    if (retainedAccessPassIds.has(passId)) {
      const forbiddenMetric = TOOLCRAFT_PERFORMANCE_PIPELINE_METRIC_KEYS.find(
        (key) => key !== "cacheHits" && delta[key] !== 0,
      );
      if (cache !== "retained-resource") {
        errors.push(
          `${label} retained access pass "${passId}" must use retained-resource lifecycle.`,
        );
      }
      if (delta.cacheHits <= 0 || forbiddenMetric !== undefined) {
        errors.push(
          `${label} retained access pass "${passId}" permits a cache hit only; observed cacheHits=${delta.cacheHits}${
            forbiddenMetric === undefined
              ? ""
              : ` and ${forbiddenMetric}=${delta[forbiddenMetric]}`
          }.`,
        );
      }
      continue;
    }
    if (!invalidatedPassIds.has(passId)) continue;

    if (
      cache === "retained-resource" &&
      delta.resourceDisposals > 0 &&
      delta.resourceCreations === 0
    ) {
      const forbiddenRetirementMetric =
        TOOLCRAFT_PERFORMANCE_PIPELINE_METRIC_KEYS.find(
          (key) =>
            key !== "activeResources" &&
            key !== "resourceDisposals" &&
            delta[key] !== 0,
        );
      const activeResourceDecrease = before.activeResources - after.activeResources;
      if (
        delta.resourceDisposals > before.activeResources ||
        activeResourceDecrease !== delta.resourceDisposals ||
        forbiddenRetirementMetric !== undefined
      ) {
        errors.push(
          `${label} retained-resource pass "${passId}" retirement-only invalidation requires zero cache, execution, allocation, transfer, and duration activity plus one matching bounded activeResources decrease; observed resourceDisposals=${delta.resourceDisposals}, activeResources decrease=${activeResourceDecrease}${
            forbiddenRetirementMetric === undefined
              ? ""
              : `, and ${forbiddenRetirementMetric}=${delta[forbiddenRetirementMetric]}`
          }.`,
        );
      }
      continue;
    }

    if (cache === "none" && delta.executions === 0) {
      errors.push(
        `${label} no-cache pass "${passId}" requires execution phase activity for a canonical invalidation.`,
      );
    }

    if (cache === "memoized" || cache === "retained-resource") {
      if (delta.cacheHits + delta.cacheMisses === 0) {
        errors.push(
          `${label} cached pass "${passId}" requires cache phase activity for a canonical invalidation.`,
        );
      }
      const changesCacheKey = (definition.cacheKey ?? []).some((key) =>
        path.targets.includes(key),
      );
      const freshLifecycle =
        path.interaction === "initial-render" ||
        changesCacheKey ||
        (evidence.phase === "cold" &&
          before.cacheHits === 0 &&
          before.cacheMisses === 0 &&
          before.executions === 0);
      if (
        freshLifecycle &&
        (delta.cacheMisses === 0 || delta.executions === 0)
      ) {
        errors.push(
          `${label} cached pass "${passId}" must populate a fresh lifecycle with a miss and execution.`,
        );
      }
      const reusePhase =
        path.interaction !== "initial-render" &&
        !changesCacheKey &&
        (evidence.phase === "warm" || evidence.phase === "sustained");
      if (reusePhase && delta.cacheHits === 0) {
        errors.push(
          `${label} cached pass "${passId}" must prove ${evidence.phase} cache reuse with a hit.`,
        );
      }
      if (
        reusePhase &&
        (delta.cacheMisses !== 0 ||
          delta.executions !== 0 ||
          delta.resourceCreations !== 0 ||
          delta.resourceDisposals !== 0 ||
          delta.activeResources !== 0 ||
          delta.transfers !== 0)
      ) {
        errors.push(
          `${label} cached pass "${passId}" ${evidence.phase} reuse cannot add misses, executions, resources, disposals, or transfers.`,
        );
      }
      if (
        cache === "retained-resource" &&
        (path.interaction === "initial-render" || evidence.phase === "cold") &&
        before.resourceCreations === 0 &&
        delta.cacheMisses > 0 &&
        delta.resourceCreations === 0
      ) {
        errors.push(
          `${label} retained-resource pass "${passId}" must create its resource in a fresh lifecycle.`,
        );
      }
      if (
        cache === "retained-resource" &&
        changesCacheKey &&
        evidence.phase === "sustained" &&
        after.activeResources > before.activeResources
      ) {
        errors.push(
          `${label} key-changing retained-resource pass "${passId}" cannot grow activeResources during the sustained phase.`,
        );
      }
    }
    if (delta.executions === 0 && delta.durationTotal !== 0) {
      errors.push(
        `${label} pass "${passId}" cannot add durationTotal without an execution.`,
      );
    }
  }
  return errors;
}
