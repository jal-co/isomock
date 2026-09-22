import { validateBehaviorCoverage } from "./motion-reference-study-behaviors";
import { validateStudyCoverage } from "./motion-reference-study-coverage";
import {
  getMotionReferenceSourceSha256,
  validateStudyIdentity,
} from "./motion-reference-study-identity";
import { validatePartitionCoverage } from "./motion-reference-study-partitions";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftTransferMode,
} from "./types";

export function getToolcraftMotionReferenceStudyErrors({
  acceptance,
  transferMode,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  transferMode: ToolcraftTransferMode;
}): string[] {
  const errors: string[] = [];
  const acceptanceRowsById = new Map<string, ToolcraftComponentAcceptance[]>();
  for (const entry of acceptance) {
    acceptanceRowsById.set(entry.id, [
      ...(acceptanceRowsById.get(entry.id) ?? []),
      entry,
    ]);
  }
  const referenceIds = new Set<string>();
  const sourceOwners = new Map<string, string>();
  const behaviorCountsByReferenceId = new Map<string, Map<string, number>>();

  for (const input of transferMode.referenceInputs) {
    if (referenceIds.has(input.referenceId)) {
      errors.push(`motion reference id "${input.referenceId}" is duplicated.`);
    }
    referenceIds.add(input.referenceId);

    errors.push(
      ...validateStudyIdentity(input),
      ...validateStudyCoverage(input),
      ...validatePartitionCoverage(input),
      ...validateBehaviorCoverage(input, acceptanceRowsById),
    );

    const sourceSha256 = getMotionReferenceSourceSha256(input);
    if (sourceSha256) {
      const existingOwner = sourceOwners.get(sourceSha256);
      if (existingOwner) {
        errors.push(
          `motion reference sourceSha256 "${sourceSha256}" is declared by multiple reference inputs; merge their studies under one input.`,
        );
      } else {
        sourceOwners.set(sourceSha256, input.referenceId);
      }
    }

    const behaviorCounts =
      behaviorCountsByReferenceId.get(input.referenceId) ??
      new Map<string, number>();
    for (const behavior of input.behaviors) {
      behaviorCounts.set(
        behavior.id,
        (behaviorCounts.get(behavior.id) ?? 0) + 1,
      );
    }
    behaviorCountsByReferenceId.set(input.referenceId, behaviorCounts);
  }

  for (const acceptanceEntry of acceptance) {
    for (const coverage of acceptanceEntry.motionReferenceCoverage ?? []) {
      const behaviorCount =
        behaviorCountsByReferenceId
          .get(coverage.referenceId)
          ?.get(coverage.behaviorId) ?? 0;
      if (behaviorCount === 0) {
        errors.push(
          `acceptance "${acceptanceEntry.id}" has dangling motion reference coverage for "${coverage.referenceId}" behavior "${coverage.behaviorId}".`,
        );
      } else if (behaviorCount > 1) {
        errors.push(
          `acceptance "${acceptanceEntry.id}" motion reference coverage for "${coverage.referenceId}" behavior "${coverage.behaviorId}" resolves to ${behaviorCount} behavior definitions; expected exactly one.`,
        );
      }
    }
  }

  return [...new Set(errors)].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
}
