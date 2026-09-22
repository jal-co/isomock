import { expect, test } from "@playwright/test";

import {
  TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME,
  parseToolcraftBrowserPerformanceEvidence,
  type ToolcraftPerformancePipelineEvidence,
} from "../src/app/test-evidence/browser-performance-contract";
import {
  installPipelineEvidenceBridge,
  navigateToFreshInitialPipelineBridge,
} from "./performance-pipeline-evidence-test-fixtures";
import {
  activePipelinePath,
  fieldDisablePipelinePath,
  initialPipelinePath,
  pipelineEvidencePerformance,
  pipelineEvidenceSchema,
} from "./performance-pipeline-evidence-test-contract";
import { expectToolcraftPipelineInvariant } from "./performance-pipeline-evidence";
import { runToolcraftPerformancePath } from "./performance-path-helpers";

function attachedPipelineEvidence(
  attachments: Parameters<typeof parseToolcraftBrowserPerformanceEvidence>[0][],
): ToolcraftPerformancePipelineEvidence[] {
  return attachments.map((attachment) => {
    const evidence = parseToolcraftBrowserPerformanceEvidence(attachment);
    expect(evidence).toBeDefined();
    return evidence!;
  });
}

test("helper observes phase-aware actions and attaches only the evaluated set", async ({
  page,
}, testInfo) => {
  await installPipelineEvidenceBridge(page);
  const attachmentCountBefore = testInfo.attachments.length;
  const lifecycleCalls: string[] = [];

  await expectToolcraftPipelineInvariant(
    page,
    pipelineEvidencePerformance,
    activePipelinePath.id,
    {
      preparePhase: async (phase) => {
        lifecycleCalls.push(`prepare:${phase}`);
        await page.evaluate(() => {
          requestAnimationFrame(() => {
            const state = Reflect.get(
              globalThis,
              "__toolcraftPipelineEvidenceTestState",
            ) as {
              snapshot: {
                passes: {
                  composite: {
                    cacheMisses: number;
                    durationMax: number;
                    durationTotal: number;
                    executions: number;
                  };
                };
              };
            };
            const counters = state.snapshot.passes.composite;
            counters.cacheMisses += 1;
            counters.durationMax = 1;
            counters.durationTotal += 1;
            counters.executions += 1;
          });
        });
      },
      runPhase: async (phase) => {
        lifecycleCalls.push(`run:${phase}`);
        await page.evaluate(() => {
        const state = Reflect.get(
          globalThis,
          "__toolcraftPipelineEvidenceTestState",
        ) as {
          snapshot: {
            passes: {
              composite: {
                cacheMisses: number;
                durationMax: number;
                durationTotal: number;
                executions: number;
              };
            };
          };
        };
        const counters = state.snapshot.passes.composite;
        counters.cacheMisses += 1;
        counters.durationMax = 1;
        counters.durationTotal += 1;
        counters.executions += 1;
      });
      },
    },
  );

  expect(lifecycleCalls).toEqual([
    "prepare:cold",
    "run:cold",
    "prepare:warm",
    "run:warm",
    "prepare:sustained",
    "run:sustained",
  ]);
  const evidence = attachedPipelineEvidence(
    testInfo.attachments.slice(attachmentCountBefore),
  );
  expect(evidence.map(({ phase }) => phase)).toEqual([
    "cold",
    "warm",
    "sustained",
  ]);
  expect(
    evidence.map(({ before, after }) => {
      const beforePass = before.passes.find(
        ({ passId }) => passId === "composite",
      )!;
      const afterPass = after.passes.find(
        ({ passId }) => passId === "composite",
      )!;
      return [beforePass.executions, afterPass.executions];
    }),
  ).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
  ]);
});

