import type {
  ToolcraftModelCanonicalizationProvenance,
  ToolcraftModelDocument,
  ToolcraftModelDocumentV1,
  ToolcraftModelDocumentV2,
  ToolcraftModelNode,
  ToolcraftModelPrimitiveV1,
} from "./model-document";
import { throwModelDocumentCodecError } from "./model-document-codec-error";
import type {
  ModelDocumentEnvelope,
  ModelDocumentSectionsV1,
  ModelDocumentSectionsV2,
} from "./model-document-codec-format";
import type {
  ModelDocumentMetadata,
  ModelDocumentMetadataV1,
  ModelDocumentMetadataV2,
} from "./model-document-codec-metadata";

function encodeFloat32Values(values: readonly Float32Array[]): Uint8Array {
  const componentCount = values.reduce((total, value) => total + value.length, 0);
  const bytes = new Uint8Array(componentCount * 4);
  const view = new DataView(bytes.buffer);
  let componentOffset = 0;

  for (const value of values) {
    for (let index = 0; index < value.length; index += 1) {
      view.setFloat32(componentOffset * 4, value[index]!, true);
      componentOffset += 1;
    }
  }
  return bytes;
}

function encodeUint32Values(values: readonly Uint32Array[]): Uint8Array {
  const componentCount = values.reduce((total, value) => total + value.length, 0);
  const bytes = new Uint8Array(componentCount * 4);
  const view = new DataView(bytes.buffer);
  let componentOffset = 0;

  for (const value of values) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint32(componentOffset * 4, value[index]!, true);
      componentOffset += 1;
    }
  }
  return bytes;
}

function encodeGeometrySections(
  document: ToolcraftModelDocument,
  metadataBytes: Uint8Array,
): ModelDocumentSectionsV1 {
  return {
    1: metadataBytes,
    2: encodeFloat32Values(
      document.primitives.map((primitive) => primitive.positions),
    ),
    3: encodeFloat32Values(
      document.primitives.flatMap((primitive) =>
        primitive.normals === undefined ? [] : [primitive.normals],
      ),
    ),
    4: encodeUint32Values(
      document.primitives.map((primitive) => primitive.indices),
    ),
  };
}

export function encodeModelDocumentPayloads(
  document: ToolcraftModelDocument,
  metadataBytes: Uint8Array,
): ModelDocumentEnvelope {
  const geometry = encodeGeometrySections(document, metadataBytes);
  if (document.version === 1) {
    return { codecVersion: 1, sections: geometry };
  }
  return {
    codecVersion: 2,
    sections: {
      ...geometry,
      5: encodeFloat32Values(
        document.primitives.flatMap((primitive) =>
          (primitive.textureCoordinates ?? []).map(({ values }) => values),
        ),
      ),
      6: encodeFloat32Values(
        document.primitives.flatMap((primitive) =>
          primitive.colors === undefined ? [] : [primitive.colors.values],
        ),
      ),
    },
  };
}

function decodeFloat32Slice(
  bytes: Uint8Array,
  offset: number,
  count: number,
): Float32Array {
  const values = new Float32Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < count; index += 1) {
    values[index] = view.getFloat32((offset + index) * 4, true);
  }
  return values;
}

function decodeUint32Slice(
  bytes: Uint8Array,
  offset: number,
  count: number,
): Uint32Array {
  const values = new Uint32Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < count; index += 1) {
    values[index] = view.getUint32((offset + index) * 4, true);
  }
  return values;
}

function copyLocalMatrix(
  values: readonly number[],
): ToolcraftModelNode["localMatrix"] {
  if (values.length !== 16) {
    throwModelDocumentCodecError(
      "invalid-metadata-shape",
      "nodes.localMatrix",
      "Canonical node localMatrix must contain exactly 16 values.",
    );
  }
  return [
    values[0]!, values[1]!, values[2]!, values[3]!,
    values[4]!, values[5]!, values[6]!, values[7]!,
    values[8]!, values[9]!, values[10]!, values[11]!,
    values[12]!, values[13]!, values[14]!, values[15]!,
  ];
}

function decodeNodes(metadata: ModelDocumentMetadata): readonly ToolcraftModelNode[] {
  return metadata.nodes.map((node) => ({
    children: [...node.children],
    id: node.id,
    localMatrix: copyLocalMatrix(node.localMatrix),
    name: node.name,
    primitiveIds: [...node.primitiveIds],
  }));
}

