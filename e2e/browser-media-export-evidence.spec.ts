import fs from "node:fs/promises";

import { expect, test, type Download, type Page } from "@playwright/test";

import { expectToolcraftImageExportArtifact } from "./browser-media-export-evidence";

async function createImageFixture(
  page: Page,
): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Missing test canvas context.");
    context.fillStyle = "#000000";
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = "#FF0000";
    context.fillRect(16, 16, 32, 32);
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  return Buffer.from(base64, "base64");
}

test("protected image evidence attaches only after decoded semantics pass", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const artifactPath = testInfo.outputPath("protected-image.png");
  await fs.writeFile(artifactPath, await createImageFixture(page));
  const download = { path: async () => artifactPath } as Download;

  await expectToolcraftImageExportArtifact(async () => download, {
    backgroundRgba: [0, 0, 0, 255],
    expectedBounds: { height: 0.5, width: 0.5, x: 0.25, y: 0.25 },
    expectedHeight: 64,
    expectedMediaType: "image/png",
    expectedPixels: [
      { rgba: [0, 0, 0, 255], xRatio: 0.1, yRatio: 0.1 },
      { rgba: [255, 0, 0, 255], xRatio: 0.5, yRatio: 0.5 },
    ],
    expectedWidth: 64,
    page,
    requirementId: "fixture.image",
  });

  expect(
    test.info().attachments.some(
      ({ name }) => name === "toolcraft.browser-runtime-evidence",
    ),
  ).toBe(true);
});

test("protected image evidence rejects empty product expectations before download", async ({
  page,
}) => {
  let called = false;
  await expect(
    expectToolcraftImageExportArtifact(
      async () => {
        called = true;
        throw new Error("must not run");
      },
      {
        backgroundRgba: [0, 0, 0, 255],
        expectedBounds: { height: 0.5, width: 0.5, x: 0.25, y: 0.25 },
        expectedHeight: 64,
        expectedMediaType: "image/png",
        expectedPixels: [],
        expectedWidth: 64,
        page,
        requirementId: "fixture.empty",
      },
    ),
  ).rejects.toThrow("at least one exact pixel sample");
  expect(called).toBe(false);
});
