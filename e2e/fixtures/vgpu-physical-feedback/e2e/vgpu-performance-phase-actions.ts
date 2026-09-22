import { expect, type Page } from "@playwright/test";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import {
  getPhysicalFeedbackReplayScrubber,
  setPhysicalFeedbackSwitch,
} from "./vgpu-performance-fixture-support";
import { physicalFeedbackCanvasSelector } from "./vgpu-runtime-attributes";
import {
  readPhysicalFeedbackSettlementGenerations,
  stagePhysicalFeedbackPreparation,
  waitForPhysicalFeedbackSettlement,
} from "./vgpu-performance-settlement";

const wrapperSelector = '[data-vgpu-wrapper=""]';

export async function preparePhysicalFeedbackPathPhase(
  page: Page,
  interaction: string,
  targets: readonly string[],
): Promise<void> {
  const before = await readPhysicalFeedbackSettlementGenerations(page);
  let operationTransition = false;
  let retirementTransition = false;
  let status: "disabled" | "ready" | undefined;
  if (interaction === "control-drag") {
    const impulse = (await getToolcraftControlFieldByTarget(
      page,
      "simulation.impulse",
    )).getByRole("slider");
    operationTransition = (await impulse.getAttribute("aria-valuenow")) !== "0.1";
    await impulse.press("Home");
  } else if (targets.includes("simulation.enabled:disable")) {
    operationTransition = await setPhysicalFeedbackSwitch(
      page,
      "simulation.enabled",
      true,
    );
    status = "ready";
  } else if (targets.includes("simulation.enabled:enable")) {
    const changed = await setPhysicalFeedbackSwitch(
      page,
      "simulation.enabled",
      false,
    );
    operationTransition = changed;
    retirementTransition = changed;
    status = "disabled";
  } else if (targets.includes("canvas.renderScale")) {
    const renderScale = (await getToolcraftControlFieldByTarget(
      page,
      "canvas.renderScale",
    )).getByRole("slider");
    operationTransition = (await renderScale.getAttribute("aria-valuenow")) !== "1";
    await renderScale.press("Home");
  } else if (interaction === "timeline-playback") {
    const pause = page.getByRole("button", { name: "Pause playback" });
    if (await pause.isVisible()) {
      await pause.click();
      operationTransition = true;
    }
    const scrubber = await getPhysicalFeedbackReplayScrubber(page);
    operationTransition ||= (await scrubber.getAttribute("aria-valuenow")) !== "0";
    await scrubber.press("Home");
  } else if (interaction === "timeline-scrub") {
    const scrubber = await getPhysicalFeedbackReplayScrubber(page);
    operationTransition = (await scrubber.getAttribute("aria-valuenow")) !== "0";
    await scrubber.press("Home");
  } else if (targets.includes("export.includeBackground")) {
    operationTransition = await setPhysicalFeedbackSwitch(
      page,
      "export.includeBackground",
      true,
    );
  }
  stagePhysicalFeedbackPreparation(page, {
    before,
    operationTransition,
    retirementTransition,
    ...(status ? { status } : {}),
  });
}

