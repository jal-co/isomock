import { expect } from "@playwright/test";

import {
  expectToolcraftPersistentExpectedOutcome,
  expectToolcraftStableOutcomeBaseline,
  snapshotToolcraftOutcome,
  type ToolcraftStableOutcomeOptions,
} from "./stable-outcome-helpers";
import {
  assertToolcraftBrowserProofSession,
  readToolcraftBrowserObservation,
  runToolcraftBrowserAction,
  type ToolcraftBrowserAction,
  type ToolcraftBrowserObservation,
} from "./browser-proof-session";

export type ToolcraftExpectedTransitionResult<T> = {
  after: T;
  before: T;
};

export type ToolcraftSemanticEvidenceOptions = {
  requirementId: string;
  stabilityIntervalMs?: number;
  stabilitySamples?: number;
  timeoutMs?: number;
};

export function createToolcraftSemanticTransitionOptions(
  message: string,
  options: ToolcraftSemanticEvidenceOptions,
): ToolcraftStableOutcomeOptions {
  return {
    message,
    ...(options.stabilityIntervalMs === undefined
      ? {}
      : { stabilityIntervalMs: options.stabilityIntervalMs }),
    ...(options.stabilitySamples === undefined
      ? {}
      : { stabilitySamples: options.stabilitySamples }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  };
}

export async function expectToolcraftExpectedOutcomeAfterAction<T>(
  observeOutcome: ToolcraftBrowserObservation<T>,
  action: ToolcraftBrowserAction,
  expected: T,
  options: ToolcraftStableOutcomeOptions,
): Promise<ToolcraftExpectedTransitionResult<T>> {
  assertToolcraftBrowserProofSession(observeOutcome, action);
  const observe = () => readToolcraftBrowserObservation(observeOutcome);
  const before = snapshotToolcraftOutcome(
    await observe(),
    options.message,
  );
  const expectedSnapshot = snapshotToolcraftOutcome(expected, options.message);

  expect(
    before as unknown,
    `${options.message} The expected state must differ from the pre-action state so the tested action proves a transition.`,
  ).not.toEqual(expectedSnapshot);

  await expectToolcraftStableOutcomeBaseline(observe, before, options);

  await runToolcraftBrowserAction(action);
  const after = await expectToolcraftPersistentExpectedOutcome(
    observe,
    expectedSnapshot,
    options,
  );

  return { after, before };
}
