"use client";

import * as React from "react";
import { StackSimpleIcon } from "@phosphor-icons/react";
import { Button, ScrollFade } from "@/toolcraft/ui";
import { Eye, EyeOff, Trash2 } from "lucide-react";

import type { ToolcraftLayer } from "../../state/types";
import {
  getLayerDisplayName,
  isGroupLayer,
  layerDepthIndentPx,
  type LayerDropPlacement,
} from "./layers-panel-model";

type LayerRowProps = {
  depth: number;
  hasMedia: boolean;
  insertIndicatorDepth?: number;
  insertPlacement?: LayerDropPlacement;
  isDragging: boolean;
  isDropTarget: boolean;
  isGroupDropAvailable: boolean;
  isGroupHighlighted: boolean;
  isReorderDragging: boolean;
  isSelected: boolean;
  isVisible: boolean;
  layer: ToolcraftLayer;
  onDelete: () => void;
  onPointerCancel: React.PointerEventHandler<HTMLElement>;
  onPointerDown: React.PointerEventHandler<HTMLElement>;
  onPointerMove: React.PointerEventHandler<HTMLElement>;
  onPointerUp: React.PointerEventHandler<HTMLElement>;
  onRename: (displayName: string) => void;
  onSelect: () => void;
  onToggleCollapsed: () => void;
  onToggleVisibility: () => void;
};

const selectedLayerSurfaceClassName =
  "bg-[color:color-mix(in_oklab,var(--accent)_20%,transparent)]";
const hoveredLayerSurfaceClassName =
  "hover:bg-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)]";

function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

function LayerNameEditor({
  displayName,
  draftName,
  onCancel,
  onCommit,
  onDraftNameChange,
}: {
  displayName: string;
  draftName: string;
  onCancel: () => void;
  onCommit: () => void;
  onDraftNameChange: (value: string) => void;
}): React.JSX.Element {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    input.focus();
    input.select();
  }, []);

  return (
    <div className="flex w-full min-w-0 cursor-text items-center text-left select-text">
      <input
        aria-label={`Layer name for ${displayName}`}
        className="min-w-0 flex-1 cursor-text border-0 bg-transparent p-0 text-xs leading-normal font-medium text-[color:var(--foreground)] outline-none select-text"
        onBlur={onCommit}
        onChange={(event) => onDraftNameChange(event.currentTarget.value)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommit();
          }

          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        onPointerDown={(event) => event.stopPropagation()}
        ref={inputRef}
        value={draftName}
      />
    </div>
  );
}

function LayerNameContent({
  displayName,
  isVisible,
}: {
  displayName: string;
  isVisible: boolean;
}): React.JSX.Element {
  return (
    <div className="flex w-full min-w-0 cursor-default items-center text-left select-none">
      <ScrollFade
        className="no-scrollbar min-w-0"
        containerClassName="min-w-0 flex-1"
        preset="compact"
        side="right"
        watch={[displayName]}
      >
        <span
          className={cn(
            "block min-w-max pr-2 text-xs font-medium whitespace-nowrap text-[color:var(--foreground)] transition-opacity duration-150 ease-out select-none",
            !isVisible && "opacity-30",
          )}
          title={displayName}
        >
          {displayName}
        </span>
      </ScrollFade>
    </div>
  );
}

