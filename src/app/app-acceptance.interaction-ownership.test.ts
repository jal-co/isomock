import { describe, expect, it } from "vitest";

import { getToolcraftInteractionOwnershipErrors } from "./acceptance/interaction-ownership";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftInteractionCapability,
  ToolcraftInteractionOwnershipEntry,
  ToolcraftInteractionSurface,
  ToolcraftProductReadiness,
} from "./acceptance/types";
import { collectToolcraftVisibleAcceptanceControls } from "./acceptance/validate-coverage";
import {
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";

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
              position: {
                applicability: { mode: "always" as const },
                defaultValue: { x: 0, y: 0 },
                label: "Position",
                target: "output.position",
                type: "vector",
              },
            },
            title: "Output",
          },
        ],
        title: "Controls",
      },
    },
    persistence: { storage: "none" },
  },
  modules: [],
});

const controls = collectToolcraftVisibleAcceptanceControls(schema);

const customSchema = defineContractSchemaFixture({
  base: {
    identity: { id: "contract-fixture", title: "Contract fixture" },
    canvas: { enabled: true },
    panels: {
      controls: {
        sections: [
          {
            id: "test-section-2",
            controls: {
              spatialMap: {
                applicability: { mode: "always" as const },
                defaultValue: { x: 0, y: 0 },
                label: "Spatial map",
                target: "output.position",
                type: "spatialMap",
              } as never,
            },
            title: "Output",
          },
        ],
        title: "Controls",
      },
    },
    persistence: { storage: "none" },
  },
  modules: [],
});

const customControls = collectToolcraftVisibleAcceptanceControls(customSchema);

function ownership({
  capability,
  id,
  source = "usability-analysis",
  surface,
}: {
  capability: ToolcraftInteractionCapability;
  id: string;
  source?: ToolcraftInteractionOwnershipEntry["evidence"]["source"];
  surface: ToolcraftInteractionSurface;
}): ToolcraftInteractionOwnershipEntry {
  const base = {
    alternative: {
      reason:
        surface === "canvas"
          ? "A panel copy would separate the same operation from visible output without adding a useful capability."
          : "A canvas copy would add output chrome without improving this non-spatial operation.",
      surface: (surface === "canvas"
        ? "panel"
        : "canvas") as ToolcraftInteractionSurface,
    },
    evidence: {
      detail:
        source === "reference"
          ? "The inspected Gradient Reference application exposes this operation on the selected surface."
          : "The operation was compared across both surfaces for spatial feedback, precision, accessibility, and clutter.",
      source,
    },
    id,
    reason:
      surface === "canvas"
        ? "The operation maps directly to visible geometry and needs immediate spatial feedback."
        : "The operation edits an abstract property that remains discoverable and accessible in the panel.",
    surface,
    target: "output.position",
  };

  if (capability === "precise-value-entry" || capability === "property-edit") {
    return {
      ...base,
      capability,
      selectionScope: { mode: "global" },
    };
  }

  return { ...base, capability };
}

function readiness(
  interactionOwnership: readonly ToolcraftInteractionOwnershipEntry[],
): ToolcraftProductReadiness {
  return {
    exportIntent: {
      image: { mode: "toolcraft-default" },
      svg: { mode: "not-requested" },
      video: { mode: "not-requested" },
    },
    interactionOwnership,
    mode: "product",
    productName: "Interaction fixture",
    productSummary: "A fixture for canvas and panel ownership decisions.",
    requestedBehavior:
      "Edit one product output through Toolcraft interactions.",
    viewInteraction: {
      mode: "non-spatial",
      reason:
        "The fixture edits two-dimensional output without a three-dimensional view.",
    },
  };
}

