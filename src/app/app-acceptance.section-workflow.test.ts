import type { ToolcraftControlSectionInventoryEntry } from "./acceptance/types";
import { describe, expect, it } from "vitest";

import {
  defineContractSchemaFixture,
  validateContractAcceptanceDiagnostics,
} from "./app-acceptance.contract-fixtures";

const schema = defineContractSchemaFixture({
  base: {
    identity: { id: "workflow-fixture", title: "Workflow fixture" },
    canvas: { enabled: true },
    panels: {
      controls: {
        title: "Controls",
        sections: [
          {
            id: "effect-presence",
            title: "Effect Presence",
            controls: {
              visible: {
                applicability: { mode: "always" },
                type: "switch",
                defaultValue: true,
                label: "Visible",
                target: "effect.visible",
              },
            },
          },
          {
            id: "effect-envelope",
            title: "Effect Envelope",
            controls: {
              strength: {
                applicability: {
                  mode: "conditional",
                  all: [{ target: "effect.visible", equals: true }],
                },
                type: "slider",
                sliderValueKind: "continuous",
                defaultValue: 0.5,
                min: 0,
                max: 1,
                label: "Strength",
                target: "effect.strength",
              },
            },
          },
        ],
      },
    },
  },
  modules: [],
});

const inventory: readonly ToolcraftControlSectionInventoryEntry[] = [
  {
    entity: "Product effect",
    entityId: "product-effect",
    id: "effect-presence",
    title: "Effect Presence",
    targets: ["effect.visible"],
    finiteSelectors: [
      {
        role: "branch",
        target: "effect.visible",
        affectedTargets: [],
        reason: "Visibility gates the effect envelope settings.",
      },
    ],
    groupingReason:
      "This workflow controls whether the complete effect participates.",
    workflowStage: "presence",
    splitReason:
      "Presence is edited and reset separately from detailed envelope tuning.",
  },
  {
    entity: "Product effect",
    entityId: "product-effect",
    id: "effect-envelope",
    title: "Effect Envelope",
    targets: ["effect.strength"],
    finiteSelectors: [],
    groupingReason:
      "This workflow tunes the envelope without changing effect presence.",
    workflowStage: "envelope",
    splitReason:
      "Envelope tuning has a separate reset scope from effect presence.",
  },
];

function validateSections(
  entries: readonly ToolcraftControlSectionInventoryEntry[],
) {
  return validateContractAcceptanceDiagnostics({
    schema,
    sectionInventory: entries,
  })
    .filter(
      ({ ruleId }) =>
        ruleId === "controls-section-inventory-required" ||
        ruleId === "controls-component-layout-invariants",
    )
    .map(({ message }) => message);
}

describe("semantic section workflow ownership", () => {
  it("accepts a justified small workflow split across a selector dependency", () => {
    expect(validateSections(inventory)).toEqual([]);
  });

  it("does not accept shared identity without stage evidence", () => {
    expect(
      validateSections(
        inventory.map((entry) => ({ ...entry, workflowStage: undefined })),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("must declare workflowStage"),
      ]),
    );
  });

  it("does not accept shared identity without a concrete split reason", () => {
    expect(
      validateSections(
        inventory.map((entry) => ({ ...entry, splitReason: undefined })),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("must declare splitReason"),
      ]),
    );
  });

  it("rejects duplicate stages regardless of section size", () => {
    expect(
      validateSections(
        inventory.map((entry) => ({ ...entry, workflowStage: "editing" })),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('repeats workflowStage "editing"'),
      ]),
    );
  });

  it("does not use unrelated entity declarations to bypass dependency ownership", () => {
    expect(
      validateSections(
        inventory.map((entry) => ({ ...entry, entityId: entry.id })),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("same dependency group"),
      ]),
    );
  });

  it("preserves exact target ownership for workflow stages", () => {
    expect(
      validateSections(
        inventory.map((entry) => ({ ...entry, targets: ["effect.visible"] })),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('missing rendered target "effect.strength"'),
      ]),
    );
  });
});
