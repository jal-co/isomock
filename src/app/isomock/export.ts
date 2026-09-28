import type { ToolcraftProductExportRenderer } from "@/toolcraft/runtime";

import { createIsomockCamera } from "./camera";
import {
  createIsomockGlRenderer,
  getIsomockDisplayAspect,
  type IsomockGlRenderer,
} from "./gl-renderer";
import { exportRenderPass, sourceDecodePass } from "./pipeline";
import { readIsomockSettings } from "./settings";
import {
  decodeIsomockSource,
  findIsomockSource,
  getIsomockSourceTransform,
  getIsomockTextureSource,
  loadIsomockVideo,
  seekIsomockVideo,
} from "./source";

let exportRenderer: IsomockGlRenderer | null = null;
const getExportRenderer = () => {
  exportRenderer ??= createIsomockGlRenderer(new OffscreenCanvas(1, 1));
  return exportRenderer;
};

const jobVideos = new WeakMap<AbortSignal, Promise<HTMLVideoElement>>();

function getJobVideo(signal: AbortSignal, url: string) {
  let video = jobVideos.get(signal);
  if (!video) {
    video = loadIsomockVideo(url);
    jobVideos.set(signal, video);
  }
  return video;
}

export const isomockExportRenderer: ToolcraftProductExportRenderer = {
  baseFileName: "isomock",
  async renderFrame({
    context,
    frame,
    pixelRatio,
    rendererPipeline,
    signal,
    state,
    timeSeconds,
  }) {
    const asset = findIsomockSource(state.mediaAssets);
    if (!asset) return;
    if (!rendererPipeline)
      throw new Error("Isomock export requires its renderer pipeline.");
    const decoded = await rendererPipeline.runPass(
      sourceDecodePass,
      {
        "source.presentationUrl": null,
        "source.resourceRef": asset.resourceRef,
      },
      (passContext) => decodeIsomockSource(passContext, asset, undefined),
    );
    signal.throwIfAborted();
    if (!decoded) return;

    let video: HTMLVideoElement | null = null;
    if (decoded.kind === "video") {
      video = await getJobVideo(signal, decoded.url);
      await seekIsomockVideo(video, timeSeconds % decoded.duration);
      signal.throwIfAborted();
    }
    const source = getIsomockTextureSource(decoded, video);
    const transform = getIsomockSourceTransform(asset);
    const width = Math.max(1, Math.round(frame.width * pixelRatio));
    const height = Math.max(1, Math.round(frame.height * pixelRatio));
    await rendererPipeline.runPass(exportRenderPass, undefined, () => {
      const renderer = getExportRenderer();
      try {
        const settings = readIsomockSettings(state.values);
        renderer.render({
          camera: createIsomockCamera(
            settings,
            getIsomockDisplayAspect(source, transform),
            frame.width / frame.height,
          ),
          height,
          settings,
          source,
          transform,
          width,
        });
        context.drawImage(
          renderer.canvas,
          frame.x,
          frame.y,
          frame.width,
          frame.height,
        );
      } finally {
        renderer.clear(1, 1);
      }
    });
  },
};
