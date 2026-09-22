import type { ToolcraftModelImportLimits } from "../../schema/types";
import {
  createToolcraftModelAppearanceImageResource,
} from "../canonical/model-appearance-image";
import { TOOLCRAFT_MODEL_FALLBACK_APPEARANCE } from "../canonical/model-document";
import type { ToolcraftModelDiagnostic } from "../model-import-types";
import { createModelSourcePackageLookup } from "../model-source-lookup";
import { tryNormalizeLocalModelSourceUri } from "../model-source-path";
import {
  checkedThreeStaticGeometryTotal,
  threeStaticGeometryFailure,
  throwIfThreeStaticGeometryAborted,
} from "./three-static-geometry-primitives";
import type { ThreeStaticGeometrySourceBundle } from "./three-static-source-bundle";
import type {
  ThreeStaticAppearanceMaterialSource,
  ThreeStaticAppearanceTextureSource,
} from "./three-static-appearance-canonicalizer";

export type ObjMaterialLibrary = Readonly<{
  diagnostics: readonly ToolcraftModelDiagnostic[];
  materialsByName: ReadonlyMap<string, ThreeStaticAppearanceMaterialSource>;
}>;

type MutableMaterial = {
  baseColor: [number, number, number];
  baseColorMap?: string;
  emissive: [number, number, number];
  emissiveMap?: string;
  libraryPath: string;
  name: string;
  normalMap?: string;
  normalScale: number;
  opacity: number;
  roughness: number;
};

function decodeUtf8(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return threeStaticGeometryFailure(
      "format",
      "invalid-mtl-encoding",
      `${label} must use valid UTF-8 encoding.`,
    );
  }
}

function lines(source: string): string[] {
  return source.split(/\r\n|\r|\n/u).map((line) => {
    const comment = line.indexOf("#");
    return (comment < 0 ? line : line.slice(0, comment)).trim();
  });
}

function directive(line: string): Readonly<{ name: string; value: string }> {
  const separator = line.search(/\s/u);
  return separator < 0
    ? { name: line.toLowerCase(), value: "" }
    : {
        name: line.slice(0, separator).toLowerCase(),
        value: line.slice(separator).trim(),
      };
}

function finiteNumber(value: string, label: string): number {
  if (value.length === 0 || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/iu.test(value)) {
    return threeStaticGeometryFailure(
      "format",
      "invalid-mtl-value",
      `${label} must contain a finite decimal number.`,
    );
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return threeStaticGeometryFailure(
      "format",
      "invalid-mtl-value",
      `${label} must contain a finite decimal number.`,
    );
  }
  return parsed;
}

function unitFactor(value: string, label: string): number {
  const parsed = finiteNumber(value, label);
  if (parsed < 0 || parsed > 1) {
    return threeStaticGeometryFailure(
      "format",
      "invalid-mtl-value",
      `${label} must be from 0 through 1.`,
    );
  }
  return parsed;
}

function color(value: string, label: string): [number, number, number] {
  const components = value.split(/\s+/u);
  if (components.length !== 3) {
    return threeStaticGeometryFailure(
      "format",
      "invalid-mtl-value",
      `${label} must contain exactly three color components.`,
    );
  }
  return components.map((component, index) =>
    unitFactor(component, `${label}[${index}]`)
  ) as [number, number, number];
}