function copyProvenance(
  provenance: ToolcraftModelDocumentV1["provenance"],
): ToolcraftModelDocumentV1["provenance"];
function copyProvenance(
  provenance: ToolcraftModelDocumentV2["provenance"],
): ToolcraftModelDocumentV2["provenance"];
function copyProvenance(
  provenance: ToolcraftModelCanonicalizationProvenance,
): ToolcraftModelCanonicalizationProvenance {
  const repair = provenance.repair;
  const clone = {
    adapterVersion: provenance.adapterVersion,
    canonicalSchemaVersion: provenance.canonicalSchemaVersion,
    operations: [...provenance.operations],
    ...(repair === undefined
      ? {}
      : {
          repair: {
            algorithmVersion: repair.algorithmVersion,
            operations: [...repair.operations],
            planDigest: repair.planDigest,
            recipeId: repair.recipeId,
          },
        }),
    sourceFormat: provenance.sourceFormat,
  };
  return provenance.canonicalSchemaVersion === 1
    ? { ...clone, canonicalSchemaVersion: 1 }
    : { ...clone, canonicalSchemaVersion: 2 };
}

function decodeGeometryPrimitives(
  metadata: ModelDocumentMetadata,
  sections: ModelDocumentSectionsV1,
): readonly ToolcraftModelPrimitiveV1[] {
  return metadata.primitives.map((primitive) => ({
    bounds: {
      max: [...primitive.bounds.max],
      min: [...primitive.bounds.min],
    },
    id: primitive.id,
    indices: decodeUint32Slice(
      sections[4],
      primitive.indices.offset,
      primitive.indices.count,
    ),
    ...(primitive.normals === null
      ? {}
      : {
          normals: decodeFloat32Slice(
            sections[3],
            primitive.normals.offset,
            primitive.normals.count,
          ),
        }),
    positions: decodeFloat32Slice(
      sections[2],
      primitive.positions.offset,
      primitive.positions.count,
    ),
  }));
}

function decodeV1(
  metadata: ModelDocumentMetadataV1,
  sections: ModelDocumentSectionsV1,
): ToolcraftModelDocumentV1 {
  return {
    bounds: {
      max: [...metadata.bounds.max],
      min: [...metadata.bounds.min],
    },
    nodes: decodeNodes(metadata),
    primitives: decodeGeometryPrimitives(metadata, sections),
    provenance: copyProvenance(metadata.provenance),
    rootNodeIds: [...metadata.rootNodeIds],
    version: 1,
  };
}

function decodeV2(
  metadata: ModelDocumentMetadataV2,
  sections: ModelDocumentSectionsV2,
): ToolcraftModelDocumentV2 {
  const geometry = decodeGeometryPrimitives(metadata, sections);
  return {
    bounds: {
      max: [...metadata.bounds.max],
      min: [...metadata.bounds.min],
    },
    materials: metadata.materials,
    nodes: decodeNodes(metadata),
    primitives: metadata.primitives.map((primitive, index) => ({
      ...geometry[index]!,
      ...(primitive.colors === null
        ? {}
        : {
            colors: {
              components: primitive.colors.components,
              values: decodeFloat32Slice(
                sections[6],
                primitive.colors.values.offset,
                primitive.colors.values.count,
              ),
            },
          }),
      ...(primitive.materialId === null
        ? {}
        : { materialId: primitive.materialId }),
      ...(primitive.textureCoordinates.length === 0
        ? {}
        : {
            textureCoordinates: primitive.textureCoordinates.map(
              (coordinates) => ({
                set: coordinates.set,
                values: decodeFloat32Slice(
                  sections[5],
                  coordinates.values.offset,
                  coordinates.values.count,
                ),
              }),
            ),
          }),
    })),
    provenance: copyProvenance(metadata.provenance),
    rootNodeIds: [...metadata.rootNodeIds],
    textures: metadata.textures,
    version: 2,
  };
}

export function decodeModelDocumentPayloads(
  metadata: ModelDocumentMetadata,
  envelope: ModelDocumentEnvelope,
): ToolcraftModelDocument {
  if (metadata.version !== envelope.codecVersion) {
    throwModelDocumentCodecError(
      "unsupported-codec-version",
      "metadata.version",
      "Canonical metadata and envelope codec versions differ.",
    );
  }
  if (metadata.version === 1) {
    if (envelope.codecVersion !== 1) {
      throwModelDocumentCodecError(
        "unsupported-codec-version",
        "metadata.version",
        "Canonical metadata and envelope codec versions differ.",
      );
    }
    return decodeV1(metadata, envelope.sections);
  }
  if (envelope.codecVersion !== 2) {
    throwModelDocumentCodecError(
      "unsupported-codec-version",
      "metadata.version",
      "Canonical metadata and envelope codec versions differ.",
    );
  }
  return decodeV2(metadata, envelope.sections);
}
