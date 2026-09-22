import type { ToolcraftNormalizedPixelBounds } from "./export-artifact-helpers";

export const TOOLCRAFT_DECODED_OBSERVATION_SIZE = 64;
export const TOOLCRAFT_LOSSLESS_PIXEL_DISTANCE_TOLERANCE = 0;
export const TOOLCRAFT_LOSSY_PIXEL_DISTANCE_TOLERANCE = 48;
export const TOOLCRAFT_BACKGROUND_PIXEL_DISTANCE_THRESHOLD = 24;

export type ToolcraftExpectedDecodedPixel = Readonly<{
  rgba: readonly [number, number, number, number];
  xRatio: number;
  yRatio: number;
}>;

export type ToolcraftExpectedDecodedVideoSample = Readonly<{
  pixels: readonly ToolcraftExpectedDecodedPixel[];
  timeSeconds: number;
}>;

export type ToolcraftDecodedPixelObservation = Readonly<{
  centroid: Readonly<{ x: number; y: number }> | null;
  decodedPixelHash: string;
  nonBackgroundBounds: ToolcraftNormalizedPixelBounds | null;
  normalizedPixels: Uint8ClampedArray;
  occupiedAreaRatio: number;
}>;

function assertRgba(
  rgba: readonly number[],
  label: string,
): asserts rgba is readonly [number, number, number, number] {
  if (
    rgba.length !== 4 ||
    rgba.some(
      (channel) =>
        !Number.isSafeInteger(channel) || channel < 0 || channel > 255,
    )
  ) {
    throw new Error(`${label} must contain four integer RGBA channels from 0 to 255.`);
  }
}

