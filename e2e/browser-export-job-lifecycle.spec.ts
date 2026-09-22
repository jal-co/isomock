import { expect, test, type Download, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
import {
  inspectToolcraftVideoDownload,
  assertToolcraftVideoPacketSchedule,
} from "./video-artifact-inspection";
import { assertToolcraftExpectedDecodedPixels } from "./decoded-pixel-observation";

async function fixtureCall(
  page: Page,
  action: "hold" | "release" | "unmount" | "read" | "settled" | "seed",
) {
  return page.evaluate(async (action) => {
    const url = "/e2e/browser-export-job-fixture.tsx";
    const fixture = await import(/* @vite-ignore */ url);
    switch (action) {
      case "hold":
        return fixture.holdExportJob();
      case "release":
        return fixture.releaseExportJob();
      case "unmount":
        return fixture.unmountAndReleaseExportJob();
      case "read":
        return fixture.readExportJobFixture();
      case "settled":
        return fixture.waitForExportJobSettlement();
      case "seed":
        return fixture.seedExportJobImage();
    }
  }, action);
}

async function mount(page: Page, infinite = false) {
  await page.goto("/");
  await expect(
    page.locator('[data-slot="toolcraft-runtime-app"]'),
  ).toBeVisible();
  await page.evaluate(async (infinite) => {
    const url = "/e2e/browser-export-job-fixture.tsx";
    const fixture = await import(/* @vite-ignore */ url);
    fixture.mountExportJobFixture({ infinite });
  }, infinite);
  const panel = page.getByTestId("export-job-fixture");
  await expect(panel.getByTestId("export-job-ready")).toBeAttached();
  expect(await fixtureCall(page, "seed")).toBe(1);
  return panel;
}

async function expectImageColor(
  page: Page,
  download: Download,
  rgba: readonly [number, number, number, number],
) {
  const decoded = await inspectToolcraftImageDownload({
    page,
    download,
    backgroundRgba: [0, 0, 0, 255],
  });
  expect(decoded.inspection.mediaType).toBe("image/png");
  expect(decoded.inspection.width).toBe(2048);
  expect(decoded.inspection.height).toBe(2048);
  assertToolcraftExpectedDecodedPixels({
    mediaType: "image/png",
    observation: decoded.observation,
    expectedPixels: [{ xRatio: 0.75, yRatio: 0.75, rgba }],
  });
}

test("export job admits one download and isolates live edits until the next export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const panel = await mount(page);
  const downloads: Download[] = [];
  page.on("download", (download) => downloads.push(download));
  await fixtureCall(page, "hold");
  const image = panel.getByRole("button", { name: "Export PNG", exact: true });
  await image.click();
  await expect
    .poll(async () => (await fixtureCall(page, "read")).renderCalls)
    .toBe(1);
  await image.click();
  await expect(
    panel.locator('[data-panel-action-feedback-code="export-busy"]'),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Turn green", exact: true }).click();
  expect((await fixtureCall(page, "read")).color).toBe("#00FF00");
  const firstDownload = page.waitForEvent("download");
  await fixtureCall(page, "release");
  await expectImageColor(page, await firstDownload, [255, 0, 0, 255]);
  await fixtureCall(page, "settled");
  expect(downloads).toHaveLength(1);
  expect((await fixtureCall(page, "read")).renderCalls).toBe(1);
  const nextDownload = page.waitForEvent("download");
  await image.click();
  await expectImageColor(page, await nextDownload, [0, 255, 0, 255]);
  await fixtureCall(page, "settled");
  expect(downloads).toHaveLength(2);
  expect(errors).toEqual([]);
});

for (const label of ["Export PNG", "Export SVG"]) {
  test(`${label} job cannot download after immediate root teardown and late renderer settlement`, async ({
    page,
  }) => {
    const panel = await mount(page);
    const downloads: Download[] = [];
    page.on("download", (download) => downloads.push(download));
    await fixtureCall(page, "hold");
    if (label === "Export SVG") {
      await panel.getByRole("combobox", { name: "PNG", exact: true }).click();
      await page.getByRole("option", { name: "SVG", exact: true }).click();
    }
    await panel.getByRole("button", { name: label, exact: true }).click();
    await expect
      .poll(async () => (await fixtureCall(page, "read")).renderCalls)
      .toBe(1);
    // Teardown and resolve the paused callback in the same browser task: no sleep hides ordering races.
    await fixtureCall(page, "unmount");
    await fixtureCall(page, "settled");
    expect((await fixtureCall(page, "read")).phase).toBe("disposed");
    expect(downloads).toHaveLength(0);
  });
}

test("export format labels follow live selects, reset and reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let panel = await mount(page);
  const expectLabels = async (image: string, video: string) => {
    for (const format of [image, video]) {
      const label = `Export ${format}`;
      await expect(
        panel.getByRole("button", { name: label, exact: true }),
      ).toHaveText(label);
    }
  };
  await expectLabels("PNG", "MP4");
  await panel.getByRole("combobox", { name: "PNG", exact: true }).click();
  await page.getByRole("option", { name: "JPG", exact: true }).click();
  await expectLabels("JPG", "MP4");
  await panel.getByRole("combobox", { name: "MP4", exact: true }).click();
  await page.getByRole("option", { name: "WebM", exact: true }).click();
  await expectLabels("JPG", "WebM");

  await panel
    .getByRole("button", { name: "Reset controls", exact: true })
    .click();
  await expectLabels("PNG", "MP4");
  await panel.getByRole("combobox", { name: "PNG", exact: true }).click();
  await page.getByRole("option", { name: "SVG", exact: true }).click();
  await expectLabels("SVG", "MP4");
  await expect(panel.getByRole("button", { name: "Export PNG", exact: true })).toHaveCount(0);
  // Restore the selected vector format through real workspace persistence.
  panel = await mount(page);
  await expectLabels("SVG", "MP4");
  await panel.getByRole("combobox", { name: "SVG", exact: true }).click();
  await page.getByRole("option", { name: "JPG", exact: true }).click();
  await expectLabels("JPG", "MP4");

  const imageDownload = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Export JPG", exact: true }).click();
  const image = await imageDownload;
  expect(image.suggestedFilename()).toMatch(/\.jpg$/);
  const bytes = await readFile((await image.path())!);
  expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  await fixtureCall(page, "settled");
  expect(errors).toEqual([]);
});

