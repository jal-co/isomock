import type {
  ToolcraftModelAnalysisSummary,
  ToolcraftModelDiagnostic,
} from "../model-import/model-import-types";
import type { ToolcraftSourceAssetFeedback } from "../source-assets/source-asset-types";
import { readCanvasSize, readPoint } from "./persistence-reader-primitives";
import {
  isToolcraftFiniteNumber,
  isToolcraftPersistenceRecord,
} from "./persistence-shared";
import type {
  ToolcraftFileAsset,
  ToolcraftImageAsset,
  ToolcraftMediaAsset,
  ToolcraftMediaTransform,
  ToolcraftModelAsset,
} from "./types";

type PersistedMediaBase = Pick<
  ToolcraftMediaAsset,
  "fileName" | "id" | "layerId" | "mimeType"
> & {
  sourcePaths?: readonly string[];
  sourceTarget?: string;
};

const diagnosticSeverities = new Set<ToolcraftModelDiagnostic["severity"]>([
  "fatal",
  "info",
  "repairable",
  "warning",
]);
const feedbackCategories = new Set<ToolcraftSourceAssetFeedback["category"]>([
  "bundle",
  "format",
  "geometry",
  "repair",
  "resource-limit",
  "resource-unavailable",
  "topology",
]);

function readMediaBase(
  value: Record<string, unknown>,
): PersistedMediaBase | undefined {
  if (
    typeof value.id !== "string" ||
    typeof value.layerId !== "string" ||
    typeof value.fileName !== "string" ||
    typeof value.mimeType !== "string" ||
    (value.sourcePaths !== undefined &&
      (!Array.isArray(value.sourcePaths) ||
        !value.sourcePaths.every((path) => typeof path === "string" && path.length > 0)))
  ) {
    return undefined;
  }

  return {
    fileName: value.fileName,
    id: value.id,
    layerId: value.layerId,
    mimeType: value.mimeType,
    ...(Array.isArray(value.sourcePaths) ? { sourcePaths: [...value.sourcePaths] } : {}),
    ...(typeof value.sourceTarget === "string"
      ? { sourceTarget: value.sourceTarget }
      : {}),
  };
}

function readMediaTransform(
  value: unknown,
): ToolcraftMediaTransform | undefined {
  if (!isToolcraftPersistenceRecord(value)) {
    return undefined;
  }

  const transform: ToolcraftMediaTransform = {};

  if (typeof value.flipHorizontal === "boolean") {
    transform.flipHorizontal = value.flipHorizontal;
  }

  if (typeof value.flipVertical === "boolean") {
    transform.flipVertical = value.flipVertical;
  }

  if (
    value.rotationDeg === 0 ||
    value.rotationDeg === 90 ||
    value.rotationDeg === 180 ||
    value.rotationDeg === 270
  ) {
    transform.rotationDeg = value.rotationDeg;
  }

  return Object.keys(transform).length > 0 ? transform : undefined;
}

function readImageAsset(
  value: Record<string, unknown>,
  base: PersistedMediaBase,
): ToolcraftImageAsset | undefined {
  const position = readPoint(value.position);

  const resourceRef =
    typeof value.resourceRef === "string" ? value.resourceRef : undefined;

  if (!resourceRef || !position || Object.hasOwn(value, "dataUrl")) {
    return undefined;
  }

  const size = readCanvasSize(value.size);
  const sourceSize = readCanvasSize(value.sourceSize);
  const transform = readMediaTransform(value.transform);

  if (!size || !sourceSize) return undefined;
  return {
    ...base,
    assetKind: "image",
    lifecycle: "restoring",
    position,
    resourceRef,
    size,
    sourceSize,
    ...(transform ? { transform } : {}),
  };
}

function readFileAsset(
  value: Record<string, unknown>,
  base: PersistedMediaBase,
): ToolcraftFileAsset | undefined {
  const position = readPoint(value.position);

  const resourceRef =
    typeof value.resourceRef === "string" ? value.resourceRef : undefined;

  if (!resourceRef || !position || Object.hasOwn(value, "dataUrl")) {
    return undefined;
  }

  return {
    ...base,
    assetKind: "file",
    lifecycle: "restoring",
    position,
    resourceRef,
  };
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return isToolcraftFiniteNumber(value) && value >= 0 && Number.isInteger(value)
    ? value
    : undefined;
}