function LayerRowIcon({
  collapsed,
  displayName,
  hasMedia,
  isGroup,
  isVisible,
  onToggleCollapsed,
}: {
  collapsed?: boolean;
  displayName: string;
  hasMedia: boolean;
  isGroup: boolean;
  isVisible: boolean;
  onToggleCollapsed?: () => void;
}): React.JSX.Element {
  const iconClassName = cn(
    "size-3 shrink-0 text-[color:var(--foreground)] transition-opacity duration-150 ease-out",
    isVisible ? "opacity-60" : "opacity-30",
  );

  return (
    <span
      aria-hidden="true"
      className="group/layer-row-icon-hit flex h-8 w-3 shrink-0 cursor-default items-center justify-center"
      data-layer-row-icon-hit-area={isGroup ? "group" : undefined}
      data-layer-row-icon-label={
        isGroup ? (collapsed ? `Expand ${displayName}` : `Collapse ${displayName}`) : undefined
      }
      onClick={
        isGroup
          ? (event) => {
              event.stopPropagation();
              onToggleCollapsed?.();
            }
          : undefined
      }
      onDoubleClick={isGroup ? (event) => event.stopPropagation() : undefined}
      onPointerDown={isGroup ? (event) => event.stopPropagation() : undefined}
    >
      {isGroup ? (
        <svg
          className={cn(
            iconClassName,
            "transition-[opacity,transform] duration-150 ease-out",
            isVisible && "group-hover/layer-row-icon-hit:opacity-100",
            collapsed && "-rotate-90",
          )}
          data-layer-row-icon="group"
          fill="none"
          viewBox="0 0 256 256"
        >
          <path
            d="M58 93L125.879 160.879C127.05 162.05 128.95 162.05 130.121 160.879L198 93"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="24"
          />
        </svg>
      ) : hasMedia ? (
        <svg
          aria-hidden="true"
          className={iconClassName}
          data-layer-row-icon="image"
          fill="none"
          viewBox="0 0 256 256"
        >
          <rect
            height="196"
            rx="20"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="16"
            width="196"
            x="30"
            y="30"
          />
          <path
            d="M60 162.719L88.809 123.726C90.2597 121.762 93.1154 121.545 94.8465 123.266L168 196"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="16"
          />
          <circle cx="164" cy="92" fill="currentColor" r="22" />
        </svg>
      ) : (
        <StackSimpleIcon aria-hidden="true" className={iconClassName} data-layer-row-icon="layer" />
      )}
    </span>
  );
}

