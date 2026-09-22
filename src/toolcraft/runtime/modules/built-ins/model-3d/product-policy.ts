import type { ToolcraftProductBase } from "../../../schema/product-base";
import type { ToolcraftProductModulePolicyFacts } from "../../../schema/product-module-facts";
import { hasModelSource, hasCapability } from "../../../schema/product-module-facts";

export function validateProductPolicy(base: ToolcraftProductBase, resolution: ToolcraftProductModulePolicyFacts): readonly string[] {
  const errors: string[] = [];
  const modelSource = hasModelSource(base);
  const hasModel3d = hasCapability(resolution, "model.3d");
  if (modelSource && !hasModel3d) {
    errors.push(
      'A product model source requires resolved capability "model.3d".',
    );
  }
  if (hasModel3d && !modelSource) {
    errors.push(
      'Resolved capability "model.3d" requires a canonical model source: an assetKind "model" fileDrop or media.defaultAssets model entry.',
    );
  }

  return errors;
}
