import type { ToolcraftComponentAcceptance } from "./acceptance/types";

export const playbackTimelineAcceptance: ToolcraftComponentAcceptance = {
  automated: true,
  automatedTestName: "connects timeline playback controls to runtime state contract",
  browser: {
    budget: "standard",
    file: "e2e/app-controls.spec.ts",
    testName: "browser: timeline playback transport controls runtime time",
  },
  componentType: "timeline",
  evidence: "timeline-output",
  expectedObservable:
    "The timeline transport changes runtime playback state, editing timeline duration changes the playback range, and playback-only controls render without keyframe rows.",
  fixture: "starter playback timeline fixture",
  id: "timeline.playback",
  kind: "runtime",
  target: "timeline.playback",
  timelineCoverage: "playback",
  timelineLoopProof: {
    direction: "forward-only",
    durationChange: "reproved-after-edit",
    reversePlayback: "forbidden",
    seam: "first-last-match",
  },
  timelinePlaybackCoverage: [
    "pause-resume",
    "scrub",
    "duration",
    "loop",
    "rendered-frame",
  ],
  userAction:
    "Edit timeline duration, verify the seamless forward-only loop still stitches first and last frames with no mirror, yoyo, ping-pong, or reverse motion, then scrub, pause, and resume playback from the timeline panel.",
};

export const keyframesTimelineAcceptance: ToolcraftComponentAcceptance = {
  automated: true,
  automatedTestName: "timeline keyframes evaluate rendered output",
  browser: {
    budget: "standard",
    file: "e2e/app-controls.spec.ts",
    testName: "browser: timeline keyframes evaluate rendered output",
  },
  componentType: "timeline",
  evidence: "timeline-output",
  expectedObservable:
    "Keyframed values create editable rows and change rendered output at different timeline times.",
  fixture: "keyframes timeline fixture",
  id: "timeline.keyframes",
  kind: "runtime",
  target: "timeline.keyframes",
  timelineCoverage: "keyframes",
  userAction: "Create a keyframe, edit its value, and scrub the timeline.",
};

export const productDerivedEightSecondLoop = {
  evidence:
    "The product timing fixture derives one complete forward animation cycle over 8s from the authored playback baseline.",
  seconds: 8,
  source: "product-derived" as const,
};
