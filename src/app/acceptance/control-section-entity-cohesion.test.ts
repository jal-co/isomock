import { describe, expect, it } from "vitest";

import {
  getToolcraftControlSectionEntityCohesionErrors,
  hasToolcraftInventoryEntityAgreement,
} from "./control-section-entity-cohesion";
import type { ToolcraftControlSectionInventoryEntry } from "./types";

function makeSection({
  count,
  entity = "Renderable object",
  entityId = "renderable-object",
  id = "object",
  splitReason,
  workflowStage,
}: {
  count: number;
  entity?: string;
  entityId?: string;
  id?: string;
  splitReason?: string;
  workflowStage?: string;
}): ToolcraftControlSectionInventoryEntry {
  return {
    entity,
    entityId,
    finiteSelectors: [],
    groupingReason: `The ${id} controls edit one coherent part of the entity.`,
    id,
    splitReason,
    targets: Array.from(
      { length: count },
      (_, index) => `${id}.value${index + 1}`,
    ),
    title: id,
    workflowStage,
  };
}

describe("Toolcraft control section entity cohesion", () => {
  it.each([1, 7, 8, 10, 11, 12, 25])(
    "accepts one entity in one section with %s controls",
    (count) => {
      expect(
        getToolcraftControlSectionEntityCohesionErrors([
          makeSection({ count }),
        ]),
      ).toEqual([]);
    },
  );

  it.each([
    [3, 4],
    [5, 6],
    [11, 2],
    [12, 1],
  ])(
    "accepts justified workflow stages with %s and %s controls",
    (firstCount, secondCount) => {
      expect(
        getToolcraftControlSectionEntityCohesionErrors([
          makeSection({
            count: firstCount,
            id: "object-structure",
            splitReason: "Structure is authored before the finishing workflow.",
            workflowStage: "structure",
          }),
          makeSection({
            count: secondCount,
            id: "object-finish",
            splitReason: "Finish is authored after the structural workflow.",
            workflowStage: "finish",
          }),
        ]),
      ).toEqual([]);
    },
  );

  it("requires a workflow stage on every section of a split entity", () => {
    expect(
      getToolcraftControlSectionEntityCohesionErrors([
        makeSection({
          count: 1,
          id: "object-primary",
          splitReason: "Primary editing precedes the final workflow stage.",
        }),
        makeSection({
          count: 2,
          id: "object-final",
          splitReason: "The final workflow follows primary editing.",
          workflowStage: "final",
        }),
      ]),
    ).toContain(
      'Control Section Inventory entity "renderable-object" section object-primary must declare workflowStage because the entity is split across sections.',
    );
  });

  it("requires complete, unique split evidence and a consistent entity name", () => {
    const errors = getToolcraftControlSectionEntityCohesionErrors([
      makeSection({ count: 6, id: "object-a", workflowStage: "edit" }),
      makeSection({
        count: 6,
        entity: "Different label",
        id: "object-b",
        splitReason: "This section follows the first editing stage.",
        workflowStage: "edit",
      }),
    ]);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("uses inconsistent entity names"),
        expect.stringContaining("object-a must declare splitReason"),
        expect.stringContaining('repeats workflowStage "edit"'),
      ]),
    );
  });

  it("keeps independent entities independent", () => {
    expect(
      getToolcraftControlSectionEntityCohesionErrors([
        makeSection({ count: 4, entityId: "entity-a", id: "entity-a" }),
        makeSection({ count: 4, entityId: "entity-b", id: "entity-b" }),
      ]),
    ).toEqual([]);
  });

  it("requires one shared entityId for target-prefix corroboration", () => {
    const first = makeSection({ count: 6, id: "first" });
    const second = makeSection({
      count: 6,
      entityId: "different-entity",
      id: "second",
    });
    const sectionInventoryById = new Map([
      [first.id, first],
      [second.id, second],
    ]);
    const sections = new Set([first.id, second.id]);

    expect(
      hasToolcraftInventoryEntityAgreement({
        sectionInventoryById,
        sections,
      }),
    ).toBe(false);

    sectionInventoryById.set(second.id, {
      ...second,
      entityId: first.entityId,
    });

    expect(
      hasToolcraftInventoryEntityAgreement({
        sectionInventoryById,
        sections,
      }),
    ).toBe(true);
  });
});
