import type {
  ToolcraftFunctionalProofModel,
} from "./toolcraft-functional-proof-model.mjs";
import type {
  ToolcraftDeliveryCatalog,
} from "./toolcraft-delivery-catalog-validation.mjs";

export type ToolcraftDeliveryFunctionalContext = Readonly<{
  catalog: ToolcraftDeliveryCatalog;
  currentFunctionalProofModel: ToolcraftFunctionalProofModel;
}>;

export function collectToolcraftDeliveryFunctionalContextCore(options: {
  dependencies: Readonly<{
    collectCatalog(rootDir: string): Promise<ToolcraftDeliveryCatalog>;
    createFunctionalProofModel(input: {
      catalog: ToolcraftDeliveryCatalog;
    }): ToolcraftFunctionalProofModel;
  }>;
  projectDir: string;
}): Promise<ToolcraftDeliveryFunctionalContext>;

export function collectToolcraftDeliveryFunctionalContext(
  projectDir: string,
): Promise<ToolcraftDeliveryFunctionalContext>;
