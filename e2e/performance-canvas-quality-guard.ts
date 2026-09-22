import type { Page } from "@playwright/test";
import { TOOLCRAFT_CANVAS_RENDER_SCALE } from "@/toolcraft/runtime";

import type {
  ToolcraftPerformancePipelinePhase,
} from "../src/app/test-evidence/browser-performance-contract";
import {
  assertToolcraftCanvasBackingMetricsForRenderScale,
  expectToolcraftCanvasBackingPixelsForRenderScale,
  type ToolcraftCanvasVisibleSizePolicy,
} from "./browser-render-scale-evidence";
import {
  installToolcraftPerformanceCanvasQualityObserver,
  isToolcraftPerformanceCanvasQualityHandshake,
  isToolcraftPerformanceCanvasQualityObservation,
  type ToolcraftPerformanceCanvasQualityObservation,
} from "./performance-canvas-quality-observer";

export type ToolcraftPerformanceCanvasQualityGuard = Readonly<{
  dispose: () => Promise<void>;
  runPhase: <T>(
    phase: ToolcraftPerformancePipelinePhase,
    run: () => Promise<T>,
  ) => Promise<T>;
}>;

let sessionSequence = 0;

async function flushCanvasQualityObserver(
  page: Page,
  stateKey: string,
): Promise<void> {
  await page.evaluate(async (key) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const state = Reflect.get(globalThis, key) as
      | { flush: () => Promise<void> }
      | undefined;
    if (!state) {
      throw new Error("Toolcraft canvas quality guard observer is unavailable.");
    }
    await state.flush();
  }, stateKey);
}

async function beginCanvasQualityObservation(
  page: Page,
  stateKey: string,
): Promise<void> {
  await page.evaluate((key) => {
    const state = Reflect.get(globalThis, key) as
      | { begin: () => void }
      | undefined;
    if (!state) {
      throw new Error("Toolcraft canvas quality guard observer is unavailable.");
    }
    state.begin();
  }, stateKey);
}

function matchesCanvasBackingScale(
  observation: ToolcraftPerformanceCanvasQualityObservation,
  scale: number,
): boolean {
  return (
    Math.abs(
      observation.metrics.backingWidth -
        observation.metrics.cssWidth *
          observation.metrics.devicePixelRatio *
          scale,
    ) <= 1 &&
    Math.abs(
      observation.metrics.backingHeight -
        observation.metrics.cssHeight *
          observation.metrics.devicePixelRatio *
          scale,
    ) <= 1
  );
}

export async function createToolcraftPerformanceCanvasQualityGuard(
  page: Page,
  options: Readonly<{
    baselineCssSize: Readonly<{ height: number; width: number }>;
    canvasSelector: string;
    cssSizePolicy: ToolcraftCanvasVisibleSizePolicy;
    pathId: string;
    preparationScale?: number;
  }>,
): Promise<ToolcraftPerformanceCanvasQualityGuard> {
  if (!options.pathId.trim()) {
    throw new Error(
      "Toolcraft canvas quality guard requires a non-empty performance pathId.",
    );
  }
  if (!options.canvasSelector.trim()) {
    throw new Error(
      "Toolcraft canvas quality guard requires a non-empty canvasSelector.",
    );
  }
  if (
    !Number.isFinite(options.baselineCssSize.width) ||
    !Number.isFinite(options.baselineCssSize.height) ||
    options.baselineCssSize.width <= 0 ||
    options.baselineCssSize.height <= 0
  ) {
    throw new Error(
      `Toolcraft canvas quality guard for "${options.pathId}" requires positive finite baseline CSS dimensions.`,
    );
  }
  const sessionId = ++sessionSequence;
  const bindingName = `__toolcraftCanvasQualityObservation${sessionId}`;
  const stateKey = `__toolcraftCanvasQualityObserver${sessionId}`;
  let activePhase: ToolcraftPerformancePipelinePhase | undefined;
  let disposed = false;
  let observations: ToolcraftPerformanceCanvasQualityObservation[] = [];

  await page.exposeBinding(bindingName, (source, observation: unknown) => {
    if (source.frame !== page.mainFrame()) return false;
    if (isToolcraftPerformanceCanvasQualityHandshake(observation)) {
      return !disposed;
    }
    if (disposed || activePhase === undefined) return false;
    if (!isToolcraftPerformanceCanvasQualityObservation(observation)) {
      throw new Error(
        "Toolcraft canvas quality guard received an invalid observation.",
      );
    }
    observations.push(observation);
    return true;
  });
  const installerOptions = {
    baselineCssSize: options.baselineCssSize,
    bindingName,
    canvasSelector: options.canvasSelector,
    stateKey,
  } as const;
  await page.addInitScript(
    installToolcraftPerformanceCanvasQualityObserver,
    installerOptions,
  );
  await page.evaluate(
    installToolcraftPerformanceCanvasQualityObserver,
    installerOptions,
  );

  return Object.freeze({
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      activePhase = undefined;
      observations = [];
      if (page.isClosed()) return;
      await page.evaluate((key) => {
        const state = Reflect.get(globalThis, key) as
          | { dispose: () => void }
          | undefined;
        state?.dispose();
        Reflect.deleteProperty(globalThis, key);
      }, stateKey);
    },
    runPhase: async <T>(
      phase: ToolcraftPerformancePipelinePhase,
      run: () => Promise<T>,
    ): Promise<T> => {
      if (disposed) {
        throw new Error("Toolcraft canvas quality guard has been disposed.");
      }
      if (activePhase !== undefined) {
        throw new Error(
          `Toolcraft canvas quality guard cannot start "${phase}" while "${activePhase}" is active.`,
        );
      }
      observations = [];
      await beginCanvasQualityObservation(page, stateKey);
      activePhase = phase;
      let result: T;
      try {
        result = await run();
      } catch (error) {
        activePhase = undefined;
        observations = [];
        throw error;
      }

      try {
        await flushCanvasQualityObserver(page, stateKey);
        let requiredScaleCommitted = false;
        for (const observation of observations) {
          if (
            options.preparationScale !== undefined &&
            !requiredScaleCommitted &&
            matchesCanvasBackingScale(observation, options.preparationScale)
          ) {
            continue;
          }
          assertToolcraftCanvasBackingMetricsForRenderScale(
            observation.metrics,
            TOOLCRAFT_CANVAS_RENDER_SCALE.defaultValue,
            {
              ...(options.cssSizePolicy === "fixed"
                ? { baselineCssSize: options.baselineCssSize }
                : {}),
              state: `performance-${phase}`,
            },
          );
          requiredScaleCommitted = true;
        }
        await expectToolcraftCanvasBackingPixelsForRenderScale(
          page,
          options.canvasSelector,
          TOOLCRAFT_CANVAS_RENDER_SCALE.defaultValue,
          {
            ...(options.cssSizePolicy === "fixed"
              ? { baselineCssSize: options.baselineCssSize }
              : {}),
            state: `performance-${phase}`,
          },
        );
        return result;
      } finally {
        activePhase = undefined;
        observations = [];
      }
    },
  });
}
