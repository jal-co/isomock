import type { ToolcraftBinaryAssetPutOptions } from "../source-assets/repository/binary-asset-repository";
import type { ToolcraftModelSourceBundle } from "./model-import-types";
import { failModelSourceBundle } from "./model-source-bundle-error";
import {
  snapshotModelSourceBundleDescriptorLimits,
  validateToolcraftModelSourceBundleDescriptor,
  type ToolcraftModelSourceBundleDescriptorLimits,
} from "./model-source-bundle-descriptor-validation";

export const TOOLCRAFT_MODEL_SOURCE_BUNDLE_DESCRIPTOR_CONTENT_TYPE =
  "application/vnd.toolcraft.model-source-bundle.v2+json";
export const TOOLCRAFT_MODEL_SOURCE_BUNDLE_DESCRIPTOR_MAX_BYTES = 1_048_576;

export type ToolcraftModelSourceBundleDescriptorCodecOptions = Readonly<{
  limits?: Partial<ToolcraftModelSourceBundleDescriptorLimits>;
  maxByteLength?: number;
}>;

export type ToolcraftModelSourceBundleDescriptorResource = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  sourceBundleRef: string;
  stageOptions: Readonly<ToolcraftBinaryAssetPutOptions>;
}>;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
)?.get;
const typedArrayPrototype = Object.getPrototypeOf(
  Uint8Array.prototype,
) as object;
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "buffer",
)?.get;
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteLength",
)?.get;
const typedArrayByteOffsetGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteOffset",
)?.get;
const typedArrayTagGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  Symbol.toStringTag,
)?.get;

function invalid(message: string): never {
  return failModelSourceBundle(
    "bundle",
    "source-bundle-descriptor-invalid",
    message,
  );
}

function limitExceeded(message: string): never {
  return failModelSourceBundle(
    "resource-limit",
    "source-bundle-descriptor-limit-exceeded",
    message,
  );
}

function maximumByteLength(value: number | undefined): number {
  const maximum = value ?? TOOLCRAFT_MODEL_SOURCE_BUNDLE_DESCRIPTOR_MAX_BYTES;
  if (
    !Number.isSafeInteger(maximum) ||
    maximum <= 0 ||
    maximum > TOOLCRAFT_MODEL_SOURCE_BUNDLE_DESCRIPTOR_MAX_BYTES
  ) {
    return invalid("Model source bundle descriptor byte limit is invalid.");
  }
  return maximum;
}

function descriptorBytes(value: ArrayBuffer | Uint8Array): Uint8Array {
  if (
    typedArrayBufferGetter &&
    typedArrayByteLengthGetter &&
    typedArrayByteOffsetGetter &&
    typedArrayTagGetter
  ) {
    try {
      if (Reflect.apply(typedArrayTagGetter, value, []) === "Uint8Array") {
        const buffer = Reflect.apply(
          typedArrayBufferGetter,
          value,
          [],
        ) as ArrayBuffer;
        const byteOffset = Reflect.apply(
          typedArrayByteOffsetGetter,
          value,
          [],
        ) as number;
        const byteLength = Reflect.apply(
          typedArrayByteLengthGetter,
          value,
          [],
        ) as number;
        return new Uint8Array(buffer, byteOffset, byteLength);
      }
    } catch {
      return invalid("Model source bundle descriptor bytes are invalid.");
    }
  }
  if (arrayBufferByteLengthGetter) {
    try {
      Reflect.apply(arrayBufferByteLengthGetter, value, []);
      return new Uint8Array(value as ArrayBuffer);
    } catch {
      // Continue to the typed failure below.
    }
  }
  try {
    if (value instanceof Uint8Array) return new Uint8Array(value);
  } catch {
    return invalid("Model source bundle descriptor bytes are invalid.");
  }
  return invalid("Model source bundle descriptor must be encoded bytes.");
}

