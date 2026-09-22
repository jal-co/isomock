import { expect } from "@playwright/test";

import {
  createToolcraftSemanticTransitionOptions,
  expectToolcraftExpectedOutcomeAfterAction,
  type ToolcraftSemanticEvidenceOptions,
} from "./browser-acceptance-transition-helpers";
import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import {
  getToolcraftBrowserActionTarget,
  type ToolcraftBrowserAction,
  type ToolcraftBrowserObservation,
} from "./browser-proof-session";
import {
  expectToolcraftSelectionScopedControl,
  type ToolcraftSelectionScopedControlOptions,
} from "./browser-selection-scope-evidence";

export type ToolcraftLayerCollectionObservation = {
  layerIds: readonly string[];
  outputSignature: string;
};

export type ToolcraftLayerGroupingObservation =
  ToolcraftLayerCollectionObservation & {
    groupSignature: string;
  };

export type ToolcraftLayerSelectionObservation = {
  selectedLayerId: string;
};

export type ToolcraftLayerVisibilityObservation = {
  layerId: string;
  outputSignature: string;
  visible: boolean;
};

function validateIdentifier(value: string, message: string): void {
  expect(value.trim(), message).not.toBe("");
}

function validateLayerCollection(
  observation: ToolcraftLayerCollectionObservation,
  requirementId: string,
): void {
  expect(
    new Set(observation.layerIds).size,
    `Layer evidence "${requirementId}" must report unique layer ids.`,
  ).toBe(observation.layerIds.length);
  expect(
    observation.layerIds.every((layerId) => layerId.trim().length > 0),
    `Layer evidence "${requirementId}" must report non-empty layer ids.`,
  ).toBe(true);
  validateIdentifier(
    observation.outputSignature,
    `Layer evidence "${requirementId}" must report product-output semantics.`,
  );
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

async function attachLayerEvidence(
  baseEvidenceType: "media-lifecycle" | "product-observable-change",
  evidenceType:
    | "layer-grouping"
    | "layer-media-lifecycle"
    | "layer-reorder"
    | "layer-selected-layer-controls"
    | "layer-selection"
    | "layer-visibility",
  requirementId: string,
  target: string,
): Promise<void> {
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: baseEvidenceType,
    requirementId,
    target,
  });
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType,
    requirementId,
    target,
  });
}

function requireLayerActionTarget(
  action: ToolcraftBrowserAction,
  requirementId: string,
): string {
  const target = getToolcraftBrowserActionTarget(action)?.trim();
  if (!target) {
    throw new Error(
      `Layer evidence "${requirementId}" requires a target-scoped browser action from proofSession.targetAction(semanticTarget, action) or proofSession.controlAction(schemaTarget, action).`,
    );
  }
  return target;
}

export async function expectToolcraftLayerSelection(
  observeSelection: ToolcraftBrowserObservation<ToolcraftLayerSelectionObservation>,
  action: ToolcraftBrowserAction,
  expected: ToolcraftLayerSelectionObservation,
  options: ToolcraftSemanticEvidenceOptions,
): Promise<ToolcraftLayerSelectionObservation> {
  const target = requireLayerActionTarget(action, options.requirementId);
  validateIdentifier(
    expected.selectedLayerId,
    `Layer selection "${options.requirementId}" requires an expected layer id.`,
  );
  const { after } = await expectToolcraftExpectedOutcomeAfterAction(
    observeSelection,
    action,
    expected,
    createToolcraftSemanticTransitionOptions(
      `Layer selection "${options.requirementId}" should select the expected layer.`,
      options,
    ),
  );
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "layer-selection",
    requirementId: options.requirementId,
    target,
  });
  return after;
}

export async function expectToolcraftLayerVisibility(
  observeVisibility: ToolcraftBrowserObservation<ToolcraftLayerVisibilityObservation>,
  action: ToolcraftBrowserAction,
  expected: ToolcraftLayerVisibilityObservation,
  options: ToolcraftSemanticEvidenceOptions,
): Promise<ToolcraftLayerVisibilityObservation> {
  const target = requireLayerActionTarget(action, options.requirementId);
  validateIdentifier(expected.layerId, "Layer visibility requires a layer id.");
  validateIdentifier(
    expected.outputSignature,
    "Layer visibility requires product-output semantics.",
  );
  const { after, before } = await expectToolcraftExpectedOutcomeAfterAction(
    observeVisibility,
    action,
    expected,
    createToolcraftSemanticTransitionOptions(
      `Layer visibility "${options.requirementId}" should toggle the expected layer and output.`,
      options,
    ),
  );
  expect(before.layerId).toBe(after.layerId);
  expect(before.visible).not.toBe(after.visible);
  expect(before.outputSignature).not.toBe(after.outputSignature);
  await attachLayerEvidence(
    "product-observable-change",
    "layer-visibility",
    options.requirementId,
    target,
  );
  return after;
}

