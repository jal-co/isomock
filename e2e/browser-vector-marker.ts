import { expect, type Page } from "@playwright/test";

export type ToolcraftVectorMarker = Readonly<{
  /** A fixed product surface containing a uniquely colored feature (DOM, SVG, canvas or WebGL). */
  selector: string;
  rgb: readonly [number, number, number];
}>;

export type VectorMarkerSnapshot = Readonly<{
  x: number;
  y: number;
  area: number;
}>;

export async function createVectorMarkerReader(
  page: Page,
  marker: ToolcraftVectorMarker,
) {
  expect(
    marker.selector.trim(),
    "Vector proof requires a product surface selector.",
  ).not.toBe("");
  expect(marker.rgb.length).toBe(3);
  expect(
    marker.rgb.every(
      (value) => Number.isInteger(value) && value >= 0 && value <= 255,
    ),
  ).toBe(true);
  const surface = page.locator(marker.selector);
  await expect(surface).toHaveCount(1);
  await expect(surface).toBeVisible();
  expect(
    await surface.evaluate((element) =>
      Boolean(
        element.closest('[data-slot="toolcraft-runtime-app"]') &&
        element.closest(
          "[data-toolcraft-product-scene], [data-toolcraft-canvas-content], [data-toolcraft-product-output]",
        ) &&
        !element.closest("[data-toolcraft-canvas-handle]"),
      ),
    ),
    "Vector proof must measure product pixels, not editor controls or handles.",
  ).toBe(true);

  const bounds = await surface.boundingBox();
  if (
    !bounds ||
    bounds.width < 8 ||
    bounds.height < 8 ||
    bounds.width * bounds.height > 8_388_608
  ) {
    throw new Error(
      "Vector proof requires a bounded positive-area product surface.",
    );
  }
  const viewport = page.viewportSize();
  if (
    !viewport ||
    bounds.x < 0 ||
    bounds.y < 0 ||
    bounds.x + bounds.width > viewport.width ||
    bounds.y + bounds.height > viewport.height
  ) {
    throw new Error(
      "Vector proof surface must fit fully inside the fixed viewport.",
    );
  }
  const frame = () =>
    surface.evaluate((element) => {
      const frames: string[] = [];
      for (
        let node: Element | null = element;
        node;
        node = node.parentElement
      ) {
        const style = getComputedStyle(node);
        frames.push(
          `${style.transform}:${style.translate}:${style.scale}:${style.rotate}`,
        );
      }
      return frames;
    });
  const initialFrame = await frame();
  const clip = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };

  return async (): Promise<VectorMarkerSnapshot> => {
    expect(
      await surface.boundingBox(),
      "Vector proof must not move/resize the product surface or camera frame.",
    ).toEqual(bounds);
    expect(
      await frame(),
      "Vector proof must preserve viewport/world transforms.",
    ).toEqual(initialFrame);
    const screenshot = await page.screenshot({
      clip,
      type: "png",
      scale: "css",
      caret: "hide",
      animations: "allow",
    });
    const sample = await page.evaluate(
      async ({ png, rgb }) => {
        const bytes = Uint8Array.from(atob(png), (char) => char.charCodeAt(0));
        const bitmap = await createImageBitmap(
          new Blob([bytes], { type: "image/png" }),
        );
        try {
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context)
            throw new Error("Cannot decode vector proof screenshot.");
          context.drawImage(bitmap, 0, 0);
          const pixels = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          ).data;
          let area = 0,
            sumX = 0,
            sumY = 0;
          let minX = canvas.width,
            minY = canvas.height,
            maxX = -1,
            maxY = -1;
          for (let y = 0; y < canvas.height; y += 1) {
            for (let x = 0; x < canvas.width; x += 1) {
              const offset = (y * canvas.width + x) * 4;
              if (
                pixels[offset + 3]! < 250 ||
                rgb.some(
                  (channel, index) =>
                    Math.abs(pixels[offset + index]! - channel) > 12,
                )
              )
                continue;
              area += 1;
              sumX += x + 0.5;
              sumY += y + 0.5;
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
            }
          }
          return {
            area,
            x: sumX / area,
            y: sumY / area,
            minX,
            minY,
            maxX,
            maxY,
            width: canvas.width,
            height: canvas.height,
          };
        } finally {
          bitmap.close();
        }
      },
      { png: screenshot.toString("base64"), rgb: marker.rgb },
    );
    expect(
      sample.area,
      "Vector proof needs at least 16 visible marker pixels; missing pixels/state attributes are not proof.",
    ).toBeGreaterThanOrEqual(16);
    expect(
      sample.area,
      "Use an isolated product feature, not the background.",
    ).toBeLessThan(sample.width * sample.height * 0.15);
    expect(
      sample.area /
        ((sample.maxX - sample.minX + 1) * (sample.maxY - sample.minY + 1)),
      "The marker color must identify one compact feature, not scattered repeated texture pixels.",
    ).toBeGreaterThan(0.5);
    expect(
      Math.min(
        sample.minX,
        sample.minY,
        sample.width - 1 - sample.maxX,
        sample.height - 1 - sample.maxY,
      ),
      "The marker must remain unclipped inside the product surface.",
    ).toBeGreaterThanOrEqual(1);
    return {
      area: sample.area,
      x: sample.x + bounds.x,
      y: sample.y + bounds.y,
    };
  };
}

export function assertVectorMarkerStable(
  actual: VectorMarkerSnapshot,
  expected: VectorMarkerSnapshot,
): void {
  expect(
    Math.hypot(actual.x - expected.x, actual.y - expected.y),
    "Vector proof needs stable output with animation paused.",
  ).toBeLessThanOrEqual(0.75);
  expect(
    Math.abs(actual.area / expected.area - 1),
    "Vector marker must retain its visible area.",
  ).toBeLessThanOrEqual(0.15);
}
