import { createBuiltInToolcraftProductModuleDefinition } from "../../contract/module-definition";
import { validateContribution } from "./declaration";
import type { ToolcraftMasksModuleOptions } from "./contracts";
import { createToolcraftMasksSettings } from "./settings";

export function masksModule(options: ToolcraftMasksModuleOptions = {}) {
  if (Object.keys(options).some(key => key !== "spatialFields" && key !== "guideSurface")
    || (options.spatialFields !== undefined && options.spatialFields !== "editable" && options.spatialFields !== "read-only")
    || (options.guideSurface !== undefined && options.guideSurface !== "canvas")) throw new Error("Invalid masks module options.");
  return createBuiltInToolcraftProductModuleDefinition({
    id: "masks", provides: ["foreground.soft-ellipses"], requires: [], defaultProviders: [], portRequirements: [],
    contributions: [{ id: "masks.settings", moduleId: "masks", kind: "control-section", runtimeSectionId: "runtime.masks", placement: { slot: "product-settings", before: [], after: [] }, section: createToolcraftMasksSettings(options) }],
  }, validateContribution);
}