function readModelDiagnostic(
  value: unknown,
): ToolcraftModelDiagnostic | undefined {
  if (!isToolcraftPersistenceRecord(value)) {
    return undefined;
  }

  const affectedCount = readNonNegativeInteger(value.affectedCount);

  if (
    affectedCount === undefined ||
    typeof value.code !== "string" ||
    typeof value.explanation !== "string" ||
    typeof value.severity !== "string" ||
    (Object.hasOwn(value, "primitiveId") &&
      typeof value.primitiveId !== "string") ||
    !diagnosticSeverities.has(
      value.severity as ToolcraftModelDiagnostic["severity"],
    )
  ) {
    return undefined;
  }

  return {
    affectedCount,
    code: value.code,
    explanation: value.explanation,
    severity: value.severity as ToolcraftModelDiagnostic["severity"],
    ...(typeof value.primitiveId === "string"
      ? { primitiveId: value.primitiveId }
      : {}),
  };
}

function readModelAnalysis(
  value: unknown,
): ToolcraftModelAnalysisSummary | undefined {
  if (
    !isToolcraftPersistenceRecord(value) ||
    !Array.isArray(value.diagnostics) ||
    (value.outcome !== "clean" &&
      value.outcome !== "fatal" &&
      value.outcome !== "repairable")
  ) {
    return undefined;
  }

  const diagnostics = value.diagnostics.map(readModelDiagnostic);
  const boundaryEdges = readNonNegativeInteger(value.boundaryEdges);
  const disconnectedComponents = readNonNegativeInteger(
    value.disconnectedComponents,
  );
  const nonManifoldEdges = readNonNegativeInteger(value.nonManifoldEdges);
  const triangles = readNonNegativeInteger(value.triangles);
  const vertices = readNonNegativeInteger(value.vertices);

  if (
    diagnostics.some((diagnostic) => diagnostic === undefined) ||
    boundaryEdges === undefined ||
    disconnectedComponents === undefined ||
    nonManifoldEdges === undefined ||
    triangles === undefined ||
    vertices === undefined ||
    (Object.hasOwn(value, "repairPlanRef") &&
      typeof value.repairPlanRef !== "string")
  ) {
    return undefined;
  }

  return {
    boundaryEdges,
    diagnostics: diagnostics as ToolcraftModelDiagnostic[],
    disconnectedComponents,
    nonManifoldEdges,
    outcome: value.outcome,
    ...(typeof value.repairPlanRef === "string"
      ? { repairPlanRef: value.repairPlanRef }
      : {}),
    triangles,
    vertices,
  };
}

function readSourceAssetFeedback(
  value: unknown,
): ToolcraftSourceAssetFeedback | undefined {
  if (
    !isToolcraftPersistenceRecord(value) ||
    typeof value.category !== "string" ||
    !feedbackCategories.has(
      value.category as ToolcraftSourceAssetFeedback["category"],
    ) ||
    typeof value.code !== "string" ||
    typeof value.message !== "string"
  ) {
    return undefined;
  }

  return {
    category: value.category as ToolcraftSourceAssetFeedback["category"],
    code: value.code,
    message: value.message,
  };
}

function haveEqualModelDiagnostics(
  left: ToolcraftModelDiagnostic,
  right: ToolcraftModelDiagnostic,
): boolean {
  return (
    left.affectedCount === right.affectedCount &&
    left.code === right.code &&
    left.explanation === right.explanation &&
    left.primitiveId === right.primitiveId &&
    left.severity === right.severity
  );
}

