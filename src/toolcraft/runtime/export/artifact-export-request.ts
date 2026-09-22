import type { ToolcraftRendererPipelineClient } from "../rendering";
import type {
  ToolcraftProductSceneBoundsProvider,
  ToolcraftRuntimeSceneVisibility,
} from "../scene";
import type { ReadonlyToolcraftState } from "../state/readonly-state";
import type { ToolcraftExportFrame } from "./export-frame";
import type { ToolcraftProductExportRenderer } from "./product-export-renderer";

export type ToolcraftArtifactExportRequest = Readonly<{
  boundsProvider: ToolcraftProductSceneBoundsProvider | undefined;
  exportRenderer: ToolcraftProductExportRenderer | undefined;
  renderRuntimeScene: (
    canvas: HTMLCanvasElement,
    frame: ToolcraftExportFrame,
    state: ReadonlyToolcraftState,
  ) => Promise<unknown>;
  rendererPipeline: ToolcraftRendererPipelineClient | null;
  reportProgress: (progress: number) => void;
  signal: AbortSignal;
  state: ReadonlyToolcraftState;
  visibility: ToolcraftRuntimeSceneVisibility;
}>;
