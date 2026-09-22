export const TOOLCRAFT_VIDEO_EXPORT_FRAMES_PER_SECOND = 30;

export type ToolcraftVideoFrameScheduleEntry = Readonly<{
  durationSeconds: number;
  index: number;
  timeSeconds: number;
}>;

const frameCountTolerance = 1e-9;

export function createToolcraftVideoFrameSchedule(
  durationSeconds: number,
): readonly ToolcraftVideoFrameScheduleEntry[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new RangeError("Video export requires a positive finite duration.");
  }

  const rawFrameCount =
    durationSeconds * TOOLCRAFT_VIDEO_EXPORT_FRAMES_PER_SECOND;
  const nearestFrameCount = Math.round(rawFrameCount);
  const frameCount =
    Math.abs(rawFrameCount - nearestFrameCount) <= frameCountTolerance
      ? nearestFrameCount
      : Math.ceil(rawFrameCount);

  return Object.freeze(
    Array.from({ length: frameCount }, (_, index) => {
      const timeSeconds =
        index / TOOLCRAFT_VIDEO_EXPORT_FRAMES_PER_SECOND;
      const endSeconds = Math.min(
        durationSeconds,
        (index + 1) / TOOLCRAFT_VIDEO_EXPORT_FRAMES_PER_SECOND,
      );

      return Object.freeze({
        durationSeconds: endSeconds - timeSeconds,
        index,
        timeSeconds,
      });
    }),
  );
}
