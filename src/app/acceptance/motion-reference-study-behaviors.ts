import type {
  ToolcraftComponentAcceptance,
  ToolcraftMotionReferenceInput,
} from "./types";

type AcceptanceRowsById = ReadonlyMap<
  string,
  readonly ToolcraftComponentAcceptance[]
>;

function validateAcceptanceFields({
  acceptance,
  behaviorId,
}: {
  acceptance: ToolcraftComponentAcceptance;
  behaviorId: string;
}): string[] {
  const errors: string[] = [];
  if (!acceptance.automated || !acceptance.automatedTestName.trim()) {
    errors.push(
      `motion reference behavior "${behaviorId}" acceptance "${acceptance.id}" must have automated coverage.`,
    );
  }
  if (acceptance.browser === false) {
    errors.push(
      `motion reference behavior "${behaviorId}" acceptance "${acceptance.id}" must have browser coverage.`,
    );
  }
  if (!acceptance.expectedObservable.trim()) {
    errors.push(
      `motion reference behavior "${behaviorId}" acceptance "${acceptance.id}" must describe its observable result.`,
    );
  }
  return errors;
}

export function validateBehaviorCoverage(
  input: ToolcraftMotionReferenceInput,
  acceptanceRowsById: AcceptanceRowsById,
): string[] {
  const errors: string[] = [];
  const studiesById = new Map<
    string,
    ToolcraftMotionReferenceInput["studies"]
  >();
  const usedBehaviorIds = new Set<string>();

  for (const study of input.studies) {
    studiesById.set(study.studyId, [
      ...(studiesById.get(study.studyId) ?? []),
      study,
    ]);
    for (const phase of study.phases) {
      phase.behaviorIds.forEach((behaviorId) => usedBehaviorIds.add(behaviorId));
    }
    for (const event of study.events) {
      if (event.classification === "product-behavior") {
        event.behaviorIds.forEach((behaviorId) => usedBehaviorIds.add(behaviorId));
      }
    }
  }

  for (const behavior of input.behaviors) {
    if (!behavior.description.trim()) {
      errors.push(
        `motion reference behavior "${behavior.id}" must include a non-empty description.`,
      );
    }
    if (!behavior.implementationIntent.trim()) {
      errors.push(
        `motion reference behavior "${behavior.id}" must include a non-empty implementationIntent.`,
      );
    }
    if (!usedBehaviorIds.has(behavior.id)) {
      errors.push(
        `motion reference behavior "${behavior.id}" must be used by a phase or product event.`,
      );
    }

    const timingClaimStudies = new Map<string, Set<string>>();
    for (const timingClaim of behavior.timingClaims) {
      const studyIds = timingClaimStudies.get(timingClaim.claim) ?? new Set();
      if (studyIds.has(timingClaim.studyId)) {
        errors.push(
          `motion reference behavior "${behavior.id}" timing claim "${timingClaim.claim}" for study "${timingClaim.studyId}" is duplicated.`,
        );
      }
      studyIds.add(timingClaim.studyId);
      timingClaimStudies.set(timingClaim.claim, studyIds);

      const studies = studiesById.get(timingClaim.studyId) ?? [];
      if (studies.length === 0) {
        errors.push(
          `motion reference behavior "${behavior.id}" timing claim "${timingClaim.claim}" names missing study "${timingClaim.studyId}".`,
        );
      } else if (studies.length > 1) {
        errors.push(
          `motion reference behavior "${behavior.id}" timing claim "${timingClaim.claim}" studyId "${timingClaim.studyId}" resolves to ${studies.length} studies; expected exactly one.`,
        );
      } else {
        const [study] = studies;
        if (study.evidence.timingMode !== "seconds") {
          errors.push(
            `motion reference behavior "${behavior.id}" timing claim "${timingClaim.claim}" must name a seconds-timed study; "${timingClaim.studyId}" is ordinal.`,
          );
        }
      }
    }

    const acceptanceRows = acceptanceRowsById.get(behavior.acceptanceId) ?? [];
    if (acceptanceRows.length === 0) {
      errors.push(
        `motion reference behavior "${behavior.id}" points to missing acceptanceId "${behavior.acceptanceId}".`,
      );
      continue;
    }
    for (const acceptance of acceptanceRows) {
      errors.push(...validateAcceptanceFields({ acceptance, behaviorId: behavior.id }));
    }
    if (acceptanceRows.length > 1) {
      errors.push(
        `motion reference behavior "${behavior.id}" acceptanceId "${behavior.acceptanceId}" resolves to ${acceptanceRows.length} acceptance rows; expected exactly one.`,
      );
      continue;
    }
    const [acceptance] = acceptanceRows;

    const matchingReverseCoverage = (
      acceptance.motionReferenceCoverage ?? []
    ).filter(
      (coverage) =>
        coverage.referenceId === input.referenceId &&
        coverage.behaviorId === behavior.id,
    );
    if (matchingReverseCoverage.length !== 1) {
      errors.push(
        `motion reference behavior "${behavior.id}" acceptance "${acceptance.id}" must own exactly one reverse coverage pair; found ${matchingReverseCoverage.length}.`,
      );
    }

    let coverageOwnerCount = 0;
    for (const rows of acceptanceRowsById.values()) {
      for (const entry of rows) {
        const ownsCoverage = (entry.motionReferenceCoverage ?? []).some(
          (coverage) =>
            coverage.referenceId === input.referenceId &&
            coverage.behaviorId === behavior.id,
        );
        if (ownsCoverage) {
          coverageOwnerCount += 1;
        }
      }
    }
    if (coverageOwnerCount > 1) {
      errors.push(
        `motion reference behavior "${behavior.id}" coverage pair has ${coverageOwnerCount} acceptance owners; expected exactly one.`,
      );
    }
  }

  return errors;
}
