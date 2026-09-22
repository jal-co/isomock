import { getPhysicalFeedbackReplaySteps } from "./feedback-values";

export function selectPhysicalFeedbackFixtureApplications<T>(
  available: Readonly<Record<string, T>>,
  dimensionIds: readonly string[],
): Readonly<Record<string, T>> {
  const selected: Record<string, T> = {};
  for (const dimensionId of dimensionIds) {
    const application = available[dimensionId];
    if (application === undefined) {
      throw new Error(
        `Missing physical feedback fixture application for ${dimensionId}.`,
      );
    }
    selected[dimensionId] = application;
  }
  return Object.freeze(selected);
}

export function getPhysicalFeedbackReplayFixtureSeconds(steps: number): number {
  if (!Number.isInteger(steps) || steps < 1 || steps > 25) {
    throw new Error(`Replay steps must be one of the exact integers 1 through 25.`);
  }
  return steps === 1 ? 0 : (steps - 0.5) / 12;
}

export { getPhysicalFeedbackReplaySteps };
