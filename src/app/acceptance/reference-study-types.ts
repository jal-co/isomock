export type ToolcraftReferenceStudyStatus =
  | "ran-original"
  | "restored-local"
  | "source-inspection-only";

export type ToolcraftReferenceStudyEvidence = {
  behaviorEvidence: string;
  referenceLocation: string;
  reproductionSteps: string;
  sourceEvidence: string;
  sourceOnlyReason?: string;
  status: ToolcraftReferenceStudyStatus;
};

export type ToolcraftMotionReferenceTimingMode = "ordinal" | "seconds";

export type ToolcraftMotionReferenceSourceKind =
  | "contact-sheet"
  | "frame-sequence"
  | "gif"
  | "screen-recording"
  | "video";

type ToolcraftMotionReferenceFrameBase = {
  cell: Readonly<{ column: number; row: number }>;
  frameId: string;
  sourceFrameIndex: number;
  sourceLocator: string;
  sourceSha256: string;
};

export type ToolcraftMotionReferenceOrdinalFrame =
  ToolcraftMotionReferenceFrameBase & { timeSeconds?: never };

export type ToolcraftMotionReferenceTimedFrame =
  ToolcraftMotionReferenceFrameBase & { timeSeconds: number };

export type ToolcraftMotionReferenceEvidenceEvent = {
  afterFrameId: string;
  beforeFrameId: string;
  eventId: string;
  kind: "change" | "loop-seam";
  peakFrameId: string;
  score: number;
  windowFrameIds: readonly string[];
};

type ToolcraftMotionReferenceEvidenceBase = {
  changeMetric: "max-yuva-diff-v1";
  contactSheet: Readonly<{
    columns: number;
    height: number;
    path: `src/app/reference-studies/${string}/contact-sheet.png`;
    rows: number;
    sha256: string;
    width: number;
  }>;
  decodedFrameCount: number;
  detectedEvents: readonly ToolcraftMotionReferenceEvidenceEvent[];
  evidenceVersion: 1;
  ffmpegVersion: string;
  ffprobeVersion: string;
  height: number;
  scannedFrameCount: number;
  sourceBasename: string;
  sourceSha256: string;
  studyId: string;
  width: number;
};

export type ToolcraftMotionReferenceEvidence =
  ToolcraftMotionReferenceEvidenceBase &
    (
      | {
          sourceGrid: Readonly<{ columns: number; rows: number }>;
          sourceKind: "contact-sheet";
        }
      | {
          sourceGrid?: never;
          sourceKind: Exclude<
            ToolcraftMotionReferenceSourceKind,
            "contact-sheet"
          >;
        }
    ) &
    (
      | {
          focusWindows: readonly [];
          overviewFrameIds: readonly string[];
          reviewedFrames: readonly ToolcraftMotionReferenceOrdinalFrame[];
          timingMode: "ordinal";
        }
      | {
          durationSeconds: number;
          focusWindows: readonly Readonly<{
            endSeconds: number;
            frameIds: readonly string[];
            sourceFrameEndIndex: number;
            sourceFrameStartIndex: number;
            startSeconds: number;
          }>[];
          maximumSourceFrameGapSeconds: number;
          nominalFrameRate?: number;
          overviewFrameIds: readonly string[];
          overviewTargetFps: number;
          reviewPartition?: Readonly<{
            count: number;
            groupId: `motion-group-v1-${string}`;
            index: number;
            planSha256: string;
            scope: Readonly<{ endSeconds: number; startSeconds: number }>;
          }>;
          reviewedFrames: readonly ToolcraftMotionReferenceTimedFrame[];
          segment?: Readonly<{ endSeconds: number; startSeconds: number }>;
          timing: Readonly<
            | { authority: "decoded-timestamps" }
            | { authority: "declared-fps"; framesPerSecond: number }
            | {
                authority: "declared-timestamps";
                timestampsSha256: string;
              }
          >;
          timingMode: "seconds";
        }
    );

export type ToolcraftMotionReferencePhase = {
  behaviorIds: readonly string[];
  fromFrameId: string;
  id: string;
  toFrameId: string;
  visualState: string;
};

export type ToolcraftMotionReferenceEvent = {
  evidenceEventId: string;
  id: string;
} &
  (
    | {
        behaviorIds: readonly string[];
        classification: "product-behavior";
        reason?: never;
      }
    | {
        behaviorIds: readonly [];
        classification:
          | "edit-boundary"
          | "encoding-artifact"
          | "irrelevant-change";
        reason: string;
      }
  );

export type ToolcraftMotionReferenceTimingClaim =
  | "cadence"
  | "duration"
  | "easing"
  | "loop-seam"
  | "speed";

export type ToolcraftMotionReferenceBehavior = {
  acceptanceId: string;
  description: string;
  id: string;
  implementationIntent: string;
  timingClaims: readonly Readonly<{
    claim: ToolcraftMotionReferenceTimingClaim;
    studyId: string;
  }>[];
};

export type ToolcraftMotionReferenceStudy = {
  evidence: ToolcraftMotionReferenceEvidence;
  evidencePath: `src/app/reference-studies/${string}/evidence.json`;
  events: readonly ToolcraftMotionReferenceEvent[];
  phases: readonly ToolcraftMotionReferencePhase[];
  studyId: string;
};

export type ToolcraftMotionReferenceInput = {
  behaviors: readonly ToolcraftMotionReferenceBehavior[];
  kind: "motion-reference";
  referenceId: `motion-reference-v1-${string}`;
  studies: readonly ToolcraftMotionReferenceStudy[];
};

export type ToolcraftReferenceInput = ToolcraftMotionReferenceInput;

export type ToolcraftMotionReferenceCoverage = Readonly<{
  behaviorId: string;
  referenceId: ToolcraftMotionReferenceInput["referenceId"];
}>;

export type ToolcraftReferenceFeatureStatus =
  | "intentionally-changed"
  | "ported"
  | "toolcraft-native";

export type ToolcraftReferenceFeatureInventoryItem = {
  acceptanceId: string;
  behaviorEvidence: string;
  featureName: string;
  id: string;
  referenceBehavior: string;
  sourceEvidence: string;
  status: ToolcraftReferenceFeatureStatus;
  toolcraftMapping: string;
  userApprovedChangeReason?: string;
};
