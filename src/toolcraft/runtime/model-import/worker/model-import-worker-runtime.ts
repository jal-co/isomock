import type { ToolcraftModelFormat } from "../../schema/types";
import type { ToolcraftSourceAssetFeedback } from "../../source-assets/source-asset-types";
import {
  decodeToolcraftModelDocument,
  encodeToolcraftModelDocument,
} from "../canonical/model-document-codec";
import { digestToolcraftModelDocument } from "../canonical/model-document-digest";
import { snapshotToolcraftModelAppearanceResources } from "../canonical/model-appearance-resource";
import {
  createToolcraftModelFormatAdapterRegistry,
  selectToolcraftModelFormatAdapter,
  type ToolcraftModelFormatAdapterRegistry,
} from "../formats/model-format-adapter";
import {
  TOOLCRAFT_PRODUCTION_GEOMETRY_DECODER_VERSIONS,
  TOOLCRAFT_PRODUCTION_MODEL_FORMAT_ADAPTER_REGISTRY,
} from "../formats/production-model-format-worker-registry";
import type {
  ToolcraftModelAppearanceResource,
  ToolcraftModelDiagnostic,
  ToolcraftModelFormatAdapter,
} from "../model-import-types";
import { normalizeToolcraftModelImportLimits } from "../model-import-limits";
import { TOOLCRAFT_MODEL_IMPORT_LIMIT_NAMES } from "../model-import-limit-values";
import { extractToolcraftModelPackageZip } from "../model-package-zip";
import { digestModelSourceTransfer } from "../model-source-digest";
import { applyToolcraftModelRepair } from "../topology/apply-model-repair";
import {
  decodeToolcraftModelRepairPlanEnvelope,
  encodeToolcraftModelRepairPlanEnvelope,
} from "../topology/model-repair-plan-codec";
import { getToolcraftModelRepairPlanEnvelopeByteLimit } from "../topology/model-repair-plan-envelope";
import {
  analyzeToolcraftModel,
  type ToolcraftModelAnalysis,
} from "../topology/model-topology-analysis";
import { digestToolcraftTopologyDocument } from "../topology/model-topology-digest";
import {
  createToolcraftBoundedWorkerCache,
  createToolcraftWorkerCacheCoordinator,
} from "./bounded-worker-cache";
import {
  estimateToolcraftModelWorkerAnalysisBytes,
  estimateToolcraftModelWorkerDiagnosticsBytes,
  snapshotToolcraftModelWorkerAnalysis,
  snapshotToolcraftModelWorkerAnalysisSummary,
  snapshotToolcraftModelWorkerDecodeDiagnostics,
  snapshotToolcraftModelWorkerDiagnosticStream,
  sumToolcraftModelWorkerEstimatedBytes,
} from "./model-import-worker-diagnostics";
import {
  createToolcraftModelAnalysisCacheKey,
  createToolcraftModelDecodeCacheKey,
  createToolcraftModelRepairCacheKey,
  TOOLCRAFT_MODEL_WORKER_FEEDBACK_MAX_LENGTH,
  type ToolcraftModelImportWorkerPayload,
  type ToolcraftModelPackageExtractWorkerPayload,
  type ToolcraftModelRepairWorkerPayload,
  type ToolcraftModelWorkerRequest,
  type ToolcraftModelWorkerResponse,
} from "./model-import-worker-protocol";
import {
  createToolcraftModelWorkerDraftReceiptDigest,
  createToolcraftModelWorkerReceiptDigest,
  digestToolcraftModelWorkerBytes,
} from "./model-import-worker-receipt";

const DEFAULT_CACHE_MAX_AGGREGATE_BYTES = 64 * 1024 * 1024;
const DEFAULT_CACHE_MAX_ENTRIES = 4;
const PROTECTED_CACHE_MAX_AGGREGATE_BYTES = 64 * 1024 * 1024;
const PROTECTED_CACHE_MAX_ENTRIES = 16;

type EncodedDocumentCacheEntry = Readonly<{
  appearanceResources: readonly ToolcraftModelAppearanceResource[];
  bytes: Uint8Array;
  diagnostics?: readonly ToolcraftModelDiagnostic[];
  digest: string;
}>;

type RepairedDocumentCacheEntry = Readonly<{
  analysis: ToolcraftModelAnalysis;
  bytes: Uint8Array;
  digest: string;
}>;

