import {
  getToolcraftPerformanceProfile,
  type ToolcraftPerformancePath,
  type ToolcraftPerformanceScenario,
} from "@/toolcraft/runtime";

import type { ToolcraftBrowserPerformanceAttachment } from "../src/app/test-evidence/browser-performance-contract";
import {
  TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_ATTACHMENT_NAME,
  TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_CONTENT_TYPE,
  TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_VERSION,
  decodeToolcraftPerformanceMeasurementBody,
  type ToolcraftPerformanceMeasurementEvidence,
} from "../src/app/test-evidence/browser-performance-measurement-contract";
import { TOOLCRAFT_PERFORMANCE_PIPELINE_PHASES } from "../src/app/test-evidence/browser-performance-contract";

export type ToolcraftPerformanceMeasurementReport = Readonly<{
  evidenceType: "performance-measurement-report";
  observations: readonly ToolcraftPerformanceMeasurementEvidence[];
  version: typeof TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_VERSION;
}>;

export type ToolcraftPerformanceMeasurementEvaluation = Readonly<{
  errors: readonly string[];
  report?: ToolcraftPerformanceMeasurementReport;
}>;

type EvaluationOptions = Readonly<{
  attachments: readonly ToolcraftBrowserPerformanceAttachment[];
  expectedPaths: readonly ToolcraftPerformancePath[];
  scenarios?: readonly ToolcraftPerformanceScenario[];
}>;

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function collectEvidence(
  attachments: readonly ToolcraftBrowserPerformanceAttachment[],
  errors: string[],
): ToolcraftPerformanceMeasurementEvidence[] {
  const evidence: ToolcraftPerformanceMeasurementEvidence[] = [];
  for (const [index, attachment] of attachments.entries()) {
    const reserved =
      attachment.name === TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_ATTACHMENT_NAME ||
      attachment.contentType === TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_CONTENT_TYPE;
    if (!reserved) continue;
    if (
      attachment.name !== TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_ATTACHMENT_NAME ||
      attachment.contentType !== TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_CONTENT_TYPE
    ) {
      errors.push(
        `Reserved performance measurement attachment at index ${index} has a mismatched name or content type.`,
      );
      continue;
    }
    const decoded = decodeToolcraftPerformanceMeasurementBody(attachment.body);
    if (!decoded.ok) {
      errors.push(
        `Malformed performance measurement attachment at index ${index}: ${decoded.error}`,
      );
      continue;
    }
    evidence.push(decoded.evidence);
  }
  return evidence;
}

function getCompletionDeadline(
  path: ToolcraftPerformancePath,
  scenarios: readonly ToolcraftPerformanceScenario[],
  catalogDeadline: number | undefined,
): number | undefined {
  if (path.interaction !== "export") return undefined;
  const deadlines = scenarios.flatMap((scenario) => {
    const deadline =
      scenario.pathId === path.id && scenario.interaction === "export"
        ? scenario.completionDeadlineMs
        : undefined;
    return typeof deadline === "number" && deadline > 0 ? [deadline] : [];
  });
  if (catalogDeadline !== undefined) deadlines.push(catalogDeadline);
  return deadlines.length > 0 ? Math.min(...deadlines) : undefined;
}

