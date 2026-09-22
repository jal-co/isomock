import { describe, expect, it } from "vitest";
import {
  defineToolcraft,
  type ToolcraftProductDefinition,
} from "@/toolcraft/runtime";

import {
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";

const schema = {
  base: {
    canvas: { enabled: true },
    identity: { id: "contract-production", title: "Contract production" },
    panels: {
      controls: {
        sections: [],
        title: "Controls",
      },
    },
  },
  modules: [],
} satisfies ToolcraftProductDefinition;

describe("Toolcraft acceptance contract schema fixtures", () => {
  it("preserves explicit authored applicability without a compatibility adapter", () => {
    const fixture = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                controls: {
                  conditional: {
                    applicability: {
                      all: [{ equals: true, target: "shape.enabled" }],
                      mode: "conditional" as const,
                    },
                    target: "shape.conditional",
                    type: "slider",
                  },
                  neutral: {
                    applicability: { mode: "always" as const },
                    target: "shape.enabled",
                    type: "switch",
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
    const controls = fixture.panels.controls?.sections.find(
      (section) => section.id === "shape",
    )?.controls;

    expect(controls?.neutral?.applicability).toEqual({
      mode: "always",
      origin: "explicit",
    });
    expect(controls?.conditional?.applicability).toEqual({
      all: [{ equals: true, target: "shape.enabled" }],
      mode: "conditional",
      origin: "explicit",
    });
  });

  it("requires fixture persistence policy to be explicit", () => {
    const productionDefault = defineToolcraft(schema);
    const contractFixture = defineContractSchemaFixture({
      ...schema,
      base: { ...schema.base, persistence: { storage: "none" } },
    });

    expect(productionDefault.persistence.storage).toBe("localStorage");
    expect(contractFixture.persistence).toEqual({
      storage: "none",
    });
    expect(
      validateContractAcceptance({ acceptance: [], schema: productionDefault }),
    ).toContain(
      'persistence.storage "localStorage" requires a runtime acceptance entry with persistenceCoverage "reload" proving user-edited persisted state restores after a real browser reload. Settings import/export is not a substitute for persistence.',
    );
    expect(
      validateContractAcceptance({ acceptance: [], schema: contractFixture }),
    ).toEqual([]);
  });
});
