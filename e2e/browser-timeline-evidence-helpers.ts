import { expect } from "@playwright/test";

import {
  createToolcraftSemanticTransitionOptions,
  expectToolcraftExpectedOutcomeAfterAction,
  type ToolcraftSemanticEvidenceOptions,
} from "./browser-acceptance-transition-helpers";
import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import {
  assertToolcraftBrowserProofSession,
  readToolcraftBrowserObservation,
  runToolcraftBrowserAction,
  type ToolcraftBrowserAction,
  type ToolcraftBrowserObservation,
} from "./browser-proof-session";
import { expectToolcraftPersistentOutcomeChange } from "./stable-outcome-helpers";

export type ToolcraftTimelineDurationObservation = {
  renderedCycleDurationSeconds: number;
  timelineDurationSeconds: number;
};

export type ToolcraftTimelineKeyframeObservation = {
  evaluatedValue: unknown;
  keyframeCount: number;
  outputSignature: string;
};

export type ToolcraftTimelineLoopCycleProof = {
  durationSeconds: number;
  normalizedPhases: readonly number[];
  seamEndSignature: string;
  seamStartSignature: string;
};

export type ToolcraftTimelineLoopProof = {
  initial: ToolcraftTimelineLoopCycleProof;
  resized: ToolcraftTimelineLoopCycleProof;
};

export type ToolcraftTimelinePlaybackObservation = {
  currentTimeSeconds: number;
  outputSignature: string;
  playing: boolean;
};

export type ToolcraftTimelineScrubObservation = {
  currentTimeSeconds: number;
  outputSignature: string;
};

function validateFiniteNonNegative(value: number, message: string): void {
  expect(Number.isFinite(value), message).toBe(true);
  expect(value, message).toBeGreaterThanOrEqual(0);
}

function validateOutputSignature(value: string, message: string): void {
  expect(value.trim(), message).not.toBe("");
}

export async function expectToolcraftTimelineDuration(
  observeDuration: ToolcraftBrowserObservation<ToolcraftTimelineDurationObservation>,
  action: ToolcraftBrowserAction,
  expectedDurationSeconds: number,
  options: ToolcraftSemanticEvidenceOptions,
): Promise<ToolcraftTimelineDurationObservation> {
  expect(Number.isFinite(expectedDurationSeconds)).toBe(true);
  expect(expectedDurationSeconds).toBeGreaterThan(0);
  const expected = {
    renderedCycleDurationSeconds: expectedDurationSeconds,
    timelineDurationSeconds: expectedDurationSeconds,
  };
  const { after, before } = await expectToolcraftExpectedOutcomeAfterAction(
    observeDuration,
    action,
    expected,
    createToolcraftSemanticTransitionOptions(
      `Timeline duration "${options.requirementId}" should update both the runtime range and renderer cycle.`,
      options,
    ),
  );
  expect(before.timelineDurationSeconds).not.toBe(after.timelineDurationSeconds);
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "timeline-duration",
    requirementId: options.requirementId,
  });
  return after;
}

export async function expectToolcraftTimelineScrub(
  observeScrub: ToolcraftBrowserObservation<ToolcraftTimelineScrubObservation>,
  action: ToolcraftBrowserAction,
  expected: ToolcraftTimelineScrubObservation,
  options: ToolcraftSemanticEvidenceOptions,
): Promise<ToolcraftTimelineScrubObservation> {
  validateFiniteNonNegative(
    expected.currentTimeSeconds,
    `Timeline scrub "${options.requirementId}" requires a finite time.`,
  );
  validateOutputSignature(
    expected.outputSignature,
    `Timeline scrub "${options.requirementId}" requires rendered output semantics.`,
  );
  const { after, before } = await expectToolcraftExpectedOutcomeAfterAction(
    observeScrub,
    action,
    expected,
    createToolcraftSemanticTransitionOptions(
      `Timeline scrub "${options.requirementId}" should reach the expected time and rendered frame.`,
      options,
    ),
  );
  expect(before.currentTimeSeconds).not.toBe(after.currentTimeSeconds);
  expect(before.outputSignature).not.toBe(after.outputSignature);
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "timeline-scrub",
    requirementId: options.requirementId,
  });
  return after;
}

export async function expectToolcraftTimelineRenderedFrame<T>(
  observeRenderedFrame: ToolcraftBrowserObservation<T>,
  action: ToolcraftBrowserAction,
  expected: T,
  options: ToolcraftSemanticEvidenceOptions,
): Promise<T> {
  const { after } = await expectToolcraftExpectedOutcomeAfterAction(
    observeRenderedFrame,
    action,
    expected,
    createToolcraftSemanticTransitionOptions(
      `Timeline rendered frame "${options.requirementId}" should reach the expected product output.`,
      options,
    ),
  );
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "timeline-rendered-frame",
    requirementId: options.requirementId,
  });
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "product-observable-change",
    requirementId: options.requirementId,
  });
  return after;
}

export async function expectToolcraftTimelineKeyframes(
  observeKeyframes: ToolcraftBrowserObservation<ToolcraftTimelineKeyframeObservation>,
  action: ToolcraftBrowserAction,
  expected: ToolcraftTimelineKeyframeObservation,
  options: ToolcraftSemanticEvidenceOptions,
): Promise<ToolcraftTimelineKeyframeObservation> {
  expect(Number.isInteger(expected.keyframeCount)).toBe(true);
  expect(expected.keyframeCount).toBeGreaterThan(0);
  validateOutputSignature(
    expected.outputSignature,
    `Timeline keyframes "${options.requirementId}" require rendered output semantics.`,
  );
  const { after, before } = await expectToolcraftExpectedOutcomeAfterAction(
    observeKeyframes,
    action,
    expected,
    createToolcraftSemanticTransitionOptions(
      `Timeline keyframes "${options.requirementId}" should update keyframe data, evaluated value, and output.`,
      options,
    ),
  );
  expect({
    evaluatedValue: before.evaluatedValue,
    keyframeCount: before.keyframeCount,
  }).not.toEqual({
    evaluatedValue: after.evaluatedValue,
    keyframeCount: after.keyframeCount,
  });
  expect(before.outputSignature).not.toBe(after.outputSignature);
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "timeline-keyframes",
    requirementId: options.requirementId,
  });
  return after;
}

