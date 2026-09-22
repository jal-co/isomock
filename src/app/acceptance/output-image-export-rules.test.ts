import { describe, expect, it } from "vitest";
import { defineToolcraft, imageExportModule, svgExportModule } from "@/toolcraft/runtime";
import { buildToolcraftOutputExportFacts } from "./output-export-model";
import { getToolcraftImageExportErrors } from "./output-image-export-rules";

function facts(svg: boolean) {
  return buildToolcraftOutputExportFacts({ schema: defineToolcraft({
    base: {
      identity: { id: "format-contract-test", title: "Format contract" },
      canvas: { enabled: true },
      panels: { controls: { title: "Controls", sections: [] } },
    },
    modules: [imageExportModule(), ...(svg ? [svgExportModule()] : [])],
  }) });
}

describe("image format capability contract", () => {
  it.each([true, false])("accepts the composed image settings (SVG: %s)", (svg) => {
    expect(getToolcraftImageExportErrors(facts(svg))).toEqual([]);
  });
  it("rejects SVG options without the SVG capability", () => {
    const input = facts(true);
    input.hasSvgExportAction = false;
    expect(getToolcraftImageExportErrors(input)).toContain("Image Export formats must match enabled capabilities exactly: png, jpg.");
  });
  it("requires SVG in the menu when both capabilities are enabled", () => {
    const input = facts(false);
    input.hasSvgExportAction = true;
    expect(getToolcraftImageExportErrors(input)).toContain("Image Export formats must match enabled capabilities exactly: png, jpg, svg.");
    expect(getToolcraftImageExportErrors(input)).toContain("Image Export resolution must be present only for PNG/JPG and absent for SVG.");
  });
});
