import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  getDecisionTrailVerificationErrors,
  getPerformanceIntentErrors,
} from "./app-acceptance.worklog-performance-intent-test-utils";
import {
  getToolcraftMarkdownSectionBodies,
  parseToolcraftDecisionTrail,
} from "../../scripts/toolcraft-worklog-decision-trail.mjs";
import {
  TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND,
} from "../../scripts/toolcraft-performance-authority-policy.mjs";
import type {
  ToolcraftMotionReferenceTimingMode,
} from "./acceptance/types";

const appDir = dirname(fileURLToPath(import.meta.url));
const projectDir = join(appDir, "../..");

export const agentWorklogPath = join(projectDir, "docs/toolcraft/agent-worklog.md");

const requiredAgentWorklogDecisionSections = [
  "Renderer",
  "View Interaction",
  "Interaction Ownership",
  "Timeline",
  "Layers",
  "Controls",
  "Export",
  "Performance",
] as const;
const requiredAgentWorklogSections = [
  "Status",
  "Decisions",
  "Decision Trail",
  ...requiredAgentWorklogDecisionSections,
  "Evidence",
  "Verification",
  "Risks",
] as const;
const agentWorklogDecisionTrailFieldOrder = [
  "Request",
  "Task type",
  "User-visible result",
  "Source/reference checked",
  "Reference inputs",
  "Docs/contracts read",
  "Contract rules applied",
  "View interaction intent",
  "Interaction ownership",
  "Decision",
  "Alternatives rejected",
  "State/output mapping",
  "Performance intent",
  "Performance request evidence",
  "Performance paths",
  "Verification",
  "Risks",
] as const;
const requiredAgentWorklogDecisionTrailFields = [
  "Request",
  "Task type",
  "User-visible result",
  "Source/reference checked",
  "Reference inputs",
  "Docs/contracts read",
  "Contract rules applied",
  "View interaction intent",
  "Interaction ownership",
  "Decision",
  "Alternatives rejected",
  "State/output mapping",
  "Performance intent",
  "Verification",
  "Risks",
] as const;
type WorklogDecisionSection = (typeof requiredAgentWorklogDecisionSections)[number];
type WorklogDecisionTrailField = (typeof agentWorklogDecisionTrailFieldOrder)[number];
type WorklogDecisionEvidence = {
  decision: string;
  evidence: string;
  reason: string;
};
export type AgentWorklogFixtureOptions = {
  decisions?: Partial<Record<WorklogDecisionSection, Partial<WorklogDecisionEvidence>>>;
  evidenceLines?: readonly string[];
  extraDecisionSections?: readonly string[];
  mode?: "product" | "starter";
  omitDecisionTrailFields?: readonly WorklogDecisionTrailField[];
  risksLines?: readonly string[];
  trailFields?: Partial<Record<WorklogDecisionTrailField, string>>;
  trailHeading?: string;
  verificationLines?: readonly string[];
};
export type WorklogMotionReference = Readonly<{
  contactSheetPath: string;
  referenceId: string;
  requiresRealTimeReview: boolean;
  requiresSlowedReview: boolean;
  sourceSha256: string;
  studyId: string;
  timingMode: ToolcraftMotionReferenceTimingMode;
}>;
const worklogVideoReferencePattern =
  /\b(?:source\/reference checked|source reviewed|reference inputs):[^\n]*(?:reference\s+(?:video|gif)|screen\s*recording|contact[-\s]*sheet|storyboard|frame[-\s]*by[-\s]*frame|extracted[-\s]*frames?|cleanshot|ffprobe|[^\s]+\.(?:mp4|mov|webm|gif))\b/i;
const motionReferenceRecordPattern =
  /^\s*[-*]\s+Motion reference study:\s*(?<fields>\S.*)$/iu;
const motionReferenceFieldPattern =
  /\b(?<name>referenceId|studyId|sourceSha256|timingMode|contactSheetPath|review)=(?<value>[^;]+?)(?=;\s*|$)/giu;
