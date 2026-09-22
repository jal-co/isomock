import assert from "node:assert/strict";
import test from "node:test";

import {
  defineToolcraftMotionReferenceEvidence,
  getToolcraftMotionReferenceEvidenceErrors,
  writeCanonicalToolcraftMotionReferenceEvidence,
} from "../src/app/acceptance/motion-reference-evidence.mjs";

const hex = (character) => character.repeat(64);

function createEvidence() {
  const sourceSha256 = hex("a");
  const reviewedFrames = Array.from({ length: 5 }, (_, sourceFrameIndex) => ({
    cell: { column: sourceFrameIndex % 3, row: Math.floor(sourceFrameIndex / 3) },
    frameId: `source-frame:${sourceFrameIndex}`,
    sourceFrameIndex,
    sourceLocator: `reference.mp4#frame=${sourceFrameIndex}`,
    sourceSha256,
    timeSeconds: sourceFrameIndex,
  }));
  return {
    changeMetric: "max-yuva-diff-v1",
    contactSheet: {
      columns: 3,
      height: 200,
      path: `src/app/reference-studies/motion-v1-${hex("b")}/contact-sheet.png`,
      rows: 2,
      sha256: hex("c"),
      width: 300,
    },
    decodedFrameCount: 5,
    detectedEvents: [{
      afterFrameId: "source-frame:3",
      beforeFrameId: "source-frame:1",
      eventId: "motion-event:change:1-2-3",
      kind: "change",
      peakFrameId: "source-frame:2",
      score: 0.8,
      windowFrameIds: ["source-frame:1", "source-frame:2", "source-frame:3"],
    }],
    durationSeconds: 4,
    evidenceVersion: 1,
    ffmpegVersion: "ffmpeg 8.0",
    ffprobeVersion: "ffprobe 8.0",
    focusWindows: [{
      endSeconds: 2,
      frameIds: ["source-frame:1", "source-frame:2"],
      sourceFrameEndIndex: 2,
      sourceFrameStartIndex: 1,
      startSeconds: 1,
    }],
    height: 180,
    maximumSourceFrameGapSeconds: 0.2,
    nominalFrameRate: 1,
    overviewFrameIds: reviewedFrames.map(({ frameId }) => frameId),
    overviewTargetFps: 1,
    reviewedFrames,
    scannedFrameCount: 5,
    sourceBasename: "reference.mp4",
    sourceKind: "video",
    sourceSha256,
    studyId: `motion-v1-${hex("b")}`,
    timing: { authority: "decoded-timestamps" },
    timingMode: "seconds",
    width: 320,
  };
}

function createPartitionZeroSeamEvidence() {
  const evidence = createEvidence();
  const indices = [0, 1, 90, 599];
  evidence.reviewedFrames = indices.map((sourceFrameIndex, position) => ({
    cell: { column: position, row: 0 },
    frameId: `source-frame:${sourceFrameIndex}`,
    sourceFrameIndex,
    sourceLocator: `reference.mp4#frame=${sourceFrameIndex}`,
    sourceSha256: evidence.sourceSha256,
    timeSeconds: sourceFrameIndex / 30,
  }));
  evidence.contactSheet.columns = indices.length;
  evidence.contactSheet.rows = 1;
  evidence.decodedFrameCount = 600;
  evidence.scannedFrameCount = 600;
  evidence.durationSeconds = 20;
  evidence.segment = { endSeconds: 4, startSeconds: 0 };
  evidence.reviewPartition = {
    count: 2,
    groupId: `motion-group-v1-${hex("d")}`,
    index: 0,
    planSha256: hex("e"),
    scope: { endSeconds: 20, startSeconds: 0 },
  };
  evidence.focusWindows = [];
  evidence.maximumSourceFrameGapSeconds = 3;
  evidence.overviewFrameIds = evidence.reviewedFrames.map(({ frameId }) => frameId);
  evidence.detectedEvents = [{
    afterFrameId: "source-frame:1",
    beforeFrameId: "source-frame:599",
    eventId: "motion-event:loop-seam:599-0-1",
    kind: "loop-seam",
    peakFrameId: "source-frame:0",
    score: 0.5,
    windowFrameIds: ["source-frame:599", "source-frame:0", "source-frame:1"],
  }];
  return evidence;
}

