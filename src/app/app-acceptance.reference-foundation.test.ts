import { describe, expect, it } from "vitest";

import {
  defineContractSchemaFixture,
  contractAcceptanceFixture,
  contractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import { makeControlAcceptance } from "./app-acceptance.test-utils";
import {
  makeReferenceCoverageAcceptance,
  makeReferenceFeatureInventory,
  referenceStudyEvidence,
} from "./app-acceptance.reference-test-utils";

describe("starter acceptance reference-runtime foundation", () => {
  it("requires explicit reference behavior coverage in reference-runtime-clone mode", () => {
    expect(
      validateContractAcceptance({
        schema: contractSchemaFixture,
        acceptance: contractAcceptanceFixture,
        transferMode: {
          behaviorCoverage: [
            "canvas-sizing",
            "control-mapping",
            "renderer-state",
            "renderer-loop",
          ],
          mode: "reference-runtime-clone",
          referenceInputs: [],
          referenceName: "legacy badge wall",
          sourceOfTruth: "reference-runtime",
        } as never,
      }),
    ).toEqual(
      expect.arrayContaining([
        'reference-runtime-clone behaviorCoverage "canvas-sizing" is missing an acceptance entry with referenceCoverage "canvas-sizing".',
        'reference-runtime-clone behaviorCoverage "control-mapping" is missing an acceptance entry with referenceCoverage "control-mapping".',
        'reference-runtime-clone behaviorCoverage "renderer-state" is missing an acceptance entry with referenceCoverage "renderer-state".',
        'reference-runtime-clone behaviorCoverage "renderer-loop" is missing an acceptance entry with referenceCoverage "renderer-loop".',
        'reference-runtime-clone transferMode must declare referenceTimeline with mode "none", "toolcraft-playback", "toolcraft-keyframes", or "custom-reference-timeline".',
      ]),
    );
  });

  it("requires a reference feature inventory before accepting a reference-runtime-clone", () => {
    const referenceAcceptance = [
      ...contractAcceptanceFixture,
      makeReferenceCoverageAcceptance(
        "reference.canvasSizing",
        "canvas-sizing",
      ),
      makeReferenceCoverageAcceptance(
        "reference.controlMapping",
        "control-mapping",
      ),
      makeReferenceCoverageAcceptance(
        "reference.rendererState",
        "renderer-state",
      ),
    ];

    expect(
      validateContractAcceptance({
        schema: contractSchemaFixture,
        acceptance: referenceAcceptance,
        transferMode: {
          behaviorCoverage: [
            "canvas-sizing",
            "control-mapping",
            "renderer-state",
          ],
          mode: "reference-runtime-clone",
          referenceInputs: [],
          referenceName: "legacy badge wall",
          referenceTimeline: { behaviorCoverage: [], mode: "none" },
          sourceOfTruth: "reference-runtime",
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        "reference-runtime-clone transferMode must declare referenceFeatureInventory with every user-visible and output-affecting behavior from the inspected reference, mapped to Toolcraft implementation and acceptance coverage.",
        'reference-runtime-clone behaviorCoverage "canvas-sizing" must be represented in referenceFeatureInventory by an item whose acceptanceId points to that referenceCoverage.',
        'reference-runtime-clone behaviorCoverage "control-mapping" must be represented in referenceFeatureInventory by an item whose acceptanceId points to that referenceCoverage.',
        'reference-runtime-clone behaviorCoverage "renderer-state" must be represented in referenceFeatureInventory by an item whose acceptanceId points to that referenceCoverage.',
        "reference.canvasSizing declares reference coverage but is not mapped from referenceFeatureInventory. Every reference acceptance row must correspond to an inventoried reference feature.",
      ]),
    );
  });

  it("requires reference study evidence before accepting a reference-runtime-clone", () => {
    expect(
      validateContractAcceptance({
        schema: contractSchemaFixture,
        acceptance: [
          ...contractAcceptanceFixture,
          makeReferenceCoverageAcceptance(
            "reference.canvasSizing",
            "canvas-sizing",
          ),
          makeReferenceCoverageAcceptance(
            "reference.controlMapping",
            "control-mapping",
          ),
          makeReferenceCoverageAcceptance(
            "reference.rendererState",
            "renderer-state",
          ),
        ],
        transferMode: {
          behaviorCoverage: [
            "canvas-sizing",
            "control-mapping",
            "renderer-state",
          ],
          mode: "reference-runtime-clone",
          referenceInputs: [],
          referenceFeatureInventory: makeReferenceFeatureInventory(),
          referenceName: "legacy badge wall",
          referenceTimeline: { behaviorCoverage: [], mode: "none" },
          sourceOfTruth: "reference-runtime",
        },
      }),
    ).toContain(
      "reference-runtime-clone transferMode must declare referenceStudy proving the reference was inspected and, when runnable or reconstructable, run or restored locally before implementation.",
    );
  });

  it("requires a concrete blocker for source-only reference study", () => {
    expect(
      validateContractAcceptance({
        schema: contractSchemaFixture,
        acceptance: [
          ...contractAcceptanceFixture,
          makeReferenceCoverageAcceptance(
            "reference.canvasSizing",
            "canvas-sizing",
          ),
          makeReferenceCoverageAcceptance(
            "reference.controlMapping",
            "control-mapping",
          ),
          makeReferenceCoverageAcceptance(
            "reference.rendererState",
            "renderer-state",
          ),
        ],
        transferMode: {
          behaviorCoverage: [
            "canvas-sizing",
            "control-mapping",
            "renderer-state",
          ],
          mode: "reference-runtime-clone",
          referenceInputs: [],
          referenceFeatureInventory: makeReferenceFeatureInventory(),
          referenceName: "legacy badge wall",
          referenceStudy: {
            ...referenceStudyEvidence,
            sourceOnlyReason: "Source review was enough.",
            status: "source-inspection-only",
          },
          referenceTimeline: { behaviorCoverage: [], mode: "none" },
          sourceOfTruth: "reference-runtime",
        },
      }),
    ).toContain(
      "referenceStudy.sourceOnlyReason must state the concrete blocker that made running or restoring the reference unavailable.",
    );
  });

  it("rejects reference feature inventory items that are not backed by reference acceptance coverage", () => {
    const ordinaryControlAcceptance = makeControlAcceptance(
      "appearance.opacity",
      "slider",
    );

    expect(
      validateContractAcceptance({
        schema: contractSchemaFixture,
        acceptance: [
          ...contractAcceptanceFixture,
          ordinaryControlAcceptance,
          makeReferenceCoverageAcceptance(
            "reference.controlMapping",
            "control-mapping",
          ),
          makeReferenceCoverageAcceptance(
            "reference.rendererState",
            "renderer-state",
          ),
        ],
        transferMode: {
          behaviorCoverage: [
            "canvas-sizing",
            "control-mapping",
            "renderer-state",
          ],
          mode: "reference-runtime-clone",
          referenceInputs: [],
          referenceFeatureInventory: [
            {
              acceptanceId: "appearance.opacity",
              behaviorEvidence:
                "Observed the reference browser output preserve its canvas dimensions.",
              featureName: "Canvas sizing",
              id: "canvas-sizing",
              referenceBehavior:
                "The reference renderer owns output sizing and canvas dimensions.",
              sourceEvidence: "Inspected reference renderer sizing source.",
              status: "ported",
              toolcraftMapping:
                "Toolcraft editable-output sizing preserves the reference dimensions.",
            },
            ...makeReferenceFeatureInventory().slice(1),
          ],
          referenceName: "legacy badge wall",
          referenceTimeline: { behaviorCoverage: [], mode: "none" },
          sourceOfTruth: "reference-runtime",
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        'referenceFeatureInventory "canvas-sizing" acceptanceId "appearance.opacity" must point to an acceptance entry with referenceCoverage or referenceTimelineCoverage.',
        'reference-runtime-clone behaviorCoverage "canvas-sizing" must be represented in referenceFeatureInventory by an item whose acceptanceId points to that referenceCoverage.',
      ]),
    );
  });

  it("requires feature-level behavior evidence for reference inventory items", () => {
    expect(
      validateContractAcceptance({
        schema: contractSchemaFixture,
        acceptance: [
          ...contractAcceptanceFixture,
          makeReferenceCoverageAcceptance(
            "reference.canvasSizing",
            "canvas-sizing",
          ),
          makeReferenceCoverageAcceptance(
            "reference.controlMapping",
            "control-mapping",
          ),
          makeReferenceCoverageAcceptance(
            "reference.rendererState",
            "renderer-state",
          ),
        ],
        transferMode: {
          behaviorCoverage: [
            "canvas-sizing",
            "control-mapping",
            "renderer-state",
          ],
          mode: "reference-runtime-clone",
          referenceInputs: [],
          referenceFeatureInventory: [
            { ...makeReferenceFeatureInventory()[0], behaviorEvidence: "" },
            ...makeReferenceFeatureInventory().slice(1),
          ],
          referenceName: "legacy badge wall",
          referenceStudy: referenceStudyEvidence,
          referenceTimeline: { behaviorCoverage: [], mode: "none" },
          sourceOfTruth: "reference-runtime",
        },
      }),
    ).toContain(
      'referenceFeatureInventory "canvas-sizing" must include behaviorEvidence from the original, restored, or source-only reference study proving this feature was observed before Toolcraft mapping.',
    );
  });

  it("requires explicit user evidence before marking reference behavior intentionally changed", () => {
    expect(
      validateContractAcceptance({
        schema: contractSchemaFixture,
        acceptance: [
          ...contractAcceptanceFixture,
          makeReferenceCoverageAcceptance(
            "reference.canvasSizing",
            "canvas-sizing",
          ),
          makeReferenceCoverageAcceptance(
            "reference.controlMapping",
            "control-mapping",
          ),
          makeReferenceCoverageAcceptance(
            "reference.rendererState",
            "renderer-state",
          ),
        ],
        transferMode: {
          behaviorCoverage: [
            "canvas-sizing",
            "control-mapping",
            "renderer-state",
          ],
          mode: "reference-runtime-clone",
          referenceInputs: [],
          referenceFeatureInventory: [
            {
              ...makeReferenceFeatureInventory()[0],
              status: "intentionally-changed",
              userApprovedChangeReason: "Cleaner implementation.",
            },
            ...makeReferenceFeatureInventory().slice(1),
          ],
          referenceName: "legacy badge wall",
          referenceTimeline: { behaviorCoverage: [], mode: "none" },
          sourceOfTruth: "reference-runtime",
        },
      }),
    ).toContain(
      'referenceFeatureInventory "canvas-sizing" userApprovedChangeReason must cite explicit user approval or redesign/change-request evidence.',
    );
  });

  it("rejects reference-runtime-clone apps that disable the Toolcraft canvas shell", () => {
    const schemaWithoutCanvas = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: {
          enabled: false,
          size: { height: 720, unit: "px", width: 1280 },
        },
        panels: {},
        toolbar: {
          history: false,
          radar: false,
          theme: false,
          zoom: false,
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    expect(
      validateContractAcceptance({
        schema: schemaWithoutCanvas,
        acceptance: [
          ...contractAcceptanceFixture,
          {
            automated: true,
            automatedTestName: "reference canvas size matches legacy renderer",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName:
                "browser: reference canvas size matches legacy renderer",
            },
            componentType: "custom-renderer",
            evidence: "rendered-pixels",
            expectedObservable:
              "The Toolcraft renderer uses the same output dimensions as the reference runtime.",
            fixture: "legacy renderer fixture",
            id: "reference.canvasSizing",
            kind: "runtime",
            referenceCoverage: "canvas-sizing",
            userAction: "Render the reference-sized output.",
          },
          {
            automated: true,
            automatedTestName:
              "reference control mapping preserves legacy output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName:
                "browser: reference control mapping preserves legacy output",
            },
            componentType: "custom-renderer",
            evidence: "product-output",
            expectedObservable:
              "Changing each mapped control updates the same renderer parameter as the reference app.",
            fixture: "legacy controls fixture",
            id: "reference.controlMapping",
            kind: "runtime",
            referenceCoverage: "control-mapping",
            userAction:
              "Change mapped controls and compare reference output behavior.",
          },
          {
            automated: true,
            automatedTestName:
              "reference renderer state preserves legacy lifecycle",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName:
                "browser: reference renderer state preserves legacy lifecycle",
            },
            componentType: "custom-renderer",
            evidence: "product-output",
            expectedObservable:
              "The renderer preserves the reference runtime mutable state lifecycle across frames.",
            fixture: "legacy renderer state fixture",
            id: "reference.rendererState",
            kind: "runtime",
            referenceCoverage: "renderer-state",
            userAction:
              "Run the renderer across frames and compare stateful output.",
          },
        ],
        transferMode: {
          behaviorCoverage: [
            "canvas-sizing",
            "control-mapping",
            "renderer-state",
          ],
          mode: "reference-runtime-clone",
          referenceInputs: [],
          referenceName: "legacy iframe shell",
          referenceTimeline: { behaviorCoverage: [], mode: "none" },
          sourceOfTruth: "reference-runtime",
        },
      }),
    ).toContain(
      "reference-runtime-clone must keep the Toolcraft canvas shell enabled; preserve the reference renderer inside ToolcraftApp canvasContent instead of replacing the app with the original UI.",
    );
  });
});
