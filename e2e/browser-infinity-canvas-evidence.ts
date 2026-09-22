import { expectToolcraftInfinityArtifactFrameParity, type ToolcraftInfinityExportEvidenceOptions } from "./browser-infinity-artifact-parity";
import { expect } from "@playwright/test";

import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import {
  expectFiniteCanvasObservation,
  expectInfiniteCanvasObservation,
  expectMeasurableInfinityCanvasRect,
  type InfinityCanvasBackgroundObservation,
  type InfinityCanvasObservation,
} from "./browser-infinity-canvas-observation";

export {
  expectFiniteCanvasObservation,
  expectInfiniteCanvasObservation,
  observeInfinityCanvas,
  observeInfinityCanvasBackground,
} from "./browser-infinity-canvas-observation";
export type {
  InfinityCanvasBackgroundObservation,
  InfinityCanvasObservation,
} from "./browser-infinity-canvas-observation";
export {
  createToolcraftUnavailableImageResourceFixture,
  expectToolcraftInfinityCanvasUnavailableImageExportEvidence,
} from "./browser-infinity-canvas-unavailable-image-evidence";
export type {
  ToolcraftUnavailableImageResourceFixture,
  ToolcraftUnavailableImageResourceObservation,
} from "./browser-infinity-canvas-unavailable-image-evidence";

export type InfinityCanvasTransitionContinuity = Readonly<{
  productHostPreserved: boolean;
  productOutputPreserved: boolean;
}>;

type InfinityCanvasContinuityTransitions = Readonly<{
  afterReloadToRestored: InfinityCanvasTransitionContinuity;
  beforeToEnabled: InfinityCanvasTransitionContinuity;
  restoredToUndone: InfinityCanvasTransitionContinuity;
  undoneToRedone: InfinityCanvasTransitionContinuity;
}>;