test("defines frozen evidence and writes deterministic canonical JSON", () => {
  const evidence = defineToolcraftMotionReferenceEvidence(createEvidence());
  const canonical = writeCanonicalToolcraftMotionReferenceEvidence(evidence);

  assert.equal(Object.isFrozen(evidence), true);
  assert.equal(Object.isFrozen(evidence.reviewedFrames[0].cell), true);
  assert.equal(canonical.endsWith("\n"), true);
  assert.equal(canonical, writeCanonicalToolcraftMotionReferenceEvidence(evidence));
  assert.ok(canonical.indexOf('"changeMetric"') < canonical.indexOf('"width"'));
});

test("rejects unknown properties, invalid hashes, and scan count mismatches", () => {
  for (const [mutate, expected] of [
    [(value) => { value.unexpected = true; }, /unknown.*unexpected/iu],
    [(value) => { value.sourceSha256 = "A".repeat(64); }, /sourceSha256.*hash/iu],
    [(value) => { value.scannedFrameCount = 4; }, /decodedFrameCount.*scannedFrameCount/iu],
  ]) {
    const evidence = createEvidence();
    mutate(evidence);
    assert.match(getToolcraftMotionReferenceEvidenceErrors(evidence).join("\n"), expected);
  }
});

test("returns shape errors for every unknown and malformed nested boundary", () => {
  const malformedValues = [
    null,
    7,
    "evidence",
    [],
    { overviewFrameIds: ["x"], reviewedFrames: null },
  ];
  for (const value of malformedValues) {
    let errors;
    assert.doesNotThrow(() => { errors = getToolcraftMotionReferenceEvidenceErrors(value); });
    assert.ok(errors.length > 0);
    assert.ok(errors.every((error) => typeof error === "string"));
  }

  for (const [property, malformed] of [
    ["contactSheet", 3],
    ["detectedEvents", {}],
    ["focusWindows", [null]],
    ["overviewFrameIds", 1],
    ["reviewedFrames", null],
    ["segment", []],
    ["timing", 4],
  ]) {
    const evidence = createEvidence();
    evidence[property] = malformed;
    let errors;
    assert.doesNotThrow(() => { errors = getToolcraftMotionReferenceEvidenceErrors(evidence); });
    assert.ok(errors.length > 0, `${property} must report a shape error`);
    assert.ok(errors.every((error) => typeof error === "string"));
  }

  const partition = createEvidence();
  partition.reviewPartition = 9;
  let partitionErrors;
  assert.doesNotThrow(() => {
    partitionErrors = getToolcraftMotionReferenceEvidenceErrors(partition);
  });
  assert.ok(partitionErrors.length > 0);
  assert.ok(partitionErrors.every((error) => typeof error === "string"));
});

test("requires overview endpoints and recorded-density coverage", () => {
  const missingEndpoint = createEvidence();
  missingEndpoint.overviewFrameIds = missingEndpoint.overviewFrameIds.slice(1);
  assert.match(
    getToolcraftMotionReferenceEvidenceErrors(missingEndpoint).join("\n"),
    /first reviewed frame/iu,
  );

  const sparse = createEvidence();
  sparse.overviewFrameIds = ["source-frame:0", "source-frame:2", "source-frame:4"];
  assert.match(
    getToolcraftMotionReferenceEvidenceErrors(sparse).join("\n"),
    /overview.*gap/iu,
  );
});

test("closes events over known frames and caps each review at 120 frames", () => {
  const unknownEventFrame = createEvidence();
  unknownEventFrame.detectedEvents[0].peakFrameId = "source-frame:99";
  assert.match(
    getToolcraftMotionReferenceEvidenceErrors(unknownEventFrame).join("\n"),
    /event.*unknown.*source-frame:99/iu,
  );

  const oversized = createEvidence();
  oversized.reviewedFrames = Array.from({ length: 121 }, (_, index) => ({
    ...oversized.reviewedFrames[0],
    cell: { column: index % 11, row: Math.floor(index / 11) },
    frameId: `source-frame:${index}`,
    sourceFrameIndex: index,
    timeSeconds: index / 30,
  }));
  oversized.contactSheet.columns = 11;
  oversized.contactSheet.rows = 11;
  oversized.decodedFrameCount = 121;
  oversized.scannedFrameCount = 121;
  oversized.durationSeconds = 4;
  oversized.overviewFrameIds = oversized.reviewedFrames.map(({ frameId }) => frameId);
  assert.match(
    getToolcraftMotionReferenceEvidenceErrors(oversized).join("\n"),
    /at most 120 reviewed frames/iu,
  );
});

