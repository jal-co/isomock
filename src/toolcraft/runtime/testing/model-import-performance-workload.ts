import type {
  ResolvedToolcraftControlSchema,
  ResolvedToolcraftModelFileDropSchema,
  ToolcraftModelFormat,
  ToolcraftModelImportLimits,
  ToolcraftModelTopologyProfile,
} from "../schema/types";
import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import { estimateToolcraftCanonicalEncodeWorkerBytesForShape } from "../model-import/canonical/model-document-worker-memory";
import { estimateToolcraftTopologyResources } from "../model-import/topology/model-topology-resources";

export const TOOLCRAFT_MODEL_PERFORMANCE_DEVELOPMENT_PRESSURE = 0.8;

export type ToolcraftModelPerformancePathKind =
  | "analysis-repair"
  | "import"
  | "orbit";

export type ToolcraftModelPerformanceDimensionId =
  | "model-bundle-files"
  | "model-decoded-bytes"
  | "model-nodes"
  | "model-primitives"
  | "model-source-bytes"
  | "model-triangles"
  | "model-vertices"
  | "model-worker-bytes";

type ToolcraftModelPerformanceDimensionLimit =
  | "maxBundleFiles"
  | "maxDecodedBytes"
  | "maxEstimatedWorkerBytes"
  | "maxNodes"
  | "maxPrimitives"
  | "maxSourceBytes"
  | "maxTriangles"
  | "maxVertices";

export type ToolcraftModelPerformanceDimension = Readonly<{
  configuredMaximumValue: number;
  developmentValue: number;
  effectiveMaximumValue: number;
  id: ToolcraftModelPerformanceDimensionId;
  limit: ToolcraftModelPerformanceDimensionLimit;
  targetPressure: number;
  unit: "bytes" | "files" | "nodes" | "primitives" | "triangles" | "vertices";
}>;

export type ToolcraftModelPerformanceCheckpoint = Readonly<{
  combinedPressureRatio: number;
  kind: "development" | "maximum";
  values: Readonly<
    Partial<Record<ToolcraftModelPerformanceDimensionId, number>>
  >;
}>;

export type ToolcraftModelAppearancePerformanceEnvelope = Readonly<{
  configured: Readonly<{
    textureBytes: number;
    textureCount: number;
    textureDimension: number;
    texturePixels: number;
  }>;
  development: Readonly<{
    combinedWorkerBytes: number;
    textureBytes: number;
    textureCount: number;
    textureDimension: number;
    texturePixels: number;
  }>;
  effectiveMaximum: Readonly<{
    combinedWorkerBytes: number;
    textureBytes: number;
    textureCount: number;
    textureDimension: number;
    texturePixels: number;
  }>;
  fitsWorkerLimit: boolean;
}>;

export type ToolcraftModelPerformancePath = Readonly<{
  appearance: ToolcraftModelAppearancePerformanceEnvelope;
  development: ToolcraftModelPerformanceCheckpoint;
  dimensions: readonly ToolcraftModelPerformanceDimension[];
  formats: readonly ToolcraftModelFormat[];
  id: string;
  kind: ToolcraftModelPerformancePathKind;
  maximum: ToolcraftModelPerformanceCheckpoint;
  profile: "batch-responsive" | "interactive-continuous";
  target: string;
  topologyProfile: ToolcraftModelTopologyProfile;
}>;

const dimensionUnits = {
  maxBundleFiles: "files",
  maxDecodedBytes: "bytes",
  maxEstimatedWorkerBytes: "bytes",
  maxNodes: "nodes",
  maxPrimitives: "primitives",
  maxSourceBytes: "bytes",
  maxTriangles: "triangles",
  maxVertices: "vertices",
} as const satisfies Record<
  ToolcraftModelPerformanceDimensionLimit,
  ToolcraftModelPerformanceDimension["unit"]
>;

const dimensionIds = {
  maxBundleFiles: "model-bundle-files",
  maxDecodedBytes: "model-decoded-bytes",
  maxEstimatedWorkerBytes: "model-worker-bytes",
  maxNodes: "model-nodes",
  maxPrimitives: "model-primitives",
  maxSourceBytes: "model-source-bytes",
  maxTriangles: "model-triangles",
  maxVertices: "model-vertices",
} as const satisfies Record<
  ToolcraftModelPerformanceDimensionLimit,
  ToolcraftModelPerformanceDimensionId
