import { bytesToHex, sha256 } from "../model-import/canonical/sha256";

export type ToolcraftBinaryMediaKind = "file" | "image";

export function createToolcraftMediaResourceRef(
  kind: ToolcraftBinaryMediaKind,
  bytes: Uint8Array,
): string {
  return `media:${kind}:sha256:${bytesToHex(sha256(bytes))}`;
}

export function decodeToolcraftDataUrl(dataUrl: string): Uint8Array {
  const separator = dataUrl.indexOf(",");

  if (!dataUrl.startsWith("data:") || separator < 0) {
    throw new Error("Binary media source must be a valid data URL.");
  }

  const metadata = dataUrl.slice(5, separator);
  const encoded = dataUrl.slice(separator + 1);

  if (metadata.split(";").includes("base64")) {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }

  return new TextEncoder().encode(decodeURIComponent(encoded));
}

export function createToolcraftDataUrlResourceRef(
  kind: ToolcraftBinaryMediaKind,
  dataUrl: string,
): string {
  let bytes: Uint8Array;

  try {
    bytes = decodeToolcraftDataUrl(dataUrl);
  } catch {
    bytes = new TextEncoder().encode(dataUrl);
  }

  return createToolcraftMediaResourceRef(kind, bytes);
}
