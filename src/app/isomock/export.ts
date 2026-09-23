import type { ToolcraftProductExportRenderer } from "@/toolcraft/runtime";

import { createIsomockCamera } from "./camera";
import {
  createIsomockGlRenderer,
  getIsomockDisplayAspect,
} from "./gl-renderer";
import { exportRenderPass, sourceDecodePass } from "./pipeline";
import { readIsomockSettings } from "./settings";
import { decodeIsomockSource, findIsomockSource } from "./source";

export const isomockExportRenderer: ToolcraftProductExportRenderer = {
  baseFileName: "isomock",
  async renderFrame({
    context,
    frame,
    pixelRatio,
    rendererPipeline,
    signal,
    state,
  }) {
    const source = findIsomockSource(state.mediaAssets);
    if (!source) return;
    if (!rendererPipeline)
      throw new Error("Isomock export requires its renderer pipeline.");
    const bitmap = await rendererPipeline.runPass(
      sourceDecodePass,
      {
        "source.presentationUrl": null,
        "source.resourceRef": source.resourceRef,
      },
      (passContext) =>
        decodeIsomockSource(passContext, source.resourceRef, undefined),
    );
    signal.throwIfAborted();
    if (!bitmap) return;

    const width = Math.max(1, Math.round(frame.width * pixelRatio));
    const height = Math.max(1, Math.round(frame.height * pixelRatio));
    await rendererPipeline.runPass(exportRenderPass, undefined, () => {
      const canvas = new OffscreenCanvas(width, height);
      const renderer = createIsomockGlRenderer(canvas, { disposable: true });
      try {
        const settings = readIsomockSettings(state.values);
        renderer.render({
          camera: createIsomockCamera(
            settings,
            getIsomockDisplayAspect(bitmap, source.transform),
            frame.width / frame.height,
          ),
          height,
          settings,
          source: bitmap,
          transform: source.transform,
          width,
        });
        context.drawImage(canvas, frame.x, frame.y, frame.width, frame.height);
      } finally {
        renderer.dispose();
      }
    });
  },
};
