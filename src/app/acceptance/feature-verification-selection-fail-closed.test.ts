import { defineToolcraft } from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";
import { createToolcraftFeatureVerificationSelection } from "./feature-verification-selection";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlSectionInventoryEntry,
} from "./types";
const schema = defineToolcraft({
  base: {
    identity: {
      id: "acceptance-fixture",
      title: "Acceptance fixture",
    },
    canvas: { enabled: true },
    panels: {
      controls: {
        sections: [
          {
            controls: {
              frosting: {
                applicability: {
                  all: [{ equals: "frosted", target: "material.layer" }],
                  mode: "conditional",
                },
                defaultValue: "#ffffff",
                target: "material.frosting",
                type: "color",
              },
              gloss: {
                applicability: { mode: "always" },
                defaultValue: 0.5,
                max: 1,
                min: 0,
                target: "material.gloss",
                type: "slider",
              },
              layer: {
                applicability: { mode: "always" },
                defaultValue: "frosted",
                options: [
                  { label: "Frosted", value: "frosted" },
                  { label: "Plain", value: "plain" },
                ],
                target: "material.layer",
                type: "segmented",
              },
            },
            id: "material",
            title: "Material",
          },
        ],
        title: "Controls",
      },
    },
  },
  modules: [],
});
const validInventory = [
  {
    entity: "Material",
    entityId: "material",
    finiteSelectors: [
      {
        affectedTargets: ["material.gloss"],
        reason:
          "Layer selects material branches with different coating controls.",
        role: "branch",
        target: "material.layer",
      },
    ],
    groupingReason: "These controls define the rendered material appearance.",
    id: "material",
    targets: ["material.frosting", "material.gloss", "material.layer"],
    title: "Material",
  },
] as const satisfies readonly ToolcraftControlSectionInventoryEntry[];
const acceptance = [
  "material.frosting",
  "material.gloss",
  "material.layer",
].map(
  (id): ToolcraftComponentAcceptance => ({
    automated: true,
    automatedTestName: `${id} unit`,
    browser: {
      budget: "standard",
      file: "e2e/product-material.spec.ts",
      testName: `browser: ${id}`,
    },
    componentType: "control",
    evidence: "product-output",
    expectedObservable: `${id} changes output.`,
    fixture: "material fixture",
    id,
    kind: "control",
    target: id,
    userAction: `Change ${id}.`,
  }),
);
function createPlan(
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[],
) {
  return createToolcraftFeatureVerificationSelection({
    acceptance,
    request: {
      acceptanceIds: ["material.layer"],
      mode: "ids",
      version: 1,
    },
    schema,
    sectionInventory,
  });
}
function withFiniteSelectors(
  finiteSelectors: readonly unknown[],
): readonly ToolcraftControlSectionInventoryEntry[] {
  return [
    { ...validInventory[0], finiteSelectors },
  ] as unknown as readonly ToolcraftControlSectionInventoryEntry[];
}
describe("Toolcraft feature verification selector fail-closed boundary", () => {
  it("rejects a predicate-owning branch mislabeled as a parameter", () => {
    expect(() =>
      createPlan(
        withFiniteSelectors([
          {
            reason: "Layer changes only its own material output.",
            role: "parameter",
            target: "material.layer",
          },
        ]),
      ),
    ).toThrow(/material\.layer.*applicability predicates.*branch/iu);
  });
  it.each([
    [
      "missing",
      {
        reason:
          "Layer selects material branches with different coating controls.",
        role: "branch",
        target: "material.layer",
      },
      /material\.layer.*must declare affectedTargets/iu,
    ],
    [
      "unknown",
      {
        affectedTargets: ["material.missing"],
        reason:
          "Layer selects material branches with different coating controls.",
        role: "branch",
        target: "material.layer",
      },
      /material\.layer.*material\.missing.*not a product control/iu,
    ],
  ])("rejects %s branch affected targets", (_label, selector, expected) => {
    expect(() => createPlan(withFiniteSelectors([selector]))).toThrow(expected);
  });
  it("rejects structural section inventory errors before selection", () => {
    expect(() =>
      createPlan([{ ...validInventory[0], id: "wrong-section" }]),
    ).toThrow(/wrong-section.*no rendered product controls section/iu);
  });
  it("rejects a predicate selector without a finite case domain", () => {
    const unsupportedSchema = defineToolcraft({
      base: {
        identity: {
          id: "acceptance-fixture",
          title: "Acceptance fixture",
        },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                controls: {
                  amount: {
                    applicability: { mode: "always" },
                    defaultValue: 0.5,
                    max: 1,
                    min: 0,
                    target: "shape.amount",
                    type: "slider",
                  },
                  detail: {
                    applicability: {
                      all: [{ greaterThan: 0.5, target: "shape.amount" }],
                      mode: "conditional",
                    },
                    defaultValue: "#ffffff",
                    target: "shape.detail",
                    type: "color",
                  },
                },
                id: "shape",
                title: "Shape",
              },
            ],
            title: "Controls",
          },
        },
      },
      modules: [],
    });
    const unsupportedInventory = [
      {
        entity: "Shape",
        entityId: "shape",
        finiteSelectors: [],
        groupingReason: "Amount and detail define the rendered shape.",
        id: "shape",
        targets: ["shape.amount", "shape.detail"],
        title: "Shape",
      },
    ] as const satisfies readonly ToolcraftControlSectionInventoryEntry[];
    expect(() =>
      createToolcraftFeatureVerificationSelection({
        acceptance: [
          { ...acceptance[0]!, id: "shape.amount", target: "shape.amount" },
          { ...acceptance[1]!, id: "shape.detail", target: "shape.detail" },
        ],
        request: {
          acceptanceIds: ["shape.amount"],
          mode: "ids",
          version: 1,
        },
        schema: unsupportedSchema,
        sectionInventory: unsupportedInventory,
      }),
    ).toThrow(/shape\.amount.*not a supported applicability selector/iu);
  });
});
