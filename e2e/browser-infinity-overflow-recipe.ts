import { expect, type Page } from "@playwright/test";
import type { ResolvedToolcraftAppSchema, ToolcraftRendererPipeline } from "@/toolcraft/runtime";
import type { ToolcraftInfinityOverflowCoverage } from "../src/app/acceptance/canvas-coverage";
import { expectToolcraftControlValues } from "./browser-control-value-observation";
import { readToolcraftRendererPipelineSnapshot } from "./browser-pipeline-snapshot";
import { expectFiniteCanvasObservation, expectInfiniteCanvasObservation, observeInfinityCanvas } from "./browser-infinity-canvas-observation";
import { expectInfinityOverflowPixels, type ToolcraftInfinityEdgeProbe } from "./browser-infinity-overflow-pixels";

/** Internal recipe never emits evidence. The public facade resolves the signed case. */
export async function runInfinityOverflowRecipe(page: Page, {
  coverage, pipeline, prepare, probes, schema,
}: {
  coverage: ToolcraftInfinityOverflowCoverage;
  pipeline: ToolcraftRendererPipeline;
  prepare: () => Promise<void>;
  probes: readonly ToolcraftInfinityEdgeProbe[];
  schema: ResolvedToolcraftAppSchema;
}): Promise<void> {
  expect([...probes.map(probe => probe.edge)].sort(), "Probe edges must exactly cover the registered branch").toEqual([...coverage.edges].sort());
  expect(probes.length).toBeGreaterThan(0);
  const before = await readToolcraftRendererPipelineSnapshot(page);
  expect(before.runtimeId).toBe(pipeline.runtimeId);
  await prepare();
  await expectToolcraftControlValues(page, schema, coverage.controlValues);
  const after = await readToolcraftRendererPipelineSnapshot(page);
  expect(after.runtimeId).toBe(before.runtimeId);
  expect(after.disposed).toBe(false);
  for (const id of coverage.passIds) {
    expect(before.passes[id], `Missing pipeline pass ${id}`).toBeDefined();
    expect(after.passes[id], `Missing pipeline pass ${id}`).toBeDefined();
    expect(after.passes[id]!.executions + after.passes[id]!.cacheHits,
      `Preparation must execute or consume ${id}; another branch cannot stand in for this pass`).toBeGreaterThan(before.passes[id]!.executions + before.passes[id]!.cacheHits);
  }
  const infinity = page.locator('[data-toolcraft-control-target="canvas.infinity"] [role="switch"]');
  const background = page.locator('[data-toolcraft-control-target="export.includeBackground"] [role="switch"]');
  const originalInfinity = await infinity.getAttribute("aria-checked") === "true";
  const originalBackground = await background.getAttribute("aria-checked") === "true";
  const setSwitch = async (control: typeof infinity, enabled: boolean) => {
    if ((await control.getAttribute("aria-checked") === "true") !== enabled) await control.click();
    await expect(control).toHaveAttribute("aria-checked", String(enabled));
  };
  try {
    await setSwitch(infinity, false);
    const baseline = await observeInfinityCanvas(page);
    expectFiniteCanvasObservation(baseline);
    const frame = await page.locator("[data-toolcraft-editable-canvas]").boundingBox();
    expect(frame).not.toBeNull();
    await setSwitch(infinity, true);
    await setSwitch(background, true);
    const infinite = await observeInfinityCanvas(page);
    expectInfiniteCanvasObservation(infinite);
    expect(infinite.productScene.viewportRect).toEqual(baseline.productScene.viewportRect);
    await expectInfinityOverflowPixels(page, frame!, probes, true);
    await setSwitch(background, false);
    expectInfiniteCanvasObservation(await observeInfinityCanvas(page), infinite.productScene.worldRect);
    await expectInfinityOverflowPixels(page, frame!, probes, true);
    await setSwitch(infinity, false);
    const finite = await observeInfinityCanvas(page);
    expectFiniteCanvasObservation(finite);
    expect(finite.productScene.viewportRect).toEqual(baseline.productScene.viewportRect);
    await expectInfinityOverflowPixels(page, frame!, probes, false);
    await setSwitch(infinity, true);
    const restored = await observeInfinityCanvas(page);
    expectInfiniteCanvasObservation(restored, infinite.productScene.worldRect);
    expect(restored.productScene.viewportRect).toEqual(baseline.productScene.viewportRect);
    await expectInfinityOverflowPixels(page, frame!, probes, true);
    await expectToolcraftControlValues(page, schema, coverage.controlValues);
  } finally {
    await setSwitch(background, originalBackground);
    await setSwitch(infinity, originalInfinity);
  }
}
