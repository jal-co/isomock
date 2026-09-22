import { expect } from "@playwright/test";

import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import {
  createToolcraftSemanticTransitionOptions,
  expectToolcraftExpectedOutcomeAfterAction,
  type ToolcraftSemanticEvidenceOptions,
} from "./browser-acceptance-transition-helpers";
import {
  assertToolcraftBrowserProofSession,
  readToolcraftBrowserObservation,
  runToolcraftBrowserAction,
  type ToolcraftBrowserAction,
  type ToolcraftBrowserObservation,
} from "./browser-proof-session";
import {
  expectToolcraftPersistentExpectedOutcome,
  expectToolcraftStableOutcomeBaseline,
  snapshotToolcraftOutcome,
} from "./stable-outcome-helpers";
import {
  validateToolcraftModelAppearanceObservation,
  validateToolcraftModelOutputObservation,
  type ToolcraftModelOutputObservation,
  type ToolcraftModelPackageObservation,
  type ToolcraftModelPresentationObservation,
  type ToolcraftModelResourceDisposalObservation,
} from "./browser-model-appearance-evidence";

export type { ToolcraftModelOutputObservation } from "./browser-model-appearance-evidence";

export type ToolcraftModelIdentityObservation = {
  assetId: string;
  documentId: string;
};

export type ToolcraftModelRepairProgressObservation = {
  completed: number;
  phase: string;
  total: number;
};

export type ToolcraftModelImportBrowserObservation = {
  active: ToolcraftModelIdentityObservation | null;
  advertisedFormats: readonly string[];
  attemptFormat: string | null;
  draft: ToolcraftModelIdentityObservation | null;
  exportOutput: ToolcraftModelOutputObservation | null;
  lifecycle:
    | "empty"
    | "staged"
    | "committed"
    | "repairable"
    | "repairing"
    | "verified"
    | "rejected"
    | "restored"
    | "unavailable";
  package: ToolcraftModelPackageObservation | null;
  persistenceState: "none" | "available" | "restored" | "unavailable";
  presentation: ToolcraftModelPresentationObservation | null;
  previewOutput: ToolcraftModelOutputObservation | null;
  rejection: { code: string; format: string } | null;
  repair: {
    available: boolean;
    diagnosisSignature: string | null;
    geometrySignature: string | null;
    progress: ToolcraftModelRepairProgressObservation | null;
    verification: "pending" | "passed" | null;
  };
  resources: ToolcraftModelResourceDisposalObservation;
  unavailableReason: string | null;
};

export type ToolcraftModelImportEvidenceOptions = ToolcraftSemanticEvidenceOptions & {
  target: string;
};

const evidenceTypeByCoverage = {
  "advertised-format-import": "model-advertised-format-import",
  "clean-commit": "model-clean-commit",
  "export-output": "model-export-output",
  "fatal-rejection": "model-fatal-rejection",
  "history-reset": "model-history-reset",
  "persistence-restore": "model-persistence-restore",
  "preview-output": "model-preview-output",
  "repair-action": "model-repair-action",
  "repair-progress": "model-repair-progress",
  "repairable-diagnosis": "model-repairable-diagnosis",
  "resource-unavailable": "model-resource-unavailable",
  "staged-preview": "model-staged-preview",
  "verified-repair": "model-verified-repair",
} as const;

type ModelCoverage = keyof typeof evidenceTypeByCoverage;
type ModelObservation = ToolcraftBrowserObservation<ToolcraftModelImportBrowserObservation>;

function message(coverage: ModelCoverage, requirementId: string): string {
  return `Model import ${coverage} "${requirementId}" must prove the observed lifecycle and product output before evidence is attached.`;
}

function expectNonEmpty(value: string, description: string): void {
  expect(value.trim(), description).not.toBe("");
}

function validateIdentity(identity: ToolcraftModelIdentityObservation, description: string): void {
  expectNonEmpty(identity.assetId, `${description} must identify the model asset.`);
  expectNonEmpty(identity.documentId, `${description} must identify the model document.`);
}

