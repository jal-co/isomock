import type {
  ToolcraftModelImportLimits,
  ToolcraftModelTopologyProfile,
} from "../../schema/types";
import type { ToolcraftModelDocument } from "../canonical/model-document";
import { deriveToolcraftModelRepair } from "./model-repair-execution";
import {
  buildToolcraftModelTopologyGraph,
  type ToolcraftModelTopologyGraph,
  type ToolcraftPrimitiveTopologyGraph,
} from "./model-topology-graph";
import { compileToolcraftModelRepairPlan } from "./model-repair-plan";
import {
  preflightToolcraftModelTopologyResources,
  resolveTopologyLimits,
  type ToolcraftModelTopologyResourcePreflight,
} from "./model-topology-resources";
import type {
  ToolcraftModelAnalysis,
  ToolcraftModelAnalysisOutcome,
  ToolcraftModelTopologyDiagnostic,
  ToolcraftModelTopologyDiagnosticCode,
  ToolcraftModelTopologySeverity,
  ToolcraftModelTopologyStatistics,
} from "./model-topology-types";

export const TOOLCRAFT_MODEL_TOPOLOGY_ANALYZER_VERSION = "toolcraft-topology@1";

function diagnostic(
  code: ToolcraftModelTopologyDiagnosticCode,
  severity: ToolcraftModelTopologySeverity,
  affectedCount: number,
  explanation: string,
  primitive?: ToolcraftPrimitiveTopologyGraph,
): ToolcraftModelTopologyDiagnostic {
  return Object.freeze({
    affectedCount: Number.isSafeInteger(affectedCount) && affectedCount >= 0
      ? affectedCount
      : Number.MAX_SAFE_INTEGER,
    code,
    explanation,
    ...(primitive === undefined ? {} : {
      primitiveId: primitive.primitive.id,
      primitiveIndex: primitive.primitiveIndex,
    }),
    severity,
  });
}

function profileSeverity(
  profile: ToolcraftModelTopologyProfile,
  realtime: "info" | "warning",
): "fatal" | "info" | "warning" {
  return profile === "solid-mesh" ? "fatal" : realtime;
}

function normalDiagnostic(
  graph: ToolcraftPrimitiveTopologyGraph,
): ToolcraftModelTopologyDiagnostic | undefined {
  const normals = graph.primitive.normals;
  switch (graph.normalIssue) {
    case "missing":
      return diagnostic("normals-missing", "repairable", graph.vertexCount,
        "The primitive has no authored normals; deterministic area-weighted normals can be generated.", graph);
    case "count-mismatch":
      return diagnostic("normals-count-mismatch", "repairable",
        Math.abs((normals?.length ?? 0) - graph.vertexCount * 3),
        "Normal component count does not match position component count.", graph);
    case "non-finite": {
      let count = 0;
      if (normals instanceof Float32Array) {
        for (const value of normals) if (!Number.isFinite(value)) count += 1;
      }
      return diagnostic("normals-non-finite", "repairable", count,
        "Authored normals contain non-finite components and can be regenerated.", graph);
    }
    case "zero-length": {
      let count = 0;
      if (normals instanceof Float32Array) {
        for (let offset = 0; offset < normals.length; offset += 3) {
          if (normals[offset] === 0 && normals[offset + 1] === 0 &&
              normals[offset + 2] === 0) count += 1;
        }
      }
      return diagnostic("normals-zero-length", "repairable", count,
        "Authored normals contain zero-length vectors and can be regenerated.", graph);
    }
    case "none":
      return undefined;
  }
}

function structuralDiagnostics(
  graph: ToolcraftPrimitiveTopologyGraph,
): ToolcraftModelTopologyDiagnostic[] {
  const diagnostics: ToolcraftModelTopologyDiagnostic[] = [];
  if (!graph.positionCardinalityValid) {
    diagnostics.push(diagnostic(
      graph.vertexCount === 0 ? "empty-primitive" : "invalid-position-cardinality",
      "fatal",
      graph.primitive.positions?.length ?? 0,
      "Positions must be a nonempty Float32Array of finite XYZ triples.",
      graph,
    ));
  }
  if (graph.nonFinitePositionCount > 0) {
    diagnostics.push(diagnostic("non-finite-positions", "fatal",
      graph.nonFinitePositionCount,
      "Position components must be finite before geometry can be rendered safely.", graph));
  }
  if (!graph.indicesValid) {
    diagnostics.push(diagnostic("invalid-index-data", "fatal", 1,
      "Triangle indices must be provided as a Uint32Array.", graph));
  } else if (!graph.indexCardinalityValid) {
    diagnostics.push(diagnostic(
      graph.primitive.indices.length === 0 ? "empty-primitive" : "invalid-index-cardinality",
      "fatal",
      graph.primitive.indices.length,
      "Indices must be a nonempty sequence of complete triangle triples.", graph));
  }
  if (graph.invalidIndexCount > 0) {
    diagnostics.push(diagnostic("indices-out-of-range", "fatal",
      graph.invalidIndexCount,
      "One or more indices do not resolve to a primitive vertex; repair never guesses index intent.", graph));
  }
  if (graph.indexCardinalityValid && graph.positionCardinalityValid &&
      graph.nonFinitePositionCount === 0 && graph.invalidIndexCount === 0 &&
      graph.renderableTriangles.length === 0) {
    diagnostics.push(diagnostic("no-renderable-triangles", "fatal",
      graph.triangleCount,
      "Removing invalid triangles would leave the primitive without renderable geometry.", graph));
  }
  return diagnostics;
}