>;

const pathDimensions = {
  "analysis-repair": [
    "maxDecodedBytes",
    "maxEstimatedWorkerBytes",
    "maxNodes",
    "maxPrimitives",
    "maxTriangles",
    "maxVertices",
  ],
  import: [
    "maxBundleFiles",
    "maxSourceBytes",
    "maxDecodedBytes",
    "maxEstimatedWorkerBytes",
    "maxNodes",
    "maxPrimitives",
    "maxTriangles",
    "maxVertices",
  ],
  orbit: ["maxNodes", "maxPrimitives", "maxTriangles", "maxVertices"],
} as const satisfies Record<
  ToolcraftModelPerformancePathKind,
  readonly ToolcraftModelPerformanceDimensionLimit[]
>;

const basePathKinds = ["import", "analysis-repair"] as const;

function isResolvedModelControl(
  control: ResolvedToolcraftControlSchema,
): control is ResolvedToolcraftModelFileDropSchema {
  return control.type === "fileDrop" && control.assetKind === "model";
}

function getDevelopmentValue(maximumValue: number): number {
  return Math.min(
    maximumValue,
    Math.max(
      1,
      Math.ceil(
        maximumValue * TOOLCRAFT_MODEL_PERFORMANCE_DEVELOPMENT_PRESSURE,
      ),
    ),
  );
}

type ResourceCounts = Readonly<{
  decodedBytes: number;
  nodeCount: number;
  primitiveCount: number;
  triangleCount: number;
  vertexCount: number;
}>;

const minimumResourceCounts: ResourceCounts = Object.freeze({
  decodedBytes: 48,
  nodeCount: 1,
  primitiveCount: 1,
  triangleCount: 1,
  vertexCount: 3,
});

const performanceRepairProvenance = Object.freeze({
  adapterVersion: "toolcraft-performance-adapter@1",
  canonicalSchemaVersion: 1 as const,
  operations: Object.freeze([
    "deterministic-triangulation",
    "sequential-indexing",
  ] as const),
  repair: Object.freeze({
    algorithmVersion: "toolcraft-safe-repair@1",
    operations: Object.freeze([
      "compact-unused-vertices",
      "recalculate-bounds",
      "regenerate-normals",
      "remove-duplicate-triangles",
      "remove-invalid-triangles",
      "repair-local-winding",
    ] as const),
    planDigest: `sha256:${"f".repeat(64)}`,
    recipeId: `toolcraft-safe-repair@1:sha256:${"f".repeat(64)}`,
  }),
  sourceFormat: "glb" as const,
});

function estimateCanonicalEncodeWorkerBytes(
  counts: ResourceCounts,
  formats: readonly ToolcraftModelFormat[],
): number {
  const nodeSuffix = Math.max(0, counts.nodeCount - 1).toString();
  const primitiveSuffix = Math.max(0, counts.primitiveCount - 1).toString();
  return estimateToolcraftCanonicalEncodeWorkerBytesForShape({
    childReferenceCount: 0,
    maximumNodeId: `node:${nodeSuffix}`,
    maximumNodeName: `Pressure node ${nodeSuffix}`,
    maximumPrimitiveId: `primitive:${primitiveSuffix}`,
    nodeCount: counts.nodeCount,
    nodePrimitiveReferenceCount: counts.primitiveCount,
    payloadByteLength: counts.decodedBytes + counts.vertexCount * 12,
    primitiveCount: counts.primitiveCount,
    provenance: {
      ...performanceRepairProvenance,
      sourceFormat: formats[0] ?? "glb",
    },
    rootNodeCount: counts.nodeCount,
  });
}

