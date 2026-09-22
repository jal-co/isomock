import type { ToolcraftPanelActionHandler } from "@/toolcraft/runtime/react";

import { isomockTargets } from "./settings";
import { findIsomockSource } from "./source";

export const matchBackgroundAction = "isomock.match-background";

const sampleEdge = 64;

export function medianEdgeColor(pixels: Uint8ClampedArray, width: number, height: number): string {
  const channels: [number[], number[], number[]] = [[], [], []];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) channels[channel].push(pixels[index + channel]);
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
  if (action.value !== matchBackgroundAction) return;
  const source = findIsomockSource(state.mediaAssets);
  if (!source) {
    reportFeedback({ code: "isomock-no-screenshot", message: "Upload a screenshot first." });
    return;
  }
  const bytes = await resolveMediaResource(source.resourceRef, { signal: new AbortController().signal });
  if (!bytes) {
    reportFeedback({ code: "isomock-screenshot-unavailable", message: "The screenshot is unavailable." });
    return;
  }
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]), {
    resizeHeight: sampleEdge,
    resizeQuality: "medium",
    resizeWidth: sampleEdge,
  });
  const canvas = new OffscreenCanvas(sampleEdge, sampleEdge);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Isomock could not read the screenshot colors.");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  dispatch({
    label: "Match background",
    target: isomockTargets.background,
    type: "controls.setValue",
    value: medianEdgeColor(context.getImageData(0, 0, sampleEdge, sampleEdge).data, sampleEdge, sampleEdge),
  });
};
