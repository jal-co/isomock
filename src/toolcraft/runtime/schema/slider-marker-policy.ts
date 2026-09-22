export const TOOLCRAFT_VISUAL_DISCRETE_POSITION_LIMIT = 32;

type ToolcraftSliderMarkerDomain = Readonly<{
  max?: number;
  min?: number;
  step?: number;
}>;

type ToolcraftSliderMarkerControl = ToolcraftSliderMarkerDomain &
  Readonly<{
    type?: string;
    variant?: string;
  }>;

export type ToolcraftVisualDiscreteSliderMarkerIssue =
  | { kind: "domain" }
  | {
      kind: "budget";
      limit: typeof TOOLCRAFT_VISUAL_DISCRETE_POSITION_LIMIT;
      positionCount: number;
    };

export function getToolcraftSliderStepPositionCount({
  max,
  min,
  step,
}: ToolcraftSliderMarkerDomain): number | undefined {
  if (
    typeof step !== "number" ||
    typeof min !== "number" ||
    typeof max !== "number" ||
    !Number.isFinite(step) ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    step <= 0 ||
    max <= min
  ) {
    return undefined;
  }

  const rawIntervalCount = (max - min) / step;
  const roundedIntervalCount = Math.round(rawIntervalCount);
  const nearIntegerTolerance =
    Number.EPSILON * Math.max(1, Math.abs(rawIntervalCount)) * 100;
  const intervalCount =
    Math.abs(rawIntervalCount - roundedIntervalCount) < nearIntegerTolerance
      ? roundedIntervalCount
      : Math.floor(rawIntervalCount) + 1;

  return Math.max(2, intervalCount + 1);
}

export function getToolcraftVisualDiscreteSliderMarkerIssue(
  control: ToolcraftSliderMarkerControl,
): ToolcraftVisualDiscreteSliderMarkerIssue | null {
  if (
    (control.type !== "slider" && control.type !== "rangeSlider") ||
    control.variant !== "discrete"
  ) {
    return null;
  }

  const positionCount = getToolcraftSliderStepPositionCount(control);

  if (positionCount === undefined) {
    return { kind: "domain" };
  }

  if (positionCount > TOOLCRAFT_VISUAL_DISCRETE_POSITION_LIMIT) {
    return {
      kind: "budget",
      limit: TOOLCRAFT_VISUAL_DISCRETE_POSITION_LIMIT,
      positionCount,
    };
  }

  return null;
}
