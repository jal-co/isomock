import type { Clock } from "vgpu";

export type ToolcraftVgpuClockDiscontinuity = "backward" | null;

export type ToolcraftVgpuClockState = Readonly<{
  discontinuity: ToolcraftVgpuClockDiscontinuity;
  previousSeconds: number;
  timelineSeconds: number;
}>;

export type ToolcraftVgpuTimelineClockInput = Readonly<{
  previousSeconds: number | null;
  seconds: number;
}>;

function assertFiniteNonNegative(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a finite non-negative number.`);
  }
}

export function syncToolcraftVgpuClock(
  clock: Pick<Clock, "advance">,
  input: ToolcraftVgpuTimelineClockInput,
): ToolcraftVgpuClockState {
  assertFiniteNonNegative(input.seconds, "Timeline seconds");
  if (input.previousSeconds !== null) {
    assertFiniteNonNegative(input.previousSeconds, "Previous timeline seconds");
  }

  const discontinuity =
    input.previousSeconds !== null && input.seconds < input.previousSeconds
      ? "backward"
      : null;
  const deltaSeconds =
    input.previousSeconds === null || discontinuity === "backward"
      ? 0
      : input.seconds - input.previousSeconds;

  clock.advance(deltaSeconds);
  return Object.freeze({
    discontinuity,
    previousSeconds: input.seconds,
    timelineSeconds: input.seconds,
  });
}

export function advanceToolcraftVgpuAutonomousClock(
  clock: Pick<Clock, "advance">,
  deltaSeconds: number,
): void {
  assertFiniteNonNegative(deltaSeconds, "Autonomous clock delta");
  clock.advance(deltaSeconds);
}