function LayerActionButtons({
  displayName,
  isEditingName,
  isDragging,
  isReorderDragging,
  isVisible,
  layer,
  onDelete,
  onToggleVisibility,
}: {
  displayName: string;
  isEditingName: boolean;
  isDragging: boolean;
  isReorderDragging: boolean;
  isVisible: boolean;
  layer: ToolcraftLayer;
  onDelete: () => void;
  onToggleVisibility: () => void;
}): React.JSX.Element | null {
  if (isEditingName) {
    return null;
  }

  const mutedIconStyle = isVisible ? undefined : { opacity: 0.3 };

  return (
    <div
      className={cn(
        "inline-flex w-0 translate-x-[7px] shrink-0 items-center self-center gap-px overflow-hidden opacity-0",
        isDragging && "pointer-events-none w-auto overflow-visible opacity-100 transition-none",
        !isDragging &&
          (isReorderDragging
            ? "pointer-events-none transition-none"
            : "transition-none group-hover/layer:w-auto group-hover/layer:overflow-visible group-hover/layer:opacity-100"),
      )}
      data-layer-actions=""
      data-visible={isVisible ? "true" : "false"}
    >
      <Button
        aria-label={layer.visible ? `Hide ${displayName}` : `Show ${displayName}`}
        className="cursor-default!"
        onClick={(event) => {
          event.stopPropagation();
          onToggleVisibility();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        {layer.visible ? <Eye style={mutedIconStyle} /> : <EyeOff style={mutedIconStyle} />}
      </Button>
      <Button
        aria-label={`Delete ${displayName}`}
        className="cursor-default!"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <Trash2 style={mutedIconStyle} />
      </Button>
    </div>
  );
}

function useLayerNameEditing({
  displayName,
  onRename,
}: {
  displayName: string;
  onRename: (displayName: string) => void;
}) {
  const [isEditingName, setIsEditingName] = React.useState(false);
  const [draftName, setDraftName] = React.useState(displayName);
  const skipNextBlurCommitRef = React.useRef(false);

  const startEditingName = (): void => {
    setDraftName(displayName);
    setIsEditingName(true);
  };

  const commitEditingName = (): void => {
    if (skipNextBlurCommitRef.current) {
      skipNextBlurCommitRef.current = false;
      return;
    }

    const nextDisplayName = draftName.trim().replace(/\s+/g, " ");

    if (nextDisplayName && nextDisplayName !== displayName) {
      onRename(nextDisplayName);
    }

    setIsEditingName(false);
  };

  const cancelEditingName = (): void => {
    skipNextBlurCommitRef.current = true;
    setDraftName(displayName);
    setIsEditingName(false);
  };

  return {
    cancelEditingName,
    commitEditingName,
    draftName,
    isEditingName,
    setDraftName,
    startEditingName,
  };
}

export function LayerRow({
  depth,
  hasMedia,
  insertIndicatorDepth,
  insertPlacement,
  isDragging,
  isDropTarget,
  isGroupDropAvailable,
  isGroupHighlighted,
  isReorderDragging,
  isSelected,
  isVisible,
  layer,
  onDelete,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onRename,
  onSelect,
  onToggleCollapsed,
  onToggleVisibility,
}: LayerRowProps): React.JSX.Element {
  const displayName = getLayerDisplayName(layer);
  const isGroup = isGroupLayer(layer);
  const nameEditing = useLayerNameEditing({ displayName, onRename });

  return (
    <li
      aria-label={displayName}
      aria-selected={isSelected}
      className={cn(
        "group/layer relative flex h-8 cursor-default! touch-none select-none items-center gap-px",
        isDragging && "cursor-grabbing",
      )}
      data-dragging={isDragging ? "true" : undefined}
      data-drop-indicator={insertPlacement}
      data-drop-target={isDropTarget ? "true" : undefined}
      data-layer-id={layer.id}
      data-reorder-dragging={isReorderDragging ? "true" : undefined}
      data-selected={isSelected}
      data-visible={isVisible ? "true" : "false"}
      data-template-layer-depth={depth}
      data-template-layer-kind={isGroup ? "group" : "layer"}
      data-template-layer-name={layer.id}
      data-template-layer-parent={layer.parentGroupId}
      onClick={onSelect}
      onDoubleClick={(event) => {
        event.preventDefault();
        nameEditing.startEditingName();
      }}
      onKeyDown={(event) => {
        if (
          nameEditing.isEditingName ||
          !(event.key === "Enter" || event.key === " ") ||
          (event.target instanceof Element && event.target.closest("button,input,select,textarea"))
        ) {
          return;
        }

        event.preventDefault();
        onSelect();
      }}
      onPointerCancel={onPointerCancel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="option"
      tabIndex={0}
    >
      {insertPlacement ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute right-2 z-20 h-px rounded-full bg-[color:var(--foreground)]",
            insertPlacement === "before" ? "-top-px" : isGroup ? "bottom-0" : "-bottom-px",
          )}
          data-layer-drop-indicator={insertPlacement}
          style={{
            left: `${8 + Math.max(0, insertIndicatorDepth ?? depth) * layerDepthIndentPx}px`,
          }}
        />
      ) : null}
      <div
        className={cn(
          "grid h-8 min-w-0 flex-1 cursor-default! grid-cols-[minmax(0,1fr)_auto] grid-rows-[minmax(0,1fr)] items-center gap-1.5 rounded-lg border pr-2.5 pl-[7px]",
          "border-transparent transition-none",
          !isSelected && !isReorderDragging && hoveredLayerSurfaceClassName,
          isSelected && selectedLayerSurfaceClassName,
          isGroupDropAvailable && "border-[color:var(--accent)]",
          isDropTarget && "bg-[color:color-mix(in_oklab,var(--accent)_10%,transparent)]",
          isGroupHighlighted &&
            "border-[color:var(--accent)] bg-[color:color-mix(in_oklab,var(--accent)_15%,transparent)]",
        )}
        data-layer-row-surface=""
      >
        <div
          className="flex min-w-0 items-center gap-2"
          style={depth > 0 ? { marginLeft: `${depth * layerDepthIndentPx}px` } : undefined}
        >
          <LayerRowIcon
            collapsed={isGroup ? layer.collapsed === true : undefined}
            displayName={displayName}
            hasMedia={hasMedia}
            isGroup={isGroup}
            isVisible={isVisible}
            onToggleCollapsed={isGroup ? onToggleCollapsed : undefined}
          />
          {nameEditing.isEditingName ? (
            <LayerNameEditor
              displayName={displayName}
              draftName={nameEditing.draftName}
              onCancel={nameEditing.cancelEditingName}
              onCommit={nameEditing.commitEditingName}
              onDraftNameChange={nameEditing.setDraftName}
            />
          ) : (
            <LayerNameContent displayName={displayName} isVisible={isVisible} />
          )}
        </div>
        <LayerActionButtons
          displayName={displayName}
          isEditingName={nameEditing.isEditingName}
          isDragging={isDragging}
          isReorderDragging={isReorderDragging}
          isVisible={isVisible}
          layer={layer}
          onDelete={onDelete}
          onToggleVisibility={onToggleVisibility}
        />
      </div>
    </li>
  );
}
