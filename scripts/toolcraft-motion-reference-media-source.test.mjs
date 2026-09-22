import assert from "node:assert/strict";
import test from "node:test";

import {
  inspect,
  materializeReviewedFrames,
  scan,
} from "./toolcraft-motion-reference-media-source.mjs";

function probeOutput({
  frameTimes = [0, 0.04, 0.08],
  pixelFormat = "yuva444p",
} = {}) {
  const alpha = pixelFormat === "yuva444p" || pixelFormat === "ayuv64le" ||
    pixelFormat === "vuya";
  return JSON.stringify({
    format: { duration: "0.120000" },
    frames: frameTimes.map((time) => ({ best_effort_timestamp_time: String(time) })),
    pixel_formats: [{
      components: Array.from({ length: alpha ? 4 : 3 }, (_, index) => ({
        bit_depth: pixelFormat.includes("10") ? 10 : 8, index: index + 1,
      })),
      flags: { alpha: alpha ? 1 : 0 },
      name: pixelFormat,
      nb_components: alpha ? 4 : 3,
    }],
    program_version: { version: "8.0.1-2 build text" },
    streams: [{
      codec_type: "video",
      duration: "0.120000",
      height: 360,
      nb_frames: String(frameTimes.length),
      pix_fmt: pixelFormat,
      r_frame_rate: "25/1",
      width: 640,
    }],
  });
}
function record(frame, time, { alpha, channel = "color", u = 0, v = 0, y = 0 } = {}) {
  return [
    `frame:${frame} pts:${frame} pts_time:${time}`,
    `toolcraft.channel=${channel}`,
    `lavfi.signalstats.YDIF=${alpha ?? y}`,
    ...(channel === "alpha" ? [] : [
      `lavfi.signalstats.UDIF=${u}`,
      `lavfi.signalstats.VDIF=${v}`,
    ]),
  ].join("\n");
}
function stats(records, { alpha = true } = {}) {
  return records.flatMap(({ frame, time, ...components }) => [
    record(frame, time, components),
    ...(alpha ? [record(frame, time, {
      alpha: components.alpha ?? 0, channel: "alpha",
    })] : []),
  ]).join("\n");
}
function fakeExecutor(responses) {
  const calls = [];
  return {
    calls,
    execute: async (request) => {
      calls.push(request);
      const response = responses[request.stage];
      if (response instanceof Error) throw response;
      return typeof response === "function" ? response(request) : response;
    },
  };
}
async function inspectedFixture(overrides = {}) {
  const executor = fakeExecutor({
    "media-inspect": ({ binary }) => ({
      stdout: binary === "ffprobe" ? probeOutput(overrides) :
        "ffmpeg version 8.0.1-2 Copyright ignored",
    }),
  });
  const inspection = await inspect({
    execute: executor.execute,
    sourceKind: "video",
    inputPath: "/refs/reference.mov",
  });
  return { executor, inspection };
}

test("inspects video, GIF, and screen-recording sources through explicit kinds", async () => {
  for (const sourceKind of ["video", "gif", "screen-recording"]) {
    const executor = fakeExecutor({
      "media-inspect": ({ binary }) => ({
        stdout: binary === "ffprobe" ? probeOutput() :
          "ffmpeg version 8.0.1-2 Copyright ignored",
      }),
    });
    const result = await inspect({
      execute: executor.execute,
      sourceKind,
      inputPath: `/refs/reference.${sourceKind === "gif" ? "gif" : "mov"}`,
    });

    assert.equal(result.sourceKind, sourceKind);
    assert.equal(result.inputPath,
      `/refs/reference.${sourceKind === "gif" ? "gif" : "mov"}`);
    assert.equal(result.decodedFrameCount, 3);
    assert.deepEqual(result.frameTimes, [0, 0.04, 0.08]);
    assert.equal(result.durationSeconds, 0.12);
    assert.equal(result.nominalFrameRate, 25);
    assert.equal(result.pixelFormat, "yuva444p");
    assert.equal(result.hasAlpha, true);
    assert.equal(result.ffprobeVersion, "ffprobe 8.0.1-2");
    assert.equal(result.ffmpegVersion, "ffmpeg 8.0.1-2");
    assert.deepEqual(executor.calls.map(({ binary }) => binary), ["ffprobe", "ffmpeg"]);
    assert.ok(executor.calls[0].args.includes("-show_pixel_formats"));
  }
});

