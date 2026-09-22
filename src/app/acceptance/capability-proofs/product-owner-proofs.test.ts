import { describe, expect, it, vi } from "vitest";
import { spatialViewModule } from "@/toolcraft/runtime";

import { getToolcraftPersistenceCoverageResult } from "../runtime-coverage";
import {
  TOOLCRAFT_REQUIRED_MODEL_IMPORT_COVERAGE,
  type ToolcraftProductReadiness,
} from "../types";
import { defineContractSchemaFixture } from "../../app-acceptance.contract-fixtures";
import {
  createFileDropAcceptance,
  createModelFileDropSchema,
  createSingleFileDropSchema,
} from "../../app-acceptance.media-upload.fixtures";
import { createResolvedProductModulePlanFixture } from "./test-plan-fixtures";
import {
  canvasProductReadiness,
  createMediaPersistenceAcceptance,
  createPersistentMediaSchema,
  createRuntimeAcceptance,
  withPersistentMedia,
} from "./test-proof-fixtures";
import { createCapabilityProofValidationContextFixture } from "./test-validation-fixtures";
import { validateToolcraftCapabilityProofs } from "./validate-capability-proofs";

function createCompleteMediaAcceptance() {
  return createFileDropAcceptance({
    automatedTestName: "media lifecycle",
    browserProofTestName: "browser: media lifecycle",
    expectedObservable: "Media lifecycle updates the source output.",
    fixture: "image source",
    mediaLifecycleCoverage: [
      "upload",
      "remove",
      "reset",
      "rotate",
      "flip",
      "transform-output",
    ],
    userAction: "Upload, transform, remove, and reset the source.",
  });
}

function createCompleteModelAcceptance() {
  return createFileDropAcceptance({
    automatedTestName: "model import tuple",
    browserProofTestName: "browser: model import tuple",
    expectedObservable:
      "The imported model keeps its complete visible behavior.",
    fixture: "model package",
    id: "media.model",
    mediaLifecycleCoverage: ["upload", "remove", "reset"],
    modelImportCoverage: TOOLCRAFT_REQUIRED_MODEL_IMPORT_COVERAGE,
    target: "media.model",
    userAction: "Import and exercise the complete model lifecycle.",
  });
}

function createSpatialFixture() {
  const schema = defineContractSchemaFixture({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              id: "test-section-1",
              controls: {
                modelMode: {
                  applicability: { mode: "always" as const },
                  defaultValue: "solid",
                  label: "Model",
                  options: [{ label: "Solid", value: "solid" }],
                  target: "model.mode",
                  type: "select",
                },
                orientation: {
                  applicability: { mode: "always" as const },
                  defaultValue: {
                    position: [0, 0, 5],
                    up: [0, 1, 0],
                  },
                  keyframeable: false,
                  label: false,
                  target: "view.orbit",
                  type: "orientationGizmo",
                },
              },
              title: "Model",
            },
          ],
          title: "Controls",
        },
      },
      persistence: { storage: "none" },
    },
    modules: [spatialViewModule()],
  });
  const productReadiness: ToolcraftProductReadiness = {
    ...canvasProductReadiness,
    interactionOwnership: [],
    productSummary: "A spatial model view fixture.",
    requestedBehavior: "Orbit the model through the runtime gizmo.",
    viewInteraction: {
      mode: "orbit",
      orientationTargets: ["view.orbit"],
    },
  };
  const acceptance = createRuntimeAcceptance("view.orbit", {
    canvasHandle: {
      outputObservable: "Dragging the gizmo changes the shared pose.",
      testId: "toolcraft-orientation-gizmo",
      writesTarget: "view.orbit",
    },
    componentType: "orientationGizmo",
    kind: "canvas-handle",
    orientationGizmoCoverage: "all-required-orientation-gizmo-behavior",
  });

  return { acceptance, productReadiness, schema };
}

