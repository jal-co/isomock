import type { ToolcraftControlSchema } from "../schema/types";
import type {
  ToolcraftSourceAssetBatch,
  ToolcraftSourceAssetClaim,
  ToolcraftSourceAssetImportPlan,
} from "./source-asset-types";

export function snapshotToolcraftSourceAssetBatch(
  batch: ToolcraftSourceAssetBatch,
): ToolcraftSourceAssetBatch {
  const files = Object.freeze([...batch.files]);
  const position = batch.position
    ? Object.freeze({ ...batch.position })
    : undefined;

  return Object.freeze({
    files,
    origin: batch.origin,
    ...(position ? { position } : {}),
    ...(batch.target === undefined ? {} : { target: batch.target }),
  });
}

export function snapshotToolcraftSourceAssetControl(
  control: ToolcraftControlSchema | undefined,
): ToolcraftControlSchema | undefined {
  if (!control) return undefined;
  if (control.assetKind !== "model") {
    return Object.freeze({ ...control });
  }

  return Object.freeze({
    ...control,
    ...(control.modelFormats
      ? { modelFormats: Object.freeze([...control.modelFormats]) }
      : {}),
    ...(control.modelLimits
      ? { modelLimits: Object.freeze({ ...control.modelLimits }) }
      : {}),
  });
}

export function createCanonicalToolcraftSourceAssetPlan({
  claim,
  control,
  handlerPlan,
  usesDirectCanvasFallback,
}: {
  claim: ToolcraftSourceAssetClaim;
  control: ToolcraftControlSchema;
  handlerPlan: ToolcraftSourceAssetImportPlan;
  usesDirectCanvasFallback: boolean;
}): ToolcraftSourceAssetImportPlan {
  return Object.freeze({
    claim,
    logicalAssetCount: handlerPlan.logicalAssetCount,
    replaceExisting: usesDirectCanvasFallback
      ? true
      : handlerPlan.replaceExisting,
    ...(usesDirectCanvasFallback ? {} : { sourceTarget: control.target }),
    target: handlerPlan.target,
  });
}
