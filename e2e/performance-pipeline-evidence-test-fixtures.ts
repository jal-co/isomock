import type { Page } from "@playwright/test";
import {
  TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME,
  TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_CONTENT_TYPE,
  serializeToolcraftBrowserPerformanceEvidence,
  type ToolcraftPerformancePipelineEvidence,
  type ToolcraftPerformancePipelinePhase,
  type ToolcraftPerformancePipelineSnapshot,
} from "../src/app/test-evidence/browser-performance-contract";
import { evaluateToolcraftBrowserPerformanceEvidence } from "./browser-performance-report";
import {
  activePipelinePath,
  cachedPipelinePath,
  fieldDisablePipelinePath,
  initialPipelinePath,
  pipelineEvidencePerformance,
  pipelineEvidenceRegistration,
  pipelineEvidenceSchema,
  retainedAccessPipelinePath,
  stableCachedPipelinePath,
  unchangedPipelinePath,
} from "./performance-pipeline-evidence-test-contract";

export const zeroPipelinePassCounters = () => ({
  activeResources: 0,
  cacheHits: 0,
  cacheMisses: 0,
  durationMax: 0,
  durationTotal: 0,
  executions: 0,
  resourceCreations: 0,
  resourceDisposals: 0,
  transfers: 0,
});

export function pipelineSnapshot(
  overrides: Partial<
    Record<
      "composite" | "decode" | "simulate",
      Partial<ReturnType<typeof zeroPipelinePassCounters>>
    >
  > = {},
): ToolcraftPerformancePipelineSnapshot {
  return {
    disposed: false,
    passes: (["decode", "simulate", "composite"] as const).map((passId) => ({
      passId,
      ...zeroPipelinePassCounters(),
      ...overrides[passId],
    })),
    runtimeId: pipelineEvidenceRegistration.runtimeId,
  };
}

export function pipelineEvidence(
  phase: ToolcraftPerformancePipelinePhase,
  before = pipelineSnapshot(),
  after = pipelineSnapshot(),
  path = activePipelinePath,
): Omit<ToolcraftPerformancePipelineEvidence, "version"> {
  return {
    after,
    before,
    evidenceType: "performance-pipeline",
    pathId: path.id,
    phase,
    profile: path.profile,
  };
}

export function pipelineEvidenceAttachment(
  observation: Omit<ToolcraftPerformancePipelineEvidence, "version">,
) {
  return {
    body: serializeToolcraftBrowserPerformanceEvidence(observation),
    contentType: TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_CONTENT_TYPE,
    name: TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME,
  };
}

export function evaluatePipelineEvidence(
  attachments: ReturnType<typeof pipelineEvidenceAttachment>[],
  expectedPathIds: readonly string[] = [activePipelinePath.id],
) {
  return evaluateToolcraftBrowserPerformanceEvidence({
    attachments,
    expectedPathIds,
    performanceConfig: pipelineEvidencePerformance,
    schema: pipelineEvidenceSchema,
  });
}

export function noCacheActivitySnapshot(executions: number) {
  return pipelineSnapshot({
    composite: {
      cacheMisses: executions,
      durationMax: executions === 0 ? 0 : 1,
      durationTotal: executions,
      executions,
    },
  });
}

export function cachedActivitySnapshot({
  hits,
  misses,
}: {
  hits: number;
  misses: number;
}) {
  return pipelineSnapshot({
    decode: {
      cacheHits: hits,
      cacheMisses: misses,
      durationMax: misses === 0 ? 0 : 1,
      durationTotal: misses,
      executions: misses,
      resourceCreations: misses,
      resourceDisposals: Math.max(0, misses - 1),
      activeResources: misses === 0 ? 0 : 1,
    },
  });
}

export function activePipelineAttachments() {
  const snapshots = [0, 1, 2, 3].map(noCacheActivitySnapshot);
  return (["cold", "warm", "sustained"] as const).map((phase, index) =>
    pipelineEvidenceAttachment(
      pipelineEvidence(phase, snapshots[index], snapshots[index + 1]),
    ),
  );
}

function preparedSimulationSnapshot(
  compositeExecutions: number,
  simulationExecutions: number,
  resourceLifecycles: number,
  resourceActive: boolean,
) {
  return pipelineSnapshot({
    composite: {
      cacheMisses: compositeExecutions,
      durationMax: compositeExecutions === 0 ? 0 : 1,
      durationTotal: compositeExecutions,
      executions: compositeExecutions,
    },
    simulate: {
      cacheMisses: simulationExecutions,
      durationMax: simulationExecutions === 0 ? 0 : 1,
      durationTotal: simulationExecutions,
      executions: simulationExecutions,
    },
    decode: {
      activeResources: resourceActive ? 1 : 0,
      cacheMisses: resourceLifecycles,
      durationMax: resourceLifecycles === 0 ? 0 : 1,
      durationTotal: resourceLifecycles,
      executions: resourceLifecycles,
      resourceCreations: resourceLifecycles,
      resourceDisposals: resourceLifecycles - (resourceActive ? 1 : 0),
    },
  });
}

export function preparationPipelineAttachments(
  measuredPreparationMutation = false,
) {
  return (["cold", "warm", "sustained"] as const).map((phase, index) => {
    const before = preparedSimulationSnapshot(
      index,
      index + 1,
      index + 1,
      true,
    );
    const after = preparedSimulationSnapshot(
      index + 1,
      index + 1 + (measuredPreparationMutation && index === 0 ? 1 : 0),
      index + 1,
      false,
    );
    return pipelineEvidenceAttachment(
      pipelineEvidence(phase, before, after, fieldDisablePipelinePath),
    );
  });
}