export function readToolcraftDoc(relativePath: string): string {
  return readFileSync(join(projectDir, "docs/toolcraft", relativePath), "utf8");
}

const defaultDecisionEvidence: Record<WorklogDecisionSection, WorklogDecisionEvidence> = {
  Controls: {
    decision: "Group controls by product entity.",
    evidence: "src/app/app-schema.ts.",
    reason: "Each section maps to visible output behavior.",
  },
  Export: {
    decision: "Provide PNG export.",
    evidence: "panelActions.",
    reason: "The product output is exportable.",
  },
  Layers: {
    decision: "Do not enable layers.",
    evidence: "appSchema.panels.layers is omitted.",
    reason: "The product edits one output.",
  },
  Performance: {
    decision: "Use lifecycle-aware protected delivery verification.",
    evidence: `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND} protected receipt.`,
    reason:
      "The runner chooses complete initial functional proof, exact ownership-derived later functional proof, or one request-backed targeted performance iteration; full certification remains operator-only.",
  },
  Renderer: {
    decision: "Use SVG renderer.",
    evidence: "src/app/product-renderer.tsx.",
    reason: "The product output is vector-native.",
  },
  "View Interaction": {
    decision: "Use non-spatial view interaction.",
    evidence: "appProductReadiness.viewInteraction.",
    reason: "The product has no visible three-dimensional scene or model.",
  },
  "Interaction Ownership": {
    decision: "Keep each user operation on one evidence-backed primary surface.",
    evidence: "appProductReadiness.interactionOwnership.",
    reason: "Canvas and panel interactions remain complementary instead of mirrored.",
  },
  Timeline: {
    decision: "Do not enable timeline.",
    evidence: "appSchema.panels.timeline is omitted.",
    reason: "The product is still output.",
  },
};

const defaultDecisionTrailFields: Partial<
  Record<WorklogDecisionTrailField, string>
> = {
  "Alternatives rejected": "Canvas output because vector output must stay crisp.",
  "Contract rules applied": "runtime-shell-required and output-export-required.",
  Decision: "Use SVG renderer with Toolcraft controls.",
  "Docs/contracts read": "workflow.md, assembly-workflow.md, and performance.md.",
  "Performance intent": "ordinary-product-work",
  "Reference inputs": "None.",
  Request: "Build a still vector poster app.",
  Risks: "None; browser and performance gates cover the touched surfaces.",
  "Source/reference checked": "User prompt.",
  "State/output mapping": "Schema values feed product-renderer.tsx and export uses runtime state.",
  "Task type": "Schema, renderer, export, acceptance, and performance.",
  "User-visible result": "The canvas renders the poster and exports PNG.",
  Verification: `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND}.`,
  "View interaction intent": "non-spatial; the product has no visible three-dimensional scene or model.",
  "Interaction ownership":
    "No cross-surface product operations; panel controls own their distinct property edits.",
};

function renderDecisionSection(
  section: WorklogDecisionSection,
  overrides: Partial<WorklogDecisionEvidence> | undefined,
): string {
  const decision = {
    ...defaultDecisionEvidence[section],
    ...overrides,
  };

  return [
    `### ${section}`,
    `- Decision: ${decision.decision}`,
    `- Reason: ${decision.reason}`,
    `- Evidence: ${decision.evidence}`,
  ].join("\n");
}

