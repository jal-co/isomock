"use client";

import * as React from "react";

import { subscribeBrowserWindowEvent } from "../browser-transport";
import type {
  SliderFocusEvent,
  SliderPointerEvent,
  SliderFocusEventHandler,
  SliderPointerEventHandler,
} from "./slider-types";

type SliderPointerDraggingOptions = {
  disabled?: boolean;
  onBlurCapture?: SliderFocusEventHandler;
  onLostPointerCapture?: SliderPointerEventHandler;
  onPointerDraggingChange?: (isDragging: boolean) => void;
  onPointerCancelCapture?: SliderPointerEventHandler;
  onPointerDownCapture?: SliderPointerEventHandler;
  onPointerUpCapture?: SliderPointerEventHandler;
};

export function useSliderPointerDragging({
  disabled,
  onBlurCapture,
  onLostPointerCapture,
  onPointerDraggingChange,
  onPointerCancelCapture,
  onPointerDownCapture,
  onPointerUpCapture,
}: SliderPointerDraggingOptions) {
  const [isPointerDragging, setIsPointerDragging] = React.useState(false);
  const isPointerDraggingRef = React.useRef(false);
  const onPointerDraggingChangeRef = React.useRef(onPointerDraggingChange);
  onPointerDraggingChangeRef.current = onPointerDraggingChange;
  const setPointerDragging = React.useCallback((nextIsDragging: boolean) => {
    if (isPointerDraggingRef.current === nextIsDragging) return;
    isPointerDraggingRef.current = nextIsDragging;
    setIsPointerDragging(nextIsDragging);
    onPointerDraggingChangeRef.current?.(nextIsDragging);
  }, []);
  const stopPointerDrag = React.useCallback(() => {
    setPointerDragging(false);
  }, [setPointerDragging]);
  const handlePointerDownCapture = React.useCallback(
    (event: SliderPointerEvent) => {
      onPointerDownCapture?.(event);
      if (event.defaultPrevented || disabled || event.button !== 0) {
        return;
      }

      setPointerDragging(true);
    },
    [disabled, onPointerDownCapture, setPointerDragging],
  );
  const handlePointerUpCapture = React.useCallback(
    (event: SliderPointerEvent) => {
      onPointerUpCapture?.(event);
      stopPointerDrag();
    },
    [onPointerUpCapture, stopPointerDrag],
  );
  const handlePointerCancelCapture = React.useCallback(
    (event: SliderPointerEvent) => {
      onPointerCancelCapture?.(event);
      stopPointerDrag();
    },
    [onPointerCancelCapture, stopPointerDrag],
  );
  const handleBlurCapture = React.useCallback(
    (event: SliderFocusEvent) => {
      onBlurCapture?.(event);
      stopPointerDrag();
    },
    [onBlurCapture, stopPointerDrag],
  );
  const handleLostPointerCapture = React.useCallback(
    (event: SliderPointerEvent) => {
      onLostPointerCapture?.(event);
      stopPointerDrag();
    },
    [onLostPointerCapture, stopPointerDrag],
  );

  React.useEffect(() => {
    if (disabled) stopPointerDrag();
  }, [disabled, stopPointerDrag]);

  React.useEffect(() => {
    if (!isPointerDragging) {
      return undefined;
    }

    const unsubscribePointerUp = subscribeBrowserWindowEvent(
      "pointerup",
      stopPointerDrag,
    );
    const unsubscribePointerCancel = subscribeBrowserWindowEvent(
      "pointercancel",
      stopPointerDrag,
    );
    const unsubscribeBlur = subscribeBrowserWindowEvent("blur", stopPointerDrag);

    return () => {
      unsubscribePointerUp();
      unsubscribePointerCancel();
      unsubscribeBlur();
      if (isPointerDraggingRef.current) {
        isPointerDraggingRef.current = false;
        onPointerDraggingChangeRef.current?.(false);
      }
    };
  }, [isPointerDragging, stopPointerDrag]);

  return {
    handleBlurCapture,
    handleLostPointerCapture,
    handlePointerCancelCapture,
    handlePointerDownCapture,
    handlePointerUpCapture,
    isPointerDragging,
  };
}
