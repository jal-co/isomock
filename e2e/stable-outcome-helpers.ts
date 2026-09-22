import { expect } from "@playwright/test";

export type ToolcraftStableOutcomeOptions = {
  baselineStabilityIntervalMs?: number;
  baselineStabilitySamples?: number;
  message: string;
  onFirstChange?: () => Promise<void> | void;
  pollIntervalMs?: number;
  stabilityIntervalMs?: number;
  stabilitySamples?: number;
  timeoutMs?: number;
};

type ToolcraftOutcomeChangeOptions = Pick<
  ToolcraftStableOutcomeOptions,
  "message" | "onFirstChange" | "pollIntervalMs" | "timeoutMs"
>;

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

export function snapshotToolcraftOutcome<T>(value: T, message: string): T {
  try {
    return structuredClone(value);
  } catch {
    throw new Error(
      `${message} Outcome observations must be structured-cloneable snapshots.`,
    );
  }
}

export async function waitForToolcraftOutcomeChange<T>(
  observeOutcome: () => Promise<T>,
  before: T,
  {
    message,
    onFirstChange,
    pollIntervalMs,
    timeoutMs = 5_000,
  }: ToolcraftOutcomeChangeOptions,
): Promise<T> {
  const baseline = snapshotToolcraftOutcome(before, message);
  let current = before;

  await expect
    .poll(
      async () => {
        current = await observeOutcome();
        return current;
      },
      {
        message,
        ...(pollIntervalMs === undefined
          ? {}
          : { intervals: [Math.max(1, pollIntervalMs)] }),
        timeout: timeoutMs,
      },
    )
    .not.toEqual(baseline);

  await onFirstChange?.();

  return current;
}

export async function waitForToolcraftExpectedOutcome<T>(
  observeOutcome: () => Promise<T>,
  expected: T,
  {
    message,
    onFirstChange,
    pollIntervalMs,
    timeoutMs = 5_000,
  }: ToolcraftOutcomeChangeOptions,
): Promise<T> {
  const expectedSnapshot = snapshotToolcraftOutcome(expected, message);
  let current = await observeOutcome();

  await expect
    .poll(
      async () => {
        current = await observeOutcome();
        return current;
      },
      {
        message,
        ...(pollIntervalMs === undefined
          ? {}
          : { intervals: [Math.max(1, pollIntervalMs)] }),
        timeout: timeoutMs,
      },
    )
    .toEqual(expectedSnapshot);

  await onFirstChange?.();
  return current;
}

export async function expectToolcraftStableOutcomeBaseline<T>(
  observeOutcome: () => Promise<T>,
  baseline: T,
  {
    baselineStabilityIntervalMs,
    baselineStabilitySamples,
    message,
    stabilityIntervalMs = 50,
    stabilitySamples = 3,
  }: ToolcraftStableOutcomeOptions,
): Promise<T> {
  const baselineSnapshot = snapshotToolcraftOutcome(baseline, message);
  const intervalMs = Math.max(
    0,
    baselineStabilityIntervalMs ?? stabilityIntervalMs,
  );
  const sampleCount = Math.max(
    2,
    baselineStabilitySamples ?? stabilitySamples,
  );
  let current = baselineSnapshot;

  for (let sample = 1; sample < sampleCount; sample += 1) {
    await delay(intervalMs);
    current = await observeOutcome();
    expect(
      current as unknown,
      `${message} The baseline must remain stable before the action; autonomous output requires an expected semantic observation or a deterministic fixed phase.`,
    ).toEqual(baselineSnapshot);
  }

  return current;
}

export async function expectToolcraftPersistentOutcomeChange<T>(
  observeOutcome: () => Promise<T>,
  before: T,
  {
    message,
    onFirstChange,
    pollIntervalMs,
    stabilityIntervalMs = 50,
    stabilitySamples = 3,
    timeoutMs = 5_000,
  }: ToolcraftStableOutcomeOptions,
): Promise<T> {
  const baseline = snapshotToolcraftOutcome(before, message);
  let current = await waitForToolcraftOutcomeChange(observeOutcome, baseline, {
    message,
    onFirstChange,
    pollIntervalMs,
    timeoutMs,
  });

  for (let sample = 1; sample < Math.max(2, stabilitySamples); sample += 1) {
    await delay(Math.max(0, stabilityIntervalMs));
    current = await observeOutcome();
    expect(
      current as unknown,
      `${message} The changed outcome must remain different from its baseline throughout the stability window.`,
    ).not.toEqual(baseline);
  }

  return current;
}

export async function expectToolcraftPersistentExpectedOutcome<T>(
  observeOutcome: () => Promise<T>,
  expected: T,
  {
    message,
    pollIntervalMs,
    stabilityIntervalMs = 50,
    stabilitySamples = 3,
    timeoutMs = 5_000,
  }: ToolcraftStableOutcomeOptions,
): Promise<T> {
  const expectedSnapshot = snapshotToolcraftOutcome(expected, message);
  let current = await waitForToolcraftExpectedOutcome(
    observeOutcome,
    expectedSnapshot,
    { message, pollIntervalMs, timeoutMs },
  );

  for (let sample = 1; sample < Math.max(2, stabilitySamples); sample += 1) {
    await delay(Math.max(0, stabilityIntervalMs));
    current = await observeOutcome();
    expect(
      current as unknown,
      `${message} The expected outcome must remain stable throughout the verification window.`,
    ).toEqual(expectedSnapshot);
  }

  return current;
}

export async function expectToolcraftPersistentOutcomeAfterAction<T>(
  observeOutcome: () => Promise<T>,
  action: () => Promise<void>,
  options: ToolcraftStableOutcomeOptions,
): Promise<T> {
  const before = snapshotToolcraftOutcome(
    await observeOutcome(),
    options.message,
  );
  await expectToolcraftStableOutcomeBaseline(observeOutcome, before, options);
  await action();
  return expectToolcraftPersistentOutcomeChange(observeOutcome, before, options);
}
