import {
  TOOLCRAFT_MODEL_CANONICALIZATION_OPERATIONS,
  TOOLCRAFT_MODEL_REPAIR_OPERATIONS,
  TOOLCRAFT_MODEL_SOURCE_FORMATS,
  type ToolcraftModelBounds,
  type ToolcraftModelCanonicalizationProvenance,
  type ToolcraftModelCanonicalizationProvenanceV1,
  type ToolcraftModelCanonicalizationProvenanceV2,
  type ToolcraftModelDocument,
  type ToolcraftModelDocumentV2,
} from "./model-document";
import {
  createModelDocumentAppearanceMetadata,
  readModelDocumentAppearanceMetadata,
  readPrimitiveAppearanceMetadata,
  type ModelDocumentPrimitiveAppearanceMetadata,
} from "./model-document-codec-appearance-metadata";
import type { ToolcraftCanonicalModelLimits } from "./model-document-limits";
import { throwModelDocumentCodecError } from "./model-document-codec-error";
import {
  validateModelDocumentPayloadLayout,
  type ModelDocumentPayloadByteLengths,
} from "./model-document-codec-layout";
import type { ModelDocumentCodecVersion } from "./model-document-codec-format";
import { preflightModelDocumentMetadata } from "./model-document-codec-metadata-preflight";
import {
  metadataShape,
  readBounds,
  readFixedNumberArray,
  readNumber,
  readSlice,
  readString,
  readStringArray,
  readStringLiteral,
  readStringLiteralArray,
  type ModelDocumentArraySliceMetadata,
} from "./model-document-codec-metadata-reader";
import { isRecord } from "./model-document-validation-helpers";

export type { ModelDocumentArraySliceMetadata } from "./model-document-codec-metadata-reader";

type ModelDocumentPrimitiveGeometryMetadata = Readonly<{
  bounds: ToolcraftModelBounds;
  id: string;
  indices: ModelDocumentArraySliceMetadata;
  normals: ModelDocumentArraySliceMetadata | null;
  positions: ModelDocumentArraySliceMetadata;
}>;

type ModelDocumentMetadataBase<
  Version extends 1 | 2,
  Provenance extends ToolcraftModelCanonicalizationProvenance,
  Primitive,
> = Readonly<{
  bounds: ToolcraftModelBounds;
  nodes: readonly {
    children: readonly string[];
    id: string;
    localMatrix: readonly number[];
    name: string;
    primitiveIds: readonly string[];
  }[];
  primitives: readonly Primitive[];
  provenance: Provenance;
  rootNodeIds: readonly string[];
  version: Version;
}>;

export type ModelDocumentMetadataV1 = ModelDocumentMetadataBase<
  1,
  ToolcraftModelCanonicalizationProvenanceV1,
  ModelDocumentPrimitiveGeometryMetadata
>;
export type ModelDocumentMetadataV2 = ModelDocumentMetadataBase<
  2,
  ToolcraftModelCanonicalizationProvenanceV2,
  ModelDocumentPrimitiveGeometryMetadata & ModelDocumentPrimitiveAppearanceMetadata
> & Readonly<{
  materials: ToolcraftModelDocumentV2["materials"];
  textures: ToolcraftModelDocumentV2["textures"];
}>;
export type ModelDocumentMetadata =
  | ModelDocumentMetadataV1
  | ModelDocumentMetadataV2;

function canonicalBounds(value: ToolcraftModelBounds): ToolcraftModelBounds {
  return { max: [...value.max], min: [...value.min] };
}

function canonicalProvenance(
  value: ToolcraftModelCanonicalizationProvenanceV1,
): ToolcraftModelCanonicalizationProvenanceV1;
function canonicalProvenance(
  value: ToolcraftModelCanonicalizationProvenanceV2,
): ToolcraftModelCanonicalizationProvenanceV2;
function canonicalProvenance(
  value: ToolcraftModelCanonicalizationProvenance,
): ToolcraftModelCanonicalizationProvenance {
  const clone = {
    adapterVersion: value.adapterVersion,
    canonicalSchemaVersion: value.canonicalSchemaVersion,
    operations: [...value.operations],
    ...(value.repair !== undefined
      ? {
          repair: {
            algorithmVersion: value.repair.algorithmVersion,
            operations: [...value.repair.operations],
            planDigest: value.repair.planDigest,
            recipeId: value.repair.recipeId,
          },
        }
      : {}),
    sourceFormat: value.sourceFormat,
  };
  return value.canonicalSchemaVersion === 1
    ? { ...clone, canonicalSchemaVersion: 1 }
    : { ...clone, canonicalSchemaVersion: 2 };
}

