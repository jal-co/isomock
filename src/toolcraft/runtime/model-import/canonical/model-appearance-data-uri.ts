export type ToolcraftModelAppearanceDataUriResult =
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "not-data" }>
  | Readonly<{ byteLength: number; kind: "too-large" }>
  | Readonly<{
      bytes: Uint8Array<ArrayBuffer>;
      kind: "decoded";
      mimeType: "image/jpeg" | "image/png";
    }>;

const IMAGE_DATA_URI =
  /^data:(image\/(?:jpeg|png));base64,([a-z0-9+/]*={0,2})$/iu;

function base64Value(code: number): number {
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 71;
  if (code >= 48 && code <= 57) return code + 4;
  if (code === 43) return 62;
  return 63;
}

function decodedLength(payload: string): number | undefined {
  if (payload.length === 0 || payload.length % 4 !== 0) return undefined;
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const contentLength = payload.length - padding;
  for (let index = 0; index < payload.length; index += 1) {
    const code = payload.charCodeAt(index);
    const valid =
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      code === 43 || code === 47 ||
      (index >= contentLength && code === 61);
    if (!valid) return undefined;
  }
  if (
    (padding === 2 &&
      (base64Value(payload.charCodeAt(payload.length - 3)) & 0x0f) !== 0) ||
    (padding === 1 &&
      (base64Value(payload.charCodeAt(payload.length - 2)) & 0x03) !== 0)
  ) return undefined;
  return (payload.length / 4) * 3 - padding;
}

function decodePayload(payload: string, byteLength: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(byteLength);
  let output = 0;
  for (let offset = 0; offset < payload.length; offset += 4) {
    const packed =
      (base64Value(payload.charCodeAt(offset)) << 18) |
      (base64Value(payload.charCodeAt(offset + 1)) << 12) |
      (base64Value(payload.charCodeAt(offset + 2)) << 6) |
      base64Value(payload.charCodeAt(offset + 3));
    if (output < byteLength) bytes[output++] = packed >>> 16;
    if (output < byteLength) bytes[output++] = packed >>> 8;
    if (output < byteLength) bytes[output++] = packed;
  }
  return bytes;
}

export function decodeToolcraftModelAppearanceDataUri(
  uri: string,
  maxBytes: number,
): ToolcraftModelAppearanceDataUriResult {
  if (!uri.slice(0, 5).toLowerCase().startsWith("data:")) {
    return { kind: "not-data" };
  }
  const match = IMAGE_DATA_URI.exec(uri);
  const mimeType = match?.[1];
  const payload = match?.[2];
  const byteLength = payload ? decodedLength(payload) : undefined;
  if (!mimeType || !payload || byteLength === undefined) return { kind: "invalid" };
  if (byteLength > maxBytes) return { byteLength, kind: "too-large" };
  return {
    bytes: decodePayload(payload, byteLength),
    kind: "decoded",
    mimeType: mimeType.toLowerCase() as "image/jpeg" | "image/png",
  };
}
