import { describe, expect, it } from "vitest";
import { defineToolcraft } from "@/toolcraft/runtime";
import { getToolcraftRuntimeSetupSectionErrors, isRuntimeSetupControlTarget } from "./runtime-setup";

describe("Workspace background Setup ownership", () => {
  it("requires separate unconditional defaults and Settings sections before product controls", () => {
    const schema = defineToolcraft({
      base: {
        identity: { id: "settings-structure", title: "Settings structure" },
        canvas: { enabled: false },
        panels: { controls: { title: "Controls", sections: [] } },
      },
      modules: [],
    });
    const panel = schema.panels.controls!;
    const [defaults, settings] = panel.sections;
    expect(getToolcraftRuntimeSetupSectionErrors(schema)).toEqual([]);
    const errorsFor = (sections: typeof panel.sections) => getToolcraftRuntimeSetupSectionErrors({
      ...schema, panels: { ...schema.panels, controls: { ...panel, sections } },
    }).join("\n");
    expect(errorsFor([settings, defaults])).toContain("Settings must follow");
    expect(errorsFor([defaults, { ...settings, visibleWhen: { target: "mode", equals: "custom" } }]))
      .toContain("no product-mode gating");
    expect(errorsFor([{ ...defaults, controls: {} }, settings]))
      .toContain("must contain only settingsTransfer");
    expect(errorsFor([defaults, { ...settings, controls: defaults.controls }]))
      .toContain('uses runtime Setup target "runtime.settingsTransfer"');
  });

  it("exempts the runtime control from product inventory and rejects an authored duplicate", () => {
    const target = "canvas.workspaceBackground";
    expect(isRuntimeSetupControlTarget(target)).toBe(true);
    const schema = defineToolcraft({
      base: {
        identity: { id: "workspace-owner", title: "Workspace" },
        canvas: { enabled: true },
        panels: { controls: { title: "Controls", sections: [{
          id: "product", title: "Product", controls: {
            duplicate: { applicability: { mode: "always" }, type: "select", target,
              options: [{ label: "Dots", value: "dots" }], defaultValue: "dots" },
          },
        }] } },
      },
      modules: [],
    });
    expect(getToolcraftRuntimeSetupSectionErrors(schema).join("\n"))
      .toContain('uses runtime Setup target "canvas.workspaceBackground"');
  });
});
