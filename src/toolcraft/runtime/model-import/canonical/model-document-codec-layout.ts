import type { ToolcraftCanonicalModelLimits } from "./model-document-limits";
import { throwModelDocumentCodecError } from "./model-document-codec-error";
import type {
  ModelDocumentMetadata,
  ModelDocumentMetadataV2,
} from "./model-document-codec-metadata";

export type ModelDocumentPayloadByteLengths = Readonly<{
  colors: number;
  indices: number;
  normals: number;
  positions: number;
  textureCoordinates: number;
}>;

function assertSafeTotals(
  totals: readonly number[],
  path: string,
): void {
  if (!totals.every(Number.isSafeInteger)) {
    throwModelDocumentCodecError(
      "unsafe-metadata-integer",
      path,
      "Canonical typed-array slice totals exceed safe integer size.",
    );
  }
}

function validateGeometryLayout(
  metadata: ModelDocumentMetadata,
  sectionByteLengths: ModelDocumentPayloadByteLengths,
  limits: ToolcraftCanonicalModelLimits,
): void {
  let indices = 0;
  let normals = 0;
  let positions = 0;

  for (let index = 0; index < metadata.primitives.length; index += 1) {
    const primitive = metadata.primitives[index]!;
    if (
      primitive.indices.offset !== indices ||
      primitive.positions.offset !== positions ||
      (primitive.normals !== null && primitive.normals.offset !== normals)
    ) {
      throwModelDocumentCodecError(
        "payload-layout-mismatch",
        `primitives[${index}]`,
        "Canonical geometry slices must be contiguous and ordered.",
      );
    }

    indices += primitive.indices.count;
    positions += primitive.positions.count;
    normals += primitive.normals?.count ?? 0;
    assertSafeTotals([indices, positions, normals], `primitives[${index}]`);

    if (indices > limits.maxTriangles * 3) {
      throwModelDocumentCodecError(
        "max-triangles-exceeded",
        `primitives[${index}].indices.count`,
        `Canonical metadata exceeds maxTriangles ${limits.maxTriangles}.`,
      );
    }
    if (positions > limits.maxVertices * 3 || normals > limits.maxVertices * 3) {
      throwModelDocumentCodecError(
        "max-vertices-exceeded",
        `primitives[${index}].positions.count`,
        `Canonical metadata exceeds maxVertices ${limits.maxVertices}.`,
      );
    }
  }

  if (
    indices * 4 !== sectionByteLengths.indices ||
    normals * 4 !== sectionByteLengths.normals ||
    positions * 4 !== sectionByteLengths.positions
  ) {
    throwModelDocumentCodecError(
      "payload-layout-mismatch",
      "sections",
      "Canonical geometry slices do not exactly cover their sections.",
    );
  }
}

function validateAppearanceLayout(
  metadata: ModelDocumentMetadataV2,
  sectionByteLengths: ModelDocumentPayloadByteLengths,
  limits: ToolcraftCanonicalModelLimits,
): void {
  let colors = 0;
  let textureCoordinates = 0;
  for (let index = 0; index < metadata.primitives.length; index += 1) {
    const primitive = metadata.primitives[index]!;
    if (primitive.colors !== null) {
      if (primitive.colors.values.offset !== colors) {
        throwModelDocumentCodecError(
          "payload-layout-mismatch",
          `primitives[${index}].colors`,
          "Canonical color slices must be contiguous and ordered.",
        );
      }
      colors += primitive.colors.values.count;
    }
    for (let setIndex = 0; setIndex < primitive.textureCoordinates.length;
      setIndex += 1) {
      const coordinates = primitive.textureCoordinates[setIndex]!;
      if (coordinates.values.offset !== textureCoordinates) {
        throwModelDocumentCodecError(
          "payload-layout-mismatch",
          `primitives[${index}].textureCoordinates[${setIndex}]`,
          "Canonical texture-coordinate slices must be contiguous and ordered.",
        );
      }
      textureCoordinates += coordinates.values.count;
    }
    assertSafeTotals(
      [colors, textureCoordinates],
      `primitives[${index}].appearance`,
    );
    if (colors > limits.maxVertices * 4 ||
        textureCoordinates > limits.maxVertices * 4) {
      throwModelDocumentCodecError(
        "max-vertices-exceeded",
        `primitives[${index}].appearance`,
        `Canonical appearance metadata exceeds maxVertices ${limits.maxVertices}.`,
      );
    }
  }

  if (
    colors * 4 !== sectionByteLengths.colors ||
    textureCoordinates * 4 !== sectionByteLengths.textureCoordinates
  ) {
    throwModelDocumentCodecError(
      "payload-layout-mismatch",
      "sections",
      "Canonical appearance slices do not exactly cover their sections.",
    );
  }
}

export function validateModelDocumentPayloadLayout(
  metadata: ModelDocumentMetadata,
  sectionByteLengths: ModelDocumentPayloadByteLengths,
  limits: ToolcraftCanonicalModelLimits,
): void {
  validateGeometryLayout(metadata, sectionByteLengths, limits);
  if (metadata.version === 1) {
    if (
      sectionByteLengths.colors !== 0 ||
      sectionByteLengths.textureCoordinates !== 0
    ) {
      throwModelDocumentCodecError(
        "payload-layout-mismatch",
        "sections",
        "Canonical codec v1 cannot contain appearance sections.",
      );
    }
    return;
  }
  validateAppearanceLayout(metadata, sectionByteLengths, limits);
}
