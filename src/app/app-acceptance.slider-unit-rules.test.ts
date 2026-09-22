import { describe, expect, it } from "vitest";

import {
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import { makeControlAcceptance } from "./app-acceptance.test-utils";

describe("starter acceptance slider unit rules", () => {
  it("rejects x units on slider value labels", () => {
    const schema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-1",
                controls: {
                  strength: {
                    applicability: { mode: "always" as const },
                    defaultValue: 0.4,
                    label: "Strength",
                    max: 1,
                    min: 0,
                    step: 0.01,
                    target: "glass.strength",
                    type: "slider",
                    unit: "x",
                  },
                },
                title: "Glass",
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
            automatedTestName: "strength changes glass output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: strength slider changes glass output",
            },
            componentType: "slider",
            evidence: "rendered-pixels",
            expectedObservable:
              "Changing Strength changes the rendered glass strength.",
            fixture: "glass strength fixture",
            id: "glass.strength",
            kind: "control",
            target: "glass.strength",
            userAction: "Drag the Strength slider.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'Glass / strength (glass.strength) uses unit "x", but Toolcraft slider values do not use x suffixes. Omit unit for scale, multiplier, intensity, opacity, strength, depth, and shader amount values unless a real measurement unit applies.',
      ]),
    );
  });
});
