"use client";

import * as React from "react";
import { createControlHistoryGroupId, type ControlChangeMeta } from "@/toolcraft/ui";

import type { ToolcraftExternalStore } from "../../state/toolcraft-external-store";
import {
  ToolcraftOrientationGizmoFrame,
  toolcraftOrientationGizmoCssSize,
} from "./orientation-gizmo-frame";
import {
  beginToolcraftOrientationInteraction,
  type ToolcraftOrientationInteractionLease,
} from "./orientation-interaction-coordinator";
import {
  easeToolcraftOrientationSnap,
  getToolcraftOrientationPoseFromPointerDelta,
  getToolcraftOrientationSnapDurationMs,
  interpolateToolcraftOrientationPose,
  projectToolcraftOrientationAxes,
  readToolcraftOrientationPose,
  snapToolcraftOrientationPose,
  type ToolcraftOrientationAxis,
  type ToolcraftOrientationAxisProjection,
  type ToolcraftOrientationPose,
} from "./orientation-gizmo-math";

const pixelRatio = 2;
const center = toolcraftOrientationGizmoCssSize / 2;
const axisReach = 24.5;
const dotRadius = 5.6;
const hoverRadius = dotRadius * 1.3;
const hitRadius = 7;
const fallbackHitRadius = 8.4;
const dragThresholdPixels = 3;

const axisColors: Record<"x" | "y" | "z", string> = {
  x: "#ff215e",
  y: "#53ff55",
  z: "#3b69ff",
};

export type ToolcraftOrientationGizmoProps = {
  defaultValue?: ToolcraftOrientationPose;
  locked: boolean;
  onValueChange?: (
    value: ToolcraftOrientationPose,
    meta?: ControlChangeMeta,
  ) => void;
  testId?: string;
  store: ToolcraftExternalStore;
  target: string;
  value: unknown;
};

type GizmoGesture = {
  axisLock: "x" | "y" | null;
  canvas: HTMLCanvasElement;
  clickAxis: ToolcraftOrientationAxis | null;
  dragged: boolean;
  historyGroup: string;
  interaction: ToolcraftOrientationInteractionLease;
  last: { x: number; y: number };
  pointerId: number;
  start: { x: number; y: number };
};

function getAxisColor(axis: ToolcraftOrientationAxis): string {
  return axisColors[axis[1] as "x" | "y" | "z"];
}

function isPositiveAxis(axis: ToolcraftOrientationAxis): boolean {
  return axis[0] === "+";
}

function isGizmoPrimaryPointer(
  event: Pick<
    React.PointerEvent<HTMLCanvasElement>,
    "altKey" | "button" | "ctrlKey" | "metaKey"
  >,
): boolean {
  return event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey;
}

function sortRearToFront(
  projections: readonly ToolcraftOrientationAxisProjection[],
): ToolcraftOrientationAxisProjection[] {
  return [...projections].sort((left, right) => right.depth - left.depth);
}