export async function performPhysicalFeedbackPathAction(
  page: Page,
  interaction: string,
  targets: readonly string[],
): Promise<void> {
  const canvas = page.locator(physicalFeedbackCanvasSelector);
  if (interaction === "initial-render") {
    await page.reload();
    await waitForPhysicalFeedbackSettlement(page, {
      before: {
        operationSettled: 0,
        operationStarted: 0,
        retirementSettled: 0,
        retirementStarted: 0,
      },
      operationTransition: true,
      retirementTransition: false,
      status: "ready",
    });
  } else if (interaction === "control-drag") {
    const beforeFrame = Number(await canvas.getAttribute("data-vgpu-frame-count"));
    const before = await readPhysicalFeedbackSettlementGenerations(page);
    await (await getToolcraftControlFieldByTarget(
      page,
      "simulation.impulse",
    )).getByRole("slider").press("End");
    await waitForPhysicalFeedbackSettlement(page, {
      before,
      operationTransition: true,
      retirementTransition: false,
      status: "ready",
    });
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-vgpu-frame-count")))
      .toBeGreaterThan(beforeFrame);
  } else if (targets.includes("simulation.enabled:disable")) {
    const wrapper = page.locator(wrapperSelector);
    const disposals = Number(await wrapper.getAttribute("data-vgpu-gpu-disposals"));
    const before = await readPhysicalFeedbackSettlementGenerations(page);
    await setPhysicalFeedbackSwitch(page, "simulation.enabled", false);
    await waitForPhysicalFeedbackSettlement(page, {
      before,
      operationTransition: true,
      retirementTransition: true,
      status: "disabled",
    });
    await expect
      .poll(async () =>
        Number(await wrapper.getAttribute("data-vgpu-gpu-disposals")),
      )
      .toBeGreaterThan(disposals);
  } else if (targets.includes("simulation.enabled:enable")) {
    const before = await readPhysicalFeedbackSettlementGenerations(page);
    await setPhysicalFeedbackSwitch(page, "simulation.enabled", true);
    await waitForPhysicalFeedbackSettlement(page, {
      before,
      operationTransition: true,
      retirementTransition: false,
      status: "ready",
    });
  } else if (targets.includes("canvas.renderScale")) {
    const before = await readPhysicalFeedbackSettlementGenerations(page);
    const fieldEnabled =
      (await (await getToolcraftControlFieldByTarget(
        page,
        "simulation.enabled",
      )).getByRole("switch").getAttribute("aria-checked")) === "true";
    await (await getToolcraftControlFieldByTarget(
      page,
      "canvas.renderScale",
    )).getByRole("slider").press("End");
    await waitForPhysicalFeedbackSettlement(page, {
      before,
      operationTransition: true,
      retirementTransition: false,
      status: fieldEnabled ? "ready" : "disabled",
    });
    await expect
      .poll(() =>
        canvas.evaluate((node) =>
          (node as HTMLCanvasElement).height ===
            Math.ceil(node.clientHeight * devicePixelRatio * 2) &&
          (node as HTMLCanvasElement).width ===
            Math.ceil(node.clientWidth * devicePixelRatio * 2),
        ),
      )
      .toBe(true);
  } else if (targets.includes("export.includeBackground")) {
    const before = await readPhysicalFeedbackSettlementGenerations(page);
    const fieldEnabled =
      (await (await getToolcraftControlFieldByTarget(
        page,
        "simulation.enabled",
      )).getByRole("switch").getAttribute("aria-checked")) === "true";
    await setPhysicalFeedbackSwitch(page, "export.includeBackground", false);
    await waitForPhysicalFeedbackSettlement(page, {
      before,
      operationTransition: fieldEnabled,
      retirementTransition: false,
    });
  } else if (interaction === "timeline-playback") {
    const before = await canvas.getAttribute("data-vgpu-rendered-time");
    const beforeSettlement = await readPhysicalFeedbackSettlementGenerations(page);
    await page.getByRole("button", { name: "Play playback" }).click();
    await expect(canvas).toHaveAttribute("data-vgpu-playing", "true");
    await expect
      .poll(() => canvas.getAttribute("data-vgpu-rendered-time"))
      .not.toBe(before);
    await page.getByRole("button", { name: "Pause playback" }).click();
    await waitForPhysicalFeedbackSettlement(page, {
      before: beforeSettlement,
      operationTransition: true,
      retirementTransition: false,
      status: "ready",
    });
    await expect(canvas).toHaveAttribute("data-vgpu-playing", "false");
  } else if (interaction === "timeline-scrub") {
    const before = await readPhysicalFeedbackSettlementGenerations(page);
    const scrubber = await getPhysicalFeedbackReplayScrubber(page);
    await scrubber.press("ArrowRight");
    await waitForPhysicalFeedbackSettlement(page, {
      before,
      operationTransition: true,
      retirementTransition: false,
      status: "ready",
    });
  } else if (interaction === "viewport-drag") {
    const before = await readPhysicalFeedbackSettlementGenerations(page);
    const viewport = page.getByRole("application", { name: "Canvas viewport" });
    const box = await viewport.boundingBox();
    if (!box) throw new Error("Canvas viewport has no geometry.");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await viewport.focus();
    await page.keyboard.down("Space");
    try {
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2 + 16);
    } finally {
      await page.mouse.up();
      await page.keyboard.up("Space");
    }
    await waitForPhysicalFeedbackSettlement(page, {
      before,
      operationTransition: true,
      retirementTransition: false,
      status: "ready",
    });
  } else if (interaction === "viewport-zoom") {
    const before = await readPhysicalFeedbackSettlementGenerations(page);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await waitForPhysicalFeedbackSettlement(page, {
      before,
      operationTransition: true,
      retirementTransition: false,
      status: "ready",
    });
  } else {
    throw new Error(`Unsupported physical feedback performance action ${interaction}.`);
  }
}
