import { type GLTF, type JSONDocument } from "@gltf-transform/core";

import type {
  ToolcraftModelFormat,
  ToolcraftModelImportLimits,
} from "../../schema/types";
import { inspectBufferDataUri } from "../model-source-data-uri";
import { isToolcraftModelAppearanceSidecarPath } from "../model-package-path";
import { preflightAndParseGltfJson } from "../model-source-json-preflight";
import { normalizeLocalBufferUri } from "../model-source-path";
import type { GltfFeatureInventory } from "./gltf-canonical-metadata";
import {
  checkedGltfTotal,
  gltfDecodeCheckpoint,
  gltfDecodeFailure,
  throwIfGltfDecodeAborted,
} from "./gltf-decode-safety";
import { validateAndSanitizeGltfJson } from "./gltf-document-sanitizer";
import { extractGlbDocument } from "./gltf-glb-document";
import { preflightGltfJsonDocument } from "./gltf-json-preflight";
import {
  removeMissingGltfAppearance,
  type GltfMissingAppearanceBinding,
  type GltfMissingImage,
  type GltfMissingTexture,
} from "./gltf-missing-appearance";
import type { GltfDecodedCountExpectation } from "./gltf-primitive-preflight";
import type { GltfSourceSnapshot } from "./gltf-source-snapshot";
import { decodeGltfImageDataUri } from "./gltf-texture-resource";

const REMOTE_URI_PATTERN = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu;

type JsonRecord = Record<string, unknown>;

export type PreparedGltfSourceDocument = Readonly<{
  decodedCountExpectations: readonly GltfDecodedCountExpectation[];
  features: GltfFeatureInventory;
  jsonDocument: JSONDocument;
  missingAppearanceBindings: readonly GltfMissingAppearanceBinding[];
  retainedWorkerBytes: number;
}>;

function parseRootJson(
  bytes: Uint8Array<ArrayBuffer>,
  sourceWorkerBytes: number,
  maxWorkerBytes: number,
  signal: AbortSignal,
): { json: GLTF.IGLTF; workerBytes: number } {
  throwIfGltfDecodeAborted(signal);
  const remaining = maxWorkerBytes - sourceWorkerBytes;
  if (remaining <= 0) {
    return gltfDecodeFailure(
      "resource-limit",
      "estimated-worker-memory-limit-exceeded",
      "The source snapshot leaves no bounded memory for glTF JSON parsing.",
    );
  }
  const parsed = preflightAndParseGltfJson(bytes, remaining);
  throwIfGltfDecodeAborted(signal);
  if (
    typeof parsed.value !== "object" ||
    parsed.value === null ||
    Array.isArray(parsed.value)
  ) {
    return gltfDecodeFailure(
      "format",
      "malformed-gltf-json",
      "The glTF root must contain a JSON object.",
    );
  }
  const workerBytes = checkedGltfTotal(
    sourceWorkerBytes,
    parsed.preflight.estimatedWorkerBytes,
    maxWorkerBytes,
    "estimated-worker-memory-limit-exceeded",
    "glTF source and JSON memory",
  );
  return { json: parsed.value as GLTF.IGLTF, workerBytes };
}

