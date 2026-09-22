import type { ToolcraftModelImportLimits } from "../../schema/types";
import type { ToolcraftSourceAssetFeedback } from "../../source-assets/source-asset-types";
import type { ToolcraftModelSourceBundleTransfer } from "../model-import-types";
import { normalizeToolcraftModelImportLimits } from "../model-import-limits";
import { getToolcraftModelRepairPlanEnvelopeByteLimit } from "../topology/model-repair-plan-envelope";
import type {
  ToolcraftModelImportWorkerPayload,
  ToolcraftModelPackageExtractWorkerPayload,
  ToolcraftModelRepairPlanEnvelope,
  ToolcraftModelRepairWorkerPayload,
} from "./model-import-worker-protocol";
import {
  copyToolcraftModelWorkerBuffers,
  inspectToolcraftModelWorkerArrayBuffer,
  inspectToolcraftModelWorkerBuffer,
  type ToolcraftModelWorkerBufferCopies,
  type ToolcraftModelWorkerBufferSource,
  type ToolcraftModelWorkerYieldToHost,
} from "./cooperative-buffer-snapshot";

const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

type ClientPreflight<Value> =
  | Readonly<{ ok: false; feedback: ToolcraftSourceAssetFeedback }>
  | Readonly<{ ok: true; value: Value }>;

type ImportFilePreflight = Readonly<{
  contentDigest: string;
  mimeType: string;
  path: string;
  source: ToolcraftModelWorkerBufferSource;
}>;

type ImportPreflight = Readonly<{
  aggregateDigest: string;
  rootPath: string;
  sourceFiles: readonly ImportFilePreflight[];
  totalByteLength: number;
}>;

type RepairPreflight = Readonly<{
  canonicalDocument: ToolcraftModelWorkerBufferSource;
  canonicalDocumentDigest: string;
  repairPlanEnvelope: Readonly<{
    envelopeDigest: string;
    planDigest: string;
    source: ToolcraftModelWorkerBufferSource;
    version: 1;
  }>;
  totalByteLength: number;
}>;

type PackageExtractPreflight = Readonly<{
  archive: ToolcraftModelWorkerBufferSource;
  archiveDigest: string;
}>;

export type ToolcraftModelWorkerImportRequestPreflight = Readonly<{
  adapterVersion: string;
  bundle: ImportPreflight;
  format: ToolcraftModelImportWorkerPayload["format"];
  geometryDecoderVersion: string;
  limits: Readonly<ToolcraftModelImportWorkerPayload["limits"]>;
  topologyProfile: ToolcraftModelImportWorkerPayload["topologyProfile"];
}>;

export type ToolcraftModelWorkerRepairRequestPreflight = Readonly<{
  inputs: RepairPreflight;
  limits: Readonly<ToolcraftModelRepairWorkerPayload["limits"]>;
}>;

export type ToolcraftModelWorkerPackageExtractRequestPreflight = Readonly<{
  input: PackageExtractPreflight;
  limits: Readonly<ToolcraftModelPackageExtractWorkerPayload["limits"]>;
}>;

export type ToolcraftModelWorkerImportSnapshot = Readonly<{
  bundle: ToolcraftModelSourceBundleTransfer;
  transfer: Transferable[];
}>;

export type ToolcraftModelWorkerRepairSnapshot = Readonly<{
  canonicalDocument: ArrayBuffer;
  canonicalDocumentDigest: string;
  repairPlanEnvelope: ToolcraftModelRepairPlanEnvelope;
  transfer: Transferable[];
}>;

export type ToolcraftModelWorkerPackageExtractSnapshot = Readonly<{
  archive: ArrayBuffer;
  archiveDigest: string;
  transfer: Transferable[];
}>;

function failure(
  category: ToolcraftSourceAssetFeedback["category"],
  code: string,
  message: string,
): ClientPreflight<never> {
  return Object.freeze({
    feedback: Object.freeze({ category, code, message }),
    ok: false,
  });
}

