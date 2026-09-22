import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolcraftMotionImageAnalysisArguments,
  createToolcraftMotionImageMaterializeArguments,
} from "./toolcraft-motion-reference-image-filter-graph.mjs";

function sequenceInspection(overrides = {}) {
  return {
    decodedFrameCount: 3,
    frames: [0, 1, 2].map((sourceFrameIndex) => ({
      sourceFrameIndex,
      sourceLocator: `/refs/${sourceFrameIndex}.png`,
    })),
    hasAlpha: true,
    height: 20,
    inputPath: "/refs",
    sourceKind: "frame-sequence",
    timingMode: "ordinal",
    width: 30,
    ...overrides,
  };
}

const alphaAnalysis = (input = "[timed]") =>
  `${input}split=2[colorSource][alphaSource];` +
  "[colorSource]format=yuv444p,signalstats," +
  "metadata=mode=add:key=toolcraft.channel:value=color," +
  "metadata=print:file=-[colorout];" +
  "[alphaSource]alphaextract,format=gray,signalstats," +
  "metadata=mode=add:key=toolcraft.channel:value=alpha," +
  "metadata=print:file=-[alphaout]";

test("builds an ordinal image analysis graph with increasing AVTB PTS and 8-bit branches", () => {
  const args = createToolcraftMotionImageAnalysisArguments({
    indices: [0, 1, 2],
    inspection: sequenceInspection(),
  });
  const graph = args[args.indexOf("-filter_complex") + 1];

  assert.deepEqual(args.slice(0, 9), [
    "-loglevel", "error", "-nostats",
    "-i", "/refs/0.png", "-i", "/refs/1.png", "-i", "/refs/2.png",
  ]);
  assert.equal(graph,
    "[0:v][1:v][2:v]concat=n=3:v=1:a=0[sequence];" +
    "[sequence]settb=AVTB,setpts=N/TB[timed];" + alphaAnalysis());
  assert.deepEqual(args.slice(-7), [
    "-map", "[colorout]", "-map", "[alphaout]", "-f", "null", "-",
  ]);
});

test("assigns exact nonuniform authoritative timestamps after ordered concat", () => {
  const inspection = sequenceInspection({
    frameTimes: [0, 0.125, 0.5],
    hasAlpha: false,
    timingMode: "seconds",
  });
  const args = createToolcraftMotionImageAnalysisArguments({
    indices: [0, 1, 2], inspection,
  });

  assert.equal(args[args.indexOf("-filter_complex") + 1],
    "[0:v][1:v][2:v]concat=n=3:v=1:a=0[sequence];" +
    "[sequence]settb=AVTB," +
    "setpts='if(eq(N,0),0/TB,if(eq(N,1),0.125/TB,0.5/TB))'[timed];" +
    "[timed]format=yuv444p,signalstats," +
    "metadata=mode=add:key=toolcraft.channel:value=color," +
    "metadata=print:file=-[colorout]");
});

test("builds the loop comparison in explicit last-to-first order", () => {
  const args = createToolcraftMotionImageAnalysisArguments({
    indices: [2, 0],
    inspection: sequenceInspection(),
    timelineMode: "loop-seam",
  });
  const graph = args[args.indexOf("-filter_complex") + 1];

  assert.deepEqual(args.slice(3, 7), ["-i", "/refs/2.png", "-i", "/refs/0.png"]);
  assert.equal(graph,
    "[0:v][1:v]concat=n=2:v=1:a=0[sequence];" +
    "[sequence]settb=AVTB,setpts=N/TB[timed];" + alphaAnalysis());
});

test("crops contact-sheet cells before assigning authoritative PTS", () => {
  const inspection = sequenceInspection({
    frames: [
      { cell: { column: 0, row: 0 }, sourceFrameIndex: 0,
        sourceLocator: "/refs/source#cell=auth.png#cell=0,0" },
      { cell: { column: 1, row: 0 }, sourceFrameIndex: 1,
        sourceLocator: "/refs/source#cell=auth.png#cell=1,0" },
    ],
    hasAlpha: false,
    inputPath: "/refs/source#cell=auth.png",
    sourceKind: "contact-sheet",
  });
  const args = createToolcraftMotionImageAnalysisArguments({
    indices: [0, 1], inspection,
  });

  assert.deepEqual(args.slice(3, 5), ["-i", "/refs/source#cell=auth.png"]);
  assert.match(args[args.indexOf("-filter_complex") + 1],
    /^\[0:v\]crop=w=30:h=20:x=0:y=0\[cell0\];\[0:v\]crop=w=30:h=20:x=30:y=0\[cell1\];/u);
});

test("materialization preserves selected order without authoritative PTS encoding", () => {
  const args = createToolcraftMotionImageMaterializeArguments({
    inspection: sequenceInspection(),
    outputPattern: "/tmp/review-%06d.png",
    sourceFrameIndices: [2, 0],
  });

  assert.deepEqual(args.slice(2, 6), ["-i", "/refs/2.png", "-i", "/refs/0.png"]);
  assert.equal(args[args.indexOf("-filter_complex") + 1],
    "[0:v][1:v]concat=n=2:v=1:a=0[sequence];" +
    "[sequence]settb=AVTB,setpts=N/TB[materialized]");
  assert.deepEqual(args.slice(-7), [
    "-map", "[materialized]", "-fps_mode", "vfr",
    "-start_number", "0", "/tmp/review-%06d.png",
  ]);
  assert.equal(args.at(-1), "/tmp/review-%06d.png");
});
