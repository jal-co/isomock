import { validateContribution } from "./declaration";
import { TOOLCRAFT_CANVAS_EDITING_OPERATIONS } from "../../contract/contribution";
import { createBuiltInToolcraftProductModuleDefinition } from "../../contract/module-definition";

const canvasEditingModuleDefinition =
  createBuiltInToolcraftProductModuleDefinition({
    contributions: [
      {
        behavior: "editing",
        id: "canvas-editing.behavior",
        kind: "canvas-behavior",
        moduleId: "canvas-editing",
        operations: TOOLCRAFT_CANVAS_EDITING_OPERATIONS,
      },
    ],
    defaultProviders: [],
    id: "canvas-editing",
    portRequirements: [
      { applicability: "always", id: "scene.canvasContent" },
    ],
    provides: ["canvas.editing"],
    requires: [],
  }, validateContribution);

export function canvasEditingModule() {
  return canvasEditingModuleDefinition;
}
