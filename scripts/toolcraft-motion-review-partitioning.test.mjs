import assert from "node:assert/strict";
import test from "node:test";

import { createToolcraftMotionReviewPartitionPlan } from "./toolcraft-motion-review-partitioning.mjs";

const indices = (start, end) =>
  Array.from({ length: end - start + 1 }, (_, offset) => start + offset);

function plannerInput(overrides = {}) {
  return {
    events: [],
    focusWindows: [],
    frameTimes: Array.from({ length: 121 }, (_, index) => index / 10),
    range: { startSeconds: 0, endSeconds: 12.1 },
    reserveSeam: false,
    reviewFrameIndices: indices(0, 120),
    ...overrides,
  };
}

function changeEvent(eventId, frameIndices) {
  return { eventId, frameIndices, kind: "change" };
}

function focusWindow(focusWindowId, frameIndices) {
  return {
    endSeconds: frameIndices.at(-1) / 10,
    focusWindowId,
    frameIndices,
    startSeconds: frameIndices[0] / 10,
  };
}

test("rejects malformed normalized planner inputs before planning", () => {
  const cases = [
    [(value) => value.frameTimes[2] = Infinity, /frame times.*finite/iu],
    [(value) => value.frameTimes[2] = value.frameTimes[1], /frame times.*increasing/iu],
    [(value) => value.range.endSeconds = value.range.startSeconds, /range.*increasing/iu],
    [(value) => value.reserveSeam = "yes", /reserve seam.*boolean/iu],
    [(value) => value.reviewFrameIndices = [0, 0], /review frame indices.*sorted unique/iu],
    [(value) => value.reviewFrameIndices = [0, 121], /review frame indices.*bounds/iu],
    [(value) => value.events = [
      changeEvent("duplicate", [0]),
      changeEvent("duplicate", [1]),
    ], /event ids.*unique/iu],
    [(value) => value.events = [{
      eventId: "unsupported",
      frameIndices: [0],
      kind: "flash",
    }], /event kind/iu],
    [(value) => value.events = [changeEvent("unsorted", [1, 0])], /event.*sorted unique/iu],
    [(value) => {
      value.events = [{
        eventId: "seam:ascending",
        frameIndices: [0, 1, 120],
        kind: "loop-seam",
      }];
      value.reserveSeam = true;
    }, /loop seam.*exact cyclic/iu],
    [(value) => {
      value.frameTimes = [0, 1, 2];
      value.range = { startSeconds: 0, endSeconds: 3 };
      value.reviewFrameIndices = [0, 1];
      value.events = [{
        eventId: "seam",
        frameIndices: [2, 0, 1],
        kind: "loop-seam",
      }];
      value.reserveSeam = true;
    }, /event.*closed.*review/iu],
    [(value) => value.focusWindows = [{
      endSeconds: 1,
      frameIndices: [0, 1],
      startSeconds: 0,
    }], /focus window id/iu],
    [(value) => value.focusWindows = [{
      endSeconds: 1,
      focusWindowId: "focus:bad-range",
      frameIndices: [0, 1],
      startSeconds: 1,
    }], /focus window.*range/iu],
    [(value) => value.focusWindows = [{
      endSeconds: 1,
      focusWindowId: "focus:unsorted",
      frameIndices: [1, 0],
      startSeconds: 0,
    }], /focus window.*sorted unique/iu],
    [(value) => {
      value.reviewFrameIndices = [0, 1];
      value.focusWindows = [{
        endSeconds: 0.2,
        focusWindowId: "focus:not-closed",
        frameIndices: [2],
        startSeconds: 0.1,
      }];
    }, /focus window.*closed.*review/iu],
    [(value) => {
      value.events = [
        { eventId: "seam:one", frameIndices: [120, 0, 1], kind: "loop-seam" },
        { eventId: "seam:two", frameIndices: [120, 0, 1], kind: "loop-seam" },
      ];
      value.reserveSeam = true;
    }, /at most one.*seam/iu],
    [(value) => value.events = [
      { eventId: "seam:unreserved", frameIndices: [120, 0, 1], kind: "loop-seam" },
    ], /loop seam.*reserve seam/iu],
  ];

  for (const [mutate, error] of cases) {
    const input = structuredClone(plannerInput());
    mutate(input);
    assert.throws(
      () => createToolcraftMotionReviewPartitionPlan(input),
      error,
    );
  }
});

