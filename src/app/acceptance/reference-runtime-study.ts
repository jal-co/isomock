import type {
  ToolcraftReferenceStudyStatus,
  ToolcraftTransferMode,
} from "./types";

const referenceStudyStatusValues = new Set<ToolcraftReferenceStudyStatus>([
  "ran-original",
  "restored-local",
  "source-inspection-only",
]);

const referenceStudySourceOnlyReasonPattern =
  /\b(cannot|can't|unable|unavailable|missing|broken|fails?|blocked|no\s+(?:server|deps?|dependency|access)|not\s+(?:runnable|available))\b/i;

export function getReferenceStudyErrors(
  transferMode: Extract<ToolcraftTransferMode, { mode: "reference-runtime-clone" }>,
): string[] {
  const errors: string[] = [];
  const referenceStudy = transferMode.referenceStudy;

  if (!referenceStudy) {
    errors.push(
      "reference-runtime-clone transferMode must declare referenceStudy proving the reference was inspected and, when runnable or reconstructable, run or restored locally before implementation.",
    );
    return errors;
  }

  if (!referenceStudyStatusValues.has(referenceStudy.status)) {
    errors.push(
      'referenceStudy.status must be "ran-original", "restored-local", or "source-inspection-only".',
    );
  }

  if (!referenceStudy.referenceLocation.trim()) {
    errors.push(
      "referenceStudy.referenceLocation must name the inspected reference folder, URL, artifact, or source location.",
    );
  }

  if (!referenceStudy.sourceEvidence.trim()) {
    errors.push(
      "referenceStudy.sourceEvidence must summarize the source/runtime files, routes, schemas, or assets inspected.",
    );
  }

  if (!referenceStudy.behaviorEvidence.trim()) {
    errors.push(
      "referenceStudy.behaviorEvidence must summarize the runtime/browser behavior checked from the original or restored reference.",
    );
  }

  if (!referenceStudy.reproductionSteps.trim()) {
    errors.push(
      "referenceStudy.reproductionSteps must record how the reference was run, restored in the Toolcraft environment, or why source-only inspection was used.",
    );
  }

  if (referenceStudy.status === "source-inspection-only") {
    if (!referenceStudy.sourceOnlyReason?.trim()) {
      errors.push(
        'referenceStudy.status "source-inspection-only" requires sourceOnlyReason explaining why the reference could not be run or restored locally.',
      );
    } else if (
      !referenceStudySourceOnlyReasonPattern.test(referenceStudy.sourceOnlyReason)
    ) {
      errors.push(
        'referenceStudy.sourceOnlyReason must state the concrete blocker that made running or restoring the reference unavailable.',
      );
    }
  }

  return errors;
}
