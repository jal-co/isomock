import type {
  ToolcraftModelDiagnostic,
  ToolcraftModelTopologyDiagnostic,
  ToolcraftModelTopologySeverity,
  ToolcraftModelWorkerAnalysisSummary,
} from "../model-import-types";
import type { ToolcraftModelRepairOperation } from "../topology/model-repair-plan";
import type { ToolcraftModelAnalysis } from "../topology/model-topology-types";
import {
  TOOLCRAFT_MODEL_WORKER_DIAGNOSTIC_CODE_MAX_LENGTH,
  TOOLCRAFT_MODEL_WORKER_DIAGNOSTIC_EXPLANATION_MAX_LENGTH,
  TOOLCRAFT_MODEL_WORKER_DIAGNOSTIC_ID_MAX_LENGTH,
  TOOLCRAFT_MODEL_WORKER_MAX_DIAGNOSTICS,
} from "./model-import-worker-protocol";

type DiagnosticShape = Readonly<{
  affectedCount: number;
  code: string;
  explanation: string;
  primitiveId?: string;
  primitiveIndex?: number;
  severity: ToolcraftModelTopologySeverity;
}>;

const severityRank: Readonly<Record<ToolcraftModelTopologySeverity, number>> =
  Object.freeze({ fatal: 4, info: 1, repairable: 3, warning: 2 });

function boundedRequiredString(
  value: string,
  fallback: string,
  maxLength: number,
): string {
  const normalized = value.length === 0 ? fallback : value;
  return normalized.slice(0, maxLength);
}

function snapshotAffectedCount(value: number): number {
  return Number.isSafeInteger(value) && value >= 0
    ? value
    : Number.MAX_SAFE_INTEGER;
}

function snapshotSeverity(value: ToolcraftModelTopologySeverity):
ToolcraftModelTopologySeverity {
  return value === "fatal" || value === "info" || value === "repairable" ||
    value === "warning" ? value : "warning";
}

function snapshotWorkerDiagnostic(diagnostic: DiagnosticShape): ToolcraftModelDiagnostic {
  const primitiveId = diagnostic.primitiveId === undefined
    ? undefined
    : boundedRequiredString(
        diagnostic.primitiveId,
        "unknown-primitive",
        TOOLCRAFT_MODEL_WORKER_DIAGNOSTIC_ID_MAX_LENGTH,
      );
  return Object.freeze({
    affectedCount: snapshotAffectedCount(diagnostic.affectedCount),
    code: boundedRequiredString(
      diagnostic.code,
      "model-diagnostic",
      TOOLCRAFT_MODEL_WORKER_DIAGNOSTIC_CODE_MAX_LENGTH,
    ),
    explanation: boundedRequiredString(
      diagnostic.explanation,
      "A model diagnostic was reported without an explanation.",
      TOOLCRAFT_MODEL_WORKER_DIAGNOSTIC_EXPLANATION_MAX_LENGTH,
    ),
    ...(primitiveId === undefined ? {} : { primitiveId }),
    severity: snapshotSeverity(diagnostic.severity),
  });
}

function snapshotTopologyDiagnostic(
  diagnostic: ToolcraftModelTopologyDiagnostic,
): ToolcraftModelTopologyDiagnostic {
  const snapshot = snapshotWorkerDiagnostic(diagnostic);
  const primitiveIndex = diagnostic.primitiveIndex;
  return Object.freeze({
    ...snapshot,
    code: snapshot.code as ToolcraftModelTopologyDiagnostic["code"],
    ...(primitiveIndex === undefined || !Number.isSafeInteger(primitiveIndex) ||
        primitiveIndex < 0 ? {} : { primitiveIndex }),
  });
}

function addOmittedCount(current: number, increment: number): number {
  const boundedIncrement = Number.isSafeInteger(increment) && increment > 0
    ? increment
    : Number.MAX_SAFE_INTEGER;
  return current > Number.MAX_SAFE_INTEGER - boundedIncrement
    ? Number.MAX_SAFE_INTEGER
    : current + boundedIncrement;
}

