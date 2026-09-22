"use client";
import type { ReadonlyToolcraftState } from "../../state/readonly-state";

import * as React from "react";

import type {
  ToolcraftCommand,
  ToolcraftImageAsset,
  ToolcraftMediaAsset,
} from "../../state/types";
import { getToolcraftSceneElementRect } from "../../scene";
import { getCanvasMediaTransformStyle } from "./canvas-media-transform";
import { isToolcraftLayerVisibleInTree } from "../layers/layer-tree";
import { useToolcraftMediaPresentationUrls } from "../app-shell/toolcraft-source-asset-context";

function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

function isDefaultCanvasImageAsset(
  state: ReadonlyToolcraftState,
  mediaAsset: ToolcraftMediaAsset,
): mediaAsset is ToolcraftImageAsset {
  return (
    mediaAsset.assetKind === "image" &&
    mediaAsset.lifecycle !== "unavailable" &&
    isToolcraftLayerVisibleInTree(state.layers, mediaAsset.layerId)
  );
}

export function getVisibleCanvasImageAssets(
  state: ReadonlyToolcraftState,
): ToolcraftImageAsset[] {
  return state.mediaAssets.filter((mediaAsset) =>
    isDefaultCanvasImageAsset(state, mediaAsset),
  );
}

export function CanvasDefaultMediaLayer({
  dispatch,
  mediaAsset,
  selected,
}: {
  dispatch: React.Dispatch<ToolcraftCommand>;
  mediaAsset: ToolcraftImageAsset;
  selected: boolean;
}): React.JSX.Element {
  const presentationRect = getToolcraftSceneElementRect(mediaAsset);
  const mediaAssets = React.useMemo(() => [mediaAsset], [mediaAsset]);
  const previewSrc = useToolcraftMediaPresentationUrls(mediaAssets).get(
    mediaAsset.id,
  );

  return (
    <button
      aria-label={`Select ${mediaAsset.fileName}`}
      className={cn(
        "absolute block cursor-pointer rounded-none border bg-[color:color-mix(in_oklab,var(--background)_84%,transparent)] p-0 shadow-sm transition-[border-color,box-shadow] duration-150 ease-out",
        "overflow-hidden",
        selected
          ? "border-[color:var(--link)] shadow-[0_0_0_1px_color-mix(in_oklab,var(--link)_48%,transparent)]"
          : "border-[color:color-mix(in_oklab,var(--border)_10%,transparent)] hover:border-[color:color-mix(in_oklab,var(--border)_24%,transparent)]",
      )}
      data-canvas-media-layer={mediaAsset.layerId}
      data-selected={selected ? "true" : "false"}
      onClick={(event) => {
        event.stopPropagation();
        dispatch({
          layerId: mediaAsset.layerId,
          type: "layers.select",
        });
      }}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        height: presentationRect.height,
        left: presentationRect.x,
        top: presentationRect.y,
        width: presentationRect.width,
        ...getCanvasMediaTransformStyle(
          mediaAsset.transform,
          mediaAsset.size,
          "element",
        ),
      }}
      type="button"
    >
      {previewSrc ? (
        <img
          alt={mediaAsset.fileName}
          className="block size-full select-none object-cover"
          data-toolcraft-generated-output=""
          draggable={false}
          src={previewSrc}
        />
      ) : null}
    </button>
  );
}
