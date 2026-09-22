import {
  ClampToEdgeWrapping,
  DoubleSide,
  LinearFilter,
  LinearMipmapNearestFilter,
  Loader,
  LoadingManager,
  MirroredRepeatWrapping,
  NearestFilter,
  NearestMipmapLinearFilter,
  NearestMipmapNearestFilter,
  RepeatWrapping,
  Texture,
  type Material,
} from "three";

import type { ToolcraftModelImportLimits } from "../../schema/types";
import { decodeToolcraftModelAppearanceDataUri } from "../canonical/model-appearance-data-uri";
import { createToolcraftModelAppearanceImageResource } from "../canonical/model-appearance-image";
import { TOOLCRAFT_MODEL_FALLBACK_APPEARANCE } from "../canonical/model-document";
import type { ToolcraftModelDiagnostic } from "../model-import-types";
import { createModelSourcePackageLookup } from "../model-source-lookup";
import { tryNormalizeLocalModelSourceUri } from "../model-source-path";
import type { FbxBinaryEmbeddedImage } from "./fbx-binary-preflight";
import {
  threeStaticGeometryFailure,
} from "./three-static-geometry-primitives";
import type {
  ThreeStaticAppearanceCatalog,
  ThreeStaticAppearanceMaterialSource,
  ThreeStaticAppearanceTextureSlotSource,
  ThreeStaticAppearanceTextureSource,
} from "./three-static-appearance-canonicalizer";
import type { ThreeStaticGeometrySourceBundle } from "./three-static-source-bundle";

const FBX_TEXTURE_IDENTITY = "toolcraftFbxTextureIdentity";
const EMBEDDED_URL_PREFIX = "blob:toolcraft-fbx-embedded/";

type FbxMaterial = Material & Readonly<{
  aoMap?: Texture | null;
  aoMapIntensity?: number;
  bumpMap?: Texture | null;
  color?: Readonly<{ b: number; g: number; r: number }>;
  emissive?: Readonly<{ b: number; g: number; r: number }>;
  emissiveIntensity?: number;
  emissiveMap?: Texture | null;
  map?: Texture | null;
  metalness?: number;
  normalMap?: Texture | null;
  normalScale?: Readonly<{ x: number; y: number }>;
  opacity?: number;
  roughness?: number;
  shininess?: number;
}>;

class FbxPlaceholderTextureLoader extends Loader<Texture> {
  readonly textures: Texture[] = [];

  override load(
    url: string,
    onLoad?: (texture: Texture) => void,
  ): Texture {
    const identity = `${this.path ?? ""}${url}`;
    const texture = new Texture();
    texture.userData[FBX_TEXTURE_IDENTITY] = identity;
    this.textures.push(texture);
    onLoad?.(texture);
    return texture;
  }
}

export type FbxPlaceholderRuntime = Readonly<{
  dispose: () => void;
  manager: LoadingManager;
  restoreObjectUrl: () => void;
}>;

function installObjectUrlPlaceholder(): () => void {
  type MutableUrl = { createObjectURL?: unknown };
  type MutableWindow = { URL?: MutableUrl };
  const globalRecord: { window?: MutableWindow } = globalThis;
  const hadWindow = Object.prototype.hasOwnProperty.call(globalRecord, "window");
  const previousWindow = globalRecord.window;
  const windowRecord: MutableWindow = previousWindow ?? {};
  const previousUrl = windowRecord.URL;
  const urlRecord: MutableUrl = previousUrl ?? {};
  const descriptor = Object.getOwnPropertyDescriptor(urlRecord, "createObjectURL");
  let nextEmbedded = 0;
  try {
    Object.defineProperty(urlRecord, "createObjectURL", {
      configurable: true,
      value: () => `${EMBEDDED_URL_PREFIX}${nextEmbedded++}`,
    });
    windowRecord.URL = urlRecord;
    if (!previousWindow) {
      Object.defineProperty(globalRecord, "window", {
        configurable: true,
        value: windowRecord,
      });
    }
  } catch {
    return threeStaticGeometryFailure(
      "resource-unavailable",
      "fbx-placeholder-runtime-unavailable",
      "The worker cannot install the bounded FBX image placeholder runtime.",
    );
  }
  return () => {
    if (descriptor) Object.defineProperty(urlRecord, "createObjectURL", descriptor);
    else Reflect.deleteProperty(urlRecord, "createObjectURL");
    if (previousUrl) windowRecord.URL = previousUrl;
    else Reflect.deleteProperty(windowRecord, "URL");
    if (!hadWindow) Reflect.deleteProperty(globalRecord, "window");
  };
}

export function createFbxPlaceholderRuntime(): FbxPlaceholderRuntime {
  const manager = new LoadingManager();
  const loader = new FbxPlaceholderTextureLoader(manager);
  manager.addHandler(/^\.[a-z0-9]+$/iu, loader);
  manager.setURLModifier((url) =>
    threeStaticGeometryFailure(
      "format",
      "unhandled-fbx-external-resource",
      `FBX attempted an unhandled external resource ${JSON.stringify(url)}.`,
    )
  );
  const restoreObjectUrl = installObjectUrlPlaceholder();
  return Object.freeze({
    dispose: () => loader.textures.forEach((texture) => texture.dispose()),
    manager,
    restoreObjectUrl,
  });
}

