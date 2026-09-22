import { describe, expect, it } from "vitest";

import {
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import { makeControlAcceptance } from "./app-acceptance.test-utils";

describe("starter acceptance text control kind rules", () => {
  it("rejects CodeTextarea for short single-line text content", () => {
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
                  buttonText: {
                    applicability: { mode: "always" as const },
                    defaultValue: "Glass",
                    label: "Text",
                    target: "button.text",
                    textValueKind: "single-line",
                    type: "code",
                  },
                },
                title: "Button",
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
        acceptance: [makeControlAcceptance("button.text", "code")],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'declares textValueKind "single-line" and must use type "text"',
        ),
      ]),
    );
  });

  it("allows CodeTextarea when a short default documents long multiline intent", () => {
    const schema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-2",
                controls: {
                  prompt: {
                    applicability: { mode: "always" as const },
                    defaultValue: "Describe the scene",
                    description:
                      "Long multiline prompt content for generated output.",
                    label: "Prompt",
                    target: "generation.prompt",
                    textValueKind: "multiline",
                    type: "code",
                  },
                },
                title: "Generation",
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
        acceptance: [makeControlAcceptance("generation.prompt", "code")],
      }),
    ).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'declares textValueKind "single-line" and must use type "text"',
        ),
      ]),
    );
  });
});
