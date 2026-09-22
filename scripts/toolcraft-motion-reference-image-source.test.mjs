import assert from "node:assert/strict";
import test from "node:test";

import { createToolcraftSha256 } from "./toolcraft-motion-reference-artifacts.mjs";
import {
  inspect,
  materializeReviewedFrames,
  scan,
} from "./toolcraft-motion-reference-image-source.mjs";
import {
  applyToolcraftMotionDeclaredImageTiming,
} from "./toolcraft-motion-reference-image-timing.mjs";

const bytes = (...values) => Uint8Array.from(values);
function imageProbe({ height = 200, pixelFormat = "rgba", width = 300 } = {}) {
  const alpha = ["rgba", "ayuv64le", "vuya"].includes(pixelFormat);
  return JSON.stringify({
    format: { duration: "0.040000" },
    frames: [{ best_effort_timestamp_time: "0" }],
    pixel_formats: [{
      components: Array.from({ length: alpha ? 4 : 3 }, (_, index) => ({
        bit_depth: pixelFormat.includes("10") ? 10 : 8,
        index: index + 1,
      })),
      flags: { alpha: alpha ? 1 : 0 },
      name: pixelFormat,
      nb_components: alpha ? 4 : 3,
    }],
    program_version: { version: "8.0" },
    streams: [{ codec_type: "video", duration: "0.04", height, nb_frames: "1",
      pix_fmt: pixelFormat, r_frame_rate: "25/1", width }],
  });
}
const imageInspectResponse = (options) => ({ binary }) => ({
  stdout: binary === "ffprobe" ? imageProbe(options) :
    "ffmpeg version 8.0 Copyright ignored",
});
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
function fakeFileSystem(files, reads = []) {
  return {
    readFile: async (filePath) => { reads.push(filePath); return files[filePath]; },
    readdir: async () => Object.keys(files).map((filePath) => filePath.split("/").at(-1)),
  };
}
function sequenceHash(records) {
  return createToolcraftSha256(JSON.stringify(records.map(({ bytes: content, relativePath }) => ({
    byteLength: content.byteLength,
    relativePath,
    sha256: createToolcraftSha256(content),
  }))));
}
async function applyTimes(inspection, frameTimes) {
  return applyToolcraftMotionDeclaredImageTiming(inspection, {
    timestampsFile: "/refs/timestamps.json",
  }, { readFile: async () => Buffer.from(JSON.stringify(frameTimes)) });
}

test("enumerates frame-sequence paths lexically and hashes every ordered file identity", async () => {
  const files = {
    "/refs/sequence/10.png": bytes(10),
    "/refs/sequence/2.png": bytes(2, 2),
    "/refs/sequence/a.jpg": bytes(1, 2, 3),
  };
  const executor = fakeExecutor({ "image-inspect": imageInspectResponse() });
  const reads = [];
  const result = await inspect({
    execute: executor.execute,
    fileSystem: fakeFileSystem(files, reads),
    sourceKind: "frame-sequence",
    inputPath: "/refs/sequence",
  });

  assert.deepEqual(result.frames.map(({ sourceLocator }) => sourceLocator), [
    "/refs/sequence/10.png", "/refs/sequence/2.png", "/refs/sequence/a.jpg",
  ]);
  assert.equal(result.sourceSha256, sequenceHash([
    { bytes: files["/refs/sequence/10.png"], relativePath: "10.png" },
    { bytes: files["/refs/sequence/2.png"], relativePath: "2.png" },
    { bytes: files["/refs/sequence/a.jpg"], relativePath: "a.jpg" },
  ]));
  assert.equal(result.decodedFrameCount, 3);
  assert.equal(result.inputPath, "/refs/sequence");
  assert.equal(result.ffmpegVersion, "ffmpeg 8.0");
  assert.equal(result.ffprobeVersion, "ffprobe 8.0");
  assert.equal(result.timingMode, "ordinal");
  assert.equal("frameTimes" in result, false);
  assert.deepEqual(reads, [
    "/refs/sequence/10.png", "/refs/sequence/2.png", "/refs/sequence/a.jpg",
  ]);
});