function getObservationErrors(
  path: ToolcraftPerformancePath,
  observation: ToolcraftPerformanceMeasurementEvidence,
  scenarios: readonly ToolcraftPerformanceScenario[],
): string[] {
  const errors: string[] = [];
  const { metrics } = observation;
  const { thresholds } = getToolcraftPerformanceProfile(path.profile);
  const prefix = `Performance measurement for path "${path.id}" phase "${observation.phase}"`;
  const expectedKind =
    path.interaction === "animation-frame" ? "animation-frames" : "interaction";

  if (observation.profile !== path.profile) {
    errors.push(
      `${prefix} uses profile ${observation.profile}; expected ${path.profile}.`,
    );
  }
  if (observation.kind !== expectedKind) {
    errors.push(`${prefix} uses kind ${observation.kind}; expected ${expectedKind}.`);
  }
  if (metrics.sampleCount === 0) {
    errors.push(`${prefix} must contain at least one visible frame sample.`);
  }
  if (
    metrics.frameGapP50Ms > metrics.frameGapP95Ms ||
    metrics.frameGapP95Ms > metrics.frameGapP99Ms ||
    metrics.frameGapP99Ms > metrics.maxFrameGapMs
  ) {
    errors.push(`${prefix} contains an invalid frame-gap distribution ordering.`);
  }
  const expectedDroppedRatio =
    metrics.sampleCount === 0
      ? 0
      : metrics.droppedFrameCount / metrics.sampleCount;
  if (Math.abs(metrics.droppedFrameRatio - expectedDroppedRatio) > 1e-12) {
    errors.push(`${prefix} contains an inconsistent dropped-frame ratio.`);
  }
  if (metrics.maxFrameGapMs > thresholds.maxFrameGapMs) {
    errors.push(
      `${prefix} max frame gap ${metrics.maxFrameGapMs}ms exceeds ${thresholds.maxFrameGapMs}ms.`,
    );
  }
  if (metrics.frameGapP95Ms > thresholds.maxFrameGapP95Ms) {
    errors.push(
      `${prefix} p95 frame gap ${metrics.frameGapP95Ms}ms exceeds ${thresholds.maxFrameGapP95Ms}ms.`,
    );
  }
  if (metrics.droppedFrameRatio > thresholds.maxDroppedFrameRatio) {
    errors.push(
      `${prefix} dropped-frame ratio ${metrics.droppedFrameRatio} exceeds ${thresholds.maxDroppedFrameRatio}.`,
    );
  }
  if (metrics.longTaskMaxMs > thresholds.maxLongTaskMs) {
    errors.push(
      `${prefix} longest task ${metrics.longTaskMaxMs}ms exceeds ${thresholds.maxLongTaskMs}ms.`,
    );
  }

  const completionDeadline = getCompletionDeadline(
    path,
    scenarios,
    thresholds.maxBatchCompletionMs,
  );
  const visibleLatencyApplies =
    path.interaction !== "animation-frame" && path.interaction !== "export";
  const durationDeadline = visibleLatencyApplies
    ? thresholds.maxVisibleOutputLatencyMs
    : completionDeadline;
  if (durationDeadline !== undefined && metrics.durationMs > durationDeadline) {
    errors.push(
      `${prefix} duration ${metrics.durationMs}ms exceeds ${durationDeadline}ms.`,
    );
  }
  return errors;
}

export function evaluateToolcraftPerformanceMeasurements({
  attachments,
  expectedPaths,
  scenarios = [],
}: EvaluationOptions): ToolcraftPerformanceMeasurementEvaluation {
  const errors: string[] = [];
  const pathsById = new Map(expectedPaths.map((path) => [path.id, path] as const));
  if (pathsById.size !== expectedPaths.length) {
    errors.push("Expected performance measurement paths contain duplicate ids.");
  }
  const evidenceByPathPhase = new Map<string, ToolcraftPerformanceMeasurementEvidence>();

  for (const observation of collectEvidence(attachments, errors)) {
    const path = pathsById.get(observation.pathId);
    if (!path) {
      errors.push(
        `Performance measurement contains unknown or unselected path "${observation.pathId}".`,
      );
      continue;
    }
    const key = `${observation.pathId}\u0000${observation.phase}`;
    if (evidenceByPathPhase.has(key)) {
      errors.push(
        `Performance measurement contains duplicate phase "${observation.phase}" for path "${observation.pathId}".`,
      );
      continue;
    }
    evidenceByPathPhase.set(key, observation);
    errors.push(...getObservationErrors(path, observation, scenarios));
  }

  const observations: ToolcraftPerformanceMeasurementEvidence[] = [];
  for (const path of [...expectedPaths].sort((left, right) =>
    compareCodeUnits(left.id, right.id),
  )) {
    for (const phase of TOOLCRAFT_PERFORMANCE_PIPELINE_PHASES) {
      const observation = evidenceByPathPhase.get(`${path.id}\u0000${phase}`);
      if (!observation) {
        errors.push(
          `Missing performance measurement phase "${phase}" for path "${path.id}".`,
        );
      } else {
        observations.push(observation);
      }
    }
  }

  if (errors.length > 0) return { errors: Object.freeze(errors) };
  return {
    errors: [],
    report: Object.freeze({
      evidenceType: "performance-measurement-report",
      observations: Object.freeze(observations),
      version: TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_VERSION,
    }),
  };
}