export async function expectToolcraftLayerReorder(
  observeOrder: ToolcraftBrowserObservation<ToolcraftLayerCollectionObservation>,
  action: ToolcraftBrowserAction,
  expected: ToolcraftLayerCollectionObservation,
  options: ToolcraftSemanticEvidenceOptions,
): Promise<ToolcraftLayerCollectionObservation> {
  const target = requireLayerActionTarget(action, options.requirementId);
  validateLayerCollection(expected, options.requirementId);
  const { after, before } = await expectToolcraftExpectedOutcomeAfterAction(
    observeOrder,
    action,
    expected,
    createToolcraftSemanticTransitionOptions(
      `Layer reorder "${options.requirementId}" should reach the expected order and output.`,
      options,
    ),
  );
  validateLayerCollection(before, options.requirementId);
  expect(sorted(before.layerIds)).toEqual(sorted(after.layerIds));
  expect(before.layerIds).not.toEqual(after.layerIds);
  expect(before.outputSignature).not.toBe(after.outputSignature);
  await attachLayerEvidence(
    "product-observable-change",
    "layer-reorder",
    options.requirementId,
    target,
  );
  return after;
}

export async function expectToolcraftLayerGrouping(
  observeGrouping: ToolcraftBrowserObservation<ToolcraftLayerGroupingObservation>,
  action: ToolcraftBrowserAction,
  expected: ToolcraftLayerGroupingObservation,
  options: ToolcraftSemanticEvidenceOptions,
): Promise<ToolcraftLayerGroupingObservation> {
  const target = requireLayerActionTarget(action, options.requirementId);
  validateLayerCollection(expected, options.requirementId);
  validateIdentifier(expected.groupSignature, "Layer grouping requires group semantics.");
  const { after, before } = await expectToolcraftExpectedOutcomeAfterAction(
    observeGrouping,
    action,
    expected,
    createToolcraftSemanticTransitionOptions(
      `Layer grouping "${options.requirementId}" should reach the expected hierarchy and output.`,
      options,
    ),
  );
  validateLayerCollection(before, options.requirementId);
  expect(sorted(before.layerIds)).toEqual(sorted(after.layerIds));
  expect(before.groupSignature).not.toBe(after.groupSignature);
  expect(before.outputSignature).not.toBe(after.outputSignature);
  await attachLayerEvidence(
    "product-observable-change",
    "layer-grouping",
    options.requirementId,
    target,
  );
  return after;
}

export type ToolcraftSelectedLayerControlOptions =
  ToolcraftSelectionScopedControlOptions;

export async function expectToolcraftSelectedLayerControl(
  options: ToolcraftSelectedLayerControlOptions,
): Promise<void> {
  await expectToolcraftSelectionScopedControl(options);
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "layer-selected-layer-controls",
    requirementId: options.requirementId,
    target: options.propertyTarget,
  });
}

export async function expectToolcraftLayerMediaLifecycle(
  observeLayers: ToolcraftBrowserObservation<ToolcraftLayerCollectionObservation>,
  action: ToolcraftBrowserAction,
  expected: ToolcraftLayerCollectionObservation,
  options: ToolcraftSemanticEvidenceOptions,
): Promise<ToolcraftLayerCollectionObservation> {
  const target = requireLayerActionTarget(action, options.requirementId);
  validateLayerCollection(expected, options.requirementId);
  const { after, before } = await expectToolcraftExpectedOutcomeAfterAction(
    observeLayers,
    action,
    expected,
    createToolcraftSemanticTransitionOptions(
      `Layer media lifecycle "${options.requirementId}" should reach the expected layer collection and output.`,
      options,
    ),
  );
  validateLayerCollection(before, options.requirementId);
  expect(before.layerIds).not.toEqual(after.layerIds);
  expect(before.outputSignature).not.toBe(after.outputSignature);
  await attachLayerEvidence(
    "media-lifecycle",
    "layer-media-lifecycle",
    options.requirementId,
    target,
  );
  return after;
}