function createGeometryMetadata(
  document: ToolcraftModelDocument,
): readonly ModelDocumentPrimitiveGeometryMetadata[] {
  let indexOffset = 0;
  let normalOffset = 0;
  let positionOffset = 0;
  return document.primitives.map((primitive) => {
      const metadata = {
        bounds: canonicalBounds(primitive.bounds),
        id: primitive.id,
        indices: { count: primitive.indices.length, offset: indexOffset },
        normals:
          primitive.normals === undefined
            ? null
            : { count: primitive.normals.length, offset: normalOffset },
        positions: {
          count: primitive.positions.length,
          offset: positionOffset,
        },
      };

      indexOffset += primitive.indices.length;
      normalOffset += primitive.normals?.length ?? 0;
      positionOffset += primitive.positions.length;
      return metadata;
    });
}

function createMetadataParts(document: ToolcraftModelDocument) {
  return {
    bounds: canonicalBounds(document.bounds),
    nodes: document.nodes.map((node) => ({
      children: [...node.children],
      id: node.id,
      localMatrix: [...node.localMatrix],
      name: node.name,
      primitiveIds: [...node.primitiveIds],
    })),
    primitives: createGeometryMetadata(document),
    rootNodeIds: [...document.rootNodeIds],
  };
}

export function createModelDocumentMetadata(
  document: ToolcraftModelDocument,
): ModelDocumentMetadata {
  const parts = createMetadataParts(document);
  if (document.version === 1) {
    return {
      bounds: parts.bounds,
      nodes: parts.nodes,
      primitives: parts.primitives,
      provenance: canonicalProvenance(document.provenance),
      rootNodeIds: parts.rootNodeIds,
      version: 1,
    };
  }
  const appearance = createModelDocumentAppearanceMetadata(document);
  return {
    bounds: parts.bounds,
    materials: appearance.materials,
    nodes: parts.nodes,
    primitives: parts.primitives.map((primitive, index) => ({
      ...primitive,
      ...appearance.primitiveAppearances[index]!,
    })),
    provenance: canonicalProvenance(document.provenance),
    rootNodeIds: parts.rootNodeIds,
    textures: appearance.textures,
    version: 2,
  };
}

export function encodeModelDocumentMetadata(
  metadata: ModelDocumentMetadata,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(metadata));
}

function readProvenance(
  value: unknown,
  version: 1,
): ToolcraftModelCanonicalizationProvenanceV1;
function readProvenance(
  value: unknown,
  version: 2,
): ToolcraftModelCanonicalizationProvenanceV2;
function readProvenance(
  value: unknown,
  version: ModelDocumentCodecVersion,
): ToolcraftModelCanonicalizationProvenanceV1 | ToolcraftModelCanonicalizationProvenanceV2 {
  if (!isRecord(value)) {
    metadataShape("provenance", "provenance must be an object.");
  }
  const operations = readStringLiteralArray(
    value.operations,
    "provenance.operations",
    TOOLCRAFT_MODEL_CANONICALIZATION_OPERATIONS,
  );
  let repair: ToolcraftModelCanonicalizationProvenanceV1["repair"];

  if (value.repair !== undefined) {
    if (!isRecord(value.repair)) {
      metadataShape("provenance.repair", "provenance.repair must be an object.");
    }
    repair = {
      algorithmVersion: readString(
        value.repair.algorithmVersion,
        "provenance.repair.algorithmVersion",
      ),
      operations: readStringLiteralArray(
        value.repair.operations,
        "provenance.repair.operations",
        TOOLCRAFT_MODEL_REPAIR_OPERATIONS,
      ),
      planDigest: readString(
        value.repair.planDigest,
        "provenance.repair.planDigest",
      ),
      recipeId: readString(value.repair.recipeId, "provenance.repair.recipeId"),
    };
  }

  const canonicalSchemaVersion = readNumber(
    value.canonicalSchemaVersion,
    "provenance.canonicalSchemaVersion",
  );
  if (canonicalSchemaVersion !== version) {
    metadataShape(
      "provenance.canonicalSchemaVersion",
      "provenance.canonicalSchemaVersion must match the codec version.",
    );
  }
  const adapterVersion = readString(
    value.adapterVersion,
    "provenance.adapterVersion",
  );
  const sourceFormat = readStringLiteral(
    value.sourceFormat,
    "provenance.sourceFormat",
    TOOLCRAFT_MODEL_SOURCE_FORMATS,
  );
  return version === 1
    ? {
        adapterVersion,
        canonicalSchemaVersion: 1,
        operations,
        ...(repair !== undefined ? { repair } : {}),
        sourceFormat,
      }
    : {
        adapterVersion,
        canonicalSchemaVersion: 2,
        operations,
        ...(repair !== undefined ? { repair } : {}),
        sourceFormat,
      };
}