function topologyDiagnostics(
  graph: ToolcraftPrimitiveTopologyGraph,
  profile: ToolcraftModelTopologyProfile,
): ToolcraftModelTopologyDiagnostic[] {
  const diagnostics: ToolcraftModelTopologyDiagnostic[] = [];
  if (graph.repeatedIndexTriangleIndices.length > 0) {
    diagnostics.push(diagnostic("repeated-index-triangles", "repairable",
      graph.repeatedIndexTriangleIndices.length,
      "Triangles with repeated vertex indices have no renderable area and can be removed exactly.", graph));
  }
  if (graph.zeroAreaTriangleIndices.length > 0) {
    diagnostics.push(diagnostic("zero-area-triangles", "repairable",
      graph.zeroAreaTriangleIndices.length,
      "Geometrically zero-area triangles can be removed without changing the visible surface.", graph));
  }
  if (graph.duplicateTriangleIndices.length > 0) {
    diagnostics.push(diagnostic("duplicate-triangles", "repairable",
      graph.duplicateTriangleIndices.length,
      "Exact same-winding duplicate triangles can be removed deterministically.", graph));
  }
  if (graph.oppositeWindingDuplicateTriangleIndices.length > 0) {
    diagnostics.push(diagnostic("duplicate-triangles",
      profileSeverity(profile, "warning"),
      graph.oppositeWindingDuplicateTriangleIndices.length,
      "Coincident triangles with opposite winding are ambiguous and are not automatically removed.", graph));
  }
  if (graph.unusedVertexIndices.length > 0) {
    diagnostics.push(diagnostic("unused-vertices", "repairable",
      graph.unusedVertexIndices.length,
      "Vertices not referenced by retained triangles can be compacted with an exact index remap.", graph));
  }
  const normals = normalDiagnostic(graph);
  if (normals !== undefined) diagnostics.push(normals);
  if (graph.flippedTriangleIndices.length > 0 && graph.orientable &&
      graph.nonManifoldEdges.length === 0 &&
      graph.nonManifoldVertexIndices.length === 0 &&
      graph.oppositeWindingDuplicateTriangleIndices.length === 0) {
    diagnostics.push(diagnostic("inconsistent-local-winding", "repairable",
      graph.flippedTriangleIndices.length,
      "A contradiction-free parity solution proves a deterministic local winding correction.", graph));
  }
  if (!graph.orientable) {
    diagnostics.push(diagnostic("non-orientable-component",
      profileSeverity(profile, "warning"),
      graph.windingConflictEdgeCount,
      "Edge orientation constraints conflict, so a safe orientation cannot be inferred.", graph));
  }
  if (graph.boundaryEdges.length > 0) {
    diagnostics.push(diagnostic("boundary-edges", profileSeverity(profile, "info"),
      graph.boundaryEdges.length,
      profile === "solid-mesh"
        ? "Solid geometry must be closed; boundary filling is outside the safe repair policy."
        : "Open boundary edges are permitted for realtime display geometry.", graph));
  }
  if (graph.sourceNonManifoldEdges.length > 0) {
    diagnostics.push(diagnostic("non-manifold-edges", profileSeverity(profile, "warning"),
      graph.sourceNonManifoldEdges.length,
      "Edges incident to more than two retained triangles are locally non-manifold.", graph));
  }
  if (graph.sourceNonManifoldVertexIndices.length > 0) {
    diagnostics.push(diagnostic("non-manifold-vertices", profileSeverity(profile, "warning"),
      graph.sourceNonManifoldVertexIndices.length,
      "Vertex incident fans are disconnected or include a non-manifold edge.", graph));
  }
  if (graph.componentCount > 1) {
    diagnostics.push(diagnostic("disconnected-components", "info",
      graph.componentCount,
      "The primitive contains multiple edge-disconnected triangle components; each component is evaluated independently.", graph));
  }
  if (!graph.primitiveBoundsValid && graph.expectedBounds !== undefined) {
    diagnostics.push(diagnostic("invalid-primitive-bounds", "repairable", 1,
      "Primitive bounds do not exactly match finite positions and can be recalculated.", graph));
  }
  return diagnostics;
}

