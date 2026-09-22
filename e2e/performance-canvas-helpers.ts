import { expect, type Page } from "@playwright/test";

import {
  measureToolcraftInteraction,
  waitForToolcraftAnimationFrames,
  type ToolcraftInteractionOptions,
  type ToolcraftInteractionResult,
} from "./performance-probe-helpers";
import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";

export async function dragToolcraftCanvasViewport(
  page: Page,
  delta: { x: number; y: number } = { x: 96, y: -64 },
  options: { pathId?: string } = {},
): Promise<void> {
  const viewport = page.getByRole("application", { name: "Canvas viewport" });
  await expect(viewport, "Toolcraft canvas viewport should be visible").toBeVisible();

  const box = await viewport.boundingBox();
  if (!box) {
    throw new Error("Could not measure Toolcraft canvas viewport.");
  }

  const startX = box.x + box.width * 0.5;
  const startY = box.y + box.height * 0.5;

  await page.mouse.move(startX, startY);
  await viewport.focus();
  await page.keyboard.down("Space");
  try {
    await page.mouse.down();
    await page.mouse.move(startX + delta.x, startY + delta.y, { steps: 16 });
  } finally {
    await page.mouse.up();
    await page.keyboard.up("Space");
  }
  if (options.pathId) {
    await attachToolcraftBrowserRuntimeEvidence({
      evidenceType: "performance-viewport",
      requirementId: options.pathId,
    });
  }
}

export async function zoomToolcraftCanvasViewport(
  page: Page,
  options: {
    direction: "in" | "out";
    pathId?: string;
    repetitions?: number;
  },
): Promise<void> {
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  const zoomOut = page.getByRole("button", { name: "Zoom out" });
  const control = options.direction === "in" ? zoomIn : zoomOut;
  await expect(
    control,
    `Toolcraft zoom-${options.direction} control should be visible`,
  ).toBeVisible();

  for (let index = 0; index < (options.repetitions ?? 1); index += 1) {
    await control.click();
    await waitForToolcraftAnimationFrames(page, 2);
  }
  if (options.pathId) {
    await attachToolcraftBrowserRuntimeEvidence({
      evidenceType: "performance-viewport",
      requirementId: options.pathId,
    });
  }
}

export async function readToolcraftCanvasViewport(page: Page): Promise<{
  offsetX: number;
  offsetY: number;
  zoom: number;
}> {
  return page.evaluate(() => {
    const world = document.querySelector("[data-toolcraft-canvas-world]");

    return {
      offsetX: Number(
        world?.getAttribute("data-toolcraft-canvas-offset-x") ?? 0,
      ),
      offsetY: Number(
        world?.getAttribute("data-toolcraft-canvas-offset-y") ?? 0,
      ),
      zoom: Number.parseFloat(
        world?.getAttribute("data-toolcraft-canvas-zoom") ?? "100",
      ) || 100,
    };
  });
}

export async function expectToolcraftCanvasViewportStable(
  page: Page,
  action: () => Promise<void>,
  options: ToolcraftInteractionOptions & {
    maxOffsetDelta?: number;
    maxZoomDelta?: number;
  } = {},
): Promise<ToolcraftInteractionResult> {
  const before = await readToolcraftCanvasViewport(page);
  const result = await measureToolcraftInteraction(page, action, options);
  const after = await readToolcraftCanvasViewport(page);
  const maxOffsetDelta = options.maxOffsetDelta ?? 0.5;
  const maxZoomDelta = options.maxZoomDelta ?? 0.001;

  expect(
    Math.abs(after.offsetX - before.offsetX),
    `Expected canvas offsetX to stay stable within ${maxOffsetDelta}px.`,
  ).toBeLessThanOrEqual(maxOffsetDelta);
  expect(
    Math.abs(after.offsetY - before.offsetY),
    `Expected canvas offsetY to stay stable within ${maxOffsetDelta}px.`,
  ).toBeLessThanOrEqual(maxOffsetDelta);
  expect(
    Math.abs(after.zoom - before.zoom),
    `Expected canvas zoom to stay stable within ${maxZoomDelta}.`,
  ).toBeLessThanOrEqual(maxZoomDelta);

  if (options.pathId) {
    await attachToolcraftBrowserRuntimeEvidence({
      evidenceType: "performance-viewport",
      requirementId: options.pathId,
    });
  }

  return result;
}
