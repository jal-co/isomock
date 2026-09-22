import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolcraftMotionReviewSelection,
  TOOLCRAFT_MOTION_MAX_REVIEW_FRAMES,
  TOOLCRAFT_MOTION_OVERVIEW_FPS,
} from "./toolcraft-motion-reference-sampling.mjs";
import { createToolcraftMotionReviewPartitionPlan } from "./toolcraft-motion-review-partitioning.mjs";

const frameIds = (indices) => indices.map((index) => `source-frame:${index}`);

function timedInput({
  changeScores,
  durationSeconds = 6,
  focusWindows = [],
  frameCount = 180,
  frameTimes = Array.from({ length: frameCount }, (_, index) => index / 30),
  loopSeamScore,
  nominalFrameRate = 30,
  range = { startSeconds: 0, endSeconds: durationSeconds },
  sourceRange = range,
} = {}) {
  return {
    timingMode: "seconds",
    changeScores: changeScores ?? Array(frameCount).fill(0),
    focusWindows,
    frameTimes,
    loopSeamScore,
    nominalFrameRate,
    range,
    sourceRange,
  };
}

function assertSortedUnique(values) {
  assert.deepEqual(values, [...new Set(values)].toSorted((a, b) => a - b));
}

test("exports the adaptive review limits", () => {
  assert.equal(TOOLCRAFT_MOTION_OVERVIEW_FPS, 12);
  assert.equal(TOOLCRAFT_MOTION_MAX_REVIEW_FRAMES, 120);
});

test("six seconds at 30fps selects 73 overview frames including endpoints", () => {
  const result = createToolcraftMotionReviewSelection(timedInput());

  assert.equal(result.kind, "selection");
  assert.equal(result.overviewFrameIndices.length, 73);
  assert.deepEqual(result.overviewFrameIds, frameIds(result.overviewFrameIndices));
  assert.equal(result.overviewFrameIndices[0], 0);
  assert.equal(result.overviewFrameIndices.at(-1), 179);
  assert.deepEqual(result.reviewFrameIndices, result.overviewFrameIndices);
  assert.equal(result.reviewFrameCount, 73);
});

test("retains the previous, event, and next frame for a one-frame change", () => {
  const changeScores = Array(180).fill(0);
  changeScores[91] = 20;

  const result = createToolcraftMotionReviewSelection(timedInput({ changeScores }));
  const event = result.events.find(({ kind }) => kind === "change");

  assert.deepEqual(event, {
    eventId: "motion-event:change:90-91-92",
    frameIds: frameIds([90, 91, 92]),
    frameIndices: [90, 91, 92],
    kind: "change",
    peakFrameId: "source-frame:91",
    peakFrameIndex: 91,
    score: 20,
  });
  assert.deepEqual(result.reviewFrameIds, frameIds(result.reviewFrameIndices));
  assert.ok([90, 91, 92].every((index) => result.reviewFrameIndices.includes(index)));
});

test("keeps an equal local plateau with its surrounding frames and first peak", () => {
  const changeScores = Array(180).fill(1);
  changeScores.splice(70, 3, 9, 9 + 5e-10, 9);

  const result = createToolcraftMotionReviewSelection(timedInput({ changeScores }));
  const event = result.events.find(({ peakFrameIndex }) => peakFrameIndex === 70);

  assert.deepEqual(event.frameIndices, [69, 70, 71, 72, 73]);
  assert.equal(event.peakFrameIndex, 70);
  assert.equal(event.eventId, "motion-event:change:69-70-71-72-73");
  assert.deepEqual(event.frameIds, frameIds([69, 70, 71, 72, 73]));
  assert.equal(event.kind, "change");
  assert.equal(event.peakFrameId, "source-frame:70");
});

test("does not treat a tolerant plateau touching a source edge as local", () => {
  const changeScores = Array(180).fill(0);
  changeScores[0] = 9;
  changeScores[1] = 9 + 5e-10;

  const result = createToolcraftMotionReviewSelection(timedInput({ changeScores }));

  assert.deepEqual(result.events, []);
});

