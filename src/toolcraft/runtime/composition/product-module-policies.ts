import { validateProductPolicy as media } from "../modules/built-ins/media-source/product-policy";
import { validateProductPolicy as model } from "../modules/built-ins/model-3d/product-policy";
import { validateProductPolicy as spatial } from "../modules/built-ins/spatial-view/product-policy";
import type { ToolcraftProductBase } from "../schema/product-base";
import type { ResolvedToolcraftProductModules } from "../modules/resolution/resolve-product-modules";

const policies = Object.freeze([media, model, spatial]);
export function getModuleProductPolicyErrors(base: ToolcraftProductBase, resolution: ResolvedToolcraftProductModules): readonly string[] {
  return policies.flatMap(policy => policy(base, resolution));
}
