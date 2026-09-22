import type { ResolvedToolcraftAppSchema } from "@/toolcraft/runtime";

import {
  isValidTimelineLoopDurationSource,
} from "./timeline-loop";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftReferenceCoverage,
  ToolcraftReferenceTimelineCoverage,
  ToolcraftTransferMode,
} from "./types";

const referenceTransportCoverage = new Set<ToolcraftReferenceCoverage>([
  "export-at-time",
  "pause-resume",
  "restart",
  "time-progress",
]);

const toolcraftReferenceTimelineCoverage = new Set<ToolcraftReferenceTimelineCoverage>([
  "duration",
  "export-at-time",
  "keyframes",
  "loop",
  "playback",
  "restart",
  "scrub",
  "time-progress",
]);

const customReferenceTimelineCoverage = new Set<ToolcraftReferenceTimelineCoverage>([
  "all-range",
  "export-range",
  "jump-to-trim-start",
  "range-playback",
  "state-jump",
  "trim-range",
]);

function getReferenceTimelineLoopDurationErrors({
  referenceTimelineMode,
  schema,
  transferMode,
}: {
  referenceTimelineMode: "toolcraft-keyframes" | "toolcraft-playback";
  schema: ResolvedToolcraftAppSchema;
  transferMode: Extract<ToolcraftTransferMode, { mode: "reference-runtime-clone" }>;
}): string[] {
  const errors: string[] = [];
  const referenceTimeline = transferMode.referenceTimeline;
  const timelineDefaultDurationSeconds = schema.panels.timeline?.defaultDurationSeconds;
  const loopDuration = referenceTimeline.loopDuration;

  if (!loopDuration) {
    errors.push(
      `referenceTimeline mode "${referenceTimelineMode}" must declare loopDuration with source, seconds, and evidence. Do not let runtime/template fallback duration such as 8s stand in for reference loop intent.`,
    );
    return errors;
  }

  if (!Number.isFinite(loopDuration.seconds) || loopDuration.seconds <= 0) {
    errors.push(
      `referenceTimeline.loopDuration.seconds must be a positive finite duration; received ${String(loopDuration.seconds)}.`,
    );
  }

  if (!isValidTimelineLoopDurationSource(loopDuration.source)) {
    errors.push(
      `referenceTimeline.loopDuration.source must be "reference", "user-request", or "product-derived"; received "${String(loopDuration.source)}". Runtime/template fallback is not a valid loop-duration source.`,
    );
  }

  if (!loopDuration.evidence.trim()) {
    errors.push(
      "referenceTimeline.loopDuration.evidence must explain where the reference loop duration came from, such as measured reference timing, an explicit user request, or a product-derived timing rule.",
    );
  }

  if (typeof timelineDefaultDurationSeconds !== "number") {
    errors.push(
      "Toolcraft reference playback/keyframe timelines must set panels.timeline.defaultDurationSeconds to referenceTimeline.loopDuration.seconds so the initial UI duration is not the runtime fallback.",
    );
  } else if (
    Number.isFinite(loopDuration.seconds) &&
    Math.abs(timelineDefaultDurationSeconds - loopDuration.seconds) > 0.001
  ) {
    errors.push(
      `panels.timeline.defaultDurationSeconds (${timelineDefaultDurationSeconds}) must match referenceTimeline.loopDuration.seconds (${loopDuration.seconds}).`,
    );
  }

  return errors;
}

function getReferenceTimelineAcceptanceCoverageErrors({
  acceptance,
  declaredReferenceTimelineCoverage,
  referenceTimelineMode,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  declaredReferenceTimelineCoverage: ReadonlySet<ToolcraftReferenceTimelineCoverage>;
  referenceTimelineMode: string;
}): string[] {
  const errors: string[] = [];

  for (const coverage of declaredReferenceTimelineCoverage) {
    if (
      customReferenceTimelineCoverage.has(coverage) &&
      referenceTimelineMode !== "custom-reference-timeline"
    ) {
      errors.push(
        `referenceTimeline mode "${referenceTimelineMode}" cannot preserve custom reference timeline behavior "${coverage}". Use mode "custom-reference-timeline" and browser-backed referenceTimelineCoverage instead.`,
      );
    }

    const entry = acceptance.find(
      (acceptanceEntry) => acceptanceEntry.referenceTimelineCoverage === coverage,
    );

    if (!entry) {
      errors.push(
        `referenceTimeline behaviorCoverage "${coverage}" is missing an acceptance entry with referenceTimelineCoverage "${coverage}".`,
      );
      continue;
    }

    if (entry.kind !== "runtime") {
      errors.push(
        `${entry.id} must be a runtime acceptance entry proving reference timeline behavior "${coverage}".`,
      );
    }

    if (!entry.automated || !entry.automatedTestName.trim()) {
      errors.push(
        `${entry.id} must have automated coverage proving reference timeline behavior "${coverage}".`,
      );
    }

    if (entry.browser === false) {
      errors.push(
        `${entry.id} must have browser coverage proving reference timeline behavior "${coverage}".`,
      );
    }

    if (!entry.expectedObservable.trim()) {
      errors.push(
        `${entry.id} must describe the observable reference timeline behavior for "${coverage}".`,
      );
    }
  }

  return errors;
}

