import {
  type GLTF,
  type JSONDocument,
  type Texture,
} from "@gltf-transform/core";

import type { ToolcraftModelImportLimits } from "../../schema/types";
import {
  decodeToolcraftModelAppearanceDataUri,
} from "../canonical/model-appearance-data-uri";
import {
  createToolcraftModelAppearanceImageResource,
  inspectToolcraftModelAppearanceImage,
  type ToolcraftModelAppearanceImageDimensions,
  type ToolcraftModelAppearanceImageResource,
} from "../canonical/model-appearance-image";
import {
  checkedGltfTotal,
  gltfDecodeCheckpoint,
  gltfDecodeFailure,
} from "./gltf-decode-safety";
import type { GltfBufferViewInfo } from "./gltf-json-inspection";
import {
  gltfJsonArray,
  gltfJsonInteger,
  gltfJsonIndexed,
  gltfJsonRecord,
} from "./gltf-json-inspection";

export type GltfCanonicalImageResource = ToolcraftModelAppearanceImageResource;

export function decodeGltfImageDataUri(
  uri: string,
  maxBytes: number,
): Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  mimeType: "image/jpeg" | "image/png";
}> | undefined {
  const decoded = decodeToolcraftModelAppearanceDataUri(uri, maxBytes);
  if (decoded.kind === "not-data") return undefined;
  if (decoded.kind === "invalid") {
    return gltfDecodeFailure(
      "format",
      "invalid-image-data-uri",
      "Embedded glTF images must use canonical base64 PNG or JPEG data URIs.",
    );
  }
  if (decoded.kind === "too-large") {
    return gltfDecodeFailure(
      "resource-limit",
      "max-texture-bytes-exceeded",
      `Embedded glTF image exceeds maxTextureBytes ${maxBytes}.`,
    );
  }
  return {
    bytes: decoded.bytes,
    mimeType: decoded.mimeType,
  };
}

function assertImageLimits(
  dimensions: ToolcraftModelAppearanceImageDimensions,
  limits: ToolcraftModelImportLimits,
  aggregatePixels: number,
): number {
  if (
    dimensions.width > limits.maxTextureDimension ||
    dimensions.height > limits.maxTextureDimension
  ) {
    return gltfDecodeFailure(
      "resource-limit",
      "max-texture-dimension-exceeded",
      `A glTF image exceeds maxTextureDimension ${limits.maxTextureDimension}.`,
    );
  }
  const pixels = dimensions.width * dimensions.height;
  if (!Number.isSafeInteger(pixels)) {
    return gltfDecodeFailure(
      "resource-limit",
      "max-texture-pixels-exceeded",
      "A glTF image has unsafe pixel dimensions.",
    );
  }
  return checkedGltfTotal(
    aggregatePixels,
    pixels,
    limits.maxTexturePixels,
    "max-texture-pixels-exceeded",
    "glTF image pixels",
  );
}

