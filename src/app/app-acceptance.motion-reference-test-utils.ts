import { getToolcraftMotionReferenceStudyErrors } from "./acceptance/motion-reference-study";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftMotionReferenceBehavior,
  ToolcraftMotionReferenceEvidence,
  ToolcraftMotionReferenceInput,
  ToolcraftMotionReferenceOrdinalFrame,
  ToolcraftMotionReferenceStudy,
  ToolcraftMotionReferenceTimedFrame,
  ToolcraftTransferMode,
} from "./acceptance/types";

export const motionReferenceId =
  "motion-reference-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
export const alternateMotionReferenceId =
  "motion-reference-v1-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
export const motionSourceSha256 =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const alternateMotionSourceSha256 =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

type TimedEvidence = Extract<
  ToolcraftMotionReferenceEvidence,
  { timingMode: "seconds" }
>;
export type MotionReviewPartition = NonNullable<
  TimedEvidence["reviewPartition"]
>;
export type MotionSegment = NonNullable<TimedEvidence["segment"]>;

export function createMotionReferenceAcceptance(
  overrides: Partial<ToolcraftComponentAcceptance> = {},
): ToolcraftComponentAcceptance {
  return {
    automated: true,
    automatedTestName: "preserves planted-anchor retarget behavior",
    browser: {
      budget: "standard",
      file: "e2e/app-controls.spec.ts",
      testName: "browser: preserves planted-anchor retarget behavior",
    },
    componentType: "custom-renderer",
    evidence: "product-output",
    expectedObservable: "Anchors remain planted before a delayed retarget.",
    fixture: "motion reference evidence fixture",
    id: "reference.anchor-retarget",
    kind: "runtime",
    motionReferenceCoverage: [
      { behaviorId: "delayed-retarget", referenceId: motionReferenceId },
    ],
    target: "renderer.anchor-state",
    userAction: "Compare the reference event with the running renderer.",
    ...overrides,
  };
}

export const motionReferenceAcceptance = createMotionReferenceAcceptance();

export function createMotionReferenceBehavior(
  overrides: Partial<ToolcraftMotionReferenceBehavior> = {},
): ToolcraftMotionReferenceBehavior {
  return {
    acceptanceId: motionReferenceAcceptance.id,
    description: "Anchors stay planted until stretch triggers a retarget.",
    id: "delayed-retarget",
    implementationIntent:
      "Preserve contact memory and release anchors only after the observed stretch threshold.",
    timingClaims: [{ claim: "duration", studyId: "study-main" }],
    ...overrides,
  };
}

export function createTimedMotionReferenceStudy({
  behaviorId = "delayed-retarget",
  detectedLoopSeam = false,
  framePrefix = "",
  pathId,
  reviewPartition,
  segment,
  sourceBasename = "reference.mp4",
  sourceSha256 = motionSourceSha256,
  studyId = "study-main",
  withEvent = true,
}: {
  behaviorId?: string | null;
  detectedLoopSeam?: boolean;
  framePrefix?: string;
  pathId?: string;
  reviewPartition?: MotionReviewPartition;
  segment?: MotionSegment;
  sourceBasename?: string;
  sourceSha256?: string;
  studyId?: string;
  withEvent?: boolean;
} = {}): ToolcraftMotionReferenceStudy {
  const frameIds = [0, 1, 2, 3].map((index) => `${framePrefix}f${index}`);
  const reviewedFrames: readonly ToolcraftMotionReferenceTimedFrame[] =
    frameIds.map((frameId, index) => ({
      cell: { column: index, row: 0 },
      frameId,
      sourceFrameIndex: index,
      sourceLocator: `${sourceBasename}#frame=${index}`,
      sourceSha256,
      timeSeconds: index,
    }));
  const detectedEvents = !withEvent
    ? []
    : [
        {
          afterFrameId: frameIds[2],
          beforeFrameId: frameIds[0],
          eventId: `${framePrefix}machine-retarget`,
          kind: detectedLoopSeam ? ("loop-seam" as const) : ("change" as const),
          peakFrameId: frameIds[1],
          score: 0.8,
          windowFrameIds: frameIds.slice(0, 3),
        },
      ];
  const evidence: TimedEvidence = {
    changeMetric: "max-yuva-diff-v1",
    contactSheet: {
      columns: 4,
      height: 180,
      path: `src/app/reference-studies/${pathId ?? studyId}/contact-sheet.png`,
      rows: 1,
      sha256:
        "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      width: 320,
    },
    decodedFrameCount: 4,
    detectedEvents,
    durationSeconds: 4,
    evidenceVersion: 1,
    ffmpegVersion: "ffmpeg 8.0",
    ffprobeVersion: "ffprobe 8.0",
    focusWindows: [],
    height: 180,
    maximumSourceFrameGapSeconds: 1,
    nominalFrameRate: 1,
    overviewFrameIds: frameIds,
    overviewTargetFps: 1,
    reviewPartition,
    reviewedFrames,
    scannedFrameCount: 4,
    segment,
    sourceBasename,
    sourceKind: "video",
    sourceSha256,
    studyId,
    timing: { authority: "decoded-timestamps" },
    timingMode: "seconds",
    width: 320,
  };
  const events: ToolcraftMotionReferenceStudy["events"] = !withEvent
    ? []
    : behaviorId
      ? [
          {
            behaviorIds: [behaviorId],
            classification: "product-behavior",
            evidenceEventId: `${framePrefix}machine-retarget`,
            id: `${framePrefix}event-retarget`,
          },
        ]
      : [
          {
            behaviorIds: [],
            classification: "irrelevant-change",
            evidenceEventId: `${framePrefix}machine-retarget`,
            id: `${framePrefix}event-retarget`,
            reason: "The event is outside product scope.",
          },
        ];

  return {
    evidence,
    evidencePath: `src/app/reference-studies/${pathId ?? studyId}/evidence.json`,
    events,
    phases: [
      {
        behaviorIds: behaviorId ? [behaviorId] : [],
        fromFrameId: frameIds[0],
        id: `${framePrefix}phase-before`,
        toFrameId: frameIds[1],
        visualState: "Anchors remain planted while the body advances.",
      },
      {
        behaviorIds: behaviorId ? [behaviorId] : [],
        fromFrameId: frameIds[2],
        id: `${framePrefix}phase-after`,
        toFrameId: frameIds[3],
        visualState: "Released anchors settle into their new positions.",
      },
    ],
    studyId,
  };
}

