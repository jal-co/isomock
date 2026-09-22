import { describe, expect, it } from "vitest";

import {
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import { makeControlAcceptance } from "./app-acceptance.test-utils";

describe("starter acceptance toggle parameter layout rules", () => {
  it("allows short Include toggle plus an unlabeled background color in the required row", () => {
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
                  includeBackground: {
                    applicability: { mode: "always" as const },
                    defaultValue: true,
                    description:
                      "Controls preview and PNG background visibility while video keeps the background.",
                    label: "Include",
                    target: "export.includeBackground",
                    type: "switch",
                  },
                  background: {
                    applicability: { mode: "always" as const },
                    defaultValue: "#0F0F0F",
                    label: false,
                    target: "appearance.background",
                    type: "color",
                  },
                },
                layoutGroups: [
                  {
                    columns: 2,
                    controls: ["includeBackground", "background"],
                    layout: "inline",
                  },
                ],
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

    const errors = validateContractAcceptance({
      schema: schema,
      acceptance: [
        makeControlAcceptance("export.includeBackground", "switch"),
        makeControlAcceptance("appearance.background", "color"),
      ],
    });

    expect(errors).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("duplicates section title"),
        expect.stringContaining("too long for a two-column toggle row"),
        expect.stringContaining("must use the short visible label"),
        expect.stringContaining("must use label false"),
      ]),
    );
  });

  it("allows short visible toggle labels beside one related parameter", () => {
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
                  loop: {
                    applicability: { mode: "always" as const },
                    defaultValue: true,
                    label: "Loop",
                    target: "animation.loop",
                    type: "switch",
                  },
                  duration: {
                    applicability: { mode: "always" as const },
                    defaultValue: "8",
                    label: false,
                    target: "animation.duration",
                    textValueKind: "single-line",
                    type: "text",
                  },
                },
                layoutGroups: [
                  {
                    columns: 2,
                    controls: ["loop", "duration"],
                    layout: "inline",
                  },
                ],
                title: "Playback",
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
        makeControlAcceptance("animation.loop", "switch"),
        makeControlAcceptance("animation.duration", "text"),
      ],
    });

    expect(errors).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("compact toggle-plus-parameter row"),
      ]),
    );
  });

  it("rejects visible parameter labels beside one related toggle", () => {
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
                  loop: {
                    applicability: { mode: "always" as const },
                    defaultValue: true,
                    label: "Loop",
                    target: "animation.loop",
                    type: "switch",
                  },
                  duration: {
                    applicability: { mode: "always" as const },
                    defaultValue: "8",
                    label: "Duration",
                    target: "animation.duration",
                    textValueKind: "single-line",
                    type: "text",
                  },
                },
                layoutGroups: [
                  {
                    columns: 2,
                    controls: ["loop", "duration"],
                    layout: "inline",
                  },
                ],
                title: "Playback",
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
          makeControlAcceptance("animation.loop", "switch"),
          makeControlAcceptance("animation.duration", "text"),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'Playback layoutGroups inline row "loop, duration" pairs a toggle with parameter labels duration "Duration". In toggle-plus-parameter rows, the non-toggle parameter must use label false; if that label is needed, stack the controls instead.',
        ),
      ]),
    );
  });

  it("rejects segmented controls in inline half-width layout rows", () => {
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
                  includeText: {
                    applicability: { mode: "always" as const },
                    defaultValue: true,
                    label: "Include",
                    target: "text.enabled",
                    type: "switch",
                  },
                  dragTarget: {
                    applicability: { mode: "always" as const },
                    defaultValue: "glass",
                    label: "Drag",
                    options: [
                      { label: "Glass", value: "glass" },
                      { label: "Text", value: "text" },
                    ],
                    target: "text.dragTarget",
                    type: "segmented",
                  },
                },
                layoutGroups: [
                  {
                    columns: 2,
                    controls: ["includeText", "dragTarget"],
                    layout: "inline",
                  },
                ],
                title: "Glass Text",
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
          makeControlAcceptance("text.enabled", "switch"),
          makeControlAcceptance("text.dragTarget", "segmented"),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'Glass Text layoutGroups inline row "includeText, dragTarget" includes segmented control dragTarget. Segmented is full-width and must not share a two-column or half-width row; use Select when a finite choice must fit beside another control.',
        ),
      ]),
    );
  });

  it("rejects tabs controls in inline half-width layout rows", () => {
    const schema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-5",
                controls: {
                  includeText: {
                    applicability: { mode: "always" as const },
                    defaultValue: true,
                    label: "Include",
                    target: "text.enabled",
                    type: "switch",
                  },
                  dragTarget: {
                    applicability: { mode: "always" as const },
                    defaultValue: "glass",
                    label: "Drag",
                    options: [
                      { label: "Glass", value: "glass" },
                      { label: "Text", value: "text" },
                    ],
                    target: "text.dragTarget",
                    type: "tabs",
                  },
                },
                layoutGroups: [
                  {
                    columns: 2,
                    controls: ["includeText", "dragTarget"],
                    layout: "inline",
                  },
                ],
                title: "Glass Text",
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
          makeControlAcceptance("text.enabled", "switch"),
          makeControlAcceptance("text.dragTarget", "tabs"),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'Glass Text layoutGroups inline row "includeText, dragTarget" includes tabs control dragTarget. Tabs is full-width and must not share a two-column or half-width row.',
        ),
      ]),
    );
  });

  it("rejects long visible toggle labels beside one related parameter", () => {
    const schema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-6",
                controls: {
                  transparentBackground: {
                    applicability: { mode: "always" as const },
                    defaultValue: true,
                    label: "Transparent background",
                    target: "export.transparentBackground",
                    type: "switch",
                  },
                  background: {
                    applicability: { mode: "always" as const },
                    defaultValue: "#0F0F0F",
                    label: "Background",
                    target: "appearance.background",
                    type: "color",
                  },
                },
                layoutGroups: [
                  {
                    columns: 2,
                    controls: ["transparentBackground", "background"],
                    layout: "inline",
                  },
                ],
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
        schema: schema,
        acceptance: [
          makeControlAcceptance("export.transparentBackground", "switch"),
          makeControlAcceptance("appearance.background", "color"),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'Background layoutGroups inline row "transparentBackground, background" includes toggle label transparentBackground "Transparent background" that is too long for a compact toggle-plus-parameter row.',
        ),
      ]),
    );
  });
});
