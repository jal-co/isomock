import {
  normalizeToolcraftImageAssetGeometry,
  type ToolcraftImageAssetGeometryContext,
} from "./image-asset-geometry";
import type {
  ToolcraftImageAssetIngress,
  ToolcraftMediaAssetDraft,
  ToolcraftMediaBatchImportAsset,
} from "./types";

function isImageIngress(
  ingress: ToolcraftMediaBatchImportAsset,
): ingress is ToolcraftImageAssetIngress {
  return "policy" in ingress;
}

export function normalizeToolcraftMediaImportIngress(
  assets: readonly ToolcraftMediaBatchImportAsset[],
  context: ToolcraftImageAssetGeometryContext,
): ToolcraftMediaAssetDraft[] {
  return assets.map((ingress) =>
    isImageIngress(ingress)
      ? normalizeToolcraftImageAssetGeometry(ingress, context)
      : ingress,
  );
}
