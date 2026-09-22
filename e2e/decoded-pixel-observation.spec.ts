import { expect, test } from "@playwright/test";

import {
  assertToolcraftExpectedDecodedPixels,
  observeToolcraftDecodedPixels,
  validateToolcraftExpectedDecodedPixels,
} from "./decoded-pixel-observation";

function createCenteredFixture(): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(64 * 64 * 4);
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const offset = (y * 64 + x) * 4;
      const product = x >= 16 && x < 48 && y >= 16 && y < 48;
      pixels.set(product ? [255, 0, 0, 255] : [0, 0, 0, 255], offset);
    }
  }
  return pixels;
}

test("decoded pixels produce stable semantic bounds and hash", async () => {
  const observation = await observeToolcraftDecodedPixels({
    backgroundRgba: [0, 0, 0, 255],
    pixels: createCenteredFixture(),
    sourceHeight: 64,
    sourceWidth: 64,
  });

  expect(observation.decodedPixelHash).toMatch(/^[a-f0-9]{64}$/u);
  expect(observation.nonBackgroundBounds).toEqual({
    height: 0.5,
    width: 0.5,
    x: 0.25,
    y: 0.25,
  });
  expect(observation.centroid).toEqual({ x: 0.5, y: 0.5 });
  expect(observation.occupiedAreaRatio).toBe(0.25);
  expect(() =>
    assertToolcraftExpectedDecodedPixels({
      expectedPixels: [
        { rgba: [255, 0, 0, 255], xRatio: 0.5, yRatio: 0.5 },
      ],
      mediaType: "image/png",
      observation,
    }),
  ).not.toThrow();
});

test("decoded pixel expectations cannot provide empty, invalid, or loosened checks", async () => {
  const observation = await observeToolcraftDecodedPixels({
    backgroundRgba: [0, 0, 0, 255],
    pixels: createCenteredFixture(),
    sourceHeight: 64,
    sourceWidth: 64,
  });

  expect(() => validateToolcraftExpectedDecodedPixels([])).toThrow(
    "at least one exact pixel sample",
  );
  expect(() =>
    validateToolcraftExpectedDecodedPixels([
      { rgba: [256, 0, 0, 255], xRatio: 2, yRatio: 0 } as never,
    ]),
  ).toThrow();
  expect(() =>
    assertToolcraftExpectedDecodedPixels({
      expectedPixels: [
        { rgba: [0, 255, 0, 255], xRatio: 0.5, yRatio: 0.5 },
      ],
      mediaType: "image/png",
      observation,
    }),
  ).toThrow("fixed tolerance is 0");
});
