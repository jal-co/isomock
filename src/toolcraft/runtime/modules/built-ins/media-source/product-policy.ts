import type { ToolcraftProductBase } from "../../../schema/product-base";
import type { ToolcraftProductModulePolicyFacts } from "../../../schema/product-module-facts";
import { getSourceKinds, hasCapability } from "../../../schema/product-module-facts";

export function validateProductPolicy(base: ToolcraftProductBase, resolution: ToolcraftProductModulePolicyFacts): readonly string[] {
  const errors: string[] = [];
  const sourceKinds = getSourceKinds(base);
  const hasSourceFacts = sourceKinds.length > 0;
  const hasMediaSource = hasCapability(resolution, "media.source");
  const mediaPolicy = resolution.contributionResolution.mediaPolicy;
  if (hasSourceFacts && (!hasMediaSource || mediaPolicy === undefined)) {
    errors.push(
      'Product media facts require resolved capability "media.source" and media policy "source-workflow".',
    );
  } else if (hasSourceFacts && mediaPolicy !== undefined) {
    for (const sourceKind of sourceKinds) {
      if (!mediaPolicy.sourceKinds.includes(sourceKind)) {
        errors.push(
          `Resolved media policy "${mediaPolicy.policy}" does not support product source kind "${sourceKind}".`,
        );
      }
    }
  }
  if (hasMediaSource && !hasSourceFacts) {
    errors.push(
      'Resolved capability "media.source" requires a canvas upload, fileDrop source, or media.defaultAssets entry.',
    );
  }

  return errors;
}
