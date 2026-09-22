import { describe, expect, it } from "vitest";

import {
  contractAcceptanceFixture,
  contractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import {
  keyframesTimelineAcceptance,
  playbackTimelineAcceptance,
} from "./app-acceptance.timeline-test-utils";
import {
  makeReferenceFeatureInventory,
  referenceStudyEvidence,
} from "./app-acceptance.reference-test-utils";

describe("starter acceptance reference timeline contract", () => {
  it("accepts reference-runtime-clone mode only when required reference behavior is test-backed", () => {
    expect(
      validateContractAcceptance({
        schema: contractSchemaFixture,
        acceptance: [
          ...contractAcceptanceFixture,
          {
            automated: true,
            automatedTestName: "reference canvas size matches legacy renderer",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: reference canvas size matches legacy renderer",
            },
            componentType: "custom-renderer",
            evidence: "rendered-pixels",
            expectedObservable: "The Toolcraft renderer uses the same output dimensions as the reference runtime.",
            fixture: "legacy renderer fixture",
            id: "reference.canvasSizing",
            kind: "runtime",
            referenceCoverage: "canvas-sizing",
            userAction: "Render the reference-sized output.",
          },
          {
            automated: true,
            automatedTestName: "reference control mapping preserves legacy output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: reference control mapping preserves legacy output",
            },
            componentType: "custom-renderer",
            evidence: "product-output",
            expectedObservable: "Changing each mapped control updates the same renderer parameter as the reference app.",
            fixture: "legacy controls fixture",
            id: "reference.controlMapping",
            kind: "runtime",
            referenceCoverage: "control-mapping",
            userAction: "Change mapped controls and compare reference output behavior.",
          },
          {
            automated: true,
            automatedTestName: "reference renderer state preserves legacy lifecycle",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: reference renderer state preserves legacy lifecycle",
            },
            componentType: "custom-renderer",
            evidence: "product-output",
            expectedObservable: "The renderer preserves the reference runtime mutable state lifecycle across frames.",
            fixture: "legacy renderer state fixture",
            id: "reference.rendererState",
            kind: "runtime",
            referenceCoverage: "renderer-state",
            userAction: "Run the renderer across frames and compare stateful output.",
          },
        ],
        transferMode: {
          behaviorCoverage: ["canvas-sizing", "control-mapping", "renderer-state"],
          mode: "reference-runtime-clone",
          referenceInputs: [],
          referenceFeatureInventory: makeReferenceFeatureInventory(),
          referenceName: "legacy badge wall",
          referenceStudy: referenceStudyEvidence,
          referenceTimeline: { behaviorCoverage: [], mode: "none" },
          sourceOfTruth: "reference-runtime",
        },
      }),
    ).toEqual([]);
  });

  it("requires reference clones with pause resume behavior to choose a non-none timeline mode", () => {
    expect(
      validateContractAcceptance({
        schema: contractSchemaFixture,
        acceptance: contractAcceptanceFixture,
        transferMode: {
          behaviorCoverage: [
            "canvas-sizing",
            "control-mapping",
            "renderer-state",
            "pause-resume",
          ],
          mode: "reference-runtime-clone",
          referenceInputs: [],
          referenceName: "legacy pause animation",
          referenceTimeline: { behaviorCoverage: [], mode: "none" },
          sourceOfTruth: "reference-runtime",
        },
      }),
    ).toContain(
      'reference-runtime-clone transport behaviorCoverage "pause-resume" requires referenceTimeline mode "toolcraft-playback", "toolcraft-keyframes", or "custom-reference-timeline"; mode "none" is only for references with no user-facing transport behavior.',
    );
  });

  it("rejects reference clones that hide restart transport behind timeline none", () => {
    expect(
      validateContractAcceptance({
        schema: contractSchemaFixture,
        acceptance: contractAcceptanceFixture,
        transferMode: {
          behaviorCoverage: [
            "canvas-sizing",
            "control-mapping",
            "renderer-state",
            "restart",
            "time-progress",
          ],
          mode: "reference-runtime-clone",
          referenceInputs: [],
          referenceName: "legacy restart animation",
          referenceTimeline: { behaviorCoverage: [], mode: "none" },
          sourceOfTruth: "reference-runtime",
        },
      }),
    ).toContain(
      'reference-runtime-clone transport behaviorCoverage "restart", "time-progress" requires referenceTimeline mode "toolcraft-playback", "toolcraft-keyframes", or "custom-reference-timeline"; mode "none" is only for references with no user-facing transport behavior.',
    );
  });

  it("requires playback reference timelines to declare concrete behavior coverage", () => {
    expect(
      validateContractAcceptance({
        schema: contractSchemaFixture,
        acceptance: contractAcceptanceFixture,
        transferMode: {
          behaviorCoverage: ["canvas-sizing", "control-mapping", "renderer-state"],
          mode: "reference-runtime-clone",
          referenceInputs: [],
          referenceName: "legacy playback animation",
          referenceTimeline: { behaviorCoverage: [], mode: "toolcraft-playback" },
          sourceOfTruth: "reference-runtime",
        },
      }),
    ).toContain(
      'referenceTimeline mode "toolcraft-playback" must list the concrete timeline transport behaviors in behaviorCoverage.',
    );
  });

  it("requires Toolcraft reference playback timelines to declare loop duration provenance", () => {
    const schemaWithPlaybackTimeline = {
      ...contractSchemaFixture,
      panels: {
        ...contractSchemaFixture.panels,
        timeline: { defaultDurationSeconds: 8, enabled: true, mode: "playback" as const },
      },
    };

    expect(
      validateContractAcceptance({
        schema: schemaWithPlaybackTimeline,
        acceptance: [
          ...contractAcceptanceFixture,
          {
            ...playbackTimelineAcceptance,
            id: "reference.timeline.playback",
            referenceTimelineCoverage: "playback",
          },
        ],
        transferMode: {
          behaviorCoverage: [
            "canvas-sizing",
            "control-mapping",
            "renderer-state",
            "pause-resume",
          ],
          mode: "reference-runtime-clone",
          referenceInputs: [],
          referenceName: "legacy playback animation",
          referenceTimeline: { behaviorCoverage: ["playback"], mode: "toolcraft-playback" },
          sourceOfTruth: "reference-runtime",
        },
      }),
    ).toContain(
      'referenceTimeline mode "toolcraft-playback" must declare loopDuration with source, seconds, and evidence. Do not let runtime/template fallback duration such as 8s stand in for reference loop intent.',
    );
  });

  it("requires Toolcraft reference timeline loop duration to match the timeline default", () => {
    const schemaWithPlaybackTimeline = {
      ...contractSchemaFixture,
      panels: {
        ...contractSchemaFixture.panels,
        timeline: { defaultDurationSeconds: 8, enabled: true, mode: "playback" as const },
      },
    };

    expect(
      validateContractAcceptance({
        schema: schemaWithPlaybackTimeline,
        acceptance: [
          ...contractAcceptanceFixture,
          {
            ...playbackTimelineAcceptance,
            id: "reference.timeline.playback",
            referenceTimelineCoverage: "playback",
          },
        ],
        transferMode: {
          behaviorCoverage: [
            "canvas-sizing",
            "control-mapping",
            "renderer-state",
            "pause-resume",
          ],
          mode: "reference-runtime-clone",
          referenceInputs: [],
          referenceName: "legacy playback animation",
          referenceTimeline: {
            behaviorCoverage: ["playback"],
            loopDuration: {
              evidence: "The reference app completes one seamless forward playback cycle over 6s.",
              seconds: 6,
              source: "reference",
            },
            mode: "toolcraft-playback",
          },
          sourceOfTruth: "reference-runtime",
        },
      }),
    ).toContain(
      "panels.timeline.defaultDurationSeconds (8) must match referenceTimeline.loopDuration.seconds (6).",
    );
  });

  it("requires Toolcraft reference keyframe timelines to declare loop duration provenance", () => {
    const schemaWithKeyframesTimeline = {
      ...contractSchemaFixture,
      panels: {
        ...contractSchemaFixture.panels,
        timeline: { defaultDurationSeconds: 8, enabled: true, mode: "keyframes" as const },
      },
    };

    expect(
      validateContractAcceptance({
        schema: schemaWithKeyframesTimeline,
        acceptance: [
          ...contractAcceptanceFixture,
          playbackTimelineAcceptance,
          {
            ...keyframesTimelineAcceptance,
            id: "reference.timeline.keyframes",
            referenceTimelineCoverage: "keyframes",
          },
        ],
        transferMode: {
          behaviorCoverage: [
            "canvas-sizing",
            "control-mapping",
            "renderer-state",
            "time-progress",
          ],
          mode: "reference-runtime-clone",
          referenceInputs: [],
          referenceName: "legacy keyframe animation",
          referenceTimeline: { behaviorCoverage: ["keyframes"], mode: "toolcraft-keyframes" },
          sourceOfTruth: "reference-runtime",
        },
      }),
    ).toContain(
      'referenceTimeline mode "toolcraft-keyframes" must declare loopDuration with source, seconds, and evidence. Do not let runtime/template fallback duration such as 8s stand in for reference loop intent.',
    );
  });
});
