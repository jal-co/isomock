import { expect, type Download, type Page } from "@playwright/test";

import {
  assertToolcraftExpectedDecodedPixels,
  getToolcraftRgbaDistance,
  TOOLCRAFT_BACKGROUND_PIXEL_DISTANCE_THRESHOLD,
  validateToolcraftExpectedDecodedPixels,
  type ToolcraftExpectedDecodedPixel,
  type ToolcraftExpectedDecodedVideoSample,
} from "./decoded-pixel-observation";
import type { ToolcraftNormalizedPixelBounds } from "./export-artifact-helpers";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import {
  assertToolcraftVideoPacketSchedule,
  inspectToolcraftVideoDownload,
  type ToolcraftInspectedVideoArtifact,
  type ToolcraftScheduledVideoFrame,
} from "./video-artifact-inspection";
import {
  getToolcraftBrowserActionTarget,
  isToolcraftBrowserAction,
  runToolcraftBrowserValueAction,
  type ToolcraftBrowserAction,
} from "./browser-proof-session";

type AdditionalArtifactRequirement = Readonly<{
  requirementId: string;
  target: string;
}>;

async function attachAdditionalArtifactRequirements(
  requirements: readonly AdditionalArtifactRequirement[] | undefined,
): Promise<void> {
  for (const requirement of requirements ?? []) {
    await attachToolcraftBrowserRuntimeEvidence({
      evidenceType: "exported-artifact",
      requirementId: requirement.requirementId,
      target: requirement.target,
    });
  }
}

const normalizedBoundsTolerance = 2 / 64;

function assertContainsProductExpectation(
  expectedPixels: readonly ToolcraftExpectedDecodedPixel[],
  backgroundRgba: readonly [number, number, number, number],
): void {
  validateToolcraftExpectedDecodedPixels(expectedPixels);
  if (
    !expectedPixels.some(
      ({ rgba }) =>
        getToolcraftRgbaDistance(rgba, backgroundRgba) >
        TOOLCRAFT_BACKGROUND_PIXEL_DISTANCE_THRESHOLD,
    )
  ) {
    throw new Error(
      "Media export evidence requires at least one non-background product pixel expectation.",
    );
  }
}

function assertExpectedBounds(
  actual: ToolcraftNormalizedPixelBounds | null,
  expected: ToolcraftNormalizedPixelBounds,
): void {
  expect(actual, "Decoded export must contain product pixels.").not.toBeNull();
  if (!actual) return;
  for (const field of ["height", "width", "x", "y"] as const) {
    expect(
      Math.abs(actual[field] - expected[field]),
      `Decoded product ${field} must match the expected normalized bounds.`,
    ).toBeLessThanOrEqual(normalizedBoundsTolerance);
  }
}

export async function expectToolcraftImageExportArtifact(
  produceDownload:
    | (() => Promise<Download>)
    | ToolcraftBrowserAction<"interaction", Download>,
  options: Readonly<{
    additionalArtifactRequirements?: readonly AdditionalArtifactRequirement[];
    backgroundRgba: readonly [number, number, number, number];
    expectedBounds: ToolcraftNormalizedPixelBounds;
    expectedHeight: number;
    expectedMediaType: "image/jpeg" | "image/png";
    expectedPixels: readonly ToolcraftExpectedDecodedPixel[];
    expectedWidth: number;
    page: Page;
    requirementId: string;
  }>,
): Promise<void> {
  assertContainsProductExpectation(options.expectedPixels, options.backgroundRgba);
  const target = isToolcraftBrowserAction(produceDownload)
    ? getToolcraftBrowserActionTarget(produceDownload)
    : undefined;
  const download = isToolcraftBrowserAction(produceDownload)
    ? await runToolcraftBrowserValueAction(produceDownload)
    : await produceDownload();
  const inspected = await inspectToolcraftImageDownload({
    backgroundRgba: options.backgroundRgba,
    download,
    page: options.page,
  });
  expect(inspected.inspection.byteLength).toBeGreaterThan(0);
  expect(inspected.inspection.mediaType).toBe(options.expectedMediaType);
  expect(inspected.inspection.width).toBe(options.expectedWidth);
  expect(inspected.inspection.height).toBe(options.expectedHeight);
  expect(inspected.inspection.decodedPixelHash).not.toHaveLength(0);
  assertExpectedBounds(
    inspected.inspection.nonBackgroundBounds,
    options.expectedBounds,
  );
  assertToolcraftExpectedDecodedPixels({
    expectedPixels: options.expectedPixels,
    mediaType: inspected.inspection.mediaType,
    observation: inspected.observation,
  });
  await attachAdditionalArtifactRequirements(
    options.additionalArtifactRequirements,
  );
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "image-export-artifact",
    requirementId: options.requirementId,
    target,
  });
}