function validateLoopCycle(
  cycle: ToolcraftTimelineLoopCycleProof,
  label: string,
): void {
  expect(Number.isFinite(cycle.durationSeconds), `${label} duration must be finite.`).toBe(
    true,
  );
  expect(cycle.durationSeconds, `${label} duration must be positive.`).toBeGreaterThan(0);
  expect(
    cycle.normalizedPhases.length,
    `${label} needs enough ordered samples to prove forward motion and one wrap.`,
  ).toBeGreaterThanOrEqual(5);
  expect(
    cycle.normalizedPhases.every(
      (phase) => Number.isFinite(phase) && phase >= 0 && phase < 1,
    ),
    `${label} phases must be normalized to [0, 1).`,
  ).toBe(true);

  let wrapCount = 0;
  for (let index = 1; index < cycle.normalizedPhases.length; index += 1) {
    const previous = cycle.normalizedPhases[index - 1]!;
    const current = cycle.normalizedPhases[index]!;
    if (current < previous) {
      wrapCount += 1;
      expect(
        previous,
        `${label} may wrap only after reaching the end of the cycle.`,
      ).toBeGreaterThanOrEqual(0.75);
      expect(
        current,
        `${label} must resume near the beginning after a wrap.`,
      ).toBeLessThanOrEqual(0.25);
    } else {
      expect(current, `${label} must advance forward between samples.`).toBeGreaterThan(
        previous,
      );
    }
  }
  expect(wrapCount, `${label} must contain exactly one forward wrap.`).toBe(1);
  validateOutputSignature(
    cycle.seamStartSignature,
    `${label} requires a start-frame signature.`,
  );
  expect(
    cycle.seamEndSignature,
    `${label} end frame must stitch to its start frame.`,
  ).toBe(cycle.seamStartSignature);
}

export async function expectToolcraftTimelineLoop(
  collectProof: ToolcraftBrowserObservation<ToolcraftTimelineLoopProof>,
  options: Pick<ToolcraftSemanticEvidenceOptions, "requirementId">,
): Promise<ToolcraftTimelineLoopProof> {
  const proof = await readToolcraftBrowserObservation(collectProof);
  validateLoopCycle(proof.initial, `Timeline loop "${options.requirementId}"`);
  validateLoopCycle(
    proof.resized,
    `Resized timeline loop "${options.requirementId}"`,
  );
  expect(
    proof.resized.durationSeconds,
    `Timeline loop "${options.requirementId}" must be re-proved after editing duration.`,
  ).not.toBe(proof.initial.durationSeconds);
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "timeline-loop",
    requirementId: options.requirementId,
  });
  return proof;
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function validatePlaybackObservation(
  observation: ToolcraftTimelinePlaybackObservation,
  requirementId: string,
): void {
  validateFiniteNonNegative(
    observation.currentTimeSeconds,
    `Timeline playback "${requirementId}" requires a finite current time.`,
  );
  validateOutputSignature(
    observation.outputSignature,
    `Timeline playback "${requirementId}" requires rendered output semantics.`,
  );
}

export async function expectToolcraftTimelinePauseResume(
  observePlayback: ToolcraftBrowserObservation<ToolcraftTimelinePlaybackObservation>,
  pause: ToolcraftBrowserAction,
  resume: ToolcraftBrowserAction,
  {
    pauseWindowMs = 100,
    ...options
  }: ToolcraftSemanticEvidenceOptions & { pauseWindowMs?: number },
): Promise<ToolcraftTimelinePlaybackObservation> {
  assertToolcraftBrowserProofSession(observePlayback, pause, resume);
  const observe = () => readToolcraftBrowserObservation(observePlayback);
  const initial = await observe();
  validatePlaybackObservation(initial, options.requirementId);
  expect(
    initial.playing,
    `Timeline pause/resume "${options.requirementId}" must start from active playback.`,
  ).toBe(true);

  await runToolcraftBrowserAction(pause);
  await expect
    .poll(() => observe().then((value) => value.playing), {
      message: `Timeline "${options.requirementId}" should pause.`,
      timeout: options.timeoutMs ?? 5_000,
    })
    .toBe(false);
  const paused = await observe();
  await delay(Math.max(16, pauseWindowMs));
  const pausedAgain = await observe();
  expect(pausedAgain.playing).toBe(false);
  expect(pausedAgain.currentTimeSeconds).toBeCloseTo(paused.currentTimeSeconds, 3);
  expect(pausedAgain.outputSignature).toBe(paused.outputSignature);

  await runToolcraftBrowserAction(resume);
  const resumed = await expectToolcraftPersistentOutcomeChange(
    observe,
    pausedAgain,
    createToolcraftSemanticTransitionOptions(
      `Timeline "${options.requirementId}" should resume time and rendered output.`,
      options,
    ),
  );
  validatePlaybackObservation(resumed, options.requirementId);
  expect(resumed.playing).toBe(true);
  expect(resumed.currentTimeSeconds).not.toBeCloseTo(pausedAgain.currentTimeSeconds, 3);
  expect(resumed.outputSignature).not.toBe(pausedAgain.outputSignature);
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "timeline-pause-resume",
    requirementId: options.requirementId,
  });
  return resumed;
}
