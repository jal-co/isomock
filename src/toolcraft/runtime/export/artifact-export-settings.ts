import type { ReadonlyToolcraftState } from "../state/readonly-state";
import { ToolcraftArtifactExportError } from "./export-error";

export const toolcraftImageExportFormatTarget = "export.image.format";
export const toolcraftImageExportResolutionTarget = "export.image.resolution";
export const toolcraftVideoExportFormatTarget = "export.video.format";
export const toolcraftVideoExportResolutionTarget = "export.video.resolution";

export type ToolcraftImageExportFormat = "jpg" | "png";
export type ToolcraftStillExportFormat = ToolcraftImageExportFormat | "svg";
export type ToolcraftImageExportPresetResolution = "2k" | "4k" | "8k";
export type ToolcraftVideoExportFormat = "mp4" | "webm";
export type ToolcraftVideoExportPresetResolution = "4k" | "current";

export type ToolcraftResolvedImageExportSettings = Readonly<{
  format: ToolcraftImageExportFormat;
  resolution: ToolcraftImageExportPresetResolution;
}>;

export type ToolcraftResolvedVideoExportSettings = Readonly<{
  format: ToolcraftVideoExportFormat;
  resolution: ToolcraftVideoExportPresetResolution;
}>;

function getSettingValue(
  state: ReadonlyToolcraftState,
  target: string,
  fallback: string,
): unknown {
  return state.values[target] ?? state.defaults[target] ?? fallback;
}

function invalidSetting(target: string): never {
  throw new ToolcraftArtifactExportError({
    code: "invalid-export-setting",
    message: `Toolcraft export setting ${target} is invalid.`,
    target,
  });
}

export function readToolcraftImageExportFormat(
  state: ReadonlyToolcraftState,
): ToolcraftImageExportFormat | null {
  const value = getSettingValue(state, toolcraftImageExportFormatTarget, "png");
  return value === "jpg" || value === "png" ? value : null;
}

export function readToolcraftStillExportFormat(
  state: ReadonlyToolcraftState,
): ToolcraftStillExportFormat | null {
  const value = getSettingValue(state, toolcraftImageExportFormatTarget, "png");
  return value === "svg" || value === "png" || value === "jpg" ? value : null;
}

function resolveImageResolution(
  state: ReadonlyToolcraftState,
): ToolcraftImageExportPresetResolution {
  const value = getSettingValue(
    state,
    toolcraftImageExportResolutionTarget,
    "4k",
  );
  return value === "2k" || value === "4k" || value === "8k"
    ? value
    : invalidSetting(toolcraftImageExportResolutionTarget);
}

export function readToolcraftVideoExportFormat(
  state: ReadonlyToolcraftState,
): ToolcraftVideoExportFormat | null {
  const value = getSettingValue(state, toolcraftVideoExportFormatTarget, "mp4");
  return value === "mp4" || value === "webm" ? value : null;
}

function resolveVideoResolution(
  state: ReadonlyToolcraftState,
): ToolcraftVideoExportPresetResolution {
  const value = getSettingValue(
    state,
    toolcraftVideoExportResolutionTarget,
    "current",
  );
  return value === "4k" || value === "current"
    ? value
    : invalidSetting(toolcraftVideoExportResolutionTarget);
}

export function resolveToolcraftImageExportSettings(
  state: ReadonlyToolcraftState,
): ToolcraftResolvedImageExportSettings {
  return Object.freeze({
    format:
      readToolcraftImageExportFormat(state) ??
      invalidSetting(toolcraftImageExportFormatTarget),
    resolution: resolveImageResolution(state),
  });
}

export function resolveToolcraftVideoExportSettings(
  state: ReadonlyToolcraftState,
): ToolcraftResolvedVideoExportSettings {
  return Object.freeze({
    format:
      readToolcraftVideoExportFormat(state) ??
      invalidSetting(toolcraftVideoExportFormatTarget),
    resolution: resolveVideoResolution(state),
  });
}
