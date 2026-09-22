import { validateContribution } from "./declaration";
import { createBuiltInToolcraftProductModuleDefinition } from "../../contract/module-definition";

type ToolcraftModel3dModuleOptions = Readonly<{
  presentation?: "custom" | "runtime";
}>;

function createModel3dModuleDefinition(presentation: "custom" | "runtime") {
  return createBuiltInToolcraftProductModuleDefinition({
    contributions: [],
    defaultProviders: [
      {
        capabilityId: "media.source",
        providerId: "media.source-default",
      },
    ],
    id: "model-3d",
    portRequirements:
      presentation === "custom"
        ? [{ applicability: "always", id: "modelPresentation" }]
        : [],
    provides: ["model.3d"],
    requires: ["media.source"],
  }, validateContribution);
}

const customModel3dModuleDefinition =
  createModel3dModuleDefinition("custom");
const runtimeModel3dModuleDefinition =
  createModel3dModuleDefinition("runtime");

export function model3dModule(options: ToolcraftModel3dModuleOptions = {}) {
  return options.presentation === "custom"
    ? customModel3dModuleDefinition
    : runtimeModel3dModuleDefinition;
}
