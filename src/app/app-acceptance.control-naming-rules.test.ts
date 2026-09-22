import { describe, expect, it } from "vitest";

import {
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import { makeControlAcceptance } from "./app-acceptance.test-utils";

describe("starter acceptance control naming rules", () => {
  it("rejects Enable or Disable prefixes on binary control labels", () => {
    const schemaWithActionLabels = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-1",
                controls: {
                  crt: {
                    applicability: { mode: "always" as const },
                    defaultValue: true,
                    label: "Enable CRT",
                    target: "style.crt",
                    type: "switch",
                  },
                  guides: {
                    applicability: { mode: "always" as const },
                    defaultValue: false,
                    label: "Disable guides",
                    target: "overlay.guides",
                    type: "checkbox",
                  },
                },
                title: "Style",
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
        schema: schemaWithActionLabels,
        acceptance: [
          makeControlAcceptance("style.crt", "switch"),
          makeControlAcceptance("overlay.guides", "checkbox"),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'style.crt) toggle labels must name the setting context only; use "CRT", "Background", "Glow", or "Loop" instead of "Enable CRT".',
        ),
        expect.stringContaining(
          'overlay.guides) toggle labels must name the setting context only; use "CRT", "Background", "Glow", or "Loop" instead of "Disable guides".',
        ),
      ]),
    );

    const schemaWithContextLabels = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-2",
                controls: {
                  crt: {
                    applicability: { mode: "always" as const },
                    defaultValue: true,
                    label: "CRT",
                    target: "style.crt",
                    type: "switch",
                  },
                  guides: {
                    applicability: { mode: "always" as const },
                    defaultValue: false,
                    label: "Guides",
                    target: "overlay.guides",
                    type: "checkbox",
                  },
                },
                title: "Style",
              },
            ],
            title: "Controls",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    const errors = validateContractAcceptance({
      schema: schemaWithContextLabels,
      acceptance: [
        makeControlAcceptance("style.crt", "switch"),
        makeControlAcceptance("overlay.guides", "checkbox"),
      ],
    });

    expect(errors).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "toggle labels must name the setting context only",
        ),
      ]),
    );
  });

  it("rejects binary control labels that duplicate their section title", () => {
    const schemaWithDuplicateToggleLabel = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-3",
                controls: {
                  includeBackground: {
                    applicability: { mode: "always" as const },
                    defaultValue: true,
                    label: "Background",
                    target: "export.includeBackground",
                    type: "switch",
                  },
                },
                title: "Background",
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
        schema: schemaWithDuplicateToggleLabel,
        acceptance: [
          makeControlAcceptance("export.includeBackground", "switch"),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'Background / includeBackground visible label "Background" duplicates section title "Background". Set label: false when the section supplies the complete visible context, or use a more specific label for a distinct setting.',
        ),
      ]),
    );
  });

  it("rejects visible select labels that duplicate their section title", () => {
    const schemaWithDuplicateSelectLabel = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-4",
                controls: {
                  spectrum: {
                    applicability: { mode: "always" as const },
                    defaultValue: "custom",
                    label: "Spectrum",
                    options: [{ label: "Custom", value: "custom" }],
                    target: "dispersion.spectrum",
                    type: "select",
                  },
                },
                title: "Spectrum",
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
        schema: schemaWithDuplicateSelectLabel,
        acceptance: [makeControlAcceptance("dispersion.spectrum", "select")],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'Spectrum / spectrum visible label "Spectrum" duplicates section title "Spectrum". Set label: false when the section supplies the complete visible context, or use a more specific label for a distinct setting.',
        ),
      ]),
    );
  });

  it("allows tabs accessibility names that match their section title", () => {
    const schemaWithMatchingTabsName = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-5",
                controls: {
                  spectrum: {
                    applicability: { mode: "always" as const },
                    defaultValue: "custom",
                    label: "Spectrum",
                    options: [{ label: "Custom", value: "custom" }],
                    target: "dispersion.spectrum",
                    type: "tabs",
                  },
                },
                title: "Spectrum",
              },
            ],
            title: "Controls",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    const errors = validateContractAcceptance({
      schema: schemaWithMatchingTabsName,
      acceptance: [makeControlAcceptance("dispersion.spectrum", "tabs")],
    });

    expect(errors).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("duplicates section title"),
      ]),
    );
  });

  it("rejects single Actions controls that duplicate their only button label", () => {
    const schemaWithDuplicateActionLabel = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-6",
                controls: {
                  wash: {
                    applicability: { mode: "always" as const },
                    actions: [{ label: "Wash", value: "wash" }],
                    defaultValue: null,
                    label: "Wash",
                    target: "flow.washSignal",
                    type: "actions",
                  },
                },
                title: "Flow",
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
        schema: schemaWithDuplicateActionLabel,
        acceptance: [makeControlAcceptance("flow.washSignal", "actions")],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'flow.washSignal) single Actions control label "Wash" duplicates its only button label "Wash". Keep the button as the command and use a short context label such as "Ink wash", "Palette action", or "Current layer".',
        ),
      ]),
    );
  });

  it("allows single Actions controls with a concise context label", () => {
    const schemaWithContextActionLabel = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-7",
                controls: {
                  wash: {
                    applicability: { mode: "always" as const },
                    actions: [{ label: "Wash", value: "wash" }],
                    defaultValue: null,
                    label: "Ink wash",
                    target: "flow.washSignal",
                    type: "actions",
                  },
                },
                title: "Flow",
              },
            ],
            title: "Controls",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    const errors = validateContractAcceptance({
      schema: schemaWithContextActionLabel,
      acceptance: [makeControlAcceptance("flow.washSignal", "actions")],
    });

    expect(errors).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("single Actions control label"),
      ]),
    );
  });
});