function resourceDiagnostics(
  statistics: ToolcraftModelTopologyStatistics,
  limits: Readonly<ToolcraftModelImportLimits>,
): ToolcraftModelTopologyDiagnostic[] {
  const diagnostics = [diagnostic("resource-estimate", "info",
    statistics.estimatedPeakWorkerBytes,
    `Estimated decoded bytes ${statistics.decodedBytes}, repair bytes ${statistics.estimatedRepairBytes}, and peak worker bytes ${statistics.estimatedPeakWorkerBytes}.`)];
  const checks: readonly [number, number, string][] = [
    [statistics.vertexCount, limits.maxVertices, "vertices"],
    [statistics.triangleCount, limits.maxTriangles, "triangles"],
    [statistics.nodeCount, limits.maxNodes, "nodes"],
    [statistics.primitiveCount, limits.maxPrimitives, "primitives"],
    [statistics.decodedBytes, limits.maxDecodedBytes, "decoded bytes"],
    [statistics.estimatedPeakWorkerBytes, limits.maxEstimatedWorkerBytes, "estimated peak worker bytes"],
  ];
  for (const [actual, limit, label] of checks) {
    if (!Number.isFinite(limit) || limit <= 0 || actual > limit) {
      diagnostics.push(diagnostic("resource-limit-exceeded", "fatal", actual,
        `Model ${label} ${actual} exceed the supported limit ${limit}.`));
    }
  }
  return diagnostics;
}

function summarizeStatistics(
  graph: ToolcraftModelTopologyGraph,
  preflight: ToolcraftModelTopologyResourcePreflight,
): ToolcraftModelTopologyStatistics {
  const totals = graph.primitives.reduce((result, primitive) => ({
    boundaryEdgeCount: result.boundaryEdgeCount + primitive.sourceBoundaryEdges.length,
    componentCount: result.componentCount + primitive.componentCount,
    edgeCount: result.edgeCount + primitive.sourceEdges.length,
    nonManifoldEdgeCount: result.nonManifoldEdgeCount + primitive.sourceNonManifoldEdges.length,
    nonManifoldVertexCount: result.nonManifoldVertexCount + primitive.sourceNonManifoldVertexIndices.length,
    unusedVertexCount: result.unusedVertexCount + primitive.unusedVertexIndices.length,
  }), {
    boundaryEdgeCount: 0,
    componentCount: 0,
    edgeCount: 0,
    nonManifoldEdgeCount: 0,
    nonManifoldVertexCount: 0,
    unusedVertexCount: 0,
  });
  return Object.freeze({
    ...totals,
    ...preflight,
  });
}

function preflightStatistics(
  preflight: ToolcraftModelTopologyResourcePreflight,
): ToolcraftModelTopologyStatistics {
  return Object.freeze({
    boundaryEdgeCount: 0,
    componentCount: 0,
    edgeCount: 0,
    nonManifoldEdgeCount: 0,
    nonManifoldVertexCount: 0,
    unusedVertexCount: 0,
    ...preflight,
  });
}

function outcomeFor(
  diagnostics: readonly ToolcraftModelTopologyDiagnostic[],
  hasPlan: boolean,
): ToolcraftModelAnalysisOutcome {
  if (diagnostics.some(({ severity }) => severity === "fatal")) return "fatal";
  if (hasPlan) return "repairable";
  if (diagnostics.some(({ severity }) => severity === "warning")) return "warning";
  return "clean";
}

type AnalysisMode = "plan" | "proof";

