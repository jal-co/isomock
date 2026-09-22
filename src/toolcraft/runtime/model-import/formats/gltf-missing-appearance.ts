import type { GLTF } from "@gltf-transform/core";

import { gltfDecodeCheckpoint } from "./gltf-decode-safety";

type JsonRecord = Record<string, unknown>;

export type GltfMissingAppearanceReason =
  | "missing-local-file"
  | "remote-uri"
  | "unsupported-image-source";

export type GltfMissingImage = Readonly<{
  imageIndex: number;
  reason: GltfMissingAppearanceReason;
  uri: string;
}>;

export type GltfMissingTexture = Readonly<{
  reason: GltfMissingAppearanceReason;
  textureIndex: number;
  uri: string;
}>;

export type GltfMissingAppearanceBinding = Readonly<{
  materialIndex: number;
  reason: GltfMissingAppearanceReason;
  slotName:
    | "baseColorTexture"
    | "emissiveTexture"
    | "metallicRoughnessTexture"
    | "normalTexture"
    | "occlusionTexture";
  textureIndex: number;
  uri: string;
}>;

type TextureBinding = Readonly<{
  owner: JsonRecord;
  slotName: GltfMissingAppearanceBinding["slotName"];
}>;

function materialTextureBindings(material: JsonRecord): TextureBinding[] {
  const bindings: TextureBinding[] = [
    { owner: material, slotName: "emissiveTexture" },
    { owner: material, slotName: "normalTexture" },
    { owner: material, slotName: "occlusionTexture" },
  ];
  const pbr = material.pbrMetallicRoughness;
  if (typeof pbr === "object" && pbr !== null && !Array.isArray(pbr)) {
    bindings.push(
      { owner: pbr as JsonRecord, slotName: "baseColorTexture" },
      { owner: pbr as JsonRecord, slotName: "metallicRoughnessTexture" },
    );
  }
  return bindings;
}

function textureInfoIndex(binding: TextureBinding): number | undefined {
  const value = binding.owner[binding.slotName];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const index = (value as JsonRecord).index;
  return Number.isSafeInteger(index) && (index as number) >= 0
    ? index as number
    : undefined;
}

export function removeMissingGltfAppearance(
  json: GLTF.IGLTF,
  missingImages: readonly GltfMissingImage[],
  missingTextures: readonly GltfMissingTexture[],
  signal: AbortSignal,
): readonly GltfMissingAppearanceBinding[] {
  if (missingImages.length === 0 && missingTextures.length === 0) return [];
  const images = Array.isArray(json.images) ? json.images : [];
  const textures = Array.isArray(json.textures) ? json.textures : [];
  const missingImageByIndex = new Map(
    missingImages.map((missing) => [missing.imageIndex, missing]),
  );
  const missingTextureByIndex = new Map(
    missingTextures.map((missing) => [missing.textureIndex, missing]),
  );
  textures.forEach((textureValue, textureIndex) => {
    gltfDecodeCheckpoint(signal, textureIndex);
    if (typeof textureValue !== "object" || textureValue === null) return;
    const source = (textureValue as unknown as JsonRecord).source;
    if (!Number.isSafeInteger(source)) return;
    const missing = missingImageByIndex.get(source as number);
    if (missing) {
      missingTextureByIndex.set(textureIndex, {
        reason: missing.reason,
        textureIndex,
        uri: missing.uri,
      });
    }
  });

  const bindings: GltfMissingAppearanceBinding[] = [];
  const materials = Array.isArray(json.materials) ? json.materials : [];
  materials.forEach((materialValue, materialIndex) => {
    gltfDecodeCheckpoint(signal, textures.length + materialIndex);
    if (typeof materialValue !== "object" || materialValue === null) return;
    for (const binding of materialTextureBindings(
      materialValue as unknown as JsonRecord,
    )) {
      const textureIndex = textureInfoIndex(binding);
      const missing = textureIndex === undefined
        ? undefined
        : missingTextureByIndex.get(textureIndex);
      if (!missing) continue;
      bindings.push({
        materialIndex,
        reason: missing.reason,
        slotName: binding.slotName,
        textureIndex: missing.textureIndex,
        uri: missing.uri,
      });
      delete binding.owner[binding.slotName];
    }
  });

  const textureRemap = new Map<number, number>();
  const retainedTextures = textures.filter((_texture, index) => {
    if (missingTextureByIndex.has(index)) return false;
    textureRemap.set(index, textureRemap.size);
    return true;
  });
  for (const materialValue of materials) {
    if (typeof materialValue !== "object" || materialValue === null) continue;
    for (const binding of materialTextureBindings(
      materialValue as unknown as JsonRecord,
    )) {
      const oldIndex = textureInfoIndex(binding);
      if (oldIndex === undefined) continue;
      const newIndex = textureRemap.get(oldIndex);
      const value = binding.owner[binding.slotName] as JsonRecord;
      if (newIndex !== undefined) value.index = newIndex;
    }
  }

  const imageRemap = new Map<number, number>();
  const retainedImages = images.filter((_image, index) => {
    if (missingImageByIndex.has(index)) return false;
    imageRemap.set(index, imageRemap.size);
    return true;
  });
  for (const textureValue of retainedTextures) {
    if (typeof textureValue !== "object" || textureValue === null) continue;
    const texture = textureValue as unknown as JsonRecord;
    if (!Number.isSafeInteger(texture.source)) continue;
    const newSource = imageRemap.get(texture.source as number);
    if (newSource !== undefined) texture.source = newSource;
  }
  json.images = retainedImages;
  json.textures = retainedTextures;
  return Object.freeze(bindings);
}
