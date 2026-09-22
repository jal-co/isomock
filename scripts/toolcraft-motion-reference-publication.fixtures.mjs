import {
  createToolcraftMotionReferenceGroupId,
  createToolcraftMotionReferenceId,
  createToolcraftMotionReferencePlanSha256,
  createToolcraftMotionReferenceStudyId,
  createToolcraftSha256,
} from "./toolcraft-motion-reference-artifacts.mjs";

const encoder = new TextEncoder();

export function createToolcraftMotionPublicationEvidenceGroup({
  count = 1,
  sourceCharacter = "a",
} = {}) {
  const sourceSha256 = sourceCharacter.repeat(64);
  const scope = { endSeconds: count * 2, startSeconds: 0 };
  const evidences = Array.from({ length: count }, (_, index) => {
    const segment = count === 1 ? undefined : {
      endSeconds: (index + 1) * 2,
      startSeconds: index * 2,
    };
    const sourceIndices = Array.from({ length: 3 }, (__, offset) =>
      index * 3 + offset);
    const reviewedFrames = sourceIndices.map((sourceFrameIndex, position) => ({
      cell: { column: position, row: 0 },
      frameId: `source-frame:${sourceFrameIndex}`,
      sourceFrameIndex,
      sourceLocator: `reference-${sourceCharacter}.mp4#frame=${sourceFrameIndex}`,
      sourceSha256,
      timeSeconds: (segment?.startSeconds ?? 0) + position,
    }));
    const evidence = {
      changeMetric: "max-yuva-diff-v1",
      contactSheet: {
        columns: 3,
        height: 100,
        path: "",
        rows: 1,
        sha256: createToolcraftSha256(encoder.encode(`sheet-${sourceCharacter}-${index}`)),
        width: 300,
      },
      decodedFrameCount: count * 3,
      detectedEvents: [],
      durationSeconds: scope.endSeconds,
      evidenceVersion: 1,
      ffmpegVersion: "ffmpeg 8.0",
      ffprobeVersion: "ffprobe 8.0",
      focusWindows: [],
      height: 180,
      maximumSourceFrameGapSeconds: 0,
      overviewFrameIds: reviewedFrames.map(({ frameId }) => frameId),
      overviewTargetFps: 1,
      reviewedFrames,
      scannedFrameCount: count * 3,
      ...(segment ? { segment } : {}),
      sourceBasename: `reference-${sourceCharacter}.mp4`,
      sourceKind: "video",
      sourceSha256,
      studyId: "",
      timing: { authority: "decoded-timestamps" },
      timingMode: "seconds",
      width: 320,
    };
    evidence.studyId = createToolcraftMotionReferenceStudyId(evidence);
    evidence.contactSheet.path =
      `src/app/reference-studies/${evidence.studyId}/contact-sheet.png`;
    return evidence;
  });
  if (count > 1) {
    const groupId = createToolcraftMotionReferenceGroupId(evidences[0], scope);
    const planSha256 = createToolcraftMotionReferencePlanSha256(evidences);
    evidences.forEach((evidence, index) => {
      evidence.reviewPartition = {
        count,
        groupId,
        index,
        planSha256,
        scope,
      };
    });
  }
  return {
    evidences,
    referenceId: createToolcraftMotionReferenceId(evidences[0]),
    sheetBytes: evidences.map((__, index) =>
      encoder.encode(`sheet-${sourceCharacter}-${index}`)),
  };
}
