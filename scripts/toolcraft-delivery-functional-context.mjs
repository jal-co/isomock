import {
  collectToolcraftDeliveryCatalog,
} from "./toolcraft-delivery-catalog-collector.mjs";
import {
  createToolcraftFunctionalProofModel,
} from "./toolcraft-functional-proof-model.mjs";

const defaultDependencies = Object.freeze({
  collectCatalog: collectToolcraftDeliveryCatalog,
  createFunctionalProofModel: createToolcraftFunctionalProofModel,
});

export async function collectToolcraftDeliveryFunctionalContextCore({
  dependencies,
  projectDir,
}) {
  const catalog = await dependencies.collectCatalog(projectDir);
  const currentFunctionalProofModel =
    dependencies.createFunctionalProofModel({ catalog });
  return Object.freeze({ catalog, currentFunctionalProofModel });
}

export function collectToolcraftDeliveryFunctionalContext(projectDir) {
  return collectToolcraftDeliveryFunctionalContextCore({
    dependencies: defaultDependencies,
    projectDir,
  });
}
