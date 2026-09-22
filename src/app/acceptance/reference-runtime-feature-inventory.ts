import type {
  ToolcraftComponentAcceptance,
  ToolcraftReferenceCoverage,
  ToolcraftReferenceFeatureStatus,
  ToolcraftReferenceTimelineCoverage,
  ToolcraftTransferMode,
} from "./types";

const referenceFeatureStatusValues = new Set<ToolcraftReferenceFeatureStatus>([
  "intentionally-changed",
  "ported",
  "toolcraft-native",
]);

const explicitReferenceChangeReasonPattern =
  /\b(user|requested|explicit|approved|redesign|change request)\b/i;

export type ReferenceFeatureInventoryValidationResult = {
  errors: string[];
  referenceCoverageFromInventory: ReadonlySet<ToolcraftReferenceCoverage>;
  referenceFeatureAcceptanceIds: ReadonlySet<string>;
  referenceTimelineCoverageFromInventory: ReadonlySet<ToolcraftReferenceTimelineCoverage>;
};

export function getReferenceFeatureInventoryValidationResult({
  acceptance,
  transferMode,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  transferMode: Extract<ToolcraftTransferMode, { mode: "reference-runtime-clone" }>;
}): ReferenceFeatureInventoryValidationResult {
  const errors: string[] = [];
  const referenceFeatureInventory = transferMode.referenceFeatureInventory ?? [];
  const acceptanceById = new Map(acceptance.map((entry) => [entry.id, entry]));
  const referenceFeatureIds = new Set<string>();
  const referenceFeatureAcceptanceIds = new Set<string>();
  const referenceCoverageFromInventory = new Set<ToolcraftReferenceCoverage>();
  const referenceTimelineCoverageFromInventory =
    new Set<ToolcraftReferenceTimelineCoverage>();

  if (referenceFeatureInventory.length === 0) {
    errors.push(
      "reference-runtime-clone transferMode must declare referenceFeatureInventory with every user-visible and output-affecting behavior from the inspected reference, mapped to Toolcraft implementation and acceptance coverage.",
    );
  }

  for (const [index, feature] of referenceFeatureInventory.entries()) {
    const featureLabel = feature.id.trim() || `#${index + 1}`;

    if (!feature.id.trim()) {
      errors.push(
        `referenceFeatureInventory item ${index + 1} must include a stable id.`,
      );
    } else if (referenceFeatureIds.has(feature.id)) {
      errors.push(
        `referenceFeatureInventory id "${feature.id}" is duplicated; each reference feature must be inventoried once.`,
      );
    } else {
      referenceFeatureIds.add(feature.id);
    }

    if (!feature.featureName.trim()) {
      errors.push(
        `referenceFeatureInventory "${featureLabel}" must include a short featureName.`,
      );
    }

    if (!feature.sourceEvidence.trim()) {
      errors.push(
        `referenceFeatureInventory "${featureLabel}" must include sourceEvidence from the inspected reference source, runtime, UI, or browser behavior.`,
      );
    }

    if (!feature.behaviorEvidence.trim()) {
      errors.push(
        `referenceFeatureInventory "${featureLabel}" must include behaviorEvidence from the original, restored, or source-only reference study proving this feature was observed before Toolcraft mapping.`,
      );
    }

    if (!feature.referenceBehavior.trim()) {
      errors.push(
        `referenceFeatureInventory "${featureLabel}" must describe the referenceBehavior to preserve.`,
      );
    }

    if (!feature.toolcraftMapping.trim()) {
      errors.push(
        `referenceFeatureInventory "${featureLabel}" must describe the Toolcraft mapping for the preserved behavior.`,
      );
    }

    if (!referenceFeatureStatusValues.has(feature.status)) {
      errors.push(
        `referenceFeatureInventory "${featureLabel}" status must be "ported", "toolcraft-native", or "intentionally-changed".`,
      );
    }

    if (feature.status === "intentionally-changed") {
      if (!feature.userApprovedChangeReason?.trim()) {
        errors.push(
          `referenceFeatureInventory "${featureLabel}" status "intentionally-changed" requires userApprovedChangeReason.`,
        );
      } else if (
        !explicitReferenceChangeReasonPattern.test(feature.userApprovedChangeReason)
      ) {
        errors.push(
          `referenceFeatureInventory "${featureLabel}" userApprovedChangeReason must cite explicit user approval or redesign/change-request evidence.`,
        );
      }
    }

    const acceptanceId = feature.acceptanceId.trim();

    if (!acceptanceId) {
      errors.push(
        `referenceFeatureInventory "${featureLabel}" must include acceptanceId for the test proving the mapped reference behavior.`,
      );
      continue;
    }

    referenceFeatureAcceptanceIds.add(acceptanceId);

    const entry = acceptanceById.get(acceptanceId);

    if (!entry) {
      errors.push(
        `referenceFeatureInventory "${featureLabel}" points to missing acceptanceId "${acceptanceId}".`,
      );
      continue;
    }

    if (!entry.referenceCoverage && !entry.referenceTimelineCoverage) {
      errors.push(
        `referenceFeatureInventory "${featureLabel}" acceptanceId "${acceptanceId}" must point to an acceptance entry with referenceCoverage or referenceTimelineCoverage.`,
      );
    }

    if (entry.referenceCoverage) {
      referenceCoverageFromInventory.add(entry.referenceCoverage);
    }

    if (entry.referenceTimelineCoverage) {
      referenceTimelineCoverageFromInventory.add(entry.referenceTimelineCoverage);
    }

    if (!entry.automated || !entry.automatedTestName.trim()) {
      errors.push(
        `${acceptanceId} must have automated coverage proving inventoried reference feature "${featureLabel}".`,
      );
    }

    if (entry.browser === false) {
      errors.push(
        `${acceptanceId} must have browser coverage proving inventoried reference feature "${featureLabel}".`,
      );
    }

    if (!entry.expectedObservable.trim()) {
      errors.push(
        `${acceptanceId} must describe the observable result for inventoried reference feature "${featureLabel}".`,
      );
    }
  }

  return {
    errors,
    referenceCoverageFromInventory,
    referenceFeatureAcceptanceIds,
    referenceTimelineCoverageFromInventory,
  };
}
