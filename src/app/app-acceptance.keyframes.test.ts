import { describe, expect, it } from "vitest";
import {
  timelineModule,
  type ToolcraftControlSchema,
} from "@/toolcraft/runtime";

import type { ToolcraftComponentAcceptance } from "./acceptance/types";
import {
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";

const timelinePlaybackAcceptance: ToolcraftComponentAcceptance = {
  automated: true,
  automatedTestName: "timeline playback controls drive rendered output",
  browser: {
    budget: "standard",
    file: "e2e/app-controls.spec.ts",
    testName: "browser: timeline playback controls drive rendered output",
  },
  componentType: "timeline",
  evidence: "timeline-output",
  expectedObservable:
    "Playback and scrubbing affect the rendered timeline frame.",
  fixture: "timeline fixture",
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
  userAction: "Pause, scrub, and resume timeline playback.",
};

function createTimelineKeyframesAcceptance(
  expectedObservable = "Keyframed opacity changes output at different timeline times.",
  userAction = "Create an Opacity keyframe and scrub the timeline.",
): ToolcraftComponentAcceptance {
  return {
    automated: true,
    automatedTestName: "timeline keyframes evaluate rendered output",
    browser: {
      budget: "standard",
      file: "e2e/app-controls.spec.ts",
      testName: "browser: timeline keyframes evaluate rendered output",
    },
    componentType: "timeline",
    evidence: "timeline-output",
    expectedObservable,
    fixture: "keyframed opacity fixture",
    id: "timeline.keyframes",
    kind: "runtime",
    target: "timeline.keyframes",
    timelineCoverage: "keyframes",
    userAction,
  };
}

function createKeyframesSchema(
  controls: Record<string, ToolcraftControlSchema>,
  title = "Style",
) {
  return defineContractSchemaFixture({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: {
        enabled: true,
      },
      panels: {
        controls: {
          sections: [
            {
              id: "test-section-1",
              controls,
              title,
            },
          ],
          title: "Controls",
        },
      },
      toolbar: {
        history: true,
        radar: true,
        zoom: true,
      },
    },
    modules: [timelineModule({ mode: "keyframes" })],
  });
}

describe("starter acceptance keyframes contract", () => {
  it("requires timeline keyframe coverage for every inferred keyframe-capable control", () => {
    const keyframesSchema = createKeyframesSchema({
      opacity: {
        applicability: { mode: "always" },
        defaultValue: 75,
        label: "Opacity",
        max: 100,
        min: 0,
        target: "style.opacity",
        type: "slider",
        variant: "continuous",
      },
      mode: {
        applicability: { mode: "always" },
        defaultValue: "normal",
        label: "Mode",
        options: [
          { label: "Normal", value: "normal" },
          { label: "Screen", value: "screen" },
        ],
        target: "style.mode",
        type: "select",
      },
    });

    expect(
      validateContractAcceptance({
        schema: keyframesSchema,
        acceptance: [
          timelinePlaybackAcceptance,
          createTimelineKeyframesAcceptance(),
          {
            automated: true,
            automatedTestName: "opacity changes rendered output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: opacity slider changes rendered output",
            },
            componentType: "slider",
            evidence: "rendered-pixels",
            expectedObservable: "Changing Opacity changes rendered output.",
            fixture: "opacity fixture",
            id: "style.opacity",
            kind: "control",
            target: "style.opacity",
            userAction: "Drag the Opacity slider.",
          },
          {
            automated: true,
            automatedTestName: "mode changes rendered output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: mode select changes rendered output",
            },
            componentType: "select",
            evidence: "rendered-pixels",
            expectedObservable: "Changing Mode changes blend behavior.",
            fixture: "mode fixture",
            id: "style.mode",
            kind: "control",
            optionCoverage: "each-visible-item",
            target: "style.mode",
            userAction: "Select each Mode option.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'Style / opacity (style.opacity) is keyframe-capable by Toolcraft control type and must have acceptance timelineCoverage "keyframes" proving its diamond creates/updates a keyframe row and changes evaluated output.',
      ]),
    );
  });

  it("rejects opt-out keyframeable false on inferred keyframe-capable controls", () => {
    const keyframesSchema = createKeyframesSchema({
      blur: {
        applicability: { mode: "always" },
        defaultValue: 2,
        keyframeable: false,
        label: "Blur",
        max: 10,
        min: 0,
        target: "style.blur",
        type: "slider",
        variant: "continuous",
      },
    });

    expect(
      validateContractAcceptance({
        schema: keyframesSchema,
        acceptance: [
          timelinePlaybackAcceptance,
          createTimelineKeyframesAcceptance(
            "Keyframed opacity changes output at different timeline times.",
            "Create a Blur keyframe and scrub the timeline.",
          ),
          {
            automated: true,
            automatedTestName: "blur changes rendered output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: blur slider changes rendered output",
            },
            componentType: "slider",
            evidence: "rendered-pixels",
            expectedObservable: "Changing Blur changes edge softness.",
            fixture: "blur fixture",
            id: "style.blur",
            kind: "control",
            target: "style.blur",
            timelineCoverage: "keyframes",
            userAction: "Drag the Blur slider.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "Style / blur (style.blur) is keyframe-capable by Toolcraft control type; remove keyframeable: false and provide keyframe evaluator coverage instead of hiding the diamond.",
      ]),
    );
  });

  it("rejects keyframeable true on controls that cannot create timeline keyframes", () => {
    const keyframesSchema = createKeyframesSchema(
      {
        mode: {
          applicability: { mode: "always" },
          defaultValue: "normal",
          keyframeable: true,
          label: "Mode",
          options: [
            { label: "Normal", value: "normal" },
            { label: "Screen", value: "screen" },
          ],
          target: "shader.mode",
          type: "select",
        },
      },
      "Mode",
    );

    expect(
      validateContractAcceptance({
        schema: keyframesSchema,
        acceptance: [
          timelinePlaybackAcceptance,
          createTimelineKeyframesAcceptance(
            "Keyframed output changes at different timeline times.",
            "Create a keyframe and scrub the timeline.",
          ),
          {
            automated: true,
            automatedTestName: "mode changes rendered output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: mode select changes rendered output",
            },
            componentType: "select",
            evidence: "rendered-pixels",
            expectedObservable: "Changing Mode changes blend behavior.",
            fixture: "mode fixture",
            id: "shader.mode",
            kind: "control",
            optionCoverage: "each-visible-item",
            target: "shader.mode",
            timelineCoverage: "keyframes",
            userAction: "Select each Mode option.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "Mode / mode (shader.mode) sets keyframeable true, but this control type or runtime-owned target cannot create timeline keyframes.",
      ]),
    );
  });
});
