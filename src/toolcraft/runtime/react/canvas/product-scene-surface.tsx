"use client";

import * as React from "react";

import {
  getToolcraftFiniteArtboardRect,
  resolveToolcraftProductSceneFrame,
  toolcraftProductSceneFramesEqual,
  type ToolcraftProductSceneBoundsProvider,
  type ToolcraftProductSceneFrame,
} from "../../scene";
import type { ToolcraftCanvasFrame } from "../../state/canvas-frame";
import type { ToolcraftState } from "../../state/types";
import { useToolcraftCommittedSelector } from "../app-shell/toolcraft-selectors";

export type { ToolcraftProductSceneFrame } from "../../scene";

const ProductSceneFrameContext =
  React.createContext<ToolcraftProductSceneFrame | null>(null);
const ProductSceneBoundsContext =
  React.createContext<ToolcraftProductSceneBoundsProvider | undefined>(
    undefined,
  );

export function useToolcraftProductSceneFrame(): ToolcraftProductSceneFrame {
  const frame = React.useContext(ProductSceneFrameContext);
  if (!frame) {
    throw new Error(
      "useToolcraftProductSceneFrame must be used inside Toolcraft product scene content.",
    );
  }
  return frame;
}

export function ToolcraftProductSceneBoundsBoundary({
  boundsProvider,
  children,
}: Readonly<{
  boundsProvider?: ToolcraftProductSceneBoundsProvider;
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <ProductSceneBoundsContext.Provider value={boundsProvider}>
      {children}
    </ProductSceneBoundsContext.Provider>
  );
}

export function ToolcraftProductSceneSurface({
  children,
  frame,
}: Readonly<{
  children: React.ReactNode;
  frame: ToolcraftCanvasFrame;
}>): React.JSX.Element {
  const boundsProvider = React.useContext(ProductSceneBoundsContext);
  const fallbackRect = React.useMemo(
    () =>
      !boundsProvider && frame.kind === "finite"
        ? getToolcraftFiniteArtboardRect(frame.size)
        : undefined,
    [boundsProvider, frame],
  );
  const selectProductFrame = React.useCallback(
    (state: ToolcraftState) =>
      resolveToolcraftProductSceneFrame({
        boundsProvider,
        fallbackRect,
        state,
      }),
    [boundsProvider, fallbackRect],
  );
  const productFrame = useToolcraftCommittedSelector(
    selectProductFrame,
    toolcraftProductSceneFramesEqual,
  );
  const readyRect = productFrame.kind === "ready" ? productFrame.rect : null;

  return (
    <ProductSceneFrameContext.Provider value={productFrame}>
      <div
        className={readyRect ? "absolute" : "contents"}
        data-toolcraft-product-scene=""
        data-toolcraft-product-scene-status={productFrame.kind}
        style={
          readyRect
            ? {
                height: readyRect.height,
                left: readyRect.x,
                top: readyRect.y,
                width: readyRect.width,
              }
            : undefined
        }
      >
        {children}
      </div>
    </ProductSceneFrameContext.Provider>
  );
}
