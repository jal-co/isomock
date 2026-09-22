import { expect } from "@playwright/test";
import {
  expectToolcraftInfinityCanvasBackgroundEvidence,
  expectToolcraftInfinityCanvasImageExportEvidence,
  observeInfinityCanvasBackground,
} from "./browser-infinity-canvas-evidence";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
import {
  createToolcraftUnsupportedVgpuPage,
  expectToolcraftVgpuRuntime,
  test,
} from "./renderer-provider-runtime-evidence";
import {
  acceptanceNames,
  attachScenarioEvidence,
  canvasScreenshot,
  changeImpulse,
  exportAndInspectPng,
  getCurrentVgpuFiniteExportExpectation,
  pressTimelineAndWaitForPresentation,
  scenarioNames,
  selectOption,
  target,
  vgpuEnabled,
  waitTwoAnimationFrames,
} from "./app-vgpu-provider-test-support";

test.skip(!vgpuEnabled, "VGPU browser proof is demand-only.");

test(scenarioNames.finite, async ({ page }) => {
  const renderScale = target(page, "canvas.renderScale").getByRole("slider");
  await renderScale.press("End");
  await expect(renderScale).toHaveAttribute("aria-valuenow", "2");
  const proof = await expectToolcraftVgpuRuntime(page, {
    impulse: () => changeImpulse(page),
  });
  expect(proof.after).not.toEqual(proof.before);

  const canvas = page.locator('canvas[data-toolcraft-vgpu-product=""]');
  const backing = await canvas.getAttribute("data-toolcraft-gpu-backing");
  const viewport = page.getByRole("application", { name: "Canvas viewport" });
  const box = await viewport.boundingBox();
  if (!box) throw new Error("Canvas viewport has no bounding box.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await viewport.focus();
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20);
  expect(await canvas.getAttribute("data-toolcraft-gpu-backing")).toBe(backing);
  await page.mouse.up();
  await page.keyboard.up("Space");

  const pause = page.getByRole("button", { name: "Pause playback" });
  if (await pause.isVisible()) await pause.click();
  const play = page.getByRole("button", { name: "Play playback" });
  await play.click();
  await expect
    .poll(() => canvas.getAttribute("data-vgpu-rendered-time"))
    .not.toBe("0.000");
  expect(await canvas.getAttribute("data-toolcraft-gpu-backing")).toBe(backing);
  await page.getByRole("button", { name: "Pause playback" }).click();

  const field = target(page, "simulation.enabled").getByRole("switch");
  await field.click();
  await expect(target(page, "simulation.impulse")).toHaveCount(0);
  await attachScenarioEvidence(page, scenarioNames.finite);
});

test(acceptanceNames.impulse, async ({ page }) => {
  const proof = await expectToolcraftVgpuRuntime(page, {
    impulse: () => changeImpulse(page),
  });
  expect(proof.after).not.toEqual(proof.before);
  await attachScenarioEvidence(page, acceptanceNames.impulse);
});

test(acceptanceNames.backgroundInclusion, async ({ page }) => {
  await target(page, "canvas.infinity").getByRole("switch").click();
  await expectToolcraftVgpuRuntime(page, { impulse: () => changeImpulse(page) });
  const canvas = page.locator('canvas[data-toolcraft-vgpu-product=""]');
  const infiniteBackground = await observeInfinityCanvasBackground(page);
  const backgroundSwitch = target(page, "export.includeBackground").getByRole(
    "switch",
  );
  await backgroundSwitch.click();
  const backgroundExcluded = await observeInfinityCanvasBackground(page);
  await expect(target(page, "canvas.infinity").getByRole("switch")).toBeDisabled();
  await expect(canvas).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  const transparentDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG" }).click();
  const transparentArtifact = await inspectToolcraftImageDownload({
    backgroundRgba: [0, 0, 0, 0],
    download: await transparentDownload,
    page,
  });
  expect(transparentArtifact.observation.normalizedPixels[3]).toBe(0);

  await backgroundSwitch.click();
  const backgroundRestored = await observeInfinityCanvasBackground(page);
  await expectToolcraftInfinityCanvasBackgroundEvidence(
    {
      backgroundExcluded,
      backgroundRestored,
      infinite: infiniteBackground,
    },
    {
      expectedBackgroundColor: "#141F38",
      requirementId: "renderer.background-inclusion",
      target: "export.includeBackground",
    },
  );
  await attachScenarioEvidence(
    page,
    acceptanceNames.backgroundInclusion,
    new Set([
      "renderer.background-inclusion:background-infinity-viewport",
    ]),
  );
});

