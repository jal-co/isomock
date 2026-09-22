import type { GLTF } from "@gltf-transform/core";

import type { GltfFeatureInventory } from "./gltf-canonical-metadata";
import {
  gltfDecodeCheckpoint,
  gltfDecodeFailure,
} from "./gltf-decode-safety";
import {
  isGltfAppearanceExtension,
  isGltfIgnoredBehaviorExtension,
  isGltfPreservedSemanticExtension,
  isGltfRequiredExtensionAllowed,
  mustGltfExtensionBeRequired,
} from "./gltf-extension-policy";

type JsonRecord = Record<string, unknown>;

type ExtensionState = Readonly<{
  required: readonly string[];
  used: readonly string[];
}>;

function extensionNames(
  value: unknown,
  label: string,
  signal: AbortSignal,
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    return gltfDecodeFailure(
      "format",
      "invalid-gltf-extensions",
      `${label} must contain extension-name strings.`,
    );
  }
  const names: string[] = [];
  const unique = new Set<string>();
  value.forEach((name, index) => {
    gltfDecodeCheckpoint(signal, index);
    if (typeof name !== "string" || name.length === 0 || unique.has(name)) {
      return gltfDecodeFailure(
        "format",
        "invalid-gltf-extensions",
        `${label} must contain unique extension-name strings.`,
      );
    }
    names.push(name);
    unique.add(name);
  });
  return names;
}

function validateDocumentStructure(
  json: GLTF.IGLTF,
  registeredExtensions: ReadonlySet<string>,
  signal: AbortSignal,
): ExtensionState {
  const asset = json.asset;
  if (
    typeof asset !== "object" ||
    asset === null ||
    Array.isArray(asset) ||
    (asset as unknown as JsonRecord).version !== "2.0"
  ) {
    return gltfDecodeFailure(
      "format",
      "unsupported-gltf-version",
      "Only glTF 2.0 documents are supported.",
    );
  }
  const used = extensionNames(json.extensionsUsed, "extensionsUsed", signal);
  const required = extensionNames(
    json.extensionsRequired,
    "extensionsRequired",
    signal,
  );
  const usedSet = new Set(used);
  required.forEach((name, index) => {
    gltfDecodeCheckpoint(signal, index);
    if (
      !registeredExtensions.has(name) ||
      !isGltfRequiredExtensionAllowed(name)
    ) {
      return gltfDecodeFailure(
        "format",
        "unsupported-required-extension",
        `Required glTF extension ${name} is not supported by canonical static model import.`,
      );
    }
    if (!usedSet.has(name)) {
      return gltfDecodeFailure(
        "format",
        "invalid-gltf-extensions",
        `Required glTF extension ${name} is absent from extensionsUsed.`,
      );
    }
  });
  const requiredSet = new Set(required);
  used.forEach((name, index) => {
    gltfDecodeCheckpoint(signal, required.length + index);
    if (mustGltfExtensionBeRequired(name) && !requiredSet.has(name)) {
      return gltfDecodeFailure(
        "format",
        "invalid-gltf-extensions",
        `glTF extension ${name} must be listed in extensionsRequired when used.`,
      );
    }
  });
  return { required, used };
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function stripIgnoredExtensionObjects(
  root: JsonRecord,
  signal: AbortSignal,
): ReadonlyMap<string, number> {
  const stack: unknown[] = [root];
  const occurrences = new Map<string, number>();
  let visited = 0;
  while (stack.length > 0) {
    gltfDecodeCheckpoint(signal, visited);
    visited += 1;
    const value = stack.pop();
    if (typeof value !== "object" || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) stack.push(item);
      continue;
    }
    const record = value as JsonRecord;
    const extensions = record.extensions;
    if (
      typeof extensions === "object" &&
      extensions !== null &&
      !Array.isArray(extensions)
    ) {
      for (const name of Object.keys(extensions)) {
        occurrences.set(name, (occurrences.get(name) ?? 0) + 1);
        if (!isGltfPreservedSemanticExtension(name)) {
          delete (extensions as JsonRecord)[name];
        }
      }
      if (Object.keys(extensions).length === 0) delete record.extensions;
    }
    for (const key in record) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        stack.push(record[key]);
      }
    }
  }
  return occurrences;
}