function mapPath(
  value: string,
  label: string,
  allowBumpScale: boolean,
): Readonly<{ path: string; scale: number }> | undefined {
  const tokens = value.split(/\s+/u).filter(Boolean);
  let scale = 1;
  if (tokens[0]?.toLowerCase() === "-bm" && allowBumpScale) {
    if (tokens.length < 3) {
      return threeStaticGeometryFailure(
        "format",
        "invalid-mtl-map",
        `${label} -bm requires a scale and texture path.`,
      );
    }
    scale = finiteNumber(tokens[1]!, `${label} -bm`);
    if (scale < 0) {
      return threeStaticGeometryFailure(
        "format",
        "invalid-mtl-map",
        `${label} normal scale must be non-negative.`,
      );
    }
    tokens.splice(0, 2);
  }
  if (tokens.length === 0 || tokens[0]!.startsWith("-")) return undefined;
  const joined = tokens.join(" ");
  const path =
    joined.length >= 2 && joined[0] === joined.at(-1) && /["']/u.test(joined[0]!)
      ? joined.slice(1, -1)
      : joined;
  return path ? { path, scale } : undefined;
}

function materialLibraries(source: string): string[] {
  return lines(source).flatMap((line) => {
    if (!line) return [];
    const parsed = directive(line);
    return parsed.name === "mtllib"
      ? parsed.value.split(/\s+/u).filter(Boolean)
      : [];
  });
}

function usedMaterialNames(source: string): string[] {
  return [...new Set(lines(source).flatMap((line) => {
    if (!line) return [];
    const parsed = directive(line);
    return parsed.name === "usemtl" && parsed.value ? [parsed.value] : [];
  }))];
}

function createMutableMaterial(name: string, libraryPath: string): MutableMaterial {
  return {
    baseColor: [...TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.baseColorLinear],
    emissive: [...TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.emissiveLinear],
    libraryPath,
    name,
    normalScale: 1,
    opacity: TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.alpha,
    roughness: TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.roughness,
  };
}

function parseMaterialSource(
  source: string,
  label: string,
  materials: Map<string, MutableMaterial>,
  diagnostics: ToolcraftModelDiagnostic[],
): void {
  let material: MutableMaterial | undefined;
  for (const [lineIndex, line] of lines(source).entries()) {
    if (!line) continue;
    const parsed = directive(line);
    if (parsed.name === "newmtl") {
      if (!parsed.value || materials.has(parsed.value)) {
        return threeStaticGeometryFailure(
          "format",
          "duplicate-or-empty-mtl-material",
          `${label}:${lineIndex + 1} declares a duplicate or empty material.`,
        );
      }
      material = createMutableMaterial(parsed.value, label);
      materials.set(parsed.value, material);
      continue;
    }
    if (!material) continue;
    const valueLabel = `${label}:${lineIndex + 1} ${parsed.name}`;
    if (parsed.name === "kd") material.baseColor = color(parsed.value, valueLabel);
    else if (parsed.name === "ke") material.emissive = color(parsed.value, valueLabel);
    else if (parsed.name === "d") material.opacity = unitFactor(parsed.value, valueLabel);
    else if (parsed.name === "tr") material.opacity = 1 - unitFactor(parsed.value, valueLabel);
    else if (parsed.name === "ns") {
      const shininess = finiteNumber(parsed.value, valueLabel);
      if (shininess < 0 || shininess > 1_000) {
        return threeStaticGeometryFailure(
          "format",
          "invalid-mtl-value",
          `${valueLabel} must be from 0 through 1000.`,
        );
      }
      material.roughness = Math.sqrt(2 / (shininess + 2));
    } else if (["map_kd", "map_ke", "map_bump", "bump", "norm"].includes(parsed.name)) {
      const map = mapPath(
        parsed.value,
        valueLabel,
        parsed.name === "map_bump" || parsed.name === "bump" || parsed.name === "norm",
      );
      if (!map) {
        diagnostics.push({
          affectedCount: 1,
          code: "unsupported-mtl-map-option",
          explanation: `${valueLabel} uses unsupported map options; that channel was omitted.`,
          severity: "warning",
        });
      } else if (parsed.name === "map_kd") material.baseColorMap = map.path;
      else if (parsed.name === "map_ke") material.emissiveMap = map.path;
      else {
        material.normalMap = map.path;
        material.normalScale = map.scale;
      }
    }
  }
}

export function loadObjMaterialLibrary(
  objSource: string,
  bundle: ThreeStaticGeometrySourceBundle,
  limits: ToolcraftModelImportLimits,
  signal: AbortSignal,
): ObjMaterialLibrary {
  const diagnostics: ToolcraftModelDiagnostic[] = [];
  const usedNames = new Set(usedMaterialNames(objSource));
  if (usedNames.size > limits.maxPrimitives) {
    return threeStaticGeometryFailure(
      "resource-limit",
      "max-primitives-exceeded",
      `OBJ material assignments exceed maxPrimitives ${limits.maxPrimitives}.`,
    );
  }
  const materials = new Map<string, MutableMaterial>();
  const lookup = createModelSourcePackageLookup(bundle.files);
  const libraryFiles: Array<{ bytes: Uint8Array; path: string }> = [];
  const libraryUris = materialLibraries(objSource);
  if (libraryUris.length > limits.maxBundleFiles) {
    return threeStaticGeometryFailure(
      "resource-limit",
      "bundle-file-limit-exceeded",
      `OBJ libraries exceed maxBundleFiles ${limits.maxBundleFiles}.`,
    );
  }
  for (const uri of libraryUris) {
    throwIfThreeStaticGeometryAborted(signal);
    const segments = tryNormalizeLocalModelSourceUri(uri);
    if (!segments) {
      return threeStaticGeometryFailure(
        "bundle",
        "unsafe-material-library-uri",
        `OBJ material library URI ${uri} is not a safe relative path.`,
      );
    }
    const file = lookup.resolveFrom(bundle.root.path, segments);
    if (!file) {
      diagnostics.push({
        affectedCount: 1,
        code: "missing-material-library",
        explanation: `OBJ material library ${uri} is absent; geometry uses fallback appearance.`,
        severity: "warning",
      });
      continue;
    }
    if (libraryFiles.some(({ path }) => path === file.path)) continue;
    libraryFiles.push(file);
  }
  for (const file of libraryFiles) {
    parseMaterialSource(
      decodeUtf8(file.bytes, file.path),
      file.path,
      materials,
      diagnostics,
    );
  }
  if (materials.size > limits.maxPrimitives) {
    return threeStaticGeometryFailure(
      "resource-limit",
      "max-primitives-exceeded",
      `OBJ materials exceed maxPrimitives ${limits.maxPrimitives}.`,
    );
  }
  for (const name of usedNames) {
    if (materials.has(name)) continue;
    diagnostics.push({
      affectedCount: 1,
      code: "missing-material-definition",
      explanation: `OBJ material ${name} is undefined; that geometry uses fallback appearance.`,
      severity: "warning",
    });
  }

  const resourceRefs = new Set<string>();
  const textureCache = new Map<
    string,
    ThreeStaticAppearanceTextureSource | null
  >();
  let textureBytes = 0;
  let texturePixels = 0;
  const resolveTexture = (
    libraryPath: string,
    materialName: string,
    channel: string,
    uri: string | undefined,
  ): ThreeStaticAppearanceTextureSource | undefined => {
    if (!uri) return undefined;
    const cacheKey = `${libraryPath}|${uri}`;
    const cached = textureCache.get(cacheKey);
    if (cached !== undefined) return cached ?? undefined;
    const segments = tryNormalizeLocalModelSourceUri(uri);
    if (!segments) {
      return threeStaticGeometryFailure(
        "bundle",
        "unsafe-appearance-uri",
        `Material ${materialName} ${channel} map URI ${uri} is unsafe.`,
      );
    }
    const file = lookup.resolveFrom(libraryPath, segments);
    const image = file
      ? createToolcraftModelAppearanceImageResource(file.bytes)
      : undefined;
    if (!file || !image) {
      diagnostics.push({
        affectedCount: 1,
        code: "missing-appearance-resource",
        explanation: `Material ${materialName} ${channel} map ${uri} is missing or invalid; that channel was omitted.`,
        severity: "warning",
      });
      textureCache.set(cacheKey, null);
      return undefined;
    }
    if (!resourceRefs.has(image.resourceRef)) {
      textureBytes = checkedThreeStaticGeometryTotal(
        textureBytes,
        image.resource.bytes.byteLength,
        limits.maxTextureBytes,
        "max-texture-bytes-exceeded",
        "OBJ texture bytes",
      );
      texturePixels = checkedThreeStaticGeometryTotal(
        texturePixels,
        image.width * image.height,
        limits.maxTexturePixels,
        "max-texture-pixels-exceeded",
        "OBJ texture pixels",
      );
      if (
        image.width > limits.maxTextureDimension ||
        image.height > limits.maxTextureDimension
      ) {
        return threeStaticGeometryFailure(
          "resource-limit",
          "max-texture-dimension-exceeded",
          `OBJ texture exceeds maxTextureDimension ${limits.maxTextureDimension}.`,
        );
      }
      if (resourceRefs.size >= limits.maxTextureCount) {
        return threeStaticGeometryFailure(
          "resource-limit",
          "max-textures-exceeded",
          `OBJ textures exceed maxTextureCount ${limits.maxTextureCount}.`,
        );
      }
      resourceRefs.add(image.resourceRef);
    }
    const texture = Object.freeze({ ...image, sourceKey: image.contentDigest });
    textureCache.set(cacheKey, texture);
    return texture;
  };

  const materialsByName = new Map<
    string,
    ThreeStaticAppearanceMaterialSource
  >();
  const textureSlot = (
    material: MutableMaterial,
    channel: string,
    uri: string | undefined,
    scale?: number,
  ) => {
    const texture = resolveTexture(
      material.libraryPath,
      material.name,
      channel,
      uri,
    );
    return texture
      ? { ...(scale === undefined ? {} : { scale }), texture }
      : undefined;
  };
  for (const material of materials.values()) {
    if (!usedNames.has(material.name)) continue;
    materialsByName.set(material.name, Object.freeze({
      baseColor: material.baseColor,
      baseColorTexture: textureSlot(material, "diffuse", material.baseColorMap),
      emissive: material.emissive,
      emissiveTexture: textureSlot(material, "emissive", material.emissiveMap),
      key: `obj:${material.name}`,
      metallic: 0,
      normalTexture: textureSlot(
        material,
        "normal",
        material.normalMap,
        material.normalScale,
      ),
      opacity: material.opacity,
      roughness: material.roughness,
    }));
  }
  return Object.freeze({
    diagnostics: Object.freeze(diagnostics),
    materialsByName,
  });
}
