"use client";

import * as React from "react";

// Owns browser-zoom suppression for the entire app, including portaled controls
// and apps without a canvas. Canvas gesture handlers still own viewport changes.
export function ToolcraftBrowserZoomBoundary({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const scopeRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;

    const options: AddEventListenerOptions = { capture: true, passive: false };
    const blockBrowserZoom = (event: Event): void => {
      event.preventDefault();
      const canvas = event.target instanceof Element
        ? event.target.closest('[data-slot="toolcraft-runtime-canvas"]')
        : null;
      if (!canvas) event.stopPropagation();
    };
    const handleWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || event.metaKey) blockBrowserZoom(event);
    };
    scope.addEventListener("wheel", handleWheel, options);
    for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
      scope.addEventListener(type, blockBrowserZoom, options);
    }
    return () => {
      scope.removeEventListener("wheel", handleWheel, options);
      for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
        scope.removeEventListener(type, blockBrowserZoom, options);
      }
    };
  }, []);

  return (
    <div data-toolcraft-input-scope="" ref={scopeRef} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