test(scenarioNames.timeline, async ({ page }) => {
  await expectToolcraftVgpuRuntime(page, { impulse: () => changeImpulse(page) });
  const scrubber = page.getByRole("slider", { name: "Playback position" });
  if (!(await scrubber.isVisible())) {
    await target(page, "panels.timeline.extended").getByRole("switch").click();
  }
  const pause = page.getByRole("button", { name: "Pause playback" });
  if (await pause.isVisible()) await pause.click();
  await pressTimelineAndWaitForPresentation(page, scrubber, "Home");
  const seed = await canvasScreenshot(page);
  await pressTimelineAndWaitForPresentation(page, scrubber, "ArrowRight");
  expect(await canvasScreenshot(page)).not.toEqual(seed);
  await pressTimelineAndWaitForPresentation(page, scrubber, "End");
  expect(await canvasScreenshot(page)).toEqual(seed);
  await pressTimelineAndWaitForPresentation(page, scrubber, "ArrowLeft");
  expect(await canvasScreenshot(page)).not.toEqual(seed);
  await pressTimelineAndWaitForPresentation(page, scrubber, "Home");
  expect(await canvasScreenshot(page)).toEqual(seed);

  await page.getByRole("button", { name: "Edit timeline duration" }).click();
  const duration = page.getByRole("textbox", { name: "timeline duration" });
  await duration.fill("3s");
  await duration.press("Enter");
  await expect(scrubber).toHaveAttribute("aria-valuemax", "3");
  await scrubber.press("Home");
  const resizedSeed = await canvasScreenshot(page);
  await pressTimelineAndWaitForPresentation(page, scrubber, "ArrowRight");
  expect(await canvasScreenshot(page)).not.toEqual(resizedSeed);
  await pressTimelineAndWaitForPresentation(page, scrubber, "End");
  expect(await canvasScreenshot(page)).toEqual(resizedSeed);

  await scrubber.press("Home");
  await expect(scrubber).toHaveAttribute("aria-valuenow", "0");
  await page.getByRole("button", { name: "Play playback" }).click();
  await expect.poll(() => scrubber.getAttribute("aria-valuenow")).not.toBe("0");
  await page.getByRole("button", { name: "Pause playback" }).click();
  const pausedTime = await scrubber.getAttribute("aria-valuenow");
  await page.waitForTimeout(100);
  expect(await scrubber.getAttribute("aria-valuenow")).toBe(pausedTime);
  await page.getByRole("button", { name: "Play playback" }).click();
  await expect.poll(() => scrubber.getAttribute("aria-valuenow")).not.toBe(pausedTime);
  await attachScenarioEvidence(page, scenarioNames.timeline);
});

