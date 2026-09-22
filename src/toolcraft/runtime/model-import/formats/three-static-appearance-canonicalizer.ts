import type { Material } from "three";

import type { ToolcraftModelImportLimits } from "../../schema/types";
import {
  compareToolcraftModelAppearanceResourceRefs,
} from "../canonical/model-appearance-resource";
import type { ToolcraftModelAppearanceImageResource } from "../canonical/model-appearance-image";
import {
  TOOLCRAFT_MODEL_FALLBACK_APPEARANCE,
  type ToolcraftModelMaterial,
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
  checkedThreeStaticGeometryTotal,
  threeStaticGeometryFailure,
} from "./three-static-geometry-primitives";

export type ThreeStaticAppearanceTextureSource =
  ToolcraftModelAppearanceImageResource & Readonly<{
    sampler?: ToolcraftModelTextureSampler;
    sourceKey: string;
  }>;

export type ThreeStaticAppearanceTextureSlotSource = Readonly<{
  scale?: number;
  strength?: number;
  texCoord?: 0 | 1;
  texture: ThreeStaticAppearanceTextureSource;
}>;

export type ThreeStaticAppearanceMaterialSource = Readonly<{
  alphaCutoff?: number;
  alphaMode?: "blend" | "mask" | "opaque";
  baseColor: readonly [number, number, number];
  baseColorTexture?: ThreeStaticAppearanceTextureSlotSource;
  doubleSided?: boolean;
  emissive: readonly [number, number, number];
  emissiveTexture?: ThreeStaticAppearanceTextureSlotSource;
  key: string;
  metallic: number;
  metallicRoughnessTexture?: ThreeStaticAppearanceTextureSlotSource;
  normalTexture?: ThreeStaticAppearanceTextureSlotSource;
  occlusionTexture?: ThreeStaticAppearanceTextureSlotSource;
  opacity: number;
  roughness: number;
}>;

export type ThreeStaticAppearanceCatalog = Readonly<{
  diagnostics: readonly ToolcraftModelDiagnostic[];
  resolveMaterial: (
    material: Material | null,
  ) => ThreeStaticAppearanceMaterialSource | undefined;
}>;

export type ThreeStaticCanonicalAppearance = Readonly<{
  appearanceResources: readonly ToolcraftModelAppearanceResource[];
  diagnostics: readonly ToolcraftModelDiagnostic[];
  materials: readonly ToolcraftModelMaterial[];
  resourceBytes: number;
  textures: readonly ToolcraftModelTexture[];
}>;

export type ThreeStaticAppearanceBuilder = Readonly<{
  finish: () => ThreeStaticCanonicalAppearance;
  materialFor: (
    material: Material | null,
    usesVertexColor: boolean,
    uvSets: ReadonlySet<number>,
  ) => string | undefined;
}>;

const DEFAULT_SAMPLER: ToolcraftModelTextureSampler = Object.freeze({
  magFilter: "linear",
  minFilter: "linear-mipmap-linear",
  wrapS: "repeat",
  wrapT: "repeat",
});

function factor(value: number, label: string, bounded = true): number {
  if (!Number.isFinite(value) || value < 0 || (bounded && value > 1)) {
    return threeStaticGeometryFailure(
      "format",
      "invalid-static-material-factor",
      `${label} must be finite${bounded ? " from 0 through 1" : " and non-negative"}.`,
    );
  }
  return value;
}

function color(
  value: readonly [number, number, number],
  label: string,
): readonly [number, number, number] {
  return [
    factor(value[0], `${label}[0]`),
    factor(value[1], `${label}[1]`),
    factor(value[2], `${label}[2]`),
  ];
}

function samplerKey(sampler: ToolcraftModelTextureSampler): string {
  return `${sampler.magFilter}|${sampler.minFilter}|${sampler.wrapS}|${sampler.wrapT}`;
}