test("maps explicit contact-sheet cells row-major and validates its grid", async () => {
  const inputPath = "/refs/source#cell=auth.png";
  const reads = [];
  const fileSystem = fakeFileSystem({ [inputPath]: bytes(9, 8, 7) }, reads);
  const executor = fakeExecutor({
    "image-inspect": imageInspectResponse({ height: 200, width: 300 }),
  });
  const result = await inspect({
    execute: executor.execute,
    fileSystem,
    grid: { columns: 3, rows: 2 },
    sourceKind: "contact-sheet",
    inputPath,
  });

  assert.deepEqual(result.frames.map(({ cell, sourceFrameIndex, sourceLocator }) => ({
    cell, sourceFrameIndex, sourceLocator,
  })), [
    { cell: { column: 0, row: 0 }, sourceFrameIndex: 0,
      sourceLocator: `${inputPath}#cell=0,0` },
    { cell: { column: 1, row: 0 }, sourceFrameIndex: 1,
      sourceLocator: `${inputPath}#cell=1,0` },
    { cell: { column: 2, row: 0 }, sourceFrameIndex: 2,
      sourceLocator: `${inputPath}#cell=2,0` },
    { cell: { column: 0, row: 1 }, sourceFrameIndex: 3,
      sourceLocator: `${inputPath}#cell=0,1` },
    { cell: { column: 1, row: 1 }, sourceFrameIndex: 4,
      sourceLocator: `${inputPath}#cell=1,1` },
    { cell: { column: 2, row: 1 }, sourceFrameIndex: 5,
      sourceLocator: `${inputPath}#cell=2,1` },
  ]);
  assert.deepEqual({ height: result.height, width: result.width }, { height: 100, width: 100 });
  assert.equal(result.sourceSha256, createToolcraftSha256(bytes(9, 8, 7)));
  assert.deepEqual(reads, [inputPath]);

  await assert.rejects(() => inspect({
    execute: executor.execute,
    fileSystem,
    grid: { columns: 4, rows: 3 },
    sourceKind: "contact-sheet",
    inputPath,
  }), /grid|divisible/iu);
});

test("image inspection owns only intrinsic ordinal source metadata", async () => {
  const files = {
    "/refs/sequence/0.png": bytes(0),
    "/refs/sequence/1.png": bytes(1),
  };
  const input = {
    execute: fakeExecutor({ "image-inspect": imageInspectResponse() }).execute,
    fileSystem: fakeFileSystem(files),
    sourceKind: "frame-sequence",
    inputPath: "/refs/sequence",
  };
  const result = await inspect(input);
  assert.equal(result.timingMode, "ordinal");
  assert.equal("frameTimes" in result, false);
  await assert.rejects(() => inspect({
    ...input,
    timing: { authority: "declared-timestamps", frameTimes: [10, 11] },
  }), /timing.*canonical|timing.*inspection/iu);
});

test("retains equal-luma color-only and alpha-only adjacent changes plus loop seam", async () => {
  const files = {
    "/refs/sequence/0.png": bytes(0),
    "/refs/sequence/1.png": bytes(1),
    "/refs/sequence/2.png": bytes(2),
  };
  const inspection = await applyTimes(await inspect({
    execute: fakeExecutor({ "image-inspect": imageInspectResponse() }).execute,
    fileSystem: fakeFileSystem(files),
    sourceKind: "frame-sequence",
    inputPath: "/refs/sequence",
  }), [0, 0.1, 0.3]);
  const executor = fakeExecutor({
    "image-loop-seam": { stdout: stats([
      { frame: 0, time: 0 },
      { frame: 1, time: 1, v: 17 },
    ]) },
    "image-scan": { stdout: stats([
      { frame: 0, time: 0 },
      { frame: 1, time: 0.1, u: 77, y: 0 },
      { alpha: 99, frame: 2, time: 0.3, y: 0 },
    ]) },
  });
  const result = await scan({
    execute: executor.execute,
    inspection,
  });

  assert.deepEqual(result.changeScores, [0, 77 / 255, 99 / 255]);
  assert.equal(result.loopSeamScore, 17 / 255);
  assert.equal(result.changeMetric, "max-yuva-diff-v1");
  assert.deepEqual(executor.calls.map(({ stage }) => stage), [
    "image-scan", "image-loop-seam",
  ]);
});

