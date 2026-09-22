import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeToolcraftMotionToolVersion,
  parseToolcraftMotionFfprobeJson,
  parseToolcraftMotionSignalstats,
} from "./toolcraft-motion-reference-ffmpeg-output.mjs";
import {
  createToolcraftMotionLoopSeamScore,
  toolcraftMotionAnalysisChangeScore,
} from "./toolcraft-motion-reference-analysis-protocol.mjs";

function pixelFormatDescriptor(name, { alpha = true, components = alpha ? 4 : 3 } = {}) {
  return {
    components: Array.from({ length: components }, (_, index) => ({
      bit_depth: 8,
      index: index + 1,
    })),
    flags: { alpha: alpha ? 1 : 0 },
    name,
    nb_components: components,
  };
}

function probeJson(overrides = {}) {
  return JSON.stringify({
    format: { duration: "0.100000" },
    frames: [
      { best_effort_timestamp_time: "0.000000" },
      { best_effort_timestamp_time: "0.033333" },
      { best_effort_timestamp_time: "0.066667" },
    ],
    program_version: { version: "8.0.1-2 tool build" },
    pixel_formats: [pixelFormatDescriptor("yuva444p")],
    streams: [{
      codec_type: "video",
      duration: "0.100000",
      height: 360,
      nb_frames: "3",
      pix_fmt: "yuva444p",
      r_frame_rate: "30/1",
      width: 640,
    }],
    ...overrides,
  });
}

