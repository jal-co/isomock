import { createToolcraftModelAppearanceResourceManifest } from "../canonical/model-appearance-resource";
import { bytesToHex, sha256 } from "../canonical/sha256";
import { TOOLCRAFT_MODEL_IMPORT_LIMIT_NAMES } from "../model-import-limit-values";
import type { ToolcraftModelWorkerAnalysisSummary } from "../model-import-types";
import type {
  ToolcraftModelDecodeAnalyzeWorkerResult,
  ToolcraftModelPackageExtractWorkerResult,
  ToolcraftModelRepairWorkerResult,
  ToolcraftModelWorkerDraft,
} from "./model-import-worker-protocol";

const RECEIPT_VERSION = 2;
const RECEIPT_PREFIX = "toolcraft-model-worker-result-receipt@2";
const DRAFT_RECEIPT_PREFIX = "toolcraft-model-worker-draft-receipt@2";
export const TOOLCRAFT_MODEL_WORKER_RECEIPT_MAX_BYTES = 8 * 1024 * 1024;
const encoder = new TextEncoder();

type DecodeResultWithoutReceipt = Omit<
  ToolcraftModelDecodeAnalyzeWorkerResult,
  "receiptDigest"
>;
type RepairResultWithoutReceipt = Omit<
  ToolcraftModelRepairWorkerResult,
  "receiptDigest"
>;
type PackageResultWithoutReceipt = Omit<
  ToolcraftModelPackageExtractWorkerResult,
  "receiptDigest"
>;

export type ToolcraftModelWorkerReceiptInput = Readonly<{
  generation: number;
  jobId: string;
  repairPlanEnvelope?: Readonly<{
    byteLength: number;
    envelopeDigest: string;
    planDigest: string;
    version: 1;
  }>;
  result:
    | DecodeResultWithoutReceipt
    | PackageResultWithoutReceipt
    | RepairResultWithoutReceipt;
}>;

export type ToolcraftModelWorkerDraftReceiptInput = Readonly<{
  draft: Omit<ToolcraftModelWorkerDraft, "receiptDigest">;
  generation: number;
  jobId: string;
}>;

function normalizedAnalysis(analysis: ToolcraftModelWorkerAnalysisSummary) {
  // Trust boundary: this fixed projection is intentionally the only metadata
  // admitted to a receipt. It never enumerates or stringifies a repair plan.
  return {
    analyzerVersion: analysis.analyzerVersion,
    diagnostics: analysis.diagnostics.map((diagnostic) => ({
      affectedCount: diagnostic.affectedCount,
      code: diagnostic.code,
      explanation: diagnostic.explanation,
      primitiveId: diagnostic.primitiveId ?? null,
      primitiveIndex: diagnostic.primitiveIndex ?? null,
      severity: diagnostic.severity,
    })),
    limits: Object.fromEntries(
      TOOLCRAFT_MODEL_IMPORT_LIMIT_NAMES.map((name) => [
        name,
        analysis.limits[name],
      ]),
    ),
    outcome: analysis.outcome,
    profile: analysis.profile,
    statistics: {
      boundaryEdgeCount: analysis.statistics.boundaryEdgeCount,
      componentCount: analysis.statistics.componentCount,
      decodedBytes: analysis.statistics.decodedBytes,
      edgeCount: analysis.statistics.edgeCount,
      estimatedPeakWorkerBytes: analysis.statistics.estimatedPeakWorkerBytes,
      estimatedRepairBytes: analysis.statistics.estimatedRepairBytes,
      nodeCount: analysis.statistics.nodeCount,
      nonManifoldEdgeCount: analysis.statistics.nonManifoldEdgeCount,
      nonManifoldVertexCount: analysis.statistics.nonManifoldVertexCount,
      primitiveCount: analysis.statistics.primitiveCount,
      triangleCount: analysis.statistics.triangleCount,
      unusedVertexCount: analysis.statistics.unusedVertexCount,
      vertexCount: analysis.statistics.vertexCount,
    },
  };
}

function envelopeFor(
  input: ToolcraftModelWorkerReceiptInput,
): ToolcraftModelWorkerReceiptInput["repairPlanEnvelope"] {
  if (input.result.operation === "extract-model-package") {
    return undefined;
  }
  const envelope = input.result.operation === "decode-and-analyze"
    ? input.result.repairPlanEnvelope
    : undefined;
  return envelope === undefined ? input.repairPlanEnvelope : {
    byteLength: envelope.bytes.byteLength,
    envelopeDigest: envelope.envelopeDigest,
    planDigest: envelope.planDigest,
    version: envelope.version,
  };
}

