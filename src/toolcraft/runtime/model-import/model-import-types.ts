import type {
  ToolcraftModelFormat,
  ToolcraftModelImportLimits,
  ToolcraftModelTopologyProfile,
} from "../schema/types";
import type { ToolcraftSourceAssetFeedback } from "../source-assets/source-asset-types";
import type { ToolcraftModelDocument } from "./canonical/model-document";

export type ToolcraftModelAssetLifecycle =
  | "clean"
  | "fixed"
  | "repairable"
  | "restoring"
  | "unavailable";

export type ToolcraftModelDiagnostic = {
  affectedCount: number;
  code: string;
  explanation: string;
  primitiveId?: string;
  severity: "fatal" | "info" | "repairable" | "warning";
};

export type ToolcraftModelAnalysisSummary = {
  boundaryEdges: number;
  diagnostics: readonly ToolcraftModelDiagnostic[];
  disconnectedComponents: number;
  nonManifoldEdges: number;
  outcome: "clean" | "fatal" | "repairable";
  repairPlanRef?: string;
  triangles: number;
  vertices: number;
};

export type ToolcraftModelTopologySeverity =
  | "fatal"
  | "info"
  | "repairable"
  | "warning";

export type ToolcraftModelTopologyDiagnosticCode =
  | "boundary-edges"
  | "diagnostics-truncated"
  | "disconnected-components"
  | "duplicate-triangles"
  | "empty-primitive"
  | "inconsistent-local-winding"
  | "indices-out-of-range"
  | "invalid-document-bounds"
  | "invalid-index-cardinality"
  | "invalid-index-data"
  | "invalid-position-cardinality"
  | "invalid-primitive-bounds"
  | "non-finite-positions"
  | "non-manifold-edges"
  | "non-manifold-vertices"
  | "non-orientable-component"
  | "no-renderable-triangles"
  | "normals-count-mismatch"
  | "normals-missing"
  | "normals-non-finite"
  | "normals-zero-length"
  | "repeated-index-triangles"
  | "resource-estimate"
  | "resource-limit-exceeded"
  | "unused-vertices"
  | "zero-area-triangles";

export type ToolcraftModelTopologyDiagnostic = Readonly<{
  affectedCount: number;
  code: ToolcraftModelTopologyDiagnosticCode;
  explanation: string;
  primitiveId?: string;
  primitiveIndex?: number;
  severity: ToolcraftModelTopologySeverity;
}>;

export type ToolcraftModelTopologyStatistics = Readonly<{
  boundaryEdgeCount: number;
  componentCount: number;
  decodedBytes: number;
  edgeCount: number;
  estimatedPeakWorkerBytes: number;
  estimatedRepairBytes: number;
  nodeCount: number;
  nonManifoldEdgeCount: number;
  nonManifoldVertexCount: number;
  primitiveCount: number;
  triangleCount: number;
  unusedVertexCount: number;
  vertexCount: number;
}>;

export type ToolcraftModelAnalysisOutcome =
  | "clean"
  | "fatal"
  | "repairable"
  | "warning";

export type ToolcraftModelWorkerAnalysisSummary = Readonly<{
  analyzerVersion: string;
  diagnostics: readonly ToolcraftModelTopologyDiagnostic[];
  limits: Readonly<ToolcraftModelImportLimits>;
  outcome: ToolcraftModelAnalysisOutcome;
  profile: ToolcraftModelTopologyProfile;
  statistics: ToolcraftModelTopologyStatistics;
}>;

export type ToolcraftModelAssetRecord = {
  activeDocumentRef: string;
  analysis: ToolcraftModelAnalysisSummary;
  appliedRepairRecipeId?: string;
  lastRepairError?: ToolcraftSourceAssetFeedback;
  lifecycle: ToolcraftModelAssetLifecycle;
  originalDocumentRef: string;
  originalAnalysis: ToolcraftModelAnalysisSummary;
  repairedDocumentRef?: string;
  sourceBundleDigest: string;
  sourceBundleRef: string;
  topologyProfile: ToolcraftModelTopologyProfile;
};

export type ToolcraftModelSourceFile = {
  byteLength: number;
  contentDigest: string;
  displayName: string;
  mimeType: string;
  path: string;
  resourceRef: string;
};

export type ToolcraftModelPackageEntryDescriptor = {
  byteLength: number;
  contentDigest: string;
  mimeType: string;
  path: string;
};

export type ToolcraftModelArchiveSource = {
  byteLength: number;
  contentDigest: string;
  displayName: string;
  mimeType: "application/zip";
  resourceRef: string;
};

export type ToolcraftModelPackageSource =
  | { kind: "selected-files" }
  | {
      archive: ToolcraftModelArchiveSource;
      entries: readonly ToolcraftModelPackageEntryDescriptor[];
      kind: "zip";
    };

export type ToolcraftModelPackageDiagnostic = {
  affectedCount: number;
  code: "ignored-model-root";
  explanation: string;
  severity: "info";
};

export type ToolcraftModelSourceBundle = {
  adapter: {
    adapterVersion: string;
    format: ToolcraftModelFormat;
    rootExtension: string;
  };
  aggregateByteLength: number;
  aggregateDigest: string;
  descriptorVersion: 2;
  diagnostics: readonly ToolcraftModelPackageDiagnostic[];
  packageSource: ToolcraftModelPackageSource;
  rootPath: string;
  sourceFiles: readonly ToolcraftModelSourceFile[];
};

export type ToolcraftModelSourceBundleTransfer = {
  aggregateDigest: string;
  rootPath: string;
  sourceFiles: readonly {
    bytes: ArrayBuffer;
    contentDigest: string;
    mimeType: string;
    path: string;
  }[];
};

export type ToolcraftModelDecodeContext = {
  bundle: ToolcraftModelSourceBundleTransfer;
  limits: ToolcraftModelImportLimits;
  signal: AbortSignal;
};

export type ToolcraftModelAppearanceResource = Readonly<{
  bytes: ArrayBuffer;
  contentDigest: string;
  mimeType: "image/avif" | "image/jpeg" | "image/png" | "image/webp";
  resourceRef: string;
}>;

export type ToolcraftModelDecodeResult = {
  appearanceResources: readonly ToolcraftModelAppearanceResource[];
  diagnostics: readonly ToolcraftModelDiagnostic[];
  document: ToolcraftModelDocument;
};

export type ToolcraftModelFormatAdapter = {
  adapterVersion: string;
  decode: (
    context: ToolcraftModelDecodeContext,
  ) => Promise<ToolcraftModelDecodeResult>;
  format: ToolcraftModelFormat;
  rootExtensions: readonly string[];
  workerCapable: true;
};
