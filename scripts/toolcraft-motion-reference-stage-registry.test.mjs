import assert from "node:assert/strict";
import test from "node:test";

import {
  TOOLCRAFT_MOTION_REFERENCE_STAGES,
} from "./toolcraft-motion-reference-stage-registry.mjs";
import {
  createToolcraftMotionStageError,
  formatToolcraftMotionReferenceError,
} from "./toolcraft-motion-reference-stage.mjs";

const expectedStages = [
  "binary-detection",
  "contact-sheet",
  "image-inspect",
  "image-loop-seam",
  "image-materialize",
  "image-scan",
  "media-inspect",
  "media-loop-seam",
  "media-materialize",
  "media-scan",
  "source-hash",
];

test("the canonical registry exhaustively owns every bounded corrective action", () => {
  assert.deepEqual(Object.values(TOOLCRAFT_MOTION_REFERENCE_STAGES)
    .map(({ name }) => name).sort(), expectedStages);
  for (const descriptor of Object.values(TOOLCRAFT_MOTION_REFERENCE_STAGES)) {
    assert.match(descriptor.action, /^[A-Z][^.]+\.$/u);
    assert.ok(descriptor.action.length <= 120);
    assert.equal(Object.isFrozen(descriptor), true);
  }
  assert.equal(Object.isFrozen(TOOLCRAFT_MOTION_REFERENCE_STAGES), true);
});

test("every registered public stage error includes its correction and redacts its cause",
  () => {
    const secret = "/Users/private/reference.mov";
    for (const descriptor of Object.values(TOOLCRAFT_MOTION_REFERENCE_STAGES)) {
      const cause = new Error(`captured stderr says ${secret}`);
      const error = createToolcraftMotionStageError(descriptor, cause);
      const message = formatToolcraftMotionReferenceError(error);
      assert.match(message, new RegExp(descriptor.name, "u"));
      assert.equal(message.includes(descriptor.action), true);
      assert.equal(message.includes("captured stderr"), false);
      assert.equal(message.includes(secret), false);
      assert.equal(error.cause, cause);
    }
  });

test("generic public preprocessing errors never expose raw messages or source paths", () => {
  const message = formatToolcraftMotionReferenceError(
    new Error("decoder stderr /Users/private/reference.mov"),
  );
  assert.match(message, /preprocessing failed/iu);
  assert.equal(message.includes("decoder stderr"), false);
  assert.equal(message.includes("/Users/private"), false);
});
