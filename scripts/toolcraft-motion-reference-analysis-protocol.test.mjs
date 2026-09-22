import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolcraftMotionAnalysisGraph,
  createToolcraftMotionAnalysisOutputArguments,
  createToolcraftMotionLoopSeamScore,
  createToolcraftMotionProbeArguments,
  createToolcraftMotionScanResult,
  TOOLCRAFT_MOTION_ANALYSIS_COMPONENT_MAX,
  TOOLCRAFT_MOTION_CHANGE_METRIC,
  toolcraftMotionAnalysisChangeScore,
  toolcraftMotionTimestampsAgree,
  validateToolcraftMotionScanRecordAgreement,
} from "./toolcraft-motion-reference-analysis-protocol.mjs";

function record(frameIndex, timeSeconds, {
  alphaDifference,
  uDifference = 0,
  vDifference = 0,
  yDifference = 0,
} = {}) {
  return {
    ...(alphaDifference === undefined ? {} : { alphaDifference }),
    frameIndex,
    timeSeconds,
    uDifference,
    vDifference,
    yDifference,
  };
}

test("owns the exact ffprobe visual metadata and descriptor request", () => {
  assert.deepEqual(createToolcraftMotionProbeArguments("/refs/input.mov"), [
    "-v", "error", "-select_streams", "v:0",
    "-show_program_version", "-show_pixel_formats",
    "-show_streams", "-show_format", "-show_frames",
    "-show_entries",
    "program_version=version:stream=codec_type,width,height,pix_fmt,avg_frame_rate,r_frame_rate,nb_frames,duration,start_time:format=duration,start_time:frame=best_effort_timestamp_time,pts_time:pixel_format=name,nb_components:pixel_format_flags=alpha:pixel_format_components=index,bit_depth",
    "-of", "json", "/refs/input.mov",
  ]);
});

test("owns exact 8-bit color and conditional alpha stdout analysis graphs", () => {
  assert.equal(createToolcraftMotionAnalysisGraph("[decoded]", false),
    "[decoded]format=yuv444p,signalstats," +
    "metadata=mode=add:key=toolcraft.channel:value=color," +
    "metadata=print:file=-[colorout]");
  assert.equal(createToolcraftMotionAnalysisGraph("[decoded]", true),
    "[decoded]split=2[colorSource][alphaSource];" +
    "[colorSource]format=yuv444p,signalstats," +
    "metadata=mode=add:key=toolcraft.channel:value=color," +
    "metadata=print:file=-[colorout];" +
    "[alphaSource]alphaextract,format=gray,signalstats," +
    "metadata=mode=add:key=toolcraft.channel:value=alpha," +
    "metadata=print:file=-[alphaout]");
  assert.deepEqual(createToolcraftMotionAnalysisOutputArguments(false), [
    "-map", "[colorout]", "-f", "null", "-",
  ]);
  assert.deepEqual(createToolcraftMotionAnalysisOutputArguments(true), [
    "-map", "[colorout]", "-map", "[alphaout]", "-f", "null", "-",
  ]);
});

test("owns the single 8-bit component normalization authority", () => {
  assert.equal(TOOLCRAFT_MOTION_ANALYSIS_COMPONENT_MAX, 255);
  assert.equal(toolcraftMotionAnalysisChangeScore(record(0, 0, {
    alphaDifference: 102,
    uDifference: 51,
    vDifference: 12,
  })), 102 / TOOLCRAFT_MOTION_ANALYSIS_COMPONENT_MAX);
  assert.throws(() => toolcraftMotionAnalysisChangeScore(record(0, 0, {
    yDifference: 256,
  })), /between 0 and 255/iu);
});

test("validates scan count, indices, and authoritative timestamps with one tolerance", () => {
  const records = [record(0, 0), record(1, 0.1250004), record(2, 0.5)];
  assert.equal(toolcraftMotionTimestampsAgree(0.1250004, 0.125), true);
  assert.doesNotThrow(() => validateToolcraftMotionScanRecordAgreement(
    records, [0, 0.125, 0.5],
  ));
  assert.throws(() => validateToolcraftMotionScanRecordAgreement(
    records.slice(0, 2), [0, 0.125, 0.5],
  ), /agreement/iu);
  assert.throws(() => validateToolcraftMotionScanRecordAgreement(
    [records[0], { ...records[1], frameIndex: 2 }, records[2]], [0, 0.125, 0.5],
  ), /agreement/iu);
  assert.throws(() => validateToolcraftMotionScanRecordAgreement(
    [records[0], { ...records[1], timeSeconds: 0.13 }, records[2]], [0, 0.125, 0.5],
  ), /agreement/iu);
});

test("owns single-frame zero and exact last-to-first seam cardinality", () => {
  assert.equal(createToolcraftMotionLoopSeamScore(1), 0);
  const seam = [record(0, 0), record(1, 1, { vDifference: 51 })];
  assert.equal(createToolcraftMotionLoopSeamScore(3, seam), 51 / 255);
  assert.throws(() => createToolcraftMotionLoopSeamScore(3, seam.slice(0, 1)),
    /exactly two/iu);
  assert.throws(() => createToolcraftMotionLoopSeamScore(3, [...seam, record(2, 2)]),
    /exactly two/iu);
  assert.throws(() => createToolcraftMotionLoopSeamScore(3, [seam[1], seam[0]]),
    /indices|increasing/iu);
});

test("assembles one canonical scan result", () => {
  const records = [record(0, 0), record(1, 1, { uDifference: 51 })];
  assert.deepEqual(createToolcraftMotionScanResult(records, 0.25), {
    changeMetric: TOOLCRAFT_MOTION_CHANGE_METRIC,
    changeScores: [0, 51 / 255],
    componentDifferences: records,
    loopSeamScore: 0.25,
    scannedFrameCount: 2,
  });
  assert.equal(TOOLCRAFT_MOTION_CHANGE_METRIC, "max-yuva-diff-v1");
});