describe("Toolcraft media and model capability proof owners", () => {
  it("accepts complete media lifecycle and complete model import recipes", () => {
    expect(
      validateToolcraftCapabilityProofs({
        context: createCapabilityProofValidationContextFixture(
          [createCompleteMediaAcceptance(), createMediaPersistenceAcceptance()],
          { schema: withPersistentMedia(createSingleFileDropSchema()) },
        ),
        plan: createResolvedProductModulePlanFixture(["media.source"]),
      }),
    ).toEqual([]);
    expect(
      validateToolcraftCapabilityProofs({
        context: createCapabilityProofValidationContextFixture(
          [createCompleteModelAcceptance(), createMediaPersistenceAcceptance()],
          { schema: withPersistentMedia(createModelFileDropSchema()) },
        ),
        plan: createResolvedProductModulePlanFixture([
          "media.source",
          "model.3d",
        ]),
      }),
    ).toEqual([]);
  });

  it("uses canonical control rows regardless of same-target runtime row order", () => {
    const runtimeMediaBypass = createRuntimeAcceptance("runtime.media", {
      evidence: "media-lifecycle",
      mediaLifecycleCoverage: [
        "upload",
        "remove",
        "reset",
        "rotate",
        "flip",
        "transform-output",
      ],
      target: "media.source",
    });
    const canonicalMedia = createFileDropAcceptance({
      automatedTestName: "incomplete canonical media proof",
      browserProofTestName: "browser: incomplete canonical media proof",
      expectedObservable: "The canonical row is intentionally incomplete.",
      fixture: "canonical image source",
      mediaLifecycleCoverage: [],
      userAction: "Exercise the incomplete canonical row.",
    });
    const persistence = createMediaPersistenceAcceptance();
    const schema = withPersistentMedia(createSingleFileDropSchema());
    const validate = (
      acceptance: ReturnType<typeof createRuntimeAcceptance>[],
    ) =>
      validateToolcraftCapabilityProofs({
        context: createCapabilityProofValidationContextFixture(acceptance, {
          schema,
        }),
        plan: createResolvedProductModulePlanFixture(["media.source"]),
      });

    const runtimeFirst = validate([
      runtimeMediaBypass,
      canonicalMedia,
      persistence,
    ]);
    const runtimeLast = validate([
      canonicalMedia,
      runtimeMediaBypass,
      persistence,
    ]);

    expect(runtimeFirst).toEqual(runtimeLast);
    expect(runtimeFirst.join("\n")).toContain(
      "fileDrop acceptance must prove upload/import",
    );
  });

  it("does not let a same-target runtime row bypass canonical model coverage", () => {
    const runtimeModelBypass = createRuntimeAcceptance("runtime.model", {
      evidence: "media-lifecycle",
      mediaLifecycleCoverage: ["upload", "remove", "reset"],
      modelImportCoverage: "all-required-model-import-behavior",
      target: "media.model",
    });
    const canonicalModel = createFileDropAcceptance({
      automatedTestName: "incomplete canonical model proof",
      browserProofTestName: "browser: incomplete canonical model proof",
      expectedObservable:
        "The canonical model row is intentionally incomplete.",
      fixture: "canonical model source",
      id: "media.model",
      mediaLifecycleCoverage: ["upload", "remove", "reset"],
      target: "media.model",
      userAction: "Exercise the incomplete canonical model row.",
    });

    const diagnostics = validateToolcraftCapabilityProofs({
      context: createCapabilityProofValidationContextFixture(
        [
          runtimeModelBypass,
          canonicalModel,
          createMediaPersistenceAcceptance(),
        ],
        { schema: withPersistentMedia(createModelFileDropSchema()) },
      ),
      plan: createResolvedProductModulePlanFixture([
        "media.source",
        "model.3d",
      ]),
    });

    expect(diagnostics.join("\n")).toContain(
      "model fileDrop acceptance must declare modelImportCoverage",
    );
  });

  it("requires media persistence hydration even when the schema opts out", () => {
    const schema = createSingleFileDropSchema();
    const context = createCapabilityProofValidationContextFixture(
      [createCompleteMediaAcceptance()],
      {
        persistence: Object.freeze({
          diagnostics: Object.freeze([]),
          reloadCoverageValidated: false,
          validatedSlices: Object.freeze([]),
        }),
        schema,
      },
    );

    expect(
      validateToolcraftCapabilityProofs({
        context,
        plan: createResolvedProductModulePlanFixture(["media.source"]),
      }),
    ).toContain(
      'media.source requires the prevalidated persistence reload fact for slice "media".',
    );
  });

  it("consumes the prevalidated media-slice fact without rerunning persistence", () => {
    const schema = createPersistentMediaSchema();
    if (schema.persistence.storage !== "localStorage") {
      throw new Error("Expected local persistence.");
    }
    const persistenceAcceptance = createRuntimeAcceptance(
      "persistence.reload",
      {
        componentType: "persistence",
        evidence: "persistence-state",
        persistenceCoverage: "reload",
        persistenceSlices: schema.persistence.include.filter(
          (slice) => slice !== "media",
        ),
      },
    );
    const acceptance = [createCompleteMediaAcceptance(), persistenceAcceptance];
    const resolvePersistence = vi.fn(getToolcraftPersistenceCoverageResult);
    const persistence = resolvePersistence({ acceptance, schema });
    const capabilityDiagnostics = validateToolcraftCapabilityProofs({
      context: createCapabilityProofValidationContextFixture(acceptance, {
        persistence,
        schema,
      }),
      plan: createResolvedProductModulePlanFixture(["media.source"]),
    });
    const combinedDiagnostics = [
      ...persistence.diagnostics,
      ...capabilityDiagnostics,
    ];

    expect(resolvePersistence).toHaveBeenCalledOnce();
    expect(persistence.validatedSlices).not.toContain("media");
    expect(capabilityDiagnostics).toEqual([]);
    expect(
      combinedDiagnostics.filter((diagnostic) =>
        diagnostic.includes("missing media"),
      ),
    ).toHaveLength(1);
  });
});