function isResourceCountFeasible(
  counts: ResourceCounts,
  limits: ToolcraftModelImportLimits,
  formats: readonly ToolcraftModelFormat[],
): boolean {
  const estimate = estimateToolcraftTopologyResources(counts);
  const canonicalEncodeWorkerBytes = estimateCanonicalEncodeWorkerBytes(
    counts,
    formats,
  );
  return (
    counts.decodedBytes <= limits.maxDecodedBytes &&
    counts.nodeCount <= limits.maxNodes &&
    counts.primitiveCount <= limits.maxPrimitives &&
    counts.triangleCount <= limits.maxTriangles &&
    counts.vertexCount <= limits.maxVertices &&
    estimate.estimatedPeakWorkerBytes <= limits.maxEstimatedWorkerBytes &&
    canonicalEncodeWorkerBytes <= limits.maxEstimatedWorkerBytes
  );
}

function getCountsForDimension(
  limit: ToolcraftModelPerformanceDimensionLimit,
  value: number,
): ResourceCounts {
  switch (limit) {
    case "maxDecodedBytes":
      return {
        ...minimumResourceCounts,
        decodedBytes: value,
        vertexCount: Math.max(3, Math.ceil(Math.max(0, value - 12) / 24)),
      };
    case "maxNodes":
      return { ...minimumResourceCounts, nodeCount: value };
    case "maxPrimitives":
      return {
        decodedBytes: value * 48,
        nodeCount: 1,
        primitiveCount: value,
        triangleCount: value,
        vertexCount: value * 3,
      };
    case "maxTriangles": {
      const vertexCount = Math.max(3, value + 2);
      return {
        ...minimumResourceCounts,
        decodedBytes: vertexCount * 12 + value * 12,
        triangleCount: value,
        vertexCount,
      };
    }
    case "maxVertices":
      return {
        ...minimumResourceCounts,
        decodedBytes: value * 12 + 12,
        vertexCount: value,
      };
    default:
      return minimumResourceCounts;
  }
}

function getEffectiveMaximumValue(
  limit: ToolcraftModelPerformanceDimensionLimit,
  limits: ToolcraftModelImportLimits,
  formats: readonly ToolcraftModelFormat[],
): number {
  const configuredMaximum = limits[limit];
  if (limit === "maxBundleFiles") {
    return configuredMaximum;
  }
  if (limit === "maxSourceBytes" || limit === "maxEstimatedWorkerBytes") {
    return configuredMaximum;
  }

  let low = 1;
  let high = configuredMaximum;
  let feasible = 1;
  while (low <= high) {
    const candidate = low + Math.floor((high - low) / 2);
    if (
      isResourceCountFeasible(
        getCountsForDimension(limit, candidate),
        limits,
        formats,
      )
    ) {
      feasible = candidate;
      low = candidate + 1;
    } else {
      high = candidate - 1;
    }
  }
  return feasible;
}

function createAppearanceEnvelope(
  limits: ToolcraftModelImportLimits,
  formats: readonly ToolcraftModelFormat[],
): ToolcraftModelAppearancePerformanceEnvelope {
  const baselineCounts = minimumResourceCounts;
  const baselineWorkerBytes = Math.max(
    estimateToolcraftTopologyResources(baselineCounts).estimatedPeakWorkerBytes,
    estimateCanonicalEncodeWorkerBytes(baselineCounts, formats),
  );
  const availableBytes = Math.max(
    0,
    limits.maxEstimatedWorkerBytes - baselineWorkerBytes,
  );
  const configuredAppearanceBytes =
    limits.maxTextureBytes + limits.maxTexturePixels * 4;
  const scale = Math.min(1, availableBytes / configuredAppearanceBytes);
  const textureBytes = Math.floor(limits.maxTextureBytes * scale);
  const texturePixels = Math.floor(limits.maxTexturePixels * scale);
  const textureDimension =
    texturePixels === 0
      ? 0
      : Math.min(
          limits.maxTextureDimension,
          Math.max(1, Math.floor(Math.sqrt(texturePixels))),
        );
  const textureCount = Math.min(
    limits.maxTextureCount,
    texturePixels,
    textureBytes,
  );
  const combinedWorkerBytes =
    baselineWorkerBytes + textureBytes + texturePixels * 4;
  const developmentTextureBytes = getDevelopmentValue(textureBytes);
  const developmentTexturePixels = getDevelopmentValue(texturePixels);
  return Object.freeze({
    configured: Object.freeze({
      textureBytes: limits.maxTextureBytes,
      textureCount: limits.maxTextureCount,
      textureDimension: limits.maxTextureDimension,
      texturePixels: limits.maxTexturePixels,
    }),
    development: Object.freeze({
      combinedWorkerBytes:
        baselineWorkerBytes +
        developmentTextureBytes +
        developmentTexturePixels * 4,
      textureBytes: developmentTextureBytes,
      textureCount: getDevelopmentValue(textureCount),
      textureDimension: getDevelopmentValue(textureDimension),
      texturePixels: developmentTexturePixels,
    }),
    effectiveMaximum: Object.freeze({
      combinedWorkerBytes,
      textureBytes,
      textureCount,
      textureDimension,
      texturePixels,
    }),
    fitsWorkerLimit: combinedWorkerBytes <= limits.maxEstimatedWorkerBytes,
  });
}

