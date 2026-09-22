import type {
  ToolcraftModelDocumentV2,
  ToolcraftModelMaterial,
  ToolcraftModelTexture,
  ToolcraftModelTextureSlot,
} from "./model-document";
import {
  metadataShape,
  readBoolean,
  readFixedNumberArray,
  readNumber,
  readNumberLiteral,
  readSafeInteger,
  readSlice,
  readString,
  readStringLiteral,
  type ModelDocumentArraySliceMetadata,
} from "./model-document-codec-metadata-reader";
import { isDenseArray, isRecord } from "./model-document-validation-helpers";

const ALPHA_MODES = ["blend", "mask", "opaque"] as const;
const COLOR_SPACES = ["linear", "srgb"] as const;
const MAG_FILTERS = ["linear", "nearest"] as const;
const MIN_FILTERS = [
  "linear",
  "linear-mipmap-linear",
  "linear-mipmap-nearest",
  "nearest",
  "nearest-mipmap-linear",
  "nearest-mipmap-nearest",
] as const;
const TEXTURE_MIME_TYPES = [
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
const WRAP_MODES = ["clamp-to-edge", "mirrored-repeat", "repeat"] as const;

export type ModelDocumentPrimitiveAppearanceMetadata = Readonly<{
  colors: Readonly<{
    components: 3 | 4;
    values: ModelDocumentArraySliceMetadata;
  }> | null;
  materialId: string | null;
  textureCoordinates: readonly Readonly<{
    set: 0 | 1;
    values: ModelDocumentArraySliceMetadata;
  }>[];
}>;

export type ModelDocumentAppearanceMetadata = Readonly<{
  materials: readonly ToolcraftModelMaterial[];
  primitiveAppearances: readonly ModelDocumentPrimitiveAppearanceMetadata[];
  textures: readonly ToolcraftModelTexture[];
}>;

function canonicalTextureSlot(
  value: ToolcraftModelTextureSlot,
): ToolcraftModelTextureSlot {
  return {
    ...(value.scale === undefined ? {} : { scale: value.scale }),
    ...(value.strength === undefined ? {} : { strength: value.strength }),
    texCoord: value.texCoord,
    textureId: value.textureId,
  };
}

function canonicalMaterial(
  material: ToolcraftModelMaterial,
): ToolcraftModelMaterial {
  return {
    alphaCutoff: material.alphaCutoff,
    alphaMode: material.alphaMode,
    baseColor: [...material.baseColor],
    ...(material.baseColorTexture === undefined
      ? {}
      : { baseColorTexture: canonicalTextureSlot(material.baseColorTexture) }),
    doubleSided: material.doubleSided,
    emissive: [...material.emissive],
    ...(material.emissiveTexture === undefined
      ? {}
      : { emissiveTexture: canonicalTextureSlot(material.emissiveTexture) }),
    id: material.id,
    metallic: material.metallic,
    ...(material.metallicRoughnessTexture === undefined
      ? {}
      : {
          metallicRoughnessTexture: canonicalTextureSlot(
            material.metallicRoughnessTexture,
          ),
        }),
    ...(material.normalTexture === undefined
      ? {}
      : { normalTexture: canonicalTextureSlot(material.normalTexture) }),
    ...(material.occlusionTexture === undefined
      ? {}
      : { occlusionTexture: canonicalTextureSlot(material.occlusionTexture) }),
    opacity: material.opacity,
    roughness: material.roughness,
    usesVertexColor: material.usesVertexColor,
  };
}

function canonicalTexture(texture: ToolcraftModelTexture): ToolcraftModelTexture {
  return {
    colorSpace: texture.colorSpace,
    contentDigest: texture.contentDigest,
    height: texture.height,
    id: texture.id,
    mimeType: texture.mimeType,
    resourceRef: texture.resourceRef,
    sampler: { ...texture.sampler },
    width: texture.width,
  };
}

export function createModelDocumentAppearanceMetadata(
  document: ToolcraftModelDocumentV2,
): ModelDocumentAppearanceMetadata {
  let colorOffset = 0;
  let textureCoordinateOffset = 0;
  return {
    materials: document.materials.map(canonicalMaterial),
    primitiveAppearances: document.primitives.map((primitive) => {
      const textureCoordinates = (primitive.textureCoordinates ?? []).map(
        (coordinates) => {
          const metadata = {
            set: coordinates.set,
            values: {
              count: coordinates.values.length,
              offset: textureCoordinateOffset,
            },
          };
          textureCoordinateOffset += coordinates.values.length;
          return metadata;
        },
      );
      const colors = primitive.colors === undefined
        ? null
        : {
            components: primitive.colors.components,
            values: {
              count: primitive.colors.values.length,
              offset: colorOffset,
            },
          };
      colorOffset += primitive.colors?.values.length ?? 0;
      return {
        colors,
        materialId: primitive.materialId ?? null,
        textureCoordinates,
      };
    }),
    textures: document.textures.map(canonicalTexture),
  };
}

function readTextureSlot(value: unknown, path: string): ToolcraftModelTextureSlot {
  if (!isRecord(value)) metadataShape(path, `${path} must be an object.`);
  return {
    ...(value.scale === undefined
      ? {}
      : { scale: readNumber(value.scale, `${path}.scale`) }),
    ...(value.strength === undefined
      ? {}
      : { strength: readNumber(value.strength, `${path}.strength`) }),
    texCoord: readNumberLiteral(value.texCoord, `${path}.texCoord`, [0, 1]),
    textureId: readString(value.textureId, `${path}.textureId`),
  };
}

function readOptionalTextureSlot(
  value: unknown,
  path: string,
): ToolcraftModelTextureSlot | undefined {
  return value === undefined ? undefined : readTextureSlot(value, path);
}

function readMaterial(value: unknown, index: number): ToolcraftModelMaterial {
  const path = `materials[${index}]`;
  if (!isRecord(value)) metadataShape(path, `${path} must be an object.`);
  const baseColor = readFixedNumberArray(value.baseColor, `${path}.baseColor`, 3);
  const emissive = readFixedNumberArray(value.emissive, `${path}.emissive`, 3);
  const baseColorTexture = readOptionalTextureSlot(
    value.baseColorTexture,
    `${path}.baseColorTexture`,
  );
  const emissiveTexture = readOptionalTextureSlot(
    value.emissiveTexture,
    `${path}.emissiveTexture`,
  );
  const metallicRoughnessTexture = readOptionalTextureSlot(
    value.metallicRoughnessTexture,
    `${path}.metallicRoughnessTexture`,
  );
  const normalTexture = readOptionalTextureSlot(
    value.normalTexture,
    `${path}.normalTexture`,
  );
  const occlusionTexture = readOptionalTextureSlot(
    value.occlusionTexture,
    `${path}.occlusionTexture`,
  );
  return {
    alphaCutoff: readNumber(value.alphaCutoff, `${path}.alphaCutoff`),
    alphaMode: readStringLiteral(value.alphaMode, `${path}.alphaMode`, ALPHA_MODES),
    baseColor: [baseColor[0]!, baseColor[1]!, baseColor[2]!],
    ...(baseColorTexture === undefined ? {} : { baseColorTexture }),
    doubleSided: readBoolean(value.doubleSided, `${path}.doubleSided`),
    emissive: [emissive[0]!, emissive[1]!, emissive[2]!],
    ...(emissiveTexture === undefined ? {} : { emissiveTexture }),
    id: readString(value.id, `${path}.id`),
    metallic: readNumber(value.metallic, `${path}.metallic`),
    ...(metallicRoughnessTexture === undefined
      ? {}
      : { metallicRoughnessTexture }),
    ...(normalTexture === undefined ? {} : { normalTexture }),
    ...(occlusionTexture === undefined ? {} : { occlusionTexture }),
    opacity: readNumber(value.opacity, `${path}.opacity`),
    roughness: readNumber(value.roughness, `${path}.roughness`),
    usesVertexColor: readBoolean(
      value.usesVertexColor,
      `${path}.usesVertexColor`,
    ),
  };
}

function readTexture(value: unknown, index: number): ToolcraftModelTexture {
  const path = `textures[${index}]`;
  if (!isRecord(value)) metadataShape(path, `${path} must be an object.`);
  if (!isRecord(value.sampler)) {
    metadataShape(`${path}.sampler`, `${path}.sampler must be an object.`);
  }
  return {
    colorSpace: readStringLiteral(
      value.colorSpace,
      `${path}.colorSpace`,
      COLOR_SPACES,
    ),
    contentDigest: readString(
      value.contentDigest,
      `${path}.contentDigest`,
    ),
    height: readSafeInteger(value.height, `${path}.height`),
    id: readString(value.id, `${path}.id`),
    mimeType: readStringLiteral(
      value.mimeType,
      `${path}.mimeType`,
      TEXTURE_MIME_TYPES,
    ),
    resourceRef: readString(value.resourceRef, `${path}.resourceRef`),
    sampler: {
      magFilter: readStringLiteral(
        value.sampler.magFilter,
        `${path}.sampler.magFilter`,
        MAG_FILTERS,
      ),
      minFilter: readStringLiteral(
        value.sampler.minFilter,
        `${path}.sampler.minFilter`,
        MIN_FILTERS,
      ),
      wrapS: readStringLiteral(
        value.sampler.wrapS,
        `${path}.sampler.wrapS`,
        WRAP_MODES,
      ),
      wrapT: readStringLiteral(
        value.sampler.wrapT,
        `${path}.sampler.wrapT`,
        WRAP_MODES,
      ),
    },
    width: readSafeInteger(value.width, `${path}.width`),
  };
}

export function readModelDocumentAppearanceMetadata(
  materialsValue: unknown,
  texturesValue: unknown,
): Pick<ModelDocumentAppearanceMetadata, "materials" | "textures"> {
  if (!isDenseArray(materialsValue)) {
    metadataShape("materials", "materials must be a dense array.");
  }
  if (!isDenseArray(texturesValue)) {
    metadataShape("textures", "textures must be a dense array.");
  }
  return {
    materials: materialsValue.map(readMaterial),
    textures: texturesValue.map(readTexture),
  };
}

export function readPrimitiveAppearanceMetadata(
  value: Record<string, unknown>,
  path: string,
): ModelDocumentPrimitiveAppearanceMetadata {
  if (!isDenseArray(value.textureCoordinates)) {
    metadataShape(
      `${path}.textureCoordinates`,
      `${path}.textureCoordinates must be a dense array.`,
    );
  }
  const colors = value.colors === null
    ? null
    : (() => {
        if (!isRecord(value.colors)) {
          metadataShape(`${path}.colors`, `${path}.colors must be an object.`);
        }
        return {
          components: readNumberLiteral(
            value.colors.components,
            `${path}.colors.components`,
            [3, 4],
          ),
          values: readSlice(value.colors.values, `${path}.colors.values`),
        };
      })();
  return {
    colors,
    materialId: value.materialId === null
      ? null
      : readString(value.materialId, `${path}.materialId`),
    textureCoordinates: value.textureCoordinates.map((entry, index) => {
      const coordinatePath = `${path}.textureCoordinates[${index}]`;
      if (!isRecord(entry)) {
        metadataShape(coordinatePath, `${coordinatePath} must be an object.`);
      }
      return {
        set: readNumberLiteral(entry.set, `${coordinatePath}.set`, [0, 1]),
        values: readSlice(entry.values, `${coordinatePath}.values`),
      };
    }),
  };
}
