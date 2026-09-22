import { defineToolcraft } from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";
import { getToolcraftControlApplicabilityCases } from "./control-applicability-cases";
describe("Toolcraft unsupported applicability selector cases", () => {
  it("does not make tolerant case generation invent a finite domain", () => {
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
                  amount: {
                    applicability: { mode: "always" },
                    defaultValue: 0.5,
                    max: 1,
                    min: 0,
                    target: "shape.amount",
                    type: "slider",
                  },
                  detail: {
                    applicability: {
                      all: [{ greaterThan: 0.5, target: "shape.amount" }],
                      mode: "conditional",
                    },
                    defaultValue: "#ffffff",
                    target: "shape.detail",
                    type: "color",
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
    expect(
      getToolcraftControlApplicabilityCases({
        schema,
        sectionInventory: [],
        target: "shape.detail",
      }),
    ).toEqual([]);
  });
});
