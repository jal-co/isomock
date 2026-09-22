import type { ToolcraftMediaBatchImportAsset } from "../state/types";
import type { ToolcraftBinaryAssetLease } from "./repository/binary-asset-repository";
import type {
  ToolcraftPreparedSourceAsset,
  ToolcraftPreparedSourceAssetRecord,
  ToolcraftSourceAssetRegistrableHandler,
} from "./source-asset-types";

type PreparedAsset = ToolcraftPreparedSourceAssetRecord<"file" | "image" | "model">;

export function validateToolcraftSourceAssetPlan(
  plan: ReturnType<ToolcraftSourceAssetRegistrableHandler["plan"]>,
): void {
  if (
    !Number.isSafeInteger(plan.logicalAssetCount) ||
    plan.logicalAssetCount <= 0
  ) {
    throw new Error("Source asset import plan must contain a positive asset count");
  }
  if (plan.target.length === 0 || plan.target.trim() !== plan.target) {
    throw new Error("Source asset import plan target must be a non-empty trimmed string");
  }
  if (
    plan.sourceTarget !== undefined &&
    (plan.sourceTarget.length === 0 ||
      plan.sourceTarget.trim() !== plan.sourceTarget)
  ) {
    throw new Error(
      "Source asset import plan sourceTarget must be a non-empty trimmed string",
    );
  }
}

export function validateToolcraftPreparedSourceAssets(
  prepared: ToolcraftPreparedSourceAsset<PreparedAsset>,
  expectedKind: PreparedAsset["assetKind"],
  expectedAssetCount: number,
  lease: ToolcraftBinaryAssetLease,
): void {
  if (prepared.assets.length !== expectedAssetCount) {
    throw new Error(
      `Source asset handler prepared ${prepared.assets.length} assets; expected ${expectedAssetCount}.`,
    );
  }

  for (const asset of prepared.assets) {
    if (asset.assetKind !== expectedKind) {
      throw new Error(
        `Source asset handler "${expectedKind}" prepared asset kind "${asset.assetKind}".`,
      );
    }
    if (
      Object.prototype.hasOwnProperty.call(asset, "id") ||
      Object.prototype.hasOwnProperty.call(asset, "layerId")
    ) {
      throw new Error("Prepared source assets cannot contain final ids");
    }
  }

  const declaredRefs = [...new Set(prepared.stagedResourceRefs)].sort();
  const leasedRefs = [...lease.refs()].sort();
  if (
    declaredRefs.length !== prepared.stagedResourceRefs.length ||
    declaredRefs.length !== leasedRefs.length ||
    declaredRefs.some((ref, index) => ref !== leasedRefs[index])
  ) {
    throw new Error(
      "Prepared source asset refs must exactly match the repository lease",
    );
  }
}

export function freezeToolcraftPreparedAssetDraft(
  asset: PreparedAsset,
  sourceTarget?: string,
): ToolcraftMediaBatchImportAsset {
  if (asset.assetKind === "image") {
    const {
      sourceTarget: _handlerSourceTarget,
      ...assetWithoutSourceTarget
    } = asset;
    return Object.freeze({
      asset: Object.freeze({
        ...assetWithoutSourceTarget,
        position: Object.freeze({ ...asset.position }),
        sourceSize: Object.freeze({ ...asset.sourceSize }),
        ...(sourceTarget ? { sourceTarget } : {}),
        ...(asset.transform
          ? { transform: Object.freeze({ ...asset.transform }) }
          : {}),
      }),
      policy: "prepared-source",
    });
  }
  if (asset.assetKind === "file") {
    const {
      sourceTarget: _handlerSourceTarget,
      ...assetWithoutSourceTarget
    } = asset;
    return Object.freeze({
      ...assetWithoutSourceTarget,
      position: Object.freeze({ ...asset.position }),
      ...(sourceTarget ? { sourceTarget } : {}),
    });
  }

  const {
    sourceTarget: _handlerSourceTarget,
    ...assetWithoutSourceTarget
  } = asset;
  return Object.freeze({
    ...assetWithoutSourceTarget,
    position: Object.freeze({ ...asset.position }),
    size: Object.freeze({ ...asset.size }),
    ...(sourceTarget ? { sourceTarget } : {}),
  });
}
