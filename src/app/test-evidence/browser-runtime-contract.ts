export const TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_VERSION = 2 as const;
export const TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_ATTACHMENT_NAME =
  "toolcraft.browser-runtime-evidence";
export const TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_CONTENT_TYPE =
  "application/vnd.toolcraft.browser-runtime-evidence+json";
export const TOOLCRAFT_BROWSER_ACCEPTANCE_MARKER_TEST_NAME =
  "toolcraft: validate complete browser acceptance runtime evidence";
export const TOOLCRAFT_BROWSER_ACCEPTANCE_MARKER_FILE_NAME =
  "app-browser-runtime-evidence.spec.ts";
export const TOOLCRAFT_BROWSER_PERFORMANCE_MARKER_TEST_NAME =
  "browser perf: toolcraft: validate complete performance runtime evidence";

export const TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_TYPES = [
  "background-image-transparency",
  "background-finite-media-stacking",
  "background-infinity-viewport",
  "background-preview-exclusion",
  "background-video-preserved",
  "canvas-export-clean",
  "canvas-handle-interaction",
  "canvas-render-scale-backing",
  "command-side-effect",
  "compound-control-part",
  "control-applicability-hidden",
  "control-applicability-visible",
  "discrete-slider-layout",
  "exported-artifact",
  "infinity-mode-continuity",
  "infinity-output-overflow",
  "infinity-scene-bounds-image-export",
  "infinity-scene-bounds-svg-export",
  "infinity-scene-bounds-video-export",
  "image-export-artifact",
  "layer-grouping",
  "layer-media-lifecycle",
  "layer-reorder",
  "layer-selected-layer-controls",
  "layer-selection",
  "layer-visibility",
  "media-lifecycle",
  "model-advertised-format-import",
  "model-appearance-preservation",
  "model-clean-commit",
  "model-deterministic-root-selection",
  "model-export-output",
  "model-fallback-appearance",
  "model-fatal-rejection",
  "model-history-reset",
  "model-package-extraction",
  "model-persistence-restore",
  "model-preview-output",
  "model-pixel-output",
  "model-presentation-consumer-readiness",
  "model-repair-action",
  "model-repair-progress",
  "model-repairable-diagnosis",
  "model-resource-unavailable",
  "model-staged-preview",
  "model-verified-repair",
  "orientation-axis-drag",
  "orientation-axis-snap",
  "orientation-canvas-miss-pan",
  "orientation-model-drag",
  "orientation-shared-pose-output",
  "orientation-undo-reset",
  "performance-animation-frames",
  "performance-budget",
  "performance-control-drag",
  "performance-measurement",
  "performance-output-completion",
  "performance-product-outcome",
  "performance-render-scale",
  "performance-compiled-fixture",
  "performance-viewport",
  "persistence-state",
  "product-observable-change",
  "reference-parity",
  "segmented-control-layout",
  "selection-scoped-control",
  "svg-export-artifact",
  "timeline-duration",
  "timeline-keyframes",
  "timeline-loop",
  "timeline-pause-resume",
  "timeline-rendered-frame",
  "timeline-scrub",
  "video-export-artifact",
  "vector-screen-motion",
  "viewport-side-effect",
] as const;

export type ToolcraftBrowserRuntimeEvidenceType =
  (typeof TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_TYPES)[number];

const toolcraftBrowserRuntimeEvidenceTypeSet = new Set<string>(
  TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_TYPES,
);

export type ToolcraftBrowserAcceptanceOutcomeEvidenceType =
  "command-side-effect";

export type ToolcraftBrowserRuntimeEvidence = {
  evidenceType: ToolcraftBrowserRuntimeEvidenceType;
  requirementId: string;
  target?: string;
  version: typeof TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_VERSION;
};

export type ToolcraftBrowserRuntimeRequirement = {
  evidenceType: ToolcraftBrowserRuntimeEvidenceType;
  requirementId: string;
  target?: string;
  testName: string;
};

export type ToolcraftBrowserRuntimeAttachment = {
  body?: string | Uint8Array;
  contentType: string;
  name: string;
};

export type ToolcraftBrowserRuntimeTestResult = {
  attachments: readonly ToolcraftBrowserRuntimeAttachment[];
  retry: number;
  status: string;
};