function success<Value>(value: Value): ClientPreflight<Value> {
  return Object.freeze({ ok: true, value });
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function sha256Digest(value: unknown): value is string {
  return typeof value === "string" && SHA256_DIGEST_PATTERN.test(value);
}

function preflightToolcraftModelWorkerImportBundle(
  bundle: ToolcraftModelSourceBundleTransfer,
  limits: Readonly<ToolcraftModelImportLimits>,
): ClientPreflight<ImportPreflight> {
  try {
    const files = bundle.sourceFiles;
    if (!Array.isArray(files) || files.length === 0 ||
        files.length > limits.maxBundleFiles) {
      return failure(
        "resource-limit",
        "bundle-file-limit-exceeded",
        "The model source bundle exceeds its file limit.",
      );
    }
    if (!nonEmptyString(bundle.aggregateDigest) || !nonEmptyString(bundle.rootPath)) {
      return failure(
        "bundle",
        "source-transfer-invalid",
        "The model source bundle metadata is invalid.",
      );
    }
    const sourceFiles: ImportFilePreflight[] = [];
    let totalByteLength = 0;
    for (let index = 0; index < files.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(files, index)) {
        return failure(
          "bundle",
          "source-transfer-invalid",
          "The model source bundle has a sparse file list.",
        );
      }
      const file = files[index]!;
      const source = inspectToolcraftModelWorkerArrayBuffer(file.bytes);
      if (!source) {
        return failure(
          "resource-unavailable",
          "source-file-buffer-invalid",
          "A model source buffer is detached, empty, or unreadable.",
        );
      }
      if (totalByteLength > limits.maxSourceBytes - source.byteLength) {
        return failure(
          "resource-limit",
          "source-byte-limit-exceeded",
          "The model source bundle exceeds its byte limit.",
        );
      }
      if (!nonEmptyString(file.path) || !nonEmptyString(file.mimeType) ||
          !sha256Digest(file.contentDigest)) {
        return failure(
          "bundle",
          "source-transfer-invalid",
          "A model source file has invalid transfer metadata.",
        );
      }
      totalByteLength += source.byteLength;
      sourceFiles.push(Object.freeze({
        contentDigest: file.contentDigest,
        mimeType: file.mimeType,
        path: file.path,
        source,
      }));
    }
    return success(Object.freeze({
      aggregateDigest: bundle.aggregateDigest,
      rootPath: bundle.rootPath,
      sourceFiles: Object.freeze(sourceFiles),
      totalByteLength,
    }));
  } catch {
    return failure(
      "resource-unavailable",
      "source-file-buffer-invalid",
      "The model source bundle could not be inspected safely.",
    );
  }
}

function preflightToolcraftModelWorkerRepairInputs(
  canonicalDocument: ArrayBuffer | Uint8Array,
  canonicalDocumentDigest: string,
  envelope: ToolcraftModelRepairPlanEnvelope,
  limits: Readonly<ToolcraftModelImportLimits>,
): ClientPreflight<RepairPreflight> {
  try {
    const documentSource = inspectToolcraftModelWorkerBuffer(canonicalDocument);
    if (!documentSource) {
      return failure(
        "repair",
        "repair-document-buffer-invalid",
        "The canonical repair document is detached, empty, or unreadable.",
      );
    }
    if (documentSource.byteLength > limits.maxDecodedBytes) {
      return failure(
        "resource-limit",
        "repair-document-byte-limit-exceeded",
        "The canonical repair document exceeds its byte limit.",
      );
    }
    const envelopeSource = inspectToolcraftModelWorkerArrayBuffer(envelope.bytes);
    if (envelope.version !== 1 || !envelopeSource ||
        !sha256Digest(envelope.envelopeDigest) ||
        !sha256Digest(envelope.planDigest) ||
        envelopeSource.byteLength > getToolcraftModelRepairPlanEnvelopeByteLimit(limits)) {
      return failure(
        "repair",
        "repair-plan-envelope-invalid",
        "The repair-plan envelope is malformed, detached, or oversized.",
      );
    }
    if (!sha256Digest(canonicalDocumentDigest)) {
      return failure(
        "repair",
        "repair-document-digest-invalid",
        "The canonical repair document digest is malformed.",
      );
    }
    return success(Object.freeze({
      canonicalDocument: documentSource,
      canonicalDocumentDigest,
      repairPlanEnvelope: Object.freeze({
        envelopeDigest: envelope.envelopeDigest,
        planDigest: envelope.planDigest,
        source: envelopeSource,
        version: 1,
      }),
      totalByteLength: documentSource.byteLength + envelopeSource.byteLength,
    }));
  } catch {
    return failure(
      "repair",
      "repair-plan-envelope-invalid",
      "The model repair inputs could not be inspected safely.",
    );
  }
}