test("reports corrupt metadata, missing visual streams, and structured process failure", async () => {
  for (const stdout of ["{", JSON.stringify({ frames: [], streams: [] })]) {
    const executor = fakeExecutor({
      "media-inspect": ({ binary }) => ({
        stdout: binary === "ffprobe" ? stdout : "ffmpeg version 8.0",
      }),
    });
    await assert.rejects(() => inspect({
      execute: executor.execute,
      sourceKind: "video",
      inputPath: "/refs/broken.mov",
    }), (error) => error.stage === "media-inspect");
  }
  const cause = new Error("opaque process failure");
  await assert.rejects(() => inspect({
    execute: fakeExecutor({ "media-inspect": cause }).execute,
    sourceKind: "video",
    inputPath: "/refs/broken.mov",
  }), (error) => error.name === "ToolcraftMotionReferenceStageError" &&
    error.stage === "media-inspect" && error.cause === cause);
});

test("scans YUV and alpha components once and compares the loop seam once", async () => {
  const { inspection } = await inspectedFixture();
  const executor = fakeExecutor({
    "media-loop-seam": { stdout: stats([
      { frame: 0, time: 0, y: 0 },
      { alpha: 51, frame: 1, time: 1, y: 0 },
    ]) },
    "media-scan": { stderr: "not successful evidence", stdout: stats([
      { frame: 0, time: 0, y: 0 },
      { frame: 1, time: 0.04, u: 64, v: 8, y: 0 },
      { alpha: 128, frame: 2, time: 0.08, y: 0 },
    ]) },
  });
  const result = await scan({
    execute: executor.execute,
    inspection,
  });

  assert.deepEqual(result.changeScores, [0, 64 / 255, 128 / 255]);
  assert.equal(result.changeMetric, "max-yuva-diff-v1");
  assert.equal(result.loopSeamScore, 51 / 255);
  assert.equal(result.scannedFrameCount, 3);
  assert.deepEqual(executor.calls.map(({ stage }) => stage), [
    "media-scan", "media-loop-seam",
  ]);
  const fullScanArgs = executor.calls[0].args;
  assert.equal(fullScanArgs[fullScanArgs.indexOf("-filter_complex") + 1],
    "[0:v]split=2[colorSource][alphaSource];" +
    "[colorSource]format=yuv444p,signalstats," +
    "metadata=mode=add:key=toolcraft.channel:value=color," +
    "metadata=print:file=-[colorout];" +
    "[alphaSource]alphaextract,format=gray,signalstats," +
    "metadata=mode=add:key=toolcraft.channel:value=alpha," +
    "metadata=print:file=-[alphaout]");
  const seamArgs = executor.calls[1].args;
  assert.equal(seamArgs[seamArgs.indexOf("-filter_complex") + 1],
    "[0:v]split=2[lastSource][firstSource];" +
    "[lastSource]select='eq(n,2)',setpts=PTS-STARTPTS[lastFrame];" +
    "[firstSource]select='eq(n,0)',setpts=PTS-STARTPTS[firstFrame];" +
    "[lastFrame][firstFrame]concat=n=2:v=1:a=0," +
    "settb=AVTB,setpts=N/TB[analysis];" +
    "[analysis]split=2[colorSource][alphaSource];" +
    "[colorSource]format=yuv444p,signalstats," +
    "metadata=mode=add:key=toolcraft.channel:value=color," +
    "metadata=print:file=-[colorout];" +
    "[alphaSource]alphaextract,format=gray,signalstats," +
    "metadata=mode=add:key=toolcraft.channel:value=alpha," +
    "metadata=print:file=-[alphaout]");
});

test("normalizes non-zero scan PTS to the same zero-based inspection authority", async () => {
  const rawTimes = [10, 10.04, 10.08];
  const { inspection } = await inspectedFixture({ frameTimes: rawTimes });
  assert.deepEqual(inspection.frameTimes, [0, 0.03999999999999915, 0.08000000000000007]);
  const executor = fakeExecutor({
    "media-loop-seam": { stdout: stats([
      { frame: 0, time: 0, y: 0 },
      { frame: 1, time: 1, y: 0 },
    ]) },
    "media-scan": { stdout: stats(rawTimes.map((time, frame) => ({
      frame, time, y: frame * 10,
    }))) },
  });
  const result = await scan({ execute: executor.execute, inspection });
  assert.equal(result.scannedFrameCount, 3);
  assert.deepEqual(result.changeScores, [0, 10 / 255, 20 / 255]);
});

