import {
  TOOLCRAFT_PERFORMANCE_PROFILE_CATALOG_VERSION,
  TOOLCRAFT_PERFORMANCE_PROFILE_NAMES,
  isToolcraftPerformanceProfileName,
  type ToolcraftPerformanceProfileName,
} from "@/toolcraft/runtime";

import {
  TOOLCRAFT_PERFORMANCE_PIPELINE_PHASES,
  type ToolcraftBrowserPerformanceAttachment,
  type ToolcraftPerformancePipelinePhase,
} from "./browser-performance-contract";

export const TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_VERSION = 1 as const;
export const TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_ATTACHMENT_NAME =
  "toolcraft.browser-performance-measurement";
export const TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_CONTENT_TYPE =
  "application/vnd.toolcraft.browser-performance-measurement+json";

export type ToolcraftPerformanceMeasurementMetrics = Readonly<{
  droppedFrameCount: number;
  droppedFrameRatio: number;
  durationMs: number;
  frameGapP50Ms: number;
  frameGapP95Ms: number;
  frameGapP99Ms: number;
  longTaskCount: number;
  longTaskMaxMs: number;
  maxFrameGapMs: number;
  sampleCount: number;
}>;

export type ToolcraftPerformanceMeasurementEvidence = Readonly<{
  evidenceType: "performance-measurement-metrics";
  kind: "animation-frames" | "interaction";
  metrics: ToolcraftPerformanceMeasurementMetrics;
  pathId: string;
  phase: ToolcraftPerformancePipelinePhase;
  profile: ToolcraftPerformanceProfileName;
  profileCatalogVersion: typeof TOOLCRAFT_PERFORMANCE_PROFILE_CATALOG_VERSION;
  version: typeof TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_VERSION;
}>;

export type ToolcraftPerformanceMeasurementDecodeResult =
  | Readonly<{ evidence: ToolcraftPerformanceMeasurementEvidence; ok: true }>
  | Readonly<{ error: string; ok: false }>;

type UnknownRecord = Record<string, unknown>;

const metricKeys = [
  "droppedFrameCount",
  "droppedFrameRatio",
  "durationMs",
  "frameGapP50Ms",
  "frameGapP95Ms",
  "frameGapP99Ms",
  "longTaskCount",
  "longTaskMaxMs",
  "maxFrameGapMs",
  "sampleCount",
] as const satisfies readonly (keyof ToolcraftPerformanceMeasurementMetrics)[];
const integerMetricKeys = new Set<keyof ToolcraftPerformanceMeasurementMetrics>([
  "droppedFrameCount",
  "longTaskCount",
  "sampleCount",
]);
const phaseSet = new Set<string>(TOOLCRAFT_PERFORMANCE_PIPELINE_PHASES);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeysError(
  value: UnknownRecord,
  expectedKeys: readonly string[],
  path: string,
): string | undefined {
  const expected = new Set(expectedKeys);
  const unknown = Object.keys(value).filter((key) => !expected.has(key));
  if (unknown.length > 0) {
    return `${path} contains unknown fields: ${unknown.sort().join(", ")}.`;
  }
  const missing = expectedKeys.filter(
    (key) => !Object.prototype.hasOwnProperty.call(value, key),
  );
  return missing.length > 0
    ? `${path} is missing required fields: ${missing.join(", ")}.`
    : undefined;
}

function readMetrics(
  value: unknown,
):
  | ToolcraftPerformanceMeasurementMetrics
  | Readonly<{ error: string; ok: false }> {
  if (!isRecord(value)) {
    return { error: "Performance measurement.metrics must be an object.", ok: false };
  }
  const keyError = exactKeysError(value, metricKeys, "Performance measurement.metrics");
  if (keyError) return { error: keyError, ok: false };

  for (const key of metricKeys) {
    const metric = value[key];
    if (typeof metric !== "number" || !Number.isFinite(metric) || metric < 0) {
      return {
        error: `Performance measurement.metrics.${key} must be a finite number greater than or equal to zero.`,
        ok: false,
      };
    }
    if (integerMetricKeys.has(key) && !Number.isSafeInteger(metric)) {
      return {
        error: `Performance measurement.metrics.${key} must be a non-negative safe integer.`,
        ok: false,
      };
    }
  }
  if ((value.droppedFrameRatio as number) > 1) {
    return {
      error: "Performance measurement.metrics.droppedFrameRatio must not exceed 1.",
      ok: false,
    };
  }
  if ((value.droppedFrameCount as number) > (value.sampleCount as number)) {
    return {
      error: "Performance measurement.metrics.droppedFrameCount must not exceed sampleCount.",
      ok: false,
    };
  }

  return Object.freeze(
    Object.fromEntries(metricKeys.map((key) => [key, value[key]])) as unknown as
      ToolcraftPerformanceMeasurementMetrics,
  );
}

