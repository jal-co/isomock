import type { ToolcraftLayer } from "../../state/types";
import {
  getToolcraftLayerDepth,
  isToolcraftLayerInsideGroup,
} from "./layer-tree";
import {
  isGroupLayer,
  layerDepthIndentPx,
  type LayerDropPlacement,
} from "./layers-panel-model";
import type { LayerInsertTarget } from "./layers-panel-reorder";

function getVisibleLayerIndex(
  visibleLayers: readonly ToolcraftLayer[],
  layerId: string,
): number {
  return visibleLayers.findIndex((visibleLayer) => visibleLayer.id === layerId);
}

export function getCanonicalLayerInsertTarget({
  layer,
  placement,
  visibleLayers,
}: {
  layer: ToolcraftLayer;
  placement: LayerDropPlacement;
  visibleLayers: readonly ToolcraftLayer[];
}): LayerInsertTarget {
  if (placement === "before") {
    return { layerId: layer.id, placement };
  }

  const visibleIndex = getVisibleLayerIndex(visibleLayers, layer.id);
  const nextVisibleLayer = visibleIndex >= 0 ? visibleLayers[visibleIndex + 1] : undefined;

  return nextVisibleLayer
    ? { layerId: nextVisibleLayer.id, placement: "before" }
    : { layerId: layer.id, placement: "after" };
}

function isLastVisibleLayerInParentGroup({
  layer,
  layers,
  visibleLayers,
}: {
  layer: ToolcraftLayer;
  layers: readonly ToolcraftLayer[];
  visibleLayers: readonly ToolcraftLayer[];
}): boolean {
  if (!layer.parentGroupId) {
    return false;
  }

  const visibleIndex = getVisibleLayerIndex(visibleLayers, layer.id);
  const nextVisibleLayer = visibleIndex >= 0 ? visibleLayers[visibleIndex + 1] : undefined;

  return (
    !nextVisibleLayer ||
    !isToolcraftLayerInsideGroup(layers, nextVisibleLayer, layer.parentGroupId)
  );
}

function isPointerAtNestedInsertDepth({
  clientX,
  layer,
  layers,
  listLeft,
}: {
  clientX: number;
  layer: ToolcraftLayer;
  layers: readonly ToolcraftLayer[];
  listLeft: number;
}): boolean {
  if (!Number.isFinite(clientX)) {
    return false;
  }

  const layerDepth = getToolcraftLayerDepth(layers, layer);

  return clientX >= listLeft + 8 + layerDepth * layerDepthIndentPx;
}

function getParentGroupLayer({
  layer,
  layers,
}: {
  layer: ToolcraftLayer;
  layers: readonly ToolcraftLayer[];
}): ToolcraftLayer | undefined {
  return layer.parentGroupId
    ? layers.find(
        (currentLayer) => currentLayer.id === layer.parentGroupId && isGroupLayer(currentLayer),
      )
    : undefined;
}

function getInsertTargetAfterLayerSubtree({
  layer,
  layers,
  visibleLayers,
}: {
  layer: ToolcraftLayer;
  layers: readonly ToolcraftLayer[];
  visibleLayers: readonly ToolcraftLayer[];
}): LayerInsertTarget {
  const layerDepth = getToolcraftLayerDepth(layers, layer);
  const visibleIndex = getVisibleLayerIndex(visibleLayers, layer.id);

  if (visibleIndex < 0) {
    return getCanonicalLayerInsertTarget({ layer, placement: "after", visibleLayers });
  }

  let lastVisibleLayer = layer;

  for (const nextVisibleLayer of visibleLayers.slice(visibleIndex + 1)) {
    if (getToolcraftLayerDepth(layers, nextVisibleLayer) <= layerDepth) {
      return { layerId: nextVisibleLayer.id, placement: "before" };
    }

    lastVisibleLayer = nextVisibleLayer;
  }

  return {
    indicatorDepth: layerDepth,
    layerId: lastVisibleLayer.id,
    parentGroupId: layer.parentGroupId ?? null,
    placement: "after",
  };
}