function createDimension(
  id: ToolcraftModelPerformanceDimensionLimit,
  limits: ToolcraftModelImportLimits,
  formats: readonly ToolcraftModelFormat[],
): ToolcraftModelPerformanceDimension {
  const configuredMaximumValue = limits[id];
  const effectiveMaximumValue = getEffectiveMaximumValue(id, limits, formats);
  return Object.freeze({
    configuredMaximumValue,
    developmentValue: getDevelopmentValue(effectiveMaximumValue),
    effectiveMaximumValue,
    id: dimensionIds[id],
    limit: id,
    targetPressure: TOOLCRAFT_MODEL_PERFORMANCE_DEVELOPMENT_PRESSURE,
    unit: dimensionUnits[id],
  });
}

function createCheckpoint(
  dimensions: readonly ToolcraftModelPerformanceDimension[],
  kind: ToolcraftModelPerformanceCheckpoint["kind"],
): ToolcraftModelPerformanceCheckpoint {
  const useMaximum = kind === "maximum";
  const values = Object.fromEntries(
    dimensions.map((dimension) => [
      dimension.id,
      useMaximum ? dimension.effectiveMaximumValue : dimension.developmentValue,
    ]),
  ) as Partial<Record<ToolcraftModelPerformanceDimensionId, number>>;
  const combinedPressureRatio = Math.min(
    ...dimensions.map(
      (dimension) =>
        (values[dimension.id] ?? 0) / dimension.effectiveMaximumValue,
    ),
  );

  return Object.freeze({
    combinedPressureRatio,
    kind,
    values: Object.freeze(values),
  });
}

function createPath(
  control: ResolvedToolcraftModelFileDropSchema,
  kind: ToolcraftModelPerformancePathKind,
): ToolcraftModelPerformancePath {
  const dimensions = Object.freeze(
    pathDimensions[kind].map((id) =>
      createDimension(id, control.modelLimits, control.modelFormats),
    ),
  );
  return Object.freeze({
    appearance: createAppearanceEnvelope(
      control.modelLimits,
      control.modelFormats,
    ),
    development: createCheckpoint(dimensions, "development"),
    dimensions,
    formats: Object.freeze([...control.modelFormats]),
    id: `runtime-model:${encodeURIComponent(control.target)}:${kind}`,
    kind,
    maximum: createCheckpoint(dimensions, "maximum"),
    profile: kind === "orbit" ? "interactive-continuous" : "batch-responsive",
    target: control.target,
    topologyProfile: control.topologyProfile,
  });
}

export function deriveToolcraftModelPerformancePaths(
  schema: ResolvedToolcraftAppSchema,
): readonly ToolcraftModelPerformancePath[] {
  const controls = (schema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.values(section.controls),
  );
  const pathKinds = controls.some(
    (control) => control.type === "orientationGizmo",
  )
    ? ([...basePathKinds, "orbit"] as const)
    : basePathKinds;

  return Object.freeze(
    controls
      .filter(isResolvedModelControl)
      .sort((left, right) => left.target.localeCompare(right.target, "en"))
      .flatMap((control) => pathKinds.map((kind) => createPath(control, kind))),
  );
}
