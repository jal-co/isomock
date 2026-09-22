import type {
  ToolcraftModelImportLimits,
  ToolcraftModelTopologyProfile,
} from "../../schema/types";
import { getToolcraftModelRepairPlanEnvelopeByteLimit } from "../topology/model-repair-plan-envelope";
import { TOOLCRAFT_MODEL_TOPOLOGY_ANALYZER_VERSION } from "../topology/model-topology-analysis";
import type {
  ToolcraftModelAppearanceResource,
  ToolcraftModelTopologyDiagnostic,
  ToolcraftModelTopologyStatistics,
  ToolcraftModelWorkerAnalysisSummary,
} from "../model-import-types";
import {
  isToolcraftModelAppearanceMimeType,
  parseToolcraftModelAppearanceResourceRef,
} from "../canonical/model-appearance-resource";
import { TOOLCRAFT_MODEL_IMPORT_LIMIT_NAMES } from "../model-import-limit-values";
import { normalizeToolcraftModelPackagePath } from "../model-package-path";
import {
  TOOLCRAFT_MODEL_WORKER_DIAGNOSTIC_CODE_MAX_LENGTH as MAX_CODE_LENGTH,
  TOOLCRAFT_MODEL_WORKER_DIAGNOSTIC_EXPLANATION_MAX_LENGTH as MAX_EXPLANATION_LENGTH,
  TOOLCRAFT_MODEL_WORKER_DIAGNOSTIC_ID_MAX_LENGTH as MAX_ID_LENGTH,
  TOOLCRAFT_MODEL_WORKER_FEEDBACK_MAX_LENGTH,
  TOOLCRAFT_MODEL_WORKER_MAX_DIAGNOSTICS,
  type ToolcraftModelPackageExtractWorkerResult,
  type ToolcraftModelRepairPlanEnvelope,
  type ToolcraftModelWorkerOperation,
  type ToolcraftModelWorkerDraft,
  type ToolcraftModelWorkerResponse,
  type ToolcraftModelWorkerResult,
} from "./model-import-worker-protocol";

const INVALID = Symbol("invalid-worker-protocol-value");
const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const MAX_JOB_ID_LENGTH = 1_024;
const arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
)?.get;

type RecordValue = Record<PropertyKey, unknown>;

export type ToolcraftModelWorkerExpectedOperation =
  ToolcraftModelWorkerOperation;

export type ToolcraftModelWorkerValidationContext = Readonly<{
  expectedArchiveDigest?: string;
  expectedOperation: ToolcraftModelWorkerExpectedOperation;
  expectedRepairPlanEnvelope?: Readonly<{
    byteLength: number;
    envelopeDigest: string;
    planDigest: string;
    version: 1;
  }>;
  limits: Readonly<ToolcraftModelImportLimits>;
  topologyProfile?: ToolcraftModelTopologyProfile;
}>;

export type ToolcraftModelWorkerMessageIdentity = Readonly<{
  generation: number;
  jobId: string;
}>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ownValue(record: RecordValue, key: PropertyKey): unknown | typeof INVALID {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && "value" in descriptor ? descriptor.value : INVALID;
}

function hasOnlyKeys(record: RecordValue, allowed: readonly string[]): boolean {
  return Reflect.ownKeys(record).every(
    (key) => typeof key === "string" && allowed.includes(key),
  );
}

