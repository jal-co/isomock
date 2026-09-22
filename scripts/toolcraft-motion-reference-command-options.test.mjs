import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  parseToolcraftMotionReferenceArgs,
  resolveToolcraftMotionReferenceOptions,
  resolveToolcraftMotionReferenceSourceKind,
} from "./toolcraft-motion-reference-command-options.mjs";
import {
  applyToolcraftMotionDeclaredImageTiming,
} from "./toolcraft-motion-reference-image-timing.mjs";
import {
  formatToolcraftMotionReferenceError,
  ToolcraftMotionReferenceInputError,
} from "./toolcraft-motion-reference-stage.mjs";

const source = path.resolve("/refs/reference.mkv");

async function publicFailure(run) {
  let error;
  try {
    await run();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof ToolcraftMotionReferenceInputError);
  const message = formatToolcraftMotionReferenceError(error);
  assert.ok(message.length <= 180);
  assert.equal(message.includes("/Users/private"), false);
  assert.equal(message.includes("captured stderr"), false);
  return message;
}

test("accepts the one leading package-manager argument separator", () => {
  assert.deepEqual(parseToolcraftMotionReferenceArgs([
    "--", "--source", source, "--kind", "video",
  ]), { kind: "video", source });
});

test("parses the complete timed command surface without doing I/O", () => {
  const parsed = parseToolcraftMotionReferenceArgs([
    "--source", path.resolve("/refs/frames"), "--kind", "frame-sequence",
    "--focus", "1:2.5",
    "--focus", "3:4", "--segment", "0:5", "--fps", "30",
  ]);
  assert.deepEqual(parsed, {
    focus: [{ endSeconds: 2.5, startSeconds: 1 },
      { endSeconds: 4, startSeconds: 3 }],
    framesPerSecond: 30,
    kind: "frame-sequence",
    segment: { endSeconds: 5, startSeconds: 0 },
    source: path.resolve("/refs/frames"),
  });
});

test("parses contact-sheet structure and an absolute timestamp authority", () => {
  const timestampsFile = path.resolve("/refs/times.json");
  assert.deepEqual(parseToolcraftMotionReferenceArgs([
    "--source", path.resolve("/refs/sheet.png"), "--kind", "contact-sheet",
    "--grid", "6x4", "--timestamps-file", timestampsFile,
  ]), {
    grid: { columns: 6, rows: 4 },
    kind: "contact-sheet",
    source: path.resolve("/refs/sheet.png"),
    timestampsFile,
  });
});

test("rejects missing values, unknown flags, repeated singletons, and relative paths", () => {
  for (const [argv, expected] of [
    [[], /source.*required/iu],
    [["--source"], /requires a value/iu],
    [["--source", source, "--wat", "x"], /use only|supported/iu],
    [["--source", source, "--source", source], /single-value.*once/iu],
    [["--source", "relative.mp4"], /absolute/iu],
    [["--source", source, "--timestamps-file", "times.json"], /absolute/iu],
  ]) assert.throws(() => parseToolcraftMotionReferenceArgs(argv), expected);
});

test("rejects malformed values and incompatible flag combinations", () => {
  const sheet = path.resolve("/refs/sheet.png");
  for (const [argv, expected] of [
    [["--source", source, "--kind", "movie"], /kind/iu],
    [["--source", source, "--focus", "2:1"], /focus.*range/iu],
    [["--source", source, "--segment", "a:2"], /segment.*range/iu],
    [["--source", source, "--fps", "0"], /fps.*positive/iu],
    [["--source", source, "--fps", "30", "--timestamps-file", path.resolve("/t")],
      /one timing authority/iu],
    [["--source", source, "--kind", "video", "--grid", "2x2"],
      /grid.*contact-sheet/iu],
    [["--source", sheet, "--kind", "contact-sheet"], /grid.*required/iu],
    [["--source", sheet, "--kind", "contact-sheet", "--grid", "0x2"],
      /grid/iu],
    [["--source", source, "--kind", "video", "--fps", "30"],
      /timing.*image/iu],
  ]) assert.throws(() => parseToolcraftMotionReferenceArgs(argv), expected);
});

test("infers only GIFs, supported timed containers, and directories", async () => {
  assert.equal(await resolveToolcraftMotionReferenceSourceKind(
    parseToolcraftMotionReferenceArgs(["--source", path.resolve("/refs/a.gif")]),
    { stat: async () => ({ isDirectory: () => false }) },
  ), "gif");
  assert.equal(await resolveToolcraftMotionReferenceSourceKind(
    parseToolcraftMotionReferenceArgs(["--source", source]),
    { stat: async () => ({ isDirectory: () => false }) },
  ), "video");
  assert.equal(await resolveToolcraftMotionReferenceSourceKind(
    parseToolcraftMotionReferenceArgs(["--source", path.resolve("/refs/frames")]),
    { stat: async () => ({ isDirectory: () => true }) },
  ), "frame-sequence");
  await assert.rejects(() => resolveToolcraftMotionReferenceSourceKind(
    parseToolcraftMotionReferenceArgs(["--source", path.resolve("/refs/a.png")]),
    { stat: async () => ({ isDirectory: () => false }) },
  ), /explicit.*kind/iu);
});