function countNodeCameraBindings(json: GLTF.IGLTF): number {
  if (!Array.isArray(json.nodes)) return 0;
  let bindings = 0;
  for (const node of json.nodes) {
    if (typeof node === "object" && node !== null && node.camera !== undefined) {
      bindings += 1;
    }
  }
  return bindings;
}

function sanitizeIgnoredFeatures(
  json: GLTF.IGLTF,
  extensionState: ExtensionState,
  signal: AbortSignal,
): GltfFeatureInventory {
  const meshes = Array.isArray(json.meshes) ? json.meshes : [];
  let morphTargets = 0;
  let visited = 0;
  for (const meshValue of meshes) {
    gltfDecodeCheckpoint(signal, visited);
    visited += 1;
    if (typeof meshValue !== "object" || meshValue === null) continue;
    const mesh = meshValue as unknown as JsonRecord;
    delete mesh.weights;
    if (!Array.isArray(mesh.primitives)) continue;
    for (const primitiveValue of mesh.primitives) {
      gltfDecodeCheckpoint(signal, visited);
      visited += 1;
      if (typeof primitiveValue !== "object" || primitiveValue === null) continue;
      const primitive = primitiveValue as JsonRecord;
      morphTargets += countArray(primitive.targets);
      delete primitive.targets;
      const attributes = primitive.attributes;
      if (typeof attributes === "object" && attributes !== null) {
        for (const semantic in attributes) {
          if (!Object.prototype.hasOwnProperty.call(attributes, semantic)) continue;
          if (/^(?:JOINTS|WEIGHTS)_\d+$/u.test(semantic)) {
            delete (attributes as JsonRecord)[semantic];
          }
        }
      }
    }
  }
  const cameraBindings = countNodeCameraBindings(json);
  if (Array.isArray(json.nodes)) {
    json.nodes.forEach((nodeValue, index) => {
      gltfDecodeCheckpoint(signal, index);
      if (typeof nodeValue !== "object" || nodeValue === null) return;
      const node = nodeValue as unknown as JsonRecord;
      delete node.camera;
      delete node.skin;
      delete node.weights;
    });
  }
  const extensionOccurrences = stripIgnoredExtensionObjects(
    json as unknown as JsonRecord,
    signal,
  );
  const appearanceExtensionNames = new Set(
    [...extensionState.used, ...extensionOccurrences.keys()].filter(
      isGltfAppearanceExtension,
    ),
  );
  const optionalExtensions = new Set(
    [...extensionState.used, ...extensionOccurrences.keys()].filter(
      (name) =>
        !isGltfPreservedSemanticExtension(name) &&
        !isGltfAppearanceExtension(name) &&
        !isGltfIgnoredBehaviorExtension(name),
    ),
  );
  const features = Object.freeze({
    animationClips: countArray(json.animations),
    cameras: countArray(json.cameras) || cameraBindings,
    ignoredAppearanceExtensions: appearanceExtensionNames.size,
    morphTargets,
    nodeVisibility:
      extensionOccurrences.get("KHR_node_visibility") ??
      (extensionState.used.includes("KHR_node_visibility") ? 1 : 0),
    optionalExtensions: optionalExtensions.size,
    skins: countArray(json.skins),
  });
  delete json.animations;
  delete json.cameras;
  delete json.skins;
  const preservedUsed = extensionState.used.filter(
    isGltfPreservedSemanticExtension,
  );
  const preservedRequired = extensionState.required.filter(
    isGltfPreservedSemanticExtension,
  );
  if (preservedUsed.length > 0) json.extensionsUsed = preservedUsed;
  else delete json.extensionsUsed;
  if (preservedRequired.length > 0) {
    json.extensionsRequired = preservedRequired;
  } else {
    delete json.extensionsRequired;
  }
  return features;
}

export function validateAndSanitizeGltfJson(
  json: GLTF.IGLTF,
  registeredExtensions: ReadonlySet<string>,
  signal: AbortSignal,
): GltfFeatureInventory {
  const extensionState = validateDocumentStructure(
    json,
    registeredExtensions,
    signal,
  );
  return sanitizeIgnoredFeatures(json, extensionState, signal);
}