function encodeReceiptFrame(
  prefixValue: string,
  metadataValue: unknown,
): Uint8Array<ArrayBuffer> {
  const metadata = encoder.encode(JSON.stringify(metadataValue));
  const prefix = encoder.encode(prefixValue);
  if (8 + prefix.byteLength + metadata.byteLength >
      TOOLCRAFT_MODEL_WORKER_RECEIPT_MAX_BYTES) {
    throw new Error("Model worker receipt metadata exceeds its protected limit.");
  }
  const frame = new Uint8Array(8 + prefix.byteLength + metadata.byteLength);
  const header = new DataView(frame.buffer);
  header.setUint32(0, prefix.byteLength, true);
  header.setUint32(4, metadata.byteLength, true);
  frame.set(prefix, 8);
  frame.set(metadata, 8 + prefix.byteLength);
  return frame;
}

export function createToolcraftModelWorkerReceiptFrame(
  input: ToolcraftModelWorkerReceiptInput,
): Uint8Array<ArrayBuffer> {
  if (input.result.operation === "extract-model-package") {
    return encodeReceiptFrame(RECEIPT_PREFIX, {
      archiveDigest: input.result.archiveDigest,
      entries: input.result.entries.map((entry) => ({
        byteLength: entry.bytes.byteLength,
        compressedBytes: entry.compressedBytes,
        contentDigest: entry.contentDigest,
        mimeType: entry.mimeType,
        path: entry.path,
        uncompressedBytes: entry.uncompressedBytes,
      })),
      generation: input.generation,
      jobId: input.jobId,
      operation: input.result.operation,
      version: RECEIPT_VERSION,
    });
  }

  const envelope = envelopeFor(input);
  const planDigest = input.result.operation === "repair"
    ? input.result.repairPlanDigest
    : envelope?.planDigest ?? null;
  return encodeReceiptFrame(RECEIPT_PREFIX, {
    analysis: normalizedAnalysis(input.result.analysis),
    ...(input.result.operation === "decode-and-analyze"
      ? {
          appearanceResources: createToolcraftModelAppearanceResourceManifest(
            input.result.appearanceResources,
          ),
        }
      : {}),
    canonicalDocument: {
      byteLength: input.result.canonicalDocument.byteLength,
      digest: input.result.canonicalDocumentDigest,
    },
    generation: input.generation,
    jobId: input.jobId,
    operation: input.result.operation,
    repairPlan: envelope === undefined
      ? { envelopeByteLength: 0, envelopeDigest: null, planDigest, version: null }
      : {
          envelopeByteLength: envelope.byteLength,
          envelopeDigest: envelope.envelopeDigest,
          planDigest,
          version: envelope.version,
        },
    version: RECEIPT_VERSION,
  });
}

export function createToolcraftModelWorkerDraftReceiptFrame(
  input: ToolcraftModelWorkerDraftReceiptInput,
): Uint8Array<ArrayBuffer> {
  return encodeReceiptFrame(DRAFT_RECEIPT_PREFIX, {
    appearanceResources: createToolcraftModelAppearanceResourceManifest(
      input.draft.appearanceResources,
    ),
    canonicalDocument: {
      byteLength: input.draft.canonicalDocument.byteLength,
      digest: input.draft.canonicalDocumentDigest,
    },
    generation: input.generation,
    jobId: input.jobId,
    operation: "decode-draft",
    version: RECEIPT_VERSION,
  });
}

export function digestToolcraftModelWorkerBytes(
  value: ArrayBuffer | Uint8Array,
): string {
  const bytes = value instanceof Uint8Array
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    : new Uint8Array(value);
  return `sha256:${bytesToHex(sha256(bytes))}`;
}

export function createToolcraftModelWorkerReceiptDigest(
  input: ToolcraftModelWorkerReceiptInput,
): string {
  return digestToolcraftModelWorkerBytes(
    createToolcraftModelWorkerReceiptFrame(input),
  );
}

export function createToolcraftModelWorkerDraftReceiptDigest(
  input: ToolcraftModelWorkerDraftReceiptInput,
): string {
  return digestToolcraftModelWorkerBytes(
    createToolcraftModelWorkerDraftReceiptFrame(input),
  );
}
