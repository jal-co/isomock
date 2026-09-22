import { describe, expect, it } from "vitest";
import { spatialViewModule, timelineModule } from "@/toolcraft/runtime";

import { getToolcraftViewInteractionErrors } from "./acceptance/view-interaction";
import type {
  ToolcraftProductReadiness,
  ToolcraftTransferMode,
  ToolcraftViewInteractionIntent,
} from "./acceptance/types";
import {
  defineContractSchemaFixture,
  validateContractAcceptance,
  validateContractAcceptanceDiagnostics,
} from "./app-acceptance.contract-fixtures";

const defaultPose = {
  position: [0, 0, 5],
  up: [0, 1, 0],
} as const;

const noAnimation: ToolcraftTransferMode = {
  animationIntent: { mode: "none" },
  mode: "new-toolcraft-app",
  referenceInputs: [],
};

const timelineAnimation: ToolcraftTransferMode = {
  animationIntent: {
    loopDuration: {
      evidence:
        "The requested camera path completes one seamless cycle in six seconds.",
      seconds: 6,
      source: "user-request",
    },
    mode: "timeline-playback",
  },
  mode: "new-toolcraft-app",
  referenceInputs: [],
};

function createProductReadiness(
  viewInteraction: ToolcraftViewInteractionIntent,
): ToolcraftProductReadiness {
  return {
    exportIntent: {
      image: { mode: "toolcraft-default" },
      svg: { mode: "not-requested" },
      video: { mode: "not-requested" },
    },
    interactionOwnership: [],
    mode: "product",
    productName: "Spatial fixture",
    productSummary: "A fixture used to validate spatial view ownership.",
    requestedBehavior:
      "Render and interact with the configured product output.",
    viewInteraction,
  };
}

function createSchema({
  orientationTargets = [],
  timeline = false,
}: {
  orientationTargets?: readonly string[];
  timeline?: boolean;
} = {}) {
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
                ...Object.fromEntries(
                  orientationTargets.map((target, index) => [
                    `orientation${index + 1}`,
                    {
                      applicability:
                        orientationTargets.length > 1
                          ? {
                              all: [
                                {
                                  equals: `model-${index + 1}`,
                                  target: "model.active",
                                },
                              ],
                              mode: "conditional" as const,
                            }
                          : { mode: "always" as const },
                      defaultValue: defaultPose,
                      keyframeable: false,
                      label: false,
                      target,
                      type: "orientationGizmo" as const,
                    },
                  ]),
                ),
              },
              title: "Model",
            },
          ],
          title: "Controls",
        },
      },
    },
    modules: [
      ...(orientationTargets.length > 0 ? [spatialViewModule()] : []),
      ...(timeline
        ? [timelineModule({ defaultDurationSeconds: 6, mode: "playback" })]
        : []),
    ],
  });
}