export function createAgentWorklogFixture({
  decisions = {},
  evidenceLines = [
    "- Source reviewed: src/app/app-schema.ts and src/app/product-renderer.tsx.",
    "- Contract applied: runtime-shell-required and performance-coverage-levels.",
  ],
  extraDecisionSections = [],
  mode = "product",
  omitDecisionTrailFields = [],
  risksLines = ["- None: no known risk."],
  trailFields = {},
  trailHeading = "Delivery 1 - Product build",
  verificationLines = [
    "Protected receipts own commands, selectors, measurements, and pass/fail evidence.",
  ],
}: AgentWorklogFixtureOptions = {}): string {
  const omittedFields = new Set<WorklogDecisionTrailField>(omitDecisionTrailFields);
  const resolvedTrailFields = {
    ...defaultDecisionTrailFields,
    ...trailFields,
  };
  const decisionTrailLines = agentWorklogDecisionTrailFieldOrder
    .filter((field) => !omittedFields.has(field))
    .flatMap((field) => {
      const value = resolvedTrailFields[field];
      return value === undefined ? [] : [`- ${field}: ${value}`];
    });

  return [
    "# Implementation Worklog",
    "",
    "## Status",
    "",
    `Mode: ${mode}`,
    "",
    "## Decisions",
    "",
    ...requiredAgentWorklogDecisionSections.map((section) =>
      renderDecisionSection(section, decisions[section]),
    ),
    ...extraDecisionSections,
    "",
    "## Decision Trail",
    "",
    `### ${trailHeading}`,
    "",
    ...decisionTrailLines,
    "",
    "## Evidence",
    "",
    ...evidenceLines,
    "",
    "## Verification",
    "",
    ...verificationLines,
    "",
    "## Risks",
    "",
    ...risksLines,
  ].join("\n");
}

