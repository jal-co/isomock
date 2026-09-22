import { frame, type Frame, type Target } from "vgpu";

import type {
  ToolcraftVgpuProvider,
  ToolcraftVgpuProviderState,
} from "./provider";
import { compositeStraightAlphaSourceOver } from "./rgba-composite";

export type ToolcraftVgpuExportFailureCode =
  | "vgpu-export-disposed"
  | "vgpu-export-device-lost"
  | "vgpu-export-failed"
  | "vgpu-export-not-ready"
  | "vgpu-export-unsupported";

export class ToolcraftVgpuExportError extends Error {
  readonly code: ToolcraftVgpuExportFailureCode;

  constructor(
    code: ToolcraftVgpuExportFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ToolcraftVgpuExportError";
    this.code = code;
  }
}

export type ToolcraftVgpuExportFrameInput = Readonly<{
  context: Pick<CanvasRenderingContext2D, "getImageData" | "putImageData">;
  height: number;
  imageDataConstructor?: typeof ImageData;
  provider: Pick<
    ToolcraftVgpuProvider,
    "getState" | "withExportTarget"
  >;
  render: (currentFrame: Frame, output: Target) => void;
  width: number;
}>;

function providerStateError(
  state: Exclude<ToolcraftVgpuProviderState, { status: "ready" }>,
): ToolcraftVgpuExportError {
  switch (state.status) {
    case "disposed":
      return new ToolcraftVgpuExportError("vgpu-export-disposed", state.message);
    case "unsupported":
      return new ToolcraftVgpuExportError(
        "vgpu-export-unsupported",
        state.message,
      );
    case "device-lost":
      return new ToolcraftVgpuExportError(
        "vgpu-export-device-lost",
        state.message,
        { cause: state.reason },
      );
    case "failed":
      return new ToolcraftVgpuExportError("vgpu-export-failed", state.message, {
        cause: state.error,
      });
    case "initializing":
      return new ToolcraftVgpuExportError(
        "vgpu-export-not-ready",
        "The VGPU renderer is still initializing.",
      );
  }
}

function assertExportSize(width: number, height: number): number {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RangeError(
      "VGPU export dimensions must be positive safe integers.",
    );
  }
  const expectedByteLength = width * height * 4;
  if (!Number.isSafeInteger(expectedByteLength)) {
    throw new RangeError("VGPU export byte length exceeds the safe integer range.");
  }
  return expectedByteLength;
}

function resolveImageDataConstructor(
  override: typeof ImageData | undefined,
): typeof ImageData {
  if (override) {
    return override;
  }
  if (typeof ImageData === "undefined") {
    throw new Error("ImageData is unavailable in this export environment.");
  }
  return ImageData;
}

export async function renderToolcraftVgpuExportFrame({
  context,
  height,
  imageDataConstructor,
  provider,
  render,
  width,
}: ToolcraftVgpuExportFrameInput): Promise<void> {
  const expectedByteLength = assertExportSize(width, height);
  const initialState = provider.getState();
  if (initialState.status !== "ready") {
    throw providerStateError(initialState);
  }

  try {
    const rgba = await provider.withExportTarget(
      [width, height],
      async (gpu, output) => {
        const renderAttempt: { error: unknown; failed: boolean } = {
          error: undefined,
          failed: false,
        };
        const submitted = frame(gpu, (currentFrame) => {
          try {
            render(currentFrame, output);
          } catch (error) {
            renderAttempt.error = error;
            renderAttempt.failed = true;
          }
        });
        await submitted.done;
        await gpu.settled();
        if (renderAttempt.failed) {
          throw renderAttempt.error;
        }
        const readback = await output.color.read({ mipLevel: 0, region: "all" });
        if (readback.byteLength !== expectedByteLength) {
          throw new RangeError(
            `VGPU export readback returned ${readback.byteLength} bytes; expected ${expectedByteLength}.`,
          );
        }
        const settledState = provider.getState();
        if (settledState.status !== "ready") {
          throw providerStateError(settledState);
        }
        return readback;
      },
    );
    const postLeaseState = provider.getState();
    if (postLeaseState.status !== "ready") {
      throw providerStateError(postLeaseState);
    }
    const destination = context.getImageData(0, 0, width, height);
    if (destination.data.byteLength !== expectedByteLength) {
      throw new RangeError(
        `VGPU export destination returned ${destination.data.byteLength} bytes; expected ${expectedByteLength}.`,
      );
    }
    const composited = compositeStraightAlphaSourceOver(
      destination.data,
      rgba,
    );

    const ImageDataConstructor = resolveImageDataConstructor(
      imageDataConstructor,
    );
    context.putImageData(
      new ImageDataConstructor(composited, width, height),
      0,
      0,
    );
  } catch (error) {
    if (error instanceof ToolcraftVgpuExportError) {
      throw error;
    }
    const currentState = provider.getState();
    if (currentState.status !== "ready") {
      throw providerStateError(currentState);
    }
    throw new ToolcraftVgpuExportError(
      "vgpu-export-failed",
      "The VGPU export frame failed.",
      { cause: error },
    );
  }
}