function readNodes(
  parsed: Record<string, unknown> & { nodes: readonly unknown[] },
) {
  return parsed.nodes.map((entry, index) => {
    const path = `nodes[${index}]`;
    if (!isRecord(entry)) {
      metadataShape(path, `${path} must be an object.`);
    }
    return {
      children: readStringArray(entry.children, `${path}.children`),
      id: readString(entry.id, `${path}.id`),
      localMatrix: readFixedNumberArray(
        entry.localMatrix,
        `${path}.localMatrix`,
        16,
      ),
      name: readString(entry.name, `${path}.name`),
      primitiveIds: readStringArray(entry.primitiveIds, `${path}.primitiveIds`),
    };
  });
}

function readGeometryPrimitive(value: unknown, index: number) {
  const path = `primitives[${index}]`;
  if (!isRecord(value)) {
    metadataShape(path, `${path} must be an object.`);
  }
  return {
    bounds: readBounds(value.bounds, `${path}.bounds`),
    id: readString(value.id, `${path}.id`),
    indices: readSlice(value.indices, `${path}.indices`),
    normals:
      value.normals === null
        ? null
        : readSlice(value.normals, `${path}.normals`),
    positions: readSlice(value.positions, `${path}.positions`),
  };
}

function readMetadata(
  parsed: Record<string, unknown> & {
    nodes: readonly unknown[];
    primitives: readonly unknown[];
  },
  codecVersion: ModelDocumentCodecVersion,
): ModelDocumentMetadata {
  const bounds = readBounds(parsed.bounds, "bounds");
  const nodes = readNodes(parsed);
  const rootNodeIds = readStringArray(parsed.rootNodeIds, "rootNodeIds");
  const version = readNumber(parsed.version, "version");
  if (version !== codecVersion) {
    metadataShape("version", "metadata version must match the codec version.");
  }
  if (codecVersion === 1) {
    return {
      bounds,
      nodes,
      primitives: parsed.primitives.map(readGeometryPrimitive),
      provenance: readProvenance(parsed.provenance, 1),
      rootNodeIds,
      version: 1,
    };
  }
  const appearance = readModelDocumentAppearanceMetadata(
    parsed.materials,
    parsed.textures,
  );
  return {
    bounds,
    materials: appearance.materials,
    nodes,
    primitives: parsed.primitives.map((primitive, index) => {
      const path = `primitives[${index}]`;
      if (!isRecord(primitive)) {
        metadataShape(path, `${path} must be an object.`);
      }
      return {
        ...readGeometryPrimitive(primitive, index),
        ...readPrimitiveAppearanceMetadata(primitive, path),
      };
    }),
    provenance: readProvenance(parsed.provenance, 2),
    rootNodeIds,
    textures: appearance.textures,
    version: 2,
  };
}

export function decodeModelDocumentMetadata(
  bytes: Uint8Array,
  sectionByteLengths: ModelDocumentPayloadByteLengths,
  limits: ToolcraftCanonicalModelLimits,
  codecVersion: ModelDocumentCodecVersion,
): ModelDocumentMetadata {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throwModelDocumentCodecError(
      "non-canonical-metadata",
      "metadata",
      "Canonical metadata must not contain a UTF-8 byte-order mark.",
    );
  }

  let source: string;
  try {
    source = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
  } catch {
    throwModelDocumentCodecError(
      "invalid-metadata-encoding",
      "metadata",
      "Canonical metadata is not valid UTF-8.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throwModelDocumentCodecError(
      "malformed-metadata",
      "metadata",
      "Canonical metadata is not valid JSON.",
    );
  }

  preflightModelDocumentMetadata(parsed, limits, codecVersion);

  const metadata = readMetadata(parsed, codecVersion);

  validateModelDocumentPayloadLayout(metadata, sectionByteLengths, limits);
  if (JSON.stringify(metadata) !== source) {
    throwModelDocumentCodecError(
      "non-canonical-metadata",
      "metadata",
      "Canonical metadata keys or values are not in stable encoded form.",
    );
  }

  return metadata;
}
