import { describe, expect, it } from "vitest";

import {
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import { makeControlAcceptance } from "./app-acceptance.test-utils";

describe("starter acceptance control state contract", () => {
  it("rejects disabled product controls and requires visibleWhen for unavailable controls", () => {
    const schemaWithDisabledDependency = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-1",
                controls: {
                  fillMode: {
                    applicability: { mode: "always" as const },
                    defaultValue: "full",
                    label: "Fill mode",
                    options: [
                      { label: "Full", value: "full" },
                      { label: "Partial", value: "partial" },
                    ],
                    target: "distribution.fillMode",
                    type: "segmented",
                  },
                  fillAmount: {
                    applicability: { mode: "always" as const },
                    defaultValue: 50,
                    disabledWhen: {
                      equals: "full",
                      target: "distribution.mode",
                    },
                    label: "Fill level",
                    max: 100,
                    min: 0,
                    target: "distribution.fillAmount",
                    type: "slider",
                  },
                },
                title: "Distribution",
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
        schema: schemaWithDisabledDependency,
        acceptance: [
          makeControlAcceptance("distribution.fillMode", "segmented"),
          makeControlAcceptance("distribution.fillAmount", "slider"),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "disabledWhen target distribution.mode does not match another schema control target",
        ),
        expect.stringContaining(
          "uses disabledWhen. Generated product panels should show only controls usable in the current state",
        ),
      ]),
    );

    const schemaWithBranchDisabledDependency = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-2",
                controls: {
                  fillMode: {
                    applicability: { mode: "always" as const },
                    defaultValue: "full",
                    label: "Fill mode",
                    options: [
                      { label: "Full", value: "full" },
                      { label: "Partial", value: "partial" },
                    ],
                    target: "distribution.fillMode",
                    type: "segmented",
                  },
                  fillAmount: {
                    applicability: { mode: "always" as const },
                    defaultValue: 50,
                    disabledWhen: {
                      equals: "full",
                      target: "distribution.fillMode",
                    },
                    label: "Fill level",
                    max: 100,
                    min: 0,
                    target: "distribution.fillAmount",
                    type: "slider",
                  },
                },
                title: "Distribution",
              },
            ],
            title: "Controls",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });
    const branchErrors = validateContractAcceptance({
      schema: schemaWithBranchDisabledDependency,
      acceptance: [
        makeControlAcceptance("distribution.fillMode", "segmented"),
        {
          ...makeControlAcceptance("distribution.fillAmount", "slider"),
          expectedObservable:
            "Fill level changes partial fill output and becomes disabled when Fill mode is Full.",
          userAction:
            "Switch Fill mode to Full, verify Fill level is disabled, then switch to Partial and drag it.",
        },
      ],
    });

    expect(branchErrors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "uses disabledWhen. Generated product panels should show only controls usable in the current state",
        ),
      ]),
    );

    const schemaWithDisabledControl = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-3",
                controls: {
                  fillAmount: {
                    applicability: { mode: "always" as const },
                    defaultValue: 50,
                    disabled: true,
                    label: "Fill level",
                    max: 100,
                    min: 0,
                    target: "distribution.fillAmount",
                    type: "slider",
                  },
                },
                title: "Distribution",
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
        schema: schemaWithDisabledControl,
        acceptance: [
          makeControlAcceptance("distribution.fillAmount", "slider"),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "sets disabled: true. Generated product panels should show only controls usable in the current state",
        ),
      ]),
    );
  });
});
