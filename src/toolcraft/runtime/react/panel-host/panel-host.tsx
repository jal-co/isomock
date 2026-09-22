"use client";

import * as React from "react";
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  type MotionValue,
  type PanInfo,
} from "motion/react";

import {
  panelDragHandleSelector,
  panelDragIgnoredTargetSelector,
  panelDragTransition,
  panelHostConfig,
  panelSnapAnimation,
} from "./panel-host-config";
import {
  clampPanelPlacementToViewport,
  resolvePanelSnapPlacement,
} from "./panel-host-geometry";
import type {
  ToolcraftPanelHostProps,
  PanelContainerProps,
  PanelHostProps,
  PanelPoint,
  PanelSnapPlacement,
  PanelStageProps,
  PanelViewport,
} from "./panel-host-types";
import { useToolcraftPanelBinding } from "./use-toolcraft-panel-binding";

function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

function isPanelDragHandleTarget(target: EventTarget | null, currentTarget: HTMLElement): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const handleTarget = target.closest(panelDragHandleSelector);

  return handleTarget !== null && currentTarget.contains(handleTarget);
}

function shouldIgnorePanelTarget(target: EventTarget | null, currentTarget: HTMLElement): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const ignoredTarget = target.closest(panelDragIgnoredTargetSelector);

  return ignoredTarget !== null && currentTarget.contains(ignoredTarget);
}

function shouldIgnorePanelDrag(event: React.PointerEvent<HTMLElement>): boolean {
  return shouldIgnorePanelTarget(event.target, event.currentTarget);
}

function getPanelVisualViewport(): PanelViewport {
  const visualViewport = window.visualViewport;

  if (visualViewport) {
    return {
      height: visualViewport.height,
      offsetLeft: visualViewport.offsetLeft,
      offsetTop: visualViewport.offsetTop,
      width: visualViewport.width,
    };
  }

  return {
    height: window.innerHeight,
    offsetLeft: 0,
    offsetTop: 0,
    width: window.innerWidth,
  };
}

function animatePanelMotionValue(value: MotionValue<number>, target: number): void {
  void animate(value, target, panelSnapAnimation);
}

function usePanelSnapControls({
  onPlacementChange,
  onPositionChange,
  onResetPosition,
  position = { x: 0, y: 0 },
  snap,
  snapEdge,
}: Pick<
  PanelHostProps,
  | "onPlacementChange"
  | "onPositionChange"
  | "onResetPosition"
  | "position"
  | "snap"
  | "snapEdge"
>) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const x = useMotionValue(position.x);
  const y = useMotionValue(position.y);

  React.useEffect(() => {
    animatePanelMotionValue(x, position.x);
    animatePanelMotionValue(y, position.y);
  }, [position.x, position.y, x, y]);

  const publishPlacement = React.useCallback(
    (placement: PanelSnapPlacement): void => {
      onPositionChange?.(placement.offset);
      onPlacementChange?.(placement);
    },
    [onPlacementChange, onPositionChange],
  );

  const setPlacement = React.useCallback(
    (placement: PanelSnapPlacement): void => {
      animatePanelMotionValue(x, placement.offset.x);
      animatePanelMotionValue(y, placement.offset.y);
      publishPlacement(placement);
    },
    [publishPlacement, x, y],
  );

  const publishPosition = (nextPosition: PanelPoint): void => {
    publishPlacement({ offset: nextPosition, snapEdge: undefined });
  };

  const publishCurrentPosition = (): void => {
    publishPosition({ x: x.get(), y: y.get() });
  };

  const handleDragEnd = (info: PanInfo): void => {
    if (!snap || snap.edges.length === 0) {
      publishCurrentPosition();
      return;
    }

    const panel = panelRef.current;

    if (!panel) {
      publishCurrentPosition();
      return;
    }

    const rect = panel.getBoundingClientRect();
    const offset = { x: x.get(), y: y.get() };
    const target = resolvePanelSnapPlacement({
      dimensions: { height: rect.height, width: rect.width },
      edges: snap.edges,
      margin: snap.margin,
      position: { x: rect.left, y: rect.top },
      velocity: { x: info.velocity.x / 1000, y: info.velocity.y / 1000 },
      viewport: getPanelVisualViewport(),
      zone: snap.zone,
    });

    if (!target) {
      publishCurrentPosition();
      return;
    }

    const nextPosition = {
      x: target.offset.x - (rect.left - offset.x),
      y: target.offset.y - (rect.top - offset.y),
    };

    setPlacement({ offset: nextPosition, snapEdge: target.snapEdge });
  };

  const resetPosition = (): void => {
    setPlacement({ offset: { x: 0, y: 0 }, snapEdge: undefined });
    onResetPosition?.();
  };

  React.useLayoutEffect(() => {
    const panel = panelRef.current;

    if (!panel) {
      return undefined;
    }

    const clampRestoredPlacement = (): void => {
      const rect = panel.getBoundingClientRect();

      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      if (x.get() === 0 && y.get() === 0 && snapEdge === undefined) {
        return;
      }

      const currentPlacement = {
        offset: { x: x.get(), y: y.get() },
        ...(snapEdge ? { snapEdge } : {}),
      };
      const nextPlacement = clampPanelPlacementToViewport({
        dimensions: { height: rect.height, width: rect.width },
        margin: snap?.margin,
        origin: {
          x: rect.left - currentPlacement.offset.x,
          y: rect.top - currentPlacement.offset.y,
        },
        placement: currentPlacement,
        viewport: getPanelVisualViewport(),
      });

      if (
        nextPlacement.offset.x !== currentPlacement.offset.x ||
        nextPlacement.offset.y !== currentPlacement.offset.y
      ) {
        setPlacement(nextPlacement);
      }
    };

    clampRestoredPlacement();
    window.addEventListener("resize", clampRestoredPlacement);

    return () => {
      window.removeEventListener("resize", clampRestoredPlacement);
    };
  }, [setPlacement, snap?.margin, snapEdge, x, y]);

  return { handleDragEnd, panelRef, resetPosition, x, y };
}