function assertRatio(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a finite normalized coordinate from 0 to 1.`);
  }
}

export function validateToolcraftExpectedDecodedPixels(
  pixels: readonly ToolcraftExpectedDecodedPixel[],
  label = "Decoded pixel expectations",
): void {
  if (!Array.isArray(pixels) || pixels.length === 0) {
    throw new Error(`${label} must contain at least one exact pixel sample.`);
  }
  for (const [index, pixel] of pixels.entries()) {
    assertRatio(pixel.xRatio, `${label}[${index}].xRatio`);
    assertRatio(pixel.yRatio, `${label}[${index}].yRatio`);
    assertRgba(pixel.rgba, `${label}[${index}].rgba`);
  }
}

export function getToolcraftRgbaDistance(
  left: readonly number[],
  right: readonly number[],
): number {
  return Math.sqrt(
    left.reduce((sum, channel, index) => {
      const delta = channel - (right[index] ?? 0);
      return sum + delta * delta;
    }, 0),
  );
}

function normalizePixels({
  pixels,
  sourceHeight,
  sourceWidth,
}: Readonly<{
  pixels: Uint8ClampedArray;
  sourceHeight: number;
  sourceWidth: number;
}>): Uint8ClampedArray {
  if (
    !Number.isSafeInteger(sourceWidth) ||
    sourceWidth <= 0 ||
    !Number.isSafeInteger(sourceHeight) ||
    sourceHeight <= 0 ||
    pixels.length !== sourceWidth * sourceHeight * 4
  ) {
    throw new Error("Decoded pixel input must match positive source dimensions.");
  }
  if (
    sourceWidth === TOOLCRAFT_DECODED_OBSERVATION_SIZE &&
    sourceHeight === TOOLCRAFT_DECODED_OBSERVATION_SIZE
  ) {
    return new Uint8ClampedArray(pixels);
  }

  const normalized = new Uint8ClampedArray(
    TOOLCRAFT_DECODED_OBSERVATION_SIZE * TOOLCRAFT_DECODED_OBSERVATION_SIZE * 4,
  );
  for (let y = 0; y < TOOLCRAFT_DECODED_OBSERVATION_SIZE; y += 1) {
    const sourceY = Math.min(
      sourceHeight - 1,
      Math.floor(((y + 0.5) / TOOLCRAFT_DECODED_OBSERVATION_SIZE) * sourceHeight),
    );
    for (let x = 0; x < TOOLCRAFT_DECODED_OBSERVATION_SIZE; x += 1) {
      const sourceX = Math.min(
        sourceWidth - 1,
        Math.floor(((x + 0.5) / TOOLCRAFT_DECODED_OBSERVATION_SIZE) * sourceWidth),
      );
      const sourceOffset = (sourceY * sourceWidth + sourceX) * 4;
      const outputOffset =
        (y * TOOLCRAFT_DECODED_OBSERVATION_SIZE + x) * 4;
      normalized.set(pixels.subarray(sourceOffset, sourceOffset + 4), outputOffset);
    }
  }
  return normalized;
}

async function hashPixels(pixels: Uint8ClampedArray): Promise<string> {
  const source = new Uint8Array(
    pixels.buffer,
    pixels.byteOffset,
    pixels.byteLength,
  );
  const hash = await crypto.subtle.digest("SHA-256", source);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function observeToolcraftDecodedPixels({
  backgroundRgba,
  pixels,
  sourceHeight,
  sourceWidth,
}: Readonly<{
  backgroundRgba: readonly [number, number, number, number];
  pixels: Uint8ClampedArray;
  sourceHeight: number;
  sourceWidth: number;
}>): Promise<ToolcraftDecodedPixelObservation> {
  assertRgba(backgroundRgba, "backgroundRgba");
  const normalizedPixels = normalizePixels({
    pixels,
    sourceHeight,
    sourceWidth,
  });
  let count = 0;
  let minX = TOOLCRAFT_DECODED_OBSERVATION_SIZE;
  let minY = TOOLCRAFT_DECODED_OBSERVATION_SIZE;
  let maxX = -1;
  let maxY = -1;
  let sumX = 0;
  let sumY = 0;

  for (let y = 0; y < TOOLCRAFT_DECODED_OBSERVATION_SIZE; y += 1) {
    for (let x = 0; x < TOOLCRAFT_DECODED_OBSERVATION_SIZE; x += 1) {
      const offset = (y * TOOLCRAFT_DECODED_OBSERVATION_SIZE + x) * 4;
      const pixel = normalizedPixels.subarray(offset, offset + 4);
      if (
        getToolcraftRgbaDistance(pixel, backgroundRgba) <=
        TOOLCRAFT_BACKGROUND_PIXEL_DISTANCE_THRESHOLD
      ) {
        continue;
      }
      count += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      sumX += x + 0.5;
      sumY += y + 0.5;
    }
  }

  const size = TOOLCRAFT_DECODED_OBSERVATION_SIZE;
  return Object.freeze({
    centroid:
      count === 0
        ? null
        : Object.freeze({ x: sumX / count / size, y: sumY / count / size }),
    decodedPixelHash: await hashPixels(normalizedPixels),
    nonBackgroundBounds:
      count === 0
        ? null
        : Object.freeze({
            height: (maxY - minY + 1) / size,
            width: (maxX - minX + 1) / size,
            x: minX / size,
            y: minY / size,
          }),
    normalizedPixels,
    occupiedAreaRatio: count / (size * size),
  });
}

export function assertToolcraftExpectedDecodedPixels({
  expectedPixels,
  mediaType,
  observation,
}: Readonly<{
  expectedPixels: readonly ToolcraftExpectedDecodedPixel[];
  mediaType: "image/jpeg" | "image/png" | "video/mp4" | "video/webm";
  observation: ToolcraftDecodedPixelObservation;
}>): void {
  validateToolcraftExpectedDecodedPixels(expectedPixels);
  const tolerance =
    mediaType === "image/png"
      ? TOOLCRAFT_LOSSLESS_PIXEL_DISTANCE_TOLERANCE
      : TOOLCRAFT_LOSSY_PIXEL_DISTANCE_TOLERANCE;
  const size = TOOLCRAFT_DECODED_OBSERVATION_SIZE;

  for (const expected of expectedPixels) {
    const x = Math.min(size - 1, Math.floor(expected.xRatio * size));
    const y = Math.min(size - 1, Math.floor(expected.yRatio * size));
    const offset = (y * size + x) * 4;
    const actual = observation.normalizedPixels.subarray(offset, offset + 4);
    const distance = getToolcraftRgbaDistance(actual, expected.rgba);
    if (distance > tolerance) {
      throw new Error(
        `Decoded pixel at (${expected.xRatio}, ${expected.yRatio}) differs from expected RGBA by ${distance.toFixed(2)}; fixed tolerance is ${tolerance}.`,
      );
    }
  }
}