export function createOrdinalMotionReferenceStudy({
  behaviorId = "delayed-retarget",
  framePrefix = "o",
  pathId,
  sourceSha256 = motionSourceSha256,
  studyId = "study-main",
}: {
  behaviorId?: string | null;
  framePrefix?: string;
  pathId?: string;
  sourceSha256?: string;
  studyId?: string;
} = {}): ToolcraftMotionReferenceStudy {
  const frameIds = [0, 1, 2, 3].map((index) => `${framePrefix}${index}`);
  const reviewedFrames: readonly ToolcraftMotionReferenceOrdinalFrame[] =
    frameIds.map((frameId, index) => ({
      cell: { column: index, row: 0 },
      frameId,
      sourceFrameIndex: index,
      sourceLocator: `reference-contact-sheet.png#cell=${index},0`,
      sourceSha256,
    }));
  const directory = pathId ?? studyId;

  return {
    evidence: {
      changeMetric: "max-yuva-diff-v1",
      contactSheet: {
        columns: 4,
        height: 180,
        path: `src/app/reference-studies/${directory}/contact-sheet.png`,
        rows: 1,
        sha256:
          "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        width: 320,
      },
      decodedFrameCount: 4,
      detectedEvents: [],
      evidenceVersion: 1,
      ffmpegVersion: "ffmpeg 8.0",
      ffprobeVersion: "ffprobe 8.0",
      focusWindows: [],
      height: 180,
      overviewFrameIds: frameIds,
      reviewedFrames,
      scannedFrameCount: 4,
      sourceBasename: "reference-contact-sheet.png",
      sourceGrid: { columns: 4, rows: 1 },
      sourceKind: "contact-sheet",
      sourceSha256,
      studyId,
      timingMode: "ordinal",
      width: 320,
    },
    evidencePath: `src/app/reference-studies/${directory}/evidence.json`,
    events: [],
    phases: [
      {
        behaviorIds: behaviorId ? [behaviorId] : [],
        fromFrameId: frameIds[0],
        id: `${framePrefix}-phase`,
        toFrameId: frameIds[3],
        visualState: "The referenced state remains visible.",
      },
    ],
    studyId,
  };
}

export function createMotionReferenceInput({
  behaviors = [createMotionReferenceBehavior()],
  referenceId = motionReferenceId,
  studies = [createTimedMotionReferenceStudy()],
}: {
  behaviors?: readonly ToolcraftMotionReferenceBehavior[];
  referenceId?: ToolcraftMotionReferenceInput["referenceId"];
  studies?: readonly ToolcraftMotionReferenceStudy[];
} = {}): ToolcraftMotionReferenceInput {
  return { behaviors, kind: "motion-reference", referenceId, studies };
}

export function getMotionReferenceErrors(
  referenceInputs: readonly ToolcraftMotionReferenceInput[],
  acceptance: readonly ToolcraftComponentAcceptance[] = [
    motionReferenceAcceptance,
  ],
): string[] {
  const transferMode: ToolcraftTransferMode = {
    animationIntent: { mode: "none" },
    mode: "new-toolcraft-app",
    referenceInputs,
  };

  return getToolcraftMotionReferenceStudyErrors({ acceptance, transferMode });
}

export function createPassiveMotionReferenceInput({
  referenceId = alternateMotionReferenceId,
  sourceSha256 = motionSourceSha256,
}: {
  referenceId?: ToolcraftMotionReferenceInput["referenceId"];
  sourceSha256?: string;
} = {}): ToolcraftMotionReferenceInput {
  return createMotionReferenceInput({
    behaviors: [],
    referenceId,
    studies: [
      createTimedMotionReferenceStudy({
        behaviorId: null,
        framePrefix: "passive-",
        pathId: "study-passive",
        sourceSha256,
        studyId: "study-passive",
        withEvent: false,
      }),
    ],
  });
}
