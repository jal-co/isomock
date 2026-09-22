import type {
  Document,
  Material,
  Primitive,
  Texture,
  TextureInfo,
} from "@gltf-transform/core";

import type { ToolcraftModelImportLimits } from "../../schema/types";
import {
  compareToolcraftModelAppearanceResourceRefs,
} from "../canonical/model-appearance-resource";
import {
  TOOLCRAFT_MODEL_FALLBACK_APPEARANCE,
  type ToolcraftModelMaterial,
  type ToolcraftModelPrimitiveV2,
  type ToolcraftModelTexture,
  type ToolcraftModelTextureColorSpace,
  type ToolcraftModelTextureSampler,
  type ToolcraftModelTextureSlot,
} from "../canonical/model-document";
import type {
  ToolcraftModelAppearanceResource,
  ToolcraftModelDiagnostic,
} from "../model-import-types";
import {
  checkedGltfTotal,
  gltfDecodeFailure,
} from "./gltf-decode-safety";
import {
  copyGltfColorAccessor,
  copyGltfVec2Accessor,
} from "./gltf-canonical-geometry";
import type { GltfMissingAppearanceBinding } from "./gltf-missing-appearance";
import {
  createGltfCanonicalImageResource,
  type GltfCanonicalImageResource,
} from "./gltf-texture-resource";

type PrimitiveAppearance = Readonly<{
  attributeBytes: number;
  colors?: ToolcraftModelPrimitiveV2["colors"];
  materialId?: string;
  textureCoordinates?: ToolcraftModelPrimitiveV2["textureCoordinates"];
}>;

export type GltfCanonicalAppearance = Readonly<{
  appearanceResources: readonly ToolcraftModelAppearanceResource[];
  diagnostics: readonly ToolcraftModelDiagnostic[];
  materials: readonly ToolcraftModelMaterial[];
  resourceBytes: number;
  textures: readonly ToolcraftModelTexture[];
}>;

export type GltfCanonicalAppearanceBuilder = Readonly<{
  finish: () => GltfCanonicalAppearance;
  primitiveAppearance: (
    primitive: Primitive,
    vertexCount: number,
  ) => PrimitiveAppearance;
}>;

type SlotName =
  | "baseColorTexture"
  | "emissiveTexture"
  | "metallicRoughnessTexture"
  | "normalTexture"
  | "occlusionTexture";

function finiteFactor(value: number, label: string, bounded = true): number {
  if (!Number.isFinite(value) || value < 0 || (bounded && value > 1)) {
    return gltfDecodeFailure(
      "format",
      "invalid-gltf-material-factor",
      `${label} must be finite${bounded ? " from 0 through 1" : " and non-negative"}.`,
    );
  }
  return value;
}

function color3(
  value: readonly number[],
  label: string,
): readonly [number, number, number] {
  return [
    finiteFactor(value[0]!, `${label}[0]`),
    finiteFactor(value[1]!, `${label}[1]`),
    finiteFactor(value[2]!, `${label}[2]`),
  ];
}

function samplerFor(info: TextureInfo): ToolcraftModelTextureSampler {
  const magFilter = info.getMagFilter();
  const minFilter = info.getMinFilter();
  const wrap = (value: number, label: string) => {
    if (value === 33071) return "clamp-to-edge" as const;
    if (value === 33648) return "mirrored-repeat" as const;
    if (value === 10497) return "repeat" as const;
    return gltfDecodeFailure(
      "format",
      "invalid-gltf-sampler",
      `${label} contains unsupported glTF sampler value ${value}.`,
    );
  };
  const min = (() => {
    if (minFilter === null || minFilter === 9987) return "linear-mipmap-linear" as const;
    if (minFilter === 9728) return "nearest" as const;
    if (minFilter === 9729) return "linear" as const;
    if (minFilter === 9984) return "nearest-mipmap-nearest" as const;
    if (minFilter === 9985) return "linear-mipmap-nearest" as const;
    if (minFilter === 9986) return "nearest-mipmap-linear" as const;
    return gltfDecodeFailure(
      "format",
      "invalid-gltf-sampler",
      `minFilter contains unsupported glTF sampler value ${minFilter}.`,
    );
  })();
  if (magFilter !== null && magFilter !== 9728 && magFilter !== 9729) {
    return gltfDecodeFailure(
      "format",
      "invalid-gltf-sampler",
      `magFilter contains unsupported glTF sampler value ${magFilter}.`,
    );
  }
  return {
    magFilter: magFilter === 9728 ? "nearest" : "linear",
    minFilter: min,
    wrapS: wrap(info.getWrapS(), "wrapS"),
    wrapT: wrap(info.getWrapT(), "wrapT"),
  };
}

