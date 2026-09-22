export type ToolcraftModelDocumentCodecFailureCode =
  | "bad-magic"
  | "duplicate-section"
  | "encoded-size-limit-exceeded"
  | "empty-metadata"
  | "estimated-worker-memory-limit-exceeded"
  | "invalid-header-size"
  | "invalid-input"
  | "invalid-limit-options"
  | "invalid-metadata-encoding"
  | "invalid-metadata-shape"
  | "invalid-section-byte-length"
  | "invalid-section-count"
  | "invalid-section-flags"
  | "invalid-section-order"
  | "malformed-metadata"
  | "max-nodes-exceeded"
  | "max-primitives-exceeded"
  | "max-references-exceeded"
  | "max-triangles-exceeded"
  | "max-textures-exceeded"
  | "max-vertices-exceeded"
  | "non-canonical-metadata"
  | "payload-layout-mismatch"
  | "section-length-limit-exceeded"
  | "string-limit-exceeded"
  | "trailing-data"
  | "truncated-envelope"
  | "truncated-header"
  | "unknown-section"
  | "unsafe-metadata-integer"
  | "unsafe-section-length"
  | "unsupported-codec-version";

export class ToolcraftModelDocumentCodecError extends Error {
  readonly code: ToolcraftModelDocumentCodecFailureCode;
  readonly path: string;

  constructor(
    code: ToolcraftModelDocumentCodecFailureCode,
    path: string,
    message: string,
  ) {
    super(`[model-document-codec:${code}] ${message}`);
    this.name = "ToolcraftModelDocumentCodecError";
    this.code = code;
    this.path = path;
  }
}

export function throwModelDocumentCodecError(
  code: ToolcraftModelDocumentCodecFailureCode,
  path: string,
  message: string,
): never {
  throw new ToolcraftModelDocumentCodecError(code, path, message);
}