test("preserves explicit screen-recording semantics instead of guessing it", async () => {
  const parsed = parseToolcraftMotionReferenceArgs([
    "--source", source, "--kind", "screen-recording",
  ]);
  assert.equal(await resolveToolcraftMotionReferenceSourceKind(parsed),
    "screen-recording");
});

test("resolves declared FPS timing and bounds segment and focus to inspection", async () => {
  const parsed = parseToolcraftMotionReferenceArgs([
    "--source", path.resolve("/refs/frames"), "--kind", "frame-sequence",
    "--fps", "2", "--segment", "0:1.5", "--focus", "0.5:1",
  ]);
  const inspection = await applyToolcraftMotionDeclaredImageTiming({
    decodedFrameCount: 4, sourceKind: "frame-sequence", timingMode: "ordinal",
  }, parsed);
  assert.deepEqual(await resolveToolcraftMotionReferenceOptions(parsed, inspection), {
    ...parsed,
    kind: "frame-sequence",
    timing: {
      authority: "declared-fps", frameTimes: [0, 0.5, 1, 1.5],
      framesPerSecond: 2,
    },
  });
  await assert.rejects(() => resolveToolcraftMotionReferenceOptions({
    ...parsed, focus: [{ endSeconds: 2.1, startSeconds: 1 }],
  }, inspection),
  /focus.*duration/iu);
});

test("rejects ranges expressed in a shifted source's original PTS domain", async () => {
  const parsed = parseToolcraftMotionReferenceArgs([
    "--source", source, "--kind", "video", "--segment", "5:6",
  ]);
  await assert.rejects(() => resolveToolcraftMotionReferenceOptions(parsed, {
    decodedFrameCount: 60,
    durationSeconds: 2,
    sourceKind: "video",
    timingMode: "seconds",
  }), /segment.*duration/iu);
});

test("derives the inspected duration when FPS turns an ordinal image source timed", async () => {
  const parsed = parseToolcraftMotionReferenceArgs([
    "--source", path.resolve("/refs/frames"), "--kind", "frame-sequence",
    "--fps", "2", "--segment", "0:2", "--focus", "1:2",
  ]);
  const inspection = await applyToolcraftMotionDeclaredImageTiming({
    decodedFrameCount: 4, sourceKind: "frame-sequence", timingMode: "ordinal",
  }, parsed);
  const resolved = await resolveToolcraftMotionReferenceOptions(parsed, inspection);
  assert.deepEqual(resolved.timing.frameTimes, [0, 0.5, 1, 1.5]);
});

test("rejects timed-only ranges on ordinal image evidence", async () => {
  const parsed = parseToolcraftMotionReferenceArgs([
    "--source", path.resolve("/refs/frames"), "--kind", "frame-sequence",
    "--focus", "0:1",
  ]);
  await assert.rejects(() => resolveToolcraftMotionReferenceOptions(parsed, {
    decodedFrameCount: 3, sourceKind: "frame-sequence", timingMode: "ordinal",
  }), /focus.*timing authority/iu);
});

test("rejects declared image timing when an omitted kind resolves to media", async () => {
  const parsed = parseToolcraftMotionReferenceArgs([
    "--source", source, "--fps", "30",
  ]);
  await assert.rejects(() => resolveToolcraftMotionReferenceOptions(parsed, {
    decodedFrameCount: 3, durationSeconds: 0.1, sourceKind: "video",
    timingMode: "seconds",
  }), /timing.*image/iu);
});

test("checked public input errors expose bounded corrections without source details", async () => {
  const secretSource = "/Users/private/reference.png";
  assert.match(await publicFailure(() => parseToolcraftMotionReferenceArgs([])),
    /--source.*absolute/iu);
  assert.match(await publicFailure(() => parseToolcraftMotionReferenceArgs([
    "--source", secretSource, "--kind", "contact-sheet", "--grid", "0x2",
  ])), /--grid.*positive/iu);
  assert.match(await publicFailure(() => parseToolcraftMotionReferenceArgs([
    "--source", secretSource, "--focus", "2:1",
  ])), /--focus.*start:end/iu);
  assert.match(await publicFailure(() => parseToolcraftMotionReferenceArgs([
    "--source", secretSource, "--kind", "private-kind",
  ])), /--kind.*video.*frame-sequence/iu);
  assert.match(await publicFailure(() => resolveToolcraftMotionReferenceSourceKind(
    parseToolcraftMotionReferenceArgs(["--source", secretSource]),
    { stat: async () => { throw new Error(`captured stderr ${secretSource}`); } },
  )), /--source.*readable/iu);
  assert.match(await publicFailure(() => applyToolcraftMotionDeclaredImageTiming({
    decodedFrameCount: 2,
    sourceKind: "frame-sequence",
    timingMode: "ordinal",
  }, { timestampsFile: secretSource }, {
    readFile: async () => Buffer.from("captured stderr {"),
  })), /timestamps.*JSON.*increasing/iu);
  assert.match(await publicFailure(() => applyToolcraftMotionDeclaredImageTiming({
    decodedFrameCount: 1,
    sourceKind: "frame-sequence",
    timingMode: "ordinal",
  }, { timestampsFile: secretSource }, {
    readFile: async () => Buffer.from("[10]\n"),
  })), /at least two.*timestamps.*duration|timestamps.*at least two.*duration/iu);
});
