import type { ToolcraftMotionReferenceInput } from "./types";

type TimedStudyEvidence = Extract<
  ToolcraftMotionReferenceInput["studies"][number]["evidence"],
  { timingMode: "seconds" }
>;
type ReviewPartition = NonNullable<TimedStudyEvidence["reviewPartition"]>;

type PartitionStudy = {
  evidence: TimedStudyEvidence;
  partition: ReviewPartition;
  studyId: string;
};

function formatNumber(value: number): string {
  return String(value);
}

function compareNumbers(left: number, right: number): number {
  if (Number.isFinite(left) && Number.isFinite(right)) {
    return left - right;
  }
  return formatNumber(left).localeCompare(formatNumber(right), "en");
}

export function validatePartitionCoverage(
  input: ToolcraftMotionReferenceInput,
): string[] {
  const errors: string[] = [];
  const groups = new Map<string, PartitionStudy[]>();

  for (const study of input.studies) {
    if (study.evidence.timingMode !== "seconds") {
      continue;
    }
    const partition = study.evidence.reviewPartition;
    if (!partition) {
      continue;
    }

    const group = groups.get(partition.groupId) ?? [];
    group.push({ evidence: study.evidence, partition, studyId: study.studyId });
    groups.set(partition.groupId, group);
  }

  for (const [groupId, group] of groups) {
    const countValues = [...new Set(group.map(({ partition }) => partition.count))];
    const invalidCounts = countValues
      .filter((count) => !Number.isSafeInteger(count) || count <= 0)
      .sort(compareNumbers);
    for (const count of invalidCounts) {
      errors.push(
        `motion reference partition "${groupId}" count must be a finite safe positive integer; received ${formatNumber(count)}.`,
      );
    }

    const countIsShared = countValues.length === 1;
    if (!countIsShared) {
      errors.push(
        `motion reference partition "${groupId}" studies must declare one shared count.`,
      );
    }

    const validCounts = countValues.filter(
      (count) => Number.isSafeInteger(count) && count > 0,
    );
    const oversizedCounts = validCounts
      .filter((count) => count > group.length)
      .sort(compareNumbers);
    for (const count of oversizedCounts) {
      errors.push(
        `motion reference partition "${groupId}" count ${count} cannot exceed group cardinality ${group.length}.`,
      );
    }

    const planValues = new Set(
      group.map(({ partition }) => partition.planSha256),
    );
    const planIsShared = planValues.size === 1;
    if (!planIsShared) {
      errors.push(
        `motion reference partition "${groupId}" studies must declare one shared planSha256.`,
      );
    }

    const scopeStarts = new Set(
      group.map(({ partition }) => partition.scope.startSeconds),
    );
    const scopeEnds = new Set(
      group.map(({ partition }) => partition.scope.endSeconds),
    );
    const scopeIsShared = scopeStarts.size === 1 && scopeEnds.size === 1;
    if (!scopeIsShared) {
      errors.push(
        `motion reference partition "${groupId}" studies must declare one shared scope.`,
      );
    }

    const metadataIsValid =
      invalidCounts.length === 0 &&
      oversizedCounts.length === 0 &&
      countIsShared &&
      planIsShared &&
      scopeIsShared;
    if (!metadataIsValid) {
      continue;
    }

    const [expectedCount] = countValues;
    const [scopeStart] = scopeStarts;
    const [scopeEnd] = scopeEnds;
    if (
      expectedCount === undefined ||
      scopeStart === undefined ||
      scopeEnd === undefined
    ) {
      continue;
    }

    const orderedGroup = [...group].sort((left, right) => {
      const indexOrder = compareNumbers(
        left.partition.index,
        right.partition.index,
      );
      return indexOrder || left.studyId.localeCompare(right.studyId, "en");
    });
    const receivedIndices = orderedGroup.map(({ partition }) => partition.index);
    const indicesAreExact =
      orderedGroup.length === expectedCount &&
      receivedIndices.every((index, position) => index === position);
    if (!indicesAreExact) {
      errors.push(
        `motion reference partition "${groupId}" must contain indices 0..${expectedCount - 1} exactly; received ${receivedIndices.join(", ")}.`,
      );
      continue;
    }

    let previousEnd: number | undefined;
    for (const { evidence, partition, studyId } of orderedGroup) {
      const segment = evidence.segment;
      if (!segment) {
        errors.push(
          `motion reference partition "${groupId}" study "${studyId}" must declare an explicit segment.`,
        );
        continue;
      }

      if (segment.endSeconds <= segment.startSeconds) {
        errors.push(
          `motion reference partition "${groupId}" study "${studyId}" segment must have positive duration.`,
        );
      }
      if (partition.index === 0 && segment.startSeconds !== scopeStart) {
        errors.push(
          `motion reference partition "${groupId}" segments must start at scope.startSeconds ${scopeStart}; received ${segment.startSeconds}.`,
        );
      }
      if (previousEnd !== undefined && segment.startSeconds !== previousEnd) {
        errors.push(
          `motion reference partition "${groupId}" segments must be contiguous and non-overlapping; index ${partition.index} starts at ${segment.startSeconds} after ${previousEnd}.`,
        );
      }
      previousEnd = segment.endSeconds;

      const scopeCoversFullSource =
        scopeStart === 0 && scopeEnd === evidence.durationSeconds;
      if (
        scopeCoversFullSource &&
        partition.index !== 0 &&
        evidence.detectedEvents.some((event) => event.kind === "loop-seam")
      ) {
        errors.push(
          `motion reference partition "${groupId}" original loop-seam evidence must appear only in index 0.`,
        );
      }
    }

    if (previousEnd !== undefined && previousEnd !== scopeEnd) {
      errors.push(
        `motion reference partition "${groupId}" segments must end at scope.endSeconds ${scopeEnd}; received ${previousEnd}.`,
      );
    }
  }

  return errors;
}
