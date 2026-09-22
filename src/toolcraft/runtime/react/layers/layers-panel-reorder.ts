import type { ToolcraftLayer } from "../../state/types";
import { isToolcraftLayerInsideGroup } from "./layer-tree";
import { type LayerDropPlacement } from "./layers-panel-model";

export type LayerInsertTarget = {
  indicatorDepth?: number;
  layerId: string;
  parentGroupId?: string | null;
  placement: LayerDropPlacement;
};

export type LayerPointerTarget =
  | {
      element: HTMLElement;
      kind: "row";
    }
  | {
      kind: "gap";
      target: LayerInsertTarget;
    };

export type LayerDragState = {
  dragging: boolean;
  layerId: string;
  pointerId: number;
  startX: number;
  startY: number;
};

export const layerDragStartDistance = 4;
export const layerGroupDropRatioStart = 0.25;
export const layerGroupDropRatioEnd = 0.75;

export function getLayerBlockIds(
  layers: readonly ToolcraftLayer[],
  layerId: string,
): Set<string> {
  const blockIds = new Set<string>([layerId]);
  let changed = true;

  while (changed) {
    changed = false;

    for (const layer of layers) {
      if (layer.parentGroupId && blockIds.has(layer.parentGroupId) && !blockIds.has(layer.id)) {
        blockIds.add(layer.id);
        changed = true;
      }
    }
  }

  return blockIds;
}

export function getReorderedLayers({
  draggingLayerId,
  layers,
  target,
}: {
  draggingLayerId: string;
  layers: readonly ToolcraftLayer[];
  target: LayerInsertTarget;
}): ToolcraftLayer[] | null {
  if (draggingLayerId === target.layerId) {
    return null;
  }

  const blockIds = getLayerBlockIds(layers, draggingLayerId);

  if (blockIds.has(target.layerId)) {
    return null;
  }

  const movingBlock = layers.filter((layer) => blockIds.has(layer.id));
  const remainingLayers = layers.filter((layer) => !blockIds.has(layer.id));
  const targetIndex = remainingLayers.findIndex((layer) => layer.id === target.layerId);

  if (targetIndex < 0) {
    return null;
  }

  const targetLayer = remainingLayers[targetIndex];
  const insertIndex = target.placement === "after" ? targetIndex + 1 : targetIndex;
  const parentGroupId =
    target.parentGroupId === undefined
      ? targetLayer?.parentGroupId
      : (target.parentGroupId ?? undefined);
  const updatedMovingBlock = movingBlock.map((layer) =>
    layer.id === draggingLayerId ? { ...layer, parentGroupId } : layer,
  );

  return [
    ...remainingLayers.slice(0, insertIndex),
    ...updatedMovingBlock,
    ...remainingLayers.slice(insertIndex),
  ];
}

export function getLayerDropRatioFromClientY(
  element: HTMLElement,
  clientY: number,
  fallbackRatio = 0.5,
): number {
  const rect = element.getBoundingClientRect();

  if (rect.height <= 0 || !Number.isFinite(clientY)) {
    return fallbackRatio;
  }

  return Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
}

export function canMoveLayerIntoGroup(
  layers: readonly ToolcraftLayer[],
  draggingLayerId: string,
  groupLayerId: string,
): boolean {
  if (draggingLayerId === groupLayerId) {
    return false;
  }

  return !getLayerBlockIds(layers, draggingLayerId).has(groupLayerId);
}

export function getLayerSubtreeEndIndex(
  layers: readonly ToolcraftLayer[],
  groupLayerId: string,
): number {
  const groupIndex = layers.findIndex((layer) => layer.id === groupLayerId);

  if (groupIndex < 0) {
    return layers.length;
  }

  let endIndex = groupIndex;

  for (let index = groupIndex + 1; index < layers.length; index += 1) {
    const layer = layers[index];

    if (!layer || !isToolcraftLayerInsideGroup(layers, layer, groupLayerId)) {
      continue;
    }

    endIndex = index;
  }

  return endIndex + 1;
}