function higherSeverity(
  current: ToolcraftModelTopologySeverity | undefined,
  candidate: ToolcraftModelTopologySeverity,
): ToolcraftModelTopologySeverity {
  return current === undefined || severityRank[candidate] > severityRank[current]
    ? candidate
    : current;
}

function createBoundedDiagnosticSnapshot<
  Input extends DiagnosticShape,
  Output extends DiagnosticShape,
>(
  diagnostics: Iterable<Input>,
  snapshot: (diagnostic: Input) => Output,
): readonly Output[] {
  const retained: Output[] = [];
  let omittedCount = 0;
  let omittedSeverity: ToolcraftModelTopologySeverity | undefined;

  for (const diagnostic of diagnostics) {
    const severity = snapshotSeverity(diagnostic.severity);
    if (diagnostic.code === "diagnostics-truncated") {
      omittedCount = addOmittedCount(omittedCount, diagnostic.affectedCount);
      omittedSeverity = higherSeverity(omittedSeverity, severity);
      continue;
    }
    if (retained.length < TOOLCRAFT_MODEL_WORKER_MAX_DIAGNOSTICS) {
      retained.push(snapshot(diagnostic));
      continue;
    }
    omittedCount = addOmittedCount(omittedCount, 1);
    omittedSeverity = higherSeverity(omittedSeverity, severity);
  }

  if (omittedCount > 0) {
    if (retained.length === TOOLCRAFT_MODEL_WORKER_MAX_DIAGNOSTICS) {
      const displaced = retained.pop()!;
      omittedCount = addOmittedCount(omittedCount, 1);
      omittedSeverity = higherSeverity(omittedSeverity, displaced.severity);
    }
    retained.push(Object.freeze({
      affectedCount: omittedCount,
      code: "diagnostics-truncated",
      explanation: "Additional model diagnostics were omitted at the protected worker limit.",
      severity: omittedSeverity ?? "warning",
    }) as Output);
  }

  return Object.freeze(retained);
}

export function snapshotToolcraftModelWorkerDecodeDiagnostics(
  diagnostics: readonly ToolcraftModelDiagnostic[],
): readonly ToolcraftModelDiagnostic[] {
  return createBoundedDiagnosticSnapshot(diagnostics, snapshotWorkerDiagnostic);
}

export function snapshotToolcraftModelWorkerAnalysis(
  analysis: ToolcraftModelAnalysis,
): ToolcraftModelAnalysis {
  const summary = snapshotToolcraftModelWorkerAnalysisSummary(analysis);
  return Object.freeze({
    ...summary,
    ...(analysis.repairPlan === undefined
      ? {}
      : { repairPlan: analysis.repairPlan }),
  });
}

export function snapshotToolcraftModelWorkerAnalysisSummary(
  analysis: ToolcraftModelAnalysis,
): ToolcraftModelWorkerAnalysisSummary {
  return Object.freeze({
    analyzerVersion: analysis.analyzerVersion,
    diagnostics: createBoundedDiagnosticSnapshot(
      analysis.diagnostics,
      snapshotTopologyDiagnostic,
    ),
    limits: Object.freeze({ ...analysis.limits }),
    outcome: analysis.outcome,
    profile: analysis.profile,
    statistics: Object.freeze({ ...analysis.statistics }),
  });
}

export function snapshotToolcraftModelWorkerDiagnosticStream(
  decoded: readonly ToolcraftModelDiagnostic[],
  analysis: readonly ToolcraftModelTopologyDiagnostic[],
): readonly ToolcraftModelDiagnostic[] {
  function* combined(): Generator<DiagnosticShape> {
    yield* decoded;
    yield* analysis;
  }
  return createBoundedDiagnosticSnapshot(combined(), snapshotWorkerDiagnostic);
}

