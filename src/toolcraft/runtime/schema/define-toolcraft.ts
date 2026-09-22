import type { ToolcraftProductDefinition } from "./product-base";
import type { ResolvedToolcraftAppSchema } from "./resolved-app-schema";
import { resolveToolcraftProductDefinition } from "./resolve-toolcraft-product-definition";

export function defineToolcraft(
  definition: ToolcraftProductDefinition,
): ResolvedToolcraftAppSchema {
  return resolveToolcraftProductDefinition(definition);
}
