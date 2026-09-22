import { validateContribution } from "./declaration";
import { createBuiltInToolcraftProductModuleDefinition } from "../../contract/module-definition";

const layersModuleDefinition =
  createBuiltInToolcraftProductModuleDefinition({
    contributions: [
      {
        id: "layers.surface",
        kind: "panel-surface",
        configuration: true,
        moduleId: "layers",
        surface: "layers",
      },
      {
        id: "layers.persistence",
        kind: "persistence-requirement",
        moduleId: "layers",
        slice: "layers",
      },
    ],
    defaultProviders: [],
    id: "layers",
    portRequirements: [],
    provides: ["layers.management"],
    requires: [],
  }, validateContribution);

export function layersModule() {
  return layersModuleDefinition;
}