export function preflightToolcraftModelWorkerImportRequest(
  request: ToolcraftModelImportWorkerPayload,
): ClientPreflight<ToolcraftModelWorkerImportRequestPreflight> {
  let limits: Readonly<ToolcraftModelImportWorkerPayload["limits"]>;
  try {
    limits = Object.freeze(normalizeToolcraftModelImportLimits(request.limits));
  } catch {
    return failure(
      "resource-limit",
      "invalid-model-import-limits",
      "The model import limits are invalid.",
    );
  }
  try {
    const bundle = preflightToolcraftModelWorkerImportBundle(request.bundle, limits);
    if (!bundle.ok) return bundle;
    return success(Object.freeze({
      adapterVersion: request.adapterVersion,
      bundle: bundle.value,
      format: request.format,
      geometryDecoderVersion: request.geometryDecoderVersion,
      limits,
      topologyProfile: request.topologyProfile,
    }));
  } catch {
    return failure(
      "resource-unavailable",
      "model-worker-import-preflight-failed",
      "The model import request could not be inspected safely.",
    );
  }
}

export function preflightToolcraftModelWorkerRepairRequest(
  request: Readonly<{
    canonicalDocument: ArrayBuffer | Uint8Array;
    canonicalDocumentDigest: string;
    limits: ToolcraftModelRepairWorkerPayload["limits"];
    repairPlanEnvelope: ToolcraftModelRepairPlanEnvelope;
  }>,
): ClientPreflight<ToolcraftModelWorkerRepairRequestPreflight> {
  let limits: Readonly<ToolcraftModelRepairWorkerPayload["limits"]>;
  try {
    limits = Object.freeze(normalizeToolcraftModelImportLimits(request.limits));
  } catch {
    return failure(
      "resource-limit",
      "invalid-model-import-limits",
      "The model repair limits are invalid.",
    );
  }
  try {
    const inputs = preflightToolcraftModelWorkerRepairInputs(
      request.canonicalDocument,
      request.canonicalDocumentDigest,
      request.repairPlanEnvelope,
      limits,
    );
    return inputs.ok ? success(Object.freeze({ inputs: inputs.value, limits })) : inputs;
  } catch {
    return failure(
      "repair",
      "repair-plan-envelope-invalid",
      "The model repair inputs could not be inspected safely.",
    );
  }
}

export function preflightToolcraftModelWorkerPackageExtractRequest(
  request: Readonly<{
    archive: ArrayBuffer | Uint8Array;
    archiveDigest: string;
    limits: ToolcraftModelPackageExtractWorkerPayload["limits"];
  }>,
): ClientPreflight<ToolcraftModelWorkerPackageExtractRequestPreflight> {
  let limits: Readonly<ToolcraftModelPackageExtractWorkerPayload["limits"]>;
  try {
    limits = Object.freeze(normalizeToolcraftModelImportLimits(request.limits));
  } catch {
    return failure(
      "resource-limit",
      "invalid-model-import-limits",
      "The model package extraction limits are invalid.",
    );
  }
  try {
    const archive = inspectToolcraftModelWorkerBuffer(request.archive);
    if (!archive || archive.byteLength > limits.maxSourceBytes) {
      return failure(
        "resource-limit",
        "archive-source-byte-limit-exceeded",
        "The model archive exceeds its source byte limit.",
      );
    }
    if (!sha256Digest(request.archiveDigest)) {
      return failure(
        "bundle",
        "archive-digest-invalid",
        "The model archive digest is malformed.",
      );
    }
    return success(Object.freeze({
      input: Object.freeze({ archive, archiveDigest: request.archiveDigest }),
      limits,
    }));
  } catch {
    return failure(
      "bundle",
      "archive-source-invalid",
      "The model archive could not be inspected safely.",
    );
  }
}