test("requires timed focus arrays and canonical complete event windows", () => {
  const missingFocusArray = createEvidence();
  missingFocusArray.focusWindows = {};
  assert.match(
    getToolcraftMotionReferenceEvidenceErrors(missingFocusArray).join("\n"),
    /focusWindows must be an array/iu,
  );

  for (const windowFrameIds of [
    ["source-frame:3", "source-frame:2", "source-frame:1"],
    ["source-frame:0", "source-frame:2", "source-frame:4"],
  ]) {
    const evidence = createEvidence();
    evidence.detectedEvents[0] = {
      afterFrameId: windowFrameIds.at(-1),
      beforeFrameId: windowFrameIds[0],
      eventId: `motion-event:change:${windowFrameIds.map((id) => id.split(":")[1]).join("-")}`,
      kind: "change",
      peakFrameId: windowFrameIds[1],
      score: 0.8,
      windowFrameIds,
    };
    assert.match(
      getToolcraftMotionReferenceEvidenceErrors(evidence).join("\n"),
      /change.*strictly contiguous source-frame order/iu,
    );
  }

  const canonicalLoop = createEvidence();
  canonicalLoop.detectedEvents = [{
    afterFrameId: "source-frame:1",
    beforeFrameId: "source-frame:4",
    eventId: "motion-event:loop-seam:4-0-1",
    kind: "loop-seam",
    peakFrameId: "source-frame:0",
    score: 0.5,
    windowFrameIds: ["source-frame:4", "source-frame:0", "source-frame:1"],
  }];
  assert.deepEqual(getToolcraftMotionReferenceEvidenceErrors(canonicalLoop), []);

  canonicalLoop.detectedEvents[0].peakFrameId = "source-frame:4";
  assert.match(
    getToolcraftMotionReferenceEvidenceErrors(canonicalLoop).join("\n"),
    /loop-seam.*exact cyclic source endpoint window/iu,
  );

  for (const frameCount of [1, 2]) {
    const shortLoop = createEvidence();
    shortLoop.reviewedFrames = shortLoop.reviewedFrames.slice(0, frameCount)
      .map((frame, position) => ({ ...frame, cell: { column: position, row: 0 } }));
    shortLoop.overviewFrameIds = shortLoop.reviewedFrames.map(({ frameId }) => frameId);
    shortLoop.contactSheet.columns = frameCount;
    shortLoop.contactSheet.rows = 1;
    shortLoop.decodedFrameCount = frameCount;
    shortLoop.scannedFrameCount = frameCount;
    shortLoop.durationSeconds = Math.max(1, frameCount - 1);
    shortLoop.focusWindows = [];
    const ids = frameCount === 1 ? ["source-frame:0"] :
      ["source-frame:1", "source-frame:0"];
    shortLoop.detectedEvents = [{
      afterFrameId: ids.at(-1),
      beforeFrameId: ids[0],
      eventId: `motion-event:loop-seam:${ids.map((id) => id.split(":")[1]).join("-")}`,
      kind: "loop-seam",
      peakFrameId: "source-frame:0",
      score: 0.5,
      windowFrameIds: ids,
    }];
    assert.deepEqual(getToolcraftMotionReferenceEvidenceErrors(shortLoop), []);
  }
});

test("bounds timed frames, focus windows, segments, and partitions", () => {
  const bounded = createEvidence();
  bounded.segment = { endSeconds: 3, startSeconds: 1 };
  bounded.reviewedFrames = bounded.reviewedFrames.slice(1, 4)
    .map((frame, position) => ({ ...frame, cell: { column: position, row: 0 } }));
  bounded.overviewFrameIds = bounded.reviewedFrames.map(({ frameId }) => frameId);
  bounded.contactSheet.columns = 3;
  bounded.contactSheet.rows = 1;
  assert.deepEqual(getToolcraftMotionReferenceEvidenceErrors(bounded), []);

  const outsideFrame = createEvidence();
  outsideFrame.reviewedFrames[0].timeSeconds = -0.1;
  assert.match(
    getToolcraftMotionReferenceEvidenceErrors(outsideFrame).join("\n"),
    /timeSeconds.*active timed scope/iu,
  );

  const invalidSegment = createEvidence();
  invalidSegment.segment = { endSeconds: 5, startSeconds: 1 };
  assert.match(
    getToolcraftMotionReferenceEvidenceErrors(invalidSegment).join("\n"),
    /segment.*durationSeconds/iu,
  );

  const invalidFocus = createEvidence();
  invalidFocus.focusWindows[0].startSeconds = 1.5;
  invalidFocus.focusWindows[0].sourceFrameStartIndex = 0;
  assert.match(
    getToolcraftMotionReferenceEvidenceErrors(invalidFocus).join("\n"),
    /focusWindows\[0\].*first and last referenced frames|frame timestamps.*focus range/iu,
  );

  const invalidPartition = createEvidence();
  invalidPartition.reviewPartition = {
    count: 1,
    groupId: `motion-group-v1-${hex("d")}`,
    index: 0,
    planSha256: hex("e"),
    scope: { endSeconds: 5, startSeconds: 0 },
  };
  assert.match(
    getToolcraftMotionReferenceEvidenceErrors(invalidPartition).join("\n"),
    /reviewPartition.*scope.*durationSeconds|partitioned.*segment/iu,
  );
});