function validateProgress(
  progress: ToolcraftModelRepairProgressObservation,
  description: string,
): void {
  expectNonEmpty(progress.phase, `${description} must name the repair phase.`);
  expect(Number.isInteger(progress.completed)).toBe(true);
  expect(Number.isInteger(progress.total)).toBe(true);
  expect(progress.total, `${description} total work must be positive.`).toBeGreaterThan(0);
  expect(progress.completed, `${description} completed work cannot be negative.`).toBeGreaterThanOrEqual(0);
  expect(progress.completed, `${description} cannot exceed total work.`).toBeLessThanOrEqual(progress.total);
}

export function validateToolcraftModelImportObservation(
  observation: ToolcraftModelImportBrowserObservation,
  options: ToolcraftModelImportEvidenceOptions,
): void {
  const description = `Model import evidence "${options.requirementId}"`;
  expect(new Set(observation.advertisedFormats).size).toBe(observation.advertisedFormats.length);
  for (const format of observation.advertisedFormats) expect(format).toMatch(/^[a-z0-9]+$/u);
  if (observation.attemptFormat !== null) expect(observation.attemptFormat).toMatch(/^[a-z0-9]+$/u);
  if (observation.active) validateIdentity(observation.active, `${description} active identity`);
  if (observation.draft) validateIdentity(observation.draft, `${description} draft identity`);
  if (observation.previewOutput) {
    validateToolcraftModelOutputObservation(
      observation.previewOutput,
      `${description} preview`,
    );
  }
  if (observation.exportOutput) {
    validateToolcraftModelOutputObservation(
      observation.exportOutput,
      `${description} export`,
    );
  }
  validateToolcraftModelAppearanceObservation(observation, description);
  if (observation.repair.progress) validateProgress(observation.repair.progress, `${description} progress`);
  if (observation.rejection) {
    expectNonEmpty(observation.rejection.code, `${description} rejection must have a code.`);
    expect(observation.rejection.format).toMatch(/^[a-z0-9]+$/u);
  }
  if (observation.unavailableReason !== null) {
    expectNonEmpty(observation.unavailableReason, `${description} unavailable state needs a reason.`);
  }
}

async function expectTransition(
  observation: ModelObservation,
  action: ToolcraftBrowserAction,
  expected: ToolcraftModelImportBrowserObservation,
  coverage: ModelCoverage,
  options: ToolcraftModelImportEvidenceOptions,
) {
  validateToolcraftModelImportObservation(expected, options);
  const result = await expectToolcraftExpectedOutcomeAfterAction(
    observation,
    action,
    expected,
    createToolcraftSemanticTransitionOptions(message(coverage, options.requirementId), options),
  );
  validateToolcraftModelImportObservation(result.before, options);
  return result;
}

async function attachCoverage(
  coverage: ModelCoverage,
  options: ToolcraftModelImportEvidenceOptions,
): Promise<void> {
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: evidenceTypeByCoverage[coverage],
    requirementId: `${options.requirementId}#${coverage}`,
    target: options.target,
  });
}

function expectOutputForIdentity(
  output: ToolcraftModelOutputObservation | null,
  identity: ToolcraftModelIdentityObservation | null,
  opacity: number,
  description: string,
): asserts output is ToolcraftModelOutputObservation {
  expect(output, `${description} must expose rendered output.`).not.toBeNull();
  expect(identity, `${description} must identify the rendered model.`).not.toBeNull();
  expect(output!.documentId).toBe(identity!.documentId);
  expect(output!.modelSignature).toBe(identity!.assetId);
  expect(output!.opacity, `${description} must use the required opacity.`).toBeCloseTo(opacity, 6);
}

export async function expectToolcraftModelAdvertisedFormatImport(
  observation: ModelObservation, action: ToolcraftBrowserAction,
  expected: ToolcraftModelImportBrowserObservation, options: ToolcraftModelImportEvidenceOptions,
) {
  const { after, before } = await expectTransition(observation, action, expected, "advertised-format-import", options);
  expect(after.attemptFormat).not.toBeNull();
  expect(after.advertisedFormats).toContain(after.attemptFormat);
  expect(after.draft, "An admitted import must create a draft identity.").not.toBeNull();
  expect(after.active, "Admission must preserve the committed model.").toEqual(before.active);
  expect(after.lifecycle).toBe("staged");
  await attachCoverage("advertised-format-import", options);
  return after;
}