export async function expectToolcraftVideoExportArtifact(
  produceDownload:
    | (() => Promise<Download>)
    | ToolcraftBrowserAction<"interaction", Download>,
  options: Readonly<{
    additionalArtifactRequirements?: readonly AdditionalArtifactRequirement[];
    animated: boolean;
    backgroundRgba: readonly [number, number, number, number];
    expectedDurationSeconds: number;
    expectedHeight: number;
    expectedMediaType: "video/mp4" | "video/webm";
    expectedSamples: readonly ToolcraftExpectedDecodedVideoSample[];
    expectedWidth: number;
    page: Page;
    requirementId: string;
    schedule: readonly ToolcraftScheduledVideoFrame[];
  }>,
): Promise<ToolcraftInspectedVideoArtifact> {
  if (options.schedule.length === 0) {
    throw new Error("Video export evidence requires the runtime frame schedule.");
  }
  for (const sample of options.expectedSamples) {
    assertContainsProductExpectation(sample.pixels, options.backgroundRgba);
  }
  const target = isToolcraftBrowserAction(produceDownload)
    ? getToolcraftBrowserActionTarget(produceDownload)
    : undefined;
  const download = isToolcraftBrowserAction(produceDownload)
    ? await runToolcraftBrowserValueAction(produceDownload)
    : await produceDownload();
  const inspected = await inspectToolcraftVideoDownload({
    backgroundRgba: options.backgroundRgba,
    download,
    page: options.page,
    schedule: options.schedule,
  });
  const toleranceSeconds = 1 / inspected.timeResolution;
  expect(inspected.inspection.byteLength).toBeGreaterThan(0);
  expect(inspected.inspection.mediaType).toBe(options.expectedMediaType);
  expect(inspected.inspection.width).toBe(options.expectedWidth);
  expect(inspected.inspection.height).toBe(options.expectedHeight);
  expect(inspected.inspection.frameCount).toBe(options.schedule.length);
  expect(
    Math.abs(
      inspected.inspection.durationMs - options.expectedDurationSeconds * 1000,
    ),
  ).toBeLessThanOrEqual(toleranceSeconds * 1000);
  assertToolcraftVideoPacketSchedule({
    packetTimings: inspected.inspection.packetTimings,
    schedule: options.schedule,
    timeResolution: inspected.timeResolution,
  });
  expect(inspected.sampleTimes).toEqual(
    options.expectedSamples.map(({ timeSeconds }) => timeSeconds),
  );
  expect(inspected.observations).toHaveLength(options.expectedSamples.length);
  for (const [index, observation] of inspected.observations.entries()) {
    const expected = options.expectedSamples[index];
    if (!expected) throw new Error(`Missing expected decoded sample ${index}.`);
    expect(observation.nonBackgroundBounds).not.toBeNull();
    assertToolcraftExpectedDecodedPixels({
      expectedPixels: expected.pixels,
      mediaType: inspected.inspection.mediaType,
      observation,
    });
  }
  if (options.animated) {
    expect(new Set(inspected.inspection.samplePixelHashes).size).toBeGreaterThan(1);
  }
  await attachAdditionalArtifactRequirements(
    options.additionalArtifactRequirements,
  );
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "video-export-artifact",
    requirementId: options.requirementId,
    target,
  });
  return inspected;
}
