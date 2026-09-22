import { describe, expect, it } from "vitest";
import {
  isToolcraftBuiltInControlSchema,
  timelineModule,
} from "@/toolcraft/runtime";
import { deriveToolcraftBrowserRuntimeRequirements } from "../../e2e/browser-runtime-evidence-requirements";

import {
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import { makeControlAcceptance } from "./app-acceptance.test-utils";

function createSchema() {
  return defineContractSchemaFixture({
    base: {
      canvas: { enabled: true },
      identity: { id: "collection-acceptance", title: "Collections" },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                notes: {
                  applicability: { mode: "always" },
                  defaultValue: [],
                  itemControls: {
                    color: { defaultValue: "#14B8A6", type: "color" },
                    opacity: {
                      defaultValue: 60,
                      keyframeable: true,
                      max: 100,
                      min: 0,
                      type: "slider",
                    },
                    position: {
                      defaultValue: { x: 0, y: 0 },
                      keyframeable: true,
                      type: "vector",
                    },
                  },
                  selectionTarget: "storyboard.selectedNote",
                  target: "storyboard.notes",
                  type: "collectionActions",
                },
              },
              id: "notes",
              title: "Notes",
            },
          ],
          title: "Controls",
        },
      },
    },
    modules: [timelineModule({ mode: "keyframes" })],
  });
}

describe("starter collection item keyframe acceptance", () => {
  it("requires exact opted-in field coverage without inferring color", () => {
    const acceptance = {
      ...makeControlAcceptance("storyboard.notes", "collectionActions"),
      collectionItemKeyframeCoverage: ["opacity"],
    };
    expect(
      validateContractAcceptance({
        acceptance: [acceptance],
        schema: createSchema(),
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "collectionItemKeyframeCoverage for exactly: opacity, position",
        ),
      ]),
    );

    const exact = validateContractAcceptance({
      acceptance: [
        {
          ...acceptance,
          collectionItemKeyframeCoverage: ["position", "opacity"],
        },
      ],
      schema: createSchema(),
    });
    expect(exact).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("collectionItemKeyframeCoverage for exactly"),
      ]),
    );
  });

  it("rejects collection item coverage on a non-collection control", () => {
    const schema = createSchema();
    const section = schema.panels.controls!.sections.find(
      (candidate) => candidate.controls.notes?.target === "storyboard.notes",
    )!;
    const scalarSchema = {
      ...schema,
      panels: {
        ...schema.panels,
        controls: {
          ...schema.panels.controls!,
          sections: [
            {
              ...section,
              controls: {
                notes: {
                  applicability: {
                    mode: "always" as const,
                    origin: "explicit" as const,
                  },
                  defaultValue: 50,
                  max: 100,
                  min: 0,
                  target: "storyboard.notes",
                  type: "slider" as const,
                },
              },
            },
          ],
        },
      },
    };
    const acceptance = {
      ...makeControlAcceptance("storyboard.notes", "slider"),
      collectionItemKeyframeCoverage: ["opacity"],
      timelineCoverage: "keyframes" as const,
    };

    expect(
      validateContractAcceptance({
        acceptance: [acceptance],
        schema: scalarSchema,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "collectionItemKeyframeCoverage is owned only by collectionActions",
        ),
      ]),
    );
  });

  it("rejects collection item coverage without keyframe timeline ownership", () => {
    const schema = createSchema();
    const finiteSchema = {
      ...schema,
      panels: { ...schema.panels, timeline: undefined },
    };
    const acceptance = {
      ...makeControlAcceptance("storyboard.notes", "collectionActions"),
      collectionItemKeyframeCoverage: ["opacity", "position"],
    };

    expect(
      validateContractAcceptance({
        acceptance: [acceptance],
        schema: finiteSchema,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "collectionItemKeyframeCoverage requires timeline mode keyframes",
        ),
      ]),
    );
  });

  it("rejects declared collection item coverage when no field opts into keyframes", () => {
    const schema = createSchema();
    const section = schema.panels.controls!.sections.find(
      (candidate) => candidate.controls.notes?.target === "storyboard.notes",
    )!;
    const control = section.controls.notes!;
    if (
      !isToolcraftBuiltInControlSchema(control) ||
      control.type !== "collectionActions" ||
      !control.itemControls
    ) {
      throw new Error("The notes fixture must use compound collectionActions.");
    }
    const noOptInSchema = {
      ...schema,
      panels: {
        ...schema.panels,
        controls: {
          ...schema.panels.controls!,
          sections: [
            {
              ...section,
              controls: {
                notes: {
                  ...control,
                  itemControls: Object.fromEntries(
                    Object.entries(control.itemControls ?? {}).map(
                      ([id, field]) => [
                        id,
                        { ...field, keyframeable: undefined },
                      ],
                    ),
                  ),
                },
              },
            },
          ],
        },
      },
    };
    const acceptance = {
      ...makeControlAcceptance("storyboard.notes", "collectionActions"),
      collectionItemKeyframeCoverage: [],
    };

    expect(
      validateContractAcceptance({
        acceptance: [acceptance],
        schema: noOptInSchema,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "collectionItemKeyframeCoverage requires at least one keyframeable item field",
        ),
      ]),
    );
  });

  it("rejects extra fields as well as missing fields", () => {
    const acceptance = {
      ...makeControlAcceptance("storyboard.notes", "collectionActions"),
      collectionItemKeyframeCoverage: ["opacity", "position", "color"],
    };

    expect(
      validateContractAcceptance({
        acceptance: [acceptance],
        schema: createSchema(),
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "collectionItemKeyframeCoverage for exactly: opacity, position",
        ),
      ]),
    );
  });

  it("derives field-level browser requirements only for exact valid coverage", () => {
    const schema = createSchema();
    const acceptance = {
      ...makeControlAcceptance("storyboard.notes", "collectionActions"),
      collectionItemKeyframeCoverage: ["opacity", "position"],
    };

    expect(
      deriveToolcraftBrowserRuntimeRequirements([acceptance], schema)
        .filter(({ requirementId }) => requirementId.includes(":"))
        .map(({ requirementId }) => requirementId),
    ).toEqual(["storyboard.notes:opacity", "storyboard.notes:position"]);
    expect(
      deriveToolcraftBrowserRuntimeRequirements(
        [
          {
            ...acceptance,
            collectionItemKeyframeCoverage: ["opacity", "position", "extra"],
          },
        ],
        schema,
      ).filter(({ requirementId }) => requirementId.includes(":")),
    ).toEqual([]);
  });
});
