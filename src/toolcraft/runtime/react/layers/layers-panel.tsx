"use client";

import * as React from "react";
import {
  FolderSimpleIcon,
  PlusIcon,
  StackPlusIcon,
} from "@phosphor-icons/react";
import {
  Button,
  PanelContentSurface,
  PanelIconButton,
  PanelSurface,
  Popover,
  PopoverContent,
  PopoverTrigger,
  PrimitiveArrowIcon,
  stopPanelHeaderButtonPointerDown,
} from "@/toolcraft/ui";

import type { ToolcraftPanelState, ToolcraftState } from "../../state/types";
import {
  getToolcraftLayerDepth,
  getToolcraftVisibleLayerRows,
  isToolcraftLayerVisibleInTree,
} from "./layer-tree";
import {
  canMoveLayerIntoGroup,
  getLayerSubtreeEndIndex,
} from "./layers-panel-reorder";
import { LayerRow } from "./layers-panel-row";
import { PanelContainer } from "../panel-host/panel-host";
import { useToolcraftPanelBinding } from "../panel-host/use-toolcraft-panel-binding";
import type { PanelPlacement, PanelStateChange } from "../panel-host/panel-host-types";
import { useLayersPanelDragController } from "./use-layers-panel-drag-controller";
import { useToolcraftCommittedSelector } from "../app-shell/toolcraft-selectors";
import { useToolcraftDispatch } from "../app-shell/use-toolcraft";

export type LayersPanelProps = {
  className?: string;
  framed?: boolean;
  groupCreation?: boolean;
  onPanelStateChange?: PanelStateChange;
  panelPlacement?: PanelPlacement;
  panelState?: ToolcraftPanelState;
};

const selectLayers = (state: ToolcraftState) => state.layers;
const selectMediaAssets = (state: ToolcraftState) => state.mediaAssets;
const selectSelectedLayerId = (state: ToolcraftState) => state.selectedLayerId;
const selectLayersEnabled = (state: ToolcraftState) =>
  state.schema.panels.layers;

function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

