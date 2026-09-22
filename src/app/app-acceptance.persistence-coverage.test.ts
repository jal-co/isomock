import { describe, expect, it } from "vitest";
import { defineToolcraft, mediaSourceModule } from "@/toolcraft/runtime";

import { validateContractAcceptance } from "./app-acceptance.contract-fixtures";
import { getToolcraftPersistenceCoverageResult } from "./acceptance/runtime-coverage";
import { makeControlAcceptance } from "./app-acceptance.test-utils";

describe("Toolcraft starter persistence acceptance coverage", () => {
  it("returns one frozen reload result for the resolved persistence plan", () => {
    const persistentSchema = defineToolcraft({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true, upload: true },
        panels: {},
        persistence: { storage: "localStorage" },
      },
      modules: [mediaSourceModule()],
    });
    if (persistentSchema.persistence.storage !== "localStorage") {
      throw new Error("Expected local persistence.");
    }
    const acceptance = [
      {
        automated: true,
        automatedTestName: "restores persisted media state",
        browser: {
          budget: "standard",
          file: "e2e/app-controls.spec.ts",
          testName: "browser: restores persisted media state",
        } as const,
        componentType: "persistence",
        evidence: "persistence-state" as const,
        expectedObservable:
          "The persisted media workspace returns after reload.",
        fixture: "persistent media workspace",
        id: "persistence.reload",
        kind: "runtime" as const,
        persistenceCoverage: "reload" as const,
        persistenceSlices: persistentSchema.persistence.include,
        target: "persistence.reload",
        userAction: "Change persisted media state and reload.",
      },
    ];

    const result = getToolcraftPersistenceCoverageResult({
      acceptance,
      schema: persistentSchema,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.reloadCoverageValidated).toBe(true);
    expect(result.validatedSlices).toEqual(
      [...persistentSchema.persistence.include].sort(),
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
    expect(Object.isFrozen(result.validatedSlices)).toBe(true);
  });

  it("does not invent a reload fact when persistence is disabled", () => {
    const schema = defineToolcraft({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {},
        persistence: { storage: "none" },
      },
      modules: [],
    });

    expect(
      getToolcraftPersistenceCoverageResult({ acceptance: [], schema }),
    ).toMatchObject({
      diagnostics: [],
      reloadCoverageValidated: false,
      validatedSlices: [],
    });
  });

  it("requires browser reload acceptance when localStorage persistence is enabled", () => {
    const persistentSchema = defineToolcraft({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-1",
                controls: {
                  opacity: {
                    applicability: { mode: "always" as const },
                    defaultValue: 0.75,
                    label: "Opacity",
                    target: "appearance.opacity",
                    type: "slider",
                  },
                },
                title: "Appearance",
              },
            ],
            title: "Controls",
          },
        },
        persistence: { storage: "localStorage" },
      },
      modules: [],
    });

    if (persistentSchema.persistence.storage !== "localStorage") {
      throw new Error("Expected local persistence.");
    }

    expect(
      validateContractAcceptance({
        schema: persistentSchema,
        acceptance: [
          {
            automated: true,
            automatedTestName: "opacity changes product output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: opacity changes product output",
            },
            componentType: "slider",
            evidence: "product-output",
            expectedObservable:
              "Changing Opacity changes rendered product opacity.",
            fixture: "opacity fixture",
            id: "appearance.opacity",
            kind: "control",
            target: "appearance.opacity",
            userAction: "Drag the Opacity slider.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'persistence.storage "localStorage" requires a runtime acceptance entry with persistenceCoverage "reload" proving user-edited persisted state restores after a real browser reload. Settings import/export is not a substitute for persistence.',
      ]),
    );
  });

  it("accepts typed reload coverage without relying on English prose", () => {
    const persistentSchema = defineToolcraft({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-2",
                controls: {
                  opacity: {
                    applicability: { mode: "always" as const },
                    defaultValue: 0.75,
                    label: "Opacity",
                    target: "appearance.opacity",
                    type: "slider",
                  },
                },
                title: "Appearance",
              },
            ],
            title: "Controls",
          },
        },
        persistence: { storage: "localStorage" },
      },
      modules: [],
    });

    if (persistentSchema.persistence.storage !== "localStorage") {
      throw new Error("Expected local persistence.");
    }

    expect(
      validateContractAcceptance({
        schema: persistentSchema,
        acceptance: [
          {
            automated: true,
            automatedTestName: "opacity changes product output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: opacity changes product output",
            },
            componentType: "slider",
            evidence: "product-output",
            expectedObservable:
              "Changing Opacity changes rendered product opacity.",
            fixture: "opacity fixture",
            id: "appearance.opacity",
            kind: "control",
            target: "appearance.opacity",
            userAction: "Drag the Opacity slider.",
          },
          {
            automated: true,
            automatedTestName: "exports and imports settings",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: exports and imports settings",
            },
            componentType: "persistence",
            evidence: "persistence-state",
            expectedObservable:
              "El valor editado reaparece después de recargar.",
            fixture: "settings transfer fixture",
            id: "persistence.reload",
            kind: "runtime",
            persistenceCoverage: "reload",
            persistenceSlices: persistentSchema.persistence.include,
            target: "persistence.reload",
            userAction:
              "Cambiar el valor, recargar la página y observar el estado.",
          },
        ],
      }),
    ).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("must describe changing a user-facing setting"),
      ]),
    );
  });

  it("requires persistence-state evidence and every resolved slice", () => {
    const persistentSchema = defineToolcraft({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {},
        persistence: { storage: "localStorage" },
      },
      modules: [],
    });
    const errors = validateContractAcceptance({
      acceptance: [
        {
          automated: true,
          automatedTestName: "restores persisted state",
          browser: {
            budget: "standard",
            file: "e2e/app-controls.spec.ts",
            testName: "browser: restores persisted state",
          },
          componentType: "persistence",
          evidence: "command-side-effect",
          expectedObservable: "The persisted workspace returns after reload.",
          fixture: "persistent workspace",
          id: "persistence.reload",
          kind: "runtime",
          persistenceCoverage: "reload",
          persistenceSlices: ["values"],
          target: "persistence.reload",
          userAction: "Change persisted state and reload.",
        },
      ],
      schema: persistentSchema,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('evidence "persistence-state"'),
        expect.stringMatching(/missing canvas, panels/u),
      ]),
    );
  });
});
