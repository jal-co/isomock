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

export type ToolcraftProductExportRenderer = Readonly<{
  baseFileName: string;
  getContentBounds?: ToolcraftProductExportBoundsProvider;
  renderFrame: ToolcraftProductExportFrameRenderer;
}>;
