import type { ToolcraftControlSchema } from "../schema/types";
import type { ToolcraftCanvasFrame } from "../state/canvas-frame";
import type {
  ToolcraftMediaAssetDraft,
  ToolcraftPreparedSourceImageAssetDraft,
} from "../state/types";
import type { ToolcraftBinaryAssetPutOptions } from "./repository/binary-asset-repository";

export type ToolcraftSourceAssetKind = "file" | "image" | "model";

export type ToolcraftSourceAssetFeedback = {
  category:
    | "bundle"
    | "format"
    | "geometry"
    | "repair"
    | "resource-limit"
    | "resource-unavailable"
    | "topology";
  code: string;
  message: string;
};

export type ToolcraftSourceAssetBatch = {
  files: readonly File[];
  origin: "canvas" | "panel";
  position?: { x: number; y: number };
  target?: string;
};

export type ToolcraftSourceAssetClaim = {
  handlerKind: ToolcraftSourceAssetKind;
  rootFileNames: readonly string[];
  specificity: number;
};

export type ToolcraftSourceAssetSelection =
  | {
      claim: ToolcraftSourceAssetClaim;
      control: ToolcraftControlSchema;
      kind: "selected";
    }
  | { feedback: ToolcraftSourceAssetFeedback; kind: "ambiguous" }
  | { kind: "none" };

export type ToolcraftSourceAssetImportPlan = {
  claim: ToolcraftSourceAssetClaim;
  logicalAssetCount: number;
  replaceExisting: boolean;
  sourceTarget?: string;
  target: string;
};

export type ToolcraftSourceAssetOperationPhase =
  | "analyzing"
  | "decoding"
  | "extracting"
  | "idle"
  | "repairing"
  | "staging";

export type ToolcraftSourceAssetOperation = {
  feedback?: ToolcraftSourceAssetFeedback;
  jobId?: string;
  phase: ToolcraftSourceAssetOperationPhase;
  progress?: number;
  presentationFeedback?: ToolcraftSourceAssetFeedback;
  stagedDocumentRef?: string;
  target: string;
};

export type ToolcraftSourceAssetOperationUpdate = Pick<
  ToolcraftSourceAssetOperation,
  "phase"
> &
  Partial<
    Pick<
      ToolcraftSourceAssetOperation,
      "feedback" | "progress" | "stagedDocumentRef"
    >
  >;

type ToolcraftPreparedDraft<
  Draft,
  Kind extends ToolcraftSourceAssetKind,
> = Draft extends { assetKind: Kind }
  ? Omit<Draft, "id" | "layerId">
  : never;

type ToolcraftPreparedSourceAssetDraft =
  | Exclude<ToolcraftMediaAssetDraft, { assetKind: "image" }>
  | ToolcraftPreparedSourceImageAssetDraft;

export type ToolcraftPreparedSourceAssetRecord<
  Kind extends ToolcraftSourceAssetKind,
> = ToolcraftPreparedDraft<ToolcraftPreparedSourceAssetDraft, Kind>;

export type ToolcraftSourceAssetPrepareContext = {
  batch: ToolcraftSourceAssetBatch;
  canvasFrame: ToolcraftCanvasFrame;
  claim: ToolcraftSourceAssetClaim;
  control: ToolcraftControlSchema;
  jobId: string;
  plan: ToolcraftSourceAssetImportPlan;
  reportOperation: (update: ToolcraftSourceAssetOperationUpdate) => void;
  signal: AbortSignal;
  stageResource: (
    ref: string,
    bytes: Uint8Array,
    options: ToolcraftBinaryAssetPutOptions,
  ) => Promise<void>;
};

export type ToolcraftPreparedSourceAsset<
  Asset extends ToolcraftPreparedSourceAssetRecord<ToolcraftSourceAssetKind>,
> = {
  assets: readonly Asset[];
  stagedResourceRefs: readonly string[];
};

export type ToolcraftSourceAssetImportOutcome =
  | { assetIds: readonly string[]; kind: "committed" }
  | { feedback: ToolcraftSourceAssetFeedback; kind: "rejected" }
  | { kind: "cancelled" };

export type ToolcraftSourceAssetHandler<
  Kind extends ToolcraftSourceAssetKind,
  Asset extends ToolcraftPreparedSourceAssetRecord<Kind>,
> = {
  kind: Kind;
  match: (
    batch: ToolcraftSourceAssetBatch,
    control: ToolcraftControlSchema,
  ) => ToolcraftSourceAssetClaim | null;
  plan: (
    batch: ToolcraftSourceAssetBatch,
    control: ToolcraftControlSchema,
    claim: ToolcraftSourceAssetClaim,
  ) => ToolcraftSourceAssetImportPlan;
  prepare: (
    context: ToolcraftSourceAssetPrepareContext,
  ) => Promise<ToolcraftPreparedSourceAsset<Asset>>;
};

export type ToolcraftSourceAssetRegistrableHandler =
  ToolcraftSourceAssetHandler<
    ToolcraftSourceAssetKind,
    ToolcraftPreparedSourceAssetRecord<ToolcraftSourceAssetKind>
  >;

export type ToolcraftSourceAssetMatchHandler = Pick<
  ToolcraftSourceAssetRegistrableHandler,
  "kind" | "match"
>;
