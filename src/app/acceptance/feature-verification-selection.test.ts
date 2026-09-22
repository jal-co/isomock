import { defineToolcraft } from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";

import {
  createToolcraftFeatureVerificationSelection,
  type ToolcraftFeatureVerificationRequest,
} from "./feature-verification-selection";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlSectionInventoryEntry,
} from "./types";

function acceptance(
  id: string,
  target: string,
  kind: ToolcraftComponentAcceptance["kind"] = "control",
): ToolcraftComponentAcceptance {
  return {
    automated: true,
    automatedTestName: `${id} unit`,
    browser: {
      budget: "standard",
      file: "e2e/app-controls.spec.ts",
      testName: `browser: ${id}`,
    },
    componentType: kind === "control" ? "control" : "runtime",
    evidence: "product-output",
    expectedObservable: `${id} changes output.`,
    fixture: "feature verification fixture",
    id,
    kind,
    target,
    userAction: `Change ${id}.`,
  };
}

const schema = defineToolcraft({
  base: {
    identity: { id: "contract-fixture", title: "Contract fixture" },
    canvas: { enabled: true },
    panels: {
      controls: {
        sections: [
          {
            controls: {
              character: {
                applicability: { mode: "always" },
                defaultValue: "round",
                label: "Character",
                options: [
                  { label: "Round", value: "round" },
                  { label: "Sharp", value: "sharp" },
                ],
                target: "material.character",
                type: "select",
              },
              frosting: {
                applicability: {
                  all: [{ equals: "frosted", target: "material.layer" }],
                  mode: "conditional",
                },
                defaultValue: "#FFFFFF",
                label: "Frosting",
                target: "material.frosting",
                type: "color",
              },
              gloss: {
                applicability: { mode: "always" },
                defaultValue: 0.5,
                label: "Gloss",
                max: 1,
                min: 0,
                target: "material.gloss",
                type: "slider",
              },
              layer: {
                applicability: { mode: "always" },
                defaultValue: "frosted",
                label: "Layer",
                options: [
                  { label: "Frosted", value: "frosted" },
                  { label: "Chocolate", value: "chocolate" },
                ],
                target: "material.layer",
                type: "segmented",
              },
            },
            id: "material",
            title: "Material",
          },
          {
            controls: {
              intensity: {
                applicability: { mode: "always" },
                defaultValue: 0.5,
                label: "Intensity",
                max: 1,
                min: 0,
                target: "lighting.intensity",
                type: "slider",
              },
            },
            id: "lighting",
            title: "Lighting",
          },
        ],
        title: "Controls",
      },
    },
  },
  modules: [],
});

const sectionInventory = [
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
      {
        reason: "Character changes its own accepted material outcome only.",
        role: "parameter",
        target: "material.character",
      },
    ],
    groupingReason: "Layer, frosting, and gloss define one material.",
    id: "material",
    targets: [
      "material.character",
      "material.layer",
      "material.frosting",
      "material.gloss",
    ],
    title: "Material",
  },
  {
    entity: "Lighting",
    entityId: "lighting",
    finiteSelectors: [],
    groupingReason: "Lighting owns its independent intensity.",
    id: "lighting",
    targets: ["lighting.intensity"],
    title: "Lighting",
  },
] as const satisfies readonly ToolcraftControlSectionInventoryEntry[];

const browserAcceptance = [
  acceptance("lighting.intensity", "lighting.intensity"),
  {
    ...acceptance("material.character", "material.character"),
    browser: {
      budget: "standard" as const,
      file: "e2e/product-material.spec.ts" as const,
      testName: "browser: material.character",
    },
  },
  acceptance("material.exportedAppearance", "material.frosting", "runtime"),
  acceptance("material.frosting", "material.frosting"),
  acceptance("material.gloss", "material.gloss"),
  acceptance("material.layer", "material.layer"),
] as const;

function select(
  request: ToolcraftFeatureVerificationRequest,
  acceptanceRows: readonly ToolcraftComponentAcceptance[] = browserAcceptance,
) {
  return createToolcraftFeatureVerificationSelection({
    acceptance: acceptanceRows,
    request,
    schema,
    sectionInventory,
  });
}

