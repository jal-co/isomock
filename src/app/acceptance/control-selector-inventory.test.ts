import { defineToolcraft } from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";
import {
  createToolcraftControlSelectorDependencyIndex,
  getToolcraftControlSelectorInventoryErrors,
  getToolcraftFiniteSelectorTargets,
} from "./control-selector-inventory";
import type { ToolcraftControlSectionInventoryEntry } from "./types";
function createSchema() {
  return defineToolcraft({
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
                character: {
                  applicability: { mode: "always" },
                  defaultValue: "soft",
                  options: [
                    { label: "Soft", value: "soft" },
                    { label: "Sharp", value: "sharp" },
                  ],
                  target: "shape.character",
                  type: "select",
                },
                detailColor: {
                  applicability: {
                    all: [{ greaterThan: 0, target: "shape.details" }],
                    mode: "conditional",
                  },
                  defaultValue: "#ffffff",
                  target: "shape.detailColor",
                  type: "color",
                },
                details: {
                  applicability: { mode: "always" },
                  defaultValue: 0,
                  max: 2,
                  min: 0,
                  step: 1,
                  target: "shape.details",
                  type: "slider",
                  variant: "discrete",
                },
                kind: {
                  applicability: { mode: "always" },
                  defaultValue: "circle",
                  options: [
                    { label: "Circle", value: "circle" },
                    { label: "Star", value: "star" },
                  ],
                  target: "shape.kind",
                  type: "segmented",
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
const validInventory = [
  {
    entity: "Shape",
    entityId: "shape",
    finiteSelectors: [
      {
        affectedTargets: ["shape.amount"],
        reason:
          "Shape kind selects parameter families with different relevance.",
        role: "branch",
        target: "shape.kind",
      },
      {
        reason: "Character changes its glyph without changing peer relevance.",
        role: "parameter",
        target: "shape.character",
      },
      {
        affectedTargets: [],
        reason: "Detail count gates the optional detail controls.",
        role: "branch",
        target: "shape.details",
      },
    ],
    groupingReason: "These controls edit one rendered shape.",
    id: "shape",
    targets: [
      "shape.kind",
      "shape.character",
      "shape.details",
      "shape.detailColor",
      "shape.amount",
    ],
    title: "Shape",
  },
] as const satisfies readonly ToolcraftControlSectionInventoryEntry[];
function malformedInventory(
  finiteSelectors: readonly unknown[],
): readonly ToolcraftControlSectionInventoryEntry[] {
  return [
    { ...validInventory[0], finiteSelectors },
  ] as unknown as readonly ToolcraftControlSectionInventoryEntry[];
}
describe("Toolcraft finite selector inventory", () => {
  it("accepts an exhaustive branch and parameter classification", () => {
    const schema = createSchema();
    expect([...getToolcraftFiniteSelectorTargets(schema)].sort()).toEqual([
      "shape.character",
      "shape.details",
      "shape.kind",
    ]);
    expect(
      getToolcraftControlSelectorInventoryErrors(schema, validInventory),
    ).toEqual([]);
    expect(
      createToolcraftControlSelectorDependencyIndex(
        schema,
        validInventory,
      ).selectorsByDependent.get("shape.amount"),
    ).toEqual(["shape.kind"]);
    expect(
      createToolcraftControlSelectorDependencyIndex(
        schema,
        validInventory,
      ).dependentsBySelector.get("shape.details"),
    ).toEqual(["shape.detailColor"]);
  });
  it("requires every finite selector exactly once", () => {
    const missing = malformedInventory(
      validInventory[0].finiteSelectors.filter(
        ({ target }) => target !== "shape.character",
      ),
    );
    const duplicate = malformedInventory([
      ...validInventory[0].finiteSelectors,
      validInventory[0].finiteSelectors[1],
    ]);
    expect(
      getToolcraftControlSelectorInventoryErrors(createSchema(), missing),
    ).toContain(
      'Finite selector "shape.character" must be classified exactly once; found 0 entries.',
    );
    expect(
      getToolcraftControlSelectorInventoryErrors(createSchema(), duplicate),
    ).toContain(
      'Finite selector "shape.character" must be classified exactly once; found 2 entries.',
    );
  });
  it("rejects continuous controls and selectors outside their owning entry", () => {
    const classifiedContinuous = malformedInventory([
      ...validInventory[0].finiteSelectors,
      {
        reason: "Amount changes one continuous output parameter.",
        role: "parameter",
        target: "shape.amount",
      },
    ]);
    const outsideOwner = malformedInventory([
      ...validInventory[0].finiteSelectors.filter(
        ({ target }) => target !== "shape.character",
      ),
      {
        reason: "Foreign selectors cannot be classified by this section.",
        role: "parameter",
        target: "other.character",
      },
    ]);
    expect(
      getToolcraftControlSelectorInventoryErrors(
        createSchema(),
        classifiedContinuous,
      ),
    ).toContain(
      'Selector inventory target "shape.amount" is not a finite product selector.',
    );
    expect(
      getToolcraftControlSelectorInventoryErrors(createSchema(), outsideOwner),
    ).toContain(
      'Selector inventory target "other.character" is not owned by section "shape".',
    );
  });
  it("requires concrete reasons and exact union keys", () => {
    const errors = getToolcraftControlSelectorInventoryErrors(
      createSchema(),
      malformedInventory([
        {
          affectedTargets: [],
          reason: " too short ",
          role: "parameter",
          target: "shape.character",
        },
        {
          reason: "A branch cannot omit its affected target declaration.",
          role: "branch",
          target: "shape.kind",
        },
        {
          affectedTargets: [],
          extra: true,
          reason: "Detail count gates the optional detail controls.",
          role: "branch",
          target: "shape.details",
        },
      ]),
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        'Selector inventory entry "shape.character" must include a concrete reason of at least 12 characters.',
        'Selector inventory entry "shape.character" with role "parameter" has invalid keys: affectedTargets.',
        'Selector inventory entry "shape.details" with role "branch" has invalid keys: extra.',
        'Selector inventory entry "shape.kind" with role "branch" must declare affectedTargets as an array.',
      ]),
    );
  });
  it("requires every applicability predicate owner to be a branch", () => {
    const parameterDetails = malformedInventory(
      validInventory[0].finiteSelectors.map((entry) =>
        entry.target === "shape.details"
          ? {
              reason: "Detail count changes only its own output parameter.",
              role: "parameter",
              target: entry.target,
            }
          : entry,
      ),
    );
    expect(
      getToolcraftControlSelectorInventoryErrors(
        createSchema(),
        parameterDetails,
      ),
    ).toContain(
      'Finite selector "shape.details" owns applicability predicates and must declare role "branch".',
    );
    expect(() =>
      createToolcraftControlSelectorDependencyIndex(
        createSchema(),
        parameterDetails,
      ),
    ).toThrow(/shape\.details.*applicability predicates.*branch/iu);
  });
  it("rejects invalid affected targets and duplicate predicate edges", () => {
    const errors = getToolcraftControlSelectorInventoryErrors(
      createSchema(),
      malformedInventory([
        {
          affectedTargets: [
            "shape.kind",
            "shape.amount",
            "shape.amount",
            "missing.target",
            "other.amount",
          ],
          reason:
            "Shape kind selects parameter families with different relevance.",
          role: "branch",
          target: "shape.kind",
        },
        validInventory[0].finiteSelectors[1],
        {
          affectedTargets: ["shape.detailColor"],
          reason: "Detail count gates the optional detail controls.",
          role: "branch",
          target: "shape.details",
        },
      ]),
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        'Branch selector "shape.kind" cannot affect itself.',
        'Branch selector "shape.kind" repeats affected target "shape.amount".',
        'Branch selector "shape.kind" affected target "missing.target" is not a product control.',
        'Branch selector "shape.kind" affected target "other.amount" is not a product control.',
        'Branch selector "shape.details" must not list "shape.detailColor" because its applicability already declares that dependency.',
      ]),
    );
  });
  it("rejects cross-entity affected targets but allows another workflow stage", () => {
    const schema = createSchema();
    const first = {
      ...validInventory[0],
      finiteSelectors: [
        {
          affectedTargets: ["shape.amount"],
          reason: "Shape kind selects parameters in the finishing stage.",
          role: "branch",
          target: "shape.kind",
        },
        validInventory[0].finiteSelectors[1],
        validInventory[0].finiteSelectors[2],
      ],
      splitReason: "Selection precedes the shape finishing workflow.",
      targets: [
        "shape.kind",
        "shape.character",
        "shape.details",
        "shape.detailColor",
      ],
      workflowStage: "selection",
    } as const;
    const second = {
      entity: "Shape",
      entityId: "shape",
      finiteSelectors: [],
      groupingReason: "This stage finishes the rendered shape appearance.",
      id: "shape-finish",
      splitReason: "Finishing follows the shape selection workflow.",
      targets: ["shape.amount"],
      title: "Shape Finish",
      workflowStage: "finish",
    } as const;
    expect(
      getToolcraftControlSelectorInventoryErrors(schema, [first, second]),
    ).toEqual([]);
    const crossEntity = {
      ...second,
      entity: "Finish",
      entityId: "finish",
    } as const;
    expect(
      getToolcraftControlSelectorInventoryErrors(schema, [first, crossEntity]),
    ).toContain(
      'Branch selector "shape.kind" cannot affect "shape.amount" because they belong to different entities.',
    );
  });
  it("rejects empty branches without affected peers or predicate dependents", () => {
    const emptyKind = malformedInventory(
      validInventory[0].finiteSelectors.map((entry) =>
        entry.target === "shape.kind"
          ? { ...entry, affectedTargets: [] }
          : entry,
      ),
    );
    expect(
      getToolcraftControlSelectorInventoryErrors(createSchema(), emptyKind),
    ).toContain(
      'Branch selector "shape.kind" must affect at least one peer or own an applicability predicate.',
    );
  });
});