function addEstimatedBytes(current: number, increment: number): number {
  if (!Number.isSafeInteger(increment) || increment < 0 ||
      current > Number.MAX_SAFE_INTEGER - increment) return Number.MAX_SAFE_INTEGER;
  return current + increment;
}

function estimatedStringBytes(value: string): number {
  const contentBytes = value.length > Math.floor(Number.MAX_SAFE_INTEGER / 2)
    ? Number.MAX_SAFE_INTEGER
    : value.length * 2;
  return addEstimatedBytes(64, contentBytes);
}

function estimatedDiagnosticBytes(diagnostic: DiagnosticShape): number {
  let bytes = 256;
  bytes = addEstimatedBytes(bytes, estimatedStringBytes(diagnostic.code));
  bytes = addEstimatedBytes(bytes, estimatedStringBytes(diagnostic.explanation));
  if (diagnostic.primitiveId !== undefined) {
    bytes = addEstimatedBytes(bytes, estimatedStringBytes(diagnostic.primitiveId));
  }
  return bytes;
}

function estimatedNumberArrayBytes(values: readonly number[]): number {
  const elementBytes = values.length > Math.floor(Number.MAX_SAFE_INTEGER / 16)
    ? Number.MAX_SAFE_INTEGER
    : values.length * 16;
  return addEstimatedBytes(64, elementBytes);
}

function estimatedRepairOperationBytes(
  operation: ToolcraftModelRepairOperation,
): number {
  let bytes = 512;
  bytes = addEstimatedBytes(bytes, estimatedStringBytes(operation.primitiveId));
  bytes = addEstimatedBytes(bytes, estimatedStringBytes(operation.type));
  for (const precondition of operation.safetyPreconditions) {
    bytes = addEstimatedBytes(bytes, estimatedStringBytes(precondition));
  }
  if (operation.type === "compact-unused-vertices") {
    bytes = addEstimatedBytes(
      bytes,
      estimatedNumberArrayBytes(operation.removedVertexIndices),
    );
    return addEstimatedBytes(
      bytes,
      estimatedNumberArrayBytes(operation.retainedVertexIndices),
    );
  }
  if (operation.type === "repair-local-winding") {
    return addEstimatedBytes(
      bytes,
      estimatedNumberArrayBytes(operation.flippedTriangleIndices),
    );
  }
  if (operation.type === "remove-duplicate-triangles" ||
      operation.type === "remove-invalid-triangles") {
    return addEstimatedBytes(
      bytes,
      estimatedNumberArrayBytes(operation.triangleIndices),
    );
  }
  return bytes;
}

export function estimateToolcraftModelWorkerDiagnosticsBytes(
  diagnostics: readonly DiagnosticShape[],
): number {
  let bytes = 128;
  for (const diagnostic of diagnostics) {
    bytes = addEstimatedBytes(bytes, estimatedDiagnosticBytes(diagnostic));
  }
  return bytes;
}

export function estimateToolcraftModelWorkerAnalysisBytes(
  analysis: ToolcraftModelAnalysis,
): number {
  let bytes = addEstimatedBytes(
    2_048,
    estimateToolcraftModelWorkerDiagnosticsBytes(analysis.diagnostics),
  );
  const plan = analysis.repairPlan;
  if (!plan) return bytes;
  bytes = addEstimatedBytes(bytes, 1_024);
  for (const value of [
    plan.algorithmVersion,
    plan.analyzerVersion,
    plan.planDigest,
    plan.profile,
    plan.recipeId,
    plan.sourceDocumentDigest,
  ]) {
    bytes = addEstimatedBytes(bytes, estimatedStringBytes(value));
  }
  for (const operation of plan.operations) {
    bytes = addEstimatedBytes(bytes, estimatedRepairOperationBytes(operation));
  }
  return bytes;
}

export function sumToolcraftModelWorkerEstimatedBytes(
  ...values: readonly number[]
): number {
  return values.reduce(addEstimatedBytes, 0);
}
