import { isToolcraftDefaultModelPlaceholder } from "../model-import/default-model-source-assets";
import { readMediaAssets } from "./persistence-reader-media";
import type { ToolcraftMediaAsset, ToolcraftModelAsset } from "./types";

function unavailableModelSnapshot(): never {
  throw new DOMException(
    "Model resources do not yet have valid durable persistence provenance.",
    "InvalidStateError",
  );
}

export function projectToolcraftPersistedModel(
  asset: ToolcraftMediaAsset,
): ToolcraftMediaAsset {
  if (
    asset.assetKind !== "model" ||
    (asset.lifecycle !== "restoring" && asset.lifecycle !== "unavailable")
  ) {
    return asset;
  }

  // Default placeholders have no durable documents, even after import fails.
  if (
    isToolcraftDefaultModelPlaceholder({ ...asset, lifecycle: "restoring" })
  ) {
    return unavailableModelSnapshot();
  }

  const projected: ToolcraftModelAsset = {
    ...asset,
    lifecycle:
      asset.appliedRepairRecipeId || asset.repairedDocumentRef
        ? "fixed"
        : asset.analysis.outcome === "repairable"
          ? "repairable"
          : "clean",
  };
  // Resource availability is session state, not a failed durable repair.
  if (asset.lifecycle === "unavailable") delete projected.lastRepairError;

  // The current reader remains the authority for complete repair provenance.
  // Reject before storage writes instead of inventing a recoverable lifecycle.
  if (!readMediaAssets([projected])) return unavailableModelSnapshot();
  return projected;
}
