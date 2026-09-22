import type { ToolcraftProductBase } from "../../../schema/product-base";
import type { ToolcraftProductModulePolicyFacts } from "../../../schema/product-module-facts";
import { hasOrientationGizmo, hasCapability } from "../../../schema/product-module-facts";

export function validateProductPolicy(base: ToolcraftProductBase, resolution: ToolcraftProductModulePolicyFacts): readonly string[] {
  const errors: string[] = [];
  const orientationGizmo = hasOrientationGizmo(base);
  const hasSpatialView = hasCapability(resolution, "spatial.view");
  if (orientationGizmo && !hasSpatialView) {
    errors.push(
      'An orientationGizmo control requires resolved capability "spatial.view".',
    );
  }
  if (hasSpatialView && !orientationGizmo) {
    errors.push(
      'Resolved capability "spatial.view" requires an orientationGizmo control.',
    );
  }

  return errors;
}