function findHoveredAxis(
  projections: readonly ToolcraftOrientationAxisProjection[],
  x: number,
  y: number,
): ToolcraftOrientationAxis | null {
  const ranked = projections
    .map((projection) => ({
      axis: projection.axis,
      depth: projection.depth,
      distance: Math.hypot(x - projection.x, y - projection.y),
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance || left.depth - right.depth,
    );
  const exact = ranked.find((item) => item.distance <= hitRadius);
  const nearest =
    exact ?? ranked.find((item) => item.distance <= fallbackHitRadius);

  return nearest?.axis ?? null;
}

function getLocalPointer(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const bounds = canvas.getBoundingClientRect();

  return {
    x:
      ((clientX - bounds.left) / Math.max(1, bounds.width)) *
      toolcraftOrientationGizmoCssSize,
    y:
      ((clientY - bounds.top) / Math.max(1, bounds.height)) *
      toolcraftOrientationGizmoCssSize,
  };
}

function drawGizmo(
  canvas: HTMLCanvasElement,
  pose: ToolcraftOrientationPose,
  hoveredAxis: ToolcraftOrientationAxis | null,
): void {
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(
    0,
    0,
    toolcraftOrientationGizmoCssSize,
    toolcraftOrientationGizmoCssSize,
  );
  context.lineCap = "round";

  for (const projection of sortRearToFront(
    projectToolcraftOrientationAxes(pose, center, axisReach),
  )) {
    const color = getAxisColor(projection.axis);

    context.globalAlpha = projection.isFrontFacing ? 0.95 : 0.3;
    if (isPositiveAxis(projection.axis)) {
      context.strokeStyle = color;
      context.lineWidth = 2.1;
      context.beginPath();
      context.moveTo(center, center);
      context.lineTo(projection.x, projection.y);
      context.stroke();
    }

    context.fillStyle = color;
    context.beginPath();
    context.arc(
      projection.x,
      projection.y,
      projection.axis === hoveredAxis ? hoverRadius : dotRadius,
      0,
      Math.PI * 2,
    );
    context.fill();

    if (projection.axis === hoveredAxis) {
      context.globalAlpha = 0.7;
      context.strokeStyle = "#ffffff";
      context.lineWidth = 1;
      context.stroke();
    }
  }

  context.globalAlpha = 1;
}

export function ToolcraftOrientationGizmo({
  defaultValue,
  locked,
  onValueChange,
  store,
  target,
  testId = "toolcraft-orientation-gizmo",
  value,
}: ToolcraftOrientationGizmoProps): React.JSX.Element {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = React.useRef(0);
  const pose = readToolcraftOrientationPose(value, defaultValue);
  const poseRef = React.useRef(pose);
  const gestureRef = React.useRef<GizmoGesture | null>(null);
  const clickHistoryRef = React.useRef<{
    current: string;
    previous: string | null;
  } | null>(null);
  const interactionRef =
    React.useRef<ToolcraftOrientationInteractionLease | null>(null);
  const [hoveredAxis, setHoveredAxis] =
    React.useState<ToolcraftOrientationAxis | null>(null);

  poseRef.current = pose;

  React.useEffect(() => {
    if (locked) {
      setHoveredAxis(null);
      clickHistoryRef.current = null;
    }
  }, [locked]);

  React.useLayoutEffect(() => {
    if (canvasRef.current) {
      drawGizmo(canvasRef.current, pose, hoveredAxis);
    }
  }, [hoveredAxis, pose]);

  const finishLocalGesture = React.useCallback(
    (gesture: GizmoGesture): void => {
      if (gestureRef.current === gesture) {
        gestureRef.current = null;
      }
      setHoveredAxis(null);

      if (gesture.canvas.hasPointerCapture?.(gesture.pointerId)) {
        gesture.canvas.releasePointerCapture?.(gesture.pointerId);
      }
    },
    [],
  );

  const clearLocalInteraction = React.useCallback((): void => {
    window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = 0;
    const gesture = gestureRef.current;

    if (gesture) {
      finishLocalGesture(gesture);
    } else {
      setHoveredAxis(null);
    }
  }, [finishLocalGesture]);

  const releaseInteraction = React.useCallback(
    (interaction: ToolcraftOrientationInteractionLease): void => {
      if (interactionRef.current === interaction) {
        interactionRef.current = null;
      }
      interaction.release();
    },
    [],
  );

  const commitPose = React.useCallback(
    (
      nextPose: ToolcraftOrientationPose,
      interaction: ToolcraftOrientationInteractionLease,
      historyGroup: string,
    ): boolean => {
      if (interactionRef.current !== interaction) {
        return false;
      }

      return interaction.runOwnWrite(() => {
        poseRef.current = nextPose;
        onValueChange?.(nextPose, {
          history: "merge",
          historyGroup,
        });
      });
    },
    [onValueChange],
  );

  const animateSnap = React.useCallback(
    (
      axis: ToolcraftOrientationAxis,
      interaction: ToolcraftOrientationInteractionLease,
      historyGroup: string,
    ) => {
      window.cancelAnimationFrame(animationFrameRef.current);
      const startPose = poseRef.current;
      const targetPose = snapToolcraftOrientationPose(startPose, axis);
      const durationMs = getToolcraftOrientationSnapDurationMs(
        startPose,
        targetPose,
      );

      if (durationMs <= 1e-6) {
        releaseInteraction(interaction);
        return;
      }

      const startedAt = performance.now();

      const animate = (now: number): void => {
        const progress = Math.min(1, (now - startedAt) / durationMs);
        const committed = commitPose(
          interpolateToolcraftOrientationPose(
            startPose,
            targetPose,
            easeToolcraftOrientationSnap(progress),
          ),
          interaction,
          historyGroup,
        );

        if (!committed) {
          animationFrameRef.current = 0;
          return;
        }

        if (progress < 1) {
          animationFrameRef.current = window.requestAnimationFrame(animate);
        } else {
          animationFrameRef.current = 0;
          releaseInteraction(interaction);
        }
      };

      animationFrameRef.current = window.requestAnimationFrame(animate);
    },
    [commitPose, releaseInteraction],
  );

  const beginInteraction = React.useCallback(() => {
    let interaction: ToolcraftOrientationInteractionLease | null;
    interaction = beginToolcraftOrientationInteraction({
      onCancel: () => {
        if (interactionRef.current !== interaction) {
          return;
        }
        interactionRef.current = null;
        clearLocalInteraction();
      },
      store,
      target,
    });
    interactionRef.current = interaction;
    return interaction;
  }, [clearLocalInteraction, store, target]);

  React.useEffect(() => {
    const releaseAxisLock = (event: KeyboardEvent): void => {
      // A release/repress can happen without any intervening pointer event.
      if (event.key === "Shift" && !event.shiftKey && gestureRef.current) {
        gestureRef.current.axisLock = null;
      }
    };
    window.addEventListener("keyup", releaseAxisLock);

    return () => {
      window.removeEventListener("keyup", releaseAxisLock);
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
      const gesture = gestureRef.current;
      gestureRef.current = null;
      const interaction = interactionRef.current;
      interactionRef.current = null;
      interaction?.release();

      if (gesture?.canvas.hasPointerCapture?.(gesture.pointerId)) {
        gesture.canvas.releasePointerCapture?.(gesture.pointerId);
      }
    };
  }, []);

  return (
    <ToolcraftOrientationGizmoFrame locked={locked}>
      <canvas
        aria-disabled={locked}
        aria-label="3D orientation gizmo"
        data-hovered-axis={hoveredAxis ?? ""}
        data-testid={testId}
        data-toolcraft-canvas-handle="orientation-gizmo"
        data-toolcraft-orientation-pose={JSON.stringify(pose)}
        data-toolcraft-orientation-target={target}
        height={toolcraftOrientationGizmoCssSize * pixelRatio}
        onClick={(event) => {
          // Native click detail resets the series without a guessed double-click timer.
          if (event.detail === 1 && clickHistoryRef.current) {
            clickHistoryRef.current.previous = null;
          }
        }}
        onDoubleClick={(event) => {
          const point = getLocalPointer(event.currentTarget, event.clientX, event.clientY);
          if (
            locked ||
            !isGizmoPrimaryPointer(event) ||
            Math.hypot(point.x - center, point.y - center) > center
          ) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const historyGroup =
            clickHistoryRef.current?.previous ??
            clickHistoryRef.current?.current ??
            createControlHistoryGroupId("orientation-gizmo-reset");
          clickHistoryRef.current = null;
          // Cancels any pending axis-snap frame before writing the exact default.
          const interaction = beginInteraction();
          if (!interaction) return;
          commitPose(readToolcraftOrientationPose(defaultValue), interaction, historyGroup);
          releaseInteraction(interaction);
        }}
        onPointerCancel={(event) => {
          const gesture = gestureRef.current;

          if (!gesture || gesture.pointerId !== event.pointerId) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          gesture.interaction.cancel();
        }}
        onPointerDown={(event) => {
          if (
            locked ||
            gestureRef.current ||
            !isGizmoPrimaryPointer(event)
          ) {
            return;
          }

          const canvas = event.currentTarget;
          const point = getLocalPointer(canvas, event.clientX, event.clientY);

          if (Math.hypot(point.x - center, point.y - center) > center) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          const projections = projectToolcraftOrientationAxes(
            poseRef.current,
            center,
            axisReach,
          );
          const axis = findHoveredAxis(projections, point.x, point.y);

          window.cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = 0;
          const interaction = beginInteraction();
          if (!interaction) return;
          gestureRef.current = {
            axisLock: null,
            canvas,
            clickAxis: axis,
            dragged: false,
            historyGroup: createControlHistoryGroupId("orientation-gizmo"),
            interaction,
            last: point,
            pointerId: event.pointerId,
            start: point,
          };
          setHoveredAxis(axis);
          canvas.setPointerCapture?.(event.pointerId);
        }}
        onPointerLeave={() => {
          if (!gestureRef.current) {
            setHoveredAxis(null);
          }
        }}
        onLostPointerCapture={(event) => {
          const gesture = gestureRef.current;

          if (gesture?.pointerId === event.pointerId) {
            gesture.interaction.cancel();
          }
        }}
        onPointerMove={(event) => {
          if (locked) return;
          const point = getLocalPointer(
            event.currentTarget,
            event.clientX,
            event.clientY,
          );
          const gesture = gestureRef.current;

          if (!gesture) {
            setHoveredAxis(
              findHoveredAxis(
                projectToolcraftOrientationAxes(
                  poseRef.current,
                  center,
                  axisReach,
                ),
                point.x,
                point.y,
              ),
            );
            return;
          }

          if (gesture.pointerId !== event.pointerId) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          if (
            !gesture.dragged &&
            Math.hypot(
              point.x - gesture.start.x,
              point.y - gesture.start.y,
            ) <= dragThresholdPixels
          ) {
            return;
          }

          const previous = gesture.dragged ? gesture.last : gesture.start;
          gesture.dragged = true;
          gesture.last = point;
          const deltaX = point.x - previous.x;
          const deltaY = point.y - previous.y;
          if (!event.shiftKey) {
            gesture.axisLock = null;
          } else if (!gesture.axisLock && (deltaX !== 0 || deltaY !== 0)) {
            gesture.axisLock = Math.abs(deltaX) >= Math.abs(deltaY) ? "x" : "y";
          }
          const yawDelta = gesture.axisLock === "y" ? 0 : deltaX;
          const pitchDelta = gesture.axisLock === "x" ? 0 : deltaY;
          if (yawDelta === 0 && pitchDelta === 0) {
            return;
          }
          commitPose(
            getToolcraftOrientationPoseFromPointerDelta(
              poseRef.current,
              yawDelta,
              pitchDelta,
            ),
            gesture.interaction,
            gesture.historyGroup,
          );
        }}
        onPointerUp={(event) => {
          const gesture = gestureRef.current;

          if (!gesture || gesture.pointerId !== event.pointerId) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          clickHistoryRef.current = gesture.dragged
            ? null
            : {
                current: gesture.historyGroup,
                previous: clickHistoryRef.current?.current ?? null,
              };
          finishLocalGesture(gesture);
          if (gesture.dragged) {
            releaseInteraction(gesture.interaction);
          } else if (gesture.clickAxis) {
            animateSnap(
              gesture.clickAxis,
              gesture.interaction,
              gesture.historyGroup,
            );
          } else {
            releaseInteraction(gesture.interaction);
          }
        }}
        ref={canvasRef}
        role="application"
        style={{
          backgroundColor: "transparent",
          borderRadius: "50%",
          bottom: 0,
          cursor: locked ? "default" : undefined,
          display: "block",
          height: toolcraftOrientationGizmoCssSize,
          left: 0,
          outline: "none",
          pointerEvents: "auto",
          position: "absolute",
          touchAction: "none",
          width: toolcraftOrientationGizmoCssSize,
          zIndex: 21,
        }}
        width={toolcraftOrientationGizmoCssSize * pixelRatio}
      />
    </ToolcraftOrientationGizmoFrame>
  );
}