function readEvidence(value: unknown): ToolcraftPerformanceMeasurementDecodeResult {
  if (!isRecord(value)) {
    return { error: "Performance measurement must be an object.", ok: false };
  }
  const keyError = exactKeysError(
    value,
    [
      "evidenceType",
      "kind",
      "metrics",
      "pathId",
      "phase",
      "profile",
      "profileCatalogVersion",
      "version",
    ],
    "Performance measurement",
  );
  if (keyError) return { error: keyError, ok: false };
  if (value.evidenceType !== "performance-measurement-metrics") {
    return {
      error: 'Performance measurement.evidenceType must be "performance-measurement-metrics".',
      ok: false,
    };
  }
  if (value.version !== TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_VERSION) {
    return {
      error: `Performance measurement.version must be ${TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_VERSION}.`,
      ok: false,
    };
  }
  if (
    value.profileCatalogVersion !== TOOLCRAFT_PERFORMANCE_PROFILE_CATALOG_VERSION
  ) {
    return {
      error: `Performance measurement.profileCatalogVersion must be ${TOOLCRAFT_PERFORMANCE_PROFILE_CATALOG_VERSION}.`,
      ok: false,
    };
  }
  if (typeof value.pathId !== "string" || value.pathId.trim() !== value.pathId || !value.pathId) {
    return { error: "Performance measurement.pathId must be a trimmed string.", ok: false };
  }
  if (typeof value.phase !== "string" || !phaseSet.has(value.phase)) {
    return {
      error: `Performance measurement.phase must be one of ${TOOLCRAFT_PERFORMANCE_PIPELINE_PHASES.join(", ")}.`,
      ok: false,
    };
  }
  if (!isToolcraftPerformanceProfileName(value.profile)) {
    return {
      error: `Performance measurement.profile must be one of ${TOOLCRAFT_PERFORMANCE_PROFILE_NAMES.join(", ")}.`,
      ok: false,
    };
  }
  if (value.kind !== "interaction" && value.kind !== "animation-frames") {
    return {
      error: 'Performance measurement.kind must be "interaction" or "animation-frames".',
      ok: false,
    };
  }
  const metrics = readMetrics(value.metrics);
  if ("ok" in metrics) return metrics;

  return {
    evidence: Object.freeze({
      evidenceType: "performance-measurement-metrics",
      kind: value.kind,
      metrics,
      pathId: value.pathId,
      phase: value.phase as ToolcraftPerformancePipelinePhase,
      profile: value.profile as ToolcraftPerformanceProfileName,
      profileCatalogVersion: TOOLCRAFT_PERFORMANCE_PROFILE_CATALOG_VERSION,
      version: TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_VERSION,
    }),
    ok: true,
  };
}

function decodeBody(body: string | Uint8Array | undefined): string | undefined {
  if (typeof body === "string") return body;
  return body ? new TextDecoder().decode(body) : undefined;
}

export function decodeToolcraftPerformanceMeasurementBody(
  body: string | Uint8Array | undefined,
): ToolcraftPerformanceMeasurementDecodeResult {
  const decoded = decodeBody(body);
  if (!decoded) return { error: "Performance measurement body is missing.", ok: false };
  try {
    return readEvidence(JSON.parse(decoded) as unknown);
  } catch {
    return { error: "Performance measurement body is not valid JSON.", ok: false };
  }
}

export function serializeToolcraftPerformanceMeasurement(
  evidence: Omit<
    ToolcraftPerformanceMeasurementEvidence,
    "profileCatalogVersion" | "version"
  >,
): string {
  const parsed = readEvidence({
    ...evidence,
    profileCatalogVersion: TOOLCRAFT_PERFORMANCE_PROFILE_CATALOG_VERSION,
    version: TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_VERSION,
  });
  if (!parsed.ok) throw new Error(parsed.error);
  return JSON.stringify(parsed.evidence);
}

export function parseToolcraftPerformanceMeasurement(
  attachment: ToolcraftBrowserPerformanceAttachment | undefined,
): ToolcraftPerformanceMeasurementEvidence | undefined {
  if (
    !attachment ||
    attachment.name !== TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_ATTACHMENT_NAME ||
    attachment.contentType !== TOOLCRAFT_BROWSER_PERFORMANCE_MEASUREMENT_CONTENT_TYPE
  ) {
    return undefined;
  }
  const parsed = decodeToolcraftPerformanceMeasurementBody(attachment.body);
  return parsed.ok ? parsed.evidence : undefined;
}