export function PanelHost({
  children,
  className,
  dragMode,
  innerClassName,
  onPositionChange,
  onPlacementChange,
  onResetPosition,
  panelId,
  panelType,
  position,
  snap,
  snapEdge,
  style,
}: PanelHostProps): React.JSX.Element {
  const config = panelHostConfig[panelType];
  const resolvedDragMode = dragMode ?? config.dragMode;
  const resolvedSnap = snap ?? { edges: config.snapEdges };
  const resolvedPanelId = panelId ?? config.panelId;
  const dragControls = useDragControls();
  const {
    handleDragEnd: handleSnapDragEnd,
    panelRef,
    resetPosition,
    x,
    y,
  } = usePanelSnapControls({
    onPositionChange,
    onPlacementChange,
    onResetPosition,
    position,
    snap: resolvedSnap,
    snapEdge,
  });
  const [isDragging, setIsDragging] = React.useState(false);

  const handlePointerDown: React.PointerEventHandler<HTMLElement> = (event) => {
    if (event.button !== 0) {
      return;
    }

    if (
      resolvedDragMode === "handle" &&
      !isPanelDragHandleTarget(event.target, event.currentTarget)
    ) {
      return;
    }

    if (event.defaultPrevented || shouldIgnorePanelDrag(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragControls.start(event);
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo): void => {
    setIsDragging(false);
    handleSnapDragEnd(info);
  };

  const handleDoubleClick: React.MouseEventHandler<HTMLElement> = (event) => {
    if (
      !resolvedSnap ||
      event.defaultPrevented ||
      (resolvedDragMode === "handle" &&
        !isPanelDragHandleTarget(event.target, event.currentTarget)) ||
      shouldIgnorePanelTarget(event.target, event.currentTarget)
    ) {
      return;
    }

    resetPosition();
  };

  return (
    <div className={cn("pointer-events-none", config.wrapperClassName, className)} style={style}>
      <motion.div
        className={cn("pointer-events-auto", isDragging && "cursor-grabbing", innerClassName)}
        data-dragging={isDragging ? "true" : "false"}
        data-drag-mode={resolvedDragMode}
        data-panel-id={resolvedPanelId}
        data-panel-offset-x={position?.x ?? 0}
        data-panel-offset-y={position?.y ?? 0}
        data-panel-snap-edge={snapEdge}
        data-panel-type={panelType}
        data-slot="toolcraft-runtime-panel-host"
        data-snap-edges={resolvedSnap?.edges.join(" ")}
        drag
        dragControls={dragControls}
        dragElastic={0}
        dragListener={false}
        dragMomentum={false}
        dragTransition={panelDragTransition}
        onDoubleClick={handleDoubleClick}
        onDragEnd={handleDragEnd}
        onDragStart={() => setIsDragging(true)}
        onPointerDown={handlePointerDown}
        ref={panelRef}
        style={{ x, y }}
      >
        {children}
      </motion.div>
    </div>
  );
}

export function ToolcraftPanelHost({
  onPlacementChange,
  onPositionChange,
  onResetPosition,
  panelType,
  position,
  snapEdge,
  ...props
}: ToolcraftPanelHostProps): React.JSX.Element {
  const panelBinding = useToolcraftPanelBinding({ panelId: panelType });

  return (
    <PanelHost
      {...props}
      onPlacementChange={(placement) => {
        onPlacementChange?.(placement);
        panelBinding.onPanelStateChange(placement);
      }}
      onPositionChange={(offset) => {
        onPositionChange?.(offset);
      }}
      onResetPosition={() => {
        onResetPosition?.();
      }}
      panelType={panelType}
      position={position ?? panelBinding.panelState.offset}
      snapEdge={snapEdge ?? panelBinding.panelState.snapEdge}
    />
  );
}

export function PanelStage({
  children,
  className,
  ...props
}: PanelStageProps): React.JSX.Element {
  return (
    <div
      {...props}
      className={cn(
        "relative w-full min-w-0 overflow-hidden rounded-lg bg-[color:var(--background)]",
        className,
      )}
      data-toolcraft-panel-stage=""
    >
      {children}
    </div>
  );
}

export function PanelContainer({
  children,
  className,
  dragMode,
  onPanelStateChange,
  panelClassName,
  panelStyle,
  panelState,
  panelType,
  placement,
  ...props
}: PanelContainerProps): React.JSX.Element {
  const config = panelHostConfig[panelType];

  if (placement === "surface") {
    return <>{children}</>;
  }

  if (placement === "floating") {
    return (
      <PanelHost
        className={panelClassName}
        style={panelStyle}
        dragMode={dragMode}
        onPlacementChange={onPanelStateChange}
        panelType={panelType}
        position={panelState?.offset}
        snap={{ edges: config.snapEdges }}
        snapEdge={panelState?.snapEdge}
      >
        {children}
      </PanelHost>
    );
  }

  return (
    <PanelStage
      {...props}
      className={cn(config.stageClassName, className)}
      data-panel-type={panelType}
    >
      <PanelHost
        className={panelClassName}
        style={panelStyle}
        dragMode={dragMode}
        onPlacementChange={onPanelStateChange}
        panelType={panelType}
        position={panelState?.offset}
        snap={{ edges: config.snapEdges }}
        snapEdge={panelState?.snapEdge}
      >
        {children}
      </PanelHost>
    </PanelStage>
  );
}
