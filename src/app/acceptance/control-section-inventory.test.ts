import { defineToolcraft } from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";
import { getToolcraftControlSectionInventoryErrors } from "./control-section-inventory";
import type { ToolcraftControlSectionInventoryEntry } from "./types";
const opacityControl = {
  applicability: { mode: "always" as const },
  defaultValue: 75,
  max: 100,
  min: 0,
  target: "appearance.opacity",
  type: "slider",
} as const;
function createSchema({
  id = "appearance",
  title = "Appearance",
}: {
  id?: string;
  title?: string;
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
                opacity: opacityControl,
              },
              id,
              title,
            },
          ],
          title: "Controls",
        },
      },
    },
    modules: [],
  });
}
const inventoryEntry = {
  entity: "Appearance",
  entityId: "appearance",
  finiteSelectors: [],
  groupingReason: "These controls define the visible appearance of the output.",
  id: "appearance",
  targets: ["appearance.opacity"],
  title: "Original title",
} as const;
describe("Toolcraft Control Section Inventory identity", () => {
  it("composes exhaustive finite selector validation", () => {
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
                  mode: {
                    applicability: { mode: "always" },
                    defaultValue: "soft",
                    options: [
                      { label: "Soft", value: "soft" },
                      { label: "Sharp", value: "sharp" },
                    ],
                    target: "appearance.mode",
                    type: "select",
                  },
                },
                id: "appearance",
                title: "Appearance",
              },
            ],
            title: "Controls",
          },
        },
      },
      modules: [],
    });
    expect(
      getToolcraftControlSectionInventoryErrors(schema, [
        {
          ...inventoryEntry,
          finiteSelectors: [],
          targets: ["appearance.mode"],
        },
      ]),
    ).toContain(
      'Finite selector "appearance.mode" must be classified exactly once; found 0 entries.',
    );
  });
  it("matches inventory by id when a section title is renamed", () => {
    expect(
      getToolcraftControlSectionInventoryErrors(
        createSchema({ title: "Renamed appearance" }),
        [inventoryEntry],
      ),
    ).toEqual([]);
  });
  it("preserves inventory ownership when runtime Setup relocates product background controls", () => {
    const schema = defineToolcraft({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
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
    const backgroundInventory = {
      entity: "Output background",
      entityId: "output-background",
      finiteSelectors: [
        {
          affectedTargets: ["appearance.background"],
          reason:
            "Background inclusion determines whether its color affects output.",
          role: "branch",
          target: "export.includeBackground",
        },
      ],
      groupingReason:
        "Inclusion and color jointly define the exported background.",
      id: "background",
      targets: ["export.includeBackground", "appearance.background"],
      title: "Background",
    } as const;
    expect(schema.panels.controls?.sections[1]?.id).toBe("runtime.setup");
    expect(
      getToolcraftControlSectionInventoryErrors(schema, [backgroundInventory]),
    ).toEqual([]);
  });
  it("rejects an inventory id that does not match the schema section", () => {
    const errors = getToolcraftControlSectionInventoryErrors(createSchema(), [
      { ...inventoryEntry, id: "different-section" },
    ]);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /different-section.*no rendered product controls section/iu,
        ),
        expect.stringMatching(/missing product section.*appearance/iu),
      ]),
    );
  });
  it("rejects duplicate inventory ids", () => {
    const errors = getToolcraftControlSectionInventoryErrors(createSchema(), [
      inventoryEntry,
      { ...inventoryEntry, title: "Duplicate title" },
    ]);
    expect(errors).toContain(
      'Control Section Inventory repeats id "appearance" 2 times. Section inventory IDs must be unique.',
    );
  });
  it.each([
    [
      "blank entityId",
      { ...inventoryEntry, entityId: "" },
      'Control Section Inventory entry "Original title" must declare a non-empty stable entityId.',
    ],
    [
      "blank entity",
      { ...inventoryEntry, entity: "" },
      'Control Section Inventory entry "Original title" must declare a human-readable entity name.',
    ],
  ])("rejects %s", (_label, entry, expectedMessage) => {
    expect(
      getToolcraftControlSectionInventoryErrors(createSchema(), [entry]),
    ).toContain(expectedMessage);
  });
  it("rejects a missing entityId without throwing", () => {
    const { entityId: _entityId, ...entryWithoutEntityId } = inventoryEntry;
    const malformedInventory = [
      entryWithoutEntityId,
    ] as unknown as readonly ToolcraftControlSectionInventoryEntry[];
    expect(() =>
      getToolcraftControlSectionInventoryErrors(
        createSchema(),
        malformedInventory,
      ),
    ).not.toThrow();
    expect(
      getToolcraftControlSectionInventoryErrors(
        createSchema(),
        malformedInventory,
      ),
    ).toContain(
      'Control Section Inventory entry "Original title" must declare a non-empty stable entityId.',
    );
  });
  it.each([
    ["missing", undefined],
    ["non-string", 42],
  ])("reports a clear diagnostic for a %s inventory id", (_label, id) => {
    const malformedInventory = [
      { ...inventoryEntry, id },
    ] as unknown as readonly ToolcraftControlSectionInventoryEntry[];
    expect(() =>
      getToolcraftControlSectionInventoryErrors(
        createSchema(),
        malformedInventory,
      ),
    ).not.toThrow();
    expect(
      getToolcraftControlSectionInventoryErrors(
        createSchema(),
        malformedInventory,
      ),
    ).toContain(
      "Control Section Inventory contains an entry without a non-empty string stable section id.",
    );
  });
  it("requires a product-authored stable section id", () => {
    if (false) {
      defineToolcraft({
        base: {
          canvas: { enabled: true },
          identity: { id: "contract-fixture", title: "Contract fixture" },
          panels: {
            controls: {
              sections: [
                // @ts-expect-error Product-authored sections require stable ids.
                {
                  controls: { opacity: opacityControl },
                  title: "Appearance",
                },
              ],
              title: "Controls",
            },
          },
        },
        modules: [],
      });
    }
    expect(
      getToolcraftControlSectionInventoryErrors(createSchema(), [
        inventoryEntry,
      ]),
    ).toEqual([]);
  });
});