test("rejects scan timing disagreement and normalizes process failure by stage", async () => {
  const files = {
    "/refs/sequence/0.png": bytes(0),
    "/refs/sequence/1.png": bytes(1),
  };
  const inspection = await applyTimes(await inspect({
    execute: fakeExecutor({ "image-inspect": imageInspectResponse() }).execute,
    fileSystem: fakeFileSystem(files),
    sourceKind: "frame-sequence",
    inputPath: "/refs/sequence",
  }), [0, 0.2]);
  const executor = fakeExecutor({
    "image-loop-seam": { stdout: stats([{ frame: 0, time: 0 }]) },
    "image-scan": { stdout: stats([
      { frame: 0, time: 0 }, { frame: 1, time: 0.25 },
    ]) },
  });
  await assert.rejects(() => scan({
    execute: executor.execute, inspection,
  }), (error) => error.stage === "image-scan" && /agreement/iu.test(error.message));

  const cause = new Error("opaque process failure");
  await assert.rejects(() => inspect({
    execute: fakeExecutor({ "image-inspect": cause }).execute,
    fileSystem: fakeFileSystem(files),
    sourceKind: "frame-sequence",
    inputPath: "/refs/sequence",
  }), (error) => error.stage === "image-inspect" && error.cause === cause);
});

test("skips single-frame image seams and rejects wrong multi-frame seam cardinality", async () => {
  const oneFiles = { "/refs/one/0.png": bytes(0) };
  const oneInspection = await inspect({
    execute: fakeExecutor({ "image-inspect": imageInspectResponse() }).execute,
    fileSystem: fakeFileSystem(oneFiles),
    sourceKind: "frame-sequence",
    inputPath: "/refs/one",
  });
  const oneExecutor = fakeExecutor({
    "image-scan": { stdout: stats([{ frame: 0, time: 0 }]) },
  });
  const oneResult = await scan({
    execute: oneExecutor.execute,
    inspection: oneInspection,
  });
  assert.equal(oneResult.loopSeamScore, 0);
  assert.deepEqual(oneExecutor.calls.map(({ stage }) => stage), ["image-scan"]);

  const files = {
    "/refs/sequence/0.png": bytes(0),
    "/refs/sequence/1.png": bytes(1),
  };
  const inspection = await inspect({
    execute: fakeExecutor({ "image-inspect": imageInspectResponse() }).execute,
    fileSystem: fakeFileSystem(files),
    sourceKind: "frame-sequence",
    inputPath: "/refs/sequence",
  });
  for (const seamRecords of [
    [{ frame: 0, time: 0 }],
    [{ frame: 0, time: 0 }, { frame: 1, time: 1 }, { frame: 2, time: 2 }],
  ]) {
    const executor = fakeExecutor({
      "image-loop-seam": { stdout: stats(seamRecords) },
      "image-scan": { stdout: stats([
        { frame: 0, time: 0 }, { frame: 1, time: 1 },
      ]) },
    });
    await assert.rejects(() => scan({
      execute: executor.execute, inspection,
    }), (error) => error.stage === "image-loop-seam" && /two/iu.test(error.message));
  }
});

test("materializes selected sequence frames as one normalized PNG extraction", async () => {
  const files = {
    "/refs/sequence/0.png": bytes(0),
    "/refs/sequence/1.png": bytes(1),
    "/refs/sequence/2.png": bytes(2),
  };
  const inspection = await inspect({
    execute: fakeExecutor({ "image-inspect": imageInspectResponse() }).execute,
    fileSystem: fakeFileSystem(files),
    sourceKind: "frame-sequence",
    inputPath: "/refs/sequence",
  });
  const executor = fakeExecutor({ "image-materialize": { stdout: "" } });
  const result = await materializeReviewedFrames({
    execute: executor.execute,
    inspection,
    outputDirectory: "/tmp/review",
    sourceFrameIndices: [0, 2],
  });

  assert.deepEqual(result, [{
    path: "/tmp/review/review-000000.png",
    sourceFrameIndex: 0,
    sourceLocator: "/refs/sequence/0.png",
  }, {
    path: "/tmp/review/review-000001.png",
    sourceFrameIndex: 2,
    sourceLocator: "/refs/sequence/2.png",
  }]);
  assert.equal(executor.calls.length, 1);
  assert.equal(executor.calls[0].args.at(-1), "/tmp/review/review-%06d.png");

  await assert.rejects(() => scan({
    execute: executor.execute, inspection, sourcePath: "/refs/wrong",
  }), /sourcePath.*not accepted/iu);
  await assert.rejects(() => materializeReviewedFrames({
    execute: executor.execute,
    inspection,
    outputDirectory: "/tmp/review",
    sourceFrameIndices: [0],
    sourcePath: "/refs/wrong",
  }), /sourcePath.*not accepted/iu);
});
