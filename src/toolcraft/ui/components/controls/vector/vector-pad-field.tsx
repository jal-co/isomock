"use client";

import * as React from "react";

import { cn } from "../../../lib/utils";
import { ControlFieldLabel } from "../../control-layout";
import { Field } from "../../primitives";
import { VectorAxisValue } from "./vector-axis-value";
import {
  createControlHistoryGroupId,
  type ControlChangeMeta,
} from "../control-types";
import type {
  VectorControlProps,
  VectorControlValue,
} from "./vector-control-types";
import {
  getDefaultPadCoordinateMode,
  getVectorPoint,
  pointFromEvent,
} from "./vector-pad-geometry";
import { VectorPadGuides, VectorPadHandle } from "./vector-pad-parts";
import { vectorPadBackgroundImages } from "./vector-pad-variants";
import {
  formatVectorPadCoordinate,
  parseVectorCoordinateDraft,
} from "./vector-value";

type VectorPadAxis = "x" | "y";

type VectorPadDragStart = {
  element: HTMLButtonElement;
  pointerId: number;
  clientX: number;
  clientY: number;
  value: VectorControlValue;
};

const vectorPadAxisLockThresholdPx = 2;

export function VectorPadField({
  defaultValue,
  name,
  onValueChange,
  padCoordinateMode,
  padShape = "compact",
  padVariant = "default",
  x,
  xLabel = "X",
  y,
  yLabel = "Y",
}: VectorControlProps): React.JSX.Element {
  const [isPointerDragging, setIsPointerDragging] = React.useState(false);
  const [locks, setLocks] = React.useState({ x: false, y: false });
  const fullyLocked = locks.x && locks.y;
  const normalizedX = formatVectorPadCoordinate(x);
  const normalizedY = formatVectorPadCoordinate(y);
  const coordinateMode =
    padCoordinateMode ?? getDefaultPadCoordinateMode(padVariant);
  const point = getVectorPoint(normalizedX, normalizedY, coordinateMode);
  const vectorPadBackgroundImage = vectorPadBackgroundImages[padVariant];
  const shiftAxisRef = React.useRef<VectorPadAxis | null>(null);
  const dragStartRef = React.useRef<VectorPadDragStart | null>(null);
  const liveHistoryGroupRef = React.useRef<string | null>(null);
  const resetX = formatVectorPadCoordinate(defaultValue?.x);
  const resetY = formatVectorPadCoordinate(defaultValue?.y);
  const accessibleName = name || "Vector";
  const updateVector = (
    nextX: string,
    nextY: string,
    meta?: ControlChangeMeta,
  ) => {
    const next = { x: locks.x ? x : nextX, y: locks.y ? y : nextY };
    if (Number(next.x) === Number(x) && Number(next.y) === Number(y)) return;
    if (meta) {
      onValueChange?.(next, meta);
      return;
    }

    onValueChange?.(next);
  };
  const commitCoordinate = (axis: VectorPadAxis, draft: string) => {
    const coordinate = parseVectorCoordinateDraft(draft);
    if (coordinate !== null) {
      updateVector(axis === "x" ? coordinate : x, axis === "y" ? coordinate : y);
    }
  };

  function getLiveHistoryMeta(): ControlChangeMeta {
    liveHistoryGroupRef.current ??= createControlHistoryGroupId(`vector:${accessibleName}`);

    return {
      history: "merge",
      historyGroup: liveHistoryGroupRef.current,
    };
  }

  function updateFromPointer(event: React.PointerEvent<HTMLButtonElement>): void {
    const dragStart = dragStartRef.current;
    if (!dragStart || event.pointerId !== dragStart.pointerId || fullyLocked) return;
    const nextPoint = pointFromEvent(event, coordinateMode);
    const nextValue: VectorControlValue = {
      x: (nextPoint.x * 2 - 1).toFixed(2),
      y: (nextPoint.y * 2 - 1).toFixed(2),
    };
    if (event.shiftKey && !locks.x && !locks.y) {
      if (!shiftAxisRef.current) {
        const deltaX = event.clientX - dragStart.clientX;
        const deltaY = event.clientY - dragStart.clientY;

        if (Math.hypot(deltaX, deltaY) < vectorPadAxisLockThresholdPx) {
          updateVector(
            dragStart.value.x,
            dragStart.value.y,
            getLiveHistoryMeta(),
          );
          return;
        }

        shiftAxisRef.current = Math.abs(deltaX) >= Math.abs(deltaY) ? "x" : "y";
      }

      updateVector(
        shiftAxisRef.current === "x" ? nextValue.x : dragStart.value.x,
        shiftAxisRef.current === "y" ? nextValue.y : dragStart.value.y,
        getLiveHistoryMeta(),
      );
      return;
    }

    shiftAxisRef.current = null;

    updateVector(
      nextValue.x,
      nextValue.y,
      getLiveHistoryMeta(),
    );
  }

  function stopPointerDrag(): void {
    const dragStart = dragStartRef.current;
    setIsPointerDragging(false);
    shiftAxisRef.current = null;
    dragStartRef.current = null;
    liveHistoryGroupRef.current = null;
    if (dragStart?.element.hasPointerCapture?.(dragStart.pointerId)) {
      dragStart.element.releasePointerCapture(dragStart.pointerId);
    }
  }

  function finishPointerDrag(event: React.PointerEvent<HTMLButtonElement>): void {
    if (event.pointerId === dragStartRef.current?.pointerId) stopPointerDrag();
  }

  function toggleLock(axis: VectorPadAxis): void {
    stopPointerDrag();
    setLocks(current => ({ ...current, [axis]: !current[axis] }));
  }

  return (
    <Field className="min-w-0 gap-2">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <ControlFieldLabel className="min-w-0">{name}</ControlFieldLabel>
        <span className="inline-flex items-center gap-3">
          <VectorAxisValue
            axis="x" label={xLabel} locked={locks.x} name={accessibleName}
            onCommit={draft => commitCoordinate("x", draft)}
            onToggle={() => toggleLock("x")} value={normalizedX}
          />
          <VectorAxisValue
            axis="y" label={yLabel} locked={locks.y} name={accessibleName}
            onCommit={draft => commitCoordinate("y", draft)}
            onToggle={() => toggleLock("y")} value={normalizedY}
          />
        </span>
      </div>
      <button
        aria-label={`${accessibleName} X/Y pad`}
        data-slot="vector-pad"
        disabled={fullyLocked}
        className={cn(
          "relative w-full cursor-default! touch-none overflow-hidden rounded-[calc(var(--radius)+2px)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--foreground)_4%,transparent),color-mix(in_oklab,var(--foreground)_1%,transparent))] select-none focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--foreground)_12%,transparent)] focus-visible:outline-none",
          padShape === "square" ? "aspect-square" : "h-[142px]",
        )}
        data-vector-pad-coordinate-mode={coordinateMode}
        data-vector-pad-shape={padShape}
        data-vector-pad-variant={padVariant}
        onDoubleClick={(event) => {
          event.preventDefault();
          stopPointerDrag();
          updateVector(resetX, resetY);
        }}
        onLostPointerCapture={finishPointerDrag}
        onPointerCancel={finishPointerDrag}
        onPointerDown={(event) => {
          if (fullyLocked || event.button > 0 || dragStartRef.current) return;
          event.preventDefault();
          setIsPointerDragging(true);
          shiftAxisRef.current = null;
          dragStartRef.current = {
            element: event.currentTarget,
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
            value: { x, y },
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) {
            updateFromPointer(event);
          }
        }}
        onPointerUp={finishPointerDrag}
        style={point}
        type="button"
      >
        {vectorPadBackgroundImage ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-40"
            style={{ backgroundImage: vectorPadBackgroundImage }}
          />
        ) : null}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle,color-mix(in_oklab,var(--foreground)_8%,transparent)_1px,transparent_1px)] bg-[length:14px_14px]"
        />
        <VectorPadGuides isDragging={isPointerDragging} lockedAxes={locks} />
        <VectorPadHandle isDragging={isPointerDragging} />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 rounded-[inherit] border border-[color:color-mix(in_oklab,var(--border)_10%,transparent)]"
        />
      </button>
    </Field>
  );
}
