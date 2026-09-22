import {
  createToolcraftFunctionalProofModel,
} from "./toolcraft-functional-proof-model.mjs";
import type {
  ToolcraftDeliveryCatalog,
} from "./toolcraft-delivery-catalog-validation.mjs";

const catalog: ToolcraftDeliveryCatalog = {
  acceptance: [],
  performance: [],
  version: 2,
};

const model = createToolcraftFunctionalProofModel({ catalog });

createToolcraftFunctionalProofModel({
  catalog: {
    acceptance: [],
    performance: [],
    // @ts-expect-error Delivery catalog is current-only v2.
    version: 3,
  },
});

void model;
