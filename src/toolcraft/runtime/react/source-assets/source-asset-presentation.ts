import type { ToolcraftControlSchema } from "../../schema/types";
import type { ToolcraftMediaAsset, ToolcraftModelAsset } from "../../state/types";
import type {
  ToolcraftSourceAssetKind,
  ToolcraftSourceAssetOperation,
} from "../../source-assets/source-asset-types";
import type {
  ToolcraftFileDropPresentation,
  ToolcraftFileDropPresentationStatus,
} from "./source-asset-presentation-types";

const IMAGE_ACCEPT = "PNG, JPEG, GIF, SVG, WebP";

const IMAGE_TRANSFORM_ACTIONS = [
  {
    ariaLabel: "90° Right",
    icon: "rotate-cw" as const,
    label: "90°",
    value: "rotate-right",
  },
  {
    ariaLabel: "Flip horizontal",
    icon: "flip-horizontal" as const,
    label: "Flip H",
    value: "flip-horizontal",
  },
  {
    ariaLabel: "Flip vertical",
    icon: "flip-vertical" as const,
    label: "Flip V",
    value: "flip-vertical",
  },
] as const;

const MODEL_REPAIR_ACTION_VALUE = "model.fix";

function createModelRepairActions(
  assets: readonly ToolcraftMediaAsset[],
  operation: ToolcraftSourceAssetOperation,
) {
  const repairableAsset = assets.find(
    (asset) => asset.assetKind === "model" && asset.lifecycle === "repairable",
  );
  if (!repairableAsset) return [];

  const repairing = operation.phase === "repairing";
  return [
    {
      ariaLabel: "Repair model geometry",
      icon: "wand-sparkles" as const,
      label: "Fix model",
      state: repairing
        ? {
            disabled: true,
            loading: true,
            loadingAriaLabel: "Fixing model",
          }
        : undefined,
      value: MODEL_REPAIR_ACTION_VALUE,
    },
  ];
}

const OPERATION_LABELS: Record<Exclude<ToolcraftSourceAssetOperation["phase"], "idle">, string> = {
  analyzing: "Analyzing files",
  decoding: "Decoding files",
  extracting: "Extracting archive",
  repairing: "Repairing asset",
  staging: "Preparing files",
};

function matchesControlTarget(
  asset: ToolcraftMediaAsset,
  control: ToolcraftControlSchema,
): boolean {
  return asset.sourceTarget === undefined || asset.sourceTarget === control.target;
}

function createStatus(
  operation: ToolcraftSourceAssetOperation,
): ToolcraftFileDropPresentationStatus | undefined {
  if (operation.phase === "idle") {
    return undefined;
  }

  return {
    label: OPERATION_LABELS[operation.phase],
    phase: operation.phase,
    ...(operation.progress === undefined ? {} : { progress: operation.progress }),
  };
}

function createModelPersistenceStatus(
  assets: readonly ToolcraftMediaAsset[],
): ToolcraftFileDropPresentationStatus | undefined {
  return assets.some((asset) => asset.assetKind === "model" && asset.lifecycle === "restoring")
    ? { label: "Restoring model", phase: "analyzing" }
    : undefined;
}

function getModelPersistenceFeedback(assets: readonly ToolcraftMediaAsset[]) {
  return assets.find(
    (asset): asset is ToolcraftModelAsset =>
      asset.assetKind === "model" && asset.lifecycle === "unavailable",
  )?.lastRepairError;
}

function getModelDiagnosticFeedback(assets: readonly ToolcraftMediaAsset[]) {
  const diagnostic = assets
    .find((asset): asset is ToolcraftModelAsset => asset.assetKind === "model")
    ?.analysis.diagnostics.find(({ severity }) => severity === "warning");

  return diagnostic
    ? {
        category: "format" as const,
        code: diagnostic.code,
        message: diagnostic.explanation,
      }
    : undefined;
}

export function createToolcraftSourceAssetPresentation(
  kind: ToolcraftSourceAssetKind,
  control: ToolcraftControlSchema,
  mediaAssets: readonly ToolcraftMediaAsset[],
  operation: ToolcraftSourceAssetOperation,
): ToolcraftFileDropPresentation {
  const assets = mediaAssets.filter(
    (asset) => asset.assetKind === kind && matchesControlTarget(asset, control),
  );
  const items = assets.map((asset) => ({
    alt: asset.fileName,
    assetKind: asset.assetKind,
    fileName: asset.fileName,
    id: asset.id,
    ...(asset.assetKind === "image"
      ? {
          size: asset.sourceSize,
          transform: asset.transform,
        }
      : {}),
  }));
  const presenter =
    kind === "file"
      ? "file-list"
      : kind === "model"
        ? "model-item"
        : control.multiple === true && items.length > 1
          ? "image-grid"
          : "single-image";
  const persistenceStatus = kind === "model" ? createModelPersistenceStatus(assets) : undefined;
  const feedback =
    operation.feedback ??
    operation.presentationFeedback ??
    (kind === "model"
      ? (getModelPersistenceFeedback(assets) ?? getModelDiagnosticFeedback(assets))
      : undefined);
  const status = createStatus(operation) ?? persistenceStatus;

  return {
    accept: control.accept ?? (kind === "image" ? IMAGE_ACCEPT : ""),
    // A model remains one logical runtime asset even when its source bundle
    // contains a root .gltf file plus external buffers.
    allowsFileBatch: kind === "model" || control.multiple === true,
    allowsFolderSelection: kind === "model",
    emptyDescription: "or drag it onto the canvas",
    emptyTitle:
      kind === "image"
        ? "Click to upload an image"
        : kind === "model"
          ? "Click to upload a model"
          : "Click to upload a file",
    ...(feedback ? { feedback } : {}),
    items,
    presenter,
    secondaryActions:
      kind === "image" && items.length > 0
        ? IMAGE_TRANSFORM_ACTIONS
        : kind === "model"
          ? createModelRepairActions(assets, operation)
          : [],
    ...(status ? { status } : {}),
  };
}
