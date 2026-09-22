import type { Page } from "@playwright/test";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { readPhysicalFeedbackSettlementGenerations } from "./vgpu-performance-settlement";
import { physicalFeedbackCanvasSelector } from "./vgpu-runtime-attributes";

const wrapperSelector = '[data-vgpu-wrapper=""]';

export async function observePhysicalFeedbackOutcome(page: Page) {
  const canvas = page.locator(physicalFeedbackCanvasSelector);
  const canvasCount = await canvas.count();
  const wrapper = page.locator(wrapperSelector);
  const fieldEnabled = await (await getToolcraftControlFieldByTarget(
    page,
    "simulation.enabled",
  )).getByRole("switch").getAttribute("aria-checked");
  const impulse =
    fieldEnabled === "true"
      ? await (await getToolcraftControlFieldByTarget(
          page,
          "simulation.impulse",
        )).getByRole("slider").getAttribute("aria-valuenow")
      : null;
  return Object.freeze({
    canvasCount,
    fieldEnabled,
    frames: canvasCount
      ? await canvas.getAttribute("data-vgpu-frame-count")
      : null,
    gpuDisposals: Number(
      await wrapper.getAttribute("data-vgpu-gpu-disposals"),
    ),
    impulse,
    playing: canvasCount
      ? await canvas.getAttribute("data-vgpu-playing")
      : null,
    presentationDisposals: Number(
      await wrapper.getAttribute("data-vgpu-presentation-disposals"),
    ),
    renderedTime: canvasCount
      ? await canvas.getAttribute("data-vgpu-rendered-time")
      : null,
    settlement: await readPhysicalFeedbackSettlementGenerations(page),
    status: canvasCount
      ? await canvas.getAttribute("data-toolcraft-gpu-status")
      : null,
  });
}