export function preflightGltfAppearanceResources(
  json: GLTF.IGLTF,
  resources: JSONDocument["resources"],
  bufferViews: readonly GltfBufferViewInfo[],
  limits: ToolcraftModelImportLimits,
  signal: AbortSignal,
): Readonly<{ imageBytes: number; imagePixels: number }> {
  const images = gltfJsonArray(json.images, "invalid-gltf-images", "glTF images");
  const textures = gltfJsonArray(
    json.textures,
    "invalid-gltf-textures",
    "glTF textures",
  );
  if (images.length > limits.maxTextureCount || textures.length > limits.maxTextureCount) {
    return gltfDecodeFailure(
      "resource-limit",
      "max-textures-exceeded",
      `glTF appearance exceeds maxTextureCount ${limits.maxTextureCount}.`,
    );
  }
  const samplers = gltfJsonArray(
    json.samplers,
    "invalid-gltf-samplers",
    "glTF samplers",
  );
  textures.forEach((value, index) => {
    const texture = gltfJsonRecord(
      value,
      "invalid-gltf-texture",
      `texture ${index}`,
    );
    gltfJsonIndexed(
      images,
      texture.source,
      "invalid-gltf-texture",
      `texture ${index}.source`,
    );
    if (texture.sampler !== undefined) {
      gltfJsonIndexed(
        samplers,
        texture.sampler,
        "invalid-gltf-texture",
        `texture ${index}.sampler`,
      );
    }
  });
  const materials = gltfJsonArray(
    json.materials,
    "invalid-gltf-materials",
    "glTF materials",
  );
  const textureInfoKeys = [
    "emissiveTexture",
    "normalTexture",
    "occlusionTexture",
  ] as const;
  const validateTextureInfo = (value: unknown, label: string): void => {
    if (value === undefined) return;
    const info = gltfJsonRecord(value, "invalid-gltf-material", label);
    gltfJsonIndexed(
      textures,
      info.index,
      "invalid-gltf-material",
      `${label}.index`,
    );
    if (info.texCoord !== undefined) {
      gltfJsonInteger(info.texCoord, "invalid-gltf-material", `${label}.texCoord`);
    }
  };
  materials.forEach((value, index) => {
    const material = gltfJsonRecord(
      value,
      "invalid-gltf-material",
      `material ${index}`,
    );
    for (const key of textureInfoKeys) {
      validateTextureInfo(material[key], `material ${index}.${key}`);
    }
    if (material.pbrMetallicRoughness !== undefined) {
      const pbr = gltfJsonRecord(
        material.pbrMetallicRoughness,
        "invalid-gltf-material",
        `material ${index}.pbrMetallicRoughness`,
      );
      validateTextureInfo(
        pbr.baseColorTexture,
        `material ${index}.baseColorTexture`,
      );
      validateTextureInfo(
        pbr.metallicRoughnessTexture,
        `material ${index}.metallicRoughnessTexture`,
      );
    }
  });
  let imageBytes = 0;
  let imagePixels = 0;
  images.forEach((value, index) => {
    gltfDecodeCheckpoint(signal, index);
    const image = gltfJsonRecord(value, "invalid-gltf-image", `image ${index}`);
    if (image.uri !== undefined && image.bufferView !== undefined) {
      return gltfDecodeFailure(
        "format",
        "invalid-gltf-image",
        `image ${index} cannot define both uri and bufferView.`,
      );
    }
    let bytes: Uint8Array | undefined;
    if (typeof image.uri === "string") bytes = resources[image.uri];
    else if (image.bufferView !== undefined) {
      bytes = gltfJsonIndexed(
        bufferViews,
        image.bufferView,
        "invalid-gltf-image",
        `image ${index}.bufferView`,
      ).readBytes();
    } else if (image.uri !== undefined) {
      return gltfDecodeFailure(
        "format",
        "invalid-gltf-image",
        `image ${index}.uri must be a string.`,
      );
    }
    if (!bytes) return;
    imageBytes = checkedGltfTotal(
      imageBytes,
      bytes.byteLength,
      limits.maxTextureBytes,
      "max-texture-bytes-exceeded",
      "glTF image bytes",
    );
    const dimensions = inspectToolcraftModelAppearanceImage(
      bytes,
      typeof image.mimeType === "string" ? image.mimeType : undefined,
    );
    if (dimensions) imagePixels = assertImageLimits(dimensions, limits, imagePixels);
  });
  return { imageBytes, imagePixels };
}

export function createGltfCanonicalImageResource(
  texture: Texture,
  limits: ToolcraftModelImportLimits,
): GltfCanonicalImageResource | undefined {
  const source = texture.getImage();
  if (!source) return undefined;
  const resource = createToolcraftModelAppearanceImageResource(
    source,
    texture.getMimeType(),
  );
  if (!resource) return undefined;
  assertImageLimits(resource, limits, 0);
  if (source.byteLength > limits.maxTextureBytes) {
    return gltfDecodeFailure(
      "resource-limit",
      "max-texture-bytes-exceeded",
      `A glTF image exceeds maxTextureBytes ${limits.maxTextureBytes}.`,
    );
  }
  return resource;
}