test(scenarioNames.viewport, async ({ page }) => {
  await expectToolcraftVgpuRuntime(page, {
    impulse: () => changeImpulse(page),
    playback: "preserve",
  });
  const canvas = page.locator('canvas[data-toolcraft-vgpu-product=""]');
  const play = page.getByRole("button", { name: "Play playback" });
  if (await play.isVisible()) await play.click();
  await expect(canvas).toHaveAttribute("data-vgpu-playing", "true");
  await expect
    .poll(() => canvas.getAttribute("data-vgpu-rendered-time"))
    .not.toBe("0.000");
  const coalesced = Number(
    await canvas.getAttribute("data-vgpu-coalesced-frames"),
  );
  const releases = Number(
    await canvas.getAttribute("data-vgpu-coalesced-releases"),
  );
  const viewport = page.getByRole("application", { name: "Canvas viewport" });
  const box = await viewport.boundingBox();
  if (!box) throw new Error("Canvas viewport has no bounding box.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await viewport.focus();
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2 + 1);
  await expect(canvas).toHaveAttribute("data-vgpu-interaction-active", "true");
  await page.waitForTimeout(100);
  const activeFrames = Number(
    await canvas.getAttribute("data-vgpu-frame-count"),
  );
  const activeTime = await canvas.getAttribute("data-vgpu-rendered-time");
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, {
    steps: 4,
  });
  await page.waitForTimeout(100);
  expect(Number(await canvas.getAttribute("data-vgpu-frame-count"))).toBe(
    activeFrames,
  );
  expect(await canvas.getAttribute("data-vgpu-rendered-time")).toBe(activeTime);
  expect(await canvas.getAttribute("data-vgpu-playing")).toBe("true");
  await page.mouse.up();
  await page.keyboard.up("Space");
  await expect(canvas).toHaveAttribute("data-vgpu-interaction-active", "false");
  await expect
    .poll(async () =>
      Number(await canvas.getAttribute("data-vgpu-coalesced-frames")),
    )
    .toBeGreaterThan(coalesced);
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-vgpu-frame-count")))
    .toBeGreaterThan(activeFrames);
  await expect
    .poll(async () =>
      Number(await canvas.getAttribute("data-vgpu-coalesced-releases")),
    )
    .toBe(releases + 1);
  await expect
    .poll(() => canvas.getAttribute("data-vgpu-rendered-time"))
    .not.toBe(activeTime);
  expect(await canvas.getAttribute("data-vgpu-playing")).toBe("true");
  await attachScenarioEvidence(page, scenarioNames.viewport);
});

test(acceptanceNames.viewportZoom, async ({ page }) => {
  await expectToolcraftVgpuRuntime(page, {
    impulse: () => changeImpulse(page),
    playback: "preserve",
  });
  const canvas = page.locator('canvas[data-toolcraft-vgpu-product=""]');
  const play = page.getByRole("button", { name: "Play playback" });
  if (await play.isVisible()) await play.click();
  await expect(canvas).toHaveAttribute("data-vgpu-playing", "true");
  const time = await canvas.getAttribute("data-vgpu-rendered-time");
  const frames = Number(await canvas.getAttribute("data-vgpu-frame-count"));
  const coalesced = Number(
    await canvas.getAttribute("data-vgpu-coalesced-frames"),
  );
  const world = page.locator('[data-toolcraft-canvas-world=""]');
  const previousZoom = await world.getAttribute("data-toolcraft-canvas-zoom");
  const viewport = page.getByRole("application", { name: "Canvas viewport" });
  await viewport.hover();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -120);
  await page.keyboard.up("Control");
  await expect(world).not.toHaveAttribute(
    "data-toolcraft-canvas-zoom",
    previousZoom ?? "100",
  );
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-vgpu-frame-count")))
    .toBeGreaterThan(frames);
  await expect
    .poll(async () =>
      Number(await canvas.getAttribute("data-vgpu-coalesced-frames")),
    )
    .toBeGreaterThan(coalesced);
  await expect
    .poll(() => canvas.getAttribute("data-vgpu-rendered-time"))
    .not.toBe(time);
  expect(await canvas.getAttribute("data-vgpu-playing")).toBe("true");
  await attachScenarioEvidence(page, acceptanceNames.viewportZoom);
});

