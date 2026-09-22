"use client";

import * as React from "react";
import { createControlHistoryGroupId } from "@/toolcraft/ui";

import { useToolcraftStore } from "../app-shell/toolcraft-store-context";
import {
  beginToolcraftOrientationInteraction,
  type ToolcraftOrientationInteractionLease,
} from "./orientation-interaction-coordinator";
import {
  getToolcraftOrientationPoseFromPointerDelta,
  readToolcraftOrientationPose,
} from "./orientation-gizmo-math";

export type ToolcraftModelOrbitHitTest = (
  clientX: number,
  clientY: number,
) => boolean;

export type ToolcraftModelOrbitInteractionOptions = {
  enabled?: boolean;
  hitTest: ToolcraftModelOrbitHitTest;
  historyLabel?: string;
  target: string;
};

export type ToolcraftModelOrbitInteractionHandlers<
  Element extends HTMLElement,
> = {
  onPointerCancel: React.PointerEventHandler<Element>;
  onPointerDown: React.PointerEventHandler<Element>;
  onLostPointerCapture: React.PointerEventHandler<Element>;
  onPointerMove: React.PointerEventHandler<Element>;
  onPointerUp: React.PointerEventHandler<Element>;
};

type OrbitGesture = {
  element: Element;
  historyGroup: string;
  lastX: number;
  lastY: number;
  pendingDeltaX: number;
  pendingDeltaY: number;
  pointerId: number;
  interaction: ToolcraftOrientationInteractionLease;
};

function releaseOrbitPointerCapture(gesture: OrbitGesture): void {
  if (gesture.element.hasPointerCapture?.(gesture.pointerId)) {
    gesture.element.releasePointerCapture?.(gesture.pointerId);
  }
}

function isUnmodifiedPrimaryPointer(
  event: Pick<
    React.PointerEvent<HTMLElement>,
    "altKey" | "button" | "ctrlKey" | "metaKey" | "shiftKey"
  >,
): boolean {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

export function useToolcraftModelOrbitInteraction<
  Element extends HTMLElement = HTMLElement,
>({
  enabled = true,
  historyLabel = "Model orbit",
  hitTest,
  target,
}: ToolcraftModelOrbitInteractionOptions): ToolcraftModelOrbitInteractionHandlers<Element> {
  const store = useToolcraftStore();
  const gestureRef = React.useRef<OrbitGesture | null>(null);
  const animationFrameRef = React.useRef(0);

  const applyPendingDelta = React.useCallback((): void => {
    const gesture = gestureRef.current;

    animationFrameRef.current = 0;
    if (
      !gesture ||
      (gesture.pendingDeltaX === 0 && gesture.pendingDeltaY === 0)
    ) {
      return;
    }

    const deltaX = gesture.pendingDeltaX;
    const deltaY = gesture.pendingDeltaY;
    gesture.pendingDeltaX = 0;
    gesture.pendingDeltaY = 0;
    const state = store.getState();
    const pose = readToolcraftOrientationPose(
      state.values[target],
      readToolcraftOrientationPose(state.defaults[target]),
    );

    gesture.interaction.runOwnWrite(() => {
      store.dispatch({
        history: "merge",
        historyGroup: gesture.historyGroup,
        label: historyLabel,
        target,
        type: "controls.setValue",
        value: getToolcraftOrientationPoseFromPointerDelta(
          pose,
          deltaX,
          deltaY,
        ),
      });
    });
  }, [historyLabel, store, target]);

  const schedulePendingDelta = React.useCallback((): void => {
    if (animationFrameRef.current !== 0) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(applyPendingDelta);
  }, [applyPendingDelta]);

  const finishGesture = React.useCallback(
    (event: React.PointerEvent<Element>): void => {
      const gesture = gestureRef.current;

      if (!gesture || gesture.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
      applyPendingDelta();
      gestureRef.current = null;
      gesture.interaction.release();
      releaseOrbitPointerCapture(gesture);
    },
    [applyPendingDelta],
  );

  React.useEffect(
    () => () => {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
      const gesture = gestureRef.current;
      gestureRef.current = null;
      gesture?.interaction.release();
      if (gesture) {
        releaseOrbitPointerCapture(gesture);
      }
    },
    [enabled, target],
  );

  const onPointerDown = React.useCallback<React.PointerEventHandler<Element>>(
    (event) => {
      if (
        !enabled ||
        !isUnmodifiedPrimaryPointer(event) ||
        !hitTest(event.clientX, event.clientY)
      ) {
        return;
      }

      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
      let interaction: ToolcraftOrientationInteractionLease | null;
      interaction = beginToolcraftOrientationInteraction({
        onCancel: () => {
          const gesture = gestureRef.current;

          if (!gesture || gesture.interaction !== interaction) {
            return;
          }

          window.cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = 0;
          gestureRef.current = null;
          releaseOrbitPointerCapture(gesture);
        },
        store,
        target,
      });
      if (!interaction) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      gestureRef.current = {
        element: event.currentTarget,
        historyGroup: createControlHistoryGroupId("model-orbit"),
        interaction,
        lastX: event.clientX,
        lastY: event.clientY,
        pendingDeltaX: 0,
        pendingDeltaY: 0,
        pointerId: event.pointerId,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [enabled, hitTest, store, target],
  );

  const onPointerMove = React.useCallback<React.PointerEventHandler<Element>>(
    (event) => {
      const gesture = gestureRef.current;

      if (!gesture || gesture.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      gesture.pendingDeltaX += event.clientX - gesture.lastX;
      gesture.pendingDeltaY += event.clientY - gesture.lastY;
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
      schedulePendingDelta();
    },
    [schedulePendingDelta],
  );

  return {
    onLostPointerCapture: finishGesture,
    onPointerCancel: finishGesture,
    onPointerDown,
    onPointerMove,
    onPointerUp: finishGesture,
  };
}
