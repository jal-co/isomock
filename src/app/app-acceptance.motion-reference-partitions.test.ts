import { describe, expect, it } from "vitest";

import type { ToolcraftMotionReferenceStudy } from "./acceptance/types";
import {
  createMotionReferenceInput,
  createTimedMotionReferenceStudy,
  getMotionReferenceErrors,
  type MotionReviewPartition,
  type MotionSegment,
} from "./app-acceptance.motion-reference-test-utils";

const partitionBase = {
  count: 2,
  groupId: "motion-group-v1-partitioned-reference",
  planSha256:
    "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  scope: { endSeconds: 4, startSeconds: 0 },
} satisfies Omit<MotionReviewPartition, "index">;

function createPartitionStudy({
  count = partitionBase.count,
  detectedLoopSeam = false,
  index,
  planSha256 = partitionBase.planSha256,
  reviewPartition = true,
  scope = partitionBase.scope,
  segment,
}: {
  count?: number;
  detectedLoopSeam?: boolean;
  index: number;
  planSha256?: string;
  reviewPartition?: boolean;
  scope?: MotionReviewPartition["scope"];
  segment: MotionSegment;
}): ToolcraftMotionReferenceStudy {
  const studyId = `study-partition-${index}`;
  return createTimedMotionReferenceStudy({
    behaviorId: null,
    detectedLoopSeam,
    framePrefix: `p${index}-`,
    pathId: studyId,
    reviewPartition: reviewPartition
      ? { count, groupId: partitionBase.groupId, index, planSha256, scope }
      : undefined,
    segment,
    studyId,
    withEvent: detectedLoopSeam,
  });
}

function getPartitionErrors(
  studies: readonly ToolcraftMotionReferenceStudy[],
): string[] {
  return getMotionReferenceErrors(
    [createMotionReferenceInput({ behaviors: [], studies })],
    [],
  );
}

function createCompletePartition(): readonly ToolcraftMotionReferenceStudy[] {
  return [
    createPartitionStudy({
      index: 0,
      segment: { endSeconds: 2, startSeconds: 0 },
    }),
    createPartitionStudy({
      index: 1,
      segment: { endSeconds: 4, startSeconds: 2 },
    }),
  ];
}

describe("Toolcraft motion reference partitions", () => {
  it("accepts an exact contiguous partition group in every input order", () => {
    const studies = createCompletePartition();

    expect(getPartitionErrors(studies)).toEqual([]);
    expect(getPartitionErrors([...studies].reverse())).toEqual([]);
  });

  it("rejects an incomplete partition group", () => {
    expect(getPartitionErrors([createCompletePartition()[0]])).toContain(
      'motion reference partition "motion-group-v1-partitioned-reference" count 2 cannot exceed group cardinality 1.',
    );
  });

  it("rejects overlapping partition segments", () => {
    expect(
      getPartitionErrors([
        createPartitionStudy({
          index: 0,
          segment: { endSeconds: 2, startSeconds: 0 },
        }),
        createPartitionStudy({
          index: 1,
          segment: { endSeconds: 4, startSeconds: 1.5 },
        }),
      ]),
    ).toContain(
      'motion reference partition "motion-group-v1-partitioned-reference" segments must be contiguous and non-overlapping; index 1 starts at 1.5 after 2.',
    );
  });

  it("validates count before deriving an index range or allocating by it", () => {
    const invalidCounts = [0, 1.5, Number.POSITIVE_INFINITY];
    for (const count of invalidCounts) {
      expect(
        getPartitionErrors([
          createPartitionStudy({
            count,
            index: 0,
            segment: { endSeconds: 4, startSeconds: 0 },
          }),
        ]),
      ).toContain(
        `motion reference partition "motion-group-v1-partitioned-reference" count must be a finite safe positive integer; received ${String(count)}.`,
      );
    }

    expect(
      getPartitionErrors([
        createPartitionStudy({
          count: Number.MAX_SAFE_INTEGER,
          index: 0,
          segment: { endSeconds: 4, startSeconds: 0 },
        }),
      ]),
    ).toContain(
      `motion reference partition "motion-group-v1-partitioned-reference" count ${Number.MAX_SAFE_INTEGER} cannot exceed group cardinality 1.`,
    );
  });

  it("reports conflicting metadata canonically and skips dependent range checks", () => {
    const studies = [
      createPartitionStudy({
        count: 2,
        index: 0,
        segment: { endSeconds: 3, startSeconds: 0 },
      }),
      createPartitionStudy({
        count: 3,
        index: 1,
        planSha256:
          "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        scope: { endSeconds: 5, startSeconds: 0 },
        segment: { endSeconds: 4, startSeconds: 1 },
      }),
      createPartitionStudy({
        count: 2,
        index: 2,
        segment: { endSeconds: 4, startSeconds: 3 },
      }),
    ];
    const forward = getPartitionErrors(studies);
    const reverse = getPartitionErrors([...studies].reverse());

    expect(forward).toEqual(reverse);
    expect(forward).toContain(
      'motion reference partition "motion-group-v1-partitioned-reference" studies must declare one shared count.',
    );
    expect(forward).toContain(
      'motion reference partition "motion-group-v1-partitioned-reference" studies must declare one shared planSha256.',
    );
    expect(forward).toContain(
      'motion reference partition "motion-group-v1-partitioned-reference" studies must declare one shared scope.',
    );
    expect(forward.some((error) => error.includes("segments must"))).toBe(false);
  });

  it("accepts semantically equal scopes regardless of key insertion order", () => {
    expect(
      getPartitionErrors([
        createCompletePartition()[0],
        createPartitionStudy({
          index: 1,
          scope: { startSeconds: 0, endSeconds: 4 },
          segment: { endSeconds: 4, startSeconds: 2 },
        }),
      ]),
    ).toEqual([]);
  });

  it("allows the original full-source loop seam only in partition index zero", () => {
    expect(
      getPartitionErrors([
        createCompletePartition()[0],
        createPartitionStudy({
          detectedLoopSeam: true,
          index: 1,
          segment: { endSeconds: 4, startSeconds: 2 },
        }),
      ]),
    ).toContain(
      'motion reference partition "motion-group-v1-partitioned-reference" original loop-seam evidence must appear only in index 0.',
    );
  });

  it("accepts one explicit unpartitioned segment as an intentional excerpt", () => {
    expect(
      getPartitionErrors([
        createPartitionStudy({
          index: 0,
          reviewPartition: false,
          segment: { endSeconds: 2, startSeconds: 1 },
        }),
      ]),
    ).toEqual([]);
  });
});