test("real video export preserves 30fps, selected size, pixels and all-frame Infinity crop", async ({
  page,
}) => {
  const panel = await mount(page, true);
  const downloadPromise = page.waitForEvent("download");
  await panel
    .getByRole("button", { name: "Export MP4", exact: true })
    .click();
  const download = await downloadPromise;
  const schedule = Array.from({ length: 6 }, (_, index) => ({
    index,
    timeSeconds: index / 30,
    durationSeconds: 1 / 30,
  }));
  const decoded = await inspectToolcraftVideoDownload({
    page,
    download,
    schedule,
    backgroundRgba: [0, 0, 0, 255],
  });
  expect(decoded.inspection.width).toBe(84);
  expect(decoded.inspection.height).toBe(64);
  expect(decoded.inspection.frameCount).toBe(6);
  expect(decoded.inspection.durationMs).toBeCloseTo(200, 1);
  assertToolcraftVideoPacketSchedule({
    packetTimings: decoded.inspection.packetTimings,
    schedule,
    timeResolution: decoded.timeResolution,
  });
  for (const [index, observation] of decoded.observations.entries()) {
    const sampleTime = decoded.sampleTimes[index]!;
    const centerX = (sampleTime * 120 + 32) / 84;
    assertToolcraftExpectedDecodedPixels({
      mediaType: decoded.inspection.mediaType,
      observation,
      expectedPixels: [
        { xRatio: centerX, yRatio: 0.5, rgba: [255, 0, 0, 255] },
      ],
    });
  }
  expect(new Set(decoded.inspection.samplePixelHashes).size).toBeGreaterThan(1);
  await fixtureCall(page, "settled");
  const result = await fixtureCall(page, "read");
  expect(result.boundsCalls).toBe(6);
  expect(result.renderCalls).toBe(6);
});
