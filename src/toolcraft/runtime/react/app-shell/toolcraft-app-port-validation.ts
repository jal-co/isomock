import { getToolcraftModulePortErrors } from "../../modules/resolution/validate-module-ports";
import type { ResolvedToolcraftAppSchema } from "../../schema/resolved-app-schema";
import type { ToolcraftModelPresentationMode } from "../model-rendering/model-render-binding";
import {
  getToolcraftProvidedIntegrationPortIds,
  type ToolcraftAppPorts,
} from "./toolcraft-app-ports";
import type { ToolcraftProductSceneRequirement } from "./product-scene-requirement";

function hasRuntimeModelOwner(schema: ResolvedToolcraftAppSchema): boolean {
  return (
    schema.modulePlan.capabilities.some(
      ({ capabilityId }) => capabilityId === "model.3d",
    ) &&
    !schema.modulePlan.portRequirements.some(
      ({ id }) => id === "modelPresentation",
    )
  );
}

export function assertToolcraftAppModulePorts({
  modelPresentation,
  ports,
  sceneRequirement,
  schema,
}: Readonly<{
  modelPresentation: ToolcraftModelPresentationMode;
  ports: ToolcraftAppPorts;
  sceneRequirement: ToolcraftProductSceneRequirement;
  schema: ResolvedToolcraftAppSchema;
}>): void {
  const errors = getToolcraftModulePortErrors({
    plan: schema.modulePlan,
    productSceneRequired: sceneRequirement.productSceneRequired,
    provided: getToolcraftProvidedIntegrationPortIds({
      ...ports,
      ...(modelPresentation.mode === "custom" ? { modelPresentation } : {}),
    }),
    spatialProductSceneRequired:
      !hasRuntimeModelOwner(schema) || sceneRequirement.independentlyRequired,
  });
  if (errors.length > 0) {
    throw new Error(
      `Toolcraft app ports are invalid:\n- ${errors.join("\n- ")}`,
    );
  }
}