describe("Toolcraft spatial view interaction intent", () => {
  it("rejects stale product readiness that omits the typed intent", () => {
    const productReadiness = {
      exportIntent: {
        image: { mode: "toolcraft-default" },
        svg: { mode: "not-requested" },
        video: { mode: "not-requested" },
      },
      mode: "product",
      productName: "Legacy fixture",
      productSummary: "An old product declaration.",
      requestedBehavior: "Render output.",
    } as unknown as ToolcraftProductReadiness;

    expect(
      getToolcraftViewInteractionErrors({
        productReadiness,
        schema: createSchema(),
        transferMode: noAnimation,
      }),
    ).toEqual([
      expect.stringContaining(
        "must declare viewInteraction before controls or renderer code",
      ),
    ]);
  });

  it("rejects an orbit scene that silently omits the orientation gizmo", () => {
    const errors = getToolcraftViewInteractionErrors({
      productReadiness: createProductReadiness({
        mode: "orbit",
        orientationTargets: ["view.orbit"],
      }),
      schema: createSchema(),
      transferMode: noAnimation,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'orbit target "view.orbit" requires a matching orientationGizmo',
        ),
      ]),
    );
  });

  it("accepts orbit intent only when declared targets match schema gizmos", () => {
    const validErrors = getToolcraftViewInteractionErrors({
      productReadiness: createProductReadiness({
        mode: "orbit",
        orientationTargets: ["view.orbit"],
      }),
      schema: createSchema({ orientationTargets: ["view.orbit"] }),
      transferMode: noAnimation,
    });
    const mismatchedErrors = getToolcraftViewInteractionErrors({
      productReadiness: createProductReadiness({
        mode: "orbit",
        orientationTargets: ["view.orbit", "view.orbit"],
      }),
      schema: createSchema({ orientationTargets: ["model.orbit"] }),
      transferMode: noAnimation,
    });

    expect(validErrors).toEqual([]);
    expect(mismatchedErrors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("orientationTargets must be unique"),
        expect.stringContaining(
          'orbit target "view.orbit" requires a matching orientationGizmo',
        ),
        expect.stringContaining(
          'orientationGizmo target "model.orbit" is missing from orbit orientationTargets',
        ),
      ]),
    );
  });

  it("rejects orientation gizmos for products classified as non-spatial", () => {
    const errors = getToolcraftViewInteractionErrors({
      productReadiness: createProductReadiness({
        mode: "non-spatial",
        reason: "The output is a two-dimensional image compositor.",
      }),
      schema: createSchema({ orientationTargets: ["view.orbit"] }),
      transferMode: noAnimation,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "non-spatial viewInteraction cannot declare orientationGizmo",
        ),
      ]),
    );
  });

  it("allows fixed framing only with positive request or behavioral-reference authority", () => {
    const explicitEvidence = getToolcraftViewInteractionErrors({
      productReadiness: createProductReadiness(
        {
          authority: {
            kind: "explicit-user-request",
            requestQuote: "Keep the camera locked to this framing.",
          },
          mode: "fixed-camera",
        } as unknown as ToolcraftViewInteractionIntent,
      ),
      schema: createSchema(),
      transferMode: noAnimation,
    });

    expect(explicitEvidence).toEqual([]);
  });

  it.each([
    {
      intent: {
        authority: { kind: "explicit-user-request", requestQuote: " " },
        mode: "fixed-camera",
      },
      message: "requestQuote must be non-empty",
      name: "an empty request quote",
    },
    {
      intent: {
        authority: {
          kind: "inspected-behavioral-reference",
          observedBehavior: "The reference keeps one locked composition.",
          referenceId: " ",
        },
        mode: "fixed-camera",
      },
      message: "referenceId must be non-empty",
      name: "an empty behavioral reference id",
    },
    {
      intent: {
        authority: {
          kind: "inspected-behavioral-reference",
          observedBehavior: " ",
          referenceId: "reference-camera-lock",
        },
        mode: "fixed-camera",
      },
      message: "observedBehavior must be non-empty",
      name: "an empty observed behavior",
    },
    {
      intent: {
        authority: { kind: "agent-inference", requestQuote: "Looks fixed." },
        mode: "fixed-camera",
      },
      message: "authority kind must be explicit-user-request or inspected-behavioral-reference",
      name: "an unknown authority kind",
    },
    {
      intent: {
        evidence: "Orbit was not requested, therefore framing is fixed.",
        mode: "fixed-camera",
        source: "explicit-user-request",
      },
      message: "requires a positive authority object",
      name: "the legacy source and evidence shape",
    },
  ])("rejects $name", ({ intent, message }) => {
    const errors = getToolcraftViewInteractionErrors({
      productReadiness: createProductReadiness(
        intent as unknown as ToolcraftViewInteractionIntent,
      ),
      schema: createSchema(),
      transferMode: noAnimation,
    });

    expect(errors).toEqual(
      expect.arrayContaining([expect.stringContaining(message)]),
    );
  });

  it("allows timeline-owned camera motion only with a real Toolcraft timeline intent", () => {
    const intent = {
      authority: {
        kind: "inspected-behavioral-reference",
        observedBehavior:
          "Playback follows one authored camera path and exposes no orbit interaction.",
        referenceId: "reference-camera-playback",
      },
      mode: "timeline-camera",
    } as unknown as ToolcraftViewInteractionIntent;
    const missingTimeline = getToolcraftViewInteractionErrors({
      productReadiness: createProductReadiness(intent),
      schema: createSchema(),
      transferMode: noAnimation,
    });
    const validTimeline = getToolcraftViewInteractionErrors({
      productReadiness: createProductReadiness(intent),
      schema: createSchema({ timeline: true }),
      transferMode: timelineAnimation,
    });

    expect(missingTimeline).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "timeline-camera requires timeline-playback or timeline-keyframes animation intent",
        ),
        expect.stringContaining(
          "timeline-camera requires an enabled Toolcraft timeline",
        ),
      ]),
    );
    expect(validTimeline).toEqual([]);
  });

  it("registers orbit omission as a blocking renderer-view-interaction diagnostic", () => {
    const productReadiness = createProductReadiness({
      mode: "orbit",
      orientationTargets: ["view.orbit"],
    });
    const errors = validateContractAcceptance({ productReadiness });
    const diagnostics = validateContractAcceptanceDiagnostics({
      productReadiness,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("requires a matching orientationGizmo"),
      ]),
    );
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "appProductReadiness.viewInteraction",
          ruleId: "renderer-view-interaction",
          severity: "error",
        }),
      ]),
    );
  });
});
