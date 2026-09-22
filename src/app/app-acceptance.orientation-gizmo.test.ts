import { describe, expect, it } from "vitest";
import { spatialViewModule } from "@/toolcraft/runtime";
import { exportRequestFixture } from "./app-acceptance.export-request-test-fixtures";

import { getToolcraftOrientationGizmoErrors } from "./acceptance/orientation-gizmo";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftProductReadiness,
} from "./acceptance/types";
import {
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";

const defaultPose = {
  position: [0, 0, 5],
  up: [0, 1, 0],
} as const;

const orientationProductReadiness: ToolcraftProductReadiness = {
  exportIntent: {
    image: {
      evidence: exportRequestFixture(
        "Remove image export for this orientation fixture.",
      ),
      mode: "user-removed",
    },
    svg: { mode: "not-requested" },
    video: { mode: "not-requested" },
  },
  interactionOwnership: [],
  mode: "product",
  productName: "Orientation fixture",
  productSummary: "A spatial fixture for the runtime orientation gizmo.",
  requestedBehavior: "Orbit the visible model with one shared pose.",
  viewInteraction: {
    mode: "orbit",
    orientationTargets: ["view.orbit"],
  },
};

function createOrientationSchema() {
  return defineContractSchemaFixture({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              id: "test-section-1",
              controls: {
                material: {
                  applicability: { mode: "always" as const },
                  defaultValue: 0.5,
                  label: "Metalness",
                  max: 1,
                  min: 0,
                  target: "model.metalness",
                  type: "slider",
                },
                orientation: {
                  applicability: { mode: "always" as const },
                  defaultValue: defaultPose,
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
}

const orientationAcceptance: ToolcraftComponentAcceptance = {
  automated: true,
  automatedTestName:
    "orientation pose changes rendered model and undo resets it",
  browser: {
    budget: "standard",
    file: "e2e/app-controls.spec.ts",
    testName:
      "browser: orientation gizmo and direct model orbit share canvas ownership",
  },
  canvasHandle: {
    outputObservable: "The visible model follows the shared orbit pose.",
    testId: "toolcraft-orientation-gizmo",
    writesTarget: "view.orbit",
  },
  componentType: "orientationGizmo",
  evidence: "product-output",
  expectedObservable:
    "Axis and model drags rotate the model while empty canvas drag pans.",
  fixture: "visible 3D model with empty canvas around it",
  id: "model.orientation",
  kind: "canvas-handle",
  orientationGizmoCoverage: "all-required-orientation-gizmo-behavior",
  userAction:
    "Drag a gizmo axis, drag the visible model, and drag outside the model.",
};

describe("Toolcraft orientation gizmo acceptance", () => {
  it("accepts one hidden non-keyframeable runtime gizmo in a semantic section", () => {
    const schema = createOrientationSchema();

    expect(getToolcraftOrientationGizmoErrors(schema)).toEqual([]);
    const errors = validateContractAcceptance({
      acceptance: [orientationAcceptance],
      productReadiness: orientationProductReadiness,
      schema,
    });

    expect(
      errors.filter((error) =>
        /orientationGizmo|view\.orbit|orientation gizmo/i.test(error),
      ),
    ).toEqual([]);
  });

  it("accepts multiple gizmos when visibility conditions prove one active model", () => {
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
                  activeModel: {
                    applicability: { mode: "always" as const },
                    defaultValue: "first",
                    label: "Model",
                    options: [
                      { label: "First", value: "first" },
                      { label: "Second", value: "second" },
                    ],
                    target: "model.active",
                    type: "select",
                  },
                  firstOrientation: {
                    defaultValue: defaultPose,
                    keyframeable: false,
                    label: false,
                    target: "first.orbit",
                    type: "orientationGizmo",
                    applicability: {
                      all: [{ equals: "first", target: "model.active" }],
                      mode: "conditional" as const,
                    },
                  },
                  secondOrientation: {
                    defaultValue: defaultPose,
                    keyframeable: false,
                    label: false,
                    target: "second.orbit",
                    type: "orientationGizmo",
                    applicability: {
                      all: [{ equals: "second", target: "model.active" }],
                      mode: "conditional" as const,
                    },
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

    expect(getToolcraftOrientationGizmoErrors(schema)).toEqual([]);
  });

  it("rejects multiple gizmos whose visibility is not provably exclusive", () => {
    const schema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-3",
                controls: {
                  activeModel: {
                    applicability: { mode: "always" as const },
                    defaultValue: "first",
                    label: "Model",
                    target: "model.active",
                    type: "text",
                  },
                  firstOrientation: {
                    defaultValue: defaultPose,
                    keyframeable: false,
                    label: false,
                    target: "first.orbit",
                    type: "orientationGizmo",
                    applicability: {
                      all: [{ notEquals: "hidden", target: "model.active" }],
                      mode: "conditional" as const,
                    },
                  },
                  secondOrientation: {
                    defaultValue: defaultPose,
                    keyframeable: false,
                    label: false,
                    target: "second.orbit",
                    type: "orientationGizmo",
                    applicability: {
                      all: [{ equals: "second", target: "model.active" }],
                      mode: "conditional" as const,
                    },
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

    expect(getToolcraftOrientationGizmoErrors(schema)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "must have provably mutually exclusive visibility conditions",
        ),
      ]),
    );
  });

  it("rejects panel-control proof that omits the full orbit interaction boundary", () => {
    const schema = createOrientationSchema();
    const errors = validateContractAcceptance({
      acceptance: [
        {
          ...orientationAcceptance,
          canvasHandle: undefined,
          kind: "control",
          orientationGizmoCoverage: undefined,
          target: "view.orbit",
        },
      ],
      productReadiness: orientationProductReadiness,
      schema,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'must use acceptance kind "canvas-handle", not a panel-control proof',
        ),
        expect.stringContaining(
          'spatial.view orbit target "view.orbit" requires orientationGizmo acceptance proof',
        ),
      ]),
    );
  });

  it("rejects malformed and competing gizmos plus vectors named as 3D orbit controls", () => {
    const schema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-4",
                controls: {
                  orientation: {
                    applicability: { mode: "always" as const },
                    defaultValue: {
                      position: [0, 0, 0],
                      up: [0, 0, 0],
                    },
                    keyframeable: true,
                    label: "Orientation",
                    target: "view.orbit",
                    type: "orientationGizmo",
                  },
                },
                title: "View",
              },
              {
                id: "test-section-5",
                controls: {
                  cameraOrbit: {
                    applicability: { mode: "always" as const },
                    defaultValue: { x: 0, y: 0 },
                    label: "Camera orbit",
                    target: "camera.orbit",
                    type: "vector",
                  },
                  secondOrientation: {
                    applicability: { mode: "always" as const },
                    defaultValue: defaultPose,
                    keyframeable: false,
                    label: false,
                    target: "secondary.orbit",
                    type: "orientationGizmo",
                  },
                },
                title: "Secondary model",
              },
            ],
            title: "Controls",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [spatialViewModule()],
    });
    const errors = getToolcraftOrientationGizmoErrors(schema);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "must have provably mutually exclusive visibility conditions",
        ),
        expect.stringContaining("must set label: false"),
        expect.stringContaining("must set keyframeable: false"),
        expect.stringContaining("defaultValue must be a non-degenerate"),
        expect.stringContaining("contains only orientationGizmo"),
        expect.stringContaining("uses Vector for a three-dimensional orbit"),
      ]),
    );
  });
});
