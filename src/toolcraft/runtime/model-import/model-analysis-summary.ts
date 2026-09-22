import type { ToolcraftSourceAssetFeedback } from "../source-assets/source-asset-types";
import type {
  ToolcraftModelAnalysisSummary,
  ToolcraftModelDiagnostic,
  ToolcraftModelTopologyDiagnostic,
  ToolcraftModelWorkerAnalysisSummary,
} from "./model-import-types";

export type ProjectToolcraftModelAnalysisSummaryOptions = Readonly<{
  repairPlanRef?: string | undefined;
}>;

export class ToolcraftModelAnalysisProjectionError
  extends Error
  implements ToolcraftSourceAssetFeedback
{
  readonly category = "topology" as const;
  readonly code = "model-analysis-projection-invalid" as const;

  constructor(message: string) {
    super(message);
    this.name = "ToolcraftModelAnalysisProjectionError";
  }
}

function invalid(message: string): never {
  throw new ToolcraftModelAnalysisProjectionError(message);
}

function snapshotDiagnostic(
  diagnostic: ToolcraftModelDiagnostic | ToolcraftModelTopologyDiagnostic,
): ToolcraftModelDiagnostic {
  if (
    !Number.isSafeInteger(diagnostic.affectedCount) ||
    diagnostic.affectedCount < 0 ||
    typeof diagnostic.code !== "string" ||
    diagnostic.code.length === 0 ||
    typeof diagnostic.explanation !== "string" ||
    diagnostic.explanation.length === 0 ||
    (diagnostic.severity !== "fatal" &&
      diagnostic.severity !== "info" &&
      diagnostic.severity !== "repairable" &&
      diagnostic.severity !== "warning") ||
    (diagnostic.primitiveId !== undefined &&
      (typeof diagnostic.primitiveId !== "string" ||
        diagnostic.primitiveId.length === 0))
  ) {
    return invalid("Model analysis projection contains an invalid diagnostic.");
  }
  return Object.freeze({
    affectedCount: diagnostic.affectedCount,
    code: diagnostic.code,
    explanation: diagnostic.explanation,
    ...(diagnostic.primitiveId === undefined
      ? {}
      : { primitiveId: diagnostic.primitiveId }),
    severity: diagnostic.severity,
  });
}

function diagnosticIdentity(diagnostic: ToolcraftModelDiagnostic): string {
  return JSON.stringify([
    diagnostic.affectedCount,
    diagnostic.code,
    diagnostic.explanation,
    diagnostic.primitiveId ?? null,
    diagnostic.severity,
  ]);
}

function assertStatistics(
  summary: ToolcraftModelWorkerAnalysisSummary,
): void {
  const selected = [
    summary.statistics.boundaryEdgeCount,
    summary.statistics.componentCount,
    summary.statistics.nonManifoldEdgeCount,
    summary.statistics.triangleCount,
    summary.statistics.vertexCount,
  ];
  if (selected.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    invalid("Model analysis projection contains invalid statistics.");
  }
}

function assertOutcomeConsistency(
  summary: ToolcraftModelWorkerAnalysisSummary,
  repairPlanRef: string | undefined,
): void {
  if (
    repairPlanRef !== undefined &&
    (repairPlanRef.length === 0 ||
      repairPlanRef.trim() !== repairPlanRef ||
      repairPlanRef.includes("\0"))
  ) {
    invalid("Model analysis projection repair plan ref is invalid.");
  }
  const severities = new Set(summary.diagnostics.map(({ severity }) => severity));
  const hasFatal = severities.has("fatal");
  const hasRepairable = severities.has("repairable");
  const hasWarning = severities.has("warning");
  const consistent = summary.outcome === "fatal"
    ? hasFatal && repairPlanRef === undefined
    : summary.outcome === "repairable"
      ? !hasFatal && hasRepairable && repairPlanRef !== undefined
      : summary.outcome === "warning"
        ? !hasFatal && !hasRepairable && hasWarning && repairPlanRef === undefined
        : summary.outcome === "clean"
          ? !hasFatal && !hasRepairable && !hasWarning && repairPlanRef === undefined
          : false;
  if (!consistent) {
    invalid("Model analysis projection outcome is inconsistent with its evidence.");
  }
}

export function projectToolcraftModelAnalysisSummary(
  summary: ToolcraftModelWorkerAnalysisSummary,
  options: ProjectToolcraftModelAnalysisSummaryOptions = {},
): ToolcraftModelAnalysisSummary {
  if (!Array.isArray(summary.diagnostics)) {
    return invalid("Model analysis projection diagnostics must be an array.");
  }
  const diagnostics: ToolcraftModelDiagnostic[] = [];
  for (let index = 0; index < summary.diagnostics.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(summary.diagnostics, index)) {
      return invalid("Model analysis projection diagnostics cannot be sparse.");
    }
    diagnostics.push(snapshotDiagnostic(summary.diagnostics[index]!));
  }
  assertStatistics(summary);
  assertOutcomeConsistency(summary, options.repairPlanRef);
  return Object.freeze({
    boundaryEdges: summary.statistics.boundaryEdgeCount,
    diagnostics: Object.freeze(diagnostics),
    disconnectedComponents: summary.statistics.componentCount,
    nonManifoldEdges: summary.statistics.nonManifoldEdgeCount,
    outcome: summary.outcome === "warning" ? "clean" : summary.outcome,
    ...(options.repairPlanRef === undefined
      ? {}
      : { repairPlanRef: options.repairPlanRef }),
    triangles: summary.statistics.triangleCount,
    vertices: summary.statistics.vertexCount,
  });
}

export function mergeToolcraftModelAnalysisDiagnostics(
  summary: ToolcraftModelAnalysisSummary,
  streamedDiagnostics: readonly ToolcraftModelDiagnostic[],
): ToolcraftModelAnalysisSummary {
  const existing = new Set(summary.diagnostics.map(diagnosticIdentity));
  const additional: ToolcraftModelDiagnostic[] = [];
  for (const diagnostic of streamedDiagnostics) {
    const snapshot = snapshotDiagnostic(diagnostic);
    const identity = diagnosticIdentity(snapshot);
    if (existing.has(identity)) continue;
    existing.add(identity);
    additional.push(snapshot);
  }
  if (additional.length === 0) return summary;
  return Object.freeze({
    ...summary,
    diagnostics: Object.freeze([...additional, ...summary.diagnostics]),
  });
}
