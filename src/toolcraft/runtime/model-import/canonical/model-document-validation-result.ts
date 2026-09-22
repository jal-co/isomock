export type ToolcraftModelDocumentValidationFailureCode =
  | "accessor-property"
  | "document-bounds-mismatch"
  | "duplicate-canonicalization-operation"
  | "duplicate-child"
  | "duplicate-id"
  | "duplicate-primitive-reference"
  | "duplicate-repair-operation"
  | "duplicate-root"
  | "duplicate-texture-coordinate-set"
  | "empty-document-primitives"
  | "empty-id"
  | "empty-node-hierarchy"
  | "empty-primitive"
  | "estimated-worker-memory-limit-exceeded"
  | "hierarchy-cycle"
  | "index-out-of-range"
  | "input-access-failed"
  | "invalid-limit-options"
  | "invalid-adapter-version"
  | "invalid-bound"
  | "invalid-canonical-schema-version"
  | "invalid-canonicalization-operation"
  | "invalid-canonicalization-operations"
  | "invalid-document"
  | "invalid-material"
  | "invalid-material-factor"
  | "invalid-materials"
  | "invalid-indices-type"
  | "invalid-node"
  | "invalid-node-children"
  | "invalid-node-matrix"
  | "invalid-node-name"
  | "invalid-node-primitive-ids"
  | "invalid-nodes"
  | "invalid-normals-type"
  | "invalid-position-cardinality"
  | "invalid-positions-type"
  | "invalid-primitive"
  | "invalid-primitives"
  | "invalid-repair-operation"
  | "invalid-repair-provenance"
  | "invalid-root-node-ids"
  | "invalid-source-format"
  | "invalid-triangle-cardinality"
  | "invalid-texture"
  | "invalid-texture-coordinates"
  | "invalid-texture-resource-ref"
  | "invalid-texture-sampler"
  | "invalid-textures"
  | "invalid-vertex-colors"
  | "color-count-mismatch"
  | "max-nodes-exceeded"
  | "max-primitives-exceeded"
  | "max-references-exceeded"
  | "max-triangles-exceeded"
  | "max-texture-dimension-exceeded"
  | "max-texture-pixels-exceeded"
  | "max-textures-exceeded"
  | "max-vertices-exceeded"
  | "missing-node-reference"
  | "missing-primitive-reference"
  | "missing-root"
  | "missing-material-reference"
  | "missing-texture-reference"
  | "multiple-parents"
  | "no-renderable-triangle"
  | "non-finite-bound"
  | "non-finite-node-matrix"
  | "non-finite-normal"
  | "non-finite-position"
  | "non-finite-appearance-value"
  | "normal-count-mismatch"
  | "primitive-bounds-mismatch"
  | "root-has-parent"
  | "shared-array-buffer-geometry"
  | "string-limit-exceeded"
  | "texture-coordinate-count-mismatch"
  | "unsupported-texture-mime"
  | "unordered-bound"
  | "unreachable-node"
  | "unreferenced-primitive"
  | "unsupported-document-version";

export type ToolcraftModelDocumentValidationFailure = {
  code: ToolcraftModelDocumentValidationFailureCode;
  message: string;
  ok: false;
  path: string;
};

export type ToolcraftModelDocumentValidationResult =
  | { ok: true }
  | ToolcraftModelDocumentValidationFailure;

export const VALID_TOOLCRAFT_MODEL_DOCUMENT = Object.freeze({
  ok: true,
} as const);

export function modelDocumentFailure(
  code: ToolcraftModelDocumentValidationFailureCode,
  path: string,
  message: string,
): ToolcraftModelDocumentValidationFailure {
  return { code, message, ok: false, path };
}

export class ToolcraftModelDocumentValidationError extends Error {
  readonly code: ToolcraftModelDocumentValidationFailureCode;
  readonly path: string;

  constructor(failure: ToolcraftModelDocumentValidationFailure) {
    super(`[model-document:${failure.code}] ${failure.message}`);
    this.name = "ToolcraftModelDocumentValidationError";
    this.code = failure.code;
    this.path = failure.path;
  }
}