function acceptance({
  id,
  interactionId,
  kind,
}: {
  id: string;
  interactionId?: string;
  kind: "canvas-handle" | "control";
}): ToolcraftComponentAcceptance {
  return {
    automated: true,
    automatedTestName: `${id} changes runtime state`,
    browser: {
      budget: "standard",
      file: "e2e/app-controls.spec.ts",
      testName: `browser: ${id} changes output`,
    },
    ...(kind === "canvas-handle"
      ? {
          canvasHandle: {
            outputObservable: "The output position changes after the gesture.",
            testId: id,
            writesTarget: "output.position",
          },
        }
      : {}),
    componentType: kind === "canvas-handle" ? "canvas-handle" : "vector",
    evidence: "product-output",
    expectedObservable: "The product output changes after the operation.",
    fixture: "Visible positioned output",
    id,
    interactionId,
    kind,
    target: "output.position",
    userAction:
      kind === "canvas-handle" ? "Drag the output." : "Edit its property.",
  };
}

describe("Toolcraft interaction surface ownership", () => {
  it("runs ownership validation through the protected acceptance pipeline", () => {
    const productReadiness = {
      exportIntent: {
        image: { mode: "toolcraft-default" },
        svg: { mode: "not-requested" },
        video: { mode: "not-requested" },
      },
      mode: "product",
      productName: "Legacy fixture",
      productSummary:
        "A product declaration created before interaction ownership.",
      requestedBehavior: "Edit product output.",
      viewInteraction: {
        mode: "non-spatial",
        reason: "The fixture is two-dimensional.",
      },
    } as unknown as ToolcraftProductReadiness;

    expect(validateContractAcceptance({ productReadiness })).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "must declare interactionOwnership before controls",
        ),
      ]),
    );
  });

  it("rejects product readiness that omits the ownership inventory", () => {
    const productReadiness = {
      exportIntent: {
        image: { mode: "toolcraft-default" },
        svg: { mode: "not-requested" },
        video: { mode: "not-requested" },
      },
      mode: "product",
      productName: "Legacy fixture",
      productSummary:
        "A product declaration created before interaction ownership.",
      requestedBehavior: "Edit product output.",
      viewInteraction: {
        mode: "non-spatial",
        reason: "The fixture is two-dimensional.",
      },
    } as unknown as ToolcraftProductReadiness;

    expect(
      getToolcraftInteractionOwnershipErrors({
        acceptance: [],
        controls,
        productReadiness,
      }),
    ).toEqual([
      expect.stringContaining(
        "must declare interactionOwnership before controls",
      ),
    ]);
  });

  it("rejects the same target and operation capability on canvas and panel", () => {
    expect(
      getToolcraftInteractionOwnershipErrors({
        acceptance: [
          acceptance({
            id: "canvas-position",
            interactionId: "canvas-position-drag",
            kind: "canvas-handle",
          }),
          acceptance({
            id: "panel-position",
            interactionId: "panel-position-drag",
            kind: "control",
          }),
        ],
        controls,
        productReadiness: readiness([
          ownership({
            capability: "direct-spatial-edit",
            id: "canvas-position-drag",
            surface: "canvas",
          }),
          ownership({
            capability: "direct-spatial-edit",
            id: "panel-position-drag",
            surface: "panel",
          }),
        ]),
      }),
    ).toEqual([
      expect.stringContaining(
        'target "output.position" duplicates direct-spatial-edit across canvas and panel',
      ),
    ]);
  });

  it("allows complementary operations for one target across surfaces", () => {
    expect(
      getToolcraftInteractionOwnershipErrors({
        acceptance: [
          acceptance({
            id: "canvas-position",
            interactionId: "canvas-position-drag",
            kind: "canvas-handle",
          }),
          acceptance({
            id: "panel-properties",
            interactionId: "panel-position-properties",
            kind: "control",
          }),
        ],
        controls,
        productReadiness: readiness([
          ownership({
            capability: "direct-spatial-edit",
            id: "canvas-position-drag",
            source: "reference",
            surface: "canvas",
          }),
          ownership({
            capability: "property-edit",
            id: "panel-position-properties",
            surface: "panel",
          }),
        ]),
      }),
    ).toEqual([]);
  });

  it("rejects one interaction id implemented on both surfaces", () => {
    expect(
      getToolcraftInteractionOwnershipErrors({
        acceptance: [
          acceptance({
            id: "canvas-position",
            interactionId: "position-drag",
            kind: "canvas-handle",
          }),
          acceptance({
            id: "panel-position",
            interactionId: "position-drag",
            kind: "control",
          }),
        ],
        controls,
        productReadiness: readiness([
          ownership({
            capability: "direct-spatial-edit",
            id: "position-drag",
            surface: "canvas",
          }),
        ]),
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "panel-position renders on panel, but interactionOwnership position-drag assigns the operation to canvas",
        ),
        expect.stringContaining(
          "position-drag is implemented on both canvas and panel",
        ),
      ]),
    );
  });

  it("requires ownership links for canvas handles and overlapping built-in panel controls", () => {
    expect(
      getToolcraftInteractionOwnershipErrors({
        acceptance: [
          acceptance({ id: "canvas-position", kind: "canvas-handle" }),
          acceptance({ id: "panel-position", kind: "control" }),
        ],
        controls,
        productReadiness: readiness([]),
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "canvas-position canvas handle must reference interactionId",
        ),
        expect.stringContaining(
          "panel-position panel control shares output.position with a canvas handle and must reference interactionId",
        ),
      ]),
    );
  });

  it("requires custom interaction controls to declare their surface owner", () => {
    const customAcceptance = {
      ...acceptance({ id: "panel-spatial-map", kind: "control" }),
      builtInFitCheck: {
        capabilities: ["custom-interaction"],
        checkedBuiltIns: ["vector"],
        closestBuiltIn: "vector",
        productObservable:
          "Dragging the custom spatial map changes the visible product position.",
        whyInsufficient:
          "The built-in vector cannot express the requested multi-item spatial interaction.",
      },
      componentType: "spatialMap",
    } satisfies ToolcraftComponentAcceptance;

    expect(
      getToolcraftInteractionOwnershipErrors({
        acceptance: [customAcceptance],
        controls: customControls,
        productReadiness: readiness([]),
      }),
    ).toEqual([
      expect.stringContaining(
        "panel-spatial-map custom interaction control must reference interactionId",
      ),
    ]);
  });

  it("rejects duplicate ownership ids and unproved inventory operations", () => {
    expect(
      getToolcraftInteractionOwnershipErrors({
        acceptance: [],
        controls,
        productReadiness: readiness([
          ownership({
            capability: "property-edit",
            id: "position-property",
            surface: "panel",
          }),
          ownership({
            capability: "precise-value-entry",
            id: "position-property",
            surface: "panel",
          }),
        ]),
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "interactionOwnership id position-property must be unique",
        ),
        expect.stringContaining(
          "position-property interactionOwnership has no matching acceptance row",
        ),
      ]),
    );
  });

  it("rejects weak evidence, same-surface alternatives, and unknown targets", () => {
    const invalid = {
      ...ownership({
        capability: "property-edit",
        id: "invalid-property",
        surface: "panel",
      }),
      alternative: { reason: "No", surface: "panel" },
      evidence: { detail: "Thin", source: "reference" },
      reason: "Weak",
      target: "missing.target",
    } as ToolcraftInteractionOwnershipEntry;

    expect(
      getToolcraftInteractionOwnershipErrors({
        acceptance: [],
        controls,
        productReadiness: readiness([invalid]),
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("invalid-property target missing.target"),
        expect.stringContaining("invalid-property reason must explain"),
        expect.stringContaining(
          "invalid-property evidence.detail must identify",
        ),
        expect.stringContaining(
          "invalid-property alternative.surface must be canvas",
        ),
        expect.stringContaining(
          "invalid-property alternative.reason must explain",
        ),
      ]),
    );
  });
});
