import type { ToolcraftWorkspaceSliceCodec } from "../../../../state/persistence-codec-types";
import { isToolcraftPersistenceRecord } from "../../../../state/persistence-shared";
import type { ToolcraftInitialState, ToolcraftLayer } from "../../../../state/types";

function readLayer(value: unknown): ToolcraftLayer | undefined {
  if (
    !isToolcraftPersistenceRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.visible !== "boolean"
  ) {
    return undefined;
  }

  const layer: ToolcraftLayer = {
    id: value.id,
    name: value.name,
    visible: value.visible,
  };

  if (value.kind === "group" || value.kind === "layer") {
    layer.kind = value.kind;
  }

  if (typeof value.collapsed === "boolean") {
    layer.collapsed = value.collapsed;
  }

  if (typeof value.displayName === "string") {
    layer.displayName = value.displayName;
  }

  if (typeof value.parentGroupId === "string") {
    layer.parentGroupId = value.parentGroupId;
  }

  return layer;
}

function readLayers(value: unknown): ToolcraftLayer[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap((item) => {
    const layer = readLayer(item);
    return layer ? [layer] : [];
  });
}

export function readLayerState(
  persistedState: Record<string, unknown>,
): Pick<ToolcraftInitialState, "layers" | "selectedLayerId"> | undefined {
  const layers = readLayers(persistedState.layers);

  if (!layers) {
    return undefined;
  }

  const layerState: Pick<ToolcraftInitialState, "layers" | "selectedLayerId"> = {
    layers,
  };

  if (
    typeof persistedState.selectedLayerId === "string" &&
    layers.some((layer) => layer.id === persistedState.selectedLayerId)
  ) {
    layerState.selectedLayerId = persistedState.selectedLayerId;
  } else if (persistedState.selectedLayerId === null) {
    layerState.selectedLayerId = null;
  }

  return layerState;
}

export const layersPersistenceCodec = Object.freeze({
  fields: ["layers", "selectedLayerId"],
  read: (_schema, data) => readLayerState(data),
  write: state => ({ layers: state.layers, selectedLayerId: state.selectedLayerId }),
} satisfies ToolcraftWorkspaceSliceCodec);