test("path runner isolates Field-disable preparation simulation from measured action", async ({
  page,
}, testInfo) => {
  const previousResolutionMode =
    process.env.TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE;
  const previousRequestAuthority =
    process.env.TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH;
  process.env.TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE =
    "strict-development";
  process.env.TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH = "a".repeat(64);
  const attachmentCountBefore = testInfo.attachments.length;
  const lifecycleCalls: string[] = [];
  try {
    await runToolcraftPerformancePath(
    page,
    pipelineEvidenceSchema,
    pipelineEvidencePerformance,
    {
      adapter: {
        action: async ({ phase }) => {
          lifecycleCalls.push(`run:${phase}`);
          await page.evaluate(() => {
            const state = Reflect.get(
              globalThis,
              "__toolcraftPipelineEvidenceTestState",
            ).snapshot.passes;
            const counters = state.composite;
            counters.cacheMisses += 1;
            counters.durationMax = 1;
            counters.durationTotal += 1;
            counters.executions += 1;
            state.decode.activeResources -= 1;
            state.decode.resourceDisposals += 1;
          });
        },
        observeOutcome: ({ phase }) => `observed:${phase}`,
        pathId: fieldDisablePipelinePath.id,
        prepare: installPipelineEvidenceBridge,
        preparePhase: async ({ phase }) => {
          lifecycleCalls.push(`prepare:${phase}`);
          await page.evaluate(() => {
            requestAnimationFrame(() => requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                const passes = Reflect.get(
                  globalThis,
                  "__toolcraftPipelineEvidenceTestState",
                ).snapshot.passes;
                for (const counters of [passes.simulate, passes.decode]) {
                  counters.cacheMisses += 1;
                  counters.durationMax = 1;
                  counters.durationTotal += 1;
                  counters.executions += 1;
                }
                passes.decode.activeResources += 1;
                passes.decode.resourceCreations += 1;
              }),
            ));
          });
        },
        settlePhase: async ({ phase }) => {
          lifecycleCalls.push(`settle:${phase}`);
          await page.evaluate(() =>
            new Promise<void>((resolve) => {
              let remaining = 4;
              const advance = () => {
                remaining -= 1;
                if (remaining === 0) resolve();
                else requestAnimationFrame(advance);
              };
              requestAnimationFrame(advance);
            }),
          );
        },
      },
      canvasBacking: undefined,
      path: fieldDisablePipelinePath,
      testName: "non-measured Field-disable lifecycle integration",
    },
    {
      measureInteraction: async (_page, action, options) => {
        await action();
        await options.observeOutcome?.();
        return {
          droppedFrameCount: 0,
          droppedFrameRatio: 0,
          durationMs: 0,
          frameGapP50Ms: 0,
          frameGapP95Ms: 0,
          frameGapP99Ms: 0,
          frameGapsMs: [0],
          longTaskCount: 0,
          longTaskMaxMs: 0,
          maxFrameGapMs: 0,
          sampleCount: 1,
        };
      },
    },
    );
  } finally {
    if (previousResolutionMode === undefined) {
      delete process.env.TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE;
    } else {
      process.env.TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE =
        previousResolutionMode;
    }
    if (previousRequestAuthority === undefined) {
      delete process.env.TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH;
    } else {
      process.env.TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH =
        previousRequestAuthority;
    }
  }

  expect(lifecycleCalls).toEqual([
    "prepare:cold",
    "settle:cold",
    "run:cold",
    "prepare:warm",
    "settle:warm",
    "run:warm",
    "prepare:sustained",
    "settle:sustained",
    "run:sustained",
  ]);
  const evidence = attachedPipelineEvidence(
    testInfo.attachments.slice(attachmentCountBefore).filter(
      ({ name }) =>
        name === TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME,
    ),
  );
  expect(evidence.map(({ before, after }) => ({
    measured: [
      before.passes.find(({ passId }) => passId === "composite")?.executions,
      after.passes.find(({ passId }) => passId === "composite")?.executions,
    ],
    prepared: [
      before.passes.find(({ passId }) => passId === "simulate")?.executions,
      after.passes.find(({ passId }) => passId === "simulate")?.executions,
    ],
    retired: [
      before.passes.find(({ passId }) => passId === "decode")?.activeResources,
      after.passes.find(({ passId }) => passId === "decode")?.activeResources,
    ],
  }))).toEqual([
    { measured: [0, 1], prepared: [1, 1], retired: [1, 0] },
    { measured: [1, 2], prepared: [2, 2], retired: [1, 0] },
    { measured: [2, 3], prepared: [3, 3], retired: [1, 0] },
  ]);
});

test("failed action or invariant leaves testInfo.attachments unchanged", async ({
  page,
}, testInfo) => {
  await installPipelineEvidenceBridge(page);
  const attachmentCountBefore = testInfo.attachments.length;

  await expect(
    expectToolcraftPipelineInvariant(
      page,
      pipelineEvidencePerformance,
      activePipelinePath.id,
      {
        runPhase: async (phase) => {
          if (phase === "warm") throw new Error("action failed");
        },
      },
    ),
  ).rejects.toThrow(/action failed/i);
  expect(testInfo.attachments).toHaveLength(attachmentCountBefore);

  await installPipelineEvidenceBridge(page);
  await expect(
    expectToolcraftPipelineInvariant(
      page,
      pipelineEvidencePerformance,
      activePipelinePath.id,
      { runPhase: async () => {} },
    ),
  ).rejects.toThrow(/pipeline invariant failed/i);
  expect(testInfo.attachments).toHaveLength(attachmentCountBefore);
});

test("initial-render captures three independent fresh document lifecycles", async ({
  page,
}, testInfo) => {
  await installPipelineEvidenceBridge(page);
  const attachmentCountBefore = testInfo.attachments.length;

  await expectToolcraftPipelineInvariant(
    page,
    pipelineEvidencePerformance,
    initialPipelinePath.id,
    {
      runPhase: async (phase) =>
        navigateToFreshInitialPipelineBridge(page, phase),
    },
  );

  const evidence = attachedPipelineEvidence(
    testInfo.attachments.slice(attachmentCountBefore),
  );
  expect(evidence).toHaveLength(3);
  for (const observation of evidence) {
    expect(
      observation.before.passes.every((pass) =>
        [
          pass.cacheHits,
          pass.cacheMisses,
          pass.activeResources,
          pass.durationMax,
          pass.durationTotal,
          pass.executions,
          pass.resourceCreations,
          pass.resourceDisposals,
          pass.transfers,
        ].every((value) => value === 0),
      ),
    ).toBe(true);
    expect(
      observation.after.passes.find(({ passId }) => passId === "composite")
        ?.executions,
    ).toBe(1);
  }
});

test("initial-render rejects a post-mount action that does not create a document", async ({
  page,
}, testInfo) => {
  await installPipelineEvidenceBridge(page);
  const attachmentCountBefore = testInfo.attachments.length;

  await expect(
    expectToolcraftPipelineInvariant(
      page,
      pipelineEvidencePerformance,
      initialPipelinePath.id,
      { runPhase: async () => {} },
    ),
  ).rejects.toThrow(/navigate or reload.*fresh document lifecycle/i);
  expect(testInfo.attachments).toHaveLength(attachmentCountBefore);
});
