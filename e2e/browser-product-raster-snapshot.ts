import { createHash } from "node:crypto";

import { expect, type Locator, type Page } from "@playwright/test";

const maxRasterDimension = 4096;
const maxRasterPixelArea = 8_388_608;
const screenshotOptions = Object.freeze({
  animations: "disabled" as const,
  caret: "hide" as const,
  scale: "css" as const,
  type: "png" as const,
});
const warmedSelectors = new WeakMap<Page, Set<string>>();

export type ToolcraftProductRasterRegion = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export type ToolcraftProductRasterProbe = Readonly<{
  region?: ToolcraftProductRasterRegion;
  selector: string;
}>;

export type ToolcraftResolvedProductRasterProbe = Readonly<{
  bounds: ToolcraftProductRasterRegion;
  capture: () => Promise<string>;
  locator: Locator;
}>;

function validateRegion(
  region: ToolcraftProductRasterRegion,
  ownerWidth: number,
  ownerHeight: number,
  label: string,
): void {
  if (
    !Number.isFinite(region.x) ||
    !Number.isFinite(region.y) ||
    !Number.isFinite(region.width) ||
    !Number.isFinite(region.height) ||
    region.x < 0 ||
    region.y < 0 ||
    region.width <= 0 ||
    region.height <= 0 ||
    region.x + region.width > ownerWidth ||
    region.y + region.height > ownerHeight
  ) {
    throw new Error(
      `Raster probe "${label}" requires a finite positive region inside its visible selector.`,
    );
  }
}

async function decodeRasterSnapshot(
  page: Page,
  raster: Buffer,
  region: ToolcraftProductRasterRegion | undefined,
  selector: string,
): Promise<string> {
  const snapshot = await page.evaluate(
    async ({ encoded, maxDimension, maxPixelArea, probeRegion, selector }) => {
      const binary = atob(encoded);
      const bytes = Uint8Array.from(
        binary,
        (character) => character.charCodeAt(0),
      );
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: "image/png" }),
      );

      try {
        const source = probeRegion ?? {
          height: bitmap.height,
          width: bitmap.width,
          x: 0,
          y: 0,
        };
        if (
          source.width > maxDimension ||
          source.height > maxDimension ||
          source.width * source.height > maxPixelArea
        ) {
          throw new Error(
            `Raster probe "${selector}" exceeds the bounded visual proof limit (${source.width}x${source.height}).`,
          );
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(source.width);
        canvas.height = Math.ceil(source.height);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          throw new Error(
            `Raster probe "${selector}" could not decode its visual pixels.`,
          );
        }
        context.drawImage(
          bitmap,
          source.x,
          source.y,
          source.width,
          source.height,
          0,
          0,
          source.width,
          source.height,
        );
        const pixels = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        let pixelBytesBase64 = "";
        const chunkSize = 32_768;
        for (let offset = 0; offset < pixels.length; offset += chunkSize) {
          pixelBytesBase64 += String.fromCharCode(
            ...pixels.subarray(offset, offset + chunkSize),
          );
        }
        return {
          height: canvas.height,
          pixelBytesBase64: btoa(pixelBytesBase64),
          width: canvas.width,
        };
      } finally {
        bitmap.close();
      }
    },
    {
      encoded: raster.toString("base64"),
      maxDimension: maxRasterDimension,
      maxPixelArea: maxRasterPixelArea,
      probeRegion: region,
      selector,
    },
  );

  return JSON.stringify({
    height: snapshot.height,
    rasterHash: createHash("sha256")
      .update(Buffer.from(snapshot.pixelBytesBase64, "base64"))
      .digest("hex"),
    width: snapshot.width,
  });
}

export async function resolveToolcraftProductRasterProbe(
  page: Page,
  probe: ToolcraftProductRasterProbe,
  timeoutMs = 5000,
): Promise<ToolcraftResolvedProductRasterProbe> {
  if (!probe.selector.trim()) {
    throw new Error("A raster probe requires a non-empty selector.");
  }

  const locator = page.locator(probe.selector);
  await expect(
    locator,
    `Raster probe "${probe.selector}" must resolve exactly once.`,
  ).toHaveCount(1);
  await expect(locator).toBeVisible({ timeout: timeoutMs });
  const ownerBounds = await locator.boundingBox();
  if (
    ownerBounds === null ||
    !Number.isFinite(ownerBounds.width) ||
    !Number.isFinite(ownerBounds.height) ||
    ownerBounds.width <= 0 ||
    ownerBounds.height <= 0
  ) {
    throw new Error(
      `Raster probe "${probe.selector}" must have finite positive visible bounds.`,
    );
  }

  if (probe.region) {
    validateRegion(
      probe.region,
      ownerBounds.width,
      ownerBounds.height,
      probe.selector,
    );
  }
  const localBounds = probe.region ?? {
    height: ownerBounds.height,
    width: ownerBounds.width,
    x: 0,
    y: 0,
  };
  const bounds = {
    height: localBounds.height,
    width: localBounds.width,
    x: ownerBounds.x + localBounds.x,
    y: ownerBounds.y + localBounds.y,
  };

  return {
    bounds,
    capture: async () => {
      const pageSelectors = warmedSelectors.get(page) ?? new Set<string>();
      const key = `${probe.selector}:${JSON.stringify(probe.region ?? null)}`;
      if (!pageSelectors.has(key)) {
        await locator.screenshot(screenshotOptions);
        await page.evaluate(
          () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
        );
        pageSelectors.add(key);
        warmedSelectors.set(page, pageSelectors);
      }
      const raster = await locator.screenshot(screenshotOptions);
      return decodeRasterSnapshot(page, raster, probe.region, probe.selector);
    },
    locator,
  };
}
