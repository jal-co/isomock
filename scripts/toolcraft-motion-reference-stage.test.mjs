import assert from "node:assert/strict";
import test from "node:test";

import {
  parseToolcraftMotionStage,
  runToolcraftMotionStage,
  ToolcraftMotionReferenceStageError,
} from "./toolcraft-motion-reference-stage.mjs";
import {
  TOOLCRAFT_MOTION_REFERENCE_STAGES,
} from "./toolcraft-motion-reference-stage-registry.mjs";

test("runs a successful injected process request unchanged", async () => {
  const request = {
    args: ["-version"], binary: "ffmpeg",
    stage: TOOLCRAFT_MOTION_REFERENCE_STAGES.mediaInspect,
  };
  const result = { stdout: "ffmpeg version 8.0" };
  const calls = [];

  assert.equal(await runToolcraftMotionStage(async (received) => {
    calls.push(received);
    return result;
  }, request), result);
  assert.deepEqual(calls, [{ ...request, stage: "media-inspect" }]);
});

test("normalizes thrown and nonzero process failures with stage and cause", async () => {
  const thrown = new Error("opaque thrown failure");
  await assert.rejects(() => runToolcraftMotionStage(async () => {
    throw thrown;
  }, { args: [], binary: "ffmpeg",
    stage: TOOLCRAFT_MOTION_REFERENCE_STAGES.mediaScan }),
  (error) => error instanceof ToolcraftMotionReferenceStageError &&
    error.stage === "media-scan" && error.cause === thrown);

  const returned = new Error("opaque returned failure");
  await assert.rejects(() => runToolcraftMotionStage(async () => ({
    error: returned, exitCode: 7,
  }), { args: [], binary: "ffprobe",
    stage: TOOLCRAFT_MOTION_REFERENCE_STAGES.mediaInspect }),
  (error) => error instanceof ToolcraftMotionReferenceStageError &&
    error.stage === "media-inspect" && error.cause === returned);
});

test("normalizes parser failures without double-wrapping stage errors", () => {
  const cause = new TypeError("invalid records");
  assert.throws(() => parseToolcraftMotionStage(
    TOOLCRAFT_MOTION_REFERENCE_STAGES.mediaScan, () => {
    throw cause;
  }), (error) => error instanceof ToolcraftMotionReferenceStageError &&
    error.stage === "media-scan" && error.cause === cause);

  const existing = new ToolcraftMotionReferenceStageError(
    TOOLCRAFT_MOTION_REFERENCE_STAGES.mediaScan, "existing", cause,
  );
  assert.throws(() => parseToolcraftMotionStage(
    TOOLCRAFT_MOTION_REFERENCE_STAGES.mediaScan, () => {
    throw existing;
  }), (error) => error === existing);
});