test("returns checked errors for oversized connected protected units", () => {
  const eventOnly = createToolcraftMotionReviewPartitionPlan(plannerInput({
    events: [changeEvent("event:oversized", indices(0, 120))],
  }));
  const eventAndFocus = createToolcraftMotionReviewPartitionPlan(plannerInput({
    events: [changeEvent("event:connected", indices(0, 60))],
    focusWindows: [focusWindow("focus:connected", indices(60, 120))],
  }));
  const focusOnly = createToolcraftMotionReviewPartitionPlan(plannerInput({
    focusWindows: [
      focusWindow("focus:first", indices(0, 60)),
      focusWindow("focus:second", indices(60, 120)),
    ],
  }));

  assert.deepEqual(eventOnly, {
    code: "event-window-too-large",
    kind: "error",
    reviewFrameCount: 121,
  });
  assert.deepEqual(eventAndFocus, {
    code: "event-window-too-large",
    kind: "error",
    reviewFrameCount: 121,
  });
  assert.deepEqual(focusOnly, {
    code: "focus-window-too-large",
    kind: "error",
    reviewFrameCount: 121,
  });
});

test("merges overlapping time protection with disjoint indices independent of order", () => {
  const frameTimes = [
    ...Array.from({ length: 60 }, (_, index) => index / 10),
    ...Array.from({ length: 61 }, (_, index) => 9 + index / 10),
  ];
  const focusA = {
    endSeconds: 8,
    focusWindowId: "focus:a",
    frameIndices: indices(0, 59),
    startSeconds: 0,
  };
  const focusB = {
    endSeconds: 16.1,
    focusWindowId: "focus:b",
    frameIndices: indices(60, 120),
    startSeconds: 7,
  };
  const expected = {
    code: "focus-window-too-large",
    kind: "error",
    reviewFrameCount: 121,
  };

  for (const focusWindows of [[focusA, focusB], [focusB, focusA]]) {
    assert.deepEqual(createToolcraftMotionReviewPartitionPlan(plannerInput({
      focusWindows,
      frameTimes,
      range: { startSeconds: 0, endSeconds: 16.1 },
    })), expected);
  }
});

test("keeps touching protected intervals separate at their exact legal boundary", () => {
  const frameTimes = [
    ...Array.from({ length: 60 }, (_, index) => index / 10),
    ...Array.from({ length: 61 }, (_, index) => 6.1 + index / 10),
  ];
  const focusA = {
    endSeconds: 6,
    focusWindowId: "focus:left",
    frameIndices: indices(0, 59),
    startSeconds: 0,
  };
  const focusB = {
    endSeconds: 12.2,
    focusWindowId: "focus:right",
    frameIndices: indices(60, 120),
    startSeconds: 6,
  };

  for (const focusWindows of [[focusA, focusB], [focusB, focusA]]) {
    const result = createToolcraftMotionReviewPartitionPlan(plannerInput({
      focusWindows,
      frameTimes,
      range: { startSeconds: 0, endSeconds: 12.2 },
    }));
    assert.equal(result.kind, "partition-plan");
    assert.deepEqual(result.partitions.map(({ endSeconds }) => endSeconds), [6, 12.2]);
    assert.deepEqual(
      result.partitions.map(({ reviewFrameIndices }) => reviewFrameIndices.length),
      [60, 61],
    );
  }
});

test("returns a checked error when no boundary can separate valid protected units", () => {
  const frameTimes = [
    ...Array.from({ length: 60 }, (_, index) => index / 10),
    ...Array.from({ length: 61 }, (_, index) => 100 + index / 10),
  ];
  const result = createToolcraftMotionReviewPartitionPlan(plannerInput({
    focusWindows: [
      { endSeconds: 8, focusWindowId: "focus:left", frameIndices: indices(0, 59), startSeconds: 0 },
      { endSeconds: 107, focusWindowId: "focus:right", frameIndices: indices(60, 120), startSeconds: 9 },
    ],
    frameTimes,
    range: { startSeconds: 0, endSeconds: 107 },
  }));

  assert.deepEqual(result, {
    code: "protected-unit-too-large",
    kind: "error",
    reviewFrameCount: 121,
  });
});