function boundedString(
  value: unknown,
  maxLength: number,
  allowEmpty = false,
): value is string {
  return typeof value === "string" && (allowEmpty || value.length > 0) &&
    value.length <= maxLength;
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function digest(value: unknown): value is string {
  return typeof value === "string" && SHA256_DIGEST_PATTERN.test(value);
}

function arrayBufferByteLength(
  value: unknown,
  maximum: number,
  allowEmpty = false,
): number | undefined {
  if (!arrayBufferByteLengthGetter) return undefined;
  try {
    const byteLength = Reflect.apply(arrayBufferByteLengthGetter, value, []) as number;
    return Number.isSafeInteger(byteLength) &&
      (allowEmpty ? byteLength >= 0 : byteLength > 0) &&
      byteLength <= maximum
      ? byteLength
      : undefined;
  } catch {
    return undefined;
  }
}

function arrayBuffer(value: unknown, maximum: number): value is ArrayBuffer {
  return arrayBufferByteLength(value, maximum) !== undefined;
}

function readAppearanceResources(
  value: unknown,
  limits: Readonly<ToolcraftModelImportLimits>,
): readonly ToolcraftModelAppearanceResource[] | undefined {
  if (!Array.isArray(value) || value.length > limits.maxTextureCount) {
    return undefined;
  }
  const resources: ToolcraftModelAppearanceResource[] = [];
  let aggregateBytes = 0;
  let previousRef = "";
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return undefined;
    const resource = value[index];
    if (!isRecord(resource) || !hasOnlyKeys(resource, [
      "bytes",
      "contentDigest",
      "mimeType",
      "resourceRef",
    ])) return undefined;
    const bytes = ownValue(resource, "bytes");
    const contentDigest = ownValue(resource, "contentDigest");
    const mimeType = ownValue(resource, "mimeType");
    const resourceRef = ownValue(resource, "resourceRef");
    const byteLength = arrayBufferByteLength(bytes, limits.maxTextureBytes);
    if (
      byteLength === undefined ||
      !arrayBuffer(bytes, limits.maxTextureBytes) ||
      !digest(contentDigest) ||
      !isToolcraftModelAppearanceMimeType(mimeType) ||
      typeof resourceRef !== "string" ||
      parseToolcraftModelAppearanceResourceRef(resourceRef) !== contentDigest ||
      resourceRef <= previousRef ||
      aggregateBytes > limits.maxTextureBytes - byteLength
    ) {
      return undefined;
    }
    aggregateBytes += byteLength;
    previousRef = resourceRef;
    resources.push(Object.freeze({
      bytes,
      contentDigest,
      mimeType,
      resourceRef,
    }));
  }
  return Object.freeze(resources);
}

function readDiagnostic(
  value: unknown,
  allowPrimitiveIndex = false,
): ToolcraftModelTopologyDiagnostic | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "affectedCount",
    "code",
    "explanation",
    "primitiveId",
    ...(allowPrimitiveIndex ? ["primitiveIndex"] : []),
    "severity",
  ])) return undefined;
  const affectedCount = ownValue(value, "affectedCount");
  const code = ownValue(value, "code");
  const explanation = ownValue(value, "explanation");
  const primitiveId = ownValue(value, "primitiveId");
  const primitiveIndex = ownValue(value, "primitiveIndex");
  const severity = ownValue(value, "severity");
  if (!nonNegativeSafeInteger(affectedCount) ||
      !boundedString(code, MAX_CODE_LENGTH) ||
      !boundedString(explanation, MAX_EXPLANATION_LENGTH) ||
      (primitiveId !== INVALID && !boundedString(primitiveId, MAX_ID_LENGTH)) ||
      (primitiveIndex !== INVALID && !nonNegativeSafeInteger(primitiveIndex)) ||
      (severity !== "fatal" && severity !== "info" &&
        severity !== "repairable" && severity !== "warning")) return undefined;
  return Object.freeze({
    affectedCount,
    code: code as ToolcraftModelTopologyDiagnostic["code"],
    explanation,
    ...(primitiveId === INVALID ? {} : { primitiveId }),
    ...(primitiveIndex === INVALID ? {} : { primitiveIndex }),
    severity,
  });
}

