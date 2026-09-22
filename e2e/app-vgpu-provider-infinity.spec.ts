import { expect } from "@playwright/test";

import { expectToolcraftVgpuRuntime, test } from "./renderer-provider-runtime-evidence";
import {
  attachScenarioEvidence,
  changeImpulse,
  expectVgpuRendererTransitionStable,
  observeVgpuRendererContinuity,
  scenarioNames,
  target,
  vgpuEnabled,
  waitForVgpuRendererSettlement,
} from "./app-vgpu-provider-test-support";

test.skip(!vgpuEnabled, "VGPU browser proof is demand-only.");

test(scenarioNames.infinity, async ({ page }) => {
  await expectToolcraftVgpuRuntime(page, {
    impulse: () => changeImpulse(page),
  });
  const canvas = page.locator('canvas[data-toolcraft-vgpu-product=""]');
  const scene = page.locator('[data-toolcraft-product-scene-status="ready"]');
  const surface = page.locator('[data-toolcraft-canvas-surface=""]');
  await expect(canvas).toHaveAttribute("data-vgpu-frame-kind", "ready");
  await expect(scene).toBeVisible();
  await waitForVgpuRendererSettlement(page);
  const canvasHandle = await canvas.elementHandle();
  const sceneHandle = await scene.elementHandle();
  const surfaceHandle = await surface.elementHandle();
  if (!canvasHandle || !sceneHandle || !surfaceHandle) {
    throw new Error("The VGPU continuity nodes are unavailable.");
  }
  const expectStableNodes = async () => {
    expect(
      await canvas.evaluate(
        (element, initial) => element === initial,
        canvasHandle,
      ),
    ).toBe(true);
    expect(
      await scene.evaluate(
        (element, initial) => element === initial,
        sceneHandle,
      ),
    ).toBe(true);
    expect(
      await surface.evaluate(
        (element, initial) => element === initial,
        surfaceHandle,
      ),
    ).toBe(true);
  };
  const finite = await observeVgpuRendererContinuity(page);
  expect(finite.allocations.presentation).toMatch(/^[1-9]\d*$/u);
  expect(finite.allocations.resource).toMatch(/^[1-9]\d*$/u);
  expect(finite.product.css).toEqual({
    height: 128,
    left: -96,
    top: -64,
    width: 192,
  });
  expect(finite.canvas.css).toEqual({ height: 128, width: 192 });
  expect(finite.boundary).toMatchObject({
    editable: true,
    infinite: false,
    mode: "finite",
    overflow: "hidden",
  });

  const infinitySwitch = target(page, "canvas.infinity").getByRole("switch");
  await infinitySwitch.click();
  await expect(surface).toHaveAttribute("data-toolcraft-canvas-mode", "infinite");
  await expect(canvas).toHaveAttribute("data-toolcraft-gpu-status", "ready");
  await expect(canvas).toHaveAttribute("data-vgpu-frame-kind", "ready");
  await waitForVgpuRendererSettlement(page);
  await expectStableNodes();
  const infinite = await observeVgpuRendererContinuity(page);
  expectVgpuRendererTransitionStable(finite, infinite);
  expect(infinite.boundary).toMatchObject({
    editable: false,
    infinite: true,
    mode: "infinite",
    overflow: "visible",
  });
  await target(page, "simulation.impulse").getByRole("slider").press("Home");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-vgpu-frame-count")))
    .toBeGreaterThan(infinite.frameCount);
  await waitForVgpuRendererSettlement(page);
  const progressedInfinite = await observeVgpuRendererContinuity(page);
  expect(progressedInfinite.allocations).toEqual(infinite.allocations);
  expect(progressedInfinite.lifecycle).toEqual(infinite.lifecycle);
  expect(progressedInfinite.frameCount).toBeGreaterThan(infinite.frameCount);
  expect(progressedInfinite.pixels).not.toEqual(infinite.pixels);

  await infinitySwitch.click();
  await expect(surface).toHaveAttribute("data-toolcraft-canvas-mode", "finite");
  await expect(canvas).toHaveAttribute("data-toolcraft-gpu-status", "ready");
  await expect(canvas).toHaveAttribute("data-vgpu-frame-kind", "ready");
  await waitForVgpuRendererSettlement(page);
  await expectStableNodes();
  const restoredFinite = await observeVgpuRendererContinuity(page);
  expectVgpuRendererTransitionStable(progressedInfinite, restoredFinite);
  expect(restoredFinite.boundary).toEqual(finite.boundary);
  await target(page, "simulation.impulse").getByRole("slider").press("End");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-vgpu-frame-count")))
    .toBeGreaterThan(restoredFinite.frameCount);
  await waitForVgpuRendererSettlement(page);
  const progressedFinite = await observeVgpuRendererContinuity(page);
  expect(progressedFinite.allocations).toEqual(restoredFinite.allocations);
  expect(progressedFinite.lifecycle).toEqual(restoredFinite.lifecycle);
  expect(progressedFinite.frameCount).toBeGreaterThan(restoredFinite.frameCount);
  expect(progressedFinite.pixels).not.toEqual(restoredFinite.pixels);
  await attachScenarioEvidence(page, scenarioNames.infinity);
});
