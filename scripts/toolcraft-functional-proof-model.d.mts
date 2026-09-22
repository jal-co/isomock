import type {
  ToolcraftDeliveryCatalog,
} from "./toolcraft-delivery-catalog-validation.mjs";

export type ToolcraftFunctionalProofAcceptance = Readonly<{
  acceptanceId: string;
  contractHash: string;
  domainId: string;
  file: string;
  testName: string;
}>;

export type ToolcraftFunctionalProofModel = Readonly<{
  acceptance: readonly ToolcraftFunctionalProofAcceptance[];
  version: 2;
}>;

export const TOOLCRAFT_FUNCTIONAL_PROOF_MODEL_VERSION: 2;

export {
  createToolcraftAcceptanceContractHash,
  deriveToolcraftAcceptanceDomainId,
} from "./toolcraft-functional-proof-primitives.mjs";
export function createToolcraftFunctionalProofModel(input: {
  catalog: ToolcraftDeliveryCatalog;
}): ToolcraftFunctionalProofModel;
export function createToolcraftFunctionalProofModelHash(
  model: ToolcraftFunctionalProofModel,
): string;
export function getToolcraftFunctionalProofModelError(
  value: unknown,
): string | undefined;
