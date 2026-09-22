import { describe, expect, it } from "vitest";
import { mediaSourceModule } from "@/toolcraft/runtime";

import {
  defineContractSchemaFixture,
  contractTransferModeFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import { makeControlAcceptance } from "./app-acceptance.test-utils";

describe("starter acceptance section dependency contract", () => {
  it("rejects stale control section inventory entries", () => {
    const schemaWithInventoryMismatch = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                controls: {
                  kind: {
                    applicability: { mode: "always" as const },
                    defaultValue: "soft",
                    label: "Kind",
                    options: [
                      { label: "Soft", value: "soft" },
                      { label: "Sharp", value: "sharp" },
                    ],
                    orderRole: "mode",
                    target: "shape.kind",
                    type: "select",
                  },
                  count: {
                    applicability: { mode: "always" as const },
                    defaultValue: 12,
                    label: "Count",
                    max: 40,
                    min: 1,
                    orderRole: "detail",
                    target: "shape.count",
                    type: "slider",
                    variant: "continuous",
                  },
                },
                id: "shape",
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

    expect(
      validateContractAcceptance({
        schema: schemaWithInventoryMismatch,
        acceptance: [
          makeControlAcceptance("shape.kind", "select"),
          makeControlAcceptance("shape.count", "slider"),
        ],
        transferMode: contractTransferModeFixture,
        sectionInventory: [
          {
            entity: "Shape",
            entityId: "shape",
            finiteSelectors: [
              {
                reason: "Shape kind changes its own rendered product outcome.",
                role: "parameter",
                target: "shape.kind",
              },
            ],
            groupingReason: "Shape setup",
            id: "shape",
            targets: ["shape.kind"],
            title: "Shape",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'Control Section Inventory entry "Shape" must include a concrete groupingReason explaining why these controls belong together.',
        'Control Section Inventory entry "Shape" is missing rendered target "shape.count". The inventory must cover every product control in the section.',
      ]),
    );
  });

  it("accepts justified workflow splitting even for a small entity", () => {
    const schemaWithWorkflowSplit = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                controls: {
                  size: {
                    applicability: { mode: "always" as const },
                    defaultValue: 64,
                    label: "Size",
                    max: 128,
                    min: 16,
                    orderRole: "primary",
                    target: "object.shape.size",
                    type: "slider",
                    unit: "px",
                    variant: "continuous",
                  },
                },
                id: "shape-structure",
                title: "Shape Structure",
              },
              {
                controls: {
                  count: {
                    applicability: { mode: "always" as const },
                    defaultValue: 12,
                    label: "Count",
                    max: 40,
                    min: 1,
                    orderRole: "detail",
                    target: "object.shape.count",
                    type: "slider",
                    variant: "continuous",
                  },
                },
                id: "shape-density",
                title: "Shape Density",
              },
            ],
            title: "Controls",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    const workflowSplitInventory = [
      {
        entity: "Object shape",
        entityId: "object-shape",
        finiteSelectors: [],
        groupingReason:
          "Structure controls tune the physical footprint of the object.",
        id: "shape-structure",
        splitReason:
          "Structure and density are separate workflow stages in this editor.",
        targets: ["object.shape.size"],
        title: "Shape Structure",
        workflowStage: "structure",
      },
      {
        entity: "Object shape",
        entityId: "object-shape",
        finiteSelectors: [],
        groupingReason:
          "Density controls tune how many objects appear after structure is set.",
        id: "shape-density",
        splitReason:
          "Density is separated from structure because users set count after the shape footprint.",
        targets: ["object.shape.count"],
        title: "Shape Density",
        workflowStage: "density",
      },
    ] as const;

    expect(
      validateContractAcceptance({
        schema: schemaWithWorkflowSplit,
        acceptance: [
          makeControlAcceptance("object.shape.size", "slider"),
          makeControlAcceptance("object.shape.count", "slider"),
        ],
        transferMode: contractTransferModeFixture,
        sectionInventory: workflowSplitInventory,
      }).filter((message) => message.includes("Control Section Inventory") || message.includes("split across sections")),
    ).toEqual([]);
  });

  it("rejects mode-gated controls split away from their selector section", () => {
    const schemaWithSplitModeBranch = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-4",
                controls: {
                  sourceMode: {
                    applicability: { mode: "always" as const },
                    defaultValue: "preset",
                    label: "Source",
                    options: [
                      { label: "Preset", value: "preset" },
                      { label: "Image", value: "image" },
                    ],
                    orderRole: "mode",
                    target: "source.mode",
                    type: "segmented",
                  },
                },
                title: "Source",
              },
              {
                id: "test-section-5",
                controls: {
                  sourceUpload: {
                    accept: "image/*",
                    assetKind: "image",
                    defaultValue: null,
                    label: "Image",
                    orderRole: "input",
                    target: "source.upload",
                    type: "fileDrop",
                    applicability: {
                      all: [{ equals: "image", target: "source.mode" }],
                      mode: "conditional" as const,
                    },
                  },
                },
                title: "Image",
              },
            ],
            title: "Controls",
          },
        },
      },
      modules: [mediaSourceModule()],
    });

    expect(
      validateContractAcceptance({
        schema: schemaWithSplitModeBranch,
        acceptance: [
          makeControlAcceptance("source.mode", "segmented"),
          makeControlAcceptance("source.upload", "fileDrop"),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'Image / sourceUpload is gated by applicability target "source.mode" in Source, but it belongs to the same dependency group. Keep selectors and their dependent controls in one semantic section when they describe one product entity or branch; use conditional applicability for branch-specific controls inside that section instead of splitting branch controls into their own section. Do not use disabledWhen for product controls.',
      ]),
    );
  });

  it("rejects selector branch sections even when targets do not share a prefix", () => {
    const schemaWithSplitOptionBranch = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-6",
                controls: {
                  shapeKind: {
                    applicability: { mode: "always" as const },
                    defaultValue: "generated",
                    label: "Shape",
                    options: [
                      { label: "Generated", value: "generated" },
                      { label: "Library", value: "library" },
                    ],
                    orderRole: "mode",
                    target: "shape.kind",
                    type: "segmented",
                  },
                },
                title: "Shape",
              },
              {
                id: "test-section-7",
                controls: {
                  libraryAsset: {
                    defaultValue: null,
                    label: "Library",
                    orderRole: "input",
                    target: "asset.upload",
                    type: "fileDrop",
                    applicability: {
                      all: [{ equals: "library", target: "shape.kind" }],
                      mode: "conditional" as const,
                    },
                  },
                },
                title: "Library",
              },
            ],
            title: "Controls",
          },
        },
      },
      modules: [mediaSourceModule()],
    });

    expect(
      validateContractAcceptance({
        schema: schemaWithSplitOptionBranch,
        acceptance: [
          makeControlAcceptance("shape.kind", "segmented"),
          makeControlAcceptance("asset.upload", "fileDrop"),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'Library / libraryAsset is gated by applicability target "shape.kind" in Shape, but it belongs to the same dependency group. Keep selectors and their dependent controls in one semantic section when they describe one product entity or branch; use conditional applicability for branch-specific controls inside that section instead of splitting branch controls into their own section. Do not use disabledWhen for product controls.',
      ]),
    );
  });
});
