import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import {
  createToolcraftSemanticTransitionOptions,
  expectToolcraftExpectedOutcomeAfterAction,
} from "./browser-acceptance-transition-helpers";
import type {
  ToolcraftBrowserAction,
  ToolcraftBrowserObservation,
} from "./browser-proof-session";
import {
  assertToolcraftModelAppearanceCoverage,
  type ToolcraftModelAppearanceCoverage,
} from "./browser-model-appearance-evidence";
import {
  validateToolcraftModelImportObservation,
  type ToolcraftModelImportBrowserObservation,
  type ToolcraftModelImportEvidenceOptions,
} from "./browser-model-import-evidence-helpers";

const evidenceTypeByCoverage = {
  "appearance-preservation": "model-appearance-preservation",
  "deterministic-root-selection": "model-deterministic-root-selection",
  "fallback-appearance": "model-fallback-appearance",
  "package-extraction": "model-package-extraction",
  "pixel-output": "model-pixel-output",
  "presentation-consumer-readiness": "model-presentation-consumer-readiness",
} as const;

function message(
  coverage: ToolcraftModelAppearanceCoverage,
  requirementId: string,
): string {
  return `Model import ${coverage} "${requirementId}" must prove package, presentation, and rendered appearance before evidence is attached.`;
}

export async function expectToolcraftModelAppearanceCoverage(
  observation: ToolcraftBrowserObservation<ToolcraftModelImportBrowserObservation>,
  action: ToolcraftBrowserAction,
  expected: ToolcraftModelImportBrowserObservation,
  coverage: ToolcraftModelAppearanceCoverage,
  options: ToolcraftModelImportEvidenceOptions,
) {
  validateToolcraftModelImportObservation(expected, options);
  const result = await expectToolcraftExpectedOutcomeAfterAction(
    observation,
    action,
    expected,
    createToolcraftSemanticTransitionOptions(
      message(coverage, options.requirementId),
      options,
    ),
  );
  validateToolcraftModelImportObservation(result.before, options);
  assertToolcraftModelAppearanceCoverage(
    result.after,
    coverage,
    message(coverage, options.requirementId),
  );
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: evidenceTypeByCoverage[coverage],
    requirementId: `${options.requirementId}#${coverage}`,
    target: options.target,
  });
  return result.after;
}
