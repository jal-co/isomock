import type { ToolcraftVgpuProviderState } from "./provider";
import type { ToolcraftVgpuExportFailureCode } from "./export";
import type { ToolcraftVgpuConfiguredSurface } from "./surface";
import type { ToolcraftVgpuTargetPresentationSnapshot } from "./target-presentation";

export type ToolcraftVgpuRuntimePresentation =
  | Readonly<{
      mode: "canvas-surface";
      surface: ToolcraftVgpuConfiguredSurface;
    }>
  | Readonly<{
      mode: "target-readback";
      snapshot: ToolcraftVgpuTargetPresentationSnapshot;
    }>;

export type ToolcraftVgpuRuntimeAttributes =
  | Readonly<{
      "aria-label": string;
      "data-toolcraft-gpu-backend"?: never;
      "data-toolcraft-gpu-backing"?: never;
      "data-toolcraft-gpu-presentation"?: never;
      "data-toolcraft-gpu-provider"?: never;
      "data-toolcraft-gpu-status": string;
    }>
  | Readonly<{
      "aria-label"?: never;
      "data-toolcraft-gpu-backend": "webgpu";
      "data-toolcraft-gpu-backing": `${number}x${number}`;
      "data-toolcraft-gpu-presentation": ToolcraftVgpuRuntimePresentation["mode"];
      "data-toolcraft-gpu-provider": "vgpu";
      "data-toolcraft-gpu-status": "ready";
    }>;

export type ToolcraftVgpuExportRuntimeAttributes = Readonly<{
  "aria-live": "polite";
  "data-toolcraft-gpu-export-status"?: ToolcraftVgpuExportFailureCode;
}>;

export function getToolcraftVgpuExportRuntimeAttributes(
  failureCode: ToolcraftVgpuExportFailureCode | null,
): ToolcraftVgpuExportRuntimeAttributes {
  return Object.freeze({
    "aria-live": "polite",
    ...(failureCode
      ? { "data-toolcraft-gpu-export-status": failureCode }
      : {}),
  });
}

function unavailableAttributes(
  status: string,
  message: string,
): ToolcraftVgpuRuntimeAttributes {
  return Object.freeze({
    "aria-label": message,
    "data-toolcraft-gpu-status": status,
  });
}

export function getToolcraftVgpuRuntimeAttributes(
  state: ToolcraftVgpuProviderState,
  presentation?: ToolcraftVgpuRuntimePresentation | null,
): ToolcraftVgpuRuntimeAttributes {
  if (state.status === "initializing") {
    return unavailableAttributes(
      "initializing",
      "The VGPU renderer is initializing.",
    );
  }
  if (state.status !== "ready") {
    return unavailableAttributes(state.status, state.message);
  }
  if (!presentation) {
    return unavailableAttributes(
      "presentation-unavailable",
      "The VGPU presentation is not configured.",
    );
  }
  if (presentation.mode === "target-readback") {
    const { snapshot } = presentation;
    if (
      snapshot.status !== "committed" ||
      snapshot.disposed ||
      !snapshot.canvas ||
      !snapshot.target
    ) {
      return unavailableAttributes(
        "presentation-unavailable",
        "The VGPU target-readback presentation is not committed.",
      );
    }
    let targetWidth: number;
    let targetHeight: number;
    try {
      [targetWidth, targetHeight] = snapshot.target.size;
    } catch {
      return unavailableAttributes(
        "presentation-mismatch",
        "The VGPU target-readback backing does not match the live presentation.",
      );
    }
    const [width, height] = snapshot.backingSize;
    if (
      snapshot.actualBackingSize[0] !== width ||
      snapshot.actualBackingSize[1] !== height ||
      snapshot.canvas.width !== width ||
      snapshot.canvas.height !== height ||
      targetWidth !== width ||
      targetHeight !== height
    ) {
      return unavailableAttributes(
        "presentation-mismatch",
        "The VGPU target-readback backing does not match the live presentation.",
      );
    }
    return Object.freeze({
      "data-toolcraft-gpu-backend": "webgpu",
      "data-toolcraft-gpu-backing": `${width}x${height}`,
      "data-toolcraft-gpu-presentation": "target-readback",
      "data-toolcraft-gpu-provider": "vgpu",
      "data-toolcraft-gpu-status": "ready",
    });
  }

  const configuredSurface = presentation.surface;
  if (configuredSurface.surface.disposed) {
    return unavailableAttributes(
      "surface-unavailable",
      "The VGPU canvas surface is not configured.",
    );
  }

  let width: number;
  let height: number;
  try {
    [width, height] = configuredSurface.surface.size;
  } catch {
    return unavailableAttributes(
      "surface-mismatch",
      "The VGPU canvas surface backing does not match the Toolcraft scene.",
    );
  }
  if (
    width !== configuredSurface.backingSize[0] ||
    height !== configuredSurface.backingSize[1]
  ) {
    return unavailableAttributes(
      "surface-mismatch",
      "The VGPU canvas surface backing does not match the Toolcraft scene.",
    );
  }
  return Object.freeze({
    "data-toolcraft-gpu-backend": "webgpu",
    "data-toolcraft-gpu-backing": `${width}x${height}`,
    "data-toolcraft-gpu-presentation": "canvas-surface",
    "data-toolcraft-gpu-provider": "vgpu",
    "data-toolcraft-gpu-status": "ready",
  });
}
