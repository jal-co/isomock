import assert from "node:assert/strict";
import test from "node:test";

import {
  toolcraftMotionAbsoluteDifference,
  toolcraftMotionMedian,
  toolcraftMotionNearlyEqual,
  toolcraftMotionRobustThreshold,
  toolcraftMotionSafeAdd,
  toolcraftMotionSafeMidpoint,
  toolcraftMotionSafeMultiply,
} from "./toolcraft-motion-review-numeric.mjs";

test("uses pure relative equality with exact zero handling", () => {
  assert.equal(toolcraftMotionNearlyEqual(0, 0), true);
  assert.equal(toolcraftMotionNearlyEqual(0, 5e-10), false);
  assert.equal(toolcraftMotionNearlyEqual(5, 5 + 5e-10), true);
});

test("keeps finite midpoint and median arithmetic near Number.MAX_VALUE", () => {
  assert.equal(
    toolcraftMotionSafeMidpoint(Number.MAX_VALUE, Number.MAX_VALUE),
    Number.MAX_VALUE,
  );
  assert.equal(
    toolcraftMotionMedian([Number.MAX_VALUE, Number.MAX_VALUE]),
    Number.MAX_VALUE,
  );
});

test("preserves the smallest positive finite midpoint and median", () => {
  assert.equal(
    toolcraftMotionSafeMidpoint(Number.MIN_VALUE, Number.MIN_VALUE),
    Number.MIN_VALUE,
  );
  assert.equal(
    toolcraftMotionMedian([Number.MIN_VALUE, Number.MIN_VALUE]),
    Number.MIN_VALUE,
  );
});

test("saturates only overflowing finite arithmetic", () => {
  assert.equal(toolcraftMotionAbsoluteDifference(7, 2), 5);
  assert.equal(toolcraftMotionSafeAdd(2, 3), 5);
  assert.equal(toolcraftMotionSafeMultiply(2, 3), 6);
  assert.equal(
    toolcraftMotionAbsoluteDifference(Number.MAX_VALUE, -Number.MAX_VALUE),
    Number.MAX_VALUE,
  );
  assert.equal(
    toolcraftMotionSafeAdd(Number.MAX_VALUE, Number.MAX_VALUE),
    Number.MAX_VALUE,
  );
  assert.equal(
    toolcraftMotionSafeMultiply(Number.MAX_VALUE, 3),
    Number.MAX_VALUE,
  );
});

test("computes a finite robust threshold for large finite scores", () => {
  assert.equal(
    toolcraftMotionRobustThreshold([1e308, 1.7e308, 1e308, 1e308]),
    1e308,
  );
});