function readFeedback(value: unknown) {
  if (!isRecord(value) || !hasOnlyKeys(value, ["category", "code", "message"])) {
    return undefined;
  }
  const category = ownValue(value, "category");
  const code = ownValue(value, "code");
  const message = ownValue(value, "message");
  if ((category !== "bundle" && category !== "format" && category !== "geometry" &&
      category !== "repair" && category !== "resource-limit" &&
      category !== "resource-unavailable" && category !== "topology") ||
      !boundedString(code, MAX_CODE_LENGTH) ||
      !boundedString(message, TOOLCRAFT_MODEL_WORKER_FEEDBACK_MAX_LENGTH)) {
    return undefined;
  }
  return Object.freeze({ category, code, message });
}

function readLimits(
  value: unknown,
  expected: Readonly<ToolcraftModelImportLimits>,
): Readonly<ToolcraftModelImportLimits> | undefined {
  if (!isRecord(value) ||
      !hasOnlyKeys(value, TOOLCRAFT_MODEL_IMPORT_LIMIT_NAMES) ||
      !TOOLCRAFT_MODEL_IMPORT_LIMIT_NAMES.every(
        (name) => ownValue(value, name) === expected[name],
      )) {
    return undefined;
  }
  return Object.freeze({ ...expected });
}

const statisticNames = [
  "boundaryEdgeCount",
  "componentCount",
  "decodedBytes",
  "edgeCount",
  "estimatedPeakWorkerBytes",
  "estimatedRepairBytes",
  "nodeCount",
  "nonManifoldEdgeCount",
  "nonManifoldVertexCount",
  "primitiveCount",
  "triangleCount",
  "unusedVertexCount",
  "vertexCount",
] as const satisfies readonly (keyof ToolcraftModelTopologyStatistics)[];

function readStatistics(
  value: unknown,
  limits: Readonly<ToolcraftModelImportLimits>,
): ToolcraftModelTopologyStatistics | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, statisticNames)) return undefined;
  const values = Object.fromEntries(
    statisticNames.map((name) => [name, ownValue(value, name)]),
  ) as Record<(typeof statisticNames)[number], unknown>;
  if (!statisticNames.every((name) => nonNegativeSafeInteger(values[name]))) {
    return undefined;
  }
  const statistics = values as unknown as ToolcraftModelTopologyStatistics;
  const valid = statistics.triangleCount <= limits.maxTriangles &&
    statistics.vertexCount <= limits.maxVertices &&
    statistics.nodeCount <= limits.maxNodes &&
    statistics.primitiveCount <= limits.maxPrimitives &&
    statistics.decodedBytes <= limits.maxDecodedBytes &&
    statistics.estimatedPeakWorkerBytes <= limits.maxEstimatedWorkerBytes &&
    statistics.estimatedRepairBytes <= limits.maxEstimatedWorkerBytes &&
    statistics.edgeCount <= statistics.triangleCount * 3 &&
    statistics.boundaryEdgeCount <= statistics.edgeCount &&
    statistics.nonManifoldEdgeCount <= statistics.edgeCount &&
    statistics.nonManifoldVertexCount <= statistics.vertexCount &&
    statistics.unusedVertexCount <= statistics.vertexCount &&
    statistics.componentCount <= statistics.triangleCount + statistics.primitiveCount;
  return valid ? Object.freeze({ ...statistics }) : undefined;
}