test("requires decoded count, timestamp, and score agreement", async () => {
  const { inspection } = await inspectedFixture({ pixelFormat: "yuv444p" });
  for (const records of [
    [{ frame: 0, time: 0 }, { frame: 1, time: 0.04 }],
    [{ frame: 0, time: 0 }, { frame: 1, time: 0.05 }, { frame: 2, time: 0.08 }],
  ]) {
    const executor = fakeExecutor({
      "media-loop-seam": { stdout: stats([
        { frame: 0, time: 0 }, { frame: 1, time: 1 },
      ], { alpha: false }) },
      "media-scan": { stdout: stats(records, { alpha: false }) },
    });
    await assert.rejects(() => scan({
      execute: executor.execute,
      inspection,
    }), (error) => error.stage === "media-scan" && /agreement/iu.test(error.message));
  }
});

test("skips the seam process for a single decoded frame", async () => {
  const executor = fakeExecutor({
    "media-inspect": ({ binary }) => ({
      stdout: binary === "ffprobe" ? probeOutput({
        frameTimes: [0], pixelFormat: "yuv420p10le",
      }) : "ffmpeg version 8.0",
    }),
    "media-scan": { stdout: stats([{ frame: 0, time: 0 }], { alpha: false }) },
  });
  const inspection = await inspect({
    execute: executor.execute, inputPath: "/refs/one.mkv", sourceKind: "video",
  });
  executor.calls.length = 0;
  const result = await scan({
    execute: executor.execute, inspection,
  });

  assert.equal(result.loopSeamScore, 0);
  assert.deepEqual(executor.calls.map(({ stage }) => stage), ["media-scan"]);
  assert.match(executor.calls[0].args.join(" "), /format=yuv444p,signalstats/u);
});

test("rejects truncated and extra media seam records", async () => {
  const { inspection } = await inspectedFixture({ pixelFormat: "yuv444p" });
  for (const seamRecords of [
    [{ frame: 0, time: 0 }],
    [{ frame: 0, time: 0 }, { frame: 1, time: 1 }, { frame: 2, time: 2 }],
  ]) {
    const executor = fakeExecutor({
      "media-loop-seam": { stdout: stats(seamRecords, { alpha: false }) },
      "media-scan": { stdout: stats([
        { frame: 0, time: 0 }, { frame: 1, time: 0.04 }, { frame: 2, time: 0.08 },
      ], { alpha: false }) },
    });
    await assert.rejects(() => scan({
      execute: executor.execute, inspection,
    }), (error) => error.stage === "media-loop-seam" && /two/iu.test(error.message));
  }
});

test("materializes selected frames in one pass with explicit ordinal-to-source mapping", async () => {
  const { inspection } = await inspectedFixture();
  const executor = fakeExecutor({ "media-materialize": { stdout: "" } });
  const result = await materializeReviewedFrames({
    execute: executor.execute,
    inspection,
    outputDirectory: "/tmp/review",
    sourceFrameIndices: [0, 2],
  });

  assert.deepEqual(result, [{
    path: "/tmp/review/review-000000.png",
    sourceFrameIndex: 0,
    sourceLocator: "/refs/reference.mov#frame=0",
    timeSeconds: 0,
  }, {
    path: "/tmp/review/review-000001.png",
    sourceFrameIndex: 2,
    sourceLocator: "/refs/reference.mov#frame=2",
    timeSeconds: 0.08,
  }]);
  assert.equal(executor.calls.length, 1);
  assert.match(executor.calls[0].args.join(" "), /select=.*0.*2/u);
  assert.equal(executor.calls[0].args.at(-1), "/tmp/review/review-%06d.png");

  await assert.rejects(() => scan({
    execute: executor.execute, inspection, sourcePath: "/refs/wrong.mov",
  }), /sourcePath.*not accepted/iu);
  await assert.rejects(() => materializeReviewedFrames({
    execute: executor.execute,
    inspection,
    outputDirectory: "/tmp/review",
    sourceFrameIndices: [0],
    sourcePath: "/refs/wrong.mov",
  }), /sourcePath.*not accepted/iu);
});