function mapCopies<Snapshot>(
  copies: ToolcraftModelWorkerBufferCopies,
  createSnapshot: (buffers: readonly ArrayBuffer[]) => Snapshot,
): Promise<Snapshot | undefined> | Snapshot | undefined {
  if (copies instanceof Promise) {
    return copies.then((buffers) => buffers ? createSnapshot(buffers) : undefined);
  }
  return copies ? createSnapshot(copies) : undefined;
}

export function runToolcraftModelWorkerSnapshot<Snapshot>(
  createSnapshot: () => Promise<Snapshot | undefined> | Snapshot | undefined,
  isCurrent: () => boolean,
  useSnapshot: (snapshot: Snapshot) => void,
  onFailure: () => void,
): void {
  const complete = (snapshot: Snapshot | undefined): void => {
    if (snapshot === undefined || !isCurrent()) return;
    try {
      useSnapshot(snapshot);
    } catch {
      onFailure();
    }
  };
  try {
    const snapshot = createSnapshot();
    if (snapshot instanceof Promise) {
      void snapshot.then(complete, onFailure);
    } else {
      complete(snapshot);
    }
  } catch {
    onFailure();
  }
}

export function snapshotToolcraftModelWorkerImportBundle(
  preflight: ImportPreflight,
  isCurrent: () => boolean,
  yieldToHost: ToolcraftModelWorkerYieldToHost,
): Promise<ToolcraftModelWorkerImportSnapshot | undefined> |
  ToolcraftModelWorkerImportSnapshot | undefined {
  const copies = copyToolcraftModelWorkerBuffers(
    preflight.sourceFiles.map((file) => file.source),
    preflight.totalByteLength,
    isCurrent,
    yieldToHost,
  );
  return mapCopies(copies, (buffers) => {
    const sourceFiles = preflight.sourceFiles.map((file, index) => Object.freeze({
      bytes: buffers[index]!,
      contentDigest: file.contentDigest,
      mimeType: file.mimeType,
      path: file.path,
    }));
    return Object.freeze({
      bundle: Object.freeze({
        aggregateDigest: preflight.aggregateDigest,
        rootPath: preflight.rootPath,
        sourceFiles: Object.freeze(sourceFiles),
      }),
      transfer: [...buffers],
    });
  });
}

export function snapshotToolcraftModelWorkerRepairInputs(
  preflight: RepairPreflight,
  isCurrent: () => boolean,
  yieldToHost: ToolcraftModelWorkerYieldToHost,
): Promise<ToolcraftModelWorkerRepairSnapshot | undefined> |
  ToolcraftModelWorkerRepairSnapshot | undefined {
  const copies = copyToolcraftModelWorkerBuffers(
    [preflight.canonicalDocument, preflight.repairPlanEnvelope.source],
    preflight.totalByteLength,
    isCurrent,
    yieldToHost,
  );
  return mapCopies(copies, ([canonicalDocument, envelopeBytes]) => Object.freeze({
    canonicalDocument: canonicalDocument!,
    canonicalDocumentDigest: preflight.canonicalDocumentDigest,
    repairPlanEnvelope: Object.freeze({
      bytes: envelopeBytes!,
      envelopeDigest: preflight.repairPlanEnvelope.envelopeDigest,
      planDigest: preflight.repairPlanEnvelope.planDigest,
      version: 1,
    }),
    transfer: [canonicalDocument!, envelopeBytes!],
  }));
}

export function snapshotToolcraftModelWorkerPackageExtractInput(
  preflight: PackageExtractPreflight,
  isCurrent: () => boolean,
  yieldToHost: ToolcraftModelWorkerYieldToHost,
): Promise<ToolcraftModelWorkerPackageExtractSnapshot | undefined> |
  ToolcraftModelWorkerPackageExtractSnapshot | undefined {
  const copies = copyToolcraftModelWorkerBuffers(
    [preflight.archive],
    preflight.archive.byteLength,
    isCurrent,
    yieldToHost,
  );
  return mapCopies(copies, ([archive]) => Object.freeze({
    archive: archive!,
    archiveDigest: preflight.archiveDigest,
    transfer: [archive!],
  }));
}
