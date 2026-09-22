import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  defineToolcraft,
  defineToolcraftPerformance,
  deriveToolcraftPerformancePaths,
  registerToolcraftRendererPipeline,
  type ToolcraftRendererPipelinePassContract,
} from "@/toolcraft/runtime";
import type { ToolcraftPerformancePipelinePhase } from "../src/app/test-evidence/browser-performance-contract";

import { attachedEvidenceTypes } from "./browser-semantic-evidence-test-helpers";
import {
  compileToolcraftPerformancePathAdapterMatrix,
} from "./performance-path-adapter-matrix";
import { runToolcraftPerformancePath } from "./performance-path-helpers";
import {
  TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV,
  TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH_ENV,
} from "./performance-fixture-selection";

const canvasSelector = "[data-render-scale-canvas]";
const originalFixtureResolutionMode =
  process.env[TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV];
const originalRequestAuthorityHash =
  process.env[TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH_ENV];

test.beforeEach(() => {
  process.env[TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV] =
    "full-certification";
  delete process.env[TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH_ENV];
});

test.afterEach(() => {
  if (originalFixtureResolutionMode === undefined) {
    delete process.env[TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV];
  } else {
    process.env[TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV] =
      originalFixtureResolutionMode;
  }
  if (originalRequestAuthorityHash === undefined) {
    delete process.env[TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH_ENV];
  } else {
    process.env[TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH_ENV] =
      originalRequestAuthorityHash;
  }
});

const renderScaleSchema = defineToolcraft({
  base: {
    identity: { id: "contract-fixture", title: "Contract fixture" },
    canvas: { enabled: true, renderScale: true },
    panels: {
      controls: {
        sections: [
          {
            id: "test-section-1",
            controls: {
              color: {
                applicability: { mode: "always" as const },
                defaultValue: "#ffffff",
                label: "Color",
                performanceRole: "responsiveness",
                target: "appearance.color",
                type: "color",
              },
            },
            title: "Appearance",
          },
        ],
        title: "Controls",
      },
    },
  },
  modules: [],
});

type RenderScalePipelinePasses = {
  composite: ToolcraftRendererPipelinePassContract<void>;
};

const renderScaleRegistration =
  registerToolcraftRendererPipeline<RenderScalePipelinePasses>()({
    interactionInvalidation: [
      {
        interaction: "control-drag",
        invalidates: ["composite"],
        mustNotInvalidate: [],
        targets: ["appearance.color"],
      },
    ],
    passes: [
      {
        cost: {
          dimensions: [],
          frequency: "interaction",
          relationship: "constant",
        },
        id: "composite",
        inputs: ["appearance.color"],
        invalidatedBy: ["appearance.color"],
        kind: "composite",
        output: "preview",
        quality: "full",
        runsOn: "main",
      },
    ],
    runtimeId: "render-scale-runner-test-v1",
  });

const renderScalePerformance = defineToolcraftPerformance({
  fixtureAdapters: { dimensions: {} },
  rendererPipeline: renderScaleRegistration,
  rendererStrategy: "webgl",
  scenarios: [],
  usesCustomRenderer: true,
  workloadEnvelope: { dimensions: [] },
});

const [renderScalePath] = deriveToolcraftPerformancePaths(
  renderScaleSchema,
  renderScalePerformance,
);

async function setBackingScale(
  page: Page,
  backingScale: number,
): Promise<void> {
  await page.locator(canvasSelector).evaluate((element, scale) => {
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error("Fixture must target a canvas.");
    }
    const rect = element.getBoundingClientRect();
    element.width = Math.round(rect.width * window.devicePixelRatio * scale);
    element.height = Math.round(rect.height * window.devicePixelRatio * scale);
  }, backingScale);
}

async function installFixture(page: Page): Promise<void> {
  await page.setContent(`
    <canvas
      data-render-scale-canvas
      style="display:block;width:120px;height:80px"
    ></canvas>
    <output
      hidden
      data-toolcraft-pipeline-evidence="${renderScaleRegistration.runtimeId}"
    ></output>
  `);
  await setBackingScale(page, 2);
  await page.evaluate((runtimeId) => {
    const counters = {
      activeResources: 0,
      cacheHits: 0,
      cacheMisses: 0,
      durationMax: 0,
      durationTotal: 0,
      executions: 0,
      resourceCreations: 0,
      resourceDisposals: 0,
      transfers: 0,
    };
    const state = {
      outcome: 0,
      snapshot: {
        disposed: false,
        passes: { composite: counters },
        runtimeId,
      },
    };
    Reflect.set(globalThis, "__renderScaleRunnerTestState", state);
    Object.defineProperty(
      document.querySelector("[data-toolcraft-pipeline-evidence]"),
      Symbol.for("toolcraft.renderer-pipeline-evidence.snapshot"),
      { value: () => state.snapshot },
    );
  }, renderScaleRegistration.runtimeId);
}

type PhaseScale = Readonly<Record<ToolcraftPerformancePipelinePhase, number>>;

