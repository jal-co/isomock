import {
  checkedSourceByteTotal,
  type ModelSourceBundleLimits,
} from "./model-source-bundle-limits";
import { failModelSourceBundle } from "./model-source-bundle-error";
import { inspectBufferDataUri } from "./model-source-data-uri";
import { preflightAndParseGltfJson } from "./model-source-json-preflight";
import {
  createModelSourceDependencyResolver,
  type ModelSourceLookupObserver,
} from "./model-source-lookup";
import {
  normalizeLocalBufferUri,
  type ModelSourceFileSnapshot,
} from "./model-source-path";

export type ModelSourceGltfInspection = Readonly<{
  decodedByteLength: number;
  dependencies: readonly ModelSourceFileSnapshot[];
}>;

const REMOTE_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/iu;
const DRIVE_PATH_PATTERN = /^[a-z]:\//iu;

function parseGltfJson(
  bytes: Uint8Array,
  maxEstimatedWorkerBytes: number,
): Record<string, unknown> {
  const value = preflightAndParseGltfJson(bytes, maxEstimatedWorkerBytes).value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return failModelSourceBundle(
      "format",
      "malformed-gltf-json",
      "The glTF root must contain a JSON object.",
    );
  }
  return value as Record<string, unknown>;
}

function bufferRecords(document: Record<string, unknown>): readonly unknown[] {
  const buffers = document.buffers;
  if (buffers === undefined) return [];
  if (!Array.isArray(buffers)) {
    return failModelSourceBundle(
      "format",
      "invalid-gltf-buffers",
      "The glTF buffers member must be an array.",
    );
  }
  return buffers;
}

function inspectBufferRecord(
  value: unknown,
  index: number,
): { byteLength: number; uri: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return failModelSourceBundle(
      "format",
      "invalid-gltf-buffer",
      `glTF buffer ${index} must be an object.`,
    );
  }
  const record = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(record.byteLength) ||
    (record.byteLength as number) <= 0
  ) {
    return failModelSourceBundle(
      "format",
      "invalid-gltf-buffer",
      `glTF buffer ${index} must declare a positive safe byteLength.`,
    );
  }
  if (typeof record.uri !== "string" || record.uri.length === 0) {
    return failModelSourceBundle(
      "bundle",
      "missing-buffer-uri",
      `glTF buffer ${index} must identify a selected local file or base64 data URI.`,
    );
  }
  return { byteLength: record.byteLength as number, uri: record.uri };
}

function rejectRemoteBufferUri(): never {
  return failModelSourceBundle(
    "bundle",
    "remote-buffer-uri",
    "Remote, blob, and file geometry buffer resources are not allowed.",
  );
}

export function inspectGltfSourceBuffers(
  root: ModelSourceFileSnapshot,
  rootBytes: Uint8Array,
  files: readonly ModelSourceFileSnapshot[],
  limits: Pick<
    ModelSourceBundleLimits,
    "maxBundleFiles" | "maxDecodedBytes" | "maxEstimatedWorkerBytes"
  >,
  lookupObserver?: ModelSourceLookupObserver,
): ModelSourceGltfInspection {
  let decodedByteLength = checkedSourceByteTotal(
    0,
    root.size,
    limits.maxDecodedBytes,
    "decoded-byte-limit-exceeded",
  );
  const document = parseGltfJson(rootBytes, limits.maxEstimatedWorkerBytes);
  const dependencies = new Map<string, ModelSourceFileSnapshot>();
  const dependenciesByRawUri = new Map<string, ModelSourceFileSnapshot>();
  let dependencyResolver:
    | ReturnType<typeof createModelSourceDependencyResolver>
    | undefined;

  const buffers = bufferRecords(document);
  for (let index = 0; index < buffers.length; index += 1) {
    const buffer = inspectBufferRecord(buffers[index], index);
    const remainingDecodedBytes = limits.maxDecodedBytes - decodedByteLength;
    if (buffer.byteLength > remainingDecodedBytes) {
      checkedSourceByteTotal(
        decodedByteLength,
        buffer.byteLength,
        limits.maxDecodedBytes,
        "decoded-byte-limit-exceeded",
      );
    }
    const dataByteLength = inspectBufferDataUri(
      buffer.uri,
      remainingDecodedBytes,
    );
    if (dataByteLength !== undefined) {
      decodedByteLength = checkedSourceByteTotal(
        decodedByteLength,
        Math.max(buffer.byteLength, dataByteLength),
        limits.maxDecodedBytes,
        "decoded-byte-limit-exceeded",
      );
      continue;
    }

    let dependency = dependenciesByRawUri.get(buffer.uri);
    if (!dependency) {
      if (buffer.uri.startsWith("//")) return rejectRemoteBufferUri();
      if (DRIVE_PATH_PATTERN.test(buffer.uri)) {
        normalizeLocalBufferUri(buffer.uri);
      }
      if (REMOTE_SCHEME_PATTERN.test(buffer.uri)) {
        return rejectRemoteBufferUri();
      }

      const uriSegments = normalizeLocalBufferUri(buffer.uri);
      dependencyResolver ??= createModelSourceDependencyResolver(
        root,
        files,
        lookupObserver,
      );
      dependency = dependencyResolver.resolve(uriSegments);
      dependenciesByRawUri.set(buffer.uri, dependency);
    }
    if (
      !dependencies.has(dependency.path) &&
      dependencies.size + 1 >= limits.maxBundleFiles
    ) {
      return failModelSourceBundle(
        "resource-limit",
        "bundle-file-limit-exceeded",
        "The model requires too many geometry source files.",
      );
    }
    dependencies.set(dependency.path, dependency);
    decodedByteLength = checkedSourceByteTotal(
      decodedByteLength,
      Math.max(buffer.byteLength, dependency.size),
      limits.maxDecodedBytes,
      "decoded-byte-limit-exceeded",
    );
  }

  return Object.freeze({
    decodedByteLength,
    dependencies: Object.freeze([...dependencies.values()]),
  });
}