function samplerKey(sampler: ToolcraftModelTextureSampler): string {
  return [
    sampler.magFilter,
    sampler.minFilter,
    sampler.wrapS,
    sampler.wrapT,
  ].join("|");
}

export function createGltfCanonicalAppearanceBuilder(
  gltf: Document,
  missingBindings: readonly GltfMissingAppearanceBinding[],
  limits: ToolcraftModelImportLimits,
  signal: AbortSignal,
): GltfCanonicalAppearanceBuilder {
  const sourceTextures = gltf.getRoot().listTextures();
  const sourceTextureIndex = new Map(
    sourceTextures.map((texture, index) => [texture, index]),
  );
  const sourceMaterials = gltf.getRoot().listMaterials();
  const sourceMaterialIndex = new Map(
    sourceMaterials.map((material, index) => [material, index]),
  );
  const materials: ToolcraftModelMaterial[] = [];
  const materialIds = new Map<string, string>();
  const textures: ToolcraftModelTexture[] = [];
  const textureIds = new Map<string, string>();
  const imageResources = new Map<Texture, GltfCanonicalImageResource | null>();
  const resources = new Map<string, ToolcraftModelAppearanceResource>();
  const diagnostics: ToolcraftModelDiagnostic[] = missingBindings.map(
    (missing) => ({
      affectedCount: 1,
      code: "missing-appearance-resource",
      explanation:
        `material:${missing.materialIndex} ${missing.slotName} could not retain ${missing.uri} (${missing.reason}); other material channels remain available.`,
      severity: "warning",
    }),
  );
  const diagnosticKeys = new Set(
    missingBindings.map((missing) =>
      `material:${missing.materialIndex}|${missing.slotName}|${missing.textureIndex}|resource`
    ),
  );
  let resourceBytes = 0;
  let texturePixels = 0;

  const warn = (
    code: string,
    explanation: string,
    key: string,
  ): void => {
    if (diagnosticKeys.has(key)) return;
    diagnosticKeys.add(key);
    diagnostics.push({ affectedCount: 1, code, explanation, severity: "warning" });
  };

  const imageResource = (texture: Texture): GltfCanonicalImageResource | undefined => {
    const cached = imageResources.get(texture);
    if (cached !== undefined) return cached ?? undefined;
    const resource = createGltfCanonicalImageResource(texture, limits);
    imageResources.set(texture, resource ?? null);
    if (resource && !resources.has(resource.resourceRef)) {
      resourceBytes = checkedGltfTotal(
        resourceBytes,
        resource.resource.bytes.byteLength,
        limits.maxTextureBytes,
        "max-texture-bytes-exceeded",
        "Canonical glTF texture resources",
      );
      resources.set(resource.resourceRef, resource.resource);
    }
    return resource;
  };

  const textureSlot = (
    materialLabel: string,
    slotName: SlotName,
    texture: Texture | null,
    info: TextureInfo | null,
    availableUvSets: ReadonlySet<number>,
    colorSpace: ToolcraftModelTextureColorSpace,
    scale?: number,
    strength?: number,
  ): ToolcraftModelTextureSlot | undefined => {
    if (!texture || !info) return undefined;
    const texCoord = info.getTexCoord();
    const identity = sourceTextureIndex.get(texture) ?? -1;
    const diagnosticKey = `${materialLabel}|${slotName}|${identity}`;
    if (texCoord !== 0 && texCoord !== 1) {
      warn(
        "unsupported-texture-coordinate-set",
        `${materialLabel} ${slotName} requires unsupported UV${texCoord}; that slot was omitted.`,
        `${diagnosticKey}|uv:${texCoord}`,
      );
      return undefined;
    }
    if (!availableUvSets.has(texCoord)) {
      warn(
        "missing-texture-coordinates",
        `${materialLabel} ${slotName} requires UV${texCoord}, which is absent; that slot was omitted.`,
        `${diagnosticKey}|missing-uv:${texCoord}`,
      );
      return undefined;
    }
    const image = imageResource(texture);
    if (!image) {
      const resourceIdentity = texture.getURI() || `image:${identity}`;
      warn(
        "missing-appearance-resource",
        `${materialLabel} ${slotName} could not retain ${resourceIdentity}; other material channels remain available.`,
        `${diagnosticKey}|resource`,
      );
      return undefined;
    }
    const sampler = samplerFor(info);
    const key = `${identity}|${colorSpace}|${samplerKey(sampler)}`;
    let textureId = textureIds.get(key);
    if (!textureId) {
      if (textures.length >= limits.maxTextureCount) {
        return gltfDecodeFailure(
          "resource-limit",
          "max-textures-exceeded",
          `Canonical glTF textures exceed maxTextureCount ${limits.maxTextureCount}.`,
        );
      }
      texturePixels = checkedGltfTotal(
        texturePixels,
        image.width * image.height,
        limits.maxTexturePixels,
        "max-texture-pixels-exceeded",
        "Canonical glTF texture pixels",
      );
      textureId = `texture:${textures.length}`;
      textureIds.set(key, textureId);
      textures.push({
        colorSpace,
        contentDigest: image.contentDigest,
        height: image.height,
        id: textureId,
        mimeType: image.mimeType,
        resourceRef: image.resourceRef,
        sampler,
        width: image.width,
      });
    }
    return {
      ...(scale === undefined ? {} : { scale: finiteFactor(scale, `${materialLabel}.${slotName}.scale`, false) }),
      ...(strength === undefined ? {} : { strength: finiteFactor(strength, `${materialLabel}.${slotName}.strength`) }),
      texCoord,
      textureId,
    };
  };

  const materialFor = (
    source: Material | null,
    usesVertexColor: boolean,
    uvSets: ReadonlySet<number>,
  ): string => {
    const sourceIndex = source ? sourceMaterialIndex.get(source) ?? -1 : -1;
    const key = `${sourceIndex}|color:${usesVertexColor}|uv:${[...uvSets].join(",")}`;
    const cached = materialIds.get(key);
    if (cached) return cached;
    const id = `material:${materials.length}`;
    const label = source
      ? `material:${sourceIndex}${source.getName() ? ` (${source.getName()})` : ""}`
      : "fallback vertex-color material";
    if (!source) {
      materials.push({
        alphaCutoff: 0.5,
        alphaMode: "opaque",
        baseColor: TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.baseColorLinear,
        doubleSided: false,
        emissive: TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.emissiveLinear,
        id,
        metallic: TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.metallic,
        opacity: TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.alpha,
        roughness: TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.roughness,
        usesVertexColor,
      });
      materialIds.set(key, id);
      return id;
    }
    const baseColor = source.getBaseColorFactor();
    const alphaMode = source.getAlphaMode().toLowerCase();
    if (alphaMode !== "blend" && alphaMode !== "mask" && alphaMode !== "opaque") {
      return gltfDecodeFailure(
        "format",
        "invalid-gltf-alpha-mode",
        `${label} has unsupported alpha mode ${source.getAlphaMode()}.`,
      );
    }
    materials.push({
      alphaCutoff: finiteFactor(source.getAlphaCutoff(), `${label}.alphaCutoff`),
      alphaMode,
      baseColor: color3(baseColor, `${label}.baseColor`),
      baseColorTexture: textureSlot(
        label, "baseColorTexture", source.getBaseColorTexture(),
        source.getBaseColorTextureInfo(), uvSets, "srgb",
      ),
      doubleSided: source.getDoubleSided(),
      emissive: color3(source.getEmissiveFactor(), `${label}.emissive`),
      emissiveTexture: textureSlot(
        label, "emissiveTexture", source.getEmissiveTexture(),
        source.getEmissiveTextureInfo(), uvSets, "srgb",
      ),
      id,
      metallic: finiteFactor(source.getMetallicFactor(), `${label}.metallic`),
      metallicRoughnessTexture: textureSlot(
        label, "metallicRoughnessTexture", source.getMetallicRoughnessTexture(),
        source.getMetallicRoughnessTextureInfo(), uvSets, "linear",
      ),
      normalTexture: textureSlot(
        label, "normalTexture", source.getNormalTexture(),
        source.getNormalTextureInfo(), uvSets, "linear", source.getNormalScale(),
      ),
      occlusionTexture: textureSlot(
        label, "occlusionTexture", source.getOcclusionTexture(),
        source.getOcclusionTextureInfo(), uvSets, "linear", undefined,
        source.getOcclusionStrength(),
      ),
      opacity: finiteFactor(baseColor[3]!, `${label}.opacity`),
      roughness: finiteFactor(source.getRoughnessFactor(), `${label}.roughness`),
      usesVertexColor,
    });
    materialIds.set(key, id);
    return id;
  };

  return Object.freeze({
    finish: () => Object.freeze({
      appearanceResources: Object.freeze(
        [...resources.values()].sort((left, right) =>
          compareToolcraftModelAppearanceResourceRefs(
            left.resourceRef,
            right.resourceRef,
          )
        ),
      ),
      diagnostics: Object.freeze(diagnostics),
      materials: Object.freeze(materials),
      resourceBytes,
      textures: Object.freeze(textures),
    }),
    primitiveAppearance: (primitive, vertexCount) => {
      const textureCoordinates = ([0, 1] as const).flatMap((set) => {
        const accessor = primitive.getAttribute(`TEXCOORD_${set}`);
        if (!accessor) return [];
        if (accessor.getCount() !== vertexCount) {
          return gltfDecodeFailure(
            "geometry",
            "texture-coordinate-count-mismatch",
            `TEXCOORD_${set} and POSITION accessors must have equal counts.`,
          );
        }
        return [{
          set,
          values: copyGltfVec2Accessor(accessor, `TEXCOORD_${set}`, signal),
        }];
      });
      const colorAccessor = primitive.getAttribute("COLOR_0");
      if (colorAccessor && colorAccessor.getCount() !== vertexCount) {
        return gltfDecodeFailure(
          "geometry",
          "color-count-mismatch",
          "COLOR_0 and POSITION accessors must have equal counts.",
        );
      }
      const colors = colorAccessor
        ? copyGltfColorAccessor(colorAccessor, signal)
        : undefined;
      const sourceMaterial = primitive.getMaterial();
      const uvSets = new Set(textureCoordinates.map(({ set }) => set));
      const materialId = sourceMaterial || colors
        ? materialFor(sourceMaterial, Boolean(colors), uvSets)
        : undefined;
      return Object.freeze({
        attributeBytes:
          textureCoordinates.reduce(
            (total, coordinates) => total + coordinates.values.byteLength,
            0,
          ) + (colors?.values.byteLength ?? 0),
        ...(colors ? { colors } : {}),
        ...(materialId ? { materialId } : {}),
        ...(textureCoordinates.length > 0
          ? { textureCoordinates: Object.freeze(textureCoordinates) }
          : {}),
      });
    },
  });
}