function analyzeToolcraftModelInternal(
  document: ToolcraftModelDocument,
  profile: ToolcraftModelTopologyProfile,
  requestedLimits: Partial<ToolcraftModelImportLimits> | undefined,
  mode: AnalysisMode,
): ToolcraftModelAnalysis {
  const limits = resolveTopologyLimits(requestedLimits);
  const preflight = preflightToolcraftModelTopologyResources(document);
  const preliminaryStatistics = preflightStatistics(preflight);
  const preliminaryDiagnostics = resourceDiagnostics(
    preliminaryStatistics,
    limits,
  );
  if (preliminaryDiagnostics.some(({ severity }) => severity === "fatal")) {
    return Object.freeze({
      analyzerVersion: TOOLCRAFT_MODEL_TOPOLOGY_ANALYZER_VERSION,
      diagnostics: Object.freeze(preliminaryDiagnostics),
      limits,
      outcome: "fatal",
      profile,
      statistics: preliminaryStatistics,
    });
  }
  const graph = buildToolcraftModelTopologyGraph(document);
  let diagnostics = graph.primitives.flatMap((primitive) => [
    ...structuralDiagnostics(primitive),
    ...topologyDiagnostics(primitive, profile),
  ]);
  if (!graph.documentBoundsValid &&
      graph.primitives.every(({ expectedBounds }) => expectedBounds !== undefined)) {
    diagnostics.push(diagnostic("invalid-document-bounds", "repairable", 1,
      "Document bounds do not aggregate primitive geometry and can be recalculated."));
  }
  const statistics = summarizeStatistics(graph, preflight);
  diagnostics.push(...preliminaryDiagnostics);
  const unconditionalFatalCodes = new Set<ToolcraftModelTopologyDiagnosticCode>([
    "empty-primitive",
    "indices-out-of-range",
    "invalid-index-cardinality",
    "invalid-index-data",
    "invalid-position-cardinality",
    "non-finite-positions",
    "no-renderable-triangles",
    "resource-limit-exceeded",
  ]);
  const hasUnconditionalFatal = diagnostics.some(({ code, severity }) =>
    severity === "fatal" && unconditionalFatalCodes.has(code)
  );
  const compiledCandidate = mode === "proof" || hasUnconditionalFatal ? undefined
    : compileToolcraftModelRepairPlan(
        document,
        graph,
        profile,
        TOOLCRAFT_MODEL_TOPOLOGY_ANALYZER_VERSION,
      );
  let candidatePlan = compiledCandidate;
  if (compiledCandidate !== undefined) {
    try {
      const candidateDocument = deriveToolcraftModelRepair(
        document,
        compiledCandidate,
      );
      const proof = analyzeToolcraftModelInternal(
        candidateDocument,
        profile,
        limits,
        "proof",
      );
      const hasUnresolvedDiagnostic = proof.diagnostics.some(({ severity }) =>
        severity === "fatal" || severity === "repairable"
      );
      if (hasUnresolvedDiagnostic ||
          (profile === "solid-mesh" && proof.outcome !== "clean")) {
        candidatePlan = undefined;
      }
    } catch {
      candidatePlan = undefined;
    }
  }
  if (candidatePlan !== undefined) {
    diagnostics = diagnostics.map((item) => item.severity === "fatal"
      ? Object.freeze({ ...item, severity: "repairable" as const })
      : item);
  }
  const hasFatal = diagnostics.some(({ severity }) => severity === "fatal");
  const repairPlan = hasFatal ? undefined : candidatePlan;
  if (mode === "plan" && repairPlan === undefined && !hasFatal) {
    const solidRepairRequiredCodes = new Set<ToolcraftModelTopologyDiagnosticCode>([
      "duplicate-triangles",
      "inconsistent-local-winding",
      "repeated-index-triangles",
      "zero-area-triangles",
    ]);
    diagnostics = diagnostics.map((item) => item.severity === "repairable"
      ? Object.freeze({
          ...item,
          severity: profile === "solid-mesh" &&
              solidRepairRequiredCodes.has(item.code)
            ? "fatal" as const
            : "warning" as const,
        })
      : item);
  }
  const frozenDiagnostics = Object.freeze(diagnostics);
  return Object.freeze({
    analyzerVersion: TOOLCRAFT_MODEL_TOPOLOGY_ANALYZER_VERSION,
    diagnostics: frozenDiagnostics,
    limits,
    outcome: outcomeFor(frozenDiagnostics, repairPlan !== undefined),
    profile,
    ...(repairPlan === undefined ? {} : { repairPlan }),
    statistics,
  });
}

export function analyzeToolcraftModel(
  document: ToolcraftModelDocument,
  profile: ToolcraftModelTopologyProfile,
  requestedLimits?: Partial<ToolcraftModelImportLimits>,
): ToolcraftModelAnalysis {
  return analyzeToolcraftModelInternal(document, profile, requestedLimits, "plan");
}

/** @internal Repair proof entry point; deliberately never compiles another plan. */
export function analyzeToolcraftModelWithoutRepairPlanning(
  document: ToolcraftModelDocument,
  profile: ToolcraftModelTopologyProfile,
  requestedLimits?: Partial<ToolcraftModelImportLimits>,
): ToolcraftModelAnalysis {
  return analyzeToolcraftModelInternal(document, profile, requestedLimits, "proof");
}

export type {
  ToolcraftModelAnalysis,
  ToolcraftModelAnalysisOutcome,
  ToolcraftModelTopologyDiagnostic,
  ToolcraftModelTopologyDiagnosticCode,
  ToolcraftModelTopologySeverity,
  ToolcraftModelTopologyStatistics,
} from "./model-topology-types";