export async function expectToolcraftInfinityCanvasModeEvidence(
  observations: Readonly<{
    afterPan: InfinityCanvasObservation;
    afterReload: InfinityCanvasObservation;
    before: InfinityCanvasObservation;
    enabled: InfinityCanvasObservation;
    redone: InfinityCanvasObservation;
    restored: InfinityCanvasObservation;
    undone: InfinityCanvasObservation;
  }>,
  transitions: InfinityCanvasContinuityTransitions,
  options: Readonly<{
    expectedFiniteSize?: Readonly<{ height: number; width: number }>;
    expectedSceneRect: NonNullable<
      InfinityCanvasObservation["productScene"]["worldRect"]
    >;
    requirementId: string;
    target: string;
  }>,
): Promise<void> {
  const expectedFiniteSize =
    options.expectedFiniteSize ?? observations.before.finiteCanvasSize;
  const observedSequence = [
    observations.before,
    observations.enabled,
    observations.afterPan,
    observations.afterReload,
    observations.restored,
    observations.undone,
    observations.redone,
  ];
  expect(
    expectedFiniteSize,
    `Infinity canvas "${options.requirementId}" requires explicit expected finite dimensions or an exact observable before snapshot.`,
  ).not.toEqual(null);
  expectFiniteCanvasObservation(
    observations.before,
    expectedFiniteSize ?? undefined,
  );
  const baselineOutput = observations.before.productScene.output;
  expect(
    baselineOutput?.kind === "canvas" || baselineOutput?.kind === "svg",
    `Infinity canvas "${options.requirementId}" requires mounted product canvas or SVG output.`,
  ).toBe(true);
  expectMeasurableInfinityCanvasRect(
    options.expectedSceneRect,
    `Infinity canvas "${options.requirementId}" requires a finite positive-area expected product world rectangle.`,
  );
  for (const observation of observedSequence) {
    expect(observation.productSceneStatus).toBe("ready");
    expectMeasurableInfinityCanvasRect(
      observation.productScene.worldRect,
      `Infinity canvas "${options.requirementId}" requires finite positive-area product world rectangles.`,
    );
    expectMeasurableInfinityCanvasRect(
      observation.productScene.viewportRect,
      `Infinity canvas "${options.requirementId}" requires finite positive-area product viewport rectangles.`,
    );
  }
  expectInfiniteCanvasObservation(
    observations.enabled,
    options.expectedSceneRect,
  );
  expectInfiniteCanvasObservation(
    observations.afterPan,
    options.expectedSceneRect,
  );
  expectInfiniteCanvasObservation(
    observations.afterReload,
    options.expectedSceneRect,
  );
  expectFiniteCanvasObservation(
    observations.restored,
    expectedFiniteSize ?? undefined,
  );
  expectInfiniteCanvasObservation(
    observations.undone,
    options.expectedSceneRect,
  );
  expectFiniteCanvasObservation(
    observations.redone,
    expectedFiniteSize ?? undefined,
  );

  for (const observation of observedSequence) {
    expect(observation.productScene.worldRect).toEqual(
      options.expectedSceneRect,
    );
    const output = observation.productScene.output;
    expect(output?.kind).toBe(baselineOutput?.kind);
    if (output?.kind === "canvas") {
      expect(
        Number.isInteger(output.backingWidth) &&
          output.backingWidth > 0 &&
          Number.isInteger(output.backingHeight) &&
          output.backingHeight > 0,
        `Infinity canvas "${options.requirementId}" requires positive integer product canvas backing dimensions.`,
      ).toBe(true);
      expect(output).toEqual(baselineOutput);
    } else if (output?.kind === "svg" && baselineOutput?.kind === "svg") {
      for (const rect of [
        output.localRect,
        output.contentRect,
        output.viewportRect,
      ]) {
        expectMeasurableInfinityCanvasRect(
          rect,
          `Infinity canvas "${options.requirementId}" requires measurable, nonempty SVG product geometry.`,
        );
      }
      expect(output.localRect).toEqual(baselineOutput.localRect);
      expect(output.contentRect).toEqual(baselineOutput.contentRect);
      expect({
        width: output.viewportRect.width,
        height: output.viewportRect.height,
      }).toEqual({
        width: baselineOutput.viewportRect.width,
        height: baselineOutput.viewportRect.height,
      });
    }
  }

  expect(observations.enabled.viewport).toEqual(observations.before.viewport);
  expect(observations.afterPan.viewport.zoom).toBe(
    observations.enabled.viewport.zoom,
  );
  expect({
    offsetX: observations.afterPan.viewport.offsetX,
    offsetY: observations.afterPan.viewport.offsetY,
  }).not.toEqual({
    offsetX: observations.enabled.viewport.offsetX,
    offsetY: observations.enabled.viewport.offsetY,
  });
  expect(observations.afterReload.viewport).toEqual(
    observations.afterPan.viewport,
  );
  expect(observations.restored.viewport).toEqual(
    observations.afterReload.viewport,
  );
  expect(observations.undone.viewport).toEqual(observations.restored.viewport);
  expect(observations.redone.viewport).toEqual(observations.undone.viewport);

  for (const [beforeTransition, afterTransition] of [
    [observations.before, observations.enabled],
    [observations.afterReload, observations.restored],
    [observations.restored, observations.undone],
    [observations.undone, observations.redone],
  ] as const) {
    expect(afterTransition.productScene.viewportRect).toEqual(
      beforeTransition.productScene.viewportRect,
    );
    const beforeOutput = beforeTransition.productScene.output;
    const afterOutput = afterTransition.productScene.output;
    if (beforeOutput?.kind === "svg" && afterOutput?.kind === "svg") {
      expect(afterOutput.viewportRect).toEqual(beforeOutput.viewportRect);
    }
  }

  for (const continuity of Object.values(transitions)) {
    expect(continuity.productHostPreserved).toBe(true);
    expect(continuity.productOutputPreserved).toBe(true);
  }

  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "viewport-side-effect",
    requirementId: options.requirementId,
    target: options.target,
  });
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "infinity-mode-continuity",
    requirementId: options.requirementId,
    target: options.target,
  });
}

