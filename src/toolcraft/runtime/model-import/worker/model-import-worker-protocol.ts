import type {
  ToolcraftModelFormat,
  ToolcraftModelImportLimits,
  ToolcraftModelTopologyProfile,
} from "../../schema/types";
import type { ToolcraftSourceAssetFeedback } from "../../source-assets/source-asset-types";
import type {
  ToolcraftModelAppearanceResource,
  ToolcraftModelDiagnostic,
  ToolcraftModelSourceBundleTransfer,
  ToolcraftModelWorkerAnalysisSummary,
} from "../model-import-types";
import type { ToolcraftExtractedModelPackageEntry } from "../model-package-types";
import { TOOLCRAFT_MODEL_REPAIR_ALGORITHM_VERSION } from "../topology/model-repair-plan";
import { TOOLCRAFT_MODEL_TOPOLOGY_ANALYZER_VERSION } from "../topology/model-topology-analysis";

export const TOOLCRAFT_MODEL_CANONICAL_SCHEMA_VERSION = 2;
export const TOOLCRAFT_MODEL_WORKER_DIAGNOSTIC_CODE_MAX_LENGTH = 80;
export const TOOLCRAFT_MODEL_WORKER_DIAGNOSTIC_EXPLANATION_MAX_LENGTH = 512;
export const TOOLCRAFT_MODEL_WORKER_DIAGNOSTIC_ID_MAX_LENGTH = 1_024;
export const TOOLCRAFT_MODEL_WORKER_FEEDBACK_MAX_LENGTH = 240;
export const TOOLCRAFT_MODEL_WORKER_MAX_DIAGNOSTICS = 512;

export type ToolcraftModelImportWorkerPayload = Readonly<{
  adapterVersion: string;
  bundle: ToolcraftModelSourceBundleTransfer;
  format: ToolcraftModelFormat;
  geometryDecoderVersion: string;
  limits: ToolcraftModelImportLimits;
  topologyProfile: ToolcraftModelTopologyProfile;
}>;

export type ToolcraftModelRepairWorkerPayload = Readonly<{
  canonicalDocument: ArrayBuffer;
  canonicalDocumentDigest: string;
  limits: ToolcraftModelImportLimits;
  repairPlanEnvelope: ToolcraftModelRepairPlanEnvelope;
}>;

export type ToolcraftModelPackageExtractWorkerPayload = Readonly<{
  archive: ArrayBuffer;
  archiveDigest: string;
  limits: ToolcraftModelImportLimits;
}>;

export type ToolcraftModelRepairPlanEnvelope = Readonly<{
  bytes: ArrayBuffer;
  envelopeDigest: string;
  planDigest: string;
  version: 1;
}>;

type WorkerMessageIdentity = Readonly<{
  generation: number;
  jobId: string;
}>;

export type ToolcraftModelWorkerRequest = WorkerMessageIdentity & (
  | Readonly<{ kind: "cancel" }>
  | Readonly<{
      kind: "decode-and-analyze";
      payload: ToolcraftModelImportWorkerPayload;
    }>
  | Readonly<{
      kind: "extract-model-package";
      payload: ToolcraftModelPackageExtractWorkerPayload;
    }>
  | Readonly<{ kind: "repair"; payload: ToolcraftModelRepairWorkerPayload }>
);

export type ToolcraftModelDecodeAnalyzeWorkerResult = Readonly<{
  analysis: ToolcraftModelWorkerAnalysisSummary;
  appearanceResources: readonly ToolcraftModelAppearanceResource[];
  canonicalDocument: ArrayBuffer;
  canonicalDocumentDigest: string;
  operation: "decode-and-analyze";
  repairPlanEnvelope?: ToolcraftModelRepairPlanEnvelope;
  receiptDigest: string;
}>;

export type ToolcraftModelRepairWorkerResult = Readonly<{
  analysis: ToolcraftModelWorkerAnalysisSummary;
  canonicalDocument: ArrayBuffer;
  canonicalDocumentDigest: string;
  operation: "repair";
  repairPlanDigest: string;
  receiptDigest: string;
}>;

export type ToolcraftModelPackageExtractWorkerResult = Readonly<{
  archiveDigest: string;
  entries: readonly ToolcraftExtractedModelPackageEntry[];
  operation: "extract-model-package";
  receiptDigest: string;
}>;

export type ToolcraftModelWorkerResult =
  | ToolcraftModelDecodeAnalyzeWorkerResult
  | ToolcraftModelRepairWorkerResult;

export type ToolcraftModelWorkerOperation =
  | ToolcraftModelWorkerResult["operation"]
  | ToolcraftModelPackageExtractWorkerResult["operation"];

export type ToolcraftModelWorkerDraft = Readonly<{
  appearanceResources: readonly ToolcraftModelAppearanceResource[];
  canonicalDocument: ArrayBuffer;
  canonicalDocumentDigest: string;
  receiptDigest: string;
}>;

export type ToolcraftModelWorkerResponse = WorkerMessageIdentity & (
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{
      draft: ToolcraftModelWorkerDraft;
      kind: "draft";
    }>
  | Readonly<{
      diagnostic: ToolcraftModelDiagnostic;
      kind: "diagnostic";
    }>
  | Readonly<{
      kind: "error";
      feedback: ToolcraftSourceAssetFeedback;
    }>
  | Readonly<{
      kind: "progress";
      phase: "analyzing" | "decoding" | "extracting" | "repairing";
      progress: number;
  }>
  | Readonly<{
      kind: "package-result";
      result: ToolcraftModelPackageExtractWorkerResult;
    }>
  | Readonly<{ kind: "result"; result: ToolcraftModelWorkerResult }>
);

export type ToolcraftModelWorkerTerminalResponse = Extract<
  ToolcraftModelWorkerResponse,
  { kind: "cancelled" | "error" | "package-result" | "result" }
>;

export type ToolcraftModelWorkerGeometryTerminalResponse = Extract<
  ToolcraftModelWorkerResponse,
  { kind: "cancelled" | "error" | "result" }
>;

export type ToolcraftModelWorkerPackageTerminalResponse = Extract<
  ToolcraftModelWorkerResponse,
  { kind: "cancelled" | "error" | "package-result" }
>;

function stageKey(stage: string, fields: readonly (number | string)[]): string {
  return JSON.stringify([`toolcraft-model-worker-${stage}@1`, ...fields]);
}

export function createToolcraftModelDecodeCacheKey(input: Readonly<{
  adapterVersion: string;
  format: ToolcraftModelFormat;
  geometryDecoderVersion: string;
  verifiedSourceTransferDigest: string;
}>): string {
  return stageKey("decode", [
    input.verifiedSourceTransferDigest,
    input.format,
    input.adapterVersion,
    TOOLCRAFT_MODEL_CANONICAL_SCHEMA_VERSION,
    input.geometryDecoderVersion,
  ]);
}

export function createToolcraftModelAnalysisCacheKey(input: Readonly<{
  canonicalDocumentDigest: string;
  topologyProfile: ToolcraftModelTopologyProfile;
}>): string {
  return stageKey("analysis", [
    input.canonicalDocumentDigest,
    input.topologyProfile,
    TOOLCRAFT_MODEL_TOPOLOGY_ANALYZER_VERSION,
  ]);
}

export function createToolcraftModelRepairCacheKey(input: Readonly<{
  canonicalDocumentDigest: string;
  repairPlanDigest: string;
}>): string {
  return stageKey("repair", [
    input.canonicalDocumentDigest,
    input.repairPlanDigest,
    TOOLCRAFT_MODEL_REPAIR_ALGORITHM_VERSION,
  ]);
}
