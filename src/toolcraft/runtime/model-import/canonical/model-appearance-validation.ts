import type {
  ToolcraftModelMaterial,
  ToolcraftModelPrimitiveV2,
  ToolcraftModelTexture,
} from "./model-document";
import {
  isToolcraftModelAppearanceMimeType,
  parseToolcraftModelAppearanceResourceRef,
} from "./model-appearance-resource";
import type { ToolcraftCanonicalModelLimits } from "./model-document-limits";
import {
  isDenseArray,
  isNonemptyString,
  isRecord,
} from "./model-document-validation-helpers";
import {
  modelDocumentFailure,
  VALID_TOOLCRAFT_MODEL_DOCUMENT,
  type ToolcraftModelDocumentValidationResult,
} from "./model-document-validation-result";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const COLOR_SPACES = new Set(["linear", "srgb"]);
const MAG_FILTERS = new Set(["linear", "nearest"]);
const MIN_FILTERS = new Set([
  "linear",
  "linear-mipmap-linear",
  "linear-mipmap-nearest",
  "nearest",
  "nearest-mipmap-linear",
  "nearest-mipmap-nearest",
]);
const WRAPS = new Set(["clamp-to-edge", "mirrored-repeat", "repeat"]);
const ALPHA_MODES = new Set(["blend", "mask", "opaque"]);
const TEXTURE_SLOT_NAMES = [
  "baseColorTexture",
  "emissiveTexture",
  "metallicRoughnessTexture",
  "normalTexture",
  "occlusionTexture",
] as const;

function invalidFactor(value: unknown, bounded = true): boolean {
  return typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
    (bounded && value > 1);
}

function validateColor(
  value: unknown,
  path: string,
): ToolcraftModelDocumentValidationResult {
  if (!isDenseArray(value) || value.length !== 3) {
    return modelDocumentFailure(
      "invalid-material-factor",
      path,
      `${path} must contain three linear color components.`,
    );
  }
  for (let index = 0; index < value.length; index += 1) {
    if (invalidFactor(value[index])) {
      return modelDocumentFailure(
        "invalid-material-factor",
        `${path}[${index}]`,
        `${path} components must be finite values from 0 through 1.`,
      );
    }
  }
  return VALID_TOOLCRAFT_MODEL_DOCUMENT;
}

function validateSampler(
  value: unknown,
  path: string,
): ToolcraftModelDocumentValidationResult {
  if (
    !isRecord(value) ||
    typeof value.magFilter !== "string" ||
    !MAG_FILTERS.has(value.magFilter) ||
    typeof value.minFilter !== "string" ||
    !MIN_FILTERS.has(value.minFilter) ||
    typeof value.wrapS !== "string" ||
    !WRAPS.has(value.wrapS) ||
    typeof value.wrapT !== "string" ||
    !WRAPS.has(value.wrapT)
  ) {
    return modelDocumentFailure(
      "invalid-texture-sampler",
      path,
      `${path} contains an unsupported sampler enum.`,
    );
  }
  return VALID_TOOLCRAFT_MODEL_DOCUMENT;
}

function validateTexture(
  value: unknown,
  index: number,
  limits: ToolcraftCanonicalModelLimits,
): ToolcraftModelDocumentValidationResult {
  const path = `textures[${index}]`;
  if (!isRecord(value) || !isNonemptyString(value.id)) {
    return modelDocumentFailure(
      "invalid-texture",
      path,
      `${path} must be a texture record with a nonempty id.`,
    );
  }
  if (!isToolcraftModelAppearanceMimeType(value.mimeType)) {
    return modelDocumentFailure(
      "unsupported-texture-mime",
      `${path}.mimeType`,
      `${path}.mimeType is not a supported canonical image type.`,
    );
  }
  if (
    typeof value.contentDigest !== "string" ||
    !DIGEST.test(value.contentDigest) ||
    typeof value.resourceRef !== "string" ||
    parseToolcraftModelAppearanceResourceRef(value.resourceRef) !==
      value.contentDigest
  ) {
    return modelDocumentFailure(
      "invalid-texture-resource-ref",
      `${path}.resourceRef`,
      `${path} digest and resource ref must identify the same appearance bytes.`,
    );
  }
  if (
    typeof value.colorSpace !== "string" ||
    !COLOR_SPACES.has(value.colorSpace)
  ) {
    return modelDocumentFailure(
      "invalid-texture",
      `${path}.colorSpace`,
      `${path}.colorSpace is unsupported.`,
    );
  }
  if (
    !Number.isSafeInteger(value.width) ||
    !Number.isSafeInteger(value.height) ||
    (value.width as number) <= 0 ||
    (value.height as number) <= 0
  ) {
    return modelDocumentFailure(
      "invalid-texture",
      `${path}.width`,
      `${path} dimensions must be positive safe integers.`,
    );
  }
  if (
    (value.width as number) > limits.maxTextureDimension ||
    (value.height as number) > limits.maxTextureDimension
  ) {
    return modelDocumentFailure(
      "max-texture-dimension-exceeded",
      path,
      `${path} exceeds maxTextureDimension ${limits.maxTextureDimension}.`,
    );
  }
  const pixels = (value.width as number) * (value.height as number);
  if (!Number.isSafeInteger(pixels) || pixels > limits.maxTexturePixels) {
    return modelDocumentFailure(
      "max-texture-pixels-exceeded",
      path,
      `${path} exceeds maxTexturePixels ${limits.maxTexturePixels}.`,
    );
  }
  return validateSampler(value.sampler, `${path}.sampler`);
}

