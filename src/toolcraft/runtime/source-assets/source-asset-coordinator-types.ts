import type { ToolcraftControlSchema } from "../schema/types";
import type { ToolcraftMediaAsset } from "../state/types";
import type { ToolcraftSourceAssetBatch, ToolcraftSourceAssetFeedback, ToolcraftSourceAssetImportOutcome, ToolcraftSourceAssetKind, ToolcraftSourceAssetOperation } from "./source-asset-types";
import type { ToolcraftBinaryMediaHydrationJob } from "./binary-media-hydration";
import type { ToolcraftDefaultResourceUpload } from "./default-resource-capture";

export type ToolcraftSourceAssetCoordinator = {
  cancelTarget: (target: string) => void;
  captureDefaultResources?: (assets: readonly ToolcraftMediaAsset[]) => Promise<readonly ToolcraftDefaultResourceUpload[]>;
  clearPresentationFeedback: (target: string) => void;
  dispose: () => Promise<void>;
  getOperation: (target: string) => ToolcraftSourceAssetOperation;
  supportsKind: (kind: ToolcraftSourceAssetKind) => boolean;
  hydrateModels: () => Promise<void>;
  hydrateBinaryMedia: (
    jobs: readonly ToolcraftBinaryMediaHydrationJob[],
  ) => Promise<void>;
  importBatch: (
    batch: ToolcraftSourceAssetBatch,
    control?: ToolcraftControlSchema,
  ) => Promise<ToolcraftSourceAssetImportOutcome>;
  repairModel: (
    assetId: string,
  ) => Promise<ToolcraftSourceAssetImportOutcome>;
  reportPresentationFeedback: (
    target: string,
    feedback: ToolcraftSourceAssetFeedback,
  ) => void;
  retainResourceRef?: (ref: string) => () => void;
  resolveSettingsAsset?: (asset: ToolcraftMediaAsset) => Promise<ToolcraftMediaAsset | null>;
  resolveResource?: (
    ref: string,
    options: Readonly<{ signal: AbortSignal; }>,
  ) => Promise<Uint8Array | null>;
  subscribe: (listener: () => void) => () => void;
};

export type ToolcraftModelRepairCoordinator = Pick<
  ToolcraftSourceAssetCoordinator,
  "repairModel"
>;