type ActiveJob = {
  cancelled: boolean;
  cancellationPublished: boolean;
  controller: AbortController;
  generation: number;
  jobId: string;
};

type WorkerResponseBody = ToolcraftModelWorkerResponse extends infer Response
  ? Response extends ToolcraftModelWorkerResponse
    ? Omit<Response, "generation" | "jobId">
    : never
  : never;

export type ToolcraftModelWorkerRuntime = Readonly<{
  clearCaches: () => void;
  dispose: () => void;
  handleMessage: (request: ToolcraftModelWorkerRequest) => Promise<void>;
  inspectCacheSizes: () => Readonly<{
    analysis: number;
    decode: number;
    maxAggregateBytes: number;
    repair: number;
    retainedBytes: number;
  }>;
}>;

export type CreateToolcraftModelWorkerRuntimeOptions = Readonly<{
  adapters: readonly ToolcraftModelFormatAdapter[];
  analyze?: typeof analyzeToolcraftModel;
  cacheLimits?: Readonly<{
    maxAggregateBytes: number;
    maxEntriesPerStage: number;
  }>;
  geometryDecoderVersions?: Partial<Record<ToolcraftModelFormat, string>>;
  post: (
    response: ToolcraftModelWorkerResponse,
    transfer?: readonly Transferable[],
  ) => void;
  repair?: typeof applyToolcraftModelRepair;
}>;

const feedbackCategories = new Set<ToolcraftSourceAssetFeedback["category"]>([
  "bundle",
  "format",
  "geometry",
  "repair",
  "resource-limit",
  "resource-unavailable",
  "topology",
]);
function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function analysisSize(analysis: ToolcraftModelAnalysis): number {
  return estimateToolcraftModelWorkerAnalysisBytes(analysis);
}

function encodedEntrySize(entry: EncodedDocumentCacheEntry): number {
  return sumToolcraftModelWorkerEstimatedBytes(
    entry.bytes.byteLength,
    ...entry.appearanceResources.map((resource) => resource.bytes.byteLength),
    entry.diagnostics === undefined
      ? 0
      : estimateToolcraftModelWorkerDiagnosticsBytes(entry.diagnostics),
    entry.digest.length * 2,
  );
}

function copyAppearanceResources(
  resources: readonly ToolcraftModelAppearanceResource[],
): readonly ToolcraftModelAppearanceResource[] {
  return Object.freeze(resources.map((resource) => Object.freeze({
    ...resource,
    bytes: resource.bytes.slice(0),
  })));
}

function repairedEntrySize(entry: RepairedDocumentCacheEntry): number {
  return sumToolcraftModelWorkerEstimatedBytes(
    entry.bytes.byteLength,
    entry.digest.length * 2,
    analysisSize(entry.analysis),
  );
}

function analysisUsesLimits(
  analysis: ToolcraftModelAnalysis,
  limits: ToolcraftModelImportWorkerPayload["limits"],
): boolean {
  return TOOLCRAFT_MODEL_IMPORT_LIMIT_NAMES.every(
    (name) => analysis.limits[name] === limits[name],
  );
}

function bounded(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function typedFeedback(error: unknown): ToolcraftSourceAssetFeedback | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as Partial<ToolcraftSourceAssetFeedback>;
  if (
    typeof candidate.category !== "string" ||
    !feedbackCategories.has(candidate.category as ToolcraftSourceAssetFeedback["category"]) ||
    typeof candidate.code !== "string" ||
    candidate.code.length === 0 ||
    typeof candidate.message !== "string" ||
    candidate.message.length === 0
  ) {
    return undefined;
  }
  return Object.freeze({
    category: candidate.category as ToolcraftSourceAssetFeedback["category"],
    code: bounded(candidate.code, 80),
    message: bounded(candidate.message, TOOLCRAFT_MODEL_WORKER_FEEDBACK_MAX_LENGTH),
  });
}

