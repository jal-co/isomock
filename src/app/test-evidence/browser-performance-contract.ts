import type {
  ToolcraftPerformanceProfileName,
  ToolcraftRendererPipelineSnapshot,
} from "@/toolcraft/runtime";
import {
  TOOLCRAFT_PERFORMANCE_PROFILE_NAMES,
  isToolcraftPerformanceProfileName,
} from "@/toolcraft/runtime";

export const TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_VERSION = 1 as const;
export const TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME =
  "toolcraft.browser-performance-evidence";
export const TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_CONTENT_TYPE =
  "application/vnd.toolcraft.browser-performance-evidence+json";

export const TOOLCRAFT_PERFORMANCE_PIPELINE_PHASES = [
  "cold",
  "warm",
  "sustained",
] as const;

export const TOOLCRAFT_PERFORMANCE_PIPELINE_COUNTER_KEYS = [
  "cacheHits",
  "cacheMisses",
  "executions",
  "resourceCreations",
  "resourceDisposals",
  "transfers",
] as const;

export const TOOLCRAFT_PERFORMANCE_PIPELINE_DURATION_KEYS = [
  "durationMax",
  "durationTotal",
] as const;

export const TOOLCRAFT_PERFORMANCE_PIPELINE_GAUGE_KEYS = [
  "activeResources",
] as const;

export const TOOLCRAFT_PERFORMANCE_PIPELINE_METRIC_KEYS = [
  ...TOOLCRAFT_PERFORMANCE_PIPELINE_COUNTER_KEYS,
  ...TOOLCRAFT_PERFORMANCE_PIPELINE_DURATION_KEYS,
  ...TOOLCRAFT_PERFORMANCE_PIPELINE_GAUGE_KEYS,
] as const;

export type ToolcraftPerformancePipelinePhase =
  (typeof TOOLCRAFT_PERFORMANCE_PIPELINE_PHASES)[number];

export type ToolcraftPerformancePipelineCounterKey =
  (typeof TOOLCRAFT_PERFORMANCE_PIPELINE_COUNTER_KEYS)[number];

export type ToolcraftPerformancePipelineDurationKey =
  (typeof TOOLCRAFT_PERFORMANCE_PIPELINE_DURATION_KEYS)[number];

export type ToolcraftPerformancePipelineGaugeKey =
  (typeof TOOLCRAFT_PERFORMANCE_PIPELINE_GAUGE_KEYS)[number];

export type ToolcraftPerformancePipelineMetricKey =
  (typeof TOOLCRAFT_PERFORMANCE_PIPELINE_METRIC_KEYS)[number];

export type ToolcraftPerformancePipelinePassSnapshot = Readonly<{
  activeResources: number;
  cacheHits: number;
  cacheMisses: number;
  durationMax: number;
  durationTotal: number;
  executions: number;
  passId: string;
  resourceCreations: number;
  resourceDisposals: number;
  transfers: number;
}>;

export type ToolcraftPerformancePipelineSnapshot = Readonly<{
  disposed: boolean;
  passes: readonly ToolcraftPerformancePipelinePassSnapshot[];
  runtimeId: string;
}>;

export type ToolcraftPerformancePipelineEvidence = Readonly<{
  after: ToolcraftPerformancePipelineSnapshot;
  before: ToolcraftPerformancePipelineSnapshot;
  evidenceType: "performance-pipeline";
  pathId: string;
  phase: ToolcraftPerformancePipelinePhase;
  profile: ToolcraftPerformanceProfileName;
  version: typeof TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_VERSION;
}>;

export type ToolcraftBrowserPerformanceAttachment = Readonly<{
  body?: string | Uint8Array;
  contentType: string;
  name: string;
}>;

export type ToolcraftBrowserPerformanceEvidenceDecodeResult =
  | Readonly<{ evidence: ToolcraftPerformancePipelineEvidence; ok: true }>
  | Readonly<{ error: string; ok: false }>;

type ToolcraftBrowserPerformanceEvidenceDecodeFailure = Extract<
  ToolcraftBrowserPerformanceEvidenceDecodeResult,
  { ok: false }
>;

type UnknownRecord = Record<string, unknown>;