function AddLayerPicker({
  groupCreation,
  onAddGroup,
  onAddLayer,
}: {
  groupCreation: boolean;
  onAddGroup: () => void;
  onAddLayer: () => void;
}): React.JSX.Element {
  const [open, setOpen] = React.useState(false);

  const addLayer = (): void => {
    onAddLayer();
    setOpen(false);
  };
  const addGroup = (): void => {
    onAddGroup();
    setOpen(false);
  };

  if (!groupCreation) {
    return (
      <Button
        aria-label="Add layer"
        data-icon-active={false}
        onClick={addLayer}
        onPointerDown={stopPanelHeaderButtonPointerDown}
        size="icon"
        type="button"
        variant="ghost"
      >
        <PlusIcon />
      </Button>
    );
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        aria-label="Add layer"
        onPointerDown={stopPanelHeaderButtonPointerDown}
        render={<Button data-icon-active={open} size="icon" type="button" variant="ghost" />}
      >
        <PlusIcon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[148px] gap-1 p-1" side="bottom" sideOffset={4}>
        <Button
          className="h-8 justify-start gap-2 px-2 text-xs"
          onClick={addLayer}
          size="sm"
          type="button"
          variant="ghost"
        >
          <StackPlusIcon className="size-4" />
          Layer
        </Button>
        <Button
          className="h-8 justify-start gap-2 px-2 text-xs"
          onClick={addGroup}
          size="sm"
          type="button"
          variant="ghost"
        >
          <FolderSimpleIcon className="size-4" />
          Group
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function LayersPanelHeader({
  collapsed,
  groupCreation,
  onAddGroup,
  onAddLayer,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  groupCreation: boolean;
  onAddGroup: () => void;
  onAddLayer: () => void;
  onToggleCollapsed: () => void;
}): React.JSX.Element {
  return (
    <div className="shrink-0" data-slot="layers-panel-header-shell">
      <div
        className="flex h-9 touch-none items-center justify-between gap-3 pr-1 pl-3 hover:cursor-grab active:cursor-grabbing"
        data-panel-drag-handle=""
        data-slot="layers-panel-header"
      >
        <p className="m-0 min-w-0 truncate text-xs-plus font-medium text-[color:var(--foreground)]">
          Layers
        </p>
        <div className="inline-flex shrink-0 items-center gap-1">
          {collapsed ? null : (
            <AddLayerPicker
              groupCreation={groupCreation}
              onAddGroup={onAddGroup}
              onAddLayer={onAddLayer}
            />
          )}
          <PanelIconButton
            label={collapsed ? "Expand layers" : "Collapse layers"}
            onClick={onToggleCollapsed}
            onPointerDown={stopPanelHeaderButtonPointerDown}
          >
            <PrimitiveArrowIcon direction={collapsed ? "down" : "up"} />
          </PanelIconButton>
        </div>
      </div>
    </div>
  );
}

export function LayersPanel({
  className,
  framed = true,
  groupCreation = true,
  onPanelStateChange,
  panelPlacement,
  panelState,
}: LayersPanelProps): React.JSX.Element | null {
  const dispatch = useToolcraftDispatch();
  const layers = useToolcraftCommittedSelector(selectLayers);
  const mediaAssets = useToolcraftCommittedSelector(selectMediaAssets);
  const selectedLayerId = useToolcraftCommittedSelector(selectSelectedLayerId);
  const layersEnabled = useToolcraftCommittedSelector(selectLayersEnabled);
  const panelBinding = useToolcraftPanelBinding({
    onPanelStateChange,
    panelId: "layers",
    panelState,
  });
  const resolvedPanelState = panelBinding.panelState;
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const collapsed = resolvedPanelState.collapsed ?? false;
  const placement = panelPlacement ?? (framed ? "frame" : "surface");
  const visibleLayers = React.useMemo(
    () => getToolcraftVisibleLayerRows(layers),
    [layers],
  );
  const {
    dragState,
    dropTargetGroupId,
    getInsertIndicatorTarget,
    getRowDragHandlers,
    highlightedGroupId,
    insertTarget,
  } = useLayersPanelDragController({
    dispatch,
    layers,
    listRef,
    visibleLayers,
  });

  if (!layersEnabled || resolvedPanelState.hidden) {
    return null;
  }

  const updateCollapsed = (nextCollapsed: boolean): void => {
    panelBinding.onPanelStateChange({ collapsed: nextCollapsed });
  };

  const addLayer = (): void => {
    const selectedLayer = layers.find((layer) => layer.id === selectedLayerId);
    const parentGroupId =
      selectedLayer?.kind === "group" ? selectedLayer.id : selectedLayer?.parentGroupId;
    const insertIndex = selectedLayer
      ? selectedLayer.kind === "group"
        ? getLayerSubtreeEndIndex(layers, selectedLayer.id)
        : layers.findIndex((layer) => layer.id === selectedLayer.id) + 1
      : layers.length;

    dispatch({
      insertIndex,
      layer: { kind: "layer", parentGroupId },
      type: "layers.add",
    });
  };

  const addGroup = (): void => {
    const selectedLayer = layers.find((layer) => layer.id === selectedLayerId);
    const parentGroupId =
      selectedLayer?.kind === "group" ? selectedLayer.id : selectedLayer?.parentGroupId;
    const insertIndex = selectedLayer
      ? selectedLayer.kind === "group"
        ? getLayerSubtreeEndIndex(layers, selectedLayer.id)
        : layers.findIndex((layer) => layer.id === selectedLayer.id) + 1
      : layers.length;

    dispatch({
      insertIndex,
      layer: { kind: "group", parentGroupId },
      type: "layers.add",
    });
  };

  const panelSurface = (
    <PanelSurface
      className={cn(
        "pointer-events-auto flex max-h-[calc(100dvh-1.25rem)] w-[240px] flex-col overflow-hidden rounded-lg p-0",
        className,
      )}
      data-toolcraft-layers-panel=""
      data-panel-id="layers"
    >
      <LayersPanelHeader
        collapsed={collapsed}
        groupCreation={groupCreation}
        onAddGroup={addGroup}
        onAddLayer={addLayer}
        onToggleCollapsed={() => updateCollapsed(!collapsed)}
      />
      {collapsed ? null : (
        <PanelContentSurface data-slot="layers-panel-content">
          <ul
            aria-label="Layers"
            className="flex min-h-0 flex-col gap-0.5 p-1"
            data-layer-list=""
            data-layer-list-dragging={dragState?.dragging ? "true" : undefined}
            ref={listRef}
            role="listbox"
          >
            {visibleLayers.map((layer) => {
              const depth = getToolcraftLayerDepth(layers, layer);
              const dragHandlers = getRowDragHandlers(layer);
              const isDragging = dragState?.layerId === layer.id && dragState.dragging;
              const isReorderDragging = dragState?.dragging === true;
              const isVisible = isToolcraftLayerVisibleInTree(layers, layer);
              const hasMedia = mediaAssets.some((asset) => asset.layerId === layer.id);
              const insertIndicatorTarget = insertTarget
                ? getInsertIndicatorTarget(insertTarget)
                : null;
              const rowInsertPlacement =
                insertIndicatorTarget?.layerId === layer.id
                  ? insertIndicatorTarget.placement
                  : undefined;

              return (
                <LayerRow
                  depth={depth}
                  hasMedia={hasMedia}
                  insertIndicatorDepth={insertIndicatorTarget?.indicatorDepth ?? depth}
                  insertPlacement={rowInsertPlacement}
                  isDragging={isDragging}
                  isDropTarget={dropTargetGroupId === layer.id}
                  isGroupDropAvailable={
                    dragState?.dragging === true &&
                    layer.kind === "group" &&
                    dropTargetGroupId === layer.id &&
                    canMoveLayerIntoGroup(layers, dragState.layerId, layer.id)
                  }
                  isGroupHighlighted={highlightedGroupId === layer.id}
                  isReorderDragging={isReorderDragging}
                  isSelected={selectedLayerId === layer.id}
                  isVisible={isVisible}
                  key={layer.id}
                  layer={layer}
                  onDelete={() => dispatch({ layerId: layer.id, type: "layers.delete" })}
                  onPointerCancel={dragHandlers.onPointerCancel}
                  onPointerDown={dragHandlers.onPointerDown}
                  onPointerMove={dragHandlers.onPointerMove}
                  onPointerUp={dragHandlers.onPointerUp}
                  onRename={(name) =>
                    dispatch({
                      layerId: layer.id,
                      name,
                      type: "layers.rename",
                    })
                  }
                  onSelect={() => dispatch({ layerId: layer.id, type: "layers.select" })}
                  onToggleCollapsed={() =>
                    dispatch({ layerId: layer.id, type: "layers.toggleCollapsed" })
                  }
                  onToggleVisibility={() =>
                    dispatch({ layerId: layer.id, type: "layers.toggleVisibility" })
                  }
                />
              );
            })}
            {visibleLayers.length === 0 ? (
              <li className="px-2 py-3 text-xs text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
                No layers
              </li>
            ) : null}
          </ul>
        </PanelContentSurface>
      )}
    </PanelSurface>
  );

  if (placement === "surface") {
    return panelSurface;
  }

  return (
    <PanelContainer
      onPanelStateChange={panelBinding.onPanelStateChange}
      panelState={resolvedPanelState}
      panelType="layers"
      placement={placement}
    >
      {panelSurface}
    </PanelContainer>
  );
}