function wrap(value: number): "clamp-to-edge" | "mirrored-repeat" | "repeat" {
  if (value === ClampToEdgeWrapping) return "clamp-to-edge";
  if (value === MirroredRepeatWrapping) return "mirrored-repeat";
  return "repeat";
}

function minFilter(value: number):
  | "linear"
  | "linear-mipmap-linear"
  | "linear-mipmap-nearest"
  | "nearest"
  | "nearest-mipmap-linear"
  | "nearest-mipmap-nearest" {
  if (value === LinearFilter) return "linear";
  if (value === LinearMipmapNearestFilter) return "linear-mipmap-nearest";
  if (value === NearestFilter) return "nearest";
  if (value === NearestMipmapLinearFilter) return "nearest-mipmap-linear";
  if (value === NearestMipmapNearestFilter) return "nearest-mipmap-nearest";
  return "linear-mipmap-linear";
}

function textureIdentity(texture: Texture): string | undefined {
  const value = texture.userData[FBX_TEXTURE_IDENTITY];
  return typeof value === "string" && value ? value : undefined;
}

function finiteFactor(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function createFbxStaticAppearanceCatalog(
  bundle: ThreeStaticGeometrySourceBundle,
  embeddedImages: readonly FbxBinaryEmbeddedImage[],
  limits: ToolcraftModelImportLimits,
): ThreeStaticAppearanceCatalog {
  const diagnostics: ToolcraftModelDiagnostic[] = [];
  const diagnosticKeys = new Set<string>();
  const materials = new WeakMap<Material, number>();
  let nextMaterial = 0;
  const textures = new Map<string, ThreeStaticAppearanceTextureSource | null>();
  const lookup = createModelSourcePackageLookup(bundle.files);
  const filesByBasename = new Map<string, typeof bundle.files[number][]>();
  for (const file of bundle.files) {
    const basename = file.path.split("/").at(-1);
    if (!basename) continue;
    const candidates = filesByBasename.get(basename) ?? [];
    candidates.push(file);
    filesByBasename.set(basename, candidates);
  }

  const warn = (code: string, explanation: string, key: string): void => {
    if (diagnosticKeys.has(key)) return;
    diagnosticKeys.add(key);
    diagnostics.push({ affectedCount: 1, code, explanation, severity: "warning" });
  };

  const textureSource = (
    texture: Texture | null | undefined,
    materialKey: string,
    channel: string,
  ): ThreeStaticAppearanceTextureSource | undefined => {
    if (!texture) return undefined;
    const identity = textureIdentity(texture);
    if (!identity) {
      warn(
        "missing-appearance-resource",
        `${materialKey} ${channel} has no worker-safe image identity; that channel was omitted.`,
        `${materialKey}|${channel}|identity`,
      );
      return undefined;
    }
    const cached = textures.get(identity);
    if (cached !== undefined) return cached ?? undefined;
    let source: Uint8Array | undefined;
    let declaredMimeType: string | undefined;
    if (identity.startsWith(EMBEDDED_URL_PREFIX)) {
      const index = Number(identity.slice(EMBEDDED_URL_PREFIX.length));
      source = Number.isSafeInteger(index) ? embeddedImages[index]?.bytes : undefined;
    } else {
      const data = decodeToolcraftModelAppearanceDataUri(identity, limits.maxTextureBytes);
      if (data.kind === "too-large") {
        return threeStaticGeometryFailure(
          "resource-limit",
          "max-texture-bytes-exceeded",
          `Embedded FBX image exceeds maxTextureBytes ${limits.maxTextureBytes}.`,
        );
      }
      if (data.kind === "invalid") {
        warn(
          "missing-appearance-resource",
          `${materialKey} ${channel} contains an invalid embedded image; that channel was omitted.`,
          `${materialKey}|${channel}|invalid-data`,
        );
        textures.set(identity, null);
        return undefined;
      }
      if (data.kind === "decoded") {
        source = data.bytes;
        declaredMimeType = data.mimeType;
      } else {
        const segments = tryNormalizeLocalModelSourceUri(identity);
        if (!segments && /^[a-z][a-z0-9+.-]*:/iu.test(identity)) {
          warn(
            "blocked-remote-appearance-resource",
            `${materialKey} ${channel} remote image was blocked; that channel was omitted.`,
            `${materialKey}|${channel}|remote:${identity}`,
          );
          textures.set(identity, null);
          return undefined;
        }
        let file = segments
          ? lookup.resolveFrom(bundle.root.path, segments)
          : undefined;
        if (!file && segments?.length === 1) {
          const basename = segments[0];
          const candidates = basename
            ? filesByBasename.get(basename) ?? []
            : [];
          if (candidates.length === 1) file = candidates[0];
          else if (candidates.length > 1) {
            warn(
              "ambiguous-fbx-appearance-resource",
              `${materialKey} ${channel} image basename is ambiguous; that channel was omitted.`,
              `${materialKey}|${channel}|ambiguous:${identity}`,
            );
            textures.set(identity, null);
            return undefined;
          }
        }
        source = file?.bytes;
      }
    }
    const image = source
      ? createToolcraftModelAppearanceImageResource(source, declaredMimeType)
      : undefined;
    if (!image) {
      warn(
        "missing-appearance-resource",
        `${materialKey} ${channel} image is missing or unsupported; that channel was omitted.`,
        `${materialKey}|${channel}|missing:${identity}`,
      );
      textures.set(identity, null);
      return undefined;
    }
    if (
      texture.offset.x !== 0 || texture.offset.y !== 0 ||
      texture.repeat.x !== 1 || texture.repeat.y !== 1
    ) {
      warn(
        "unsupported-fbx-texture-transform",
        `${materialKey} ${channel} texture transform is unsupported; the base image was preserved.`,
        `${materialKey}|${channel}|transform`,
      );
    }
    const canonical = Object.freeze({
      ...image,
      sampler: {
        magFilter: texture.magFilter === NearestFilter ? "nearest" as const : "linear" as const,
        minFilter: minFilter(texture.minFilter),
        wrapS: wrap(texture.wrapS),
        wrapT: wrap(texture.wrapT),
      },
      sourceKey: image.contentDigest,
    });
    textures.set(identity, canonical);
    return canonical;
  };

  const textureSlot = (
    texture: Texture | null | undefined,
    materialKey: string,
    channel: string,
    values: Readonly<{ scale?: number; strength?: number }> = {},
  ): ThreeStaticAppearanceTextureSlotSource | undefined => {
    const source = textureSource(texture, materialKey, channel);
    return source ? { ...values, texture: source } : undefined;
  };

  const color = (
    value: FbxMaterial["color"] | FbxMaterial["emissive"],
    fallback: readonly [number, number, number],
    intensity: number,
    key: string,
    label: string,
  ): readonly [number, number, number] => {
    const values = value
      ? [value.r * intensity, value.g * intensity, value.b * intensity]
      : [...fallback];
    if (values.some((channel) => channel > 1)) {
      warn(
        "clamped-fbx-material-color",
        `${key} ${label} exceeds the canonical color range and was clamped.`,
        `${key}|${label}|clamped`,
      );
      return values.map((channel) => Math.min(channel, 1)) as [number, number, number];
    }
    return values as [number, number, number];
  };

  const resolveMaterial = (
    material: Material | null,
  ): ThreeStaticAppearanceMaterialSource | undefined => {
    if (!material || material.name === "__DEFAULT") return undefined;
    const source = material as FbxMaterial;
    let index = materials.get(material);
    if (index === undefined) {
      index = nextMaterial++;
      materials.set(material, index);
    }
    const key = `fbx:${index}:${material.name}`;
    const shininess = finiteFactor(source.shininess, Number.NaN);
    const roughness = finiteFactor(source.roughness, Number.NaN);
    const normalScale = finiteFactor(source.normalScale?.x, 1);
    if (
      source.normalScale &&
      Number.isFinite(source.normalScale.y) &&
      source.normalScale.y !== normalScale
    ) {
      warn(
        "unsupported-fbx-anisotropic-normal-scale",
        `${key} has distinct X/Y normal scales; the X scale was preserved.`,
        `${key}|normal-scale`,
      );
    }
    if (source.bumpMap) {
      warn(
        "unsupported-fbx-bump-map",
        `${key} bump map cannot be represented as a canonical normal map and was omitted.`,
        `${key}|bump`,
      );
    }
    return Object.freeze({
      baseColor: color(
        source.color,
        TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.baseColorLinear,
        1,
        key,
        "base color",
      ),
      baseColorTexture: textureSlot(source.map, key, "base color"),
      doubleSided: material.side === DoubleSide,
      emissive: color(
        source.emissive,
        TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.emissiveLinear,
        finiteFactor(source.emissiveIntensity, 1),
        key,
        "emissive color",
      ),
      emissiveTexture: textureSlot(source.emissiveMap, key, "emissive"),
      key,
      metallic: finiteFactor(source.metalness, 0),
      normalTexture: textureSlot(source.normalMap, key, "normal", {
        scale: normalScale,
      }),
      occlusionTexture: textureSlot(source.aoMap, key, "occlusion", {
        strength: finiteFactor(source.aoMapIntensity, 1),
      }),
      opacity: finiteFactor(source.opacity, 1),
      roughness: Number.isFinite(roughness)
        ? roughness
        : Number.isFinite(shininess)
          ? Math.sqrt(2 / (shininess + 2))
          : TOOLCRAFT_MODEL_FALLBACK_APPEARANCE.roughness,
    });
  };

  return Object.freeze({ diagnostics, resolveMaterial });
}
