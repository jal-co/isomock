import type { ToolcraftRendererPipelineClient } from "../rendering";
import type { ReadonlyToolcraftState } from "../state/readonly-state";
import type { ToolcraftExportFrame } from "./export-frame";
import type { ToolcraftProductExportBoundsProvider } from "./product-export-bounds";

export type ToolcraftProductExportFrameContext = Readonly<{
  context: CanvasRenderingContext2D;
  frame: ToolcraftExportFrame;
  pixelRatio: number;
  rendererPipeline: ToolcraftRendererPipelineClient | null;
  signal: AbortSignal;
  state: ReadonlyToolcraftState;
  timeSeconds: number;
  timelineProgress: number;
}>;

export type ToolcraftProductExportFrameRenderer = (
  context: ToolcraftProductExportFrameContext,
) => PromiseLike<void> | void;

export type ToolcraftProductExportArtifactKind = "image" | "video";

export type ToolcraftProductExportBaseFileName =
  | string
  | ((artifact: ToolcraftProductExportArtifactKind) => string);

export function resolveToolcraftProductExportBaseFileName(
  baseFileName: ToolcraftProductExportBaseFileName | undefined,
  artifact: ToolcraftProductExportArtifactKind,
): string {
  if (baseFileName === undefined) return "toolcraft-export";
  return typeof baseFileName === "string" ? baseFileName : baseFileName(artifact);
}

export type ToolcraftProductExportRenderer = Readonly<{
  baseFileName: ToolcraftProductExportBaseFileName;
  getContentBounds?: ToolcraftProductExportBoundsProvider;
  renderFrame: ToolcraftProductExportFrameRenderer;
}>;
