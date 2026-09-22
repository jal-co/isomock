import { commitToolcraftStructuralPatch } from "../../../../state/history-patches";
import type {
  ToolcraftState
} from "../../../../state/types";
import type { ToolcraftCommandHandlers } from "../../../contract/command-handlers";
import type { ToolcraftLayersCommand } from "../contracts";
import { createToolcraftLayer, clampInsertIndex, getToolcraftLayerBlockIds, canMoveLayerToParent } from "./layers-operations";

export function reduceToolcraftLayersCommand(
  state: ToolcraftState,
  command: ToolcraftLayersCommand,
): ToolcraftState {
  switch (command.type) {
    case "layers.add": {
      const layer = createToolcraftLayer(state, command.layer);
      const insertIndex = clampInsertIndex(
        state.layers.length,
        command.insertIndex,
      );
      const layers = [
        ...state.layers.slice(0, insertIndex),
        layer,
        ...state.layers.slice(insertIndex),
      ];

      return commitToolcraftStructuralPatch(state, {
        after: {
          layers,
          selectedLayerId: layer.id,
        },
        before: {
          layers: state.layers,
          selectedLayerId: state.selectedLayerId,
        },
        label: layer.kind === "group" ? "Add group" : "Add layer",
      });
    }

    case "layers.delete": {
      if (!state.layers.some((layer) => layer.id === command.layerId)) {
        return state;
      }

      const deletedLayerIds = getToolcraftLayerBlockIds(
        state.layers,
        command.layerId,
      );
      const layers = state.layers.filter(
        (layer) => !deletedLayerIds.has(layer.id),
      );
      const mediaAssets = state.mediaAssets.filter(
        (asset) => !deletedLayerIds.has(asset.layerId),
      );
      const selectedLayerId = deletedLayerIds.has(state.selectedLayerId ?? "")
        ? (layers[0]?.id ?? null)
        : state.selectedLayerId;

      return commitToolcraftStructuralPatch(state, {
        after: {
          layers,
          mediaAssets,
          selectedLayerId,
        },
        before: {
          layers: state.layers,
          mediaAssets: state.mediaAssets,
          selectedLayerId: state.selectedLayerId,
        },
        label: "Delete layer",
      });
    }

    case "layers.moveToGroup": {
      const movedRootLayerIds = new Set(
        command.layerIds.filter((layerId) =>
          canMoveLayerToParent(state.layers, layerId, command.parentGroupId),
        ),
      );

      if (movedRootLayerIds.size === 0) {
        return state;
      }

      const nextParentGroupId = command.parentGroupId ?? undefined;
      const movedBlockIds = new Set<string>();

      for (const layerId of movedRootLayerIds) {
        getToolcraftLayerBlockIds(state.layers, layerId).forEach(
          (blockLayerId) => {
            movedBlockIds.add(blockLayerId);
          },
        );
      }

      const movingBlock = state.layers.filter((layer) =>
        movedBlockIds.has(layer.id),
      );
      const updatedMovingBlock = movingBlock.map((layer) =>
        movedRootLayerIds.has(layer.id)
          ? { ...layer, parentGroupId: nextParentGroupId }
          : layer,
      );
      const remainingLayers = state.layers.filter(
        (layer) => !movedBlockIds.has(layer.id),
      );
      const targetGroupIndex = command.parentGroupId
        ? remainingLayers.findIndex(
          (layer) => layer.id === command.parentGroupId,
        )
        : -1;
      const movedLayers = command.parentGroupId
        ? targetGroupIndex >= 0
          ? [
            ...remainingLayers.slice(0, targetGroupIndex + 1),
            ...updatedMovingBlock,
            ...remainingLayers.slice(targetGroupIndex + 1),
          ]
          : state.layers
        : state.layers.map((layer) =>
          movedRootLayerIds.has(layer.id)
            ? { ...layer, parentGroupId: nextParentGroupId }
            : layer,
        );
      const layers = command.parentGroupId
        ? movedLayers.map((layer) =>
          layer.id === command.parentGroupId &&
            layer.kind === "group" &&
            layer.collapsed
            ? { ...layer, collapsed: false }
            : layer,
        )
        : movedLayers;

      if (layers === state.layers) {
        return state;
      }

      if (
        layers.every(
          (layer, index) =>
            layer.id === state.layers[index]?.id &&
            layer.parentGroupId === state.layers[index]?.parentGroupId &&
            layer.collapsed === state.layers[index]?.collapsed,
        )
      ) {
        return state;
      }

      return commitToolcraftStructuralPatch(state, {
        after: { layers },
        before: { layers: state.layers },
        label: command.parentGroupId
          ? "Move layers to group"
          : "Move layers to root",
      });
    }

    case "layers.select":
      if (!state.layers.some((layer) => layer.id === command.layerId)) {
        return state;
      }

      return {
        ...state,
        selectedLayerId: command.layerId,
      };

    case "layers.rename": {
      const name = command.name.trim();

      if (
        !name ||
        !state.layers.some((layer) => layer.id === command.layerId)
      ) {
        return state;
      }

      const layers = state.layers.map((layer) =>
        layer.id === command.layerId ? { ...layer, displayName: name } : layer,
      );

      return commitToolcraftStructuralPatch(state, {
        after: { layers },
        before: { layers: state.layers },
        label: "Rename layer",
      });
    }

    case "layers.toggleCollapsed": {
      const targetLayer = state.layers.find(
        (layer) => layer.id === command.layerId,
      );

      if (!targetLayer || targetLayer.kind !== "group") {
        return state;
      }

      const layers = state.layers.map((layer) =>
        layer.id === command.layerId
          ? { ...layer, collapsed: !layer.collapsed }
          : layer,
      );

      return commitToolcraftStructuralPatch(state, {
        after: { layers },
        before: { layers: state.layers },
        label: "Toggle group",
      });
    }

    case "layers.toggleVisibility": {
      if (!state.layers.some((layer) => layer.id === command.layerId)) {
        return state;
      }

      const layers = state.layers.map((layer) =>
        layer.id === command.layerId
          ? { ...layer, visible: !layer.visible }
          : layer,
      );

      return commitToolcraftStructuralPatch(state, {
        after: { layers },
        before: { layers: state.layers },
        label: "Toggle layer visibility",
      });
    }

    case "layers.reorder": {
      const nextLayerIds = new Set(command.layers.map((layer) => layer.id));

      if (
        nextLayerIds.size !== command.layers.length ||
        nextLayerIds.size !== state.layers.length
      ) {
        return state;
      }

      if (!state.layers.every((layer) => nextLayerIds.has(layer.id))) {
        return state;
      }

      return commitToolcraftStructuralPatch(state, {
        after: {
          layers: command.layers,
          selectedLayerId: command.selectedLayerId ?? state.selectedLayerId,
        },
        before: {
          layers: state.layers,
          selectedLayerId: state.selectedLayerId,
        },
        label: "Reorder layers",
      });
    }
  }
}

export const layersCommandHandlers = Object.freeze({
  "layers.add": reduceToolcraftLayersCommand,
  "layers.delete": reduceToolcraftLayersCommand,
  "layers.moveToGroup": reduceToolcraftLayersCommand,
  "layers.rename": reduceToolcraftLayersCommand,
  "layers.reorder": reduceToolcraftLayersCommand,
  "layers.select": reduceToolcraftLayersCommand,
  "layers.toggleCollapsed": reduceToolcraftLayersCommand,
  "layers.toggleVisibility": reduceToolcraftLayersCommand,
} satisfies ToolcraftCommandHandlers<ToolcraftState, ToolcraftLayersCommand>);
