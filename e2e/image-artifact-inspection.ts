import fs from "node:fs/promises";

import type { Download, Page } from "@playwright/test";

import {
  observeToolcraftDecodedPixels,
  type ToolcraftDecodedPixelObservation,
} from "./decoded-pixel-observation";
import type { ToolcraftImageArtifactInspection } from "./export-artifact-helpers";

export type ToolcraftInspectedImageArtifact = Readonly<{
  inspection: ToolcraftImageArtifactInspection;
  observation: ToolcraftDecodedPixelObservation;
}>;

function detectImageMediaType(
  bytes: Uint8Array,
): "image/jpeg" | "image/png" {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  throw new Error("Downloaded artifact is not a decodable PNG or JPEG image.");
}

export async function inspectToolcraftImageDownload({
  backgroundRgba,
  download,
  page,
}: Readonly<{
  backgroundRgba: readonly [number, number, number, number];
  download: Download;
  page: Page;
}>): Promise<ToolcraftInspectedImageArtifact> {
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("Playwright did not expose the downloaded image path.");
  }
  const bytes = await fs.readFile(downloadPath);
  if (bytes.byteLength === 0) {
    throw new Error("Downloaded image artifact is empty.");
  }
  const mediaType = detectImageMediaType(bytes);
  const decoded = await page.evaluate(
    async ({ base64, mediaType: decodedMediaType }) => {
      const binary = atob(base64);
      const data = Uint8Array.from(binary, (character) =>
        character.charCodeAt(0),
      );
      const bitmap = await createImageBitmap(
        new Blob([data], { type: decodedMediaType }),
      );
      try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Unable to inspect exported image pixels.");
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
        const digest = await crypto.subtle.digest("SHA-256", pixels);
        const decodedPixelHash = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
        canvas.width = 64;
        canvas.height = 64;
        context.imageSmoothingEnabled = false;
        context.drawImage(bitmap, 0, 0, 64, 64);
        return {
          decodedPixelHash,
          height: bitmap.height,
          pixels: Array.from(context.getImageData(0, 0, 64, 64).data),
          width: bitmap.width,
        };
      } finally {
        bitmap.close();
      }
    },
    { base64: bytes.toString("base64"), mediaType },
  );
  const observation = await observeToolcraftDecodedPixels({
    backgroundRgba,
    pixels: Uint8ClampedArray.from(decoded.pixels),
    sourceHeight: 64,
    sourceWidth: 64,
  });

  return Object.freeze({
    inspection: Object.freeze({
      byteLength: bytes.byteLength,
      decodedPixelHash: decoded.decodedPixelHash,
      height: decoded.height,
      kind: "image",
      mediaType,
      nonBackgroundBounds: observation.nonBackgroundBounds,
      width: decoded.width,
    }),
    observation,
  });
}