function genericFeedback(
  phase: "analyzing" | "decoding" | "extracting" | "repairing",
): ToolcraftSourceAssetFeedback {
  if (phase === "repairing") {
    return Object.freeze({
      category: "repair",
      code: "model-repair-failed",
      message: "The model repair could not be completed safely.",
    });
  }
  if (phase === "analyzing") {
    return Object.freeze({
      category: "topology",
      code: "model-analysis-failed",
      message: "The model topology could not be analyzed safely.",
    });
  }
  if (phase === "extracting") {
    return Object.freeze({
      category: "bundle",
      code: "model-package-extraction-failed",
      message: "The model archive could not be extracted safely.",
    });
  }
  return Object.freeze({
    category: "format",
    code: "model-decode-failed",
    message: "The model geometry could not be decoded safely.",
  });
}

function preflightTransferredSource(payload: ToolcraftModelImportWorkerPayload): void {
  const files = payload.bundle.sourceFiles;
  if (!Array.isArray(files) || files.length === 0 || files.length > payload.limits.maxBundleFiles) {
    throw Object.assign(new Error("The model source bundle exceeds its file limit."), {
      category: "resource-limit",
      code: "bundle-file-limit-exceeded",
    });
  }
  let total = 0;
  for (const file of files) {
    if (!(file.bytes instanceof ArrayBuffer)) {
      throw Object.assign(new Error("A transferred model source buffer is invalid."), {
        category: "resource-unavailable",
        code: "source-file-buffer-invalid",
      });
    }
    if (total > payload.limits.maxSourceBytes - file.bytes.byteLength) {
      throw Object.assign(new Error("The model source bundle exceeds its byte limit."), {
        category: "resource-limit",
        code: "source-byte-limit-exceeded",
      });
    }
    total += file.bytes.byteLength;
  }
}

function snapshotWorkerLimits(value: unknown): ToolcraftModelImportWorkerPayload["limits"] {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      Reflect.ownKeys(value).length !== TOOLCRAFT_MODEL_IMPORT_LIMIT_NAMES.length ||
      !TOOLCRAFT_MODEL_IMPORT_LIMIT_NAMES.every((name) =>
        Object.prototype.hasOwnProperty.call(value, name)
      )
    ) {
      throw new Error("Model worker import limits must be complete.");
    }
    return Object.freeze(normalizeToolcraftModelImportLimits(
      value as Partial<ToolcraftModelImportWorkerPayload["limits"]> | undefined,
    ));
  } catch {
    throw Object.assign(new Error("The model worker received invalid import limits."), {
      category: "resource-limit",
      code: "invalid-model-import-limits",
    });
  }
}

function resolveWorkerCacheLimits(
  value: CreateToolcraftModelWorkerRuntimeOptions["cacheLimits"],
): Readonly<{ maxAggregateBytes: number; maxEntries: number }> {
  const maxAggregateBytes = value?.maxAggregateBytes ??
    DEFAULT_CACHE_MAX_AGGREGATE_BYTES;
  const maxEntries = value?.maxEntriesPerStage ?? DEFAULT_CACHE_MAX_ENTRIES;
  if (
    !Number.isSafeInteger(maxAggregateBytes) ||
    maxAggregateBytes <= 0 ||
    maxAggregateBytes > PROTECTED_CACHE_MAX_AGGREGATE_BYTES ||
    !Number.isSafeInteger(maxEntries) ||
    maxEntries <= 0 ||
    maxEntries > PROTECTED_CACHE_MAX_ENTRIES
  ) {
    throw new Error("Toolcraft model worker cache limits exceed protected bounds.");
  }
  return Object.freeze({ maxAggregateBytes, maxEntries });
}

