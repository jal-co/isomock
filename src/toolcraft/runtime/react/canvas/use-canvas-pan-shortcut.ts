"use client";

import * as React from "react";

const keyboardEditorSelector = [
  "input",
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
].join(",");
const keyboardControlSelector = [
  "button",
  "a[href]",
  '[role="button"]',
  '[role="slider"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
].join(",");

export function useCanvasPanShortcut({
  draggable,
  onCancel,
  viewportRef,
}: {
  draggable: boolean;
  onCancel: () => void;
  viewportRef: React.RefObject<HTMLDivElement | null>;
}): boolean {
  const [pressed, setPressed] = React.useState(false);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!draggable || !viewport) {
      setPressed(false);
      return;
    }
    const document = viewport.ownerDocument;
    const window = document.defaultView;
    let keyboardNavigation = true;
    const handlePointerDown = (): void => { keyboardNavigation = false; };
    const isCanvasKeyboardTarget = (target: EventTarget | null): boolean => {
      if (target instanceof Element && target.closest(keyboardEditorSelector)) {
        return false;
      }
      const control = target instanceof Element
        ? target.closest(keyboardControlSelector)
        : null;
      // Keyboard navigation takes priority even if the parked pointer happens
      // to be over the canvas. A pointer-focused button is not a keyboard claim.
      if (control && keyboardNavigation) return false;
      // A clicked panel button may keep focus after the pointer returns to the
      // scene. The hand tool must not require an extra canvas click in that case.
      if (viewport.matches(":hover")) return true;
      if (control) return false;
      return (
        target === document ||
        target === document.body ||
        target === document.documentElement ||
        (target instanceof Node && viewport.contains(target))
      );
    };
    let claimed = false;
    const cancel = (): void => {
      claimed = false;
      setPressed(false);
      onCancel();
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Tab" || event.key.startsWith("Arrow")) {
        keyboardNavigation = true;
      }
      if (
        (event.code !== "Space" && event.key !== " ") ||
        event.defaultPrevented || event.isComposing ||
        event.altKey || event.ctrlKey || event.metaKey ||
        !isCanvasKeyboardTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      claimed = true;
      setPressed(true);
    };
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.code !== "Space" && event.key !== " ") return;
      if (claimed) {
        event.preventDefault();
        event.stopPropagation();
      }
      claimed = false;
      setPressed(false);
    };
    const handleFocus = (event: FocusEvent): void => {
      if (!isCanvasKeyboardTarget(event.target)) cancel();
    };
    const handleVisibility = (): void => {
      if (document.hidden) cancel();
    };
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keyup", handleKeyUp, true);
    document.addEventListener("focusin", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    window?.addEventListener("blur", cancel);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keyup", handleKeyUp, true);
      document.removeEventListener("focusin", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      window?.removeEventListener("blur", cancel);
    };
  }, [draggable, onCancel, viewportRef]);

  return draggable && pressed;
}
