import { expect, test } from "@playwright/test";
import {
  defineToolcraftPerformance,
  deriveToolcraftPerformancePaths,
  registerToolcraftRendererPipeline,
  type ToolcraftRendererPipelinePassContract,
} from "@/toolcraft/runtime";

import type { ToolcraftPerformancePipelineSnapshot } from "../src/app/test-evidence/browser-performance-contract";
import { evaluateToolcraftBrowserPerformanceEvidence } from "./browser-performance-report";
import {
  activePipelineAttachments,
  evaluatePipelineEvidence,
  noCacheActivitySnapshot,
  pipelineEvidence,
  pipelineEvidenceAttachment,
  pipelineSnapshot,
  zeroPipelinePassCounters,
} from "./performance-pipeline-evidence-test-fixtures";
import {
  pipelineEvidenceRegistration,
  pipelineEvidenceSchema,
} from "./performance-pipeline-evidence-test-contract";

const phases = ["cold", "warm", "sustained"] as const;

function implicitNoCacheSnapshot(
  executions: number,
  cacheHits: number,
): ToolcraftPerformancePipelineSnapshot {
  const snapshot = noCacheActivitySnapshot(executions);
  return {
    ...snapshot,
    passes: snapshot.passes.map((pass) =>
      pass.passId === "composite" ? { ...pass, cacheHits } : pass,
    ),
  };
}

test("missing lifecycle and cacheKey resolves to no-cache semantics", () => {
  const composite = pipelineEvidenceRegistration.passes.find(
    (pass) => pass.id === "composite",
  );
  const noOp = evaluatePipelineEvidence(
    phases.map((phase) =>
      pipelineEvidenceAttachment(
        pipelineEvidence(phase, pipelineSnapshot(), pipelineSnapshot()),
      ),
    ),
  );
  const hitSnapshots = [0, 1, 2, 3].map((executions) =>
    implicitNoCacheSnapshot(executions, 1),
  );
  const forgedHits = evaluatePipelineEvidence(
    phases.map((phase, index) =>
      pipelineEvidenceAttachment(
        pipelineEvidence(
          phase,
          hitSnapshots[index],
          hitSnapshots[index + 1],
        ),
      ),
    ),
  );

  expect(composite).not.toHaveProperty("lifecycle");
  expect(composite).not.toHaveProperty("cacheKey");
  expect(evaluatePipelineEvidence(activePipelineAttachments()).errors).toEqual([]);
  expect(noOp.errors).toContainEqual(
    expect.stringMatching(/no-cache pass "composite".*execution phase activity/i),
  );
  expect(forgedHits.errors).toContainEqual(
    expect.stringMatching(/no-cache pass "composite" cannot record cache hits/i),
  );
});

type ImplicitMemoizedPasses = {
  memoized: ToolcraftRendererPipelinePassContract<void>;
};

const implicitMemoizedRegistration =
  registerToolcraftRendererPipeline<ImplicitMemoizedPasses>()({
    interactionInvalidation: [
      {
        interaction: "control-change",
        invalidates: ["memoized"],
        targets: ["effect.mode"],
      },
    ],
    passes: [
      {
        cacheKey: ["source.id"],
        cost: {
          dimensions: [],
          frequency: "interaction",
          relationship: "constant",
        },
        id: "memoized",
        inputs: ["source.id", "effect.mode"],
        invalidatedBy: ["effect.mode"],
        kind: "decode",
        output: "source",
        quality: "full",
        runsOn: "worker",
      },
    ],
    runtimeId: "implicit-memoized-test-v1",
  });

const implicitMemoizedPerformance = defineToolcraftPerformance({
  rendererPipeline: implicitMemoizedRegistration,
  rendererStrategy: "webgl",
  scenarios: [],
  usesCustomRenderer: true,
  workloadEnvelope: { dimensions: [] },
});

const implicitMemoizedPath = deriveToolcraftPerformancePaths(
  pipelineEvidenceSchema,
  implicitMemoizedPerformance,
).find((path) => path.interaction === "control-change")!;

function implicitMemoizedSnapshot({
  hits,
  misses,
}: {
  hits: number;
  misses: number;
}): ToolcraftPerformancePipelineSnapshot {
  return {
    disposed: false,
    passes: [
      {
        ...zeroPipelinePassCounters(),
        cacheHits: hits,
        cacheMisses: misses,
        durationMax: misses === 0 ? 0 : 1,
        durationTotal: misses,
        executions: misses,
        passId: "memoized",
      },
    ],
    runtimeId: implicitMemoizedRegistration.runtimeId,
  };
}

function implicitMemoizedAttachments(
  snapshots: readonly ToolcraftPerformancePipelineSnapshot[],
) {
  return phases.map((phase, index) =>
    pipelineEvidenceAttachment({
      after: snapshots[index + 1]!,
      before: snapshots[index]!,
      evidenceType: "performance-pipeline",
      pathId: implicitMemoizedPath.id,
      phase,
      profile: implicitMemoizedPath.profile,
    }),
  );
}

function evaluateImplicitMemoized(
  snapshots: readonly ToolcraftPerformancePipelineSnapshot[],
) {
  return evaluateToolcraftBrowserPerformanceEvidence({
    attachments: implicitMemoizedAttachments(snapshots),
    expectedPathIds: [implicitMemoizedPath.id],
    performanceConfig: implicitMemoizedPerformance,
    schema: pipelineEvidenceSchema,
  });
}

test("cacheKey without lifecycle resolves to memoized miss and reuse semantics", () => {
  const zero = implicitMemoizedSnapshot({ hits: 0, misses: 0 });
  const cold = implicitMemoizedSnapshot({ hits: 0, misses: 1 });
  const warm = implicitMemoizedSnapshot({ hits: 1, misses: 1 });
  const sustained = implicitMemoizedSnapshot({ hits: 2, misses: 1 });
  const coldHit = implicitMemoizedSnapshot({ hits: 1, misses: 0 });
  const warmMiss = implicitMemoizedSnapshot({ hits: 0, misses: 2 });
  const afterWarmMiss = implicitMemoizedSnapshot({ hits: 1, misses: 2 });
  const pass = implicitMemoizedRegistration.passes[0];

  const valid = evaluateImplicitMemoized([zero, cold, warm, sustained]);
  const invalidCold = evaluateImplicitMemoized([
    zero,
    coldHit,
    implicitMemoizedSnapshot({ hits: 2, misses: 0 }),
    implicitMemoizedSnapshot({ hits: 3, misses: 0 }),
  ]);
  const invalidReuse = evaluateImplicitMemoized([
    zero,
    cold,
    warmMiss,
    afterWarmMiss,
  ]);

  expect(pass).not.toHaveProperty("lifecycle");
  expect(pass?.cacheKey).toEqual(["source.id"]);
  expect(valid.errors).toEqual([]);
  expect(invalidCold.errors).toContainEqual(
    expect.stringMatching(/fresh lifecycle with a miss and execution/i),
  );
  expect(invalidReuse.errors).toContainEqual(
    expect.stringMatching(/warm cache reuse with a hit/i),
  );
});
