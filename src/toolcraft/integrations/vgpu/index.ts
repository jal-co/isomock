/// <reference types="@vgpu/wgsl/wgsl-types" />

export { createToolcraftVgpuProvider } from "./provider";
export type {
  ToolcraftVgpuProvider,
  ToolcraftVgpuProviderListener,
  ToolcraftVgpuProviderOptions,
  ToolcraftVgpuProviderState,
} from "./provider";
export {
  renderToolcraftVgpuExportFrame,
  ToolcraftVgpuExportError,
} from "./export";
export type {
  ToolcraftVgpuExportFailureCode,
  ToolcraftVgpuExportFrameInput,
} from "./export";
export {
  getToolcraftVgpuExportRuntimeAttributes,
  getToolcraftVgpuRuntimeAttributes,
} from "./runtime-evidence";
export type {
  ToolcraftVgpuExportRuntimeAttributes,
  ToolcraftVgpuRuntimeAttributes,
  ToolcraftVgpuRuntimePresentation,
} from "./runtime-evidence";
export {
  resolveToolcraftVgpuBackingSize,
  synchronizeToolcraftVgpuSurface,
} from "./surface";
export { createToolcraftVgpuTargetPresentation } from "./target-presentation";
export type {
  ToolcraftVgpuTargetPresentation,
  ToolcraftVgpuTargetPresentationCommitInput,
  ToolcraftVgpuTargetPresentationOptions,
  ToolcraftVgpuTargetPresentationSnapshot,
} from "./target-presentation";
export type {
  SynchronizeToolcraftVgpuSurfaceOptions,
  ToolcraftVgpuConfiguredSurface,
  ToolcraftVgpuSceneFrame,
} from "./surface";
export {
  advanceToolcraftVgpuAutonomousClock,
  syncToolcraftVgpuClock,
} from "./time";
export type {
  ToolcraftVgpuClockDiscontinuity,
  ToolcraftVgpuClockState,
  ToolcraftVgpuTimelineClockInput,
} from "./time";
