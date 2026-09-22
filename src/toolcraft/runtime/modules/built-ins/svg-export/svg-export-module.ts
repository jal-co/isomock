import { validateContribution } from "./declaration";
import { createBuiltInToolcraftProductModuleDefinition } from "../../contract/module-definition";

const svgExportModuleDefinition =
  createBuiltInToolcraftProductModuleDefinition({
    contributions: [
      {
        id: "svg-export.action",
        kind: "panel-action",
        moduleId: "svg-export",
        role: "export-svg",
      },
    ],
    defaultProviders: [],
    id: "svg-export",
    portRequirements: [
      {
        applicability: "always",
        id: "scene.vectorFrameRenderer",
      },
    ],
    provides: ["artifact.svg-export"],
    requires: [],
  }, validateContribution);

export function svgExportModule() {
  return svgExportModuleDefinition;
}
