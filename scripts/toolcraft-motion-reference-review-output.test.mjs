import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolcraftMotionReviewOutputPath,
  createToolcraftMotionReviewOutputPattern,
  validateToolcraftMotionReviewFrameIndices,
} from "./toolcraft-motion-reference-review-output.mjs";

test("validates strictly ordered unique in-range review indices", () => {
  assert.doesNotThrow(() => validateToolcraftMotionReviewFrameIndices([0, 2], 3));
  for (const indices of [[], [0, 0], [2, 1], [-1], [3], [0.5]]) {
    assert.throws(() => validateToolcraftMotionReviewFrameIndices(indices, 3),
      /review frame indices|at least one/iu);
  }
});

test("creates deterministic ordinal PNG patterns and paths", () => {
  assert.equal(createToolcraftMotionReviewOutputPattern("/tmp/review"),
    "/tmp/review/review-%06d.png");
  assert.equal(createToolcraftMotionReviewOutputPath("/tmp/review", 0),
    "/tmp/review/review-000000.png");
  assert.equal(createToolcraftMotionReviewOutputPath("/tmp/review", 12),
    "/tmp/review/review-000012.png");
  assert.throws(() => createToolcraftMotionReviewOutputPattern(""),
    /output directory/iu);
  assert.throws(() => createToolcraftMotionReviewOutputPath("/tmp", -1),
    /ordinal/iu);
});
