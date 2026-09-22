import { expect, type Page } from "@playwright/test";
import {
  compileToolcraftPerformanceFixturePlan,
  defineToolcraftPerformance,
  deriveToolcraftPerformancePaths,
} from "@/toolcraft/runtime";

import { appPerformance } from "../src/app/app-performance";
import { appSchema } from "../src/app/app-schema";
import {
  appPerformanceCanvasBacking,
  appPerformancePathAdapters,
} from "./app-performance-path-adapters";
import { expectToolcraftCanvasBackingPixelsForRenderScale } from "./browser-render-scale-evidence";
import { applyToolcraftPerformancePathCompiledFixture } from "./performance-fixture-helpers";
import { runToolcraftPerformancePath } from "./performance-path-helpers";
import { expectNoToolcraftVgpuPageErrors } from "./renderer-provider-runtime-evidence";

const canvasSelector = 'canvas[data-toolcraft-vgpu-product=""]';
const zeroDurationInteraction = Object.freeze({
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
});

function target(page: Page, name: string) {
  return page.locator(`[data-toolcraft-control-target="${name}"]`);
}

export async function runPhysicalFeedbackMaximumCanvasCase(
  page: Page,
): Promise<void> {
  const paths = deriveToolcraftPerformancePaths(appSchema, appPerformance);
  const path = paths.find(({ targets }) =>
    targets.includes("export.includeBackground"),
  );
  if (!path) throw new Error("Missing preview maximum performance path.");
  const adapter = appPerformancePathAdapters.find(({ pathId }) => pathId === path.id);
  if (!(adapter?.action && adapter.fixtureApplications && adapter.preparePhase && adapter.settlePhase)) {
    throw new Error("Incomplete preview maximum performance adapter.");
  }
  await adapter.prepare(page);
  const canvas = page.locator(canvasSelector);
  await target(page, "simulation.enabled").getByRole("switch").click();
  await expect(canvas).toHaveAttribute("data-toolcraft-gpu-status", "disabled");
  const applicationOrder = ["field-disabled"];
  const plan = compileToolcraftPerformanceFixturePlan(appPerformance, path);
  const rawApplications = adapter.fixtureApplications(page);
  const applications = Object.fromEntries(
    plan.dimensionIds.map((dimensionId) => {
      const application = rawApplications[dimensionId]!;
      return [dimensionId, {
        ...application,
        applyValue: async (value: unknown) => {
          applicationOrder.push(dimensionId);
          await application.applyValue(value);
        },
      }] as const;
    }),
  );
  await applyToolcraftPerformancePathCompiledFixture(
    appPerformance,
    path.id,
    plan,
    "maximum",
    applications,
  );
  expect(applicationOrder).toEqual(["field-disabled", ...plan.dimensionIds]);
  const expectedBacking = await canvas.evaluate((node) => ({
    height: (node as HTMLCanvasElement).height,
    width: (node as HTMLCanvasElement).width,
  }));
  expect(expectedBacking.width).toBeLessThanOrEqual(8_192);
  expect(expectedBacking.height).toBeLessThanOrEqual(8_192);
  expect(expectedBacking.width * expectedBacking.height).toBeLessThanOrEqual(44_736_512);
  const context = Object.freeze({ page, path, phase: "cold" as const });
  await adapter.preparePhase(context);
  await adapter.settlePhase(context);
  await expectToolcraftCanvasBackingPixelsForRenderScale(page, canvasSelector, 1, {
    state: "maximum-disabled-preparation",
  });
  await adapter.action(context);
  await expectToolcraftCanvasBackingPixelsForRenderScale(page, canvasSelector, 2, {
    state: "maximum-disabled-action",
  });
  const background = target(page, "export.includeBackground").getByRole("switch");
  await expect(background).toHaveAttribute("aria-checked", "true");
  await background.click();
  await expect(background).toHaveAttribute("aria-checked", "false");
  expect(await canvas.evaluate((node) => ({
    height: (node as HTMLCanvasElement).height,
    width: (node as HTMLCanvasElement).width,
  }))).toEqual(expectedBacking);
  expect(await canvas.evaluate((node) => Array.from(
    (node as HTMLCanvasElement).getContext("2d", { willReadFrequently: true })!
      .getImageData(Math.floor((node as HTMLCanvasElement).width / 2), Math.floor((node as HTMLCanvasElement).height / 2), 1, 1).data,
  ))).toEqual([0, 0, 0, 0]);
  await expectNoToolcraftVgpuPageErrors(page);
}

export async function runPhysicalFeedbackGroupedCanvasCase(
  page: Page,
  testName: string,
): Promise<void> {
  const boundedPerformance = defineToolcraftPerformance({
    ...appPerformance,
    workloadEnvelope: {
      dimensions: appPerformance.workloadEnvelope.dimensions.map((dimension) => {
        if (dimension.id === "preview-pixels") return { ...dimension, interactiveMax: 320_000 };
        if (dimension.id === "replay-steps") return { ...dimension, batchMax: 2, interactiveMax: 2 };
        return dimension;
      }),
    },
  });
  const path = deriveToolcraftPerformancePaths(appSchema, boundedPerformance)
    .find(({ targets }) => targets.includes("canvas.renderScale"));
  if (!path) throw new Error("Missing grouped canvas performance path.");
  const adapter = appPerformancePathAdapters.find(({ pathId }) => pathId === path.id);
  if (!(adapter?.action && adapter.preparePhase && adapter.settlePhase)) {
    throw new Error("Grouped canvas performance adapter is incomplete.");
  }
  const plan = compileToolcraftPerformanceFixturePlan(boundedPerformance, path);
  const expectedPixels = plan.maximum.values["preview-pixels"];
  const previousMode = process.env.TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE;
  const previousSelector = process.env.TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR;
  process.env.TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE = "full-certification";
  process.env.TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR = "maximum";
  try {
    await runToolcraftPerformancePath(
      page,
      appSchema,
      boundedPerformance,
      { adapter, canvasBacking: appPerformanceCanvasBacking, path, testName },
      { measureInteraction: async (_page, action, options) => {
        await action();
        await options.observeOutcome?.();
        return zeroDurationInteraction;
      } },
    );
  } finally {
    if (previousMode === undefined) delete process.env.TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE;
    else process.env.TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE = previousMode;
    if (previousSelector === undefined) delete process.env.TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR;
    else process.env.TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR = previousSelector;
  }
  expect(await page.locator(canvasSelector).evaluate(
    (node) => (node as HTMLCanvasElement).width * (node as HTMLCanvasElement).height,
  )).toBe(expectedPixels);
  await expect(target(page, "canvas.renderScale").getByRole("slider"))
    .toHaveAttribute("aria-valuenow", "2");
  await expect(target(page, "canvas.infinity").getByRole("switch"))
    .toHaveAttribute("aria-checked", "false");
  await expectNoToolcraftVgpuPageErrors(page);
}
