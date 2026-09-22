import { describe, expect, it } from "vitest";

import {
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import { makeControlAcceptance } from "./app-acceptance.test-utils";

describe("starter acceptance toggle pair layout rules", () => {
  it("allows inline switch pairs when both labels are compact", () => {
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
                  glow: {
                    applicability: { mode: "always" as const },
                    defaultValue: true,
                    label: "Glow",
                    target: "style.glow",
                    type: "switch",
                  },
                  loop: {
                    applicability: { mode: "always" as const },
                    defaultValue: false,
                    label: "Loop",
                    target: "animation.loop",
                    type: "switch",
                  },
                },
                layoutGroups: [
                  {
                    columns: 2,
                    controls: ["glow", "loop"],
                    layout: "inline",
                  },
                ],
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
      schema: schema,
      acceptance: [
        makeControlAcceptance("style.glow", "switch"),
        makeControlAcceptance("animation.loop", "switch"),
      ],
    });

    expect(errors).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("two-column toggle row"),
      ]),
    );
  });

  it("requires adjacent compact toggle pairs for the same target entity to use an inline row", () => {
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
                  snapX: {
                    applicability: { mode: "always" as const },
                    defaultValue: true,
                    label: "Snap X",
                    target: "icon.snapX",
                    type: "switch",
                  },
                  snapY: {
                    applicability: { mode: "always" as const },
                    defaultValue: true,
                    label: "Snap Y",
                    target: "icon.snapY",
                    type: "switch",
                  },
                },
                title: "Icon Mark",
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
          makeControlAcceptance("icon.snapX", "switch"),
          makeControlAcceptance("icon.snapY", "switch"),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'Icon Mark has adjacent short toggle controls "snapX" and "snapY" for the same product entity "icon". Put them in a two-column inline layoutGroup so compact paired toggles share one row.',
      ]),
    );
  });

  it("accepts adjacent compact toggle pairs for the same target entity when they use an inline row", () => {
    const schema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-3",
                controls: {
                  snapX: {
                    applicability: { mode: "always" as const },
                    defaultValue: true,
                    label: "Snap X",
                    target: "icon.snapX",
                    type: "switch",
                  },
                  snapY: {
                    applicability: { mode: "always" as const },
                    defaultValue: true,
                    label: "Snap Y",
                    target: "icon.snapY",
                    type: "switch",
                  },
                },
                layoutGroups: [
                  {
                    columns: 2,
                    controls: ["snapX", "snapY"],
                    layout: "inline",
                  },
                ],
                title: "Icon Mark",
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
      schema: schema,
      acceptance: [
        makeControlAcceptance("icon.snapX", "switch"),
        makeControlAcceptance("icon.snapY", "switch"),
      ],
    });

    expect(errors).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("compact paired toggles share one row"),
      ]),
    );
  });

  it("rejects inline switch pairs when a label would truncate", () => {
    const schema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-4",
                controls: {
                  background: {
                    applicability: { mode: "always" as const },
                    defaultValue: true,
                    label: "Background",
                    target: "output.background",
                    type: "switch",
                  },
                  diagnosticOverlay: {
                    applicability: { mode: "always" as const },
                    defaultValue: false,
                    label: "Diagnostic overlay",
                    target: "debug.diagnosticOverlay",
                    type: "switch",
                  },
                },
                layoutGroups: [
                  {
                    columns: 2,
                    controls: ["background", "diagnosticOverlay"],
                    layout: "inline",
                  },
                ],
                title: "Output",
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
          makeControlAcceptance("output.background", "switch"),
          makeControlAcceptance("debug.diagnosticOverlay", "switch"),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'Output layoutGroups inline row "background, diagnosticOverlay" includes switch labels diagnosticOverlay "Diagnostic overlay" that are too long for a two-column toggle row. Switches share a row only when every visible label fits without truncation; shorten labels or stack them.',
      ]),
    );
  });
});
