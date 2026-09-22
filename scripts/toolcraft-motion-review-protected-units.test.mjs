import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolcraftMotionProtectedUnitModel,
  toolcraftMotionProtectedCapacityError,
} from "./toolcraft-motion-review-protected-units.mjs";

const indices = (start, end) =>
  Array.from({ length: end - start + 1 }, (_, offset) => start + offset);

function sparseFixture() {
  const frameTimes = [
    ...Array.from({ length: 60 }, (_, index) => index / 10),
    ...Array.from({ length: 61 }, (_, index) => 9 + index / 10),
  ];
  return {
    focusA: {
      endSeconds: 8,
      focusWindowId: "focus:a",
      frameIndices: indices(0, 59),
      startSeconds: 0,
    },
    focusB: {
      endSeconds: 16.1,
      focusWindowId: "focus:b",
      frameIndices: indices(60, 120),
      startSeconds: 7,
    },
    frameTimes,
    reviewFrameIndices: indices(0, 120),
  };
}

test("merges disjoint indices with inseparable overlapping time independent of order", () => {
  const { focusA, focusB, frameTimes, reviewFrameIndices } = sparseFixture();
  const models = [[focusA, focusB], [focusB, focusA]].map((focusWindows) =>
    createToolcraftMotionProtectedUnitModel({
      events: [],
      focusWindows,
      frameTimes,
      reviewFrameIndices,
    }));

  assert.deepEqual(models[0], models[1]);
  assert.equal(models[0].units.length, 1);
  assert.deepEqual(models[0].units[0].indices, reviewFrameIndices);
  assert.deepEqual(
    toolcraftMotionProtectedCapacityError(models[0].units, 120, 121),
    { code: "focus-window-too-large", kind: "error", reviewFrameCount: 121 },
  );
});

test("keeps touching intervals separate when an exact candidate can split them", () => {
  const frameTimes = [
    ...Array.from({ length: 60 }, (_, index) => index / 10),
    ...Array.from({ length: 61 }, (_, index) => 6.1 + index / 10),
  ];
  const model = createToolcraftMotionProtectedUnitModel({
    events: [],
    focusWindows: [
      { endSeconds: 6, focusWindowId: "focus:left", frameIndices: indices(0, 59), startSeconds: 0 },
      { endSeconds: 12.2, focusWindowId: "focus:right", frameIndices: indices(60, 120), startSeconds: 6 },
    ],
    frameTimes,
    reviewFrameIndices: indices(0, 120),
  });

  assert.equal(model.units.length, 2);
  assert.deepEqual(model.units.map(({ indices: values }) => values.length), [60, 61]);
});

test("merges touching intervals when no exact candidate can split them", () => {
  const frameTimes = [
    ...Array.from({ length: 60 }, (_, index) => index / 10),
    ...Array.from({ length: 61 }, (_, index) => 6.2 + index / 10),
  ];
  const model = createToolcraftMotionProtectedUnitModel({
    events: [],
    focusWindows: [
      { endSeconds: 6, focusWindowId: "focus:left", frameIndices: indices(0, 59), startSeconds: 0 },
      { endSeconds: 12.2, focusWindowId: "focus:right", frameIndices: indices(60, 120), startSeconds: 6 },
    ],
    frameTimes,
    reviewFrameIndices: indices(0, 120),
  });

  assert.equal(model.units.length, 1);
  assert.deepEqual(model.units[0].indices, indices(0, 120));
});

test("derives event time protection and preserves event capacity priority", () => {
  const frameTimes = Array.from({ length: 121 }, (_, index) => index / 10);
  const model = createToolcraftMotionProtectedUnitModel({
    events: [{ eventId: "event:a", frameIndices: indices(0, 59), kind: "change" }],
    focusWindows: [{
      endSeconds: 12.1,
      focusWindowId: "focus:a",
      frameIndices: indices(60, 120),
      startSeconds: 5,
    }],
    frameTimes,
    reviewFrameIndices: indices(0, 120),
  });

  assert.equal(model.units.length, 1);
  assert.deepEqual(
    toolcraftMotionProtectedCapacityError(model.units, 120, 121),
    { code: "event-window-too-large", kind: "error", reviewFrameCount: 121 },
  );
});
