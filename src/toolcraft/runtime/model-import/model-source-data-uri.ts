import { failModelSourceBundle } from "./model-source-bundle-error";

const DATA_URI_PREFIXES = Object.freeze([
  "data:application/gltf-buffer;base64,",
  "data:application/octet-stream;base64,",
]);

function base64Value(code: number): number {
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 71;
  if (code >= 48 && code <= 57) return code + 4;
  if (code === 43) return 62;
  if (code === 47) return 63;
  return -1;
}

function invalidDataUri(): never {
  return failModelSourceBundle(
    "format",
    "invalid-buffer-data-uri",
    "Embedded glTF buffers must use valid base64 application/octet-stream or application/gltf-buffer data URIs.",
  );
}

export function inspectBufferDataUri(
  uri: string,
  maxDecodedByteLength: number,
): number | undefined {
  if (uri.slice(0, 5).toLowerCase() !== "data:") return undefined;

  const lowerUri = uri.toLowerCase();
  const prefix = DATA_URI_PREFIXES.find((candidate) =>
    lowerUri.startsWith(candidate),
  );
  if (!prefix) return invalidDataUri();

  const payloadOffset = prefix.length;
  const payloadLength = uri.length - payloadOffset;
  if (payloadLength === 0 || payloadLength % 4 !== 0) return invalidDataUri();

  const lastCode = uri.charCodeAt(uri.length - 1);
  const previousCode = uri.charCodeAt(uri.length - 2);
  const padding = lastCode === 61 ? (previousCode === 61 ? 2 : 1) : 0;
  const contentLength = payloadLength - padding;
  const decodedByteLength = (payloadLength / 4) * 3 - padding;
  if (decodedByteLength > maxDecodedByteLength) {
    return failModelSourceBundle(
      "resource-limit",
      "decoded-byte-limit-exceeded",
      `The embedded glTF buffer exceeds the remaining ${maxDecodedByteLength}-byte decoded limit.`,
    );
  }
  for (let index = 0; index < payloadLength; index += 1) {
    const code = uri.charCodeAt(payloadOffset + index);
    const inPadding = index >= contentLength;
    if ((inPadding && code !== 61) || (!inPadding && base64Value(code) < 0)) {
      return invalidDataUri();
    }
  }

  if (padding === 2) {
    const finalValue = base64Value(
      uri.charCodeAt(payloadOffset + contentLength - 1),
    );
    if ((finalValue & 0x0f) !== 0) return invalidDataUri();
  } else if (padding === 1) {
    const finalValue = base64Value(
      uri.charCodeAt(payloadOffset + contentLength - 1),
    );
    if ((finalValue & 0x03) !== 0) return invalidDataUri();
  }

  return decodedByteLength;
}
