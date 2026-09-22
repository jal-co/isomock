import { expect, test } from "@playwright/test";

import { deriveToolcraftPerformancePaths } from "@/toolcraft/runtime";

import { appPerformance } from "../src/app/app-performance";
import { appSchema } from "../src/app/app-schema";
import {
  appPerformanceCanvasBacking,
  appPerformancePathAdapters,
} from "./app-performance-path-adapters";
import {
  compileToolcraftPerformancePathAdapterMatrix,
  getToolcraftPerformancePathTestName,
} from "./performance-path-adapter-matrix";
import { runToolcraftPerformancePath } from "./performance-path-helpers";
import { attachToolcraftPerformanceEnvironmentEvidence } from "./performance-environment-evidence";

const performancePaths = deriveToolcraftPerformancePaths(
  appSchema,
  appPerformance,
);

test.setTimeout(180_000);

test("browser perf: toolcraft environment", async ({ page }) => {
  await page.goto("/");
  await attachToolcraftPerformanceEnvironmentEvidence(page);
});

test("browser perf: toolcraft adapter catalog", () => {
  compileToolcraftPerformancePathAdapterMatrix({
    adapters: appPerformancePathAdapters,
    canvasBacking: appPerformanceCanvasBacking,
    paths: performancePaths,
    schema: appSchema,
  });
});

for (const path of performancePaths) {
  test(getToolcraftPerformancePathTestName(path), async ({ page }) => {
    const [entry] = compileToolcraftPerformancePathAdapterMatrix({
      adapters: appPerformancePathAdapters.filter(
        (adapter) => adapter.pathId === path.id,
      ),
      canvasBacking: appPerformanceCanvasBacking,
      paths: [path],
      schema: appSchema,
    });
    if (!entry) {
      throw new Error(`Missing compiled performance path "${path.id}".`);
    }
    await runToolcraftPerformancePath(
      page,
      appSchema,
      appPerformance,
      entry,
    );
  });
}

test("browser perf: declared renderer layer selectors are present", async ({ page }) => {
  if (!appPerformance.usesCustomRenderer) {
    return;
  }

  const visibleLayers =
    appPerformance.rendererTechnique?.layers?.filter((layer) => layer.uiSelector) ?? [];

  await page.goto("/");

  for (const layer of visibleLayers) {
    await expect(
      page.locator(layer.uiSelector!).first(),
      `renderer layer "${layer.id}" should exist at ${layer.uiSelector}`,
    ).toBeVisible();
  }
});
