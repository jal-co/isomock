import type { ToolcraftLayer } from "./types";

export function getToolcraftLayerById(
  layers: readonly ToolcraftLayer[],
  layerId: string | undefined,
): ToolcraftLayer | undefined {
  return layerId ? layers.find((layer) => layer.id === layerId) : undefined;
}

export function isToolcraftLayerVisibleInTree(
  layers: readonly ToolcraftLayer[],
  layerOrId: ToolcraftLayer | string,
): boolean {
  const layer =
    typeof layerOrId === "string"
      ? getToolcraftLayerById(layers, layerOrId)
      : layerOrId;

  if (!layer?.visible) {
    return false;
  }

  let parentLayer = getToolcraftLayerById(layers, layer.parentGroupId);
  const visited = new Set<string>([layer.id]);

  while (parentLayer && !visited.has(parentLayer.id)) {
    if (!parentLayer.visible) {
      return false;
    }

    visited.add(parentLayer.id);
    parentLayer = getToolcraftLayerById(layers, parentLayer.parentGroupId);
  }

  return true;
}