test("uses relative plateau tolerance without an absolute floor", () => {
  const result = createToolcraftMotionReviewSelection({
    timingMode: "ordinal",
    changeScores: [0, 5e-10, 0],
    frameCount: 3,
  });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].eventId, "motion-event:change:0-1-2");
  assert.equal(result.events[0].peakFrameIndex, 1);
});

test("retains the strongest positive plateau in each one-second bucket", () => {
  const changeScores = Array.from({ length: 180 }, (_, index) =>
    index % 2 === 0 ? 10 : 12,
  );
  changeScores[15] = 13;
  changeScores[45] = 100;

  const result = createToolcraftMotionReviewSelection(timedInput({ changeScores }));

  assert.deepEqual(
    result.events.map(({ peakFrameIndex }) => peakFrameIndex),
    [15, 45, 61, 91, 121, 151],
  );
  assert.equal(result.events.some(({ peakFrameIndex }) => peakFrameIndex === 1), false);
});

test("retains a genuine peak when finite robust arithmetic approaches overflow", () => {
  const result = createToolcraftMotionReviewSelection({
    timingMode: "ordinal",
    changeScores: [1e308, 1.7e308, 1e308, 1e308],
    frameCount: 4,
  });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].peakFrameIndex, 1);
  assert.equal(result.events[0].score, 1.7e308);
});

test("selects every decoded frame below overview rate and every ordinal item", () => {
  const timed = createToolcraftMotionReviewSelection(timedInput({
    durationSeconds: 3,
    frameCount: 30,
    frameTimes: Array.from({ length: 30 }, (_, index) => index / 10),
    nominalFrameRate: 10,
    range: { startSeconds: 0, endSeconds: 3 },
    sourceRange: { startSeconds: 0, endSeconds: 3 },
  }));
  const ordinal = createToolcraftMotionReviewSelection({
    timingMode: "ordinal",
    changeScores: [0, 3, 0, 0, 2],
    frameCount: 5,
  });

  assert.deepEqual(timed.overviewFrameIndices, Array.from({ length: 30 }, (_, i) => i));
  assert.deepEqual(ordinal.overviewFrameIndices, [0, 1, 2, 3, 4]);
  assert.deepEqual(ordinal.reviewFrameIndices, [0, 1, 2, 3, 4]);
});

test("de-duplicates sources while focus windows retain every full-rate frame", () => {
  const changeScores = Array(180).fill(0);
  changeScores[31] = 8;
  const focusWindows = [{ startSeconds: 1, endSeconds: 1.2 }];

  const result = createToolcraftMotionReviewSelection(timedInput({
    changeScores,
    focusWindows,
  }));

  assertSortedUnique(result.reviewFrameIndices);
  assert.ok([30, 31, 32, 33, 34, 35, 36].every(
    (index) => result.reviewFrameIndices.includes(index),
  ));
  assert.deepEqual(result.focusWindows, [{
    endSeconds: 1.2,
    frameIndices: [30, 31, 32, 33, 34, 35, 36],
    focusWindowId: "motion-focus-window:0",
    startSeconds: 1,
  }]);
});

test("adds a normalized cyclic seam only for an exactly complete source range", () => {
  const complete = createToolcraftMotionReviewSelection(timedInput({
    loopSeamScore: 7,
  }));
  const partial = createToolcraftMotionReviewSelection(timedInput({
    loopSeamScore: 7,
    range: { startSeconds: 0, endSeconds: 6 - 5e-10 },
    sourceRange: { startSeconds: 0, endSeconds: 6 },
  }));
  const seam = complete.events.find(({ kind }) => kind === "loop-seam");

  assert.deepEqual(seam, {
    eventId: "motion-event:loop-seam:179-0-1",
    frameIds: frameIds([179, 0, 1]),
    frameIndices: [179, 0, 1],
    kind: "loop-seam",
    peakFrameId: "source-frame:0",
    peakFrameIndex: 0,
    score: 7,
  });
  assert.equal(partial.events.some(({ kind }) => kind === "loop-seam"), false);
});

