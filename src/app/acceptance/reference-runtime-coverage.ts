import type {
  ToolcraftComponentAcceptance,
  ToolcraftReferenceCoverage,
  ToolcraftTransferMode,
} from "./types";

const requiredReferenceCloneCoverage = [
  "canvas-sizing",
  "control-mapping",
  "renderer-state",
] satisfies readonly ToolcraftReferenceCoverage[];

export function getReferenceBehaviorCoverageErrors({
  acceptance,
  referenceCoverageFromInventory,
  transferMode,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  referenceCoverageFromInventory: ReadonlySet<ToolcraftReferenceCoverage>;
  transferMode: Extract<ToolcraftTransferMode, { mode: "reference-runtime-clone" }>;
}): string[] {
  const errors: string[] = [];
  const declaredReferenceCoverage = new Set(transferMode.behaviorCoverage);

  for (const coverage of requiredReferenceCloneCoverage) {
    if (!declaredReferenceCoverage.has(coverage)) {
      errors.push(
        `reference-runtime-clone transferMode must include behaviorCoverage "${coverage}".`,
      );
    }
  }

  for (const coverage of declaredReferenceCoverage) {
    const entry = acceptance.find(
      (acceptanceEntry) => acceptanceEntry.referenceCoverage === coverage,
    );

    if (!entry) {
      errors.push(
        `reference-runtime-clone behaviorCoverage "${coverage}" is missing an acceptance entry with referenceCoverage "${coverage}".`,
      );
      continue;
    }

    if (!entry.automated || !entry.automatedTestName.trim()) {
      errors.push(
        `${entry.id} must have automated coverage proving reference behavior "${coverage}".`,
      );
    }

    if (entry.browser === false) {
      errors.push(
        `${entry.id} must have browser coverage proving reference behavior "${coverage}".`,
      );
    }

    if (!entry.expectedObservable.trim()) {
      errors.push(
        `${entry.id} must describe the observable reference behavior for "${coverage}".`,
      );
    }
  }

  for (const coverage of declaredReferenceCoverage) {
    if (!referenceCoverageFromInventory.has(coverage)) {
      errors.push(
        `reference-runtime-clone behaviorCoverage "${coverage}" must be represented in referenceFeatureInventory by an item whose acceptanceId points to that referenceCoverage.`,
      );
    }
  }

  return errors;
}

export function getUnmappedReferenceAcceptanceErrors({
  acceptance,
  referenceFeatureAcceptanceIds,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  referenceFeatureAcceptanceIds: ReadonlySet<string>;
}): string[] {
  const errors: string[] = [];

  for (const entry of acceptance) {
    if (
      (entry.referenceCoverage || entry.referenceTimelineCoverage) &&
      !referenceFeatureAcceptanceIds.has(entry.id)
    ) {
      errors.push(
        `${entry.id} declares reference coverage but is not mapped from referenceFeatureInventory. Every reference acceptance row must correspond to an inventoried reference feature.`,
      );
    }
  }

  return errors;
}
