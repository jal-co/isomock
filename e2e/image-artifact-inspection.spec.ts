import fs from "node:fs/promises";

import { expect, test, type Download } from "@playwright/test";

import { inspectToolcraftImageDownload } from "./image-artifact-inspection";

test("image inspection hashes decoded pixels and reports product bounds", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 32;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Missing test canvas context.");
    context.fillStyle = "#000000";
    context.fillRect(0, 0, 64, 32);
    context.fillStyle = "#FF0000";
    context.fillRect(16, 8, 32, 16);
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  const artifactPath = testInfo.outputPath("decoded-fixture.png");
  await fs.writeFile(artifactPath, Buffer.from(base64, "base64"));
  const download = { path: async () => artifactPath } as Download;

  const result = await inspectToolcraftImageDownload({
    backgroundRgba: [0, 0, 0, 255],
    download,
    page,
  });

  expect(result.inspection).toMatchObject({
    height: 32,
    kind: "image",
    mediaType: "image/png",
    nonBackgroundBounds: { height: 0.5, width: 0.5, x: 0.25, y: 0.25 },
    width: 64,
  });
  expect(result.inspection.decodedPixelHash).toMatch(/^[a-f0-9]{64}$/u);
});


test("image inspection catches a single pixel missed by normalized sampling", async ({ page }, testInfo) => {
  await page.goto("/");
  const fixtures = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 256, 256);
    const before = canvas.toDataURL("image/png").split(",")[1]!;
    context.fillStyle = "#000000";
    context.fillRect(0, 0, 1, 1);
    return [before, canvas.toDataURL("image/png").split(",")[1]!];
  });
  const results = [];
  for (const [index, base64] of fixtures.entries()) {
    const artifactPath = testInfo.outputPath(`single-pixel-${index}.png`);
    await fs.writeFile(artifactPath, Buffer.from(base64, "base64"));
    results.push(await inspectToolcraftImageDownload({
      backgroundRgba: [255, 255, 255, 255],
      download: { path: async () => artifactPath } as Download,
      page,
    }));
  }
  expect(results[0]!.observation.decodedPixelHash).toBe(results[1]!.observation.decodedPixelHash);
  expect(results[0]!.inspection.decodedPixelHash).not.toBe(results[1]!.inspection.decodedPixelHash);
});
