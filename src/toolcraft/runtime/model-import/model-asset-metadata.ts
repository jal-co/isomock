import type { ToolcraftSourceAssetFeedback } from "../source-assets/source-asset-types";
import type {
  ToolcraftModelAnalysisSummary,
  ToolcraftModelAssetRecord,
  ToolcraftModelDiagnostic,
} from "./model-import-types";

export function cloneToolcraftModelDiagnostic(
  diagnostic: ToolcraftModelDiagnostic,
): ToolcraftModelDiagnostic {
  return {
    affectedCount: diagnostic.affectedCount,
    code: diagnostic.code,
    explanation: diagnostic.explanation,
    severity: diagnostic.severity,
    ...(diagnostic.primitiveId !== undefined
      ? { primitiveId: diagnostic.primitiveId }
      : {}),
  };
}

export function cloneToolcraftModelAnalysisSummary(
  analysis: ToolcraftModelAnalysisSummary,
): ToolcraftModelAnalysisSummary {
  return {
    boundaryEdges: analysis.boundaryEdges,
    diagnostics: analysis.diagnostics.map(cloneToolcraftModelDiagnostic),
    disconnectedComponents: analysis.disconnectedComponents,
    nonManifoldEdges: analysis.nonManifoldEdges,
    outcome: analysis.outcome,
    ...(analysis.repairPlanRef !== undefined
      ? { repairPlanRef: analysis.repairPlanRef }
      : {}),
    triangles: analysis.triangles,
    vertices: analysis.vertices,
  };
}

export function cloneToolcraftSourceAssetFeedback(
  feedback: ToolcraftSourceAssetFeedback,
): ToolcraftSourceAssetFeedback {
  return {
    category: feedback.category,
    code: feedback.code,
    message: feedback.message,
  };
}

export function cloneToolcraftModelAssetRecord(
  record: ToolcraftModelAssetRecord,
): ToolcraftModelAssetRecord {
  return {
    activeDocumentRef: record.activeDocumentRef,
    analysis: cloneToolcraftModelAnalysisSummary(record.analysis),
    lifecycle: record.lifecycle,
    originalAnalysis: cloneToolcraftModelAnalysisSummary(record.originalAnalysis),
    originalDocumentRef: record.originalDocumentRef,
    sourceBundleDigest: record.sourceBundleDigest,
    sourceBundleRef: record.sourceBundleRef,
    topologyProfile: record.topologyProfile,
    ...(record.appliedRepairRecipeId !== undefined
      ? { appliedRepairRecipeId: record.appliedRepairRecipeId }
      : {}),
    ...(record.lastRepairError !== undefined
      ? { lastRepairError: cloneToolcraftSourceAssetFeedback(record.lastRepairError) }
      : {}),
    ...(record.repairedDocumentRef !== undefined
      ? { repairedDocumentRef: record.repairedDocumentRef }
      : {}),
  };
}
