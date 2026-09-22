import { createToolcraftModelAppearanceResourceRef } from "./model-appearance-resource";
import { bytesToHex, sha256 } from "./sha256";
import type { ToolcraftModelAppearanceResource } from "../model-import-types";

export type ToolcraftModelAppearanceImageDimensions = Readonly<{
  height: number;
  mimeType: "image/jpeg" | "image/png";
  width: number;
}>;

export type ToolcraftModelAppearanceImageResource =
  ToolcraftModelAppearanceImageDimensions & Readonly<{
    contentDigest: string;
    resource: ToolcraftModelAppearanceResource;
    resourceRef: string;
  }>;

function pngDimensions(
  bytes: Uint8Array,
): ToolcraftModelAppearanceImageDimensions | undefined {
  if (
    bytes.byteLength < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[12] !== 0x49 ||
    bytes[13] !== 0x48 ||
    bytes[14] !== 0x44 ||
    bytes[15] !== 0x52
  ) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    height: view.getUint32(20, false),
    mimeType: "image/png",
    width: view.getUint32(16, false),
  };
}

function jpegDimensions(
  bytes: Uint8Array,
): ToolcraftModelAppearanceImageDimensions | undefined {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return undefined;
  }
  let offset = 2;
  while (offset < bytes.byteLength) {
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.byteLength) return undefined;
    const marker = bytes[offset++]!;
    if (marker === 0xd9 || marker === 0xda) return undefined;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset > bytes.byteLength - 2) return undefined;
    const length = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (length < 2 || offset > bytes.byteLength - length) return undefined;
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame) {
      if (length < 7) return undefined;
      return {
        height: (bytes[offset + 3]! << 8) | bytes[offset + 4]!,
        mimeType: "image/jpeg",
        width: (bytes[offset + 5]! << 8) | bytes[offset + 6]!,
      };
    }
    offset += length;
  }
  return undefined;
}

export function inspectToolcraftModelAppearanceImage(
  bytes: Uint8Array,
  declaredMimeType?: string,
): ToolcraftModelAppearanceImageDimensions | undefined {
  const dimensions = pngDimensions(bytes) ?? jpegDimensions(bytes);
  if (
    !dimensions ||
    (declaredMimeType !== undefined &&
      declaredMimeType !== "" &&
      declaredMimeType !== dimensions.mimeType) ||
    dimensions.width <= 0 ||
    dimensions.height <= 0
  ) return undefined;
  return dimensions;
}

export function createToolcraftModelAppearanceImageResource(
  source: Uint8Array,
  declaredMimeType?: string,
): ToolcraftModelAppearanceImageResource | undefined {
  const dimensions = inspectToolcraftModelAppearanceImage(
    source,
    declaredMimeType,
  );
  if (!dimensions) return undefined;
  const bytes = source.slice();
  const contentDigest = `sha256:${bytesToHex(sha256(bytes))}`;
  const resourceRef = createToolcraftModelAppearanceResourceRef(contentDigest);
  return {
    ...dimensions,
    contentDigest,
    resource: Object.freeze({
      bytes: bytes.buffer,
      contentDigest,
      mimeType: dimensions.mimeType,
      resourceRef,
    }),
    resourceRef,
  };
}