test("large finite timestamps produce finite strictly ordered partition ranges", () => {
  const base = 1e308;
  const step = 1e294;
  const frameTimes = Array.from({ length: 241 }, (_, index) =>
    base + index * step);
  const range = {
    endSeconds: frameTimes.at(-1) + step,
    startSeconds: base - step,
  };

  const result = createToolcraftMotionReviewPartitionPlan({
    events: [],
    focusWindows: [],
    frameTimes,
    range,
    reserveSeam: false,
    reviewFrameIndices: indices(0, 240),
  });

  assert.equal(result.kind, "partition-plan");
  result.partitions.forEach((partition, index) => {
    assert.ok(Number.isFinite(partition.startSeconds));
    assert.ok(Number.isFinite(partition.endSeconds));
    assert.ok(partition.startSeconds < partition.endSeconds);
    if (index > 0) {
      assert.equal(partition.startSeconds, result.partitions[index - 1].endSeconds);
    }
  });
});

test("creates one partition when seam reservation owns every reviewed frame", () => {
  const result = createToolcraftMotionReviewPartitionPlan({
    events: [{
      eventId: "seam:all-reviewed",
      frameIndices: [2, 0, 1],
      kind: "loop-seam",
    }],
    focusWindows: [],
    frameTimes: [0, 1, 2],
    range: { startSeconds: 0, endSeconds: 3 },
    reserveSeam: true,
    reviewFrameIndices: [0, 1, 2],
  });

  assert.equal(result.kind, "partition-plan");
  assert.deepEqual(result.events[0].frameIndices, [2, 0, 1]);
  assert.deepEqual(result.partitions[0].reviewFrameIndices, [0, 1, 2]);
  assert.deepEqual(result.partitions[0].eventIds, ["seam:all-reviewed"]);
});

test("handles an overflowing mathematical gap between finite timestamps", () => {
  const frameTimes = [
    ...Array.from({ length: 60 }, (_, index) => -1.1e308 + index * 1e294),
    ...Array.from({ length: 61 }, (_, index) => 1.1e308 + index * 1e294),
  ];
  const result = createToolcraftMotionReviewPartitionPlan({
    events: [],
    focusWindows: [],
    frameTimes,
    range: {
      endSeconds: Number.MAX_VALUE,
      startSeconds: -Number.MAX_VALUE,
    },
    reserveSeam: false,
    reviewFrameIndices: indices(0, 120),
  });

  assert.equal(result.kind, "partition-plan");
  assert.ok(result.partitions.every(({ endSeconds, startSeconds }) =>
    Number.isFinite(startSeconds) && Number.isFinite(endSeconds)));
});

test("an empty-index focus unit protects its timestamp range from cuts", () => {
  const frameTimes = Array.from({ length: 119 }, (_, index) => index * 1e-6);
  frameTimes.push(frameTimes[118] + 1e-10, frameTimes[118] + 3e-10);
  const smallerBoundary = (frameTimes[118] + frameTimes[119]) / 2;
  const result = createToolcraftMotionReviewPartitionPlan({
    events: [changeEvent("event:protect-prefix", indices(0, 118))],
    focusWindows: [{
      endSeconds: frameTimes[119] + 1.5e-10,
      focusWindowId: "focus:empty-gap",
      frameIndices: [],
      startSeconds: frameTimes[119] + 0.5e-10,
    }],
    frameTimes,
    range: { startSeconds: 0, endSeconds: frameTimes.at(-1) + 1e-10 },
    reserveSeam: false,
    reviewFrameIndices: indices(0, 120),
  });

  assert.equal(result.kind, "partition-plan");
  assert.equal(result.partitions[0].endSeconds, smallerBoundary);
});