export function getReferenceTimelineErrors({
  acceptance,
  referenceTimelineCoverageFromInventory,
  schema,
  timelineMode,
  transferMode,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  referenceTimelineCoverageFromInventory: ReadonlySet<ToolcraftReferenceTimelineCoverage>;
  schema: ResolvedToolcraftAppSchema;
  timelineMode: "keyframes" | "playback" | null;
  transferMode: Extract<ToolcraftTransferMode, { mode: "reference-runtime-clone" }>;
}): string[] {
  const errors: string[] = [];
  const referenceTimeline = transferMode.referenceTimeline;

  if (!referenceTimeline) {
    errors.push(
      'reference-runtime-clone transferMode must declare referenceTimeline with mode "none", "toolcraft-playback", "toolcraft-keyframes", or "custom-reference-timeline".',
    );
    return errors;
  }

  const declaredReferenceCoverage = new Set(transferMode.behaviorCoverage);
  const declaredReferenceTimelineCoverage = new Set(referenceTimeline.behaviorCoverage);
  const declaredReferenceTransportCoverage = [...declaredReferenceCoverage].filter(
    (coverage) => referenceTransportCoverage.has(coverage),
  );
  const declaredToolcraftTimelineCoverage = [...declaredReferenceTimelineCoverage].filter(
    (coverage) => toolcraftReferenceTimelineCoverage.has(coverage),
  );

  for (const coverage of declaredReferenceTimelineCoverage) {
    if (!referenceTimelineCoverageFromInventory.has(coverage)) {
      errors.push(
        `referenceTimeline behaviorCoverage "${coverage}" must be represented in referenceFeatureInventory by an item whose acceptanceId points to that referenceTimelineCoverage.`,
      );
    }
  }

  if (referenceTimeline.mode === "none" && declaredReferenceTimelineCoverage.size > 0) {
    errors.push(
      'referenceTimeline mode "none" must not declare reference timeline behaviorCoverage.',
    );
  }

  if (
    referenceTimeline.mode === "none" &&
    declaredReferenceTransportCoverage.length > 0
  ) {
    errors.push(
      `reference-runtime-clone transport behaviorCoverage ${declaredReferenceTransportCoverage.map((coverage) => `"${coverage}"`).join(", ")} requires referenceTimeline mode "toolcraft-playback", "toolcraft-keyframes", or "custom-reference-timeline"; mode "none" is only for references with no user-facing transport behavior.`,
    );
  }

  if (
    (referenceTimeline.mode === "toolcraft-playback" ||
      referenceTimeline.mode === "toolcraft-keyframes") &&
    declaredReferenceTimelineCoverage.size === 0
  ) {
    errors.push(
      `referenceTimeline mode "${referenceTimeline.mode}" must list the concrete timeline transport behaviors in behaviorCoverage.`,
    );
  }

  if (referenceTimeline.mode === "toolcraft-playback" && timelineMode !== "playback") {
    errors.push(
      'referenceTimeline mode "toolcraft-playback" requires panels.timeline mode "playback".',
    );
  }

  if (referenceTimeline.mode === "toolcraft-keyframes" && timelineMode !== "keyframes") {
    errors.push(
      'referenceTimeline mode "toolcraft-keyframes" requires panels.timeline mode "keyframes".',
    );
  }

  if (
    referenceTimeline.mode === "toolcraft-playback" ||
    referenceTimeline.mode === "toolcraft-keyframes"
  ) {
    errors.push(
      ...getReferenceTimelineLoopDurationErrors({
        referenceTimelineMode: referenceTimeline.mode,
        schema,
        transferMode,
      }),
    );
  }

  if (
    referenceTimeline.mode === "toolcraft-playback" &&
    declaredReferenceTimelineCoverage.has("keyframes")
  ) {
    errors.push(
      'referenceTimeline behaviorCoverage "keyframes" requires referenceTimeline mode "toolcraft-keyframes".',
    );
  }

  if (
    referenceTimeline.mode === "toolcraft-keyframes" &&
    !declaredReferenceTimelineCoverage.has("keyframes")
  ) {
    errors.push(
      'referenceTimeline mode "toolcraft-keyframes" must include behaviorCoverage "keyframes".',
    );
  }

  if (
    (referenceTimeline.mode === "toolcraft-playback" ||
      referenceTimeline.mode === "toolcraft-keyframes") &&
    declaredToolcraftTimelineCoverage.length === 0
  ) {
    errors.push(
      `referenceTimeline mode "${referenceTimeline.mode}" must include at least one Toolcraft timeline behavior such as "playback", "restart", "scrub", "duration", "loop", "time-progress", "export-at-time", or "keyframes".`,
    );
  }

  if (
    referenceTimeline.mode === "custom-reference-timeline" &&
    declaredReferenceTimelineCoverage.size === 0
  ) {
    errors.push(
      'referenceTimeline mode "custom-reference-timeline" must list every reference timeline behavior in behaviorCoverage.',
    );
  }

  errors.push(
    ...getReferenceTimelineAcceptanceCoverageErrors({
      acceptance,
      declaredReferenceTimelineCoverage,
      referenceTimelineMode: referenceTimeline.mode,
    }),
  );

  return errors;
}
