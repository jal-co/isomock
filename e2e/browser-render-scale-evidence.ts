import { expect, type Page } from "@playwright/test";
import { TOOLCRAFT_CANVAS_RENDER_SCALE } from "@/toolcraft/runtime";

import type { ToolcraftPerformancePipelinePhase } from "../src/app/test-evidence/browser-performance-contract";
import type { ToolcraftRenderScaleState } from "../src/app/app-acceptance";
import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";

export type ToolcraftCanvasBackingMetrics = Readonly<{
  backingHeight: number;
  backingWidth: number;
  cssHeight: number;
  cssWidth: number;
  devicePixelRatio: number;
}>;

export type ToolcraftCanvasVisibleSizePolicy = "fixed" | "viewport-driven";

export type ToolcraftRenderScaleStateTransition = Readonly<{
  run: () => Promise<void>;
  state: ToolcraftRenderScaleState;
}>;

export type ToolcraftRenderScaleBackingOptions = Readonly<{
  baselineCssSize?: Readonly<{ height: number; width: number }>;
  state?:
    | ToolcraftRenderScaleState
    | "performance-baseline"
    | `performance-${ToolcraftPerformancePipelinePhase}`;
}>;

function assertPositiveFiniteScale(selectedScale: number): void {
  if (!Number.isFinite(selectedScale) || selectedScale <= 0) {
    throw new Error(
      `Toolcraft canvas backing-pixel checks require a positive finite selected scale, received ${selectedScale}.`,
    );
  }
}

export function assertToolcraftRenderScaleBackingProofConfig(
  value: unknown,
): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      "Toolcraft render-scale backing-pixel proof must be a non-null object.",
    );
  }
  const proof = value as Record<string, unknown>;
  if (
    typeof proof.canvasSelector !== "string" ||
    !proof.canvasSelector.trim()
  ) {
    throw new Error(
      "Toolcraft render-scale backing-pixel proof requires a non-empty canvasSelector.",
    );
  }
  assertPositiveFiniteScale(proof.selectedScale as number);
}

async function readCanvasMetrics(
  page: Page,
  canvasSelector: string,
): Promise<ToolcraftCanvasBackingMetrics> {
  if (!canvasSelector.trim()) {
    throw new Error(
      "Toolcraft canvas backing-pixel checks require a non-empty canvas selector.",
    );
  }

  const canvas = page.locator(canvasSelector).first();
  await expect(
    canvas,
    `Toolcraft canvas backing-pixel check expected a visible canvas matching "${canvasSelector}".`,
  ).toBeVisible();

  return canvas.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error(
        "Toolcraft canvas backing-pixel checks must target an HTMLCanvasElement.",
      );
    }

    const rect = element.getBoundingClientRect();
    return {
      backingHeight: element.height,
      backingWidth: element.width,
      cssHeight: rect.height,
      cssWidth: rect.width,
      devicePixelRatio: window.devicePixelRatio || 1,
    };
  });
}

export function assertToolcraftCanvasBackingMetricsForRenderScale(
  metrics: ToolcraftCanvasBackingMetrics,
  selectedScale: number,
  options: ToolcraftRenderScaleBackingOptions,
): void {
  const stateLabel = options.state
    ? `Render scale state "${options.state}"`
    : "Render scale";
  const baseline = options.baselineCssSize;
  if (baseline) {
    expect(
      metrics.cssWidth,
      `${stateLabel} must preserve the visible canvas CSS width.`,
    ).toBeCloseTo(baseline.width, 3);
    expect(
      metrics.cssHeight,
      `${stateLabel} must preserve the visible canvas CSS height.`,
    ).toBeCloseTo(baseline.height, 3);
  }

  expect(
    metrics.cssWidth,
    `${stateLabel} requires a positive visible canvas CSS width.`,
  ).toBeGreaterThan(0);
  expect(
    metrics.cssHeight,
    `${stateLabel} requires a positive visible canvas CSS height.`,
  ).toBeGreaterThan(0);

  const expectedWidth =
    metrics.cssWidth * metrics.devicePixelRatio * selectedScale;
  const expectedHeight =
    metrics.cssHeight * metrics.devicePixelRatio * selectedScale;
  const widthError = Math.abs(metrics.backingWidth - expectedWidth);
  const heightError = Math.abs(metrics.backingHeight - expectedHeight);
  expect(
    widthError,
    `${stateLabel} expected exact canvas backing width within one physical pixel for Resolution scale ${selectedScale}.`,
  ).toBeLessThanOrEqual(1);
  expect(
    heightError,
    `${stateLabel} expected exact canvas backing height within one physical pixel for Resolution scale ${selectedScale}.`,
  ).toBeLessThanOrEqual(1);
}