function canonicalPayload(bundle: ToolcraftModelSourceBundle): unknown {
  return {
    adapter: {
      adapterVersion: bundle.adapter.adapterVersion,
      format: bundle.adapter.format,
      rootExtension: bundle.adapter.rootExtension,
    },
    aggregateByteLength: bundle.aggregateByteLength,
    aggregateDigest: bundle.aggregateDigest,
    descriptorVersion: bundle.descriptorVersion,
    diagnostics: bundle.diagnostics.map((diagnostic) => ({
      affectedCount: diagnostic.affectedCount,
      code: diagnostic.code,
      explanation: diagnostic.explanation,
      severity: diagnostic.severity,
    })),
    packageSource:
      bundle.packageSource.kind === "selected-files"
        ? { kind: "selected-files" }
        : {
            archive: {
              byteLength: bundle.packageSource.archive.byteLength,
              contentDigest: bundle.packageSource.archive.contentDigest,
              displayName: bundle.packageSource.archive.displayName,
              mimeType: bundle.packageSource.archive.mimeType,
              resourceRef: bundle.packageSource.archive.resourceRef,
            },
            entries: bundle.packageSource.entries.map((entry) => ({
              byteLength: entry.byteLength,
              contentDigest: entry.contentDigest,
              mimeType: entry.mimeType,
              path: entry.path,
            })),
            kind: "zip",
          },
    rootPath: bundle.rootPath,
    sourceFiles: bundle.sourceFiles.map((file) => ({
      byteLength: file.byteLength,
      contentDigest: file.contentDigest,
      displayName: file.displayName,
      mimeType: file.mimeType,
      path: file.path,
      resourceRef: file.resourceRef,
    })),
  };
}

function encodeValidated(
  bundle: ToolcraftModelSourceBundle,
  maximum: number,
): Uint8Array<ArrayBuffer> {
  const bytes = encoder.encode(JSON.stringify(canonicalPayload(bundle)));
  if (bytes.byteLength > maximum) {
    return limitExceeded(
      "Model source bundle descriptor exceeds its encoded byte limit.",
    );
  }
  return bytes;
}

function validatedBundle(
  value: unknown,
  options: ToolcraftModelSourceBundleDescriptorCodecOptions,
): ToolcraftModelSourceBundle {
  return validateToolcraftModelSourceBundleDescriptor(
    value,
    snapshotModelSourceBundleDescriptorLimits(options.limits),
  );
}

export function encodeToolcraftModelSourceBundleDescriptor(
  bundle: ToolcraftModelSourceBundle,
  options: ToolcraftModelSourceBundleDescriptorCodecOptions = {},
): Uint8Array<ArrayBuffer> {
  const maximum = maximumByteLength(options.maxByteLength);
  return encodeValidated(
    validatedBundle(canonicalPayload(bundle), options),
    maximum,
  );
}

export function decodeToolcraftModelSourceBundleDescriptor(
  value: ArrayBuffer | Uint8Array,
  options: ToolcraftModelSourceBundleDescriptorCodecOptions = {},
): ToolcraftModelSourceBundle {
  const maximum = maximumByteLength(options.maxByteLength);
  const bytes = descriptorBytes(value);
  if (bytes.byteLength === 0 || bytes.byteLength > maximum) {
    return limitExceeded(
      "Model source bundle descriptor exceeds its encoded byte limit.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes));
  } catch {
    return invalid("Model source bundle descriptor is not strict UTF-8 JSON.");
  }
  return validatedBundle(parsed, options);
}

export function createToolcraftModelSourceBundleDescriptorResource(
  bundle: ToolcraftModelSourceBundle,
  options: ToolcraftModelSourceBundleDescriptorCodecOptions = {},
): ToolcraftModelSourceBundleDescriptorResource {
  const validated = validatedBundle(canonicalPayload(bundle), options);
  const bytes = encodeValidated(
    validated,
    maximumByteLength(options.maxByteLength),
  );
  const dependencies = Object.freeze(
    validated.packageSource.kind === "zip"
      ? [validated.packageSource.archive.resourceRef]
      : [
          ...new Set(
            validated.sourceFiles.map(({ resourceRef }) => resourceRef),
          ),
        ].sort(),
  );
  return Object.freeze({
    bytes,
    sourceBundleRef: `toolcraft:model-source-bundle:${validated.aggregateDigest}`,
    stageOptions: Object.freeze({
      contentType: TOOLCRAFT_MODEL_SOURCE_BUNDLE_DESCRIPTOR_CONTENT_TYPE,
      dependencies,
      durable: true,
    }),
  });
}