describe("Toolcraft feature verification selection", () => {
  it("keeps a finite parameter on its exact version-2 browser proof", () => {
    expect(
      select({
        acceptanceIds: ["material.character"],
        mode: "ids",
        version: 1,
      }),
    ).toEqual({
      acceptanceIds: ["material.character"],
      scenarios: [
        {
          acceptanceIds: ["material.character"],
          budget: "standard",
          file: "e2e/product-material.spec.ts",
          testName: "browser: material.character",
        },
      ],
      version: 2,
    });
  });

  it("keeps a leaf control focused", () => {
    expect(
      select({
        acceptanceIds: ["material.gloss"],
        mode: "ids",
        version: 1,
      }).acceptanceIds,
    ).toEqual(["material.gloss"]);
  });

  it("expands a finite selector to semantic peers that derive branch cases", () => {
    const selection = select({
      acceptanceIds: ["material.layer"],
      mode: "ids",
      version: 1,
    });

    expect(selection.acceptanceIds).toEqual([
      "material.frosting",
      "material.gloss",
      "material.layer",
    ]);
    expect(selection.scenarios).toEqual([
      {
        acceptanceIds: ["material.frosting"],
        budget: "standard",
        file: "e2e/app-controls.spec.ts",
        testName: "browser: material.frosting",
      },
      {
        acceptanceIds: ["material.gloss"],
        budget: "standard",
        file: "e2e/app-controls.spec.ts",
        testName: "browser: material.gloss",
      },
      {
        acceptanceIds: ["material.layer"],
        budget: "standard",
        file: "e2e/app-controls.spec.ts",
        testName: "browser: material.layer",
      },
    ]);
    expect(selection.version).toBe(2);
  });

  it("selects every browser acceptance row only for explicit all mode", () => {
    const selection = select({ mode: "all", version: 1 });
    expect(selection.acceptanceIds).toEqual([
      "lighting.intensity",
      "material.character",
      "material.exportedAppearance",
      "material.frosting",
      "material.gloss",
      "material.layer",
    ]);
    expect(selection.version).toBe(2);
  });

  it("reaches a fixed point without selecting unrelated or runtime rows", () => {
    const chainedSchema = defineToolcraft({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                controls: {
                  detail: {
                    applicability: { mode: "always" },
                    defaultValue: "fine",
                    label: "Detail",
                    options: [
                      { label: "Fine", value: "fine" },
                      { label: "Coarse", value: "coarse" },
                    ],
                    target: "shape.detail",
                    type: "segmented",
                  },
                  mode: {
                    applicability: { mode: "always" },
                    defaultValue: "solid",
                    label: "Mode",
                    options: [
                      { label: "Solid", value: "solid" },
                      { label: "Wire", value: "wire" },
                    ],
                    target: "shape.mode",
                    type: "segmented",
                  },
                  width: {
                    applicability: { mode: "always" },
                    defaultValue: 10,
                    label: "Width",
                    max: 20,
                    min: 1,
                    target: "shape.width",
                    type: "slider",
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
    const chainedInventory = [
      {
        entity: "Shape",
        entityId: "shape",
        finiteSelectors: [
          {
            affectedTargets: ["shape.detail"],
            reason: "Shape mode selects the detail outcomes for each mode.",
            role: "branch",
            target: "shape.mode",
          },
          {
            affectedTargets: ["shape.width"],
            reason:
              "Shape detail selects the width outcomes for each detail level.",
            role: "branch",
            target: "shape.detail",
          },
        ],
        groupingReason: "Shape mode, detail, and width define one shape.",
        id: "shape",
        targets: ["shape.mode", "shape.detail", "shape.width"],
        title: "Shape",
      },
    ] as const;
    const selection = createToolcraftFeatureVerificationSelection({
      acceptance: [
        acceptance("shape.detail", "shape.detail"),
        acceptance("shape.mode", "shape.mode"),
        acceptance("shape.width", "shape.width"),
        acceptance("shape.export", "shape.width", "runtime"),
      ],
      request: {
        acceptanceIds: ["shape.mode"],
        mode: "ids",
        version: 1,
      },
      schema: chainedSchema,
      sectionInventory: chainedInventory,
    });

    expect(selection.acceptanceIds).toEqual([
      "shape.detail",
      "shape.mode",
      "shape.width",
    ]);
  });

  it("fails closed for invalid seed and acceptance boundaries", () => {
    expect(() => select({ mode: "invalid", version: 1 } as never)).toThrow(
      /ids or all mode/iu,
    );
    expect(() =>
      select({ acceptanceIds: ["missing"], mode: "ids", version: 1 }),
    ).toThrow(/unknown browser acceptance id.*missing/iu);
    expect(() =>
      select({ acceptanceIds: ["material.layer"], mode: "ids", version: 1 }, [
        ...browserAcceptance,
        acceptance("material.layer", "material.layer"),
      ]),
    ).toThrow(/duplicate browser acceptance id.*material\.layer/iu);
    expect(() =>
      select(
        {
          acceptanceIds: ["material.nonBrowser"],
          mode: "ids",
          version: 1,
        },
        [
          ...browserAcceptance,
          {
            ...acceptance("material.nonBrowser", "material.gloss"),
            browser: false,
          },
        ],
      ),
    ).toThrow(/unknown browser acceptance id.*material\.nonBrowser/iu);
  });

  it("rejects duplicate seeds and returns deeply frozen deterministic output", () => {
    expect(() =>
      select({
        acceptanceIds: ["material.gloss", "material.gloss"],
        mode: "ids",
        version: 1,
      }),
    ).toThrow(/duplicate acceptance id.*material\.gloss/iu);

    const selection = select({
      acceptanceIds: ["material.layer", "lighting.intensity"],
      mode: "ids",
      version: 1,
    });
    expect(selection.acceptanceIds).toEqual([
      "lighting.intensity",
      "material.frosting",
      "material.gloss",
      "material.layer",
    ]);
    expect(Object.isFrozen(selection)).toBe(true);
    expect(Object.isFrozen(selection.acceptanceIds)).toBe(true);
    expect(Object.isFrozen(selection.scenarios)).toBe(true);
    for (const scenario of selection.scenarios) {
      expect(Object.isFrozen(scenario)).toBe(true);
      expect(Object.isFrozen(scenario.acceptanceIds)).toBe(true);
    }
  });

  it("sorts by code unit and groups acceptance rows sharing one exact scenario", () => {
    const sharedBrowser = {
      budget: "standard" as const,
      file: "e2e/shared.spec.ts" as const,
      testName: "browser: shared material",
    };
    const selection = select(
      { acceptanceIds: ["zeta", "Alpha"], mode: "ids", version: 1 },
      [
        { ...acceptance("zeta", "material.gloss"), browser: sharedBrowser },
        {
          ...acceptance("Alpha", "lighting.intensity"),
          browser: sharedBrowser,
        },
      ],
    );

    expect(selection).toEqual({
      acceptanceIds: ["Alpha", "zeta"],
      scenarios: [
        {
          acceptanceIds: ["Alpha", "zeta"],
          budget: "standard",
          file: "e2e/shared.spec.ts",
          testName: "browser: shared material",
        },
      ],
      version: 2,
    });
  });
});
