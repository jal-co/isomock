"use client";

import * as React from "react";

import type {
  ToolcraftCommand,
  ToolcraftLayer,
} from "../../state/types";
import {
  getLayerInsertIndicatorTarget,
  getNearestLayerInsertTarget,
  getResolvedLayerInsertTarget,
} from "./layers-panel-insert-targets";
import { isGroupLayer } from "./layers-panel-model";
import {
  canMoveLayerIntoGroup,
  getLayerDropRatioFromClientY,
  getReorderedLayers,
  layerDragStartDistance,
  layerGroupDropRatioEnd,
  layerGroupDropRatioStart,
  type LayerDragState,
  type LayerInsertTarget,
  type LayerPointerTarget,
} from "./layers-panel-reorder";

export type LayersPanelRowDragHandlers = {
  onPointerCancel: React.PointerEventHandler<HTMLElement>;
  onPointerDown: React.PointerEventHandler<HTMLElement>;
  onPointerMove: React.PointerEventHandler<HTMLElement>;
  onPointerUp: React.PointerEventHandler<HTMLElement>;
};

export type LayersPanelDragController = {
  dragState: LayerDragState | null;
  dropTargetGroupId: string | null;
  getInsertIndicatorTarget: (target: LayerInsertTarget) => LayerInsertTarget;
  getRowDragHandlers: (layer: ToolcraftLayer) => LayersPanelRowDragHandlers;
  highlightedGroupId: string | null;
  insertTarget: LayerInsertTarget | null;
};

function getLayerPointerTarget(
  listElement: HTMLUListElement | null,
  clientX: number,
  clientY: number,
): LayerPointerTarget | null {
  const targetElement = document
    .elementFromPoint(clientX, clientY)
    ?.closest<HTMLElement>("[data-layer-id]");

  if (targetElement) {
    return { element: targetElement, kind: "row" };
  }

  if (!listElement) {
    return null;
  }

  const listRect = listElement.getBoundingClientRect();

  if (
    clientX < listRect.left ||
    clientX > listRect.right ||
    clientY < listRect.top ||
    clientY > listRect.bottom
  ) {
    return null;
  }

  const rowElements = Array.from(listElement.querySelectorAll<HTMLElement>("[data-layer-id]"));

  for (const rowElement of rowElements) {
    const rowRect = rowElement.getBoundingClientRect();
    const layerId = rowElement.dataset.layerId;

    if (!layerId) {
      continue;
    }

    if (clientY < rowRect.top) {
      return { kind: "gap", target: { layerId, placement: "before" } };
    }

    if (clientY <= rowRect.bottom) {
      return { element: rowElement, kind: "row" };
    }
  }

  const lastRowElement = rowElements.at(-1);
  const lastLayerId = lastRowElement?.dataset.layerId;

  return lastLayerId
    ? { kind: "gap", target: { layerId: lastLayerId, placement: "after" } }
    : null;
}

