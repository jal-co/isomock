import { getAnimationIntentControlText } from "./control-component-rules";
import {
  getTimelineLoopDurationIntent,
  isValidTimelineLoopDurationSource,
} from "./timeline-loop";
import type {
  ToolcraftAcceptanceValidationContext,
} from "./validation-pipeline";
import type { ToolcraftAutonomousAnimationCoverage } from "./types";

const animationIntentControlPattern =
  /\b(animation|animate|motion|playback)\b/i;

const requiredAutonomousAnimationCoverage = [
  "no-user-facing-transport",
  "no-play-pause",
  "no-scrub",
  "no-duration-control",
  "no-loop-control",
  "no-export-at-time",
] satisfies readonly ToolcraftAutonomousAnimationCoverage[];

export function getToolcraftAnimationModeChoiceErrors({
  controls,
  timelineMode,
  transferMode,
}: ToolcraftAcceptanceValidationContext): string[] {
  const animationIntent = transferMode.animationIntent;
  const animationControls = controls.filter(
    (visibleControl) =>
      visibleControl.control.type !== "panelActions" &&
      animationIntentControlPattern.test(getAnimationIntentControlText(visibleControl)),
  );

  if (animationControls.length === 0 || timelineMode || animationIntent?.mode === "autonomous") {
    return [];
  }

  return [
    [
      `Animation controls ${animationControls.map(({ control, controlId, sectionTitle }) => `"${sectionTitle ? `${sectionTitle} / ` : ""}${controlId}" (${control.target})`).join(", ")} exist while panels.timeline is omitted.`,
      'Use panels.timeline mode "playback" for product animation transport, mode "keyframes" for editable keyframes, or declare appTransferMode.animationIntent mode "autonomous" with coverage proving there is no user-facing transport.',
    ].join(" "),
  ];
}

export function getToolcraftAnimationConfigurationErrors({
  hasVideoExportAction,
  schema,
  timelineMode,
  transferMode,
}: ToolcraftAcceptanceValidationContext): string[] {
  const errors: string[] = [];
  const animationIntent = transferMode.animationIntent;

  if (hasVideoExportAction && !timelineMode) {
    errors.push(
      'Apps with Export Video must enable the top Toolcraft timeline. Use panels.timeline mode "playback" for product animation transport, or mode "keyframes" when exported animation is driven by keyframes; autonomous no-timeline animation is only allowed when there is no video export.',
    );
  }

  if (animationIntent?.mode === "autonomous") {
    const declaredAutonomousCoverage = new Set(animationIntent.behaviorCoverage);
    const missingAutonomousCoverage = requiredAutonomousAnimationCoverage.filter(
      (coverage) => !declaredAutonomousCoverage.has(coverage),
    );

    if (timelineMode) {
      errors.push(
        `appTransferMode.animationIntent mode "autonomous" conflicts with panels.timeline mode "${timelineMode}". Use timeline-playback, timeline-keyframes, or remove the timeline.`,
      );
    }

    if (hasVideoExportAction) {
      errors.push(
        'appTransferMode.animationIntent mode "autonomous" conflicts with Export Video. Video export creates product-time behavior, so the renderer and export must use the top Toolcraft timeline duration, loop, and deterministic timestamps.',
      );
    }

    if (!animationIntent.reason.trim()) {
      errors.push(
        'appTransferMode.animationIntent mode "autonomous" must include a reason explaining why the animation is decorative/self-running and does not need top timeline transport.',
      );
    }

    if (missingAutonomousCoverage.length > 0) {
      errors.push(
        `appTransferMode.animationIntent mode "autonomous" must include behaviorCoverage ${missingAutonomousCoverage.map((coverage) => `"${coverage}"`).join(", ")}.`,
      );
    }
  }

  if (animationIntent?.mode === "timeline-playback" && timelineMode !== "playback") {
    errors.push(
      'appTransferMode.animationIntent mode "timeline-playback" requires panels.timeline mode "playback".',
    );
  }

  if (animationIntent?.mode === "timeline-keyframes" && timelineMode !== "keyframes") {
    errors.push(
      'appTransferMode.animationIntent mode "timeline-keyframes" requires panels.timeline mode "keyframes".',
    );
  }

  if (
    transferMode.mode === "new-toolcraft-app" &&
    timelineMode === "playback" &&
    animationIntent?.mode !== "timeline-playback"
  ) {
    errors.push(
      'panels.timeline mode "playback" requires appTransferMode.animationIntent mode "timeline-playback" with loopDuration provenance.',
    );
  }

  if (
    transferMode.mode === "new-toolcraft-app" &&
    timelineMode === "keyframes" &&
    animationIntent?.mode !== "timeline-keyframes"
  ) {
    errors.push(
      'panels.timeline mode "keyframes" requires appTransferMode.animationIntent mode "timeline-keyframes" with loopDuration provenance.',
    );
  }

  if (
    timelineMode &&
    (animationIntent?.mode === "timeline-playback" ||
      animationIntent?.mode === "timeline-keyframes")
  ) {
    const timelineDefaultDurationSeconds = schema.panels.timeline?.defaultDurationSeconds;
    const loopDuration = getTimelineLoopDurationIntent(animationIntent);

    if (!loopDuration) {
      errors.push(
        `appTransferMode.animationIntent mode "${animationIntent.mode}" must declare loopDuration with source, seconds, and evidence. Do not let runtime/template fallback duration such as 8s stand in for product loop intent.`,
      );
    } else {
      if (
        !Number.isFinite(loopDuration.seconds) ||
        loopDuration.seconds <= 0
      ) {
        errors.push(
          `appTransferMode.animationIntent.loopDuration.seconds must be a positive finite duration; received ${String(loopDuration.seconds)}.`,
        );
      }

      if (!isValidTimelineLoopDurationSource(loopDuration.source)) {
        errors.push(
          `appTransferMode.animationIntent.loopDuration.source must be "reference", "user-request", or "product-derived"; received "${String(loopDuration.source)}". Runtime/template fallback is not a valid loop-duration source.`,
        );
      }

      if (!loopDuration.evidence.trim()) {
        errors.push(
          "appTransferMode.animationIntent.loopDuration.evidence must explain where the initial loop duration came from, such as reference timing, an explicit user request, or a product-derived timing rule.",
        );
      }

      if (typeof timelineDefaultDurationSeconds !== "number") {
        errors.push(
          "Timeline playback/keyframe apps must set panels.timeline.defaultDurationSeconds to the declared loopDuration.seconds so the initial UI duration is not the runtime fallback.",
        );
      } else if (
        Number.isFinite(loopDuration.seconds) &&
        Math.abs(timelineDefaultDurationSeconds - loopDuration.seconds) > 0.001
      ) {
        errors.push(
          `panels.timeline.defaultDurationSeconds (${timelineDefaultDurationSeconds}) must match appTransferMode.animationIntent.loopDuration.seconds (${loopDuration.seconds}).`,
        );
      }
    }
  }

  return errors;
}

export function getToolcraftAnimationIntentErrors(
  context: ToolcraftAcceptanceValidationContext,
): string[] {
  return [
    ...getToolcraftAnimationModeChoiceErrors(context),
    ...getToolcraftAnimationConfigurationErrors(context),
  ];
}
