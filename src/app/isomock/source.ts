import type {
  ToolcraftFileAsset,
  ToolcraftImageAsset,
  ToolcraftMediaAsset,
  ToolcraftRendererPipelinePassExecutionContext,
} from "@/toolcraft/runtime";

import type {
  IsomockSourceTransform,
  IsomockTextureSource,
} from "./gl-renderer";
import type { sourceDecodePass } from "./pipeline";
import { isomockTargets } from "./settings";

const maxTextureEdge = 8192;

export type IsomockSourceAsset = ToolcraftFileAsset | ToolcraftImageAsset;

export type IsomockDecodedSource =
  | Readonly<{ bitmap: ImageBitmap; kind: "image" }>
  | Readonly<{
      duration: number;
      element: HTMLVideoElement;
      kind: "video";
      url: string;
    }>;

const isReady = (asset: ToolcraftMediaAsset, target: string) =>
  asset.sourceTarget === target &&
  asset.assetKind !== "model" &&
  asset.lifecycle !== "unavailable";

export function findIsomockSource(
  mediaAssets: readonly ToolcraftMediaAsset[],
): IsomockSourceAsset | null {
  const video = mediaAssets.find(
    (asset): asset is ToolcraftFileAsset =>
      asset.assetKind === "file" && isReady(asset, isomockTargets.video),
  );
  if (video) return video;
  return (
    mediaAssets.find(
      (asset): asset is ToolcraftImageAsset =>
        asset.assetKind === "image" && isReady(asset, isomockTargets.source),
    ) ?? null
  );
}

export function getIsomockSourceTransform(
  asset: IsomockSourceAsset | null,
): IsomockSourceTransform | undefined {
  return asset?.assetKind === "image" ? asset.transform : undefined;
}

export function getIsomockTextureSource(
  source: IsomockDecodedSource,
  element: HTMLVideoElement | null = null,
): IsomockTextureSource {
  if (source.kind === "image")
    return {
      height: source.bitmap.height,
      pixels: source.bitmap,
      width: source.bitmap.width,
    };
  const pixels = element ?? source.element;
  return { height: pixels.videoHeight, pixels, width: pixels.videoWidth };
}

async function decodeImage(blob: Blob): Promise<ImageBitmap> {
  const probe = await createImageBitmap(blob);
  const longEdge = Math.max(probe.width, probe.height);
  if (longEdge <= maxTextureEdge) return probe;
  const ratio = maxTextureEdge / longEdge;
  const resized = await createImageBitmap(probe, {
    resizeHeight: Math.round(probe.height * ratio),
    resizeQuality: "high",
    resizeWidth: Math.round(probe.width * ratio),
  });
  probe.close();
  return resized;
}

export function createIsomockVideoElement(url: string): HTMLVideoElement {
  const element = document.createElement("video");
  element.muted = true;
  element.playsInline = true;
  element.preload = "auto";
  element.src = url;
  return element;
}

function waitForEvent(target: HTMLVideoElement, type: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(type, onDone);
      target.removeEventListener("error", onError);
    };
    const onDone = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("The video could not be decoded by this browser."));
    };
    target.addEventListener(type, onDone, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

export async function loadIsomockVideo(
  url: string,
): Promise<HTMLVideoElement> {
  const element = createIsomockVideoElement(url);
  if (element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
    await waitForEvent(element, "loadeddata");
  return element;
}

export async function seekIsomockVideo(
  element: HTMLVideoElement,
  timeSeconds: number,
): Promise<void> {
  const target = Math.min(
    Math.max(0, timeSeconds),
    Math.max(0, element.duration - 0.001),
  );
  if (Math.abs(element.currentTime - target) < 0.001 && !element.seeking)
    return;
  const seeked = waitForEvent(element, "seeked");
  element.currentTime = target;
  await seeked;
}

export async function readIsomockSourceFrame(
  bytes: ArrayBuffer | Uint8Array,
  mimeType: string,
  options?: ImageBitmapOptions,
): Promise<ImageBitmap> {
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  if (!mimeType.startsWith("video/")) return createImageBitmap(blob, options);
  const url = URL.createObjectURL(blob);
  try {
    return await createImageBitmap(await loadIsomockVideo(url), options);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeFromUrl(
  url: string,
  mimeType: string,
): Promise<IsomockDecodedSource> {
  const blob = await (await fetch(url)).blob();
  if (!mimeType.startsWith("video/"))
    return { bitmap: await decodeImage(blob), kind: "image" };
  const ownedUrl = URL.createObjectURL(blob);
  try {
    const element = await loadIsomockVideo(ownedUrl);
    element.loop = true;
    return {
      duration: element.duration,
      element,
      kind: "video",
      url: ownedUrl,
    };
  } catch (error) {
    URL.revokeObjectURL(ownedUrl);
    throw error;
  }
}

function disposeSource(source: IsomockDecodedSource): void {
  if (source.kind === "image") {
    source.bitmap.close();
    return;
  }
  source.element.pause();
  source.element.removeAttribute("src");
  source.element.load();
  URL.revokeObjectURL(source.url);
}

export function decodeIsomockSource(
  context: ToolcraftRendererPipelinePassExecutionContext<
    typeof sourceDecodePass
  >,
  asset: IsomockSourceAsset,
  url: string | undefined,
): Promise<IsomockDecodedSource> {
  return context.getOrCreateResource(
    [asset.resourceRef],
    () => {
      if (!url)
        throw new Error(
          "The source is still loading. Try again in a moment.",
        );
      return decodeFromUrl(url, asset.mimeType);
    },
    disposeSource,
  );
}
