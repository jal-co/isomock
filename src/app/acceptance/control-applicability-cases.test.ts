import { defineToolcraft } from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";
import {
  getToolcraftApplicabilityRequirementId,
  getToolcraftControlApplicabilityCases,
} from "./control-applicability-cases";
import type { ToolcraftControlSectionInventoryEntry } from "./types";
const sectionInventory: readonly ToolcraftControlSectionInventoryEntry[] = [
  {
    entity: "Source",
    entityId: "source",
    finiteSelectors: [
      {
        reason: "Source mode changes its own accepted source outcome only.",
        role: "parameter",
        target: "source.mode",
      },
    ],
    groupingReason: "Source mode selects the active source workflow.",
    id: "source",
    targets: ["source.mode"],
    title: "Source",
  },
  {
    entity: "Shape",
    entityId: "shape",
    finiteSelectors: [
      {
        affectedTargets: ["shape.sides"],
        reason: "Shape kind gates the parameters available for each shape.",
        role: "branch",
        target: "shape.kind",
      },
    ],
    groupingReason: "Source and shape selectors gate shape parameters.",
    id: "shape",
    targets: ["shape.kind", "shape.sides", "shape.opacity"],
    title: "Shape",
  },
];
const predicateSectionInventory = [
  {
    ...sectionInventory[0]!,
    finiteSelectors: [
      {
        affectedTargets: [],
        reason: "Source mode gates controls in the selected source workflow.",
        role: "branch",
        target: "source.mode",
      },
    ],
  },
  {
    ...sectionInventory[1]!,
    finiteSelectors: [
      {
        affectedTargets: ["shape.opacity"],
        reason: "Shape kind gates the opacity outcomes for each shape.",
        role: "branch",
        target: "shape.kind",
      },
    ],
  },
] as const satisfies readonly ToolcraftControlSectionInventoryEntry[];
function shapeSchema({
  applicability = { mode: "always" as const },
}: {
  applicability?:
    | {
        all: readonly {
          equals?: unknown;
          oneOf?: readonly unknown[];
          target: string;
        }[];
        mode: "conditional";
      }
    | {
        mode: "always";
      };
} = {}) {
  return defineToolcraft({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                sourceMode: {
                  applicability: { mode: "always" },
                  defaultValue: "create",
                  options: [
                    { label: "Upload", value: "upload" },
                    { label: "Create", value: "create" },
                  ],
                  target: "source.mode",
                  type: "segmented",
                },
              },
              id: "source",
              title: "Source",
            },
            {
              controls: {
                opacity: {
                  applicability: { mode: "always" },
                  defaultValue: 0.8,
                  max: 1,
                  min: 0,
                  target: "shape.opacity",
                  type: "slider",
                },
                shapeKind: {
                  applicability: { mode: "always" },
                  defaultValue: "polygon",
                  options: [
                    { label: "Circle", value: "circle" },
                    { label: "Polygon", value: "polygon" },
                    { label: "Star", value: "star" },
                  ],
                  target: "shape.kind",
                  type: "segmented",
                },
                sides: {
                  applicability,
                  defaultValue: 6,
                  target: "shape.sides",
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
}
function setupBackgroundSchema() {
  return defineToolcraft({
    base: {
      identity: {
        id: "acceptance-fixture",
        title: "Acceptance fixture",
      },
      canvas: {
        enabled: true,
        sizing: { mode: "editable-output" },
      },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                background: {
                  applicability: { mode: "always" },
                  defaultValue: "#101010",
                  target: "appearance.background",
                  type: "color",
                },
                includeBackground: {
                  applicability: { mode: "always" },
                  defaultValue: true,
                  target: "export.includeBackground",
                  type: "switch",
                },
              },
              id: "background",
              title: "Background",
            },
          ],
          title: "Controls",
        },
      },
    },
    modules: [],
  });
}
describe("Toolcraft control applicability cases", () => {
  it("derives an always-visible peer only from affectedTargets", () => {
    const cases = getToolcraftControlApplicabilityCases({
      schema: shapeSchema(),
      sectionInventory,
      target: "shape.sides",
    });
    expect(
      cases.map(({ expectation, selectorTarget, selectorValue, target }) => ({
        expectation,
        selectorTarget,
        selectorValue,
        target,
      })),
    ).toEqual([
      {
        expectation: "visible",
        selectorTarget: "shape.kind",
        selectorValue: "circle",
        target: "shape.sides",
      },
      {
        expectation: "visible",
        selectorTarget: "shape.kind",
        selectorValue: "polygon",
        target: "shape.sides",
      },
      {
        expectation: "visible",
        selectorTarget: "shape.kind",
        selectorValue: "star",
        target: "shape.sides",
      },
    ]);
    expect(cases[0]).toEqual(
      expect.objectContaining({
        selectorControlType: "segmented",
        selectorLabel: "shapeKind",
        selectorOptionLabel: "Circle",
      }),
    );
  });
  it("derives a cross-section selector only from explicit applicability", () => {
    const cases = getToolcraftControlApplicabilityCases({
      schema: shapeSchema({
        applicability: {
          all: [{ equals: "create", target: "source.mode" }],
          mode: "conditional",
        },
      }),
      sectionInventory: predicateSectionInventory,
      target: "shape.sides",
    });
    expect(
      cases.map(({ expectation, selectorTarget, selectorValue }) => ({
        expectation,
        selectorTarget,
        selectorValue,
      })),
    ).toEqual([
      {
        expectation: "hidden",
        selectorTarget: "source.mode",
        selectorValue: "upload",
      },
      {
        expectation: "visible",
        selectorTarget: "source.mode",
        selectorValue: "create",
      },
    ]);
  });
  it("does not derive parameter selectors or unlisted peers", () => {
    const cases = getToolcraftControlApplicabilityCases({
      schema: shapeSchema(),
      sectionInventory,
      target: "shape.sides",
    });
    expect(
      cases.some(({ selectorTarget }) => selectorTarget === "source.mode"),
    ).toBe(false);
    expect(
      cases.some(({ selectorTarget }) => selectorTarget === "shape.opacity"),
    ).toBe(false);
  });
  it("uses one path for always controls and stable encoded requirement ids", () => {
    const cases = getToolcraftControlApplicabilityCases({
      schema: shapeSchema({ applicability: { mode: "always" } }),
      sectionInventory,
      target: "shape.sides",
    });
    expect(cases.every((entry) => entry.expectation === "visible")).toBe(true);
    expect(
      getToolcraftApplicabilityRequirementId("shape-sides", cases[0]!),
    ).toBe("shape-sides#applicability:shape.kind=%22circle%22:visible");
  });
  it("derives bounded numeric boundary cases without enumerating a range", () => {
    const schema = defineToolcraft({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                controls: {
                  count: {
                    applicability: { mode: "always" },
                    defaultValue: 2,
                    max: 3,
                    min: 1,
                    step: 1,
                    target: "shade.count",
                    type: "slider",
                    variant: "discrete",
                  },
                  thirdShade: {
                    applicability: {
                      all: [
                        {
                          greaterThanOrEqual: 3,
                          target: "shade.count",
                        },
                      ],
                      mode: "conditional",
                    },
                    target: "shade.third",
                    type: "color",
                  },
                },
                id: "shades",
                title: "Shades",
              },
            ],
            title: "Controls",
          },
        },
      },
      modules: [],
    });
    expect(
      getToolcraftControlApplicabilityCases({
        schema,
        sectionInventory: [
          {
            entity: "Shades",
            entityId: "shades",
            finiteSelectors: [
              {
                affectedTargets: [],
                reason: "Shade count gates the optional third shade color.",
                role: "branch",
                target: "shade.count",
              },
            ],
            groupingReason: "Count controls the available shade colors.",
            id: "shades",
            targets: ["shade.count", "shade.third"],
            title: "Shades",
          },
        ],
        target: "shade.third",
      }).map(({ expectation, selectorTarget, selectorValue, target }) => ({
        expectation,
        selectorTarget,
        selectorValue,
        target,
      })),
    ).toEqual([
      {
        expectation: "hidden",
        selectorTarget: "shade.count",
        selectorValue: 1,
        target: "shade.third",
      },
      {
        expectation: "hidden",
        selectorTarget: "shade.count",
        selectorValue: 2,
        target: "shade.third",
      },
      {
        expectation: "visible",
        selectorTarget: "shade.count",
        selectorValue: 3,
        target: "shade.third",
      },
    ]);
  });
  it("does not infer Setup branches without explicit applicability", () => {
    const schema = setupBackgroundSchema();
    expect(
      getToolcraftControlApplicabilityCases({
        schema,
        sectionInventory: [],
        target: "appearance.background",
      }).map(({ expectation, selectorTarget, selectorValue, target }) => ({
        expectation,
        selectorTarget,
        selectorValue,
        target,
      })),
    ).toEqual([]);
  });
  it("keeps explicit Setup applicability when product inventory is absent", () => {
    const schema = setupBackgroundSchema();
    const controlsPanel = schema.panels.controls;
    const setupSection = controlsPanel?.sections.find(section => section.id === "runtime.setup");
    const background = setupSection?.controls.background;
    if (!controlsPanel || !setupSection || !background) {
      throw new Error("Expected normalized Setup background control.");
    }
    const schemaWithConditionalBackground = {
      ...schema,
      panels: {
        ...schema.panels,
        controls: {
          ...controlsPanel,
          sections: controlsPanel.sections.map(section => section === setupSection ? {
              ...setupSection,
              controls: {
                ...setupSection.controls,
                background: {
                  ...background,
                  applicability: {
                    all: [
                      {
                        equals: true,
                        target: "export.includeBackground",
                      },
                    ],
                    mode: "conditional" as const,
                    origin: "explicit" as const,
                  },
                },
              },
            } : section),
        },
      },
    };
    expect(
      getToolcraftControlApplicabilityCases({
        schema: schemaWithConditionalBackground,
        sectionInventory: [],
        target: "appearance.background",
      }).map(({ expectation, selectorTarget, selectorValue, target }) => ({
        expectation,
        selectorTarget,
        selectorValue,
        target,
      })),
    ).toEqual([
      {
        expectation: "hidden",
        selectorTarget: "export.includeBackground",
        selectorValue: false,
        target: "appearance.background",
      },
      {
        expectation: "visible",
        selectorTarget: "export.includeBackground",
        selectorValue: true,
        target: "appearance.background",
      },
    ]);
  });
});