describe("Toolcraft canvas and spatial capability proof owners", () => {
  it("accepts canvas editing with matching interaction ownership", () => {
    const schema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-2",
                controls: {
                  position: {
                    applicability: { mode: "always" as const },
                    defaultValue: 0,
                    label: "Position",
                    max: 100,
                    min: 0,
                    target: "shape.position",
                    type: "slider",
                  },
                },
                title: "Shape",
              },
            ],
            title: "Controls",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });
    const acceptance = createRuntimeAcceptance("shape.position.handle", {
      canvasHandle: {
        outputObservable: "Dragging changes the shape position.",
        testId: "shape-position-handle",
        writesTarget: "shape.position",
      },
      componentType: "canvas-handle",
      interactionId: "canvas-position",
      kind: "canvas-handle",
    });

    expect(
      validateToolcraftCapabilityProofs({
        context: createCapabilityProofValidationContextFixture([acceptance], {
          productReadiness: canvasProductReadiness,
          schema,
        }),
        plan: createResolvedProductModulePlanFixture(["canvas.editing"]),
      }),
    ).toEqual([]);
  });

  it("accepts canonical spatial canvas-handle proof without canvas.editing", () => {
    const fixture = createSpatialFixture();

    expect(
      validateToolcraftCapabilityProofs({
        context: createCapabilityProofValidationContextFixture(
          [fixture.acceptance],
          {
            productReadiness: fixture.productReadiness,
            schema: fixture.schema,
          },
        ),
        plan: createResolvedProductModulePlanFixture(["spatial.view"]),
      }),
    ).toEqual([]);
  });

  it("rejects a noncanonical control row as spatial proof", () => {
    const fixture = createSpatialFixture();
    const noncanonical = createRuntimeAcceptance("view.orbit.control", {
      componentType: "orientationGizmo",
      kind: "control",
      orientationGizmoCoverage: "all-required-orientation-gizmo-behavior",
      target: "view.orbit",
    });

    expect(
      validateToolcraftCapabilityProofs({
        context: createCapabilityProofValidationContextFixture([noncanonical], {
          productReadiness: fixture.productReadiness,
          schema: fixture.schema,
        }),
        plan: createResolvedProductModulePlanFixture(["spatial.view"]),
      }).join("\n"),
    ).toContain("must use canonical orientationGizmo canvas-handle proof");
  });

  it("accepts combined canvas and spatial proof without cross-claiming", () => {
    const spatial = createSpatialFixture();
    const direct = createRuntimeAcceptance("shape.position.handle", {
      canvasHandle: {
        outputObservable: "Dragging changes the shape position.",
        testId: "shape-position-handle",
        writesTarget: "controls.setValue",
      },
      componentType: "canvas-handle",
      interactionId: "canvas-position",
      kind: "canvas-handle",
    });

    expect(
      validateToolcraftCapabilityProofs({
        context: createCapabilityProofValidationContextFixture(
          [direct, spatial.acceptance],
          {
            productReadiness: {
              ...spatial.productReadiness,
              interactionOwnership:
                canvasProductReadiness.interactionOwnership.map((entry) => ({
                  ...entry,
                  target: "controls.setValue",
                })),
            },
            schema: spatial.schema,
          },
        ),
        plan: createResolvedProductModulePlanFixture([
          "canvas.editing",
          "spatial.view",
        ]),
      }),
    ).toEqual([]);
  });
});