function mapGltfResources(
  json: GLTF.IGLTF,
  snapshot: GltfSourceSnapshot,
  format: Extract<ToolcraftModelFormat, "glb" | "gltf">,
  initialResources: JSONDocument["resources"] | undefined,
  limits: ToolcraftModelImportLimits,
  signal: AbortSignal,
): Readonly<{
  missingAppearanceBindings: readonly GltfMissingAppearanceBinding[];
  resources: JSONDocument["resources"];
}> {
  const resources = Object.create(null) as JSONDocument["resources"];
  if (initialResources) Object.assign(resources, initialResources);
  const usedPaths = new Set([snapshot.root.path]);
  const rootDirectory = snapshot.root.path.split("/").slice(0, -1);
  const buffers = Array.isArray(json.buffers) ? json.buffers : [];
  buffers.forEach((bufferValue, index) => {
    gltfDecodeCheckpoint(signal, index);
    if (typeof bufferValue !== "object" || bufferValue === null) return;
    const uri = (bufferValue as unknown as JsonRecord).uri;
    if (typeof uri !== "string") return;
    if (inspectBufferDataUri(uri, limits.maxDecodedBytes) !== undefined) return;
    if (format === "glb" || REMOTE_URI_PATTERN.test(uri)) {
      return gltfDecodeFailure(
        "bundle",
        "remote-buffer-uri",
        "Geometry buffer URIs must resolve to selected local glTF files.",
      );
    }
    const path = [...rootDirectory, ...normalizeLocalBufferUri(uri)].join("/");
    const source = snapshot.filesByPath.get(path);
    if (!source) {
      return gltfDecodeFailure(
        "bundle",
        "missing-buffer-file",
        `Selected source file ${path} is required by buffer URI ${uri}.`,
      );
    }
    resources[uri] = source.bytes;
    usedPaths.add(path);
  });
  const missingImages: GltfMissingImage[] = [];
  const images = Array.isArray(json.images) ? json.images : [];
  images.forEach((imageValue, index) => {
    gltfDecodeCheckpoint(signal, buffers.length + index);
    if (typeof imageValue !== "object" || imageValue === null) return;
    const image = imageValue as unknown as JsonRecord;
    const uri = image.uri;
    if (typeof uri !== "string") return;
    const embedded = decodeGltfImageDataUri(uri, limits.maxTextureBytes);
    if (embedded) {
      resources[uri] = embedded.bytes;
      image.mimeType ??= embedded.mimeType;
      return;
    }
    if (REMOTE_URI_PATTERN.test(uri)) {
      missingImages.push({ imageIndex: index, reason: "remote-uri", uri });
      return;
    }
    const path = [...rootDirectory, ...normalizeLocalBufferUri(uri)].join("/");
    const source = snapshot.filesByPath.get(path);
    if (!source) {
      missingImages.push({
        imageIndex: index,
        reason: "missing-local-file",
        uri,
      });
      return;
    }
    resources[uri] = source.bytes;
    usedPaths.add(path);
  });
  const missingTextures: GltfMissingTexture[] = [];
  const textures = Array.isArray(json.textures) ? json.textures : [];
  textures.forEach((textureValue, index) => {
    gltfDecodeCheckpoint(signal, buffers.length + images.length + index);
    if (typeof textureValue !== "object" || textureValue === null) return;
    const texture = textureValue as unknown as JsonRecord;
    if (texture.source !== undefined) return;
    missingTextures.push({
      reason: "unsupported-image-source",
      textureIndex: index,
      uri: `texture:${index}`,
    });
  });
  const missingAppearanceBindings = removeMissingGltfAppearance(
    json,
    missingImages,
    missingTextures,
    signal,
  );
  const unexpected = snapshot.files.find(
    (file) =>
      !usedPaths.has(file.path) &&
      !isToolcraftModelAppearanceSidecarPath(file.path),
  );
  if (unexpected) {
    return gltfDecodeFailure(
      "bundle",
      "unexpected-source-file",
      `Selected source file ${unexpected.path} is not an exact glTF dependency.`,
    );
  }
  return Object.freeze({
    missingAppearanceBindings,
    resources,
  });
}

export function prepareGltfSourceDocument(
  snapshot: GltfSourceSnapshot,
  format: Extract<ToolcraftModelFormat, "glb" | "gltf">,
  supportedExtensions: ReadonlySet<string>,
  limits: ToolcraftModelImportLimits,
  signal: AbortSignal,
): PreparedGltfSourceDocument {
  const extracted =
    format === "glb"
      ? extractGlbDocument(snapshot.root.bytes, signal)
      : { jsonBytes: snapshot.root.bytes, resources: undefined };
  const parsed = parseRootJson(
    extracted.jsonBytes,
    snapshot.sourceWorkerBytes,
    limits.maxEstimatedWorkerBytes,
    signal,
  );
  const features = validateAndSanitizeGltfJson(
    parsed.json,
    supportedExtensions,
    signal,
  );
  const mapped = mapGltfResources(
    parsed.json,
    snapshot,
    format,
    extracted.resources,
    limits,
    signal,
  );
  const preflight = preflightGltfJsonDocument(
    parsed.json,
    mapped.resources,
    parsed.workerBytes,
    limits,
    signal,
  );
  return Object.freeze({
    decodedCountExpectations: Object.freeze(preflight.decodedCountExpectations),
    features,
    jsonDocument: { json: parsed.json, resources: mapped.resources },
    missingAppearanceBindings: mapped.missingAppearanceBindings,
    retainedWorkerBytes: preflight.retainedWorkerBytes,
  });
}
