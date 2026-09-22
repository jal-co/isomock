import type {
  ToolcraftImageAsset,
  ToolcraftMediaAsset,
  ToolcraftRendererPipelinePassExecutionContext,
} from "@/toolcraft/runtime";

import type { sourceDecodePass } from "./pipeline";
import { isomockTargets } from "./settings";

const maxTextureEdge = 8192;

export function findIsomockSource(
  mediaAssets: readonly ToolcraftMediaAsset[],
): ToolcraftImageAsset | null {
  return (
    mediaAssets.find(
      (asset): asset is ToolcraftImageAsset =>
        asset.assetKind === "image" &&
        asset.sourceTarget === isomockTargets.source &&
        asset.lifecycle !== "unavailable",
    ) ?? null
  );
}

async function decodeFromUrl(url: string): Promise<ImageBitmap> {
  const blob = await (await fetch(url)).blob();
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

export function decodeIsomockSource(
  context: ToolcraftRendererPipelinePassExecutionContext<typeof sourceDecodePass>,
  resourceRef: string,
  url: string | undefined,
): Promise<ImageBitmap> {
  return context.getOrCreateResource(
    [resourceRef],
    () => {
      if (!url) throw new Error("The screenshot is still loading. Try again in a moment.");
      return decodeFromUrl(url);
    },
    (bitmap) => bitmap.close(),
  );
}