export function useLayersPanelDragController({
  dispatch,
  layers,
  listRef,
  visibleLayers,
}: {
  dispatch: React.Dispatch<ToolcraftCommand>;
  layers: readonly ToolcraftLayer[];
  listRef: React.RefObject<HTMLUListElement | null>;
  visibleLayers: readonly ToolcraftLayer[];
}): LayersPanelDragController {
  const [dragState, setDragState] = React.useState<LayerDragState | null>(null);
  const [dropTargetGroupId, setDropTargetGroupId] = React.useState<string | null>(null);
  const [highlightedGroupId, setHighlightedGroupId] = React.useState<string | null>(null);
  const [insertTarget, setInsertTarget] = React.useState<LayerInsertTarget | null>(null);
  const dragStateRef = React.useRef<LayerDragState | null>(null);
  const dropTargetGroupIdRef = React.useRef<string | null>(null);
  const insertTargetRef = React.useRef<LayerInsertTarget | null>(null);

  const clearDragState = (): void => {
    dragStateRef.current = null;
    dropTargetGroupIdRef.current = null;
    insertTargetRef.current = null;
    setDragState(null);
    setDropTargetGroupId(null);
    setHighlightedGroupId(null);
    setInsertTarget(null);
  };

  const updateDragState = (nextDragState: LayerDragState | null): void => {
    dragStateRef.current = nextDragState;
    setDragState(nextDragState);
  };

  const updateDropTargetGroupId = (nextDropTargetGroupId: string | null): void => {
    dropTargetGroupIdRef.current = nextDropTargetGroupId;
    setDropTargetGroupId(nextDropTargetGroupId);
  };

  const updateInsertTarget = (nextInsertTarget: LayerInsertTarget | null): void => {
    insertTargetRef.current = nextInsertTarget;
    setInsertTarget(nextInsertTarget);
  };

  const clearDragTarget = (): void => {
    updateDropTargetGroupId(null);
    setHighlightedGroupId(null);
    updateInsertTarget(null);
  };

  const getResolvedTarget = (
    target: LayerInsertTarget,
    clientX: number,
  ): LayerInsertTarget | null =>
    getResolvedLayerInsertTarget({
      clientX,
      layers,
      listLeft: listRef.current?.getBoundingClientRect().left ?? 0,
      target,
      visibleLayers,
    });

  const updateDragTarget = (
    pointerTarget: LayerPointerTarget | null,
    clientX: number,
    clientY: number,
    activeLayerId: string,
  ): void => {
    if (!pointerTarget) {
      clearDragTarget();
      return;
    }

    if (pointerTarget.kind === "gap") {
      updateDropTargetGroupId(null);
      setHighlightedGroupId(null);
      updateInsertTarget(getResolvedTarget(pointerTarget.target, clientX));
      return;
    }

    const layerId = pointerTarget.element.dataset.layerId;

    if (!layerId || layerId === activeLayerId) {
      clearDragTarget();
      return;
    }

    const targetLayer = layers.find((layer) => layer.id === layerId);

    if (!targetLayer) {
      clearDragTarget();
      return;
    }

    const canDropIntoGroup =
      isGroupLayer(targetLayer) && canMoveLayerIntoGroup(layers, activeLayerId, targetLayer.id);
    const highlightedGroup = isGroupLayer(targetLayer) ? targetLayer.id : null;
    const dropRatio = getLayerDropRatioFromClientY(
      pointerTarget.element,
      clientY,
      canDropIntoGroup ? 0.5 : 0,
    );

    if (
      canDropIntoGroup &&
      dropRatio > layerGroupDropRatioStart &&
      dropRatio < layerGroupDropRatioEnd
    ) {
      updateDropTargetGroupId(targetLayer.id);
      setHighlightedGroupId(targetLayer.id);
      updateInsertTarget(null);
      return;
    }

    updateDropTargetGroupId(null);
    setHighlightedGroupId(highlightedGroup);
    updateInsertTarget(
      getNearestLayerInsertTarget({
        clientX,
        dropRatio,
        layer: targetLayer,
        layers,
        listLeft: listRef.current?.getBoundingClientRect().left ?? 0,
        visibleLayers,
      }),
    );
  };

  const commitDrag = (): void => {
    const activeDragState = dragStateRef.current ?? dragState;
    const activeDropTargetGroupId = dropTargetGroupIdRef.current ?? dropTargetGroupId;
    const activeInsertTarget = insertTargetRef.current ?? insertTarget;

    if (!activeDragState?.dragging) {
      clearDragState();
      return;
    }

    if (activeDropTargetGroupId) {
      dispatch({
        layerIds: [activeDragState.layerId],
        parentGroupId: activeDropTargetGroupId,
        type: "layers.moveToGroup",
      });
      clearDragState();
      return;
    }

    if (!activeInsertTarget) {
      clearDragState();
      return;
    }

    const reorderedLayers = getReorderedLayers({
      draggingLayerId: activeDragState.layerId,
      layers,
      target: activeInsertTarget,
    });

    if (reorderedLayers) {
      dispatch({ layers: reorderedLayers, type: "layers.reorder" });
    }

    clearDragState();
  };

  const getRowDragHandlers = (layer: ToolcraftLayer): LayersPanelRowDragHandlers => ({
    onPointerCancel: clearDragState,
    onPointerDown: (event) => {
      if (event.button !== 0) {
        return;
      }

      event.currentTarget.setPointerCapture?.(event.pointerId);
      updateDragState({
        dragging: false,
        layerId: layer.id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      });
    },
    onPointerMove: (event) => {
      const activeDragState = dragStateRef.current ?? dragState;

      if (!activeDragState || activeDragState.pointerId !== event.pointerId) {
        return;
      }

      const distance = Math.hypot(
        event.clientX - activeDragState.startX,
        event.clientY - activeDragState.startY,
      );

      if (!activeDragState.dragging && distance < layerDragStartDistance) {
        return;
      }

      event.preventDefault();
      const nextDragState = { ...activeDragState, dragging: true };

      updateDragState(nextDragState);
      updateDragTarget(
        getLayerPointerTarget(listRef.current, event.clientX, event.clientY),
        event.clientX,
        event.clientY,
        activeDragState.layerId,
      );
    },
    onPointerUp: (event) => {
      const activeDragState = dragStateRef.current ?? dragState;

      if (activeDragState?.pointerId !== event.pointerId) {
        return;
      }

      commitDrag();
    },
  });

  return {
    dragState,
    dropTargetGroupId,
    getInsertIndicatorTarget: (target) =>
      getLayerInsertIndicatorTarget({ target, visibleLayers }),
    getRowDragHandlers,
    highlightedGroupId,
    insertTarget,
  };
}
