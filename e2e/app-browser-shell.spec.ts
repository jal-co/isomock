import { expect, test } from "@playwright/test";

import { appSchema } from "../src/app/app-schema";
import {
  expectExportExcludesCanvasHandles,
  expectNoForbiddenCanvasUi,
} from "./canvas-handle-helpers";
import {
  expectToolcraftProductObservableToChange,
  getToolcraftProductObservableSnapshot,
} from "./product-observable-helpers";

test("browser renders the Toolcraft template shell instead of a reference iframe shell", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();

  if (appSchema.assembly.surfaces.canvas.enabled) {
    await expect(page.getByRole("application", { name: "Canvas viewport" })).toBeVisible();
  }

  const nonCanvasIframeCount = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll("iframe")).filter(
        (frame) => !frame.closest("[data-toolcraft-product-scene]"),
      ).length,
  );

  expect(
    nonCanvasIframeCount,
    "Reference iframes may not replace the Toolcraft shell. Preserve reference output inside ToolcraftApp canvasContent.",
  ).toBe(0);
});

test("browser preserves the Toolcraft canvas backing surface", async ({ page }) => {
  if (!appSchema.assembly.surfaces.canvas.enabled) {
    return;
  }

  await page.goto("/");

  const canvasViewport = page.getByRole("application", { name: "Canvas viewport" });

  await expect(canvasViewport).toBeVisible();

  const backgroundColor = await canvasViewport.evaluate((element) =>
    window.getComputedStyle(element).backgroundColor,
  );

  expect(
    backgroundColor,
    "The runtime CanvasShell backing must stay visible. Product renderers may customize their own output background, but they must not hide or make the workspace shell transparent.",
  ).not.toMatch(/^(?:transparent|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))$/i);
});

test("browser canvas contains product output without app UI controls or CTA copy", async ({
  page,
}) => {
  if (!appSchema.assembly.surfaces.canvas.enabled) {
    return;
  }

  await page.goto("/");
  await expect(page.getByRole("application", { name: "Canvas viewport" })).toBeVisible();
  await expectNoForbiddenCanvasUi(page);
});

test("product observable helper catches changed and unchanged output", async ({ page }) => {
  await page.setContent(`
    <div data-toolcraft-product-output>Before</div>
    <button type="button" id="change-output">Change output</button>
  `);
  expect(
    await page.evaluate(() => ({
      hasSubtleCrypto: typeof crypto.subtle !== "undefined",
      href: location.href,
      secure: isSecureContext,
    })),
  ).toEqual({
    hasSubtleCrypto: false,
    href: "about:blank",
    secure: false,
  });

  const snapshot = await getToolcraftProductObservableSnapshot(page);
  const decodedSnapshot = JSON.parse(snapshot) as {
    height: number;
    rasterHash: string;
    width: number;
  };

  expect(decodedSnapshot).toMatchObject({
    height: expect.any(Number),
    rasterHash: expect.stringMatching(/^[a-f0-9]+$/u),
    width: expect.any(Number),
  });
  expect(decodedSnapshot.height).toBeGreaterThan(0);
  expect(decodedSnapshot.width).toBeGreaterThan(0);

  await expectToolcraftProductObservableToChange(page, async () => {
    await page.locator("#change-output").evaluate((button) => {
      button.previousElementSibling!.textContent = "After";
    });
  });

  await expect(
    expectToolcraftProductObservableToChange(page, async () => {}, {
      timeoutMs: 100,
    }),
  ).rejects.toThrow(/Product output should change/);
});

test("product observable helper rejects autonomous frame changes as interaction evidence", async ({
  page,
}) => {
  await page.setContent(`
    <div data-toolcraft-product-output>Frame 0</div>
    <script>
      let frame = 0;
      setInterval(() => {
        frame += 1;
        document.querySelector("[data-toolcraft-product-output]").textContent =
          "Frame " + frame;
      }, 8);
    </script>
  `);

  await expect(
    expectToolcraftProductObservableToChange(page, async () => undefined, {
      baselineStabilityIntervalMs: 12,
      baselineStabilitySamples: 3,
      timeoutMs: 150,
    }),
  ).rejects.toThrow(/baseline must remain stable/u);
});

test("canvas no-UI helper rejects unclassified canvas text", async ({ page }) => {
  await page.setContent(`
    <div data-toolcraft-canvas-world>
      <div>Click to upload an image</div>
    </div>
  `);

  await expect(expectNoForbiddenCanvasUi(page)).rejects.toThrow(
    /Canvas text must be product output/,
  );

  await page.setContent(`
    <div data-toolcraft-canvas-world>
      <div data-toolcraft-product-output>ASCII output</div>
    </div>
  `);

  await expectNoForbiddenCanvasUi(page);
});

test("canvas export-clean helper rejects a no-op export callback", async ({ page }) => {
  await page.setContent(
    '<div data-toolcraft-canvas-handle data-testid="focus-handle"></div>',
  );

  await expect(
    expectExportExcludesCanvasHandles(
      page,
      async () => undefined,
      async () => ({ byteLength: 0, contentHash: "missing" }),
    ),
  ).rejects.toThrow(/export artifact/i);
});

test("canvas export-clean helper compares semantic output instead of encoder bytes", async ({ page }) => {
  await page.setContent(
    '<div data-toolcraft-canvas-handle data-testid="focus-handle"></div>',
  );
  let exportCount = 0;

  await expectExportExcludesCanvasHandles(
    page,
    async () => new Uint8Array([1, 2, 3, exportCount++]),
    async (artifact) => ({
      byteLength: artifact.byteLength,
      contentHash: "same-decoded-pixels",
      height: 1,
      mediaType: "image/png",
      width: 1,
    }),
  );
});