function validateTextureSlot(
  value: unknown,
  path: string,
  textureIds: ReadonlySet<string>,
): ToolcraftModelDocumentValidationResult {
  if (
    !isRecord(value) ||
    (value.texCoord !== 0 && value.texCoord !== 1) ||
    !isNonemptyString(value.textureId)
  ) {
    return modelDocumentFailure(
      "invalid-material",
      path,
      `${path} must identify texture coordinates and a texture id.`,
    );
  }
  if (!textureIds.has(value.textureId)) {
    return modelDocumentFailure(
      "missing-texture-reference",
      `${path}.textureId`,
      `${path}.textureId does not reference a canonical texture.`,
    );
  }
  if (value.scale !== undefined && invalidFactor(value.scale, false)) {
    return modelDocumentFailure(
      "invalid-material-factor",
      `${path}.scale`,
      `${path}.scale must be finite and non-negative.`,
    );
  }
  if (value.strength !== undefined && invalidFactor(value.strength)) {
    return modelDocumentFailure(
      "invalid-material-factor",
      `${path}.strength`,
      `${path}.strength must be from 0 through 1.`,
    );
  }
  return VALID_TOOLCRAFT_MODEL_DOCUMENT;
}

function validateMaterial(
  value: unknown,
  index: number,
  textureIds: ReadonlySet<string>,
): ToolcraftModelDocumentValidationResult {
  const path = `materials[${index}]`;
  if (!isRecord(value) || !isNonemptyString(value.id)) {
    return modelDocumentFailure(
      "invalid-material",
      path,
      `${path} must be a material record with a nonempty id.`,
    );
  }
  if (
    typeof value.alphaMode !== "string" ||
    !ALPHA_MODES.has(value.alphaMode) ||
    typeof value.doubleSided !== "boolean" ||
    typeof value.usesVertexColor !== "boolean"
  ) {
    return modelDocumentFailure(
      "invalid-material",
      path,
      `${path} contains invalid material modes.`,
    );
  }
  for (const name of [
    "alphaCutoff",
    "metallic",
    "opacity",
    "roughness",
  ] as const) {
    if (invalidFactor(value[name])) {
      return modelDocumentFailure(
        "invalid-material-factor",
        `${path}.${name}`,
        `${path}.${name} must be finite from 0 through 1.`,
      );
    }
  }
  for (const [name, color] of [
    ["baseColor", value.baseColor],
    ["emissive", value.emissive],
  ] as const) {
    const result = validateColor(color, `${path}.${name}`);
    if (!result.ok) return result;
  }
  for (const name of TEXTURE_SLOT_NAMES) {
    if (value[name] === undefined) continue;
    const result = validateTextureSlot(
      value[name],
      `${path}.${name}`,
      textureIds,
    );
    if (!result.ok) return result;
  }
  return VALID_TOOLCRAFT_MODEL_DOCUMENT;
}