function getOutsideParentGroupInsertTarget({
  layer,
  layers,
  visibleLayers,
}: {
  layer: ToolcraftLayer;
  layers: readonly ToolcraftLayer[];
  visibleLayers: readonly ToolcraftLayer[];
}): LayerInsertTarget {
  const parentGroupLayer = getParentGroupLayer({ layer, layers });

  return parentGroupLayer
    ? getInsertTargetAfterLayerSubtree({ layer: parentGroupLayer, layers, visibleLayers })
    : getCanonicalLayerInsertTarget({ layer, placement: "after", visibleLayers });
}

function getNestedBoundaryLayerForTarget({
  layers,
  target,
  visibleLayers,
}: {
  layers: readonly ToolcraftLayer[];
  target: LayerInsertTarget;
  visibleLayers: readonly ToolcraftLayer[];
}): ToolcraftLayer | undefined {
  const targetLayer = layers.find((layer) => layer.id === target.layerId);

  if (!targetLayer) {
    return undefined;
  }

  if (target.placement === "after") {
    return isLastVisibleLayerInParentGroup({ layer: targetLayer, layers, visibleLayers })
      ? targetLayer
      : undefined;
  }

  const visibleIndex = getVisibleLayerIndex(visibleLayers, targetLayer.id);
  const previousVisibleLayer = visibleIndex > 0 ? visibleLayers[visibleIndex - 1] : undefined;

  return previousVisibleLayer &&
    isLastVisibleLayerInParentGroup({ layer: previousVisibleLayer, layers, visibleLayers })
    ? previousVisibleLayer
    : undefined;
}

export function getResolvedLayerInsertTarget({
  clientX,
  layers,
  listLeft,
  target,
  visibleLayers,
}: {
  clientX: number;
  layers: readonly ToolcraftLayer[];
  listLeft: number;
  target: LayerInsertTarget;
  visibleLayers: readonly ToolcraftLayer[];
}): LayerInsertTarget | null {
  const boundaryLayer = getNestedBoundaryLayerForTarget({ layers, target, visibleLayers });

  if (boundaryLayer) {
    return isPointerAtNestedInsertDepth({ clientX, layer: boundaryLayer, layers, listLeft })
      ? { layerId: boundaryLayer.id, placement: "after" }
      : getOutsideParentGroupInsertTarget({ layer: boundaryLayer, layers, visibleLayers });
  }

  const targetLayer = layers.find((layer) => layer.id === target.layerId);

  return targetLayer
    ? getCanonicalLayerInsertTarget({
        layer: targetLayer,
        placement: target.placement,
        visibleLayers,
      })
    : null;
}

export function getNearestLayerInsertTarget({
  clientX,
  dropRatio,
  layer,
  layers,
  listLeft,
  visibleLayers,
}: {
  clientX: number;
  dropRatio: number;
  layer: ToolcraftLayer;
  layers: readonly ToolcraftLayer[];
  listLeft: number;
  visibleLayers: readonly ToolcraftLayer[];
}): LayerInsertTarget | null {
  if (dropRatio < 0.5) {
    return { layerId: layer.id, placement: "before" };
  }

  return getResolvedLayerInsertTarget({
    clientX,
    layers,
    listLeft,
    target: { layerId: layer.id, placement: "after" },
    visibleLayers,
  });
}

export function getLayerInsertIndicatorTarget({
  target,
  visibleLayers,
}: {
  target: LayerInsertTarget;
  visibleLayers: readonly ToolcraftLayer[];
}): LayerInsertTarget {
  if (target.placement !== "before") {
    return target;
  }

  const visibleIndex = getVisibleLayerIndex(visibleLayers, target.layerId);
  const previousVisibleLayer = visibleIndex > 0 ? visibleLayers[visibleIndex - 1] : undefined;

  return previousVisibleLayer && isGroupLayer(previousVisibleLayer)
    ? { layerId: previousVisibleLayer.id, placement: "after" }
    : target;
}
