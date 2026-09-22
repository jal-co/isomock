import type { Surface, SurfaceCanvas } from "vgpu";

import type { ToolcraftVgpuProvider } from "./provider";

export type ToolcraftVgpuSceneFrame = {
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly devicePixelRatio: number;
  readonly renderScale: number;
};

export type ToolcraftVgpuConfiguredSurface = {
  readonly backingSize: readonly [number, number];
  readonly canvas: SurfaceCanvas;
  readonly cssSize: readonly [number, number];
  readonly surface: Surface;
};

export type SynchronizeToolcraftVgpuSurfaceOptions = {
  readonly canvas: SurfaceCanvas;
  readonly current: ToolcraftVgpuConfiguredSurface | null;
  readonly frame: ToolcraftVgpuSceneFrame | null | undefined;
  readonly provider: Pick<ToolcraftVgpuProvider, "createSurface">;
};

function isFinitePositive(value: number) {
  return Number.isFinite(value) && value > 0;
}

function immutableSize(
  width: number,
  height: number,
): readonly [number, number] {
  return Object.freeze([width, height]) as readonly [number, number];
}

function disposeSurface(resource: ToolcraftVgpuConfiguredSurface) {
  if (!resource.surface.disposed) {
    resource.surface.dispose();
  }
}

function sizesMatch(
  left: readonly [number, number],
  right: readonly [number, number],
) {
  return left[0] === right[0] && left[1] === right[1];
}

function setCanvasCssSizeAtomically(
  canvas: SurfaceCanvas,
  cssSize: readonly [number, number],
) {
  if (!("style" in canvas)) {
    return;
  }

  const previousWidth = canvas.style.width;
  const previousHeight = canvas.style.height;
  try {
    canvas.style.width = `${cssSize[0]}px`;
    canvas.style.height = `${cssSize[1]}px`;
  } catch (error) {
    try {
      canvas.style.width = previousWidth;
      canvas.style.height = previousHeight;
    } catch {
      // The original style mutation error remains the actionable failure.
    }
    throw error;
  }
}

function restoreBackingSize(
  surface: Surface,
  backingSize: readonly [number, number],
) {
  try {
    if (!sizesMatch(surface.size, backingSize)) {
      surface.resize(backingSize);
    }
  } catch {
    // Evidence rejects a surface whose live backing could not be restored.
  }
}

function createConfiguredSurface(
  provider: Pick<ToolcraftVgpuProvider, "createSurface">,
  canvas: SurfaceCanvas,
  cssSize: readonly [number, number],
  backingSize: readonly [number, number],
): ToolcraftVgpuConfiguredSurface {
  const created = provider.createSurface(canvas, backingSize);
  try {
    if (!sizesMatch(created.size, backingSize)) {
      throw new Error(
        "VGPU created a surface whose backing does not match the Toolcraft scene.",
      );
    }
    setCanvasCssSizeAtomically(canvas, cssSize);
  } catch (error) {
    if (!created.disposed) {
      created.dispose();
    }
    throw error;
  }

  return Object.freeze({ backingSize, canvas, cssSize, surface: created });
}

export function resolveToolcraftVgpuBackingSize(
  frame: ToolcraftVgpuSceneFrame | null | undefined,
): readonly [number, number] | null {
  if (
    !frame ||
    !isFinitePositive(frame.cssWidth) ||
    !isFinitePositive(frame.cssHeight) ||
    !isFinitePositive(frame.devicePixelRatio) ||
    !isFinitePositive(frame.renderScale)
  ) {
    return null;
  }

  const multiplier = frame.devicePixelRatio * frame.renderScale;
  const width = Math.ceil(frame.cssWidth * multiplier);
  const height = Math.ceil(frame.cssHeight * multiplier);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    return null;
  }
  return immutableSize(width, height);
}

export function synchronizeToolcraftVgpuSurface({
  canvas,
  current,
  frame,
  provider,
}: SynchronizeToolcraftVgpuSurfaceOptions): ToolcraftVgpuConfiguredSurface | null {
  const backingSize = resolveToolcraftVgpuBackingSize(frame);
  if (!frame || !backingSize) {
    if (current) {
      disposeSurface(current);
    }
    return null;
  }

  const cssSize = immutableSize(frame.cssWidth, frame.cssHeight);
  if (!current || current.surface.disposed) {
    return createConfiguredSurface(provider, canvas, cssSize, backingSize);
  }
  if (current.canvas !== canvas) {
    const replacement = createConfiguredSurface(
      provider,
      canvas,
      cssSize,
      backingSize,
    );
    disposeSurface(current);
    return replacement;
  }

  const backingChanged = !sizesMatch(current.backingSize, backingSize);
  if (backingChanged) {
    try {
      current.surface.resize(backingSize);
      if (!sizesMatch(current.surface.size, backingSize)) {
        throw new Error(
          "VGPU resized a surface to a backing that does not match the Toolcraft scene.",
        );
      }
    } catch (error) {
      restoreBackingSize(current.surface, current.backingSize);
      throw error;
    }
  }
  const cssChanged = !sizesMatch(current.cssSize, cssSize);
  if (!backingChanged && !cssChanged) {
    return current;
  }

  try {
    setCanvasCssSizeAtomically(canvas, cssSize);
  } catch (error) {
    if (backingChanged) {
      restoreBackingSize(current.surface, current.backingSize);
    }
    throw error;
  }

  return Object.freeze({
    backingSize,
    canvas,
    cssSize,
    surface: current.surface,
  });
}