export async function expectToolcraftInfinityCanvasBackgroundEvidence(
  observations: Readonly<{
    backgroundExcluded: InfinityCanvasBackgroundObservation;
    backgroundRestored: InfinityCanvasBackgroundObservation;
    infinite: InfinityCanvasBackgroundObservation;
  }>,
  options: Readonly<{
    expectedBackgroundColor: string;
    requirementId: string;
    target: string;
  }>,
): Promise<void> {
  expect(observations.infinite).toMatchObject({
    backgroundEnabled: true,
    canvasMode: "infinite",
    infinityDisabled: false,
    runtimeBackgroundColor: options.expectedBackgroundColor,
    viewportMatchesRuntimeColor: true,
  });
  expect(observations.backgroundExcluded).toMatchObject({
    backgroundEnabled: false,
    canvasMode: "infinite",
    infinityDisabled: false,
    runtimeBackgroundColor: null,
  });
  expect(observations.backgroundRestored).toMatchObject({
    backgroundEnabled: true,
    canvasMode: "infinite",
    infinityDisabled: false,
    runtimeBackgroundColor: options.expectedBackgroundColor,
    viewportMatchesRuntimeColor: true,
  });

  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "background-infinity-viewport",
    requirementId: options.requirementId,
    target: options.target,
  });
}

export async function expectToolcraftInfinityCanvasImageExportEvidence(
  artifacts: Readonly<{
    finite: Readonly<{ byteLength: number; decodedPixelHash: string; height: number; width: number }>;
    infinite: Readonly<{ byteLength: number; decodedPixelHash: string; height: number; width: number }>;
  }>,
  options: ToolcraftInfinityExportEvidenceOptions,
): Promise<void> {
  expectToolcraftInfinityArtifactFrameParity(artifacts, options.expectedSize);
  expect(artifacts.finite.decodedPixelHash).toMatch(/^[a-f0-9]{64}$/u);
  expect(artifacts.infinite.decodedPixelHash).toMatch(/^[a-f0-9]{64}$/u);
  const hasMatchingFrame =
    artifacts.finite.width === artifacts.infinite.width &&
    artifacts.finite.height === artifacts.infinite.height;
  if (hasMatchingFrame) {
    expect(artifacts.infinite.decodedPixelHash).toBe(
      artifacts.finite.decodedPixelHash,
    );
  } else {
    expect(artifacts.infinite.decodedPixelHash).not.toBe(
      artifacts.finite.decodedPixelHash,
    );
  }

  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "exported-artifact",
    requirementId: options.requirementId,
    target: options.target,
  });
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "infinity-scene-bounds-image-export",
    requirementId: options.requirementId,
    target: options.target,
  });
}

export async function expectToolcraftInfinityCanvasVideoExportEvidence(
  artifacts: Readonly<{
    finite: Readonly<{
      byteLength: number;
      durationMs: number;
      frameCount: number;
      samplePixelHashes: readonly string[];
      height: number;
      width: number;
    }>;
    infinite: Readonly<{
      byteLength: number;
      durationMs: number;
      frameCount: number;
      samplePixelHashes: readonly string[];
      height: number;
      width: number;
    }>;
  }>,
  options: ToolcraftInfinityExportEvidenceOptions,
): Promise<void> {
  expectToolcraftInfinityArtifactFrameParity(artifacts, options.expectedSize);
  expect(artifacts.finite.durationMs).toBeGreaterThan(0);
  expect(artifacts.infinite.durationMs).toBe(artifacts.finite.durationMs);
  expect(artifacts.finite.frameCount).toBeGreaterThan(0);
  expect(artifacts.infinite.frameCount).toBe(artifacts.finite.frameCount);
  expect(artifacts.finite.samplePixelHashes.length).toBeGreaterThan(0);
  for (const hash of artifacts.finite.samplePixelHashes) expect(hash).toMatch(/^[a-f0-9]{64}$/u);
  expect(artifacts.infinite.samplePixelHashes).toEqual(artifacts.finite.samplePixelHashes);

  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "exported-artifact",
    requirementId: options.requirementId,
    target: options.target,
  });
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "infinity-scene-bounds-video-export",
    requirementId: options.requirementId,
    target: options.target,
  });
}
