import type { Clock, Frame, Gpu, Surface, Target } from "vgpu";

import {
  advanceToolcraftVgpuAutonomousClock,
  createToolcraftVgpuTargetPresentation,
  createToolcraftVgpuProvider,
  getToolcraftVgpuRuntimeAttributes,
  renderToolcraftVgpuExportFrame,
  resolveToolcraftVgpuBackingSize,
  syncToolcraftVgpuClock,
  synchronizeToolcraftVgpuSurface,
  ToolcraftVgpuExportError,
  type ToolcraftVgpuClockState,
  type ToolcraftVgpuConfiguredSurface,
  type ToolcraftVgpuExportFailureCode,
  type ToolcraftVgpuExportFrameInput,
  type ToolcraftVgpuProvider,
  type ToolcraftVgpuProviderState,
  type ToolcraftVgpuTimelineClockInput,
  type ToolcraftVgpuTargetPresentation,
  type ToolcraftVgpuTargetPresentationSnapshot,
} from "../../../../src/toolcraft/integrations/vgpu/index";

declare const canvas: HTMLCanvasElement;
declare const configuredSurface: ToolcraftVgpuConfiguredSurface;
declare const context: CanvasRenderingContext2D;
declare const clock: Clock;
declare const currentFrame: Frame;
declare const gpu: Gpu;

const provider: ToolcraftVgpuProvider = createToolcraftVgpuProvider({
  init: async () => gpu,
  navigator: { gpu: {} },
});
const targetPresentation: ToolcraftVgpuTargetPresentation =
  createToolcraftVgpuTargetPresentation({ provider });
const targetPresentationSnapshot: ToolcraftVgpuTargetPresentationSnapshot =
  targetPresentation.getSnapshot();
const state: ToolcraftVgpuProviderState = provider.getState();
const surface: Surface = provider.createSurface(canvas, [1600, 900]);
const targetResult: Promise<Target> = provider.withExportTarget(
  [1600, 900],
  async (_gpu, output) => output,
);
const backing: readonly [number, number] | null =
  resolveToolcraftVgpuBackingSize({
    cssHeight: 450,
    cssWidth: 800,
    devicePixelRatio: 1,
    renderScale: 2,
  });
const next: ToolcraftVgpuConfiguredSurface | null =
  synchronizeToolcraftVgpuSurface({
    canvas,
    current: configuredSurface,
    frame: {
      cssHeight: 450,
      cssWidth: 800,
      devicePixelRatio: 1,
      renderScale: 2,
    },
    provider,
  });
const attributes: Readonly<Record<string, string | undefined>> =
  getToolcraftVgpuRuntimeAttributes(
    state,
    next ? { mode: "canvas-surface", surface: next } : null,
  );
const clockInput: ToolcraftVgpuTimelineClockInput = {
  previousSeconds: 0.5,
  seconds: 1,
};
const clockState: ToolcraftVgpuClockState = syncToolcraftVgpuClock(
  clock,
  clockInput,
);
advanceToolcraftVgpuAutonomousClock(clock, 1 / 60);
const exportInput: ToolcraftVgpuExportFrameInput = {
  context,
  height: 900,
  provider,
  render: (submittedFrame, output) => {
    const typedFrame: Frame = submittedFrame;
    const typedOutput: Target = output;
    void [typedFrame, typedOutput];
  },
  width: 1600,
};
const exported: Promise<void> = renderToolcraftVgpuExportFrame(exportInput);
const errorCode: ToolcraftVgpuExportFailureCode = new ToolcraftVgpuExportError(
  "vgpu-export-failed",
  "failed",
).code;

function assertReadonlyState(snapshot: ToolcraftVgpuProviderState) {
  // @ts-expect-error Provider states are immutable snapshots.
  snapshot.status = "failed";
}

function assertReadonlyReadyState(
  readyState: Extract<ToolcraftVgpuProviderState, { status: "ready" }>,
) {
  // @ts-expect-error Ready-state resources are readonly.
  readyState.gpu = gpu;
}

void [
  assertReadonlyReadyState,
  assertReadonlyState,
  attributes,
  backing,
  clockState,
  currentFrame,
  errorCode,
  exported,
  surface,
  targetPresentation,
  targetPresentationSnapshot,
  targetResult,
];