export async function expectToolcraftModelStagedPreview(
  observation: ModelObservation, action: ToolcraftBrowserAction,
  expected: ToolcraftModelImportBrowserObservation, options: ToolcraftModelImportEvidenceOptions,
) {
  const { after, before } = await expectTransition(observation, action, expected, "staged-preview", options);
  expect(after.lifecycle).toBe("staged");
  expect(after.active).toEqual(before.active);
  expectOutputForIdentity(after.previewOutput, after.draft, 0.4, "Staged preview");
  await attachCoverage("staged-preview", options);
  return after;
}

export async function expectToolcraftModelCleanCommit(
  observation: ModelObservation, action: ToolcraftBrowserAction,
  expected: ToolcraftModelImportBrowserObservation, options: ToolcraftModelImportEvidenceOptions,
) {
  const { after, before } = await expectTransition(observation, action, expected, "clean-commit", options);
  expect(before.draft, "Clean commit proof requires a staged draft.").not.toBeNull();
  expect(after.lifecycle).toBe("committed");
  expect(after.active).toEqual(before.draft);
  expect(after.draft).toBeNull();
  expect(after.repair.available).toBe(false);
  expect(after.repair.progress).toBeNull();
  expectOutputForIdentity(after.previewOutput, after.active, 1, "Committed preview");
  await attachCoverage("clean-commit", options);
  return after;
}

export async function expectToolcraftModelRepairableDiagnosis(
  observation: ModelObservation, action: ToolcraftBrowserAction,
  expected: ToolcraftModelImportBrowserObservation, options: ToolcraftModelImportEvidenceOptions,
) {
  const { after, before } = await expectTransition(observation, action, expected, "repairable-diagnosis", options);
  expect(after.lifecycle).toBe("repairable");
  expect(after.active).toEqual(before.active);
  expect(after.draft).not.toBeNull();
  expect(after.repair.available).toBe(true);
  expectNonEmpty(after.repair.diagnosisSignature ?? "", "Repairable diagnosis must identify issues.");
  expectNonEmpty(after.repair.geometrySignature ?? "", "Repairable diagnosis must identify geometry.");
  expect(after.repair.progress).toBeNull();
  expectOutputForIdentity(after.previewOutput, after.draft, 0.4, "Repairable preview");
  await attachCoverage("repairable-diagnosis", options);
  return after;
}

export async function expectToolcraftModelRepairAction(
  observation: ModelObservation, action: ToolcraftBrowserAction,
  expected: ToolcraftModelImportBrowserObservation, options: ToolcraftModelImportEvidenceOptions,
) {
  const { after, before } = await expectTransition(observation, action, expected, "repair-action", options);
  expect(before.lifecycle).toBe("repairable");
  expect(before.repair.available).toBe(true);
  expect(after.lifecycle).toBe("repairing");
  expect(after.active).toEqual(before.active);
  expect(after.draft).toEqual(before.draft);
  expect(after.repair.progress).not.toBeNull();
  expectOutputForIdentity(after.previewOutput, after.draft, 0.4, "Repairing preview");
  await attachCoverage("repair-action", options);
  return after;
}

export async function expectToolcraftModelRepairProgress(
  observation: ModelObservation, action: ToolcraftBrowserAction,
  expected: ToolcraftModelImportBrowserObservation, options: ToolcraftModelImportEvidenceOptions,
) {
  const { after, before } = await expectTransition(observation, action, expected, "repair-progress", options);
  expect(before.lifecycle).toBe("repairing");
  expect(after.lifecycle).toBe("repairing");
  expect(after.active).toEqual(before.active);
  expect(after.draft).toEqual(before.draft);
  expect(before.repair.progress).not.toBeNull();
  expect(after.repair.progress).not.toBeNull();
  expect(after.repair.progress!.total).toBe(before.repair.progress!.total);
  expect(after.repair.progress!.completed, "Repair requires forward progress.").toBeGreaterThan(before.repair.progress!.completed);
  expectOutputForIdentity(after.previewOutput, after.draft, 0.4, "Repair progress preview");
  await attachCoverage("repair-progress", options);
  return after;
}

