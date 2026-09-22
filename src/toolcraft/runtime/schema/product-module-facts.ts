import type { ToolcraftProductBase } from "./product-base";
import type { ToolcraftControlSchema, ToolcraftFileDropAssetKind } from "./types";
import type { ToolcraftProductCapabilityId } from "../modules/contract/capability";
import type { ResolvedProductModulePlan } from "../modules/contract/module-plan";
export type ToolcraftProductModulePolicyFacts = Readonly<{
  plan: Pick<ResolvedProductModulePlan, "capabilities">;
  contributionResolution: Readonly<{ mediaPolicy?: Readonly<{ policy: string; sourceKinds: readonly ToolcraftFileDropAssetKind[]; }>; }>;
}>;

export function getProductControls(base: ToolcraftProductBase): readonly ToolcraftControlSchema[] {
  return (base.panels.controls?.sections ?? []).flatMap(({ controls }) =>
    Object.values(controls),
  );
}

export function getSourceKinds(base: ToolcraftProductBase): readonly ToolcraftFileDropAssetKind[] {
  const sourceKinds = new Set<ToolcraftFileDropAssetKind>();
  if (base.canvas.upload) sourceKinds.add("image");
  for (const control of getProductControls(base)) {
    if (control.type === "fileDrop") {
      sourceKinds.add(control.assetKind ?? "image");
    }
  }
  for (const asset of base.media?.defaultAssets ?? []) {
    sourceKinds.add(asset.assetKind ?? "image");
  }
  return Object.freeze([...sourceKinds].sort());
}

export function hasCapability(
  resolution: ToolcraftProductModulePolicyFacts,
  capabilityId: ToolcraftProductCapabilityId,
): boolean {
  return resolution.plan.capabilities.some(
    (capability) => capability.capabilityId === capabilityId,
  );
}

export function hasModelSource(base: ToolcraftProductBase): boolean {
  return (
    getProductControls(base).some(
      (control) => control.type === "fileDrop" && control.assetKind === "model",
    ) ||
    (base.media?.defaultAssets ?? []).some((asset) => asset.assetKind === "model")
  );
}

export function hasOrientationGizmo(base: ToolcraftProductBase): boolean {
  return getProductControls(base).some(
    (control) => control.type === "orientationGizmo",
  );
}
