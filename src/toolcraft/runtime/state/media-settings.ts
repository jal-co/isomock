import {
  cloneToolcraftMediaAssets,
  createToolcraftLayersFromMediaAssets,
} from "./media-defaults";
import type { ToolcraftMediaAsset, ToolcraftState } from "./types";

export function getToolcraftSettingsMediaState(
  state: ToolcraftState,
  assets: readonly ToolcraftMediaAsset[],
): Pick<ToolcraftState, "mediaAssets" | "layers" | "selectedLayerId"> {
  if (assets.length === 0 && state.mediaAssets.length === 0) {
    return {
      layers: state.layers,
      mediaAssets: state.mediaAssets,
      selectedLayerId: state.selectedLayerId,
    };
  }
  const previousLayerIds = new Set(
    state.mediaAssets.map(({ layerId }) => layerId),
  );
  const productLayers = state.layers.filter(
    ({ id }) => !previousLayerIds.has(id),
  );
  const occupiedLayers = new Set(productLayers.map(({ id }) => id));
  const seenIds = new Set<string>();
  const mediaAssets = cloneToolcraftMediaAssets(
    assets.filter((asset) => {
      if (
        !asset.id ||
        !asset.layerId ||
        seenIds.has(asset.id) ||
        occupiedLayers.has(asset.layerId)
      )
        return false;
      seenIds.add(asset.id);
      occupiedLayers.add(asset.layerId);
      return true;
    }),
  );
  const layers = [
    ...productLayers,
    ...createToolcraftLayersFromMediaAssets(mediaAssets, state.layers),
  ];
  const selectedLayerId = layers.some(({ id }) => id === state.selectedLayerId)
    ? state.selectedLayerId
    : (layers.at(-1)?.id ?? null);

  return { layers, mediaAssets, selectedLayerId };
}
