import type { ToolcraftModelFormat } from "../../schema/types";

export type ToolcraftModelBounds = {
  max: readonly [number, number, number];
  min: readonly [number, number, number];
};

export type ToolcraftModelCanonicalizationOperation =
  | "deterministic-triangulation"
  | "sequential-indexing";

export type ToolcraftModelRepairOperationType =
  | "compact-unused-vertices"
  | "recalculate-bounds"
  | "regenerate-normals"
  | "remove-duplicate-triangles"
  | "remove-invalid-triangles"
  | "repair-local-winding";

export const TOOLCRAFT_MODEL_CANONICALIZATION_OPERATIONS = Object.freeze([
  "deterministic-triangulation",
  "sequential-indexing",
] as const satisfies readonly ToolcraftModelCanonicalizationOperation[]);

export const TOOLCRAFT_MODEL_REPAIR_OPERATIONS = Object.freeze([
  "compact-unused-vertices",
  "recalculate-bounds",
  "regenerate-normals",
  "remove-duplicate-triangles",
  "remove-invalid-triangles",
  "repair-local-winding",
] as const satisfies readonly ToolcraftModelRepairOperationType[]);

export const TOOLCRAFT_MODEL_SOURCE_FORMATS = Object.freeze([
  "fbx",
  "glb",
  "gltf",
  "obj",
  "ply",
  "stl",
] as const satisfies readonly ToolcraftModelFormat[]);

type ToolcraftModelCanonicalizationProvenanceBase<Version extends 1 | 2> = {
  adapterVersion: string;
  canonicalSchemaVersion: Version;
  operations: readonly ToolcraftModelCanonicalizationOperation[];
  repair?: {
    algorithmVersion: string;
    operations: readonly ToolcraftModelRepairOperationType[];
    planDigest: string;
    recipeId: string;
  };
  sourceFormat: ToolcraftModelFormat;
};

export type ToolcraftModelCanonicalizationProvenanceV1 =
  ToolcraftModelCanonicalizationProvenanceBase<1>;
export type ToolcraftModelCanonicalizationProvenanceV2 =
  ToolcraftModelCanonicalizationProvenanceBase<2>;
export type ToolcraftModelCanonicalizationProvenance =
  | ToolcraftModelCanonicalizationProvenanceV1
  | ToolcraftModelCanonicalizationProvenanceV2;

export type ToolcraftModelNode = {
  children: readonly string[];
  id: string;
  localMatrix: readonly [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
  ];
  name: string;
  primitiveIds: readonly string[];
};

type ToolcraftModelPrimitiveGeometry = {
  bounds: ToolcraftModelBounds;
  id: string;
  indices: Uint32Array;
  normals?: Float32Array;
  positions: Float32Array;
};

export type ToolcraftModelPrimitiveV1 = ToolcraftModelPrimitiveGeometry;

export type ToolcraftModelTextureColorSpace = "linear" | "srgb";
export type ToolcraftModelAlphaMode = "blend" | "mask" | "opaque";

export type ToolcraftModelTextureSampler = Readonly<{
  magFilter: "linear" | "nearest";
  minFilter:
    | "linear"
    | "linear-mipmap-linear"
    | "linear-mipmap-nearest"
    | "nearest"
    | "nearest-mipmap-linear"
    | "nearest-mipmap-nearest";
  wrapS: "clamp-to-edge" | "mirrored-repeat" | "repeat";
  wrapT: "clamp-to-edge" | "mirrored-repeat" | "repeat";
}>;

export type ToolcraftModelTexture = Readonly<{
  colorSpace: ToolcraftModelTextureColorSpace;
  contentDigest: string;
  height: number;
  id: string;
  mimeType: "image/avif" | "image/jpeg" | "image/png" | "image/webp";
  resourceRef: string;
  sampler: ToolcraftModelTextureSampler;
  width: number;
}>;

export type ToolcraftModelTextureSlot = Readonly<{
  scale?: number;
  strength?: number;
  texCoord: 0 | 1;
  textureId: string;
}>;

export type ToolcraftModelMaterial = Readonly<{
  alphaCutoff: number;
  alphaMode: ToolcraftModelAlphaMode;
  baseColor: readonly [number, number, number];
  baseColorTexture?: ToolcraftModelTextureSlot;
  doubleSided: boolean;
  emissive: readonly [number, number, number];
  emissiveTexture?: ToolcraftModelTextureSlot;
  id: string;
  metallic: number;
  metallicRoughnessTexture?: ToolcraftModelTextureSlot;
  normalTexture?: ToolcraftModelTextureSlot;
  occlusionTexture?: ToolcraftModelTextureSlot;
  opacity: number;
  roughness: number;
  usesVertexColor: boolean;
}>;

export type ToolcraftModelVertexColors = Readonly<{
  components: 3 | 4;
  values: Float32Array;
}>;

export type ToolcraftModelTextureCoordinates = Readonly<{
  set: 0 | 1;
  values: Float32Array;
}>;

export type ToolcraftModelPrimitiveV2 = ToolcraftModelPrimitiveV1 & Readonly<{
  colors?: ToolcraftModelVertexColors;
  materialId?: string;
  textureCoordinates?: readonly ToolcraftModelTextureCoordinates[];
}>;

export type ToolcraftModelPrimitive = ToolcraftModelPrimitiveV1;

export type ToolcraftModelDocumentV1 = {
  bounds: ToolcraftModelBounds;
  nodes: readonly ToolcraftModelNode[];
  primitives: readonly ToolcraftModelPrimitive[];
  provenance: ToolcraftModelCanonicalizationProvenanceV1;
  rootNodeIds: readonly string[];
  version: 1;
};

export type ToolcraftModelDocumentV2 = Readonly<{
  bounds: ToolcraftModelBounds;
  materials: readonly ToolcraftModelMaterial[];
  nodes: readonly ToolcraftModelNode[];
  primitives: readonly ToolcraftModelPrimitiveV2[];
  provenance: ToolcraftModelCanonicalizationProvenanceV2;
  rootNodeIds: readonly string[];
  textures: readonly ToolcraftModelTexture[];
  version: 2;
}>;

export type ToolcraftModelDocument =
  | ToolcraftModelDocumentV1
  | ToolcraftModelDocumentV2;

export const TOOLCRAFT_MODEL_FALLBACK_APPEARANCE = Object.freeze({
  alpha: 1,
  baseColorLinear: Object.freeze([0.8, 0.8, 0.8] as const),
  emissiveLinear: Object.freeze([0, 0, 0] as const),
  metallic: 0,
  roughness: 0.5,
});