function readAnalysis(
  value: unknown,
  context: ToolcraftModelWorkerValidationContext,
): ToolcraftModelWorkerAnalysisSummary | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "analyzerVersion",
    "diagnostics",
    "limits",
    "outcome",
    "profile",
    "statistics",
  ])) return undefined;
  const rawDiagnostics = ownValue(value, "diagnostics");
  if (!Array.isArray(rawDiagnostics) ||
      rawDiagnostics.length > TOOLCRAFT_MODEL_WORKER_MAX_DIAGNOSTICS) return undefined;
  const diagnostics: ToolcraftModelTopologyDiagnostic[] = [];
  for (let index = 0; index < rawDiagnostics.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(rawDiagnostics, index)) return undefined;
    const item = readDiagnostic(rawDiagnostics[index], true);
    if (!item) return undefined;
    diagnostics.push(item);
  }
  const limits = readLimits(ownValue(value, "limits"), context.limits);
  const statistics = readStatistics(ownValue(value, "statistics"), context.limits);
  const outcome = ownValue(value, "outcome");
  const profile = ownValue(value, "profile");
  if (ownValue(value, "analyzerVersion") !== TOOLCRAFT_MODEL_TOPOLOGY_ANALYZER_VERSION ||
      !limits || !statistics ||
      (outcome !== "clean" && outcome !== "fatal" &&
        outcome !== "repairable" && outcome !== "warning") ||
      (profile !== "realtime-mesh" && profile !== "solid-mesh") ||
      (context.topologyProfile !== undefined && profile !== context.topologyProfile)) {
    return undefined;
  }
  return Object.freeze({
    analyzerVersion: TOOLCRAFT_MODEL_TOPOLOGY_ANALYZER_VERSION,
    diagnostics: Object.freeze(diagnostics),
    limits,
    outcome,
    profile,
    statistics,
  });
}

function readEnvelope(
  value: unknown,
  limits: Readonly<ToolcraftModelImportLimits>,
): ToolcraftModelRepairPlanEnvelope | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "bytes",
    "envelopeDigest",
    "planDigest",
    "version",
  ])) return undefined;
  const bytes = ownValue(value, "bytes");
  const envelopeDigest = ownValue(value, "envelopeDigest");
  const planDigest = ownValue(value, "planDigest");
  if (!arrayBuffer(bytes, getToolcraftModelRepairPlanEnvelopeByteLimit(limits)) ||
      !digest(envelopeDigest) || !digest(planDigest) || ownValue(value, "version") !== 1) {
    return undefined;
  }
  return Object.freeze({ bytes, envelopeDigest, planDigest, version: 1 });
}

function hasConsistentOutcomeEvidence(
  analysis: ToolcraftModelWorkerAnalysisSummary,
  hasEnvelope: boolean,
  operation: ToolcraftModelWorkerExpectedOperation,
): boolean {
  const severities = new Set(analysis.diagnostics.map(({ severity }) => severity));
  const hasFatal = severities.has("fatal");
  const hasRepairable = severities.has("repairable");
  const hasWarning = severities.has("warning");

  if (operation === "repair") {
    return !hasEnvelope && !hasFatal && !hasRepairable &&
      (analysis.outcome === "warning"
        ? hasWarning
        : analysis.outcome === "clean" && !hasWarning);
  }

  if (analysis.outcome === "fatal") {
    return hasFatal && !hasEnvelope;
  }
  if (analysis.outcome === "repairable") {
    return !hasFatal && hasRepairable && hasEnvelope;
  }
  if (analysis.outcome === "warning") {
    return !hasFatal && !hasRepairable && hasWarning && !hasEnvelope;
  }
  return analysis.outcome === "clean" && !hasFatal && !hasRepairable &&
    !hasWarning && !hasEnvelope;
}

