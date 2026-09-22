import { expect } from "@playwright/test";

import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import {
  getToolcraftBrowserProofPage,
  type ToolcraftBrowserProofSession,
} from "./browser-proof-session";

async function readMarkerSignature(
  page: Awaited<ReturnType<typeof getToolcraftBrowserProofPage>>,
  markerSelector: string,
): Promise<string> {
  return page.locator(markerSelector).evaluate((element) => {
    const node = element as HTMLElement;
    return `${node.dataset.timelineProgress ?? "missing"}:${node.style.transform || node.style.left}`;
  });
}

export async function expectToolcraftStandardTimelinePlayback(
  session: ToolcraftBrowserProofSession,
  options: Readonly<{
    markerSelector: string;
    requirementId: string;
  }>,
): Promise<void> {
  const page = await getToolcraftBrowserProofPage(session);
  const scrubber = page.getByRole("slider", { name: "Playback position" });
  if (!(await scrubber.isVisible())) {
    await page
      .locator('[data-toolcraft-control-target="panels.timeline.extended"]')
      .getByRole("switch")
      .click();
    await expect(scrubber).toBeVisible();
  }
  const pause = page.getByRole("button", { name: "Pause playback" });
  if (await pause.isVisible()) await pause.click();

  await scrubber.press("Home");
  await expect(scrubber).toHaveAttribute("aria-valuenow", "0");
  const initialStart = await readMarkerSignature(page, options.markerSelector);
  await scrubber.press("End");
  const initialEnd = await readMarkerSignature(page, options.markerSelector);
  expect(initialEnd).toBe(initialStart);
  await scrubber.press("ArrowLeft");
  const scrubbed = await readMarkerSignature(page, options.markerSelector);
  expect(scrubbed).not.toBe(initialStart);
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "timeline-scrub",
    requirementId: options.requirementId,
    target: "timeline.playback",
  });
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "timeline-rendered-frame",
    requirementId: options.requirementId,
    target: "timeline.playback",
  });
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "product-observable-change",
    requirementId: options.requirementId,
    target: "timeline.playback",
  });

  await page.getByRole("button", { name: "Edit timeline duration" }).click();
  const durationEditor = page.getByRole("textbox", { name: "timeline duration" });
  await durationEditor.fill("2s");
  await durationEditor.press("Enter");
  await expect(scrubber).toHaveAttribute("aria-valuemax", "2");
  await scrubber.press("Home");
  const resizedStart = await readMarkerSignature(page, options.markerSelector);
  await scrubber.press("End");
  const resizedEnd = await readMarkerSignature(page, options.markerSelector);
  expect(resizedEnd).toBe(resizedStart);
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "timeline-duration",
    requirementId: options.requirementId,
    target: "timeline.playback",
  });
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "timeline-loop",
    requirementId: options.requirementId,
    target: "timeline.playback",
  });

  await scrubber.press("Home");
  await page.getByRole("button", { name: "Play playback" }).click();
  await expect
    .poll(() => scrubber.getAttribute("aria-valuenow"))
    .not.toBe("0");
  await page.getByRole("button", { name: "Pause playback" }).click();
  const pausedTime = await scrubber.getAttribute("aria-valuenow");
  const pausedSignature = await readMarkerSignature(page, options.markerSelector);
  await page.waitForTimeout(100);
  expect(await scrubber.getAttribute("aria-valuenow")).toBe(pausedTime);
  expect(await readMarkerSignature(page, options.markerSelector)).toBe(
    pausedSignature,
  );
  await page.getByRole("button", { name: "Play playback" }).click();
  await expect
    .poll(() => scrubber.getAttribute("aria-valuenow"))
    .not.toBe(pausedTime);
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "timeline-pause-resume",
    requirementId: options.requirementId,
    target: "timeline.playback",
  });
}
