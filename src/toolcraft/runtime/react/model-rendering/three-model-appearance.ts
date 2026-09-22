import {
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  FrontSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearMipmapNearestFilter,
  LinearSRGBColorSpace,
  MeshStandardMaterial,
  MirroredRepeatWrapping,
  NearestFilter,
  NearestMipmapLinearFilter,
  NearestMipmapNearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  Vector2,
  type MagnificationTextureFilter,
  type MinificationTextureFilter,
  type Wrapping,
} from "three";

import {
  TOOLCRAFT_MODEL_FALLBACK_APPEARANCE,
  type ToolcraftModelDocument,
  type ToolcraftModelMaterial,
  type ToolcraftModelPrimitiveV1,
  type ToolcraftModelPrimitiveV2,
  type ToolcraftModelTexture,
  type ToolcraftModelTextureSlot,
} from "../../model-import/canonical/model-document";

export type ToolcraftThreeModelAppearance = Readonly<{
  dispose(): void;
  materialForPrimitive(
    primitive: ToolcraftModelPrimitiveV1 | ToolcraftModelPrimitiveV2,
  ): MeshStandardMaterial;
  materials: readonly MeshStandardMaterial[];
  textures: readonly Texture[];
}>;

const MAG_FILTERS: Readonly<Record<
  ToolcraftModelTexture["sampler"]["magFilter"],
  MagnificationTextureFilter
>> = Object.freeze({
  linear: LinearFilter,
  nearest: NearestFilter,
});

const MIN_FILTERS: Readonly<Record<
  ToolcraftModelTexture["sampler"]["minFilter"],
  MinificationTextureFilter
>> = Object.freeze({
  linear: LinearFilter,
  "linear-mipmap-linear": LinearMipmapLinearFilter,
  "linear-mipmap-nearest": LinearMipmapNearestFilter,
  nearest: NearestFilter,
  "nearest-mipmap-linear": NearestMipmapLinearFilter,
  "nearest-mipmap-nearest": NearestMipmapNearestFilter,
});

const WRAPPINGS: Readonly<Record<
  ToolcraftModelTexture["sampler"]["wrapS"],
  Wrapping
>> = Object.freeze({
  "clamp-to-edge": ClampToEdgeWrapping,
  "mirrored-repeat": MirroredRepeatWrapping,
  repeat: RepeatWrapping,
});

function setLinearColor(
  color: Color,
  value: readonly [number, number, number],
): void {
  color.setRGB(value[0], value[1], value[2], LinearSRGBColorSpace);
}

function createFallbackMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    metalness: TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.metallic,
    opacity: TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.alpha,
    roughness: TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.roughness,
  });
  material.name = "Toolcraft Blender-like fallback";
  setLinearColor(
    material.color,
    TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.baseColorLinear,
  );
  setLinearColor(
    material.emissive,
    TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.emissiveLinear,
  );
  return material;
}

function primitiveMaterialId(
  primitive: ToolcraftModelPrimitiveV1 | ToolcraftModelPrimitiveV2,
): string | undefined {
  return "materialId" in primitive ? primitive.materialId : undefined;
}

export function createToolcraftThreeModelAppearance(
  document: ToolcraftModelDocument,
  bitmapsByTextureId: ReadonlyMap<string, ImageBitmap>,
): ToolcraftThreeModelAppearance {
  const textureRecords = new Map(
    document.version === 1
      ? []
      : document.textures.map((texture) => [texture.id, texture] as const),
  );
  const textures: Texture[] = [];
  const textureByBinding = new Map<string, Texture>();
  const textureForSlot = (
    slot: ToolcraftModelTextureSlot | undefined,
  ): Texture | null => {
    if (!slot) return null;
    const key = `${slot.textureId}:${slot.texCoord}`;
    const existing = textureByBinding.get(key);
    if (existing) return existing;
    const record = textureRecords.get(slot.textureId);
    const bitmap = bitmapsByTextureId.get(slot.textureId);
    if (!record || !bitmap) return null;
    const texture = new Texture(bitmap);
    texture.name = record.id;
    texture.channel = slot.texCoord;
    texture.colorSpace = record.colorSpace === "srgb"
      ? SRGBColorSpace
      : LinearSRGBColorSpace;
    texture.flipY = document.provenance.sourceFormat === "fbx" ||
      document.provenance.sourceFormat === "obj";
    texture.magFilter = MAG_FILTERS[record.sampler.magFilter];
    texture.minFilter = MIN_FILTERS[record.sampler.minFilter];
    texture.wrapS = WRAPPINGS[record.sampler.wrapS];
    texture.wrapT = WRAPPINGS[record.sampler.wrapT];
    texture.generateMipmaps = record.sampler.minFilter.includes("mipmap");
    texture.needsUpdate = true;
    textureByBinding.set(key, texture);
    textures.push(texture);
    return texture;
  };

  const materialRecords = document.version === 1 ? [] : document.materials;
  const materials: MeshStandardMaterial[] = [];
  const materialById = new Map<string, MeshStandardMaterial>();
  const createAuthoredMaterial = (
    record: ToolcraftModelMaterial,
  ): MeshStandardMaterial => {
    const material = new MeshStandardMaterial({
      alphaTest: record.alphaMode === "mask" ? record.alphaCutoff : 0,
      depthWrite: record.alphaMode !== "blend",
      metalness: record.metallic,
      opacity: record.opacity,
      roughness: record.roughness,
      side: record.doubleSided ? DoubleSide : FrontSide,
      transparent: record.alphaMode === "blend",
      vertexColors: record.usesVertexColor,
    });
    material.name = record.id;
    setLinearColor(material.color, record.baseColor);
    setLinearColor(material.emissive, record.emissive);
    material.map = textureForSlot(record.baseColorTexture);
    material.emissiveMap = textureForSlot(record.emissiveTexture);
    material.normalMap = textureForSlot(record.normalTexture);
    material.normalScale = new Vector2(
      record.normalTexture?.scale ?? 1,
      record.normalTexture?.scale ?? 1,
    );
    material.aoMap = textureForSlot(record.occlusionTexture);
    material.aoMapIntensity = record.occlusionTexture?.strength ?? 1;
    const metallicRoughness = textureForSlot(
      record.metallicRoughnessTexture,
    );
    material.metalnessMap = metallicRoughness;
    material.roughnessMap = metallicRoughness;
    return material;
  };
  for (const record of materialRecords) {
    const material = createAuthoredMaterial(record);
    materialById.set(record.id, material);
    materials.push(material);
  }
  const fallback = createFallbackMaterial();
  materials.push(fallback);
  let disposed = false;

  return Object.freeze({
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const texture of textures) texture.dispose();
      for (const material of materials) material.dispose();
    },
    materialForPrimitive: (primitive) =>
      materialById.get(primitiveMaterialId(primitive) ?? "") ?? fallback,
    materials: Object.freeze(materials),
    textures: Object.freeze(textures),
  });
}