function readPackageResult(
  value: unknown,
  context: ToolcraftModelWorkerValidationContext,
): ToolcraftModelPackageExtractWorkerResult | undefined {
  if (
    !isRecord(value) ||
    context.expectedOperation !== "extract-model-package" ||
    !hasOnlyKeys(value, [
      "archiveDigest",
      "entries",
      "operation",
      "receiptDigest",
    ]) ||
    ownValue(value, "operation") !== "extract-model-package"
  ) {
    return undefined;
  }
  const archiveDigest = ownValue(value, "archiveDigest");
  const rawEntries = ownValue(value, "entries");
  const receiptDigest = ownValue(value, "receiptDigest");
  if (
    !digest(archiveDigest) ||
    archiveDigest !== context.expectedArchiveDigest ||
    !digest(receiptDigest) ||
    !Array.isArray(rawEntries) ||
    rawEntries.length === 0 ||
    rawEntries.length > context.limits.maxArchiveEntries
  ) {
    return undefined;
  }
  const entries: ToolcraftModelPackageExtractWorkerResult["entries"][number][] = [];
  const paths = new Set<string>();
  let totalCompressedBytes = 0;
  let totalUncompressedBytes = 0;
  for (let index = 0; index < rawEntries.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(rawEntries, index)) return undefined;
    const rawEntry = rawEntries[index];
    if (!isRecord(rawEntry) || !hasOnlyKeys(rawEntry, [
      "bytes",
      "compressedBytes",
      "contentDigest",
      "mimeType",
      "path",
      "uncompressedBytes",
    ])) return undefined;
    const bytes = ownValue(rawEntry, "bytes");
    const compressedBytes = ownValue(rawEntry, "compressedBytes");
    const contentDigest = ownValue(rawEntry, "contentDigest");
    const mimeType = ownValue(rawEntry, "mimeType");
    const path = ownValue(rawEntry, "path");
    const uncompressedBytes = ownValue(rawEntry, "uncompressedBytes");
    const byteLength = arrayBufferByteLength(
      bytes,
      context.limits.maxArchiveEntryBytes,
      true,
    );
    if (
      byteLength === undefined ||
      !nonNegativeSafeInteger(compressedBytes) ||
      !nonNegativeSafeInteger(uncompressedBytes) ||
      byteLength !== uncompressedBytes ||
      !digest(contentDigest) ||
      !boundedString(mimeType, 128) ||
      !boundedString(path, context.limits.maxArchivePathLength) ||
      normalizeToolcraftModelPackagePath(
        path,
        context.limits.maxArchivePathLength,
      ) !== path ||
      paths.has(path)
    ) {
      return undefined;
    }
    if (
      totalCompressedBytes > context.limits.maxSourceBytes - compressedBytes ||
      totalUncompressedBytes >
        context.limits.maxArchiveUncompressedBytes - uncompressedBytes ||
      (uncompressedBytes > 0 &&
        uncompressedBytes / Math.max(compressedBytes, 1) >
          context.limits.maxArchiveCompressionRatio)
    ) {
      return undefined;
    }
    paths.add(path);
    totalCompressedBytes += compressedBytes;
    totalUncompressedBytes += uncompressedBytes;
    entries.push(Object.freeze({
      bytes: bytes as ArrayBuffer,
      compressedBytes,
      contentDigest,
      mimeType,
      path,
      uncompressedBytes,
    }));
  }
  if (
    totalUncompressedBytes > 0 &&
    totalUncompressedBytes / Math.max(totalCompressedBytes, 1) >
      context.limits.maxArchiveCompressionRatio
  ) {
    return undefined;
  }
  return Object.freeze({
    archiveDigest,
    entries: Object.freeze(entries),
    operation: "extract-model-package",
    receiptDigest,
  });
}

