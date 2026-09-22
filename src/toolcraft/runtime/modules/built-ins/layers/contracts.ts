import type { ToolcraftLayer, ToolcraftLayerDraft } from "../../../state/types";

export type ToolcraftLayersCommand =
  | { insertIndex?: number; layer?: ToolcraftLayerDraft; type: "layers.add" }
  | { layerId: string; type: "layers.delete" }
  | {
      layerIds: string[];
      parentGroupId: string | null;
      type: "layers.moveToGroup";
    }
  | { layerId: string; type: "layers.select" }
  | { layerId: string; name: string; type: "layers.rename" }
  | { layerId: string; type: "layers.toggleCollapsed" }
  | { layerId: string; type: "layers.toggleVisibility" }
  | {
      layers: ToolcraftLayer[];
      selectedLayerId?: string | null;
      type: "layers.reorder";
    };
