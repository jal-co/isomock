import type {
  ToolcraftReferenceFeatureInventoryItem,
  ToolcraftReferenceInput,
  ToolcraftReferenceStudyEvidence,
} from "./reference-study-types";

export type ToolcraftReferenceCoverage =
  | "canvas-sizing"
  | "control-mapping"
  | "export-at-time"
  | "export-copy"
  | "media-lifecycle"
  | "pause-resume"
  | "renderer-loop"
  | "renderer-state"
  | "restart"
  | "spawn-update-cadence"
  | "time-progress";

export type ToolcraftReferenceTimelineCoverage =
  | "all-range"
  | "duration"
  | "export-at-time"
  | "export-range"
  | "jump-to-trim-start"
  | "keyframes"
  | "loop"
  | "playback"
  | "range-playback"
  | "restart"
  | "scrub"
  | "state-jump"
  | "time-progress"
  | "trim-range";

export type ToolcraftTimelinePlaybackCoverage =
  | "duration"
  | "loop"
  | "pause-resume"
  | "rendered-frame"
  | "scrub";

export type ToolcraftAutonomousAnimationCoverage =
  | "no-duration-control"
  | "no-export-at-time"
  | "no-loop-control"
  | "no-play-pause"
  | "no-scrub"
  | "no-user-facing-transport";

export type ToolcraftTimelineLoopDurationSource =
  | "product-derived"
  | "reference"
  | "user-request";

export type ToolcraftTimelineLoopDurationIntent = {
  evidence: string;
  seconds: number;
  source: ToolcraftTimelineLoopDurationSource;
};

export type ToolcraftTimelineLoopProof = {
  direction: "forward-only";
  durationChange: "reproved-after-edit";
  reversePlayback: "forbidden";
  seam: "first-last-match";
};

export type ToolcraftAnimationIntent =
  | { mode: "none" }
  | {
      behaviorCoverage: readonly ToolcraftAutonomousAnimationCoverage[];
      mode: "autonomous";
      reason: string;
    }
  | {
      loopDuration: ToolcraftTimelineLoopDurationIntent;
      mode: "timeline-keyframes";
    }
  | {
      loopDuration: ToolcraftTimelineLoopDurationIntent;
      mode: "timeline-playback";
    };

export type ToolcraftReferenceTimelineMode =
  | "custom-reference-timeline"
  | "none"
  | "toolcraft-keyframes"
  | "toolcraft-playback";

export type ToolcraftReferenceTimelineContract = {
  behaviorCoverage: readonly ToolcraftReferenceTimelineCoverage[];
  loopDuration?: ToolcraftTimelineLoopDurationIntent;
  mode: ToolcraftReferenceTimelineMode;
};

type ToolcraftTransferModeBase = {
  animationIntent?: ToolcraftAnimationIntent;
  referenceInputs: readonly ToolcraftReferenceInput[];
};

export type ToolcraftTransferMode = ToolcraftTransferModeBase &
  (
    | { mode: "new-toolcraft-app" }
    | {
        behaviorCoverage: readonly ToolcraftReferenceCoverage[];
        mode: "reference-runtime-clone";
        referenceFeatureInventory?: readonly ToolcraftReferenceFeatureInventoryItem[];
        referenceName: string;
        referenceStudy?: ToolcraftReferenceStudyEvidence;
        referenceTimeline: ToolcraftReferenceTimelineContract;
        sourceOfTruth: "reference-runtime";
      }
  );
