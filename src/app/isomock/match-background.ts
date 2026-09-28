import type { ToolcraftPanelActionHandler } from "@/toolcraft/runtime/react";

import { createIsomockCamera, getIsomockFrameCenterFocus } from "./camera";
import { getIsomockDisplayAspect } from "./gl-renderer";
import { isomockTargets, readIsomockSettings } from "./settings";
import {
  findIsomockSource,
  getIsomockSourceTransform,
  readIsomockSourceFrame,
} from "./source";

export const matchBackgroundAction = "isomock.match-background";
export const centerFocusAction = "isomock.center-focus";
export const resetRotationAction = "isomock.reset-rotation";

const sampleEdge = 64;

export function medianEdgeColor(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): string {
  const channels: [number[], number[], number[]] = [[], [], []];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++)
        channels[channel].push(pixels[index + channel]);
    }
  }
  return `#${channels
    .map((values) => {
      values.sort((a, b) => a - b);
      return values[values.length >> 1].toString(16).padStart(2, "0");
    })
    .join("")
    .toUpperCase()}`;
}

export const handleIsomockPanelAction: ToolcraftPanelActionHandler = async ({
  action,
  dispatch,
  reportFeedback,
  resolveMediaResource,
  state,
}) => {
  if (action.value === resetRotationAction) {
    dispatch({
      label: "Reset rotation",
      targets: [isomockTargets.pose],
      type: "controls.resetTargets",
    });
    return;
  }
  const source = findIsomockSource(state.mediaAssets);
  if (action.value !== centerFocusAction && action.value !== matchBackgroundAction)
    return;
  if (!source) {
    reportFeedback({
      code: "isomock-no-screenshot",
      message: "Upload a screenshot or video first.",
    });
    return;
  }
  const bytes = await resolveMediaResource(source.resourceRef, {
    signal: new AbortController().signal,
  });
  if (!bytes) {
    reportFeedback({
      code: "isomock-screenshot-unavailable",
      message: "The source is unavailable.",
    });
    return;
  }
  if (action.value === centerFocusAction) {
    const frame =
      source.assetKind === "image"
        ? source.sourceSize
        : await readIsomockSourceFrame(bytes, source.mimeType);
    const aspect = getIsomockDisplayAspect(frame, getIsomockSourceTransform(source));
    if (frame instanceof ImageBitmap) frame.close();
    const camera = createIsomockCamera(
      readIsomockSettings(state.values),
      aspect,
      state.canvas.size.width / state.canvas.size.height,
    );
    dispatch({
      label: "Center focus",
      target: isomockTargets.focusPoint,
      type: "controls.setValue",
      value: getIsomockFrameCenterFocus(camera),
    });
    return;
  }
  const bitmap = await readIsomockSourceFrame(bytes, source.mimeType, {
    resizeHeight: sampleEdge,
    resizeQuality: "medium",
    resizeWidth: sampleEdge,
  });
  const canvas = new OffscreenCanvas(sampleEdge, sampleEdge);
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("Isomock could not read the source colors.");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  dispatch({
    label: "Match background",
    target: isomockTargets.background,
    type: "controls.setValue",
    value: medianEdgeColor(
      context.getImageData(0, 0, sampleEdge, sampleEdge).data,
      sampleEdge,
      sampleEdge,
    ),
  });
};
