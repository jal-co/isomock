import type { Target } from "vgpu";

import type { ToolcraftVgpuSceneFrame } from "./surface";

export type ToolcraftVgpuTargetPresentationLifecycleSnapshot = Readonly<{
  actualBackingSize: null;
  backingSize: null;
  canvas: null;
  committedFrames: number;
  disposed: boolean;
  mode: "target-readback";
  status: "disposed" | "disposing" | "idle";
  target: null;
}>;

export type ToolcraftVgpuTargetPresentationCommittedSnapshot = Readonly<{
  actualBackingSize: readonly [number, number];
  backingSize: readonly [number, number];
  canvas: HTMLCanvasElement;
  committedFrames: number;
  disposed: false;
  mode: "target-readback";
  status: "committed";
  target: Target;
}>;

export type ToolcraftVgpuTargetPresentationSnapshot =
  | ToolcraftVgpuTargetPresentationCommittedSnapshot
  | ToolcraftVgpuTargetPresentationLifecycleSnapshot;

type MaterializeTargetReadbackInput = Readonly<{
  backingSize: readonly [number, number];
  canvas: HTMLCanvasElement;
  committedFrames: number;
  frame: ToolcraftVgpuSceneFrame;
  imageDataConstructor?: typeof ImageData;
  pixels: Uint8Array;
  target: Target;
}>;

export function createTargetPresentationLifecycleSnapshot(
  status: ToolcraftVgpuTargetPresentationLifecycleSnapshot["status"],
  committedFrames: number,
  disposed: boolean,
): ToolcraftVgpuTargetPresentationLifecycleSnapshot {
  return Object.freeze({
    actualBackingSize: null,
    backingSize: null,
    canvas: null,
    committedFrames,
    disposed,
    mode: "target-readback",
    status,
    target: null,
  });
}

export function toolcraftVgpuSizesMatch(
  left: readonly [number, number],
  right: readonly [number, number],
): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function resolveImageDataConstructor(
  override: typeof ImageData | undefined,
): typeof ImageData {
  if (override) return override;
  if (typeof ImageData === "undefined") {
    throw new Error("ImageData is unavailable for VGPU target presentation.");
  }
  return ImageData;
}

export function materializeToolcraftVgpuTargetReadback({
  backingSize,
  canvas,
  committedFrames,
  frame,
  imageDataConstructor,
  pixels,
  target,
}: MaterializeTargetReadbackInput): ToolcraftVgpuTargetPresentationCommittedSnapshot {
  const expectedByteLength = backingSize[0] * backingSize[1] * 4;
  if (
    !Number.isSafeInteger(expectedByteLength) ||
    pixels.byteLength !== expectedByteLength
  ) {
    throw new RangeError(
      `VGPU target presentation returned ${pixels.byteLength} bytes; expected ${expectedByteLength}.`,
    );
  }
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error(
      "The VGPU target-readback canvas has no Canvas2D presentation context.",
    );
  }
  const ImageDataConstructor = resolveImageDataConstructor(imageDataConstructor);
  const imageData = new ImageDataConstructor(
    new Uint8ClampedArray(pixels),
    backingSize[0],
    backingSize[1],
  );

  canvas.width = backingSize[0];
  canvas.height = backingSize[1];
  canvas.style.width = `${frame.cssWidth}px`;
  canvas.style.height = `${frame.cssHeight}px`;
  context.putImageData(imageData, 0, 0);
  const actualBackingSize = Object.freeze([
    canvas.width,
    canvas.height,
  ]) as readonly [number, number];
  if (
    !toolcraftVgpuSizesMatch(actualBackingSize, backingSize) ||
    !toolcraftVgpuSizesMatch(target.size, backingSize)
  ) {
    throw new Error(
      "VGPU target-readback backing changed before presentation committed.",
    );
  }

  return Object.freeze({
    actualBackingSize,
    backingSize,
    canvas,
    committedFrames: committedFrames + 1,
    disposed: false,
    mode: "target-readback",
    status: "committed",
    target,
  });
}
