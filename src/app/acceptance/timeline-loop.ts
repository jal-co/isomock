import type {
  ToolcraftAnimationIntent,
  ToolcraftTimelineLoopDurationIntent,
} from "./types";

export function getTimelineLoopDurationIntent(
  animationIntent: ToolcraftAnimationIntent | undefined,
): ToolcraftTimelineLoopDurationIntent | undefined {
  if (
    animationIntent?.mode !== "timeline-playback" &&
    animationIntent?.mode !== "timeline-keyframes"
  ) {
    return undefined;
  }

  return animationIntent.loopDuration;
}

export function isValidTimelineLoopDurationSource(source: string): boolean {
  return source === "reference" || source === "user-request" || source === "product-derived";
}