function getMarkdownSectionBody(source: string, heading: string): string {
  return getToolcraftMarkdownSectionBodies(source, heading)[0] ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type MotionReferenceRecord = Readonly<{
  contactSheetPath?: string;
  referenceId?: string;
  review?: string;
  sourceSha256?: string;
  studyId?: string;
  timingMode?: string;
}>;

function getAuthoritativeWorklogSource(source: string): string {
  return requiredAgentWorklogSections
    .map((section) => getMarkdownSectionBody(source, section))
    .join("\n");
}

function getMotionReferenceRecords(
  authoritativeSource: string,
): readonly MotionReferenceRecord[] {
  return authoritativeSource.split(/\r?\n/u).flatMap((line) => {
    const recordMatch = motionReferenceRecordPattern.exec(line);
    if (!recordMatch?.groups?.fields) return [];

    const fields: Record<string, string> = {};
    for (const match of recordMatch.groups.fields.matchAll(
      motionReferenceFieldPattern,
    )) {
      if (!match.groups) continue;
      fields[match.groups.name] = match.groups.value
        .trim()
        .replace(/[.]$/u, "");
    }
    return [fields];
  });
}

function recordMatchesMotionReference(
  record: MotionReferenceRecord,
  motionReference: WorklogMotionReference,
): boolean {
  if (
    record.contactSheetPath !== motionReference.contactSheetPath ||
    record.referenceId !== motionReference.referenceId ||
    record.sourceSha256 !== motionReference.sourceSha256 ||
    record.studyId !== motionReference.studyId ||
    record.timingMode !== motionReference.timingMode
  ) {
    return false;
  }

  const reviewModes = new Set(
    (record.review ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (motionReference.timingMode === "ordinal") {
    return (
      reviewModes.has("ordered-frames") &&
      !reviewModes.has("real-time") &&
      !reviewModes.has("slowed")
    );
  }
  if (
    (motionReference.timingMode === "seconds" ||
      motionReference.requiresRealTimeReview) &&
    !reviewModes.has("real-time")
  ) {
    return false;
  }
  return (
    !motionReference.requiresSlowedReview || reviewModes.has("slowed")
  );
}

function describeRequiredReview(motionReference: WorklogMotionReference): string {
  if (motionReference.timingMode === "ordinal") return "ordered-frames";
  return motionReference.requiresSlowedReview
    ? "real-time,slowed"
    : "real-time";
}

export function getAgentWorklogValidationErrors(
  source: string,
  options: Readonly<{
    motionReferences?: readonly WorklogMotionReference[];
  }> = {},
): string[] {
  const errors: string[] = [];
  const motionReferences = options.motionReferences ?? [];
  const authoritativeSource = getAuthoritativeWorklogSource(source);

  for (const section of requiredAgentWorklogSections) {
    if (!getMarkdownSectionBody(source, section)) {
      errors.push(`agent-worklog.md must include a populated "${section}" section.`);
    }
  }

  const statusBody = getMarkdownSectionBody(source, "Status");

  if (!/\bMode:\s*product\b/i.test(statusBody)) {
    errors.push('agent-worklog.md Status must declare "Mode: product" before final delivery.');
  }

  if (/\bMode:\s*starter\b/i.test(statusBody)) {
    errors.push('agent-worklog.md still declares "Mode: starter"; replace the starter template with product decisions.');
  }

  for (const section of requiredAgentWorklogDecisionSections) {
    const body = getMarkdownSectionBody(source, section);

    if (!/\bDecision:\s*\S/i.test(body)) {
      errors.push(`agent-worklog.md "${section}" must include a concrete Decision.`);
    }

    if (!/\bReason:\s*\S/i.test(body)) {
      errors.push(`agent-worklog.md "${section}" must include the Reason for the decision.`);
    }

    if (!/\bEvidence:\s*\S/i.test(body)) {
      errors.push(`agent-worklog.md "${section}" must include Evidence such as files, tests, browser checks, or contract rules.`);
    }
  }

  const decisionTrail = parseToolcraftDecisionTrail(source);
  errors.push(...decisionTrail.errors);
  const isFocusedEntry = (body: string) => /^-[ \t]*Entry type:[ \t]*focused[ \t]*$/imu.test(body);
  if (decisionTrail.iterations.length > 0 && decisionTrail.iterations.every((iteration) => isFocusedEntry(iteration.body))) {
    errors.push("agent-worklog.md must retain its initial delivery decision entry before adding focused follow-ups.");
  }

  for (const iteration of decisionTrail.iterations) {
    const focused = isFocusedEntry(iteration.body);
    const requiredFields: readonly string[] = focused
      ? ["Change ID", "Request", "Changed owner", "User-visible result", "Verification", "Risks"]
      : requiredAgentWorklogDecisionTrailFields;
    for (const field of requiredFields) {
      if (field === "Performance intent") continue;

      const fieldPattern = new RegExp(`\\b${escapeRegExp(field)}:\\s*\\S`, "i");

      if (!fieldPattern.test(iteration.body)) {
        errors.push(
          `agent-worklog.md Decision Trail iteration "${iteration.heading}" must include "${field}:".`,
        );
      }
    }

    errors.push(...getDecisionTrailVerificationErrors(iteration));
    errors.push(...getPerformanceIntentErrors(iteration));
  }

  const evidenceBody = getMarkdownSectionBody(source, "Evidence");
  const risksBody = getMarkdownSectionBody(source, "Risks");

  if (!/\b(Source reviewed|Contract applied|Evidence):\s*\S/i.test(evidenceBody)) {
    errors.push("agent-worklog.md Evidence must name reviewed files, references, or contract rules.");
  }

  if (
    worklogVideoReferencePattern.test(authoritativeSource) &&
    motionReferences.length === 0
  ) {
    errors.push(
      "agent-worklog.md cites a video reference, screen recording, GIF, extracted frames, or contact sheet, but appTransferMode.referenceInputs registers no motion reference input.",
    );
  }

  const motionReferenceRecords = getMotionReferenceRecords(authoritativeSource);
  for (const motionReference of motionReferences) {
    if (
      motionReferenceRecords.some((record) =>
        recordMatchesMotionReference(record, motionReference),
      )
    ) {
      continue;
    }
    errors.push(
      `agent-worklog.md motion reference study "${motionReference.studyId}" for reference "${motionReference.referenceId}" must include one exact "Motion reference study:" record with referenceId=${motionReference.referenceId}; studyId=${motionReference.studyId}; sourceSha256=${motionReference.sourceSha256}; timingMode=${motionReference.timingMode}; contactSheetPath=${motionReference.contactSheetPath}; review=${describeRequiredReview(motionReference)}.`,
    );
  }

  if (!/\b(Risk|None):\s*\S/i.test(risksBody)) {
    errors.push('agent-worklog.md Risks must include either "Risk:" entries or "None:" with a reason.');
  }

  return [...new Set(errors)];
}
