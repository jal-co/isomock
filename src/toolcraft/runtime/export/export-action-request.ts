import type { ReadonlyToolcraftState } from "../state/readonly-state";
import type { ToolcraftExportFrame } from "./export-frame";
import type { ToolcraftProductExportRenderer } from "./product-export-renderer";
import type { ToolcraftProductSvgExportRenderer } from "./product-svg-export-renderer";
import type { ToolcraftRendererPipelineClient } from "../rendering";
import type { ToolcraftProductSceneBoundsProvider, ToolcraftRuntimeSceneVisibility } from "../scene";
import type { ToolcraftActionSchema } from "../schema/types";

export type ToolcraftControlsSceneExport = Readonly<{
  boundsProvider?: ToolcraftProductSceneBoundsProvider;
  exportRenderer?: ToolcraftProductExportRenderer;
  svgExportRenderer?: ToolcraftProductSvgExportRenderer;
  visibility: ToolcraftRuntimeSceneVisibility;
}>;

export type ToolcraftExportActionRequest = Readonly<{
  action: ToolcraftActionSchema;
  renderRuntimeScene: (
    canvas: HTMLCanvasElement,
    frame: ToolcraftExportFrame,
    state: ReadonlyToolcraftState,
  ) => Promise<unknown>;
  rendererPipeline: ToolcraftRendererPipelineClient | null;
  reportProgress: (progress: number) => void;
  signal: AbortSignal;
  sceneExport: ToolcraftControlsSceneExport;
  state: ReadonlyToolcraftState;
}>;