test(scenarioNames.export, async ({ page }) => {
  const expectedFinite = getCurrentVgpuFiniteExportExpectation();
  await expectToolcraftVgpuRuntime(page, { impulse: () => changeImpulse(page) });
  await selectOption(page, "export.image.format", "JPG");
  await selectOption(page, "export.image.format", "PNG");
  await selectOption(page, "export.image.resolution", "2K");
  await selectOption(page, "export.image.resolution", "8K");
  await selectOption(page, "export.image.resolution", "4K");
  const backgroundInput = target(page, "appearance.background").getByRole(
    "textbox",
  );
  await backgroundInput.fill("#203040");
  await backgroundInput.press("Enter");
  const finiteArtifact = await exportAndInspectPng(page, [32, 48, 64, 255]);
  await target(page, "canvas.infinity").getByRole("switch").click();
  const infiniteArtifact = await exportAndInspectPng(page, [32, 48, 64, 255]);
  expect(finiteArtifact.inspection).toMatchObject(expectedFinite);
  expect(infiniteArtifact.inspection).toMatchObject(expectedFinite);
  const pixels = infiniteArtifact.observation.normalizedPixels;
  const rgbaAt = (x: number, y: number) => {
    const offset = (y * 64 + x) * 4;
    return Array.from(pixels.subarray(offset, offset + 4));
  };
  const corner = rgbaAt(0, 0);
  const center = rgbaAt(32, 32);
  expect(corner).toEqual([32, 48, 64, 255]);
  expect(center).not.toEqual(corner);
  await attachScenarioEvidence(page, scenarioNames.export);
});

test(acceptanceNames.backgroundColor, async ({ page }) => {
  await expectToolcraftVgpuRuntime(page, { impulse: () => changeImpulse(page) });
  const backgroundInput = target(page, "appearance.background").getByRole(
    "textbox",
  );
  await backgroundInput.fill("#203040");
  await backgroundInput.press("Enter");
  const artifact = await exportAndInspectPng(page, [32, 48, 64, 255]);
  expect(Array.from(artifact.observation.normalizedPixels.slice(0, 4))).toEqual([
    32,
    48,
    64,
    255,
  ]);
  await attachScenarioEvidence(page, acceptanceNames.backgroundColor);
});

test(acceptanceNames.format, async ({ page }) => {
  await selectOption(page, "export.image.format", "JPG");
  await selectOption(page, "export.image.format", "PNG");
  await attachScenarioEvidence(page, acceptanceNames.format);
});

test(acceptanceNames.resolution, async ({ page }) => {
  await selectOption(page, "export.image.resolution", "2K");
  await selectOption(page, "export.image.resolution", "8K");
  await selectOption(page, "export.image.resolution", "4K");
  await attachScenarioEvidence(page, acceptanceNames.resolution);
});

test(acceptanceNames.infinityExport, async ({ page }) => {
  const expectedFinite = getCurrentVgpuFiniteExportExpectation();
  await expectToolcraftVgpuRuntime(page, { impulse: () => changeImpulse(page) });
  const finiteArtifact = await exportAndInspectPng(page, [20, 31, 56, 255]);
  await target(page, "canvas.infinity").getByRole("switch").click();
  const infiniteArtifact = await exportAndInspectPng(page, [20, 31, 56, 255]);
  await expectToolcraftInfinityCanvasImageExportEvidence(
    {
      finite: finiteArtifact.inspection,
      infinite: infiniteArtifact.inspection,
    },
    {
      expectedSize: expectedFinite,
      requirementId: "renderer.infinity-export",
      target: "canvas.infinity",
    },
  );
  await attachScenarioEvidence(
    page,
    acceptanceNames.infinityExport,
    new Set([
      "renderer.infinity-export:exported-artifact",
      "renderer.infinity-export:infinity-scene-bounds-image-export",
    ]),
  );
});