function statsRecord(frame, time, {
  alpha,
  channel = "color",
  u = 0,
  v = 0,
  y = 0,
} = {}) {
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

test("normalizes visual ffprobe metadata and authoritative decoded timing", () => {
  assert.deepEqual(parseToolcraftMotionFfprobeJson(probeJson()), {
    decodedFrameCount: 3,
    durationSeconds: 0.1,
    ffprobeVersion: "ffprobe 8.0.1-2",
    frameTimes: [0, 0.033333, 0.066667],
    hasAlpha: true,
    height: 360,
    nominalFrameRate: 30,
    pixelFormat: "yuva444p",
    width: 640,
  });
});

test("normalizes positive and negative decoded timestamp origins to source time zero", () => {
  for (const origin of [10, -1]) {
    const document = JSON.parse(probeJson());
    document.frames = [origin, origin + 0.033333, origin + 0.066667]
      .map((time) => ({ best_effort_timestamp_time: String(time) }));
    const result = parseToolcraftMotionFfprobeJson(JSON.stringify(document));
    assert.equal(result.frameTimes[0], 0);
    assert.ok(Math.abs(result.frameTimes[1] - 0.033333) < 1e-9);
    assert.ok(Math.abs(result.frameTimes[2] - 0.066667) < 1e-9);
    assert.equal(result.durationSeconds, 0.1);
  }
});

test("normalizes shifted container duration to the decoded zero-origin timeline", () => {
  const document = JSON.parse(probeJson());
  document.format = { duration: "12.000000", start_time: "10.000000" };
  document.frames = Array.from({ length: 60 }, (_, index) => ({
    best_effort_timestamp_time: (10 + index / 30).toFixed(6),
  }));
  document.streams[0] = {
    ...document.streams[0],
    duration: "11.966667",
    nb_frames: "60",
    start_time: "10.000000",
  };
  const result = parseToolcraftMotionFfprobeJson(JSON.stringify(document));
  assert.equal(result.frameTimes[0], 0);
  assert.ok(Math.abs(result.frameTimes.at(-1) - 59 / 30) < 1e-6);
  assert.ok(Math.abs(result.durationSeconds - 2) < 1e-6);
});

test("preserves declared trailing duration after the last decoded frame", () => {
  const document = JSON.parse(probeJson());
  document.format = { duration: "0.125000", start_time: "0.000000" };
  document.streams[0].start_time = "0.000000";
  assert.equal(parseToolcraftMotionFfprobeJson(JSON.stringify(document)).durationSeconds,
    0.125);
});

test("rejects malformed probe JSON and missing or invalid visual metadata", () => {
  assert.throws(() => parseToolcraftMotionFfprobeJson("{"), /valid ffprobe JSON/iu);
  assert.throws(() => parseToolcraftMotionFfprobeJson(JSON.stringify({
    frames: [], streams: [{ codec_type: "audio" }],
  })), /visual stream/iu);
  assert.throws(() => parseToolcraftMotionFfprobeJson(probeJson({
    streams: [{ codec_type: "video", height: 0, pix_fmt: "rgb24", width: 640 }],
  })), /dimensions|height/iu);
  assert.throws(() => parseToolcraftMotionFfprobeJson(probeJson({
    frames: [],
  })), /decoded frame/iu);
});

test("returns stable domain errors for adversarial nested ffprobe collections", () => {
  const documents = [];
  const invalidStreams = JSON.parse(probeJson());
  invalidStreams.streams = [null, 7, []];
  documents.push(invalidStreams);
  const invalidFrames = JSON.parse(probeJson());
  invalidFrames.frames = [null];
  documents.push(invalidFrames);
  const invalidDescriptors = JSON.parse(probeJson());
  invalidDescriptors.pixel_formats = [null, 7, []];
  documents.push(invalidDescriptors);
  const invalidComponents = JSON.parse(probeJson());
  invalidComponents.pixel_formats[0].components = [null, 7, []];
  invalidComponents.pixel_formats[0].nb_components = 3;
  documents.push(invalidComponents);

  for (const document of documents) {
    assert.throws(() => parseToolcraftMotionFfprobeJson(JSON.stringify(document)),
      (error) => error instanceof TypeError &&
        error.message.startsWith("Invalid Toolcraft motion FFmpeg output:"));
  }
});

test("falls back from an unavailable average rate to the decoded stream rate", () => {
  const document = JSON.parse(probeJson());
  document.streams[0].avg_frame_rate = "0/0";
  document.streams[0].r_frame_rate = "30000/1001";

  assert.equal(parseToolcraftMotionFfprobeJson(JSON.stringify(document)).nominalFrameRate,
    30000 / 1001);
});

test("derives alpha from the exact ffprobe descriptor rather than its name", () => {
  for (const pixelFormat of ["ayuv64le", "vuya"]) {
    const document = JSON.parse(probeJson());
    document.streams[0].pix_fmt = pixelFormat;
    document.pixel_formats = [pixelFormatDescriptor(pixelFormat)];
    assert.equal(parseToolcraftMotionFfprobeJson(JSON.stringify(document)).hasAlpha, true);
  }
  const nonalpha = JSON.parse(probeJson());
  nonalpha.streams[0].pix_fmt = "yuv420p10le";
  nonalpha.pixel_formats = [pixelFormatDescriptor("yuv420p10le", { alpha: false })];
  assert.equal(parseToolcraftMotionFfprobeJson(JSON.stringify(nonalpha)).hasAlpha, false);
});

test("rejects missing, duplicate, and structurally mismatched pixel descriptors", () => {
  assert.throws(() => parseToolcraftMotionFfprobeJson(probeJson({
    pixel_formats: [],
  })), /pixel format descriptor/iu);
  assert.throws(() => parseToolcraftMotionFfprobeJson(probeJson({
    pixel_formats: [
      pixelFormatDescriptor("yuva444p"), pixelFormatDescriptor("yuva444p"),
    ],
  })), /duplicate.*descriptor/iu);
  assert.throws(() => parseToolcraftMotionFfprobeJson(probeJson({
    pixel_formats: [{
      ...pixelFormatDescriptor("yuva444p"), nb_components: 3,
    }],
  })), /component/iu);
});

test("rejects missing, nonfinite, duplicate, and out-of-order timestamps", () => {
  const invalidFrames = [
    [{ best_effort_timestamp_time: "0" }, {}],
    [{ best_effort_timestamp_time: "0" }, { best_effort_timestamp_time: "NaN" }],
    [{ best_effort_timestamp_time: "0" }, { best_effort_timestamp_time: "0" }],
    [{ best_effort_timestamp_time: "0.1" }, { best_effort_timestamp_time: "0.05" }],
  ];
  for (const frames of invalidFrames) {
    assert.throws(() => parseToolcraftMotionFfprobeJson(probeJson({ frames })),
      /timestamp/iu);
  }
});

test("parses complete color and conditional alpha signalstats records", () => {
  const stdout = [
    statsRecord(0, "0.000000", { y: 0 }),
    statsRecord(0, "0.000000", { alpha: 0, channel: "alpha" }),
    statsRecord(1, "0.033333", { u: 51, v: 12, y: 0 }),
    statsRecord(1, "0.033333", { alpha: 102, channel: "alpha" }),
  ].join("\n");
  const records = parseToolcraftMotionSignalstats(stdout, { requireAlpha: true });

  assert.deepEqual(records, [{
    alphaDifference: 0,
    frameIndex: 0,
    timeSeconds: 0,
    uDifference: 0,
    vDifference: 0,
    yDifference: 0,
  }, {
    alphaDifference: 102,
    frameIndex: 1,
    timeSeconds: 0.033333,
    uDifference: 51,
    vDifference: 12,
    yDifference: 0,
  }]);
  assert.equal(toolcraftMotionAnalysisChangeScore(records[1]), 102 / 255);
  assert.equal(toolcraftMotionAnalysisChangeScore(records[0]), 0);
});

test("requires one complete color record and exactly one conditional alpha record", () => {
  assert.throws(() => parseToolcraftMotionSignalstats(
    statsRecord(0, "0", { channel: "color", u: 2, y: 1 }).replace(
      "lavfi.signalstats.VDIF=0", "",
    ),
  ), /VDIF/iu);
  assert.throws(() => parseToolcraftMotionSignalstats(
    statsRecord(0, "0", { channel: "color", y: 1 }), { requireAlpha: true },
  ), /alpha/iu);
  assert.throws(() => parseToolcraftMotionSignalstats([
    statsRecord(0, "0", { y: 1 }),
    statsRecord(0, "0", { y: 2 }),
  ].join("\n")), /duplicate/iu);
  assert.throws(() => parseToolcraftMotionSignalstats([
    statsRecord(0, "0", { y: 1 }),
    statsRecord(2, "0.2", { y: 2 }),
  ].join("\n")), /missing frame/iu);
});

test("rejects nonfinite, localized, and out-of-order signalstats values", () => {
  assert.throws(() => parseToolcraftMotionSignalstats(
    statsRecord(0, "0", { y: "Infinity" }),
  ), /finite/iu);
  assert.throws(() => parseToolcraftMotionSignalstats(
    statsRecord(0, "0,25", { y: "1,25" }),
  ), /finite/iu);
  assert.throws(() => parseToolcraftMotionSignalstats([
    statsRecord(0, "0.1", { y: 1 }),
    statsRecord(1, "0.05", { y: 2 }),
  ].join("\n")), /increasing/iu);
});

test("normalizes tool versions without volatile build or locale text", () => {
  assert.equal(normalizeToolcraftMotionToolVersion(
    "ffmpeg version 8.0.1-2 Copyright (c) 2000-2026 the FFmpeg developers\nconfiguration: --enable-x",
    "ffmpeg",
  ), "ffmpeg 8.0.1-2");
  assert.equal(normalizeToolcraftMotionToolVersion(
    "ffprobe version n8.0-static built with Apple clang\nBibliotheken-Versionen:",
    "ffprobe",
  ), "ffprobe n8.0-static");
  assert.throws(() => normalizeToolcraftMotionToolVersion("unrelated", "ffmpeg"),
    /ffmpeg version/iu);
});

test("requires an exact two-record last-to-first seam", () => {
  const records = parseToolcraftMotionSignalstats([
    statsRecord(0, "0", { y: 0 }),
    statsRecord(1, "1", { u: 51 }),
  ].join("\n"));
  assert.equal(createToolcraftMotionLoopSeamScore(2, records), 51 / 255);
  assert.throws(() => createToolcraftMotionLoopSeamScore(2, records.slice(0, 1)),
    /exactly two/iu);
  assert.throws(() => createToolcraftMotionLoopSeamScore(2, [...records, {
    ...records[1], frameIndex: 2, timeSeconds: 2,
  }]), /exactly two/iu);
  assert.throws(() => createToolcraftMotionLoopSeamScore(2, [
    records[1], records[0],
  ]), /indices|increasing/iu);
});
