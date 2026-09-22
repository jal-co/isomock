import { expect, type Download, type Page } from "@playwright/test";
import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
import { assertToolcraftExpectedDecodedPixels, TOOLCRAFT_BACKGROUND_PIXEL_DISTANCE_THRESHOLD, getToolcraftRgbaDistance, validateToolcraftExpectedDecodedPixels, type ToolcraftExpectedDecodedPixel } from "./decoded-pixel-observation";
import type { ToolcraftNormalizedPixelBounds } from "./export-artifact-helpers";

type ExpectedImage = Readonly<{
  download: Download;
  width: number;
  height: number;
  bounds: ToolcraftNormalizedPixelBounds;
  pixels: readonly ToolcraftExpectedDecodedPixel[];
}>;

/** Different crops require independently decoded content proof, not hash equality. */
export async function expectToolcraftInfinityCanvasImageBoundsEvidence(
  artifacts: Readonly<{ finite: ExpectedImage; infinite: ExpectedImage }>,
  options: Readonly<{
    page: Page;
    backgroundRgba: readonly [number, number, number, number];
    requirementId: string;
    target: string;
  }>,
): Promise<void> {
  for (const expected of [artifacts.finite, artifacts.infinite]) {
    validateToolcraftExpectedDecodedPixels(expected.pixels);
    expect(expected.pixels.some(pixel => getToolcraftRgbaDistance(pixel.rgba, options.backgroundRgba) > TOOLCRAFT_BACKGROUND_PIXEL_DISTANCE_THRESHOLD)).toBe(true);
    const actual = await inspectToolcraftImageDownload({ page: options.page, download: expected.download, backgroundRgba: options.backgroundRgba });
    expect(actual.inspection).toMatchObject({ width: expected.width, height: expected.height });
    expect(actual.inspection.byteLength).toBeGreaterThan(100);
    expect(actual.inspection.decodedPixelHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(actual.inspection.nonBackgroundBounds).not.toBeNull();
    for (const field of ["x", "y", "width", "height"] as const) {
      expect(Math.abs(actual.inspection.nonBackgroundBounds![field] - expected.bounds[field])).toBeLessThanOrEqual(2 / 64);
    }
    assertToolcraftExpectedDecodedPixels({ expectedPixels: expected.pixels, mediaType: actual.inspection.mediaType, observation: actual.observation });
  }
  for (const evidenceType of ["exported-artifact", "infinity-scene-bounds-image-export"] as const) {
    await attachToolcraftBrowserRuntimeEvidence({ evidenceType, requirementId: options.requirementId, target: options.target });
  }
}