export function createToolcraftModelWorkerRuntime(
  options: CreateToolcraftModelWorkerRuntimeOptions,
): ToolcraftModelWorkerRuntime {
  const registry: ToolcraftModelFormatAdapterRegistry =
    createToolcraftModelFormatAdapterRegistry(options.adapters);
  const analyze = options.analyze ?? analyzeToolcraftModel;
  const repair = options.repair ?? applyToolcraftModelRepair;
  const { maxAggregateBytes, maxEntries } = resolveWorkerCacheLimits(
    options.cacheLimits,
  );
  const cacheCoordinator = createToolcraftWorkerCacheCoordinator({
    maxAggregateBytes,
  });
  const decodeCache = createToolcraftBoundedWorkerCache<EncodedDocumentCacheEntry>({
    coordinator: cacheCoordinator,
    maxEntries,
    sizeOf: encodedEntrySize,
  });
  const analysisCache = createToolcraftBoundedWorkerCache<ToolcraftModelAnalysis>({
    coordinator: cacheCoordinator,
    maxEntries,
    sizeOf: analysisSize,
  });
  const repairCache = createToolcraftBoundedWorkerCache<RepairedDocumentCacheEntry>({
    coordinator: cacheCoordinator,
    maxEntries,
    sizeOf: repairedEntrySize,
  });
  let activeJob: ActiveJob | undefined;
  let disposed = false;

  const postFor = (
    job: Pick<ActiveJob, "generation" | "jobId">,
    response: WorkerResponseBody,
    transfer?: readonly Transferable[],
  ): void => {
    options.post({ ...response, generation: job.generation, jobId: job.jobId } as ToolcraftModelWorkerResponse, transfer);
  };

  const cancelled = (job: ActiveJob): boolean =>
    disposed || job.cancelled || activeJob !== job;

  const publishCancelled = (job: ActiveJob): void => {
    if (job.cancellationPublished) return;
    job.cancellationPublished = true;
    postFor(job, { kind: "cancelled" });
  };

  const publishProgress = (() => {
    const values = new WeakMap<ActiveJob, Map<string, number>>();
    return (
      job: ActiveJob,
      phase: "analyzing" | "decoding" | "extracting" | "repairing",
      progress: number,
    ): void => {
      if (cancelled(job)) return;
      const phaseValues = values.get(job) ?? new Map<string, number>();
      values.set(job, phaseValues);
      const visibleProgress = Math.min(Math.max(progress, 0), 0.999);
      const previous = phaseValues.get(phase) ?? -1;
      if (visibleProgress <= previous) return;
      phaseValues.set(phase, visibleProgress);
      postFor(job, { kind: "progress", phase, progress: visibleProgress });
    };
  })();

  const decodeAndAnalyze = async (
    job: ActiveJob,
    payload: ToolcraftModelImportWorkerPayload,
  ): Promise<void> => {
    let phase: "analyzing" | "decoding" = "decoding";
    try {
      const normalizedPayload = Object.freeze({
        ...payload,
        limits: snapshotWorkerLimits(payload.limits),
      });
      preflightTransferredSource(normalizedPayload);
      const verifiedSourceTransferDigest = digestModelSourceTransfer(
        normalizedPayload.bundle,
      );
      const adapter = selectToolcraftModelFormatAdapter(registry, `.${payload.format}`);
      if (!adapter || adapter.adapterVersion !== payload.adapterVersion) {
        throw Object.assign(new Error("The requested model adapter version is unavailable."), {
          category: "format",
          code: "model-adapter-version-unavailable",
        });
      }
      const expectedDecoder = options.geometryDecoderVersions?.[payload.format];
      if (expectedDecoder !== undefined && expectedDecoder !== payload.geometryDecoderVersion) {
        throw Object.assign(new Error("The requested geometry decoder version is unavailable."), {
          category: "format",
          code: "geometry-decoder-version-unavailable",
        });
      }

      publishProgress(job, "decoding", 0.05);
      const decodeKey = createToolcraftModelDecodeCacheKey({
        adapterVersion: payload.adapterVersion,
        format: payload.format,
        geometryDecoderVersion: payload.geometryDecoderVersion,
        verifiedSourceTransferDigest,
      });
      let decoded = decodeCache.get(decodeKey);
      if (!decoded) {
        const result = await adapter.decode({
          bundle: normalizedPayload.bundle,
          limits: normalizedPayload.limits,
          signal: job.controller.signal,
        });
        if (cancelled(job)) return;
        const bytes = encodeToolcraftModelDocument(result.document, normalizedPayload.limits);
        const appearanceResources = snapshotToolcraftModelAppearanceResources(
          result.document,
          result.appearanceResources,
          normalizedPayload.limits,
        );
        decoded = Object.freeze({
          appearanceResources,
          bytes: copyBytes(bytes),
          diagnostics: snapshotToolcraftModelWorkerDecodeDiagnostics(
            result.diagnostics,
          ),
          digest: digestToolcraftModelDocument(result.document, normalizedPayload.limits),
        });
        decodeCache.set(decodeKey, decoded);
      }
      const document = decodeToolcraftModelDocument(decoded.bytes, normalizedPayload.limits);
      publishProgress(job, "decoding", 0.9);
      if (cancelled(job)) return;

      const draftBytes = copyBytes(decoded.bytes);
      const draftAppearanceResources = copyAppearanceResources(
        decoded.appearanceResources,
      );
      const draftWithoutReceipt = Object.freeze({
        appearanceResources: draftAppearanceResources,
        canonicalDocument: draftBytes.buffer,
        canonicalDocumentDigest: decoded.digest,
      });
      postFor(job, {
        draft: {
          ...draftWithoutReceipt,
          receiptDigest: createToolcraftModelWorkerDraftReceiptDigest({
            draft: draftWithoutReceipt,
            generation: job.generation,
            jobId: job.jobId,
          }),
        },
        kind: "draft",
      }, [
        draftBytes.buffer,
        ...draftAppearanceResources.map(({ bytes }) => bytes),
      ]);
      if (cancelled(job)) return;

      phase = "analyzing";
      publishProgress(job, "analyzing", 0.05);
      const analysisKey = createToolcraftModelAnalysisCacheKey({
        canonicalDocumentDigest: decoded.digest,
        topologyProfile: payload.topologyProfile,
      });
      let analysis = analysisCache.get(analysisKey);
      if (!analysis || !analysisUsesLimits(analysis, normalizedPayload.limits)) {
        analysis = snapshotToolcraftModelWorkerAnalysis(
          analyze(document, payload.topologyProfile, normalizedPayload.limits),
        );
        analysisCache.set(analysisKey, analysis);
      }
      if (cancelled(job)) return;
      publishProgress(job, "analyzing", 0.9);
      const diagnosticSnapshot = snapshotToolcraftModelWorkerDiagnosticStream(
        decoded.diagnostics ?? [],
        analysis.diagnostics,
      );
      for (const diagnostic of diagnosticSnapshot) {
        if (cancelled(job)) return;
        postFor(job, { diagnostic, kind: "diagnostic" });
      }

      const resultBytes = copyBytes(decoded.bytes);
      const resultAppearanceResources = copyAppearanceResources(
        decoded.appearanceResources,
      );
      const analysisSummary = snapshotToolcraftModelWorkerAnalysisSummary(analysis);
      const plan = analysis.repairPlan;
      const envelopeBytes = plan === undefined
        ? undefined
        : encodeToolcraftModelRepairPlanEnvelope(plan, {
            maxByteLength: getToolcraftModelRepairPlanEnvelopeByteLimit(
              normalizedPayload.limits,
            ),
          });
      const repairPlanEnvelope = plan === undefined || envelopeBytes === undefined
        ? undefined
        : Object.freeze({
            bytes: envelopeBytes.buffer,
            envelopeDigest: digestToolcraftModelWorkerBytes(envelopeBytes),
            planDigest: plan.planDigest,
            version: 1 as const,
          });
      const resultWithoutReceipt = Object.freeze({
        analysis: analysisSummary,
        appearanceResources: resultAppearanceResources,
        canonicalDocument: resultBytes.buffer,
        canonicalDocumentDigest: decoded.digest,
        operation: "decode-and-analyze" as const,
        ...(repairPlanEnvelope === undefined ? {} : { repairPlanEnvelope }),
      });
      postFor(job, {
        kind: "result",
        result: {
          ...resultWithoutReceipt,
          receiptDigest: createToolcraftModelWorkerReceiptDigest({
            generation: job.generation,
            jobId: job.jobId,
            result: resultWithoutReceipt,
          }),
        },
      }, [
        resultBytes.buffer,
        ...resultAppearanceResources.map(({ bytes }) => bytes),
        ...(repairPlanEnvelope === undefined ? [] : [repairPlanEnvelope.bytes]),
      ]);
    } catch (error) {
      if (cancelled(job)) return;
      postFor(job, { feedback: typedFeedback(error) ?? genericFeedback(phase), kind: "error" });
    }
  };

  const repairDocument = async (
    job: ActiveJob,
    payload: ToolcraftModelRepairWorkerPayload,
  ): Promise<void> => {
    try {
      const limits = snapshotWorkerLimits(payload.limits);
      publishProgress(job, "repairing", 0.05);
      const envelope = payload.repairPlanEnvelope;
      if (envelope.version !== 1 || !(envelope.bytes instanceof ArrayBuffer) ||
          envelope.bytes.byteLength === 0 ||
          envelope.bytes.byteLength > getToolcraftModelRepairPlanEnvelopeByteLimit(limits)) {
        throw Object.assign(new Error("The repair-plan envelope is malformed."), {
          category: "repair",
          code: "repair-plan-envelope-invalid",
        });
      }
      if (digestToolcraftModelWorkerBytes(envelope.bytes) !== envelope.envelopeDigest) {
        throw Object.assign(new Error("The repair-plan envelope digest does not match."), {
          category: "repair",
          code: "repair-plan-envelope-digest-mismatch",
        });
      }
      const document = decodeToolcraftModelDocument(
        new Uint8Array(payload.canonicalDocument),
        limits,
      );
      if (digestToolcraftModelDocument(document, limits) !== payload.canonicalDocumentDigest) {
        throw Object.assign(new Error("The canonical document digest does not match its bytes."), {
          category: "repair",
          code: "repair-document-digest-mismatch",
        });
      }
      const plan = decodeToolcraftModelRepairPlanEnvelope(envelope.bytes, {
        expectedPlanDigest: envelope.planDigest,
        expectedSourceDocumentDigest: digestToolcraftTopologyDocument(document),
        limits,
        maxByteLength: getToolcraftModelRepairPlanEnvelopeByteLimit(limits),
      });
      const repairKey = createToolcraftModelRepairCacheKey({
        canonicalDocumentDigest: payload.canonicalDocumentDigest,
        repairPlanDigest: plan.planDigest,
      });
      let repaired = repairCache.get(repairKey);
      if (!repaired) {
        const repairedDocument = repair(document, plan);
        if (cancelled(job)) return;
        const bytes = encodeToolcraftModelDocument(repairedDocument, limits);
        repaired = Object.freeze({
          analysis: snapshotToolcraftModelWorkerAnalysis(
            analyze(repairedDocument, plan.profile, limits),
          ),
          bytes: copyBytes(bytes),
          digest: digestToolcraftModelDocument(repairedDocument, limits),
        });
        repairCache.set(repairKey, repaired);
      } else {
        const cachedDocument = decodeToolcraftModelDocument(repaired.bytes, limits);
        if (digestToolcraftModelDocument(cachedDocument, limits) !== repaired.digest) {
          throw Object.assign(new Error("The cached repair result failed verification."), {
            category: "repair",
            code: "repair-cache-verification-failed",
          });
        }
        if (!analysisUsesLimits(repaired.analysis, limits)) {
          repaired = Object.freeze({
            ...repaired,
            analysis: snapshotToolcraftModelWorkerAnalysis(
              analyze(cachedDocument, plan.profile, limits),
            ),
          });
          repairCache.set(repairKey, repaired);
        }
      }
      if (cancelled(job)) return;
      publishProgress(job, "repairing", 0.9);
      const diagnosticSnapshot = snapshotToolcraftModelWorkerDiagnosticStream(
        [],
        repaired.analysis.diagnostics,
      );
      for (const diagnostic of diagnosticSnapshot) {
        if (cancelled(job)) return;
        postFor(job, { diagnostic, kind: "diagnostic" });
      }
      const resultBytes = copyBytes(repaired.bytes);
      const resultWithoutReceipt = Object.freeze({
        analysis: snapshotToolcraftModelWorkerAnalysisSummary(repaired.analysis),
        canonicalDocument: resultBytes.buffer,
        canonicalDocumentDigest: repaired.digest,
        operation: "repair" as const,
        repairPlanDigest: plan.planDigest,
      });
      postFor(job, {
        kind: "result",
        result: {
          ...resultWithoutReceipt,
          receiptDigest: createToolcraftModelWorkerReceiptDigest({
            generation: job.generation,
            jobId: job.jobId,
            repairPlanEnvelope: {
              byteLength: envelope.bytes.byteLength,
              envelopeDigest: envelope.envelopeDigest,
              planDigest: envelope.planDigest,
              version: envelope.version,
            },
            result: resultWithoutReceipt,
          }),
        },
      }, [resultBytes.buffer]);
    } catch (error) {
      if (cancelled(job)) return;
      postFor(job, { feedback: typedFeedback(error) ?? genericFeedback("repairing"), kind: "error" });
    }
  };

  const extractModelPackage = (
    job: ActiveJob,
    payload: ToolcraftModelPackageExtractWorkerPayload,
  ): void => {
    try {
      const limits = snapshotWorkerLimits(payload.limits);
      if (
        !(payload.archive instanceof ArrayBuffer) ||
        payload.archive.byteLength === 0 ||
        payload.archive.byteLength > limits.maxSourceBytes
      ) {
        throw Object.assign(
          new Error("The transferred model archive exceeds its source byte limit."),
          {
            category: "resource-limit",
            code: "archive-source-byte-limit-exceeded",
          },
        );
      }
      if (digestToolcraftModelWorkerBytes(payload.archive) !== payload.archiveDigest) {
        throw Object.assign(new Error("The model archive digest does not match."), {
          category: "bundle",
          code: "archive-digest-mismatch",
        });
      }
      const entries = extractToolcraftModelPackageZip(
        new Uint8Array(payload.archive),
        {
          limits,
          onProgress: (progress) => publishProgress(job, "extracting", progress),
          signal: job.controller.signal,
        },
      );
      if (cancelled(job)) return;
      const resultWithoutReceipt = Object.freeze({
        archiveDigest: payload.archiveDigest,
        entries,
        operation: "extract-model-package" as const,
      });
      postFor(job, {
        kind: "package-result",
        result: {
          ...resultWithoutReceipt,
          receiptDigest: createToolcraftModelWorkerReceiptDigest({
            generation: job.generation,
            jobId: job.jobId,
            result: resultWithoutReceipt,
          }),
        },
      }, entries.map(({ bytes }) => bytes));
    } catch (error) {
      if (cancelled(job)) return;
      postFor(job, {
        feedback: typedFeedback(error) ?? genericFeedback("extracting"),
        kind: "error",
      });
    }
  };

  const handleMessage = async (request: ToolcraftModelWorkerRequest): Promise<void> => {
    if (disposed) return;
    if (request.kind === "cancel") {
      if (
        activeJob &&
        activeJob.generation === request.generation &&
        activeJob.jobId === request.jobId
      ) {
        activeJob.cancelled = true;
        activeJob.controller.abort(new DOMException("Model worker job cancelled.", "AbortError"));
        publishCancelled(activeJob);
      } else {
        options.post({
          generation: request.generation,
          jobId: request.jobId,
          kind: "cancelled",
        });
      }
      return;
    }
    if (activeJob) {
      options.post({
        feedback: {
          category: "resource-unavailable",
          code: "model-worker-busy",
          message: "The model worker is already processing another job.",
        },
        generation: request.generation,
        jobId: request.jobId,
        kind: "error",
      });
      return;
    }

    const job: ActiveJob = {
      cancelled: false,
      cancellationPublished: false,
      controller: new AbortController(),
      generation: request.generation,
      jobId: request.jobId,
    };
    activeJob = job;
    try {
      if (request.kind === "decode-and-analyze") {
        await decodeAndAnalyze(job, request.payload);
      } else if (request.kind === "repair") {
        await repairDocument(job, request.payload);
      } else {
        extractModelPackage(job, request.payload);
      }
    } finally {
      if (activeJob === job) activeJob = undefined;
    }
  };

  const clearCaches = (): void => {
    decodeCache.clear();
    analysisCache.clear();
    repairCache.clear();
  };

  return Object.freeze({
    clearCaches,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (activeJob) {
        activeJob.cancelled = true;
        activeJob.controller.abort(new DOMException("Model worker disposed.", "AbortError"));
      }
      activeJob = undefined;
      decodeCache.dispose();
      analysisCache.dispose();
      repairCache.dispose();
    },
    handleMessage,
    inspectCacheSizes: () => Object.freeze({
      analysis: analysisCache.size(),
      decode: decodeCache.size(),
      maxAggregateBytes: cacheCoordinator.maxAggregateBytes,
      repair: repairCache.size(),
      retainedBytes: cacheCoordinator.retainedBytes(),
    }),
  });
}

export function createDefaultToolcraftModelWorkerRuntime(
  post: CreateToolcraftModelWorkerRuntimeOptions["post"],
): ToolcraftModelWorkerRuntime {
  return createToolcraftModelWorkerRuntime({
    adapters: TOOLCRAFT_PRODUCTION_MODEL_FORMAT_ADAPTER_REGISTRY.adapters,
    geometryDecoderVersions: TOOLCRAFT_PRODUCTION_GEOMETRY_DECODER_VERSIONS,
    post,
  });
}