test("deduplicates a two-frame cyclic seam without sorting its source order", () => {
  const result = createToolcraftMotionReviewSelection({
    timingMode: "ordinal",
    changeScores: [0, 0],
    frameCount: 2,
    loopSeamScore: 1,
  });
  const seam = result.events.find(({ kind }) => kind === "loop-seam");

  assert.equal(seam.eventId, "motion-event:loop-seam:1-0");
  assert.deepEqual(seam.frameIndices, [1, 0]);
  assert.deepEqual(seam.frameIds, frameIds([1, 0]));
  assert.equal(seam.peakFrameId, "source-frame:0");
  assert.equal(seam.peakFrameIndex, 0);
});

test("deduplicates a one-frame cyclic seam around the source-first peak", () => {
  const result = createToolcraftMotionReviewSelection({
    timingMode: "ordinal",
    changeScores: [0],
    frameCount: 1,
    loopSeamScore: 1,
  });

  assert.deepEqual(result.events[0], {
    eventId: "motion-event:loop-seam:0",
    frameIds: ["source-frame:0"],
    frameIndices: [0],
    kind: "loop-seam",
    peakFrameId: "source-frame:0",
    peakFrameIndex: 0,
    score: 1,
  });
});

test("rejects malformed scores, timestamps, ranges, and timed focus windows", () => {
  const cases = [
    [timedInput({ changeScores: [] , frameCount: 0, frameTimes: [] }), /frame/iu],
    [timedInput({ changeScores: [0], frameCount: 2, frameTimes: [0, 1] }), /equal length/iu],
    [timedInput({ changeScores: [Number.NaN] , frameCount: 1, frameTimes: [0] }), /finite/iu],
    [timedInput({ changeScores: [-1], frameCount: 1, frameTimes: [0] }), /nonnegative/iu],
    [timedInput({ changeScores: [0, 0], frameCount: 2, frameTimes: [0, 0] }), /increasing/iu],
    [timedInput({ changeScores: [0, 0], frameCount: 2, frameTimes: [0, Infinity] }), /finite/iu],
    [timedInput({ range: { startSeconds: 2, endSeconds: 2 } }), /positive/iu],
    [timedInput({
      range: { startSeconds: -1, endSeconds: 6 },
      sourceRange: { startSeconds: 0, endSeconds: 6 },
    }), /source range/iu],
    [timedInput({ focusWindows: [{ startSeconds: 2, endSeconds: 7 }] }), /focus.*range/iu],
    [timedInput({ nominalFrameRate: 0 }), /frame rate/iu],
    [timedInput({ loopSeamScore: -1 }), /loop seam/iu],
  ];

  for (const [input, error] of cases) {
    assert.throws(() => createToolcraftMotionReviewSelection(input), error);
  }
});

test("ordinal inputs reject timing and range focus while validating cardinality", () => {
  for (const input of [
    { timingMode: "ordinal", changeScores: [], frameCount: 0 },
    { timingMode: "ordinal", changeScores: [0], frameCount: 2 },
    { timingMode: "ordinal", changeScores: [0], frameCount: 1, frameTimes: [0] },
    { timingMode: "ordinal", changeScores: [0], frameCount: 1, range: { startSeconds: 0, endSeconds: 1 } },
    { timingMode: "ordinal", changeScores: [0], frameCount: 1, focusWindows: [] },
  ]) {
    assert.throws(() => createToolcraftMotionReviewSelection(input));
  }
});

test("returns a checked error when ordinal evidence exceeds review capacity", () => {
  const result = createToolcraftMotionReviewSelection({
    timingMode: "ordinal",
    changeScores: Array(121).fill(0),
    frameCount: 121,
  });

  assert.deepEqual(result, {
    code: "ordinal-review-too-large",
    kind: "error",
    reviewFrameCount: 121,
  });
});