const phaseSet = new Set<string>(TOOLCRAFT_PERFORMANCE_PIPELINE_PHASES);
const counterKeySet = new Set<string>(
  [
    ...TOOLCRAFT_PERFORMANCE_PIPELINE_COUNTER_KEYS,
    ...TOOLCRAFT_PERFORMANCE_PIPELINE_GAUGE_KEYS,
  ],
);

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTrimmedNonEmptyString(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.trim() === value
  );
}

function exactKeysError(
  value: UnknownRecord,
  expectedKeys: readonly string[],
  path: string,
): string | undefined {
  const expected = new Set(expectedKeys);
  const unknown = Object.keys(value)
    .filter((key) => !expected.has(key))
    .sort(compareCodeUnits);
  if (unknown.length > 0) {
    return `${path} contains unknown field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`;
  }

  const missing = expectedKeys.filter(
    (key) => !Object.prototype.hasOwnProperty.call(value, key),
  );
  if (missing.length > 0) {
    return `${path} is missing required field${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`;
  }

  return undefined;
}

function readPassSnapshot(
  value: unknown,
  path: string,
):
  | ToolcraftBrowserPerformanceEvidenceDecodeFailure
  | ToolcraftPerformancePipelinePassSnapshot {
  if (!isRecord(value)) {
    return { error: `${path} must be an object.`, ok: false };
  }

  const keyError = exactKeysError(
    value,
    ["passId", ...TOOLCRAFT_PERFORMANCE_PIPELINE_METRIC_KEYS],
    path,
  );
  if (keyError) return { error: keyError, ok: false };

  if (!isTrimmedNonEmptyString(value.passId)) {
    return { error: `${path}.passId must be a non-empty trimmed string.`, ok: false };
  }

  for (const key of TOOLCRAFT_PERFORMANCE_PIPELINE_METRIC_KEYS) {
    const metric = value[key];
    if (typeof metric !== "number" || !Number.isFinite(metric) || metric < 0) {
      return {
        error: `${path}.${key} must be a finite number greater than or equal to zero.`,
        ok: false,
      };
    }
    if (counterKeySet.has(key) && !Number.isSafeInteger(metric)) {
      return {
        error: `${path}.${key} must be a safe integer greater than or equal to zero.`,
        ok: false,
      };
    }
  }

  return Object.freeze({
    activeResources: value.activeResources as number,
    cacheHits: value.cacheHits as number,
    cacheMisses: value.cacheMisses as number,
    durationMax: value.durationMax as number,
    durationTotal: value.durationTotal as number,
    executions: value.executions as number,
    passId: value.passId,
    resourceCreations: value.resourceCreations as number,
    resourceDisposals: value.resourceDisposals as number,
    transfers: value.transfers as number,
  });
}

function readSnapshot(
  value: unknown,
  path: string,
):
  | ToolcraftBrowserPerformanceEvidenceDecodeFailure
  | ToolcraftPerformancePipelineSnapshot {
  if (!isRecord(value)) {
    return { error: `${path} must be an object.`, ok: false };
  }

  const keyError = exactKeysError(
    value,
    ["disposed", "passes", "runtimeId"],
    path,
  );
  if (keyError) return { error: keyError, ok: false };

  if (typeof value.disposed !== "boolean") {
    return { error: `${path}.disposed must be a boolean.`, ok: false };
  }
  if (!isTrimmedNonEmptyString(value.runtimeId)) {
    return { error: `${path}.runtimeId must be a non-empty trimmed string.`, ok: false };
  }
  if (!Array.isArray(value.passes)) {
    return { error: `${path}.passes must be an array.`, ok: false };
  }

  const passes: ToolcraftPerformancePipelinePassSnapshot[] = [];
  const passIds = new Set<string>();
  for (const [index, passValue] of value.passes.entries()) {
    const pass = readPassSnapshot(passValue, `${path}.passes[${index}]`);
    if ("ok" in pass) return pass;
    if (passIds.has(pass.passId)) {
      return {
        error: `${path}.passes contains duplicate passId "${pass.passId}".`,
        ok: false,
      };
    }
    passIds.add(pass.passId);
    passes.push(pass);
  }

  passes.sort((left, right) => compareCodeUnits(left.passId, right.passId));
  return Object.freeze({
    disposed: value.disposed,
    passes: Object.freeze(passes),
    runtimeId: value.runtimeId,
  });
}

