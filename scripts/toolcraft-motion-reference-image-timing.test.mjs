import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  applyToolcraftMotionDeclaredImageTiming,
} from "./toolcraft-motion-reference-image-timing.mjs";

function intrinsic(count = 3) {
  return {
    decodedFrameCount: count,
    sourceKind: "frame-sequence",
    timingMode: "ordinal",
  };
}

test("applies declared FPS once to an intrinsic ordinal image source", async () => {
  const result = await applyToolcraftMotionDeclaredImageTiming(intrinsic(), {
    framesPerSecond: 2,
  });
  assert.deepEqual(result, {
    decodedFrameCount: 3,
    durationSeconds: 1.5,
    frameTimes: [0, 0.5, 1],
    nominalFrameRate: 2,
    sourceKind: "frame-sequence",
    timing: {
      authority: "declared-fps",
      frameTimes: [0, 0.5, 1],
      framesPerSecond: 2,
    },
    timingMode: "seconds",
  });
});

test("normalizes raw declared timestamps once while hashing their exact bytes", async () => {
  const raw = Buffer.from("[10,11,13]\n");
  const result = await applyToolcraftMotionDeclaredImageTiming(intrinsic(), {
    timestampsFile: "/refs/timestamps.json",
  }, { readFile: async () => raw });
  assert.deepEqual(result.frameTimes, [0, 1, 3]);
  assert.equal(result.durationSeconds, 5);
  assert.deepEqual(result.timing, {
    authority: "declared-timestamps",
    frameTimes: [0, 1, 3],
    timestampsSha256: createHash("sha256").update(raw).digest("hex"),
  });
});

test("rejects a one-frame timestamp authority but still permits explicit FPS", async () => {
  const raw = Buffer.from("[10]\n");
  await assert.rejects(() => applyToolcraftMotionDeclaredImageTiming(intrinsic(1), {
    timestampsFile: "/refs/timestamps.json",
  }, { readFile: async () => raw }),
  /at least two.*timestamps.*duration|timestamps.*at least two.*duration/iu);

  const fpsResult = await applyToolcraftMotionDeclaredImageTiming(intrinsic(1), {
    framesPerSecond: 24,
  });
  assert.equal(fpsResult.durationSeconds, 1 / 24);
  assert.deepEqual(fpsResult.frameTimes, [0]);
});

test("returns the intrinsic ordinal source unchanged when timing is not declared",
  async () => {
    const source = intrinsic();
    assert.equal(await applyToolcraftMotionDeclaredImageTiming(source, {}), source);
  });

test("rejects divergent or malformed declared image timing at the canonical boundary",
  async () => {
    await assert.rejects(() => applyToolcraftMotionDeclaredImageTiming({
      ...intrinsic(), frameTimes: [0, 1], timingMode: "seconds",
    }, { framesPerSecond: 2 }), /intrinsic.*ordinal/iu);
    for (const raw of ["[0,null,1]", "[0,0,1]", "[0,1]"]) {
      await assert.rejects(() => applyToolcraftMotionDeclaredImageTiming(intrinsic(), {
        timestampsFile: "/refs/timestamps.json",
      }, { readFile: async () => Buffer.from(raw) }),
      /timestamps.*finite|strictly increasing|count/iu);
    }
  });