export function cachedPipelineAttachments() {
  const snapshots = [0, 1, 2, 3].map((misses) =>
    cachedActivitySnapshot({ hits: 0, misses }),
  );
  return (["cold", "warm", "sustained"] as const).map((phase, index) =>
    pipelineEvidenceAttachment(
      pipelineEvidence(
        phase,
        snapshots[index],
        snapshots[index + 1],
        cachedPipelinePath,
      ),
    ),
  );
}

export function stableCachedPipelineAttachments() {
  const coldBefore = cachedActivitySnapshot({ hits: 0, misses: 0 });
  const coldAfter = cachedActivitySnapshot({ hits: 0, misses: 1 });
  const warmAfter = cachedActivitySnapshot({ hits: 1, misses: 1 });
  const sustainedAfter = cachedActivitySnapshot({ hits: 2, misses: 1 });
  return [
    pipelineEvidenceAttachment(
      pipelineEvidence("cold", coldBefore, coldAfter, stableCachedPipelinePath),
    ),
    pipelineEvidenceAttachment(
      pipelineEvidence("warm", coldAfter, warmAfter, stableCachedPipelinePath),
    ),
    pipelineEvidenceAttachment(
      pipelineEvidence(
        "sustained",
        warmAfter,
        sustainedAfter,
        stableCachedPipelinePath,
      ),
    ),
  ];
}

export function unchangedPipelineAttachments() {
  return (["cold", "warm", "sustained"] as const).map((phase) =>
    pipelineEvidenceAttachment(
      pipelineEvidence(
        phase,
        pipelineSnapshot(),
        pipelineSnapshot(),
        unchangedPipelinePath,
      ),
    ),
  );
}

export function retainedAccessPipelineAttachments() {
  return (["cold", "warm", "sustained"] as const).map((phase, index) => {
    const before = pipelineSnapshot({
      composite: {
        cacheMisses: index,
        durationMax: index === 0 ? 0 : 1,
        durationTotal: index,
        executions: index,
      },
      decode: {
        activeResources: 1,
        cacheHits: index,
        cacheMisses: 1,
        durationMax: 1,
        durationTotal: 1,
        executions: 1,
        resourceCreations: 1,
      },
    });
    const after = pipelineSnapshot({
      composite: {
        cacheMisses: index + 1,
        durationMax: 1,
        durationTotal: index + 1,
        executions: index + 1,
      },
      decode: {
        activeResources: 1,
        cacheHits: index + 1,
        cacheMisses: 1,
        durationMax: 1,
        durationTotal: 1,
        executions: 1,
        resourceCreations: 1,
      },
    });
    return pipelineEvidenceAttachment(
      pipelineEvidence(phase, before, after, retainedAccessPipelinePath),
    );
  });
}

export function initialPipelineAttachments() {
  return (["cold", "warm", "sustained"] as const).map((phase) =>
    pipelineEvidenceAttachment(
      pipelineEvidence(
        phase,
        pipelineSnapshot(),
        noCacheActivitySnapshot(1),
        initialPipelinePath,
      ),
    ),
  );
}

export async function installPipelineEvidenceBridge(page: Page): Promise<void> {
  await page.setContent(
    `<output hidden data-toolcraft-pipeline-evidence="${pipelineEvidenceRegistration.runtimeId}"></output>`,
  );
  await page.evaluate((runtimeId) => {
    const counters = () => ({
      activeResources: 0,
      cacheHits: 0,
      cacheMisses: 0,
      durationMax: 0,
      durationTotal: 0,
      executions: 0,
      resourceCreations: 0,
      resourceDisposals: 0,
      transfers: 0,
    });
    const state = {
      actionCount: 0,
      snapshot: {
        disposed: false,
        passes: {
          composite: counters(),
          decode: counters(),
          simulate: counters(),
        },
        runtimeId,
      },
    };
    Reflect.set(globalThis, "__toolcraftPipelineEvidenceTestState", state);
    const bridge = document.querySelector("[data-toolcraft-pipeline-evidence]");
    Object.defineProperty(
      bridge,
      Symbol.for("toolcraft.renderer-pipeline-evidence.snapshot"),
      { value: () => state.snapshot },
    );
  }, pipelineEvidenceRegistration.runtimeId);
}

export async function navigateToFreshInitialPipelineBridge(
  page: Page,
  sampleId: string,
): Promise<void> {
  const runtimeId = pipelineEvidenceRegistration.runtimeId;
  const html = `
    <output hidden data-sample-id=${JSON.stringify(sampleId)} data-toolcraft-pipeline-evidence="${runtimeId}"></output>
    <script>
      const counters = () => ({
        activeResources: 0,
        cacheHits: 0,
        cacheMisses: 0,
        durationMax: 0,
        durationTotal: 0,
        executions: 0,
        resourceCreations: 0,
        resourceDisposals: 0,
        transfers: 0,
      });
      const state = {
        snapshot: {
          disposed: false,
          passes: { composite: counters(), decode: counters(), simulate: counters() },
          runtimeId: ${JSON.stringify(runtimeId)},
        },
      };
      state.snapshot.passes.composite.cacheMisses = 1;
      state.snapshot.passes.composite.durationMax = 1;
      state.snapshot.passes.composite.durationTotal = 1;
      state.snapshot.passes.composite.executions = 1;
      Object.defineProperty(
        document.querySelector("[data-toolcraft-pipeline-evidence]"),
        Symbol.for("toolcraft.renderer-pipeline-evidence.snapshot"),
        { value: () => state.snapshot },
      );
    </script>
  `;
  await page.goto(
    `data:text/html;charset=utf-8,${encodeURIComponent(html)}#${encodeURIComponent(sampleId)}`,
  );
}