function readResult(
  value: unknown,
  context: ToolcraftModelWorkerValidationContext,
): ToolcraftModelWorkerResult | undefined {
  if (!isRecord(value)) return undefined;
  const operation = ownValue(value, "operation");
  const decode = operation === "decode-and-analyze";
  const allowed = decode
    ? ["analysis", "appearanceResources", "canonicalDocument",
        "canonicalDocumentDigest", "operation", "receiptDigest",
        "repairPlanEnvelope"]
    : ["analysis", "canonicalDocument", "canonicalDocumentDigest", "operation",
        "receiptDigest", "repairPlanDigest"];
  if (!hasOnlyKeys(value, allowed) || operation !== context.expectedOperation) {
    return undefined;
  }
  const canonicalDocument = ownValue(value, "canonicalDocument");
  const canonicalDocumentDigest = ownValue(value, "canonicalDocumentDigest");
  const receiptDigest = ownValue(value, "receiptDigest");
  const analysis = readAnalysis(ownValue(value, "analysis"), context);
  if (!arrayBuffer(canonicalDocument, context.limits.maxDecodedBytes) ||
      !digest(canonicalDocumentDigest) || !digest(receiptDigest) || !analysis) {
    return undefined;
  }
  if (decode) {
    const appearanceResources = readAppearanceResources(
      ownValue(value, "appearanceResources"),
      context.limits,
    );
    if (!appearanceResources) return undefined;
    const rawEnvelope = ownValue(value, "repairPlanEnvelope");
    const envelope = rawEnvelope === INVALID
      ? undefined
      : readEnvelope(rawEnvelope, context.limits);
    if ((rawEnvelope !== INVALID && !envelope) ||
        !hasConsistentOutcomeEvidence(
          analysis,
          envelope !== undefined,
          "decode-and-analyze",
        )) {
      return undefined;
    }
    return Object.freeze({
      analysis,
      appearanceResources,
      canonicalDocument,
      canonicalDocumentDigest,
      operation: "decode-and-analyze",
      ...(envelope === undefined ? {} : { repairPlanEnvelope: envelope }),
      receiptDigest,
    });
  }
  const repairPlanDigest = ownValue(value, "repairPlanDigest");
  const expectedEnvelope = context.expectedRepairPlanEnvelope;
  if (!digest(repairPlanDigest) || !expectedEnvelope ||
      repairPlanDigest !== expectedEnvelope.planDigest ||
      !hasConsistentOutcomeEvidence(analysis, false, "repair")) {
    return undefined;
  }
  return Object.freeze({
    analysis,
    canonicalDocument,
    canonicalDocumentDigest,
    operation: "repair",
    receiptDigest,
    repairPlanDigest,
  });
}

function readDraft(
  value: unknown,
  context: ToolcraftModelWorkerValidationContext,
): ToolcraftModelWorkerDraft | undefined {
  if (
    context.expectedOperation !== "decode-and-analyze" ||
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "appearanceResources",
      "canonicalDocument",
      "canonicalDocumentDigest",
      "receiptDigest",
    ])
  ) {
    return undefined;
  }
  const canonicalDocument = ownValue(value, "canonicalDocument");
  const canonicalDocumentDigest = ownValue(value, "canonicalDocumentDigest");
  const receiptDigest = ownValue(value, "receiptDigest");
  const appearanceResources = readAppearanceResources(
    ownValue(value, "appearanceResources"),
    context.limits,
  );
  if (
    !arrayBuffer(canonicalDocument, context.limits.maxDecodedBytes) ||
    !digest(canonicalDocumentDigest) ||
    !digest(receiptDigest) ||
    !appearanceResources
  ) {
    return undefined;
  }
  return Object.freeze({
    appearanceResources,
    canonicalDocument,
    canonicalDocumentDigest,
    receiptDigest,
  });
}

export function readToolcraftModelWorkerMessageIdentity(
  value: unknown,
): ToolcraftModelWorkerMessageIdentity | undefined {
  try {
    if (!isRecord(value)) return undefined;
    const generation = ownValue(value, "generation");
    const jobId = ownValue(value, "jobId");
    if (!Number.isSafeInteger(generation) || (generation as number) <= 0 ||
        !boundedString(jobId, MAX_JOB_ID_LENGTH)) return undefined;
    return Object.freeze({ generation: generation as number, jobId });
  } catch {
    return undefined;
  }
}

