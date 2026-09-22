import { TOOLCRAFT_DEFAULT_PROVIDER_CATALOG } from "../modules/built-in-catalog";
import type { ToolcraftModuleCatalog } from "../modules/contract/module-catalog";
import { validateBuiltInModuleContribution } from "./module-declaration-catalog";

export const toolcraftCoreModuleCatalog: ToolcraftModuleCatalog = Object.freeze({
  defaultProviders: TOOLCRAFT_DEFAULT_PROVIDER_CATALOG,
  validateContribution: validateBuiltInModuleContribution,
});
