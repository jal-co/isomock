import type { ToolcraftRendererPipelineClient } from "../rendering";
import type { ToolcraftSceneRect } from "../scene";
import type { ReadonlyToolcraftState } from "../state/readonly-state";

export type ToolcraftProductExportBoundsContext = Readonly<{
  frame: ToolcraftSceneRect;
  rendererPipeline: ToolcraftRendererPipelineClient | null;
  signal: AbortSignal;
  state: ReadonlyToolcraftState;
  timeSeconds: number;
  timelineProgress: number;
}>;

/** Additional world-space content outside the layout frame, measured without DOM reads. */
export type ToolcraftProductExportBoundsProvider = (
  context: ToolcraftProductExportBoundsContext,
) => readonly ToolcraftSceneRect[] | PromiseLike<readonly ToolcraftSceneRect[]>;
