import { getNextToolcraftLayerId } from "../../../../state/layer-state";
import type {
  ToolcraftLayer,
  ToolcraftLayerDraft,
  ToolcraftState
} from "../../../../state/types";

export function getNextLayerName(
  layers: readonly ToolcraftLayer[],
  prefix: "Group" | "Layer",
): string {
  const nextIndex =
    layers.reduce((highestIndex, layer) => {
      const label = layer.displayName ?? layer.name;
      const match = new RegExp(`^${prefix} (\\d+)$`).exec(label);
      const currentIndex = Number(match?.[1] ?? 0);

      return Math.max(highestIndex, currentIndex);
    }, 0) + 1;

  return `${prefix} ${nextIndex}`;
}

export function createToolcraftLayer(
  state: ToolcraftState,
  draft: ToolcraftLayerDraft | undefined,
): ToolcraftLayer {
  const kind = draft?.kind ?? "layer";
  const name =
    draft?.name ??
    draft?.displayName ??
    getNextLayerName(state.layers, kind === "group" ? "Group" : "Layer");

  return {
    collapsed:
      kind === "group" ? (draft?.collapsed ?? false) : draft?.collapsed,
    displayName: draft?.displayName ?? name,
    id: draft?.id ?? getNextToolcraftLayerId(state),
    kind,
    name,
    parentGroupId: draft?.parentGroupId,
    visible: draft?.visible ?? true,
  };
}

export function clampInsertIndex(
  length: number,
  insertIndex: number | undefined,
): number {
  return Math.max(0, Math.min(length, insertIndex ?? length));
}

export function getToolcraftLayerBlockIds(
  layers: readonly ToolcraftLayer[],
  layerId: string,
): Set<string> {
  const blockIds = new Set<string>([layerId]);
  let changed = true;

  while (changed) {
    changed = false;

    for (const layer of layers) {
      if (
        layer.parentGroupId &&
        blockIds.has(layer.parentGroupId) &&
        !blockIds.has(layer.id)
      ) {
        blockIds.add(layer.id);
        changed = true;
      }
    }
  }

  return blockIds;
}

export function canMoveLayerToParent(
  layers: readonly ToolcraftLayer[],
  layerId: string,
  parentGroupId: string | null,
): boolean {
  if (!parentGroupId) {
    return true;
  }

  if (layerId === parentGroupId) {
    return false;
  }

  const parent = layers.find((layer) => layer.id === parentGroupId);

  if (!parent || parent.kind !== "group") {
    return false;
  }

  return !getToolcraftLayerBlockIds(layers, layerId).has(parentGroupId);
}