function validatePrimitiveAppearance(
  primitive: ToolcraftModelPrimitiveV2,
  index: number,
  materials: ReadonlyMap<string, ToolcraftModelMaterial>,
): ToolcraftModelDocumentValidationResult {
  const path = `primitives[${index}]`;
  const vertices = primitive.positions.length / 3;
  const sets = new Set<number>();
  if (primitive.textureCoordinates !== undefined) {
    if (!isDenseArray(primitive.textureCoordinates) ||
        primitive.textureCoordinates.length > 2) {
      return modelDocumentFailure(
        "invalid-texture-coordinates",
        `${path}.textureCoordinates`,
        `${path} supports only UV0 and UV1.`,
      );
    }
    for (let setIndex = 0; setIndex < primitive.textureCoordinates.length;
      setIndex += 1) {
      const coordinates = primitive.textureCoordinates[setIndex];
      const coordinatePath = `${path}.textureCoordinates[${setIndex}]`;
      if (!isRecord(coordinates) ||
          (coordinates.set !== 0 && coordinates.set !== 1) ||
          !(coordinates.values instanceof Float32Array)) {
        return modelDocumentFailure(
          "invalid-texture-coordinates",
          coordinatePath,
          `${coordinatePath} must contain UV0 or UV1 Float32 values.`,
        );
      }
      if (sets.has(coordinates.set)) {
        return modelDocumentFailure(
          "duplicate-texture-coordinate-set",
          `${coordinatePath}.set`,
          `${coordinatePath}.set is duplicated.`,
        );
      }
      if (coordinates.values.length !== vertices * 2) {
        return modelDocumentFailure(
          "texture-coordinate-count-mismatch",
          `${coordinatePath}.values`,
          `${coordinatePath}.values must contain one UV pair per vertex.`,
        );
      }
      for (const component of coordinates.values) {
        if (!Number.isFinite(component)) {
          return modelDocumentFailure(
            "non-finite-appearance-value",
            `${coordinatePath}.values`,
            `${coordinatePath}.values must be finite.`,
          );
        }
      }
      sets.add(coordinates.set);
    }
  }
  if (primitive.colors !== undefined) {
    if (!isRecord(primitive.colors) ||
        (primitive.colors.components !== 3 && primitive.colors.components !== 4) ||
        !(primitive.colors.values instanceof Float32Array)) {
      return modelDocumentFailure(
        "invalid-vertex-colors",
        `${path}.colors`,
        `${path}.colors must contain RGB or RGBA Float32 values.`,
      );
    }
    if (primitive.colors.values.length !== vertices * primitive.colors.components) {
      return modelDocumentFailure(
        "color-count-mismatch",
        `${path}.colors.values`,
        `${path}.colors.values must contain one color per vertex.`,
      );
    }
    for (const component of primitive.colors.values) {
      if (invalidFactor(component)) {
        return modelDocumentFailure(
          "non-finite-appearance-value",
          `${path}.colors.values`,
          `${path}.colors.values must be finite from 0 through 1.`,
        );
      }
    }
  }
  if (primitive.materialId === undefined) return VALID_TOOLCRAFT_MODEL_DOCUMENT;
  const material = materials.get(primitive.materialId);
  if (!material) {
    return modelDocumentFailure(
      "missing-material-reference",
      `${path}.materialId`,
      `${path}.materialId does not reference a canonical material.`,
    );
  }
  if (material.usesVertexColor && primitive.colors === undefined) {
    return modelDocumentFailure(
      "invalid-vertex-colors",
      `${path}.colors`,
      `${path} material requires vertex colors.`,
    );
  }
  for (const name of TEXTURE_SLOT_NAMES) {
    const slot = material[name];
    if (slot && !sets.has(slot.texCoord)) {
      return modelDocumentFailure(
        "missing-texture-reference",
        `${path}.textureCoordinates`,
        `${path} lacks UV${slot.texCoord} required by its material.`,
      );
    }
  }
  return VALID_TOOLCRAFT_MODEL_DOCUMENT;
}

export function validateToolcraftModelAppearance(
  materialsValue: unknown,
  texturesValue: unknown,
  primitives: readonly ToolcraftModelPrimitiveV2[],
  limits: ToolcraftCanonicalModelLimits,
): ToolcraftModelDocumentValidationResult {
  if (!isDenseArray(texturesValue)) {
    return modelDocumentFailure(
      "invalid-textures",
      "textures",
      "textures must be a dense array.",
    );
  }
  if (texturesValue.length > limits.maxTextureCount) {
    return modelDocumentFailure(
      "max-textures-exceeded",
      "textures",
      `textures exceeds maxTextureCount ${limits.maxTextureCount}.`,
    );
  }
  const textureIds = new Set<string>();
  let aggregatePixels = 0;
  for (let index = 0; index < texturesValue.length; index += 1) {
    const result = validateTexture(texturesValue[index], index, limits);
    if (!result.ok) return result;
    const texture = texturesValue[index] as ToolcraftModelTexture;
    if (textureIds.has(texture.id)) {
      return modelDocumentFailure(
        "duplicate-id",
        `textures[${index}].id`,
        `Canonical texture id "${texture.id}" is duplicated.`,
      );
    }
    const pixels = texture.width * texture.height;
    if (aggregatePixels > limits.maxTexturePixels - pixels) {
      return modelDocumentFailure(
        "max-texture-pixels-exceeded",
        "textures",
        `textures exceed aggregate maxTexturePixels ${limits.maxTexturePixels}.`,
      );
    }
    aggregatePixels += pixels;
    textureIds.add(texture.id);
  }
  if (!isDenseArray(materialsValue)) {
    return modelDocumentFailure(
      "invalid-materials",
      "materials",
      "materials must be a dense array.",
    );
  }
  if (materialsValue.length > limits.maxPrimitives) {
    return modelDocumentFailure(
      "max-primitives-exceeded",
      "materials",
      `materials exceeds maxPrimitives ${limits.maxPrimitives}.`,
    );
  }
  const materials = new Map<string, ToolcraftModelMaterial>();
  for (let index = 0; index < materialsValue.length; index += 1) {
    const result = validateMaterial(materialsValue[index], index, textureIds);
    if (!result.ok) return result;
    const material = materialsValue[index] as ToolcraftModelMaterial;
    if (materials.has(material.id)) {
      return modelDocumentFailure(
        "duplicate-id",
        `materials[${index}].id`,
        `Canonical material id "${material.id}" is duplicated.`,
      );
    }
    materials.set(material.id, material);
  }
  for (let index = 0; index < primitives.length; index += 1) {
    const result = validatePrimitiveAppearance(primitives[index]!, index, materials);
    if (!result.ok) return result;
  }
  return VALID_TOOLCRAFT_MODEL_DOCUMENT;
}