test("large reviews return contiguous bounded partitions without splitting groups", () => {
  const frameCount = 600;
  const changeScores = Array(frameCount).fill(0);
  changeScores.splice(300, 3, 20, 20, 20);
  const focusWindows = [{ startSeconds: 15, endSeconds: 16 }];
  const result = createToolcraftMotionReviewSelection(timedInput({
    changeScores,
    durationSeconds: 20,
    focusWindows,
    frameCount,
    frameTimes: Array.from({ length: frameCount }, (_, index) => index / 30),
    loopSeamScore: 30,
    range: { startSeconds: 0, endSeconds: 20 },
    sourceRange: { startSeconds: 0, endSeconds: 20 },
  }));

  assert.equal(result.kind, "partition-plan");
  assert.ok(result.reviewFrameCount > TOOLCRAFT_MOTION_MAX_REVIEW_FRAMES);
  assert.equal(result.partitions[0].startSeconds, 0);
  assert.equal(result.partitions.at(-1).endSeconds, 20);
  result.partitions.forEach((partition, index) => {
    assert.deepEqual(Object.keys(partition).toSorted(), [
      "endSeconds",
      "eventIds",
      "index",
      "reviewFrameIndices",
      "startSeconds",
    ]);
    assert.equal(partition.index, index);
    assert.ok(partition.startSeconds < partition.endSeconds);
    assert.ok(partition.reviewFrameIndices.length <= TOOLCRAFT_MOTION_MAX_REVIEW_FRAMES);
    assertSortedUnique(partition.reviewFrameIndices);
    if (index > 0) {
      assert.equal(partition.startSeconds, result.partitions[index - 1].endSeconds);
    }
  });
  const partitionReviewIndices = result.partitions.flatMap(
    ({ reviewFrameIndices }) => reviewFrameIndices,
  );
  assert.equal(result.overviewFrameIndices.length, 241);
  assert.deepEqual(result.overviewFrameIds,
    frameIds(result.overviewFrameIndices));
  assert.ok(result.overviewFrameIndices.every((index) =>
    partitionReviewIndices.includes(index)));
  assert.equal(partitionReviewIndices.length, result.reviewFrameCount);
  assert.deepEqual(
    [...partitionReviewIndices].toSorted((left, right) => left - right),
    [...new Set(partitionReviewIndices)].toSorted((left, right) => left - right),
  );
  assert.deepEqual(result.events.map(({ eventId }) => eventId), [
    "motion-event:loop-seam:599-0-1",
    "motion-event:change:299-300-301-302-303",
  ]);
  assert.deepEqual(
    result.partitions.flatMap(({ eventIds }) => eventIds),
    result.events.map(({ eventId }) => eventId),
  );
  assert.ok(result.partitions[0].eventIds.includes("motion-event:loop-seam:599-0-1"));
  assert.equal(result.partitions.slice(1).some(({ reviewFrameIndices }) =>
    reviewFrameIndices.includes(599)), false);
  assert.equal(result.focusWindows.length, 1);
});

test("returns a checked error when one focus window exceeds capacity", () => {
  const result = createToolcraftMotionReviewSelection(timedInput({
    durationSeconds: 10,
    focusWindows: [{ startSeconds: 1, endSeconds: 8 }],
    frameCount: 300,
    frameTimes: Array.from({ length: 300 }, (_, index) => index / 30),
    range: { startSeconds: 0, endSeconds: 10 },
    sourceRange: { startSeconds: 0, endSeconds: 10 },
  }));

  assert.equal(result.kind, "error");
  assert.equal(result.code, "focus-window-too-large");
  assert.ok(result.reviewFrameCount > TOOLCRAFT_MOTION_MAX_REVIEW_FRAMES);
});

test("returns a checked error for overlapping focus time with disjoint sparse frames", () => {
  const frameTimes = [
    ...Array.from({ length: 60 }, (_, index) => index / 10),
    ...Array.from({ length: 61 }, (_, index) => 9 + index / 10),
  ];
  const result = createToolcraftMotionReviewSelection(timedInput({
    durationSeconds: 16.1,
    focusWindows: [
      { startSeconds: 0, endSeconds: 8 },
      { startSeconds: 7, endSeconds: 16.1 },
    ],
    frameCount: 121,
    frameTimes,
    range: { startSeconds: 0, endSeconds: 16.1 },
    sourceRange: { startSeconds: 0, endSeconds: 16.1 },
  }));

  assert.deepEqual(result, {
    code: "focus-window-too-large",
    kind: "error",
    reviewFrameCount: 121,
  });
});