export function validateToolcraftModelWorkerResponse(
  value: unknown,
  context: ToolcraftModelWorkerValidationContext,
): ToolcraftModelWorkerResponse | undefined {
  try {
    const identity = readToolcraftModelWorkerMessageIdentity(value);
    if (!identity || !isRecord(value)) return undefined;
    const kind = ownValue(value, "kind");
    if (kind === "cancelled" &&
        hasOnlyKeys(value, ["generation", "jobId", "kind"])) {
      return Object.freeze({ ...identity, kind });
    }
    if (kind === "error" &&
        hasOnlyKeys(value, ["feedback", "generation", "jobId", "kind"])) {
      const feedback = readFeedback(ownValue(value, "feedback"));
      return feedback ? Object.freeze({ ...identity, feedback, kind }) : undefined;
    }
    if (kind === "draft" &&
        hasOnlyKeys(value, ["draft", "generation", "jobId", "kind"])) {
      const draft = readDraft(ownValue(value, "draft"), context);
      return draft ? Object.freeze({ ...identity, draft, kind }) : undefined;
    }
    if (kind === "diagnostic" &&
        hasOnlyKeys(value, ["diagnostic", "generation", "jobId", "kind"])) {
      const diagnostic = readDiagnostic(ownValue(value, "diagnostic"));
      return diagnostic ? Object.freeze({ ...identity, diagnostic, kind }) : undefined;
    }
    if (kind === "progress" && hasOnlyKeys(
      value,
      ["generation", "jobId", "kind", "phase", "progress"],
    )) {
      const phase = ownValue(value, "phase");
      const progress = ownValue(value, "progress");
      return (phase === "analyzing" || phase === "decoding" ||
        phase === "extracting" || phase === "repairing") &&
        typeof progress === "number" && Number.isFinite(progress) &&
        progress >= 0 && progress < 1
        ? Object.freeze({ ...identity, kind, phase, progress })
        : undefined;
    }
    if (kind === "result" &&
        hasOnlyKeys(value, ["generation", "jobId", "kind", "result"])) {
      const result = readResult(ownValue(value, "result"), context);
      return result ? Object.freeze({ ...identity, kind, result }) : undefined;
    }
    if (kind === "package-result" &&
        hasOnlyKeys(value, ["generation", "jobId", "kind", "result"])) {
      const result = readPackageResult(ownValue(value, "result"), context);
      return result ? Object.freeze({ ...identity, kind, result }) : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export type ToolcraftModelWorkerResponseLifecycle = Readonly<{
  accept: (response: ToolcraftModelWorkerResponse) => boolean;
}>;

export function createToolcraftModelWorkerResponseLifecycle(
  operation: ToolcraftModelWorkerExpectedOperation,
): ToolcraftModelWorkerResponseLifecycle {
  const progress = new Map<string, number>();
  let diagnosticCount = 0;
  let draftAccepted = false;
  let phaseRank = -1;
  let terminalAccepted = false;
  return Object.freeze({
    accept: (response) => {
      if (terminalAccepted) return false;
      if (response.kind === "error" || response.kind === "cancelled") {
        terminalAccepted = true;
        return true;
      }
      const finalRank = operation === "decode-and-analyze" ? 1 : 0;
      if (response.kind === "progress") {
        const rank = operation === "decode-and-analyze"
          ? response.phase === "decoding" ? 0 : response.phase === "analyzing" ? 1 : -1
          : operation === "extract-model-package"
            ? response.phase === "extracting" ? 0 : -1
          : response.phase === "repairing" ? 0 : -1;
        const previous = progress.get(response.phase) ?? -1;
        if (rank < 0 || rank < phaseRank || rank > phaseRank + 1 ||
            (operation === "decode-and-analyze" && rank === 1 && !draftAccepted) ||
            response.progress <= previous) return false;
        phaseRank = Math.max(phaseRank, rank);
        progress.set(response.phase, response.progress);
        return true;
      }
      if (response.kind === "draft") {
        if (operation !== "decode-and-analyze" || draftAccepted || phaseRank !== 0) {
          return false;
        }
        draftAccepted = true;
        return true;
      }
      if (response.kind === "diagnostic") {
        diagnosticCount += 1;
        return operation !== "extract-model-package" && phaseRank === finalRank &&
          diagnosticCount <= TOOLCRAFT_MODEL_WORKER_MAX_DIAGNOSTICS;
      }
      const accepted = phaseRank === finalRank &&
        (operation !== "decode-and-analyze" || draftAccepted) &&
        (operation === "extract-model-package"
          ? response.kind === "package-result" &&
            response.result.operation === operation
          : response.kind === "result" && response.result.operation === operation);
      if (accepted) terminalAccepted = true;
      return accepted;
    },
  });
}