export async function expectToolcraftCanvasBackingPixelsForRenderScale(
  page: Page,
  canvasSelector: string,
  selectedScale: number,
  options: ToolcraftRenderScaleBackingOptions = {},
): Promise<Readonly<{ height: number; width: number }>> {
  assertPositiveFiniteScale(selectedScale);
  const metrics = await readCanvasMetrics(page, canvasSelector);
  assertToolcraftCanvasBackingMetricsForRenderScale(
    metrics,
    selectedScale,
    options,
  );
  return { height: metrics.cssHeight, width: metrics.cssWidth };
}

export async function expectToolcraftCanvasRenderScaleEvidence(
  page: Page,
  {
    canvasSelector,
    requirementId,
    selectedScale,
    stateTransitions,
    target,
  }: Readonly<{
    canvasSelector: string;
    requirementId: string;
    selectedScale: number;
    stateTransitions: readonly ToolcraftRenderScaleStateTransition[];
    target: string;
  }>,
): Promise<void> {
  if (!requirementId.trim()) {
    throw new Error(
      "Toolcraft render-scale evidence requires a non-empty requirementId.",
    );
  }
  if (!target.trim()) {
    throw new Error("Toolcraft render-scale evidence requires a non-empty target.");
  }
  if (stateTransitions.length === 0) {
    throw new Error(
      "Toolcraft render-scale evidence requires at least one renderer state transition.",
    );
  }
  const stateSet = new Set(stateTransitions.map(({ state }) => state));
  if (stateSet.size !== stateTransitions.length) {
    throw new Error(
      "Toolcraft render-scale evidence requires unique renderer state transitions.",
    );
  }

  assertPositiveFiniteScale(selectedScale);
  const baseline = await readCanvasMetrics(page, canvasSelector);
  const baselineCssSize = {
    height: baseline.cssHeight,
    width: baseline.cssWidth,
  };

  for (const transition of stateTransitions) {
    await transition.run();
    await expectToolcraftCanvasBackingPixelsForRenderScale(
      page,
      canvasSelector,
      selectedScale,
      { baselineCssSize, state: transition.state },
    );
  }

  for (const { state } of stateTransitions) {
    await attachToolcraftBrowserRuntimeEvidence({
      evidenceType: "canvas-render-scale-backing",
      requirementId: `${requirementId}#${state}`,
      target,
    });
  }
}

export async function expectToolcraftPerformanceRenderScaleBackingEvidence(
  page: Page,
  {
    canvasSelector,
    baselineCssSize,
    cssSizePolicy,
    pathId,
    phase,
    target,
  }: Readonly<{
    baselineCssSize: Readonly<{ height: number; width: number }>;
    canvasSelector: string;
    cssSizePolicy: ToolcraftCanvasVisibleSizePolicy;
    pathId: string;
    phase: ToolcraftPerformancePipelinePhase;
    target?: string;
  }>,
): Promise<void> {
  if (!pathId.trim()) {
    throw new Error(
      "Toolcraft performance render-scale evidence requires a non-empty pathId.",
    );
  }
  await expectToolcraftCanvasBackingPixelsForRenderScale(
    page,
    canvasSelector,
    TOOLCRAFT_CANVAS_RENDER_SCALE.defaultValue,
    {
      ...(cssSizePolicy === "fixed" ? { baselineCssSize } : {}),
      state: `performance-${phase}`,
    },
  );
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "performance-render-scale",
    requirementId: `${pathId}#${phase}`,
    target,
  });
}