function compileRunner(
  backingScaleByPhase: PhaseScale,
  prepare: () => Promise<void> = async () => undefined,
  afterAction?: (page: Page) => Promise<void>,
) {
  return compileToolcraftPerformancePathAdapterMatrix({
    adapters: [
      {
        action: async ({ page, phase }) => {
          await page.evaluate(
            ({ scale, selector }) => {
              const state = Reflect.get(
                globalThis,
                "__renderScaleRunnerTestState",
              ) as {
                outcome: number;
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
              state.outcome += 1;
              const pass = state.snapshot.passes.composite;
              pass.cacheMisses += 1;
              pass.durationMax = 1;
              pass.durationTotal += 1;
              pass.executions += 1;
              const canvas = document.querySelector(selector);
              if (!(canvas instanceof HTMLCanvasElement)) {
                throw new Error("Render-scale runner fixture lost its canvas.");
              }
              const rect = canvas.getBoundingClientRect();
              canvas.width = Math.round(
                rect.width * window.devicePixelRatio * scale,
              );
              canvas.height = Math.round(
                rect.height * window.devicePixelRatio * scale,
              );
            },
            { scale: backingScaleByPhase[phase], selector: canvasSelector },
          );
          await afterAction?.(page);
        },
        observeOutcome: ({ page }) =>
          page.evaluate(
            () =>
              (
                Reflect.get(globalThis, "__renderScaleRunnerTestState") as {
                  outcome: number;
                }
              ).outcome,
          ),
        pathId: renderScalePath!.id,
        prepare,
      },
    ],
    canvasBacking: { canvasSelector },
    paths: [renderScalePath!],
    schema: renderScaleSchema,
  })[0]!;
}

test("runner preserves an undefined phase rejection when guard disposal fails", async ({
  page,
}) => {
  await installFixture(page);
  const outcome = await runToolcraftPerformancePath(
    page,
    renderScaleSchema,
    renderScalePerformance,
    compileRunner(
      { cold: 2, sustained: 2, warm: 2 },
      async () => undefined,
      async (currentPage) => {
        await currentPage.evaluate(() => {
          const stateKey = Object.getOwnPropertyNames(globalThis).find((key) =>
            key.startsWith("__toolcraftCanvasQualityObserver"),
          );
          if (!stateKey) {
            throw new Error(
              "Quality guard fixture could not find observer state.",
            );
          }
          const state = Reflect.get(globalThis, stateKey) as {
            flush: () => Promise<void>;
          };
          Reflect.set(globalThis, stateKey, {
            dispose: () => {
              throw new Error("forced guard disposal failure");
            },
            flush: state.flush,
          });
        });
        return Promise.reject(undefined);
      },
    ),
  ).then(
    () => ({ status: "resolved" as const }),
    (reason: unknown) => ({ reason, status: "rejected" as const }),
  );

  expect(outcome).toEqual({ reason: undefined, status: "rejected" });
});

test("requestless performance runner rejects before adapter operations", async ({
  page,
}) => {
  const previousMode =
    process.env[TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV];
  const previousAuthority =
    process.env[TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH_ENV];
  delete process.env[TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV];
  delete process.env[TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH_ENV];
  let prepareCount = 0;

  try {
    await expect(
      runToolcraftPerformancePath(
        page,
        renderScaleSchema,
        renderScalePerformance,
        compileRunner({ cold: 2, sustained: 2, warm: 2 }, async () => {
          prepareCount += 1;
        }),
      ),
    ).rejects.toThrow(/must be strict-development or full-certification/iu);
    expect(prepareCount).toBe(0);
  } finally {
    if (previousMode === undefined) {
      delete process.env[TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV];
    } else {
      process.env[TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE_ENV] =
        previousMode;
    }
    if (previousAuthority === undefined) {
      delete process.env[TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH_ENV];
    } else {
      process.env[TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH_ENV] =
        previousAuthority;
    }
  }
});

test("browser perf: runner proves real render-scale backing", async ({
  page,
}, testInfo: TestInfo) => {
  await installFixture(page);
  const attachmentCount = testInfo.attachments.length;

  await runToolcraftPerformancePath(
    page,
    renderScaleSchema,
    renderScalePerformance,
    compileRunner({ cold: 2, sustained: 2, warm: 2 }),
  );

  expect(
    attachedEvidenceTypes(testInfo, attachmentCount).filter(
      (type) => type === "performance-render-scale",
    ),
  ).toHaveLength(3);
});

for (const failedPhase of ["cold", "warm", "sustained"] as const) {
  test(`browser perf: runner rejects a ${failedPhase} render-scale quality clamp`, async ({
    page,
  }, testInfo: TestInfo) => {
    await installFixture(page);
    const attachmentCount = testInfo.attachments.length;
    const scaleByPhase: PhaseScale = { cold: 2, sustained: 2, warm: 2 };

    await expect(
      runToolcraftPerformancePath(
        page,
        renderScaleSchema,
        renderScalePerformance,
        compileRunner({ ...scaleByPhase, [failedPhase]: 1 }),
      ),
    ).rejects.toThrow(new RegExp(`${failedPhase}.*backing width`, "iu"));
    const attachedQuality = testInfo.attachments
      .slice(attachmentCount)
      .filter((attachment) =>
        attachment.body?.toString().includes("performance-render-scale"),
      )
      .map((attachment) => attachment.body?.toString() ?? "");
    expect(attachedQuality).not.toContainEqual(
      expect.stringContaining(`${renderScalePath!.id}#${failedPhase}`),
    );
  });
}
