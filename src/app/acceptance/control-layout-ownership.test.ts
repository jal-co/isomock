import { describe, expect, it } from "vitest";
import { defineToolcraft } from "@/toolcraft/runtime";
import { defineExportModuleSchemaFixture } from "../app-acceptance.export-test-utils";
import { getToolcraftControlSectionInvariantErrors } from "./control-layout";
import { buildToolcraftControlLayoutFacts } from "./control-layout-model";

describe("control section ownership", () => {
  it("accepts runtime Settings while retaining its Background controls for validation", () => {
    const schema = defineExportModuleSchemaFixture({ image: true });
    const settings = buildToolcraftControlLayoutFacts(schema).sections.find(
      (section) => section.sectionId === "runtime.setup",
    );
    expect(settings?.controls.map(([, control]) => control.target)).toContain("export.includeBackground");
    expect(settings?.controls.map(([, control]) => control.target)).toContain("appearance.background");
    expect(getToolcraftControlSectionInvariantErrors(schema)).not.toContainEqual(
      expect.stringContaining("Settings is too generic"),
    );
  });

  it("still rejects an authored Settings section", () => {
    const schema = defineToolcraft({
      base: {
        identity: { id: "authored-settings", title: "Authored settings" },
        canvas: { enabled: true },
        panels: { controls: { title: "Controls", sections: [{
          id: "product-settings", title: "Settings", controls: {
            count: { type: "slider", min: 1, max: 10, step: 1, target: "pattern.count", label: "Count", defaultValue: 3, applicability: { mode: "always" } },
          },
        }] } },
      },
      modules: [],
    });
    expect(getToolcraftControlSectionInvariantErrors(schema)).toContainEqual(
      expect.stringContaining("Settings is too generic"),
    );
  });
});
