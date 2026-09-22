import { validateContribution } from "./declaration";
import { TOOLCRAFT_SPATIAL_VIEW_OPERATIONS } from "../../contract/contribution";
import { createBuiltInToolcraftProductModuleDefinition } from "../../contract/module-definition";

const spatialViewModuleDefinition =
  createBuiltInToolcraftProductModuleDefinition({
    contributions: [
      {
        behavior: "spatial-view",
        id: "spatial-view.behavior",
        kind: "canvas-behavior",
        moduleId: "spatial-view",
        operations: TOOLCRAFT_SPATIAL_VIEW_OPERATIONS,
      },
    ],
    defaultProviders: [],
    id: "spatial-view",
    portRequirements: [
      {
        applicability: "spatial-product-scene",
        id: "scene.canvasContent",
      },
    ],
    provides: ["spatial.view"],
    requires: [],
  }, validateContribution);

export function spatialViewModule() {
  return spatialViewModuleDefinition;
}