export function createThreeStaticAppearanceBuilder(
  catalog: ThreeStaticAppearanceCatalog | undefined,
  limits: ToolcraftModelImportLimits,
): ThreeStaticAppearanceBuilder {
  const materials: ToolcraftModelMaterial[] = [];
  const materialIds = new Map<string, string>();
  const textures: ToolcraftModelTexture[] = [];
  const textureIds = new Map<string, string>();
  const resources = new Map<string, ToolcraftModelAppearanceResource>();
  const diagnostics: ToolcraftModelDiagnostic[] = [];
  const diagnosticKeys = new Set<string>();
  let resourceBytes = 0;
  let texturePixels = 0;

  const warn = (code: string, explanation: string, key: string): void => {
    if (diagnosticKeys.has(key)) return;
    diagnosticKeys.add(key);
    diagnostics.push({ affectedCount: 1, code, explanation, severity: "warning" });
  };

  const textureSlot = (
    materialKey: string,
    slotName: string,
    source: ThreeStaticAppearanceTextureSlotSource | undefined,
    uvSets: ReadonlySet<number>,
    colorSpace: ToolcraftModelTextureColorSpace,
  ): ToolcraftModelTextureSlot | undefined => {
    if (!source) return undefined;
    const texCoord = source.texCoord ?? 0;
    if (!uvSets.has(texCoord)) {
      warn(
        "missing-texture-coordinates",
        `Material ${materialKey} ${slotName} requires UV${texCoord}; that channel was omitted.`,
        `${materialKey}|${slotName}|uv:${texCoord}`,
      );
      return undefined;
    }
    const sampler = source.texture.sampler ?? DEFAULT_SAMPLER;
    const textureKey =
      `${source.texture.sourceKey}|${colorSpace}|${samplerKey(sampler)}`;
    let textureId = textureIds.get(textureKey);
    if (!textureId) {
      if (
        source.texture.width > limits.maxTextureDimension ||
        source.texture.height > limits.maxTextureDimension
      ) {
        return threeStaticGeometryFailure(
          "resource-limit",
          "max-texture-dimension-exceeded",
          `A static texture exceeds maxTextureDimension ${limits.maxTextureDimension}.`,
        );
      }
      if (textures.length >= limits.maxTextureCount) {
        return threeStaticGeometryFailure(
          "resource-limit",
          "max-textures-exceeded",
          `Canonical textures exceed maxTextureCount ${limits.maxTextureCount}.`,
        );
      }
      texturePixels = checkedThreeStaticGeometryTotal(
        texturePixels,
        source.texture.width * source.texture.height,
        limits.maxTexturePixels,
        "max-texture-pixels-exceeded",
        "Canonical texture pixels",
      );
      textureId = `texture:${textures.length}`;
      textureIds.set(textureKey, textureId);
      textures.push({
        colorSpace,
        contentDigest: source.texture.contentDigest,
        height: source.texture.height,
        id: textureId,
        mimeType: source.texture.mimeType,
        resourceRef: source.texture.resourceRef,
        sampler,
        width: source.texture.width,
      });
      if (!resources.has(source.texture.resourceRef)) {
        resourceBytes = checkedThreeStaticGeometryTotal(
          resourceBytes,
          source.texture.resource.bytes.byteLength,
          limits.maxTextureBytes,
          "max-texture-bytes-exceeded",
          "Canonical texture resources",
        );
        resources.set(source.texture.resourceRef, source.texture.resource);
      }
    }
    return {
      ...(source.scale === undefined
        ? {}
        : { scale: factor(source.scale, `${materialKey}.${slotName}.scale`, false) }),
      ...(source.strength === undefined
        ? {}
        : { strength: factor(source.strength, `${materialKey}.${slotName}.strength`) }),
      texCoord,
      textureId,
    };
  };

  const fallbackMaterial = (usesVertexColor: boolean): string => {
    const key = `fallback|color:${usesVertexColor}`;
    const cached = materialIds.get(key);
    if (cached) return cached;
    const id = `material:${materials.length}`;
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
  };

  const materialFor = (
    material: Material | null,
    usesVertexColor: boolean,
    uvSets: ReadonlySet<number>,
  ): string | undefined => {
    const source = catalog?.resolveMaterial(material);
    if (!source) return usesVertexColor ? fallbackMaterial(true) : undefined;
    const key = `${source.key}|color:${usesVertexColor}|uv:${[...uvSets].join(",")}`;
    const cached = materialIds.get(key);
    if (cached) return cached;
    if (materials.length >= limits.maxPrimitives) {
      return threeStaticGeometryFailure(
        "resource-limit",
        "max-primitives-exceeded",
        `Canonical materials exceed maxPrimitives ${limits.maxPrimitives}.`,
      );
    }
    const id = `material:${materials.length}`;
    materials.push({
      alphaCutoff: factor(source.alphaCutoff ?? 0.5, `${source.key}.alphaCutoff`),
      alphaMode: source.alphaMode ?? (source.opacity < 1 ? "blend" : "opaque"),
      baseColor: color(source.baseColor, `${source.key}.baseColor`),
      baseColorTexture: textureSlot(
        source.key, "baseColorTexture", source.baseColorTexture, uvSets, "srgb",
      ),
      doubleSided: source.doubleSided ?? false,
      emissive: color(source.emissive, `${source.key}.emissive`),
      emissiveTexture: textureSlot(
        source.key, "emissiveTexture", source.emissiveTexture, uvSets, "srgb",
      ),
      id,
      metallic: factor(source.metallic, `${source.key}.metallic`),
      metallicRoughnessTexture: textureSlot(
        source.key,
        "metallicRoughnessTexture",
        source.metallicRoughnessTexture,
        uvSets,
        "linear",
      ),
      normalTexture: textureSlot(
        source.key, "normalTexture", source.normalTexture, uvSets, "linear",
      ),
      occlusionTexture: textureSlot(
        source.key, "occlusionTexture", source.occlusionTexture, uvSets, "linear",
      ),
      opacity: factor(source.opacity, `${source.key}.opacity`),
      roughness: factor(source.roughness, `${source.key}.roughness`),
      usesVertexColor,
    });
    materialIds.set(key, id);
    return id;
  };

  return Object.freeze({
    finish: () => Object.freeze({
      appearanceResources: Object.freeze([...resources.values()].sort(
        (left, right) => compareToolcraftModelAppearanceResourceRefs(
          left.resourceRef,
          right.resourceRef,
        ),
      )),
      diagnostics: Object.freeze([
        ...(catalog?.diagnostics ?? []),
        ...diagnostics,
      ]),
      materials: Object.freeze(materials),
      resourceBytes,
      textures: Object.freeze(textures),
    }),
    materialFor,
  });
}
