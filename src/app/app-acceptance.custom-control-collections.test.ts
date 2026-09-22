import { describe, expect, it } from "vitest";

import {
  createContractSectionInventoryFixture,
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";

describe("starter acceptance custom control collection contract", () => {
  it("requires collection-like custom controls to compare both cardinality owners and actions", () => {
    const schema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "masks",
                controls: {
                  maskEditor: {
                    applicability: { mode: "always" as const },
                    defaultValue: { items: [], selectedId: null },
                    label: "Mask shapes",
                    orderRole: "spatial",
                    target: "masks",
                    type: "maskEditor",
                  } as never,
                },
                title: "Masks",
              },
            ],
            title: "Controls",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    expect(
      validateContractAcceptance({
        schema: schema,
        acceptance: [
          {
            automated: true,
            automatedTestName: "mask editor changes output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: mask editor changes output",
            },
            builtInFitCheck: {
              capabilities: [
                "collection",
                "selection",
                "commands",
                "custom-interaction",
                "custom-value-model",
              ],
              checkedBuiltIns: ["select", "vector"],
              closestBuiltIn: "vector",
              productObservable:
                "Adding, selecting, deleting, dragging, and resizing masks changes the composited output.",
              whyInsufficient:
                "Vector can edit one point, but this product needs multiple shape commands, selected item state, deletion, drag, and resize handles.",
            },
            componentType: "maskEditor",
            customControlCoverage: [
              "built-in-gap",
              "kit-primitives",
              "minimal-ui",
              "product-output",
              "runtime-state",
            ],
            evidence: "product-output",
            expectedObservable:
              "Adding rectangle, circle, and triangle masks creates selected editable shapes.",
            fixture: "uploaded image with masks",
            id: "masks",
            kind: "control",
            target: "masks",
            userAction:
              "Add each mask shape, select a mask in the list, delete one mask, drag a canvas mask handle, and resize a selected mask.",
          },
        ],
        sectionInventory: createContractSectionInventoryFixture(schema, [
          {
            entity: "Masks",
            entityId: "masks",
            finiteSelectors: [],
            groupingReason:
              "Mask controls edit one collection of rendered masks.",
            id: "masks",
          },
        ]),
      }),
    ).toEqual([
      "Masks / maskEditor (masks) builtInFitCheck.checkedBuiltIns must include sourceCollection when the custom control owns a repeated runtime item set whose cardinality could be source-owned.",
      "Masks / maskEditor (masks) builtInFitCheck.checkedBuiltIns must include collectionActions when the custom control owns a growable, removable, selectable, or reorderable runtime item set.",
      "Masks / maskEditor (masks) builtInFitCheck.checkedBuiltIns must include actions when the custom control exposes local command buttons such as add, remove, delete, duplicate, sort, normalize, or clear.",
    ]);
  });

  it("detects collection-like custom controls from the value model instead of entity names", () => {
    const schema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "pattern",
                controls: {
                  patternSet: {
                    applicability: { mode: "always" as const },
                    defaultValue: { entries: [], selectedId: null },
                    label: "Pattern set",
                    orderRole: "style",
                    target: "pattern.set",
                    type: "patternSetEditor",
                  } as never,
                },
                title: "Pattern",
              },
            ],
            title: "Controls",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    expect(
      validateContractAcceptance({
        schema: schema,
        acceptance: [
          {
            automated: true,
            automatedTestName: "pattern set changes output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: pattern set changes output",
            },
            builtInFitCheck: {
              capabilities: ["collection", "selection", "custom-value-model"],
              checkedBuiltIns: ["select", "vector"],
              closestBuiltIn: "select",
              productObservable:
                "Editing the chosen pattern entry changes the rendered pattern output.",
              whyInsufficient:
                "Select can choose one preset, but this product needs runtime entry state with selected item editing.",
            },
            componentType: "patternSetEditor",
            customControlCoverage: [
              "built-in-gap",
              "kit-primitives",
              "minimal-ui",
              "product-output",
              "runtime-state",
            ],
            evidence: "product-output",
            expectedObservable:
              "Editing the pattern set changes the rendered product output.",
            fixture: "pattern set fixture",
            id: "pattern.set",
            kind: "control",
            target: "pattern.set",
            userAction: "Edit the selected entry.",
          },
        ],
        sectionInventory: createContractSectionInventoryFixture(schema, [
          {
            entity: "Pattern",
            entityId: "pattern",
            finiteSelectors: [],
            groupingReason:
              "Pattern controls edit one rendered pattern collection.",
            id: "pattern",
          },
        ]),
      }),
    ).toEqual([
      "Pattern / patternSet (pattern.set) builtInFitCheck.checkedBuiltIns must include sourceCollection when the custom control owns a repeated runtime item set whose cardinality could be source-owned.",
      "Pattern / patternSet (pattern.set) builtInFitCheck.checkedBuiltIns must include collectionActions when the custom control owns a growable, removable, selectable, or reorderable runtime item set.",
    ]);
  });

  it("does not treat numeric tuple custom values as collection owners", () => {
    const schema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "focus",
                controls: {
                  focalPoint: {
                    applicability: { mode: "always" as const },
                    defaultValue: [0.5, 0.5],
                    label: "Focal point",
                    orderRole: "spatial",
                    target: "focal.point",
                    type: "focalPointPad",
                  } as never,
                },
                title: "Focus",
              },
            ],
            title: "Controls",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    expect(
      validateContractAcceptance({
        schema: schema,
        acceptance: [
          {
            automated: true,
            automatedTestName: "focal point changes output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: focal point changes output",
            },
            builtInFitCheck: {
              capabilities: ["custom-interaction"],
              checkedBuiltIns: ["vector"],
              closestBuiltIn: "vector",
              productObservable:
                "Dragging the focal point changes the rendered focus position.",
              whyInsufficient:
                "Vector edits x/y, but this product needs a canvas hit target with validation tied to the rendered focal point.",
            },
            componentType: "focalPointPad",
            customControlCoverage: [
              "built-in-gap",
              "kit-primitives",
              "minimal-ui",
              "product-output",
              "runtime-state",
            ],
            evidence: "product-output",
            expectedObservable:
              "Dragging the focal point changes the rendered product output.",
            fixture: "focus fixture",
            id: "focal.point",
            kind: "control",
            target: "focal.point",
            userAction: "Drag the focal point.",
          },
        ],
        sectionInventory: createContractSectionInventoryFixture(schema, [
          {
            entity: "Focus",
            entityId: "focus",
            finiteSelectors: [],
            groupingReason: "Focus controls position the rendered focal point.",
            id: "focus",
          },
        ]),
      }),
    ).toEqual([]);
  });
});
