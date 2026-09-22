import type { ToolcraftTimelineState } from "./types";

export type ToolcraftTimelineLoopOptions = Pick<
  ToolcraftTimelineState,
  "currentTimeSeconds" | "durationSeconds"
>;

function getPositiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

export function getToolcraftTimelineLoopTime({
  currentTimeSeconds,
  durationSeconds,
}: ToolcraftTimelineLoopOptions): number {
  if (
    !Number.isFinite(currentTimeSeconds) ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return 0;
  }

  return getPositiveModulo(currentTimeSeconds, durationSeconds);
}

export function getToolcraftTimelineLoopProgress(
  options: ToolcraftTimelineLoopOptions,
): number {
  if (!Number.isFinite(options.durationSeconds) || options.durationSeconds <= 0) {
    return 0;
  }

  return getToolcraftTimelineLoopTime(options) / options.durationSeconds;
}

/** The authored playback policy applied to an elapsed preview clock. */
export function getToolcraftTimelinePlaybackTime(options: ToolcraftTimelineLoopOptions & Pick<ToolcraftTimelineState, "isLooping">): number {
  if (options.isLooping) return getToolcraftTimelineLoopTime(options);
  if (!Number.isFinite(options.currentTimeSeconds) || !Number.isFinite(options.durationSeconds) || options.durationSeconds <= 0) return 0;
  return Math.min(options.durationSeconds, Math.max(0, options.currentTimeSeconds));
}