export async function expectToolcraftModelVerifiedRepair(
  observation: ModelObservation, action: ToolcraftBrowserAction,
  expected: ToolcraftModelImportBrowserObservation, options: ToolcraftModelImportEvidenceOptions,
) {
  const { after, before } = await expectTransition(observation, action, expected, "verified-repair", options);
  expect(before.lifecycle).toBe("repairing");
  expect(before.draft, "Verified repair proof requires a draft.").not.toBeNull();
  expect(after.lifecycle).toBe("verified");
  expect(after.active).toEqual(before.draft);
  expect(after.draft).toBeNull();
  expect(after.repair.available).toBe(false);
  expect(after.repair.progress).toBeNull();
  expect(after.repair.verification).toBe("passed");
  expectNonEmpty(after.repair.geometrySignature ?? "", "Verified repair must identify geometry.");
  expect(after.repair.geometrySignature).not.toBe(before.repair.geometrySignature);
  expectOutputForIdentity(after.previewOutput, after.active, 1, "Verified preview");
  await attachCoverage("verified-repair", options);
  return after;
}

export async function expectToolcraftModelFatalRejection(
  observation: ModelObservation, action: ToolcraftBrowserAction,
  expected: ToolcraftModelImportBrowserObservation, options: ToolcraftModelImportEvidenceOptions,
) {
  const { after, before } = await expectTransition(observation, action, expected, "fatal-rejection", options);
  expect(before.active, "Rejection proof requires a committed model.").not.toBeNull();
  expect(after.lifecycle).toBe("rejected");
  expect(after.active).toEqual(before.active);
  expect(after.draft).toBeNull();
  expect(after.previewOutput).toEqual(before.previewOutput);
  expect(after.rejection).not.toBeNull();
  expect(after.rejection!.format).toBe(after.attemptFormat);
  await attachCoverage("fatal-rejection", options);
  return after;
}

export async function expectToolcraftModelPersistenceRestore(
  observation: ModelObservation, persistAction: ToolcraftBrowserAction,
  reloadAction: ToolcraftBrowserAction<"reload">, expected: ToolcraftModelImportBrowserObservation,
  options: ToolcraftModelImportEvidenceOptions,
) {
  assertToolcraftBrowserProofSession(observation, persistAction, reloadAction);
  validateToolcraftModelImportObservation(expected, options);
  expect(expected.lifecycle).toBe("restored");
  expect(expected.persistenceState).toBe("restored");
  expect(expected.active).not.toBeNull();
  expectOutputForIdentity(expected.previewOutput, expected.active, 1, "Restored preview");
  const observe = () => readToolcraftBrowserObservation(observation);
  const proofMessage = message("persistence-restore", options.requirementId);
  const transitionOptions = createToolcraftSemanticTransitionOptions(proofMessage, options);
  const before = snapshotToolcraftOutcome(await observe(), proofMessage);
  expect(before).not.toEqual(expected);
  await expectToolcraftStableOutcomeBaseline(observe, before, transitionOptions);
  await runToolcraftBrowserAction(persistAction);
  await expectToolcraftPersistentExpectedOutcome(observe, expected, transitionOptions);
  await runToolcraftBrowserAction(reloadAction, "reload");
  const restored = await expectToolcraftPersistentExpectedOutcome(observe, expected, transitionOptions);
  validateToolcraftModelImportObservation(restored, options);
  await attachCoverage("persistence-restore", options);
  return restored;
}