test(scenarioNames.unsupported, async ({ baseURL, vgpuBrowser }) => {
  const unsupported = await createToolcraftUnsupportedVgpuPage(
    vgpuBrowser,
    baseURL,
  );
  try {
    const canvas = unsupported.page.locator(
      'canvas[data-toolcraft-vgpu-product=""]',
    );
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute(
      "data-toolcraft-gpu-status",
      "unsupported",
    );
    await expect(canvas).toHaveAttribute(
      "aria-label",
      "WebGPU is unavailable in this browser.",
    );
    let downloaded = false;
    unsupported.page.on("download", () => {
      downloaded = true;
    });
    await unsupported.page.getByRole("button", { name: "Export PNG" }).click();
    await expect(canvas).toHaveAttribute(
      "data-toolcraft-gpu-export-status",
      "vgpu-export-unsupported",
    );
    expect(downloaded).toBe(false);
    await attachScenarioEvidence(unsupported.page, scenarioNames.unsupported);
  } finally {
    await unsupported.context.close();
  }
});

test(scenarioNames.teardown, async ({ page }) => {
  await expectToolcraftVgpuRuntime(page, { impulse: () => changeImpulse(page) });
  const wrapper = page.locator('[data-vgpu-wrapper=""]');
  const canvas = page.locator('canvas[data-toolcraft-vgpu-product=""]');
  const activeBacking = await canvas.getAttribute("data-toolcraft-gpu-backing");
  const activeSize = await canvas.evaluate(({ width, height }) => ({
    height,
    width,
  }));
  const activeFrames = await canvas.getAttribute("data-vgpu-frame-count");
  await target(page, "simulation.enabled").getByRole("switch").click();
  await expect(canvas).toHaveAttribute("data-toolcraft-gpu-status", "disabled");
  await expect(canvas).toHaveAttribute(
    "data-vgpu-disabled-backing",
    activeBacking ?? "",
  );
  expect(await canvas.evaluate(({ width, height }) => ({ height, width }))).toEqual(
    activeSize,
  );
  await expect(wrapper).toHaveAttribute(
    "data-vgpu-presentation-disposals",
    "1",
  );
  await expect(wrapper).toHaveAttribute("data-vgpu-gpu-disposals", "1");
  expect(
    await canvas.evaluate((node) =>
      Array.from(
        node.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, 1, 1)
          .data,
      ),
    ),
  ).toEqual([0, 0, 0, 0]);
  await waitTwoAnimationFrames(page);
  await expect(canvas).toHaveAttribute("data-vgpu-frame-count", activeFrames ?? "");
  await target(page, "simulation.enabled").getByRole("switch").click();
  await expect(canvas).toHaveAttribute("data-toolcraft-gpu-status", "ready");
  await expect(target(page, "simulation.impulse")).toHaveCount(1);
  const readyEpoch = Number(await canvas.getAttribute("data-vgpu-renderer-epoch"));
  const readyFrames = Number(await canvas.getAttribute("data-vgpu-frame-count"));
  await target(page, "simulation.impulse").getByRole("slider").press("Home");
  const fieldToggle = target(page, "simulation.enabled").getByRole("switch");
  await fieldToggle.click();
  await fieldToggle.click();
  await expect
    .poll(async () =>
      Number(await canvas.getAttribute("data-vgpu-renderer-epoch")),
    )
    .toBeGreaterThan(readyEpoch + 1);
  await expect(canvas).toHaveAttribute("data-toolcraft-gpu-status", "ready");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-vgpu-frame-count")))
    .toBeGreaterThan(readyFrames);
  await waitTwoAnimationFrames(page);
  await expect(canvas).toHaveAttribute("data-toolcraft-gpu-status", "ready");
  await expect(canvas).toHaveAttribute(
    "data-toolcraft-gpu-backing",
    activeBacking ?? "",
  );
  expect(
    await canvas.evaluate((node) =>
      Array.from(
        node
          .getContext("2d", { willReadFrequently: true })!
          .getImageData(Math.floor(node.width / 2), Math.floor(node.height / 2), 1, 1)
          .data,
      ),
    ),
  ).not.toEqual([0, 0, 0, 0]);
  await attachScenarioEvidence(page, scenarioNames.teardown);
});
