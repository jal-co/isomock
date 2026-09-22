import { describe, expect, it } from "vitest";

import {
  contractAcceptanceFixture,
  contractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import {
  makeReferenceFeatureInventory,
  referenceStudyEvidence,
} from "./app-acceptance.reference-test-utils";

describe("starter acceptance custom reference timeline contract", () => {
  it("rejects downgrading custom reference timeline behavior to Toolcraft playback", () => {
    expect(
      validateContractAcceptance({
        schema: contractSchemaFixture,
        acceptance: contractAcceptanceFixture,
        transferMode: {
          behaviorCoverage: ["canvas-sizing", "control-mapping", "renderer-state"],
          mode: "reference-runtime-clone",
          referenceInputs: [],
          referenceName: "legacy state timeline",
          referenceTimeline: {
            behaviorCoverage: ["state-jump", "trim-range"],
            mode: "toolcraft-playback",
          },
          sourceOfTruth: "reference-runtime",
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        'referenceTimeline mode "toolcraft-playback" cannot preserve custom reference timeline behavior "state-jump". Use mode "custom-reference-timeline" and browser-backed referenceTimelineCoverage instead.',
        'referenceTimeline mode "toolcraft-playback" cannot preserve custom reference timeline behavior "trim-range". Use mode "custom-reference-timeline" and browser-backed referenceTimelineCoverage instead.',
        'referenceTimeline behaviorCoverage "state-jump" is missing an acceptance entry with referenceTimelineCoverage "state-jump".',
        'referenceTimeline behaviorCoverage "trim-range" is missing an acceptance entry with referenceTimelineCoverage "trim-range".',
      ]),
    );
  });

  it("accepts custom reference timeline behavior only when it is test-backed", () => {
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
          {
            automated: true,
            automatedTestName: "reference timeline state buttons preserve legacy jumps",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: reference timeline state buttons preserve legacy jumps",
            },
            componentType: "custom-timeline",
            evidence: "timeline-output",
            expectedObservable: "Clicking each reference timeline state renders the matching legacy state.",
            fixture: "legacy state timeline fixture",
            id: "reference.timeline.stateJump",
            kind: "runtime",
            referenceTimelineCoverage: "state-jump",
            userAction: "Click each reference timeline state button.",
          },
          {
            automated: true,
            automatedTestName: "reference timeline trim handles preserve legacy range",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: reference timeline trim handles preserve legacy range",
            },
            componentType: "custom-timeline",
            evidence: "timeline-output",
            expectedObservable: "Dragging trim handles changes the same start/end state range as the reference.",
            fixture: "legacy trim timeline fixture",
            id: "reference.timeline.trimRange",
            kind: "runtime",
            referenceTimelineCoverage: "trim-range",
            userAction: "Drag reference timeline trim handles.",
          },
        ],
        transferMode: {
          behaviorCoverage: ["canvas-sizing", "control-mapping", "renderer-state"],
          mode: "reference-runtime-clone",
          referenceInputs: [],
          referenceFeatureInventory: makeReferenceFeatureInventory([
            {
              acceptanceId: "reference.timeline.stateJump",
              behaviorEvidence: "Clicked the reference timeline state buttons and observed discrete renderer state jumps.",
              featureName: "Timeline state jump",
              id: "timeline-state-jump",
              referenceBehavior: "The reference timeline state buttons jump to discrete renderer states.",
              sourceEvidence: "Inspected reference timeline state button handlers.",
              status: "ported",
              toolcraftMapping: "The custom reference timeline control keeps the same state-jump behavior.",
            },
            {
              acceptanceId: "reference.timeline.trimRange",
              behaviorEvidence: "Dragged the reference trim handles and observed the active playback/render range change.",
              featureName: "Timeline trim range",
              id: "timeline-trim-range",
              referenceBehavior: "The reference trim handles edit the active playback/render range.",
              sourceEvidence: "Inspected reference trim handle drag behavior.",
              status: "ported",
              toolcraftMapping: "The custom reference timeline control keeps the same trim range behavior.",
            },
          ]),
          referenceName: "legacy state timeline",
          referenceStudy: referenceStudyEvidence,
          referenceTimeline: {
            behaviorCoverage: ["state-jump", "trim-range"],
            mode: "custom-reference-timeline",
          },
          sourceOfTruth: "reference-runtime",
        },
      }),
    ).toEqual([]);
  });

  it("rejects reference coverage entries outside reference-runtime-clone mode", () => {
    expect(
      validateContractAcceptance({
        schema: contractSchemaFixture,
        acceptance: [
          ...contractAcceptanceFixture,
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
          {
            automated: true,
            automatedTestName: "reference timeline trim handles preserve legacy range",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: reference timeline trim handles preserve legacy range",
            },
            componentType: "custom-timeline",
            evidence: "timeline-output",
            expectedObservable: "Dragging trim handles changes the same start/end state range as the reference.",
            fixture: "legacy trim timeline fixture",
            id: "reference.timeline.trimRange",
            kind: "runtime",
            referenceTimelineCoverage: "trim-range",
            userAction: "Drag reference timeline trim handles.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'reference.rendererState declares referenceCoverage "renderer-state" but transferMode is not "reference-runtime-clone".',
        'reference.timeline.trimRange declares referenceTimelineCoverage "trim-range" but transferMode is not "reference-runtime-clone".',
      ]),
    );
  });
});