export type ToolcraftBrowserRuntimeTest = {
  expectedStatus: string;
  results: readonly ToolcraftBrowserRuntimeTestResult[];
  title: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeAttachmentBody(body: string | Uint8Array | undefined): string | undefined {
  if (typeof body === "string") {
    return body;
  }

  return body ? new TextDecoder().decode(body) : undefined;
}

function isToolcraftBrowserRuntimeEvidenceType(
  value: unknown,
): value is ToolcraftBrowserRuntimeEvidenceType {
  return (
    typeof value === "string" && toolcraftBrowserRuntimeEvidenceTypeSet.has(value)
  );
}

export function serializeToolcraftBrowserRuntimeEvidence(
  evidence: Omit<ToolcraftBrowserRuntimeEvidence, "version">,
): string {
  if (!evidence.requirementId.trim()) {
    throw new Error("Toolcraft browser runtime evidence requires a requirementId.");
  }

  return JSON.stringify({
    evidenceType: evidence.evidenceType,
    requirementId: evidence.requirementId,
    ...(evidence.target === undefined ? {} : { target: evidence.target }),
    version: TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_VERSION,
  } satisfies ToolcraftBrowserRuntimeEvidence);
}

export function parseToolcraftBrowserRuntimeEvidence(
  attachment: ToolcraftBrowserRuntimeAttachment | undefined,
): ToolcraftBrowserRuntimeEvidence | undefined {
  if (
    !attachment ||
    attachment.name !== TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_ATTACHMENT_NAME ||
    attachment.contentType !== TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_CONTENT_TYPE
  ) {
    return undefined;
  }

  const body = decodeAttachmentBody(attachment.body);
  if (!body) {
    return undefined;
  }

  try {
    const evidence: unknown = JSON.parse(body);
    if (
      !isRecord(evidence) ||
      evidence.version !== TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_VERSION ||
      typeof evidence.requirementId !== "string" ||
      !evidence.requirementId.trim() ||
      (evidence.target !== undefined &&
        (typeof evidence.target !== "string" || !evidence.target.trim())) ||
      !isToolcraftBrowserRuntimeEvidenceType(evidence.evidenceType)
    ) {
      return undefined;
    }

    return {
      evidenceType: evidence.evidenceType,
      requirementId: evidence.requirementId,
      ...(evidence.target === undefined ? {} : { target: evidence.target }),
      version: evidence.version,
    };
  } catch {
    return undefined;
  }
}

function finalTestResult(
  test: ToolcraftBrowserRuntimeTest,
): ToolcraftBrowserRuntimeTestResult | undefined {
  return test.results.at(-1);
}

export function evaluateToolcraftBrowserRuntimeEvidence({
  requirements,
  tests,
}: {
  requirements: readonly ToolcraftBrowserRuntimeRequirement[];
  tests: readonly ToolcraftBrowserRuntimeTest[];
}): string[] {
  const errors: string[] = [];

  for (const requirement of requirements) {
    const matchingTests = tests.filter(
      (test) => test.title === requirement.testName,
    );

    if (matchingTests.length === 0) {
      errors.push(
        `Missing required browser test "${requirement.testName}" for acceptance requirement "${requirement.requirementId}".`,
      );
      continue;
    }

    if (matchingTests.length > 1) {
      errors.push(
        `Duplicate required browser test "${requirement.testName}" for acceptance requirement "${requirement.requirementId}".`,
      );
      continue;
    }

    const [test] = matchingTests;
    if (test.expectedStatus !== "passed") {
      errors.push(
        `Required browser test "${requirement.testName}" must have expected status "passed"; received "${test.expectedStatus}".`,
      );
    }

    const finalResult = finalTestResult(test);
    if (finalResult?.status !== "passed") {
      errors.push(
        `Required browser test "${requirement.testName}" must finish with actual status "passed"; received "${finalResult?.status ?? "missing"}".`,
      );
    }

    const hasMatchingEvidence = finalResult?.attachments.some((attachment) => {
      const evidence = parseToolcraftBrowserRuntimeEvidence(attachment);

      return (
        evidence?.requirementId === requirement.requirementId &&
        evidence.evidenceType === requirement.evidenceType &&
        (requirement.target === undefined || evidence.target === requirement.target)
      );
    });

    if (!hasMatchingEvidence) {
      const targetClause =
        requirement.target === undefined
          ? ""
          : ` and target "${requirement.target}"`;
      errors.push(
        `Required browser test "${requirement.testName}" must attach matching runtime evidence for requirement "${requirement.requirementId}" with type "${requirement.evidenceType}"${targetClause} in its final result.`,
      );
    }
  }

  return errors;
}