export async function expectToolcraftModelResourceUnavailable(
  observation: ModelObservation, action: ToolcraftBrowserAction,
  expected: ToolcraftModelImportBrowserObservation, options: ToolcraftModelImportEvidenceOptions,
) {
  const { after, before } = await expectTransition(observation, action, expected, "resource-unavailable", options);
  expect(before.active).not.toBeNull();
  expect(after.lifecycle).toBe("unavailable");
  expect(after.persistenceState).toBe("unavailable");
  expect(after.active).toEqual(before.active);
  expect(after.previewOutput).toBeNull();
  expectNonEmpty(after.unavailableReason ?? "", "Unavailable restore needs a typed reason.");
  await attachCoverage("resource-unavailable", options);
  return after;
}

export async function expectToolcraftModelPreviewOutput(
  observation: ModelObservation, action: ToolcraftBrowserAction,
  expected: ToolcraftModelImportBrowserObservation, options: ToolcraftModelImportEvidenceOptions,
) {
  const { after, before } = await expectTransition(observation, action, expected, "preview-output", options);
  expect(after.lifecycle === "committed" || after.lifecycle === "verified").toBe(true);
  expect(after.active).toEqual(before.active);
  expectOutputForIdentity(after.previewOutput, after.active, 1, "Model preview");
  expect(before.previewOutput).not.toBeNull();
  expect(after.previewOutput!.outputSignature).not.toBe(before.previewOutput!.outputSignature);
  expect(after.previewOutput!.pixelSignature).not.toBe(before.previewOutput!.pixelSignature);
  expect(after.previewOutput!.documentId).toBe(before.previewOutput!.documentId);
  expect(after.previewOutput!.presentationCacheKey)
    .toBe(before.previewOutput!.presentationCacheKey);
  await attachCoverage("preview-output", options);
  return after;
}

export async function expectToolcraftModelExportOutput(
  observation: ModelObservation, action: ToolcraftBrowserAction,
  expected: ToolcraftModelImportBrowserObservation, options: ToolcraftModelImportEvidenceOptions,
) {
  const { after, before } = await expectTransition(observation, action, expected, "export-output", options);
  expect(after.active).toEqual(before.active);
  expect(after.previewOutput).toEqual(before.previewOutput);
  expect(before.exportOutput).toBeNull();
  expectOutputForIdentity(after.exportOutput, after.active, 1, "Model export");
  expect(after.previewOutput).not.toBeNull();
  expect(after.exportOutput!.modelSignature).toBe(after.previewOutput!.modelSignature);
  expect(after.exportOutput!.documentId).toBe(after.previewOutput!.documentId);
  expect(after.exportOutput!.presentationCacheKey)
    .toBe(after.previewOutput!.presentationCacheKey);
  expect(
    after.exportOutput!.pixelSignature,
    "Model export must preserve the current preview appearance and orientation pixels.",
  ).toBe(after.previewOutput!.pixelSignature);
  await attachCoverage("export-output", options);
  return after;
}

export async function expectToolcraftModelHistoryReset(
  observation: ModelObservation, undoAction: ToolcraftBrowserAction,
  redoAction: ToolcraftBrowserAction, resetAction: ToolcraftBrowserAction,
  expectedBaseline: ToolcraftModelImportBrowserObservation,
  expectedChanged: ToolcraftModelImportBrowserObservation,
  options: ToolcraftModelImportEvidenceOptions,
): Promise<void> {
  assertToolcraftBrowserProofSession(observation, undoAction, redoAction, resetAction);
  validateToolcraftModelImportObservation(expectedBaseline, options);
  validateToolcraftModelImportObservation(expectedChanged, options);
  expect(expectedBaseline.active).not.toEqual(expectedChanged.active);
  expect(expectedBaseline.previewOutput).not.toEqual(expectedChanged.previewOutput);
  expect(await readToolcraftBrowserObservation(observation)).toEqual(expectedChanged);
  const transitionOptions = createToolcraftSemanticTransitionOptions(message("history-reset", options.requirementId), options);
  await expectToolcraftExpectedOutcomeAfterAction(observation, undoAction, expectedBaseline, transitionOptions);
  await expectToolcraftExpectedOutcomeAfterAction(observation, redoAction, expectedChanged, transitionOptions);
  await expectToolcraftExpectedOutcomeAfterAction(observation, resetAction, expectedBaseline, transitionOptions);
  await attachCoverage("history-reset", options);
}