test("partition assignments preserve whole events and focus windows", () => {
  const frameCount = 450;
  const changeScores = Array(frameCount).fill(0);
  changeScores.splice(118, 4, 11, 11, 11, 11);
  const frameTimes = Array.from({ length: frameCount }, (_, index) => index / 30);
  const focusWindows = [{ startSeconds: 7.9, endSeconds: 9.1 }];
  const result = createToolcraftMotionReviewSelection(timedInput({
    changeScores,
    durationSeconds: 15,
    focusWindows,
    frameCount,
    frameTimes,
    range: { startSeconds: 0, endSeconds: 15 },
    sourceRange: { startSeconds: 0, endSeconds: 15 },
  }));

  for (const event of result.events) {
    const containing = result.partitions.filter(({ reviewFrameIndices }) =>
      event.frameIndices.every((index) => reviewFrameIndices.includes(index)),
    );
    assert.equal(containing.length, 1);
    assert.ok(containing[0].eventIds.includes(event.eventId));
  }
  const focusPartition = result.partitions.find(({ reviewFrameIndices }) =>
    result.focusWindows[0].frameIndices.every((index) => reviewFrameIndices.includes(index)),
  );
  assert.ok(focusPartition);
  assert.deepEqual(result.events.map(({ eventId }) => eventId), [
    "motion-event:change:117-118-119-120-121-122",
  ]);
});

test("reserves unique seam membership in partition zero before choosing gaps", () => {
  const frameTimes = [
    ...Array.from({ length: 120 }, (_, index) => index / 100),
    10,
  ];
  const result = createToolcraftMotionReviewSelection(timedInput({
    durationSeconds: 10,
    frameCount: 121,
    frameTimes,
    loopSeamScore: 1,
    range: { startSeconds: 0, endSeconds: 10 },
    sourceRange: { startSeconds: 0, endSeconds: 10 },
  }));

  assert.equal(result.kind, "partition-plan");
  assert.ok(result.partitions[0].reviewFrameIndices.length <= 120);
  assert.ok([0, 1, 120].every((index) =>
    result.partitions[0].reviewFrameIndices.includes(index)));
  assert.ok(result.partitions[0].eventIds.includes("motion-event:loop-seam:120-0-1"));
  assert.ok(result.partitions.slice(1).every(({ eventIds, reviewFrameIndices }) =>
    eventIds.length === 0 && !reviewFrameIndices.includes(120)));
  assert.ok(result.partitions[0].endSeconds <
    (frameTimes[119] + frameTimes[120]) / 2);
  assert.deepEqual(
    result.partitions.flatMap(({ reviewFrameIndices }) => reviewFrameIndices)
      .toSorted((left, right) => left - right),
    Array.from({ length: 121 }, (_, index) => index),
  );
});

test("prefers a strictly larger microscopic gap before whole-second ties", () => {
  const frameTimes = Array.from({ length: 119 }, (_, index) => index * 1e-6);
  frameTimes.push(frameTimes[118] + 1e-10, frameTimes[118] + 3e-10);
  const event = {
    eventId: "motion-event:change:protected",
    frameIndices: Array.from({ length: 119 }, (_, index) => index),
    kind: "change",
  };
  const result = createToolcraftMotionReviewPartitionPlan({
    events: [event],
    focusWindows: [],
    frameTimes,
    range: { startSeconds: 0, endSeconds: frameTimes.at(-1) + 1e-10 },
    reserveSeam: false,
    reviewFrameIndices: Array.from({ length: 121 }, (_, index) => index),
  });

  assert.equal(
    result.partitions[0].endSeconds,
    (frameTimes[119] + frameTimes[120]) / 2,
  );
  assert.deepEqual(
    result.partitions.map(({ reviewFrameIndices }) => reviewFrameIndices.length),
    [120, 1],
  );
});
