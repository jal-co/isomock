import type { ToolcraftVgpuRuntimeAttributes } from "@/toolcraft/integrations/vgpu";

import { assertPhysicalFeedbackInteractiveBackingSize } from "./feedback-limits";

export type PhysicalFeedbackCanvasRuntime = Readonly<{
  attributes: ToolcraftVgpuRuntimeAttributes;
  coalescedFrames: number;
  coalescedReleases: number;
  frameCount: number;
  presentationAllocationId: number;
  presentationFrameCount: number;
  renderedTime: number;
  resourceAllocationId: number;
}>;

export type PhysicalFeedbackPresentationRuntimeSnapshot = Readonly<
  Pick<
    PhysicalFeedbackCanvasRuntime,
    | "frameCount"
    | "presentationAllocationId"
    | "renderedTime"
    | "resourceAllocationId"
  >
>;

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
}

/**
 * Keeps canvas frame evidence monotonic across one live allocation or a newer
 * resource/presentation pair. Fully older pairs and regressed local counts are
 * ignored because async lifecycle retirement treats stale submissions as no-ops.
 * A partially advanced pair cannot be produced by the owned resource lifecycle,
 * so it is rejected instead of being mistaken for either continuity or renewal.
 */
export function mergePhysicalFeedbackPresentationRuntimeSnapshot(
  current: PhysicalFeedbackCanvasRuntime,
  snapshot: PhysicalFeedbackPresentationRuntimeSnapshot,
): PhysicalFeedbackCanvasRuntime {
  assertNonNegativeSafeInteger(
    snapshot.frameCount,
    "Physical feedback presentation frame count",
  );
  assertPositiveSafeInteger(
    snapshot.presentationAllocationId,
    "Physical feedback presentation allocation ID",
  );
  assertPositiveSafeInteger(
    snapshot.resourceAllocationId,
    "Physical feedback resource allocation ID",
  );

  const continuingPresentation =
    snapshot.presentationAllocationId === current.presentationAllocationId &&
    snapshot.resourceAllocationId === current.resourceAllocationId;
  const replacementPresentation =
    snapshot.presentationAllocationId > current.presentationAllocationId &&
    snapshot.resourceAllocationId > current.resourceAllocationId;
  const stalePresentation =
    snapshot.presentationAllocationId < current.presentationAllocationId &&
    snapshot.resourceAllocationId < current.resourceAllocationId;
  if (stalePresentation) return current;
  if (!continuingPresentation && !replacementPresentation) {
    throw new RangeError(
      "Physical feedback presentation and resource allocation identities conflict.",
    );
  }
  if (
    continuingPresentation &&
    snapshot.frameCount <= current.presentationFrameCount
  ) {
    return current;
  }

  const previousPresentationFrameCount = continuingPresentation
    ? current.presentationFrameCount
    : 0;
  const frameCount =
    current.frameCount + snapshot.frameCount - previousPresentationFrameCount;
  if (!Number.isSafeInteger(frameCount)) {
    throw new RangeError("Physical feedback canvas frame count is exhausted.");
  }
  return Object.freeze({
    ...current,
    ...snapshot,
    frameCount,
    presentationFrameCount: snapshot.frameCount,
  });
}

export type PhysicalFeedbackLifecycleEpoch = Readonly<{
  captureDisabled(): number | null;
  captureSubmission(): number | null;
  commitDisabled<T>(epoch: number, commit: () => T): T | undefined;
  commitSubmission<T>(epoch: number, commit: () => T): T | undefined;
  currentEpoch(): number;
  isSubmissionCurrent(epoch: number): boolean;
  retire(): number;
  transition(enabled: boolean): number;
}>;

function nextLifecycleEpoch(epoch: number): number {
  if (epoch >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Physical feedback renderer epoch is exhausted.");
  }
  return epoch + 1;
}

export function createPhysicalFeedbackLifecycleEpoch(
  initiallyEnabled: boolean,
): PhysicalFeedbackLifecycleEpoch {
  let enabled = initiallyEnabled;
  let epoch = 1;
  const matches = (candidate: number, expectedEnabled: boolean) =>
    candidate === epoch && enabled === expectedEnabled;
  return Object.freeze({
    captureDisabled: () => (enabled ? null : epoch),
    captureSubmission: () => (enabled ? epoch : null),
    commitDisabled: <T>(candidate: number, commit: () => T) =>
      matches(candidate, false) ? commit() : undefined,
    commitSubmission: <T>(candidate: number, commit: () => T) =>
      matches(candidate, true) ? commit() : undefined,
    currentEpoch: () => epoch,
    isSubmissionCurrent: (candidate: number) => matches(candidate, true),
    retire() {
      enabled = false;
      epoch = nextLifecycleEpoch(epoch);
      return epoch;
    },
    transition(nextEnabled: boolean) {
      if (enabled !== nextEnabled) {
        enabled = nextEnabled;
        epoch = nextLifecycleEpoch(epoch);
      }
      return epoch;
    },
  });
}

export const physicalFeedbackInitialCanvasRuntime: PhysicalFeedbackCanvasRuntime =
  Object.freeze({
    attributes: {
      "aria-label": "The VGPU renderer is initializing.",
      "data-toolcraft-gpu-status": "initializing",
    },
    coalescedFrames: 0,
    coalescedReleases: 0,
    frameCount: 0,
    presentationAllocationId: 0,
    presentationFrameCount: 0,
    renderedTime: 0,
    resourceAllocationId: 0,
  });

export const physicalFeedbackDisabledRuntimeAttributes: ToolcraftVgpuRuntimeAttributes =
  Object.freeze({
    "aria-label": "The VGPU physical field is disabled.",
    "data-toolcraft-gpu-status": "disabled",
  });

export type PhysicalFeedbackDisabledSurface = Readonly<{
  backingHeight: number;
  backingWidth: number;
  cssHeight: number;
  cssWidth: number;
  renderedTime: number;
}>;

export function physicalFeedbackDisabledBackingMatches(
  left: PhysicalFeedbackDisabledSurface,
  right: PhysicalFeedbackDisabledSurface,
): boolean {
  return (
    left.backingHeight === right.backingHeight &&
    left.backingWidth === right.backingWidth &&
    left.cssHeight === right.cssHeight &&
    left.cssWidth === right.cssWidth
  );
}

export function clearPhysicalFeedbackCanvas(
  canvas: HTMLCanvasElement | null,
  {
    backingHeight,
    backingWidth,
    cssHeight,
    cssWidth,
  }: PhysicalFeedbackDisabledSurface,
): boolean {
  if (!canvas || backingWidth <= 0 || backingHeight <= 0) return false;
  assertPhysicalFeedbackInteractiveBackingSize(backingWidth, backingHeight);
  const resized = canvas.width !== backingWidth || canvas.height !== backingHeight;
  if (resized) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("The disabled physical feedback canvas requires Canvas2D.");
  }
  if (!resized) {
    context.clearRect(0, 0, backingWidth, backingHeight);
  }
  return true;
}
