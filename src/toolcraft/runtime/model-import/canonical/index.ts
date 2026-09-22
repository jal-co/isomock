export type {
  ToolcraftModelBounds,
  ToolcraftModelAlphaMode,
  ToolcraftModelCanonicalizationOperation,
  ToolcraftModelCanonicalizationProvenance,
  ToolcraftModelCanonicalizationProvenanceV1,
  ToolcraftModelCanonicalizationProvenanceV2,
  ToolcraftModelDocument,
  ToolcraftModelDocumentV1,
  ToolcraftModelDocumentV2,
  ToolcraftModelMaterial,
  ToolcraftModelNode,
  ToolcraftModelPrimitive,
  ToolcraftModelPrimitiveV1,
  ToolcraftModelPrimitiveV2,
  ToolcraftModelRepairOperationType,
  ToolcraftModelTexture,
  ToolcraftModelTextureColorSpace,
  ToolcraftModelTextureCoordinates,
  ToolcraftModelTextureSampler,
  ToolcraftModelTextureSlot,
  ToolcraftModelVertexColors,
} from "./model-document";
export { TOOLCRAFT_MODEL_FALLBACK_APPEARANCE } from "./model-document";
export {
  decodeToolcraftModelDocument,
  encodeToolcraftModelDocument,
  ToolcraftModelDocumentCodecError,
  type ToolcraftModelDocumentCodecFailureCode,
} from "./model-document-codec";
export { digestToolcraftModelDocument } from "./model-document-digest";
export {
  assertValidToolcraftModelDocument,
  ToolcraftModelDocumentValidationError,
  type ToolcraftModelDocumentValidationFailure,
  type ToolcraftModelDocumentValidationFailureCode,
  type ToolcraftModelDocumentValidationResult,
  validateToolcraftModelDocument,
} from "./model-document-validation";
