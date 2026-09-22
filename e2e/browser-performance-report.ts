import {
  deriveToolcraftPerformancePaths,
  isToolcraftRendererPipelineRegistration,
  type ResolvedToolcraftAppSchema,
  type ToolcraftPerformanceConfig,
} from "@/toolcraft/runtime";

import {
  TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME,
  TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_CONTENT_TYPE,
  TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_VERSION,
  TOOLCRAFT_PERFORMANCE_PIPELINE_PHASES,
  decodeToolcraftBrowserPerformanceEvidenceBody,
  type ToolcraftBrowserPerformanceAttachment,
  type ToolcraftPerformancePipelineEvidence,
  type ToolcraftPerformancePipelineMetricKey,
  type ToolcraftPerformancePipelinePhase,
} from "../src/app/test-evidence/browser-performance-contract";
import {
  getPipelineObservationInvariantErrors,
  getPipelinePassDelta,
  pipelinePassMap,
} from "./performance-pipeline-invariants";
import { getPipelinePhaseContinuityErrors } from "./performance-pipeline-phase-continuity";

export type ToolcraftPerformancePipelinePassReport = Readonly<{
  delta: Readonly<Record<ToolcraftPerformancePipelineMetricKey, number>>;
  passId: string;
}>;

export type ToolcraftPerformancePipelinePhaseReport = Readonly<{
  passes: readonly ToolcraftPerformancePipelinePassReport[];
  pathId: string;
  phase: ToolcraftPerformancePipelinePhase;
  profile: string;
  runtimeId: string;
}>;

export type ToolcraftBrowserPerformanceReport = Readonly<{
  evidenceType: "performance-pipeline-report";
  observations: readonly ToolcraftPerformancePipelinePhaseReport[];
  version: typeof TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_VERSION;
}>;

export type ToolcraftBrowserPerformanceEvaluation = Readonly<{
  errors: readonly string[];
  report?: ToolcraftBrowserPerformanceReport;
}>;

type EvaluationOptions = Readonly<{
  attachments: readonly ToolcraftBrowserPerformanceAttachment[];
  expectedPathIds: readonly string[];
  performanceConfig: ToolcraftPerformanceConfig;
  schema: ResolvedToolcraftAppSchema;
}>;

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function requiresToolcraftPerformancePipelineEvidence(
  config: ToolcraftPerformanceConfig,
): boolean {
  return config.usesCustomRenderer;
}

function collectEvidence(
  attachments: readonly ToolcraftBrowserPerformanceAttachment[],
  errors: string[],
): ToolcraftPerformancePipelineEvidence[] {
  const evidence: ToolcraftPerformancePipelineEvidence[] = [];
  for (const [index, attachment] of attachments.entries()) {
    const reserved =
      attachment.name === TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME ||
      attachment.contentType === TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_CONTENT_TYPE;
    if (!reserved) continue;
    if (
      attachment.name !== TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME ||
      attachment.contentType !== TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_CONTENT_TYPE
    ) {
      errors.push(
        `Reserved performance evidence attachment at index ${index} has a mismatched name or content type.`,
      );
      continue;
    }

    const decoded = decodeToolcraftBrowserPerformanceEvidenceBody(attachment.body);
    if (!decoded.ok) {
      errors.push(
        `Malformed performance-pipeline attachment at index ${index}: ${decoded.error}`,
      );
      continue;
    }
    evidence.push(decoded.evidence);
  }
  return evidence;
}

function freezeReport(
  observations: ToolcraftPerformancePipelinePhaseReport[],
): ToolcraftBrowserPerformanceReport {
  return Object.freeze({
    evidenceType: "performance-pipeline-report",
    observations: Object.freeze(observations),
    version: TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_VERSION,
  });
}

