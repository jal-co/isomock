import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import {
  createToolcraftDataUrlResourceRef,
  type ToolcraftBinaryMediaKind,
} from "./media-resource-ref";

export type ToolcraftBinaryMediaHydrationJob = {
  assetId: string;
  dataUrl: string;
  kind: ToolcraftBinaryMediaKind;
  mimeType: string;
  resourceRef: string;
};

export function getToolcraftBinaryMediaHydrationKey(
  assetId: string,
  resourceRef: string,
): string {
  return `${assetId}\u0000${resourceRef}`;
}

export function createToolcraftDefaultBinaryMediaHydrationJobs(
  schema: ResolvedToolcraftAppSchema,
): ToolcraftBinaryMediaHydrationJob[] {
  return schema.media.defaultAssets.flatMap((asset, index) => {
    if (asset.assetKind === "model") {
      return [];
    }

    const kind = asset.assetKind === "file" ? "file" : "image";

    return [
      {
        assetId: asset.id ?? `default-media-${index + 1}`,
        dataUrl: asset.dataUrl,
        kind,
        mimeType:
          asset.mimeType ??
          (kind === "file" ? "application/octet-stream" : "image/*"),
        resourceRef: createToolcraftDataUrlResourceRef(kind, asset.dataUrl),
      },
    ];
  });
}
