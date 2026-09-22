import { expect, type Page } from "@playwright/test";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import type { ToolcraftCompiledFixtureApplications } from "./performance-compiled-fixture-runtime";
import {
  getPhysicalFeedbackReplayFixtureSeconds,
  selectPhysicalFeedbackFixtureApplications,
} from "../src/app/feedback-performance-fixture";
import {
  physicalFeedbackCanvasSelector,
  readPhysicalFeedbackGenerationAttributes,
} from "./vgpu-runtime-attributes";
export async function setPhysicalFeedbackSwitch(
  page: Page,
  target: string,
  checked: boolean,
): Promise<boolean> {
  const control = (await getToolcraftControlFieldByTarget(page, target)).getByRole("switch");
  if ((await control.getAttribute("aria-checked")) === String(checked)) return false;
  await control.click();
  return true;
}
async function setTextTarget(page: Page, target: string, value: number) {
  const input = (await getToolcraftControlFieldByTarget(page, target)).getByRole("textbox");
  await input.fill(String(value));
  await input.press("Enter");
}
async function setResolution(page: Page, value: string) {
  const trigger = (await getToolcraftControlFieldByTarget(
    page,
    "export.image.resolution",
  )).getByRole("combobox");
  const label = value.toUpperCase();
  if (!(await trigger.textContent())?.includes(label)) {
    await trigger.click();
    await page.locator('[data-slot="select-item"]').filter({ hasText: label }).click();
  }
}
export async function getPhysicalFeedbackReplayScrubber(page: Page) {
  const scrubber = page.getByRole("slider", { name: "Playback position" });
  if (!(await scrubber.isVisible())) {
    await (await getToolcraftControlFieldByTarget(
      page,
      "panels.timeline.extended",
    )).getByRole("switch").click();
  }
  await expect(scrubber).toBeVisible();
  return scrubber;
}
async function applyReplaySteps(page: Page, steps: number) {
  const scrubber = await getPhysicalFeedbackReplayScrubber(page);
  if ((await scrubber.getAttribute("aria-valuemax")) !== "3") {
    await page.getByRole("button", { name: "Edit timeline duration" }).click();
    const duration = page.getByRole("textbox", { name: "timeline duration" });
    await duration.fill("3s");
    await duration.press("Enter");
    await expect(scrubber).toHaveAttribute("aria-valuemax", "3");
  }
  const canvas = page.locator(physicalFeedbackCanvasSelector);
  if (steps === 1) {
    await scrubber.press("Home");
  } else {
    const seconds = getPhysicalFeedbackReplayFixtureSeconds(steps);
    const box = await scrubber.boundingBox();
    if (!box) throw new Error("Playback position has no browser geometry.");
    const trackStart = Number(
      (await scrubber.getAttribute("data-timeline-track-start")) ?? 0,
    );
    const trackEnd = Number(
      (await scrubber.getAttribute("data-timeline-track-end")) ?? 0,
    );
    const targetX =
      box.x + trackStart + (box.width - trackStart - trackEnd) * (seconds / 3);
    if (trackStart > 0) {
      const handleBox = await scrubber
        .locator('[data-slot="timeline-expanded-playhead-handle"]')
        .boundingBox();
      if (!handleBox) throw new Error("Playback playhead has no browser geometry.");
      await page.mouse.move(
        handleBox.x + handleBox.width / 2,
        handleBox.y + handleBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(targetX, box.y + box.height / 2);
      await page.mouse.up();
    } else {
      await page.mouse.click(targetX, box.y + box.height / 2);
    }
  }
  await expect
    .poll(
      async () => {
        const [operationStarted, operationSettled] =
          await readPhysicalFeedbackGenerationAttributes(canvas, [
            "data-vgpu-operation-started",
            "data-vgpu-operation-settled",
          ]);
        return {
          replaySteps: await canvas.getAttribute("data-vgpu-replay-steps"),
          settled: operationStarted === operationSettled,
        };
      },
      { timeout: 60_000 },
    )
    .toEqual({ replaySteps: String(steps), settled: true });
}
export async function preparePhysicalFeedbackPerformance(page: Page) {
  await page.goto("/");
  await setPhysicalFeedbackSwitch(page, "simulation.enabled", true);
  await expect(page.locator(physicalFeedbackCanvasSelector)).toHaveAttribute(
    "data-toolcraft-gpu-status",
    "ready",
  );
  const pause = page.getByRole("button", { name: "Pause playback" });
  if (await pause.isVisible()) await pause.click();
}
export async function preparePhysicalFeedbackExportPerformance(page: Page) {
  await preparePhysicalFeedbackPerformance(page);
  await setPhysicalFeedbackSwitch(page, "canvas.infinity", true);
}
export function createPhysicalFeedbackFixtureApplications(
  page: Page,
  dimensionIds: readonly string[],
): ToolcraftCompiledFixtureApplications {
  const available: ToolcraftCompiledFixtureApplications = {
    "export-long-edge": {
      applyValue: (value) => setResolution(page, String(value)),
      observeValue: async () => {
        const text = await (await getToolcraftControlFieldByTarget(
          page,
          "export.image.resolution",
        )).getByRole("combobox").textContent();
        return text?.trim().toLowerCase() ?? "";
      },
    },
    "export-pixels": {
      applyValue: async (value) => {
        await setPhysicalFeedbackSwitch(page, "canvas.infinity", true);
        await setResolution(page, String(value));
      },
      observeValue: async () => {
        const text = await (await getToolcraftControlFieldByTarget(
          page,
          "export.image.resolution",
        )).getByRole("combobox").textContent();
        return text?.trim().toLowerCase() ?? "";
      },
    },
    "preview-pixels": {
      applyValue: async (value) => {
        if (typeof value !== "object" || value === null) {
          throw new Error("Expected the typed preview backing fixture.");
        }
        const fixture = value as { canvasHeight: number; canvasWidth: number };
        await setPhysicalFeedbackSwitch(page, "canvas.infinity", false);
        await setTextTarget(page, "canvas.size.width", fixture.canvasWidth);
        await setTextTarget(page, "canvas.size.height", fixture.canvasHeight);
        await (await getToolcraftControlFieldByTarget(
          page,
          "canvas.renderScale",
        )).getByRole("slider").press("End");
        await expect
          .poll(() =>
            page.locator(physicalFeedbackCanvasSelector).evaluate((canvas) => ({
              height: (canvas as HTMLCanvasElement).height,
              width: (canvas as HTMLCanvasElement).width,
            })),
          )
          .toEqual({
            height: fixture.canvasHeight * 2,
            width: fixture.canvasWidth * 2,
          });
      },
      observeValue: async () => {
        const canvas = page.locator(physicalFeedbackCanvasSelector);
        const backingWidth = await canvas.evaluate(
          (node) => (node as HTMLCanvasElement).width,
        );
        const backingHeight = await canvas.evaluate(
          (node) => (node as HTMLCanvasElement).height,
        );
        return {
          backingHeight,
          backingWidth,
          canvasHeight: backingHeight / 2,
          canvasWidth: backingWidth / 2,
          renderScale: 2,
        };
      },
    },
    "replay-steps": {
      applyValue: (value) => applyReplaySteps(page, Number(value)),
      observeValue: async () =>
        Number(
          await page
            .locator(physicalFeedbackCanvasSelector)
            .getAttribute("data-vgpu-replay-steps"),
        ),
    },
  };
  return selectPhysicalFeedbackFixtureApplications(available, dimensionIds);
}
