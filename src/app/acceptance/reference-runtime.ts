import type { ResolvedToolcraftAppSchema } from "@/toolcraft/runtime";

import {
  getReferenceBehaviorCoverageErrors,
  getUnmappedReferenceAcceptanceErrors,
} from "./reference-runtime-coverage";
import { getReferenceFeatureInventoryValidationResult } from "./reference-runtime-feature-inventory";
import { getReferenceStudyErrors } from "./reference-runtime-study";
import { getReferenceTimelineErrors } from "./reference-runtime-timeline";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftTransferMode,
} from "./types";

export function getToolcraftReferenceRuntimeCloneErrors({
  acceptance,
  schema,
  timelineMode,
  transferMode,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  schema: ResolvedToolcraftAppSchema;
  timelineMode: "keyframes" | "playback" | null;
  transferMode: ToolcraftTransferMode;
}): string[] {
  const errors: string[] = [];

  if (transferMode.mode !== "reference-runtime-clone") {
    for (const entry of acceptance) {
      if (entry.referenceCoverage) {
        errors.push(
          `${entry.id} declares referenceCoverage "${entry.referenceCoverage}" but transferMode is not "reference-runtime-clone".`,
        );
      }

      if (entry.referenceTimelineCoverage) {
        errors.push(
          `${entry.id} declares referenceTimelineCoverage "${entry.referenceTimelineCoverage}" but transferMode is not "reference-runtime-clone".`,
        );
      }
    }

    return errors;
  }

  if (!schema.assembly.surfaces.canvas.enabled) {
    errors.push(
      "reference-runtime-clone must keep the Toolcraft canvas shell enabled; preserve the reference renderer inside ToolcraftApp canvasContent instead of replacing the app with the original UI.",
    );
  }

  if (!transferMode.referenceName.trim()) {
    errors.push(
      "reference-runtime-clone transferMode must name the reference app or artifact.",
    );
  }

  if (transferMode.sourceOfTruth !== "reference-runtime") {
    errors.push(
      'reference-runtime-clone transferMode must set sourceOfTruth to "reference-runtime".',
    );
  }

  errors.push(...getReferenceStudyErrors(transferMode));

  const featureInventoryResult = getReferenceFeatureInventoryValidationResult({
    acceptance,
    transferMode,
  });

  errors.push(...featureInventoryResult.errors);
  errors.push(
    ...getReferenceBehaviorCoverageErrors({
      acceptance,
      referenceCoverageFromInventory:
        featureInventoryResult.referenceCoverageFromInventory,
      transferMode,
    }),
  );
  errors.push(
    ...getReferenceTimelineErrors({
      acceptance,
      referenceTimelineCoverageFromInventory:
        featureInventoryResult.referenceTimelineCoverageFromInventory,
      schema,
      timelineMode,
      transferMode,
    }),
  );
  errors.push(
    ...getUnmappedReferenceAcceptanceErrors({
      acceptance,
      referenceFeatureAcceptanceIds:
        featureInventoryResult.referenceFeatureAcceptanceIds,
    }),
  );

  return errors;
}
