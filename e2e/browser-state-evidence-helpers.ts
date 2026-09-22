import { expect } from "@playwright/test";

import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import {
  assertToolcraftBrowserProofSession,
  getToolcraftBrowserActionTarget,
  readToolcraftBrowserObservation,
  runToolcraftBrowserAction,
  type ToolcraftBrowserAction,
  type ToolcraftBrowserObservation,
} from "./browser-proof-session";
import {
  createToolcraftSemanticTransitionOptions,
  expectToolcraftExpectedOutcomeAfterAction,
  type ToolcraftSemanticEvidenceOptions,
} from "./browser-acceptance-transition-helpers";
import {
  expectToolcraftPersistentExpectedOutcome,
  snapshotToolcraftOutcome,
} from "./stable-outcome-helpers";

export type ToolcraftMediaLifecycleObservation = {
  itemIds: readonly string[];
  outputSignature: string;
};

export type ToolcraftPersistenceEvidenceOptions =
  ToolcraftSemanticEvidenceOptions & {
    assertRestoredOutput?: () => Promise<void>;
  };

export type ToolcraftViewportObservation = {
  offsetX: number;
  offsetY: number;
  outputHeight: number;
  outputWidth: number;
  zoom: number;
};

function validateMediaLifecycleObservation(
  observation: ToolcraftMediaLifecycleObservation,
  requirementId: string,
): void {
  expect(
    new Set(observation.itemIds).size,
    `Media lifecycle "${requirementId}" must report unique item ids.`,
  ).toBe(observation.itemIds.length);
  expect(
    observation.itemIds.every((itemId) => itemId.trim().length > 0),
    `Media lifecycle "${requirementId}" must report non-empty item ids.`,
  ).toBe(true);
  expect(
    observation.outputSignature.trim(),
    `Media lifecycle "${requirementId}" must report a product-output signature.`,
  ).not.toBe("");
}

export async function expectToolcraftMediaLifecycle(
  observeLifecycle: ToolcraftBrowserObservation<ToolcraftMediaLifecycleObservation>,
  action: ToolcraftBrowserAction,
  expected: ToolcraftMediaLifecycleObservation,
  options: ToolcraftSemanticEvidenceOptions,
): Promise<ToolcraftMediaLifecycleObservation> {
  validateMediaLifecycleObservation(expected, options.requirementId);
  const { after, before } = await expectToolcraftExpectedOutcomeAfterAction(
    observeLifecycle,
    action,
    expected,
    createToolcraftSemanticTransitionOptions(
      `Media lifecycle "${options.requirementId}" should reach the expected item collection and output.`,
      options,
    ),
  );
  validateMediaLifecycleObservation(before, options.requirementId);
  expect(before.itemIds).not.toEqual(after.itemIds);
  expect(before.outputSignature).not.toBe(after.outputSignature);
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "media-lifecycle",
    requirementId: options.requirementId,
    target: getToolcraftBrowserActionTarget(action),
  });
  return after;
}

export async function expectToolcraftPersistenceState<T>(
  observePersistedOutcome: ToolcraftBrowserObservation<T>,
  mutateThroughUi: ToolcraftBrowserAction,
  reloadPage: ToolcraftBrowserAction<"reload">,
  expectedAfterReload: T,
  options: ToolcraftPersistenceEvidenceOptions,
): Promise<T> {
  assertToolcraftBrowserProofSession(
    observePersistedOutcome,
    mutateThroughUi,
    reloadPage,
  );
  const observe = () => readToolcraftBrowserObservation(observePersistedOutcome);
  const message = `Persistence "${options.requirementId}" should survive a real page reload.`;
  const expected = snapshotToolcraftOutcome(expectedAfterReload, message);
  const before = snapshotToolcraftOutcome(
    await observe(),
    message,
  );
  expect(before, `${message} The mutation must change the initial state.`).not.toEqual(
    expected,
  );

  await runToolcraftBrowserAction(mutateThroughUi);
  await expectToolcraftPersistentExpectedOutcome(
    observe,
    expected,
    createToolcraftSemanticTransitionOptions(message, options),
  );
  await runToolcraftBrowserAction(reloadPage, "reload");
  const restored = await expectToolcraftPersistentExpectedOutcome(
    observe,
    expected,
    createToolcraftSemanticTransitionOptions(message, options),
  );
  await options.assertRestoredOutput?.();
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "persistence-state",
    requirementId: options.requirementId,
    target: getToolcraftBrowserActionTarget(mutateThroughUi),
  });
  return restored;
}

function validateViewportObservation(
  observation: ToolcraftViewportObservation,
  requirementId: string,
): void {
  for (const [name, value] of Object.entries(observation)) {
    expect(
      Number.isFinite(value),
      `Viewport "${requirementId}" must report a finite ${name}.`,
    ).toBe(true);
  }
  expect(observation.zoom).toBeGreaterThan(0);
  expect(observation.outputWidth).toBeGreaterThan(0);
  expect(observation.outputHeight).toBeGreaterThan(0);
}

export async function expectToolcraftViewportSideEffect(
  observeViewport: ToolcraftBrowserObservation<ToolcraftViewportObservation>,
  action: ToolcraftBrowserAction,
  expected: ToolcraftViewportObservation,
  options: ToolcraftSemanticEvidenceOptions,
): Promise<ToolcraftViewportObservation> {
  validateViewportObservation(expected, options.requirementId);
  const { after, before } = await expectToolcraftExpectedOutcomeAfterAction(
    observeViewport,
    action,
    expected,
    createToolcraftSemanticTransitionOptions(
      `Viewport "${options.requirementId}" should reach the expected offset and zoom.`,
      options,
    ),
  );
  validateViewportObservation(before, options.requirementId);
  expect({
    offsetX: before.offsetX,
    offsetY: before.offsetY,
    zoom: before.zoom,
  }).not.toEqual({
    offsetX: after.offsetX,
    offsetY: after.offsetY,
    zoom: after.zoom,
  });
  expect({
    outputHeight: after.outputHeight,
    outputWidth: after.outputWidth,
  }).toEqual({
    outputHeight: before.outputHeight,
    outputWidth: before.outputWidth,
  });
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "viewport-side-effect",
    requirementId: options.requirementId,
    target: getToolcraftBrowserActionTarget(action),
  });
  return after;
}

export async function expectToolcraftCompoundControlPartOutcome<T>(
  observeProductOutcome: ToolcraftBrowserObservation<T>,
  action: ToolcraftBrowserAction,
  expected: T,
  {
    part,
    ...options
  }: ToolcraftSemanticEvidenceOptions & { part: string },
): Promise<T> {
  expect(part.trim(), "Compound-control evidence requires a semantic part id.").not.toBe("");
  const requirementId = `${options.requirementId}#${part}`;
  const { after } = await expectToolcraftExpectedOutcomeAfterAction(
    observeProductOutcome,
    action,
    expected,
    createToolcraftSemanticTransitionOptions(
      `Compound control part "${requirementId}" should change product output to the expected state.`,
      options,
    ),
  );
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "compound-control-part",
    requirementId,
    target: getToolcraftBrowserActionTarget(action),
  });
  return after;
}