function readEvidenceValue(
  value: unknown,
): ToolcraftBrowserPerformanceEvidenceDecodeResult {
  if (!isRecord(value)) {
    return { error: "Performance evidence must be an object.", ok: false };
  }

  const keyError = exactKeysError(
    value,
    [
      "after",
      "before",
      "evidenceType",
      "pathId",
      "phase",
      "profile",
      "version",
    ],
    "Performance evidence",
  );
  if (keyError) return { error: keyError, ok: false };

  if (value.evidenceType !== "performance-pipeline") {
    return {
      error: 'Performance evidence.evidenceType must be "performance-pipeline".',
      ok: false,
    };
  }
  if (value.version !== TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_VERSION) {
    return {
      error: `Performance evidence.version must be ${TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_VERSION}.`,
      ok: false,
    };
  }
  if (!isTrimmedNonEmptyString(value.pathId)) {
    return {
      error: "Performance evidence.pathId must be a non-empty trimmed string.",
      ok: false,
    };
  }
  if (typeof value.phase !== "string" || !phaseSet.has(value.phase)) {
    return {
      error: `Performance evidence.phase must be one of ${TOOLCRAFT_PERFORMANCE_PIPELINE_PHASES.join(", ")}.`,
      ok: false,
    };
  }
  if (!isToolcraftPerformanceProfileName(value.profile)) {
    return {
      error: `Performance evidence.profile must be one of ${TOOLCRAFT_PERFORMANCE_PROFILE_NAMES.join(", ")}.`,
      ok: false,
    };
  }

  const before = readSnapshot(value.before, "Performance evidence.before");
  if ("ok" in before) return before;
  const after = readSnapshot(value.after, "Performance evidence.after");
  if ("ok" in after) return after;

  return {
    evidence: Object.freeze({
      after,
      before,
      evidenceType: "performance-pipeline",
      pathId: value.pathId,
      phase: value.phase as ToolcraftPerformancePipelinePhase,
      profile: value.profile,
      version: TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_VERSION,
    }),
    ok: true,
  };
}

function decodeAttachmentBody(
  body: string | Uint8Array | undefined,
): string | undefined {
  if (typeof body === "string") return body;
  return body ? new TextDecoder().decode(body) : undefined;
}

export function decodeToolcraftBrowserPerformanceEvidenceBody(
  body: string | Uint8Array | undefined,
): ToolcraftBrowserPerformanceEvidenceDecodeResult {
  const decoded = decodeAttachmentBody(body);
  if (!decoded) {
    return { error: "Performance evidence attachment body is missing.", ok: false };
  }

  try {
    return readEvidenceValue(JSON.parse(decoded) as unknown);
  } catch {
    return { error: "Performance evidence attachment body is not valid JSON.", ok: false };
  }
}

export function createToolcraftPerformancePipelineSnapshot(
  snapshot: ToolcraftRendererPipelineSnapshot,
): ToolcraftPerformancePipelineSnapshot {
  const candidate = {
    disposed: snapshot.disposed,
    passes: Object.entries(snapshot.passes).map(([passId, counters]) => ({
      passId,
      ...counters,
    })),
    runtimeId: snapshot.runtimeId,
  };
  const parsed = readSnapshot(candidate, "Performance pipeline snapshot");
  if ("ok" in parsed) throw new Error(parsed.error);
  return parsed;
}

export function serializeToolcraftBrowserPerformanceEvidence(
  evidence: Omit<ToolcraftPerformancePipelineEvidence, "version">,
): string {
  const parsed = readEvidenceValue({
    ...evidence,
    version: TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_VERSION,
  });
  if (!parsed.ok) throw new Error(parsed.error);
  return JSON.stringify(parsed.evidence);
}

export function parseToolcraftBrowserPerformanceEvidence(
  attachment: ToolcraftBrowserPerformanceAttachment | undefined,
): ToolcraftPerformancePipelineEvidence | undefined {
  if (
    !attachment ||
    attachment.name !== TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME ||
    attachment.contentType !== TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_CONTENT_TYPE
  ) {
    return undefined;
  }

  const result = decodeToolcraftBrowserPerformanceEvidenceBody(attachment.body);
  return result.ok ? result.evidence : undefined;
}