export function evaluateToolcraftBrowserPerformanceEvidence({
  attachments,
  expectedPathIds,
  performanceConfig,
  schema,
}: EvaluationOptions): ToolcraftBrowserPerformanceEvaluation {
  if (!requiresToolcraftPerformancePipelineEvidence(performanceConfig)) {
    return { errors: [], report: freezeReport([]) };
  }

  const errors: string[] = [];
  const registration = performanceConfig.rendererPipeline;
  if (!isToolcraftRendererPipelineRegistration(registration)) {
    return {
      errors: [
        "Custom renderer performance evidence requires an executable renderer pipeline registration.",
      ],
    };
  }

  const canonicalPaths = deriveToolcraftPerformancePaths(schema, performanceConfig);
  const pathsById = new Map(canonicalPaths.map((path) => [path.id, path] as const));
  const expectedSet = new Set<string>();
  for (const pathId of expectedPathIds) {
    if (expectedSet.has(pathId)) {
      errors.push(`Expected performance path list contains duplicate path "${pathId}".`);
    }
    expectedSet.add(pathId);
    if (!pathsById.has(pathId)) {
      errors.push(`Expected performance path "${pathId}" is not canonical.`);
    }
  }

  const evidenceByPathPhase = new Map<string, ToolcraftPerformancePipelineEvidence>();
  for (const observation of collectEvidence(attachments, errors)) {
    if (!pathsById.has(observation.pathId)) {
      errors.push(
        `Performance-pipeline evidence contains unknown path "${observation.pathId}".`,
      );
      continue;
    }
    if (!expectedSet.has(observation.pathId)) {
      errors.push(
        `Performance-pipeline evidence contains extra path "${observation.pathId}".`,
      );
      continue;
    }
    const key = `${observation.pathId}\u0000${observation.phase}`;
    if (evidenceByPathPhase.has(key)) {
      errors.push(
        `Performance-pipeline evidence contains duplicate phase "${observation.phase}" for path "${observation.pathId}".`,
      );
      continue;
    }
    evidenceByPathPhase.set(key, observation);
  }

  const canonicalPassIds = registration.passes
    .map((pass) => pass.id)
    .sort(compareCodeUnits);
  const passDefinitions = new Map(
    registration.passes.map((pass) => [pass.id, pass] as const),
  );
  const sortedExpectedPaths = [...expectedSet]
    .flatMap((pathId) => {
      const path = pathsById.get(pathId);
      return path ? [path] : [];
    })
    .sort((left, right) => compareCodeUnits(left.id, right.id));
  const reportObservations: ToolcraftPerformancePipelinePhaseReport[] = [];

  for (const path of sortedExpectedPaths) {
    const pathEvidence = new Map<
      ToolcraftPerformancePipelinePhase,
      ToolcraftPerformancePipelineEvidence
    >();
    for (const phase of TOOLCRAFT_PERFORMANCE_PIPELINE_PHASES) {
      const observation = evidenceByPathPhase.get(`${path.id}\u0000${phase}`);
      if (!observation) {
        errors.push(
          `Missing performance-pipeline phase "${phase}" for path "${path.id}".`,
        );
        continue;
      }
      pathEvidence.set(phase, observation);
      errors.push(
        ...getPipelineObservationInvariantErrors({
          canonicalPassIds,
          evidence: observation,
          passDefinitions,
          path,
          registration,
        }),
      );

      const beforeByPass = pipelinePassMap(observation.before);
      const afterByPass = pipelinePassMap(observation.after);
      const passes = canonicalPassIds.flatMap((passId) => {
        const before = beforeByPass.get(passId);
        const after = afterByPass.get(passId);
        return before && after
          ? [
              Object.freeze({
                delta: getPipelinePassDelta(before, after),
                passId,
              }),
            ]
          : [];
      });
      reportObservations.push(
        Object.freeze({
          passes: Object.freeze(passes),
          pathId: path.id,
          phase,
          profile: path.profile,
          runtimeId: registration.runtimeId,
        }),
      );
    }

    const cold = pathEvidence.get("cold");
    const warm = pathEvidence.get("warm");
    const sustained = pathEvidence.get("sustained");
    if (cold && warm && sustained) {
      errors.push(
        ...getPipelinePhaseContinuityErrors({
          cold,
          path,
          sustained,
          warm,
        }),
      );
    }
  }

  if (errors.length > 0) return { errors: Object.freeze(errors) };
  return { errors: [], report: freezeReport(reportObservations) };
}
