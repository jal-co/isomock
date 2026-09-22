import { expect, type Page } from "@playwright/test";

export type ToolcraftModelPixelSnapshot = Readonly<{
  hash: string;
  meanBlue: number;
  meanGreen: number;
  meanRed: number;
  nonTransparentPixels: number;
}>;

const baselineByPage = new WeakMap<Page, Map<string, Buffer>>();

async function canvasFor(
  page: Page,
  attribute: "data-canvas-model-prewarm-target" | "data-canvas-model-target",
  target: string,
) {
  const layer = page.locator(`[${attribute}=${JSON.stringify(target)}]`);
  await expect(layer).toHaveCount(1);
  const canvas = layer.locator("canvas[data-toolcraft-generated-output]");
  await expect(canvas).toHaveCount(1);
  return canvas;
}

export async function prepareToolcraftModelPixelBaseline(
  page: Page,
  target: string,
): Promise<void> {
  const canvas = await canvasFor(page, "data-canvas-model-prewarm-target", target);
  const targets = baselineByPage.get(page) ?? new Map<string, Buffer>();
  targets.set(target, await canvas.screenshot({ omitBackground: true }));
  baselineByPage.set(page, targets);
}

export async function expectToolcraftModelRenderedPixels(
  page: Page,
  target: string,
): Promise<ToolcraftModelPixelSnapshot> {
  const baseline = baselineByPage.get(page)?.get(target);
  if (!baseline) {
    throw new Error(`Model pixel proof for "${target}" requires a neutral prewarm baseline.`);
  }
  const canvas = await canvasFor(page, "data-canvas-model-target", target);
  const rendered = await canvas.screenshot({ omitBackground: true });
  const snapshot = await page.evaluate(
    async ({ baselinePng, renderedPng }) => {
      const decode = async (base64: string): Promise<ImageData> => {
        const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = surface.getContext("2d");
        if (!context) throw new Error("Model pixel proof requires a 2D decode context.");
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        return context.getImageData(0, 0, surface.width, surface.height);
      };
      const [before, after] = await Promise.all([decode(baselinePng), decode(renderedPng)]);
      if (before.width !== after.width || before.height !== after.height) {
        throw new Error("Model pixel proof requires stable canvas dimensions.");
      }
      let hash = 2_166_136_261;
      let nonTransparentPixels = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let offset = 0; offset < after.data.length; offset += 4) {
        const pixelRed = after.data[offset]!;
        const pixelGreen = after.data[offset + 1]!;
        const pixelBlue = after.data[offset + 2]!;
        const alpha = after.data[offset + 3]!;
        if (
          alpha === 0 ||
          (pixelRed === before.data[offset] &&
            pixelGreen === before.data[offset + 1] &&
            pixelBlue === before.data[offset + 2] &&
            alpha === before.data[offset + 3])
        )
          continue;
        nonTransparentPixels += 1;
        red += pixelRed;
        green += pixelGreen;
        blue += pixelBlue;
        for (const value of [pixelRed, pixelGreen, pixelBlue, alpha]) {
          hash = Math.imul(hash ^ value, 16_777_619) >>> 0;
        }
      }
      const divisor = Math.max(1, nonTransparentPixels);
      return {
        hash: hash.toString(16).padStart(8, "0"),
        meanBlue: Math.round(blue / divisor),
        meanGreen: Math.round(green / divisor),
        meanRed: Math.round(red / divisor),
        nonTransparentPixels,
      };
    },
    {
      baselinePng: baseline.toString("base64"),
      renderedPng: rendered.toString("base64"),
    },
  );
  expect(snapshot.nonTransparentPixels).toBeGreaterThan(0);
  expect(snapshot.hash).not.toBe("00000000");
  return Object.freeze(snapshot);
}

export function expectToolcraftModelAppearancePixels(
  snapshot: ToolcraftModelPixelSnapshot,
  appearance: "authored" | "fallback" | "warning",
  materialSignature: string,
): void {
  if (appearance === "fallback") {
    expect(
      Math.max(snapshot.meanRed, snapshot.meanGreen, snapshot.meanBlue) -
        Math.min(snapshot.meanRed, snapshot.meanGreen, snapshot.meanBlue),
    ).toBeLessThanOrEqual(2);
    return;
  }
  if (/red-(?:base|texture)|:red\b|painted/iu.test(materialSignature)) {
    expect(snapshot.meanRed).toBeGreaterThan(snapshot.meanGreen);
    expect(snapshot.meanRed).toBeGreaterThan(snapshot.meanBlue);
  }
}

export function expectToolcraftModelPixelParity(
  left: ToolcraftModelPixelSnapshot,
  right: ToolcraftModelPixelSnapshot,
): void {
  for (const channel of ["meanRed", "meanGreen", "meanBlue"] as const) {
    expect(Math.abs(left[channel] - right[channel])).toBeLessThanOrEqual(5);
  }
  const largerPixelCount = Math.max(left.nonTransparentPixels, right.nonTransparentPixels);
  expect(
    Math.abs(left.nonTransparentPixels - right.nonTransparentPixels) / largerPixelCount,
  ).toBeLessThanOrEqual(0.05);
}