test("allows only a complete-scope partition-zero external loop seam", () => {
  assert.deepEqual(
    getToolcraftMotionReferenceEvidenceErrors(createPartitionZeroSeamEvidence()),
    [],
  );

  for (const mutate of [
    (evidence) => { evidence.reviewPartition.index = 1; },
    (evidence) => { evidence.reviewPartition.scope.endSeconds = 19; },
    (evidence) => { evidence.detectedEvents = []; },
    (evidence) => { evidence.detectedEvents[0].peakFrameId = "source-frame:599"; },
    (evidence) => {
      evidence.reviewedFrames.splice(3, 0, {
        ...evidence.reviewedFrames[2],
        cell: { column: 3, row: 0 },
        frameId: "source-frame:500",
        sourceFrameIndex: 500,
        sourceLocator: "reference.mp4#frame=500",
        timeSeconds: 500 / 30,
      });
      evidence.reviewedFrames[4].cell.column = 4;
      evidence.contactSheet.columns = 5;
      evidence.overviewFrameIds.splice(3, 0, "source-frame:500");
    },
  ]) {
    const evidence = createPartitionZeroSeamEvidence();
    mutate(evidence);
    assert.match(
      getToolcraftMotionReferenceEvidenceErrors(evidence).join("\n"),
      /active timed scope|exact cyclic source endpoint window/iu,
    );
  }
});

test("requires interior change peaks and positive focus duration", () => {
  for (const peakFrameId of ["source-frame:1", "source-frame:3"]) {
    const evidence = createEvidence();
    evidence.detectedEvents[0].peakFrameId = peakFrameId;
    assert.match(
      getToolcraftMotionReferenceEvidenceErrors(evidence).join("\n"),
      /change peak must be strictly interior/iu,
    );
  }

  const zeroLengthFocus = createEvidence();
  zeroLengthFocus.focusWindows = [{
    endSeconds: 1,
    frameIds: ["source-frame:1"],
    sourceFrameEndIndex: 1,
    sourceFrameStartIndex: 1,
    startSeconds: 1,
  }];
  assert.match(
    getToolcraftMotionReferenceEvidenceErrors(zeroLengthFocus).join("\n"),
    /focusWindows\[0\].*positive duration/iu,
  );
});

test("requires focus windows to contain every reviewed frame in their timed range", () => {
  for (const [startSeconds, endSeconds, frameIds, startIndex, endIndex] of [
    [0, 2, ["source-frame:1", "source-frame:2"], 1, 2],
    [0, 4, ["source-frame:0", "source-frame:1", "source-frame:3", "source-frame:4"], 0, 4],
    [1, 3, ["source-frame:1", "source-frame:2"], 1, 2],
  ]) {
    const evidence = createEvidence();
    evidence.focusWindows[0] = {
      endSeconds,
      frameIds,
      sourceFrameEndIndex: endIndex,
      sourceFrameStartIndex: startIndex,
      startSeconds,
    };
    assert.match(
      getToolcraftMotionReferenceEvidenceErrors(evidence).join("\n"),
      /focusWindows\[0\].*exact ordered membership/iu,
    );
  }
});

test("ordinal evidence forbids timestamps and timing-only properties", () => {
  const ordinal = createEvidence();
  ordinal.timingMode = "ordinal";
  ordinal.focusWindows = [];
  assert.match(
    getToolcraftMotionReferenceEvidenceErrors(ordinal).join("\n"),
    /ordinal.*durationSeconds|unknown.*durationSeconds/iu,
  );
});

test("define throws the same checked errors returned by the decoder", () => {
  const invalid = { ...createEvidence(), extra: true };
  const errors = getToolcraftMotionReferenceEvidenceErrors(invalid);
  assert.throws(
    () => defineToolcraftMotionReferenceEvidence(invalid),
    new RegExp(errors[0].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
  );
});
