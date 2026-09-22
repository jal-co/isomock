import { describe, expect, it } from "vitest";
import {
  defineToolcraft,
  imageExportModule,
  svgExportModule,
  videoExportModule,
} from "@/toolcraft/runtime";

import {
  schemaHasPngExportPanelAction,
  schemaHasSvgExportPanelAction,
  schemaHasVideoExportPanelAction,
} from "./output-export-actions";

function createOutputSchema() {
  return defineToolcraft({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: { enabled: true },
      panels: { controls: { sections: [], title: "Controles" } },
    },
    modules: [imageExportModule(), svgExportModule(), videoExportModule()],
  });
}

describe("Toolcraft typed output action roles", () => {
  it("detects image, SVG, and video export without parsing labels or values", () => {
    const schema = createOutputSchema();

    expect(schemaHasPngExportPanelAction(schema)).toBe(true);
    expect(schemaHasSvgExportPanelAction(schema)).toBe(true);
    expect(schemaHasVideoExportPanelAction(schema)).toBe(true);
  });

  it("does not treat export-like prose as semantic output evidence", () => {
    const schema = defineToolcraft({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [
              {
                id: "test-section-2",
                controls: {
                  output: {
                    applicability: { mode: "always" as const },
                    actions: [{ label: "Export PNG", value: "export.png" }],
                    target: "local.actions",
                    type: "panelActions",
                  },
                },
                title: "Output",
              },
            ],
            title: "Controls",
          },
        },
      },
      modules: [],
    });

    expect(schemaHasPngExportPanelAction(schema)).toBe(false);
    expect(schemaHasSvgExportPanelAction(schema)).toBe(false);
    expect(schemaHasVideoExportPanelAction(schema)).toBe(false);
  });
});
