import { expect, type Page } from "@playwright/test";
import {
  deriveToolcraftPerformancePaths,
  isToolcraftRendererPipelineRegistration,
  type ToolcraftPerformanceConfig,
} from "@/toolcraft/runtime";

import {
  TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME,
  TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_CONTENT_TYPE,
  TOOLCRAFT_PERFORMANCE_PIPELINE_PHASES,
  createToolcraftPerformancePipelineSnapshot,
  serializeToolcraftBrowserPerformanceEvidence,
  type ToolcraftBrowserPerformanceAttachment,
  type ToolcraftPerformancePipelineEvidence,
  type ToolcraftPerformancePipelinePhase,
} from "../src/app/test-evidence/browser-performance-contract";
import { appSchema } from "../src/app/app-schema";
import { attachToolcraftBrowserPerformanceEvidence } from "./browser-performance-evidence";
import { evaluateToolcraftBrowserPerformanceEvidence } from "./browser-performance-report";
import { createCanonicalZeroPipelineSnapshot } from "./performance-pipeline-invariants";
import { readToolcraftRendererPipelineSnapshot } from "./browser-pipeline-snapshot";

async function readToolcraftPipelineSnapshot(
  page: Page,
): Promise<ReturnType<typeof createToolcraftPerformancePipelineSnapshot>> {
  return createToolcraftPerformancePipelineSnapshot(await readToolcraftRendererPipelineSnapshot(page));
}

async function readDocumentTimeOrigin(page: Page): Promise<number> {
  return page.evaluate(() => performance.timeOrigin);
}

export type ToolcraftPipelineInvariantAction = (
  phase: ToolcraftPerformancePipelinePhase,
) => Promise<void>;

export type ToolcraftPipelineInvariantLifecycle = Readonly<{
  preparePhase?: ToolcraftPipelineInvariantAction;
  runPhase: ToolcraftPipelineInvariantAction;
  settlePreparedPhase?: ToolcraftPipelineInvariantAction;
}>;

async function settlePreparedPipelinePhase(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

export async function expectToolcraftPipelinePassExecutions(
  page: Page,
  appPerformance: ToolcraftPerformanceConfig,
  passId: string,
  expectedExecutions: number,
): Promise<void> {
  if (!Number.isSafeInteger(expectedExecutions) || expectedExecutions < 0) {
    throw new Error(
      "Toolcraft pipeline execution expectation must be a non-negative safe integer.",
    );
  }
  const rendererPipeline = appPerformance.rendererPipeline;
  if (!isToolcraftRendererPipelineRegistration(rendererPipeline)) {
    throw new Error(
      "Toolcraft pipeline execution assertion requires the canonical executable renderer pipeline registration.",
    );
  }
  if (!rendererPipeline.passes.some((pass) => pass.id === passId)) {
    throw new Error(`Unknown canonical Toolcraft renderer pass "${passId}".`);
  }

  await expect
    .poll(async () => {
      const snapshot = await readToolcraftPipelineSnapshot(page);
      if (snapshot.runtimeId !== rendererPipeline.runtimeId) {
        throw new Error(
          `Toolcraft pipeline runtimeId "${snapshot.runtimeId}" does not match executable registration runtimeId "${rendererPipeline.runtimeId}".`,
        );
      }
      const pass = snapshot.passes.find((candidate) => candidate.passId === passId);
      if (!pass) {
        throw new Error(
          `Toolcraft pipeline snapshot is missing canonical pass "${passId}".`,
        );
      }
      return pass.executions;
    })
    .toBe(expectedExecutions);
}

export async function expectToolcraftPipelineInvariant(
  page: Page,
  appPerformance: ToolcraftPerformanceConfig,
  pathId: string,
  lifecycle: ToolcraftPipelineInvariantLifecycle,
): Promise<void> {
  if (!isToolcraftRendererPipelineRegistration(appPerformance.rendererPipeline)) {
    throw new Error(
      "Toolcraft pipeline evidence requires the canonical executable renderer pipeline registration.",
    );
  }

  const path = deriveToolcraftPerformancePaths(appSchema, appPerformance).find(
    (candidate) => candidate.id === pathId,
  );
  if (!path) {
    throw new Error(`Unknown canonical Toolcraft performance path "${pathId}".`);
  }

  const serializedObservations: string[] = [];
  const initialRender = path.interaction === "initial-render";
  const canonicalZeroSnapshot = createCanonicalZeroPipelineSnapshot(
    appPerformance.rendererPipeline,
  );
  for (const phase of TOOLCRAFT_PERFORMANCE_PIPELINE_PHASES) {
    await lifecycle.preparePhase?.(phase);
    if (lifecycle.settlePreparedPhase) {
      await lifecycle.settlePreparedPhase(phase);
    } else {
      await settlePreparedPipelinePhase(page);
    }
    const before = initialRender
      ? canonicalZeroSnapshot
      : await readToolcraftPipelineSnapshot(page);
    const documentTimeOriginBefore = initialRender
      ? await readDocumentTimeOrigin(page)
      : undefined;
    await lifecycle.runPhase(phase);
    if (
      initialRender &&
      (await readDocumentTimeOrigin(page)) === documentTimeOriginBefore
    ) {
      throw new Error(
        `Toolcraft initial-render phase "${phase}" must navigate or reload into a fresh document lifecycle.`,
      );
    }
    const after = await readToolcraftPipelineSnapshot(page);
    const observation: Omit<ToolcraftPerformancePipelineEvidence, "version"> = {
      after,
      before,
      evidenceType: "performance-pipeline",
      pathId: path.id,
      phase,
      profile: path.profile,
    };
    serializedObservations.push(
      serializeToolcraftBrowserPerformanceEvidence(observation),
    );
  }

  const attachments: ToolcraftBrowserPerformanceAttachment[] =
    serializedObservations.map((body) => ({
      body,
      contentType: TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_CONTENT_TYPE,
      name: TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME,
    }));
  const evaluation = evaluateToolcraftBrowserPerformanceEvidence({
    attachments,
    expectedPathIds: [path.id],
    performanceConfig: appPerformance,
    schema: appSchema,
  });
  if (evaluation.errors.length > 0) {
    throw new Error(
      `Toolcraft pipeline invariant failed:\n${evaluation.errors.join("\n")}`,
    );
  }

  for (const body of serializedObservations) {
    await attachToolcraftBrowserPerformanceEvidence(body);
  }
}
