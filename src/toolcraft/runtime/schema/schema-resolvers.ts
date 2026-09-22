import {
  clampToolcraftTimelineDurationSeconds,
  toolcraftTimelineDefaultDurationSeconds,
} from "../state/timeline-values";
import type {
  ResolvedToolcraftTimelinePanelSchema,
  ToolcraftCanvasSchema,
  ToolcraftCanvasSize,
  ToolcraftCanvasSizingSchema,
  ToolcraftExportSchema,
  ToolcraftMediaSchema,
  ToolcraftTimelinePanelSchema,
  ToolcraftToolbarSchema,
} from "./types";
import type { ResolvedToolcraftAppSchema } from "./resolved-app-schema";

export const defaultToolcraftCanvasSize = {
  height: 1080,
  unit: "px",
  width: 1920,
} satisfies ToolcraftCanvasSize;

export function resolveToolcraftCanvasSizing(
  canvas: ToolcraftCanvasSchema,
): ToolcraftCanvasSizingSchema {
  if (canvas.sizing) {
    return canvas.sizing;
  }

  if (canvas.size) {
    return { mode: "editable-output" };
  }

  if (canvas.upload) {
    return { mode: "editable-output" };
  }

  return { mode: "intrinsic-media" };
}

export function resolveToolcraftExport(
  exportSchema: ToolcraftExportSchema | undefined,
): ResolvedToolcraftAppSchema["export"] {
  return {
    png: {
      background: exportSchema?.png?.background ?? "include",
    },
  };
}

export function resolveToolcraftMedia(
  mediaSchema: ToolcraftMediaSchema | undefined,
): ResolvedToolcraftAppSchema["media"] {
  return {
    defaultAssets: mediaSchema?.defaultAssets ?? [],
  };
}

export function resolveToolcraftTimelinePanel(
  timeline: ToolcraftTimelinePanelSchema | undefined,
): ResolvedToolcraftTimelinePanelSchema | undefined {
  if (timeline === true) {
    return {
      defaultDurationSeconds: toolcraftTimelineDefaultDurationSeconds,
      enabled: true,
      mode: "keyframes",
    };
  }

  if (!timeline || timeline.enabled === false) {
    return undefined;
  }

  return {
    defaultDurationSeconds: clampToolcraftTimelineDurationSeconds(
      timeline.defaultDurationSeconds,
    ),
    enabled: true,
    mode: timeline.mode ?? "keyframes",
  };
}

export function resolveToolcraftToolbar({
  canvasEnabled,
  toolbar,
}: {
  canvasEnabled: boolean;
  toolbar: ToolcraftToolbarSchema | undefined;
}): Required<ToolcraftToolbarSchema> {
  return {
    history: toolbar?.history ?? canvasEnabled,
    radar: toolbar?.radar ?? canvasEnabled,
    theme: toolbar?.theme ?? true,
    zoom: toolbar?.zoom ?? canvasEnabled,
  };
}