function haveEqualModelAnalyses(
  left: ToolcraftModelAnalysisSummary,
  right: ToolcraftModelAnalysisSummary,
): boolean {
  return (
    left.boundaryEdges === right.boundaryEdges &&
    left.disconnectedComponents === right.disconnectedComponents &&
    left.nonManifoldEdges === right.nonManifoldEdges &&
    left.outcome === right.outcome &&
    left.repairPlanRef === right.repairPlanRef &&
    left.triangles === right.triangles &&
    left.vertices === right.vertices &&
    left.diagnostics.length === right.diagnostics.length &&
    left.diagnostics.every((diagnostic, index) =>
      haveEqualModelDiagnostics(diagnostic, right.diagnostics[index]),
    )
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasValidPersistedModelLifecycleEvidence(
  value: Record<string, unknown>,
  analysis: ToolcraftModelAnalysisSummary,
  originalAnalysis: ToolcraftModelAnalysisSummary,
): boolean {
  if (
    !isNonEmptyString(value.activeDocumentRef) ||
    !isNonEmptyString(value.originalDocumentRef)
  ) {
    return false;
  }

  const hasRepairRecipe = isNonEmptyString(value.appliedRepairRecipeId);
  const hasRepairedDocument = isNonEmptyString(value.repairedDocumentRef);
  const hasRepairRecipeField = Object.hasOwn(value, "appliedRepairRecipeId");
  const hasRepairedDocumentField = Object.hasOwn(value, "repairedDocumentRef");
  const hasRepairError = value.lastRepairError !== undefined;

  switch (value.lifecycle) {
    case "clean":
      return (
        value.activeDocumentRef === value.originalDocumentRef &&
        analysis.outcome === "clean" &&
        analysis.repairPlanRef === undefined &&
        haveEqualModelAnalyses(analysis, originalAnalysis) &&
        !hasRepairRecipeField &&
        !hasRepairedDocumentField &&
        !hasRepairError
      );
    case "repairable":
      return (
        value.activeDocumentRef === value.originalDocumentRef &&
        analysis.outcome === "repairable" &&
        isNonEmptyString(analysis.repairPlanRef) &&
        haveEqualModelAnalyses(analysis, originalAnalysis) &&
        !hasRepairRecipeField &&
        !hasRepairedDocumentField
      );
    case "fixed":
      return (
        hasRepairRecipe &&
        hasRepairedDocument &&
        value.activeDocumentRef === value.repairedDocumentRef &&
        value.originalDocumentRef !== value.repairedDocumentRef &&
        analysis.outcome === "clean" &&
        analysis.repairPlanRef === undefined &&
        originalAnalysis.outcome === "repairable" &&
        isNonEmptyString(originalAnalysis.repairPlanRef) &&
        !hasRepairError
      );
    default:
      return false;
  }
}

function readModelAsset(
  value: Record<string, unknown>,
  base: PersistedMediaBase,
): ToolcraftModelAsset | undefined {
  const analysis = readModelAnalysis(value.analysis);
  const originalAnalysis = readModelAnalysis(value.originalAnalysis);
  const position = readPoint(value.position);
  const size = readCanvasSize(value.size);
  const hasValidOptionalRepairFields =
    (!Object.hasOwn(value, "appliedRepairRecipeId") ||
      typeof value.appliedRepairRecipeId === "string") &&
    (!Object.hasOwn(value, "repairedDocumentRef") ||
      typeof value.repairedDocumentRef === "string") &&
    (!Object.hasOwn(value, "lastRepairError") ||
      readSourceAssetFeedback(value.lastRepairError) !== undefined);

  if (
    !analysis ||
    !originalAnalysis ||
    !position ||
    !size ||
    !hasValidOptionalRepairFields ||
    typeof value.activeDocumentRef !== "string" ||
    typeof value.originalDocumentRef !== "string" ||
    !hasValidPersistedModelLifecycleEvidence(
      value,
      analysis,
      originalAnalysis,
    ) ||
    typeof value.sourceBundleDigest !== "string" ||
    typeof value.sourceBundleRef !== "string" ||
    (value.topologyProfile !== "realtime-mesh" &&
      value.topologyProfile !== "solid-mesh")
  ) {
    return undefined;
  }

  const lastRepairError = readSourceAssetFeedback(value.lastRepairError);

  return {
    ...base,
    activeDocumentRef: value.activeDocumentRef,
    analysis,
    assetKind: "model",
    // Model bytes live in the binary repository, not in localStorage. Every
    // persisted model therefore re-enters through the asynchronous hydration
    // boundary before render/export may consume its refs.
    lifecycle: "restoring",
    originalAnalysis,
    originalDocumentRef: value.originalDocumentRef,
    position,
    size,
    sourceBundleDigest: value.sourceBundleDigest,
    sourceBundleRef: value.sourceBundleRef,
    topologyProfile: value.topologyProfile,
    ...(typeof value.appliedRepairRecipeId === "string"
      ? { appliedRepairRecipeId: value.appliedRepairRecipeId }
      : {}),
    ...(lastRepairError ? { lastRepairError } : {}),
    ...(typeof value.repairedDocumentRef === "string"
      ? { repairedDocumentRef: value.repairedDocumentRef }
      : {}),
  };
}

function readMediaAsset(
  value: unknown,
): ToolcraftMediaAsset | undefined {
  if (!isToolcraftPersistenceRecord(value)) {
    return undefined;
  }

  const base = readMediaBase(value);

  if (!base) {
    return undefined;
  }

  switch (value.assetKind) {
    case "file":
      return readFileAsset(value, base);
    case "model":
      return readModelAsset(value, base);
    case "image":
      return readImageAsset(value, base);
    default:
      return undefined;
  }
}

export function readMediaAssets(
  value: unknown,
): ToolcraftMediaAsset[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const assets = value.map(readMediaAsset);
  return assets.some((asset) => asset === undefined)
    ? undefined
    : (assets as ToolcraftMediaAsset[]);
}
