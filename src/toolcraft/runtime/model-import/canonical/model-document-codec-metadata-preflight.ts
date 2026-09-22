import type { ToolcraftModelDocumentCodecFailureCode } from "./model-document-codec-error";
import { throwModelDocumentCodecError } from "./model-document-codec-error";
import type { ModelDocumentCodecVersion } from "./model-document-codec-format";
import type { ToolcraftCanonicalModelLimits } from "./model-document-limits";

type PreflightContext = {
  childReferences: number;
  limits: ToolcraftCanonicalModelLimits;
  primitiveReferences: number;
  stringCodeUnits: number;
};

function metadataShape(path: string, message: string): never {
  throwModelDocumentCodecError("invalid-metadata-shape", path, message);
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    metadataShape(path, `${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function readBoundedArray(
  value: unknown,
  path: string,
  maximumLength: number,
  limitCode: ToolcraftModelDocumentCodecFailureCode,
): readonly unknown[] {
  if (!Array.isArray(value)) {
    metadataShape(path, `${path} must be a dense array.`);
  }
  if (value.length > maximumLength) {
    throwModelDocumentCodecError(
      limitCode,
      path,
      `${path} exceeds its protected maximum length ${maximumLength}.`,
    );
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      metadataShape(path, `${path} must be a dense array.`);
    }
  }
  return value;
}

function readExactArray(
  value: unknown,
  path: string,
  exactLength: number,
): readonly unknown[] {
  const array = readBoundedArray(
    value,
    path,
    exactLength,
    "invalid-metadata-shape",
  );
  if (array.length !== exactLength) {
    metadataShape(path, `${path} must contain exactly ${exactLength} values.`);
  }
  return array;
}

function preflightNumberTuple(
  value: unknown,
  path: string,
  exactLength: number,
): void {
  const array = readExactArray(value, path, exactLength);
  for (let index = 0; index < array.length; index += 1) {
    if (typeof array[index] !== "number" || !Number.isFinite(array[index])) {
      metadataShape(`${path}[${index}]`, `${path} must contain finite numbers.`);
    }
  }
}

function preflightBounds(value: unknown, path: string): void {
  const bounds = readRecord(value, path);
  preflightNumberTuple(bounds.max, `${path}.max`, 3);
  preflightNumberTuple(bounds.min, `${path}.min`, 3);
}

function preflightString(
  value: unknown,
  path: string,
  context: PreflightContext,
): void {
  if (typeof value !== "string") {
    metadataShape(path, `${path} must be a string.`);
  }

  const maximumCodeUnits = Math.max(
    1,
    Math.floor(context.limits.maxEstimatedWorkerBytes / 2),
  );
  if (
    value.length > maximumCodeUnits ||
    context.stringCodeUnits + value.length > maximumCodeUnits
  ) {
    throwModelDocumentCodecError(
      "string-limit-exceeded",
      path,
      `${path} exceeds the canonical metadata string limit.`,
    );
  }
  context.stringCodeUnits += value.length;
}

function preflightStringArray(
  value: unknown,
  path: string,
  maximumLength: number,
  limitCode: ToolcraftModelDocumentCodecFailureCode,
  context: PreflightContext,
): readonly unknown[] {
  const array = readBoundedArray(value, path, maximumLength, limitCode);
  for (let index = 0; index < array.length; index += 1) {
    preflightString(array[index], `${path}[${index}]`, context);
  }
  return array;
}

function reserveReferences(
  current: number,
  additional: number,
  maximum: number,
  path: string,
): number {
  if (current + additional > maximum) {
    throwModelDocumentCodecError(
      "max-references-exceeded",
      path,
      `${path} exceeds the protected aggregate reference limit ${maximum}.`,
    );
  }
  return current + additional;
}

function preflightNode(
  value: unknown,
  index: number,
  context: PreflightContext,
): void {
  const path = `nodes[${index}]`;
  const node = readRecord(value, path);
  preflightString(node.id, `${path}.id`, context);
  preflightString(node.name, `${path}.name`, context);
  preflightNumberTuple(node.localMatrix, `${path}.localMatrix`, 16);

  const children = preflightStringArray(
    node.children,
    `${path}.children`,
    context.limits.maxNodes,
    "max-references-exceeded",
    context,
  );
  context.childReferences = reserveReferences(
    context.childReferences,
    children.length,
    context.limits.maxNodes,
    `${path}.children`,
  );

  const primitiveIds = preflightStringArray(
    node.primitiveIds,
    `${path}.primitiveIds`,
    context.limits.maxPrimitives,
    "max-references-exceeded",
    context,
  );
  const structuralMaximum =
    context.limits.maxNodes * context.limits.maxPrimitives;
  const memoryMaximum = Math.max(
    1,
    Math.floor(context.limits.maxEstimatedWorkerBytes / 64),
  );
  context.primitiveReferences = reserveReferences(
    context.primitiveReferences,
    primitiveIds.length,
    Math.min(structuralMaximum, memoryMaximum),
    `${path}.primitiveIds`,
  );
}

function preflightPrimitive(
  value: unknown,
  index: number,
  context: PreflightContext,
  codecVersion: ModelDocumentCodecVersion,
): void {
  const path = `primitives[${index}]`;
  const primitive = readRecord(value, path);
  preflightString(primitive.id, `${path}.id`, context);
  preflightBounds(primitive.bounds, `${path}.bounds`);
  readRecord(primitive.positions, `${path}.positions`);
  readRecord(primitive.indices, `${path}.indices`);
  if (primitive.normals !== null) {
    readRecord(primitive.normals, `${path}.normals`);
  }
  if (codecVersion === 1) return;

  if (primitive.materialId !== null) {
    preflightString(primitive.materialId, `${path}.materialId`, context);
  }
  const coordinates = readBoundedArray(
    primitive.textureCoordinates,
    `${path}.textureCoordinates`,
    2,
    "invalid-metadata-shape",
  );
  for (let setIndex = 0; setIndex < coordinates.length; setIndex += 1) {
    const coordinatePath = `${path}.textureCoordinates[${setIndex}]`;
    const coordinate = readRecord(coordinates[setIndex], coordinatePath);
    readRecord(coordinate.values, `${coordinatePath}.values`);
  }
  if (primitive.colors !== null) {
    const colors = readRecord(primitive.colors, `${path}.colors`);
    readRecord(colors.values, `${path}.colors.values`);
  }
}

const textureSlotNames = [
  "baseColorTexture",
  "emissiveTexture",
  "metallicRoughnessTexture",
  "normalTexture",
  "occlusionTexture",
] as const;

function preflightMaterial(
  value: unknown,
  index: number,
  context: PreflightContext,
): void {
  const path = `materials[${index}]`;
  const material = readRecord(value, path);
  preflightString(material.id, `${path}.id`, context);
  preflightString(material.alphaMode, `${path}.alphaMode`, context);
  preflightNumberTuple(material.baseColor, `${path}.baseColor`, 3);
  preflightNumberTuple(material.emissive, `${path}.emissive`, 3);
  for (const name of textureSlotNames) {
    if (material[name] === undefined) continue;
    const slot = readRecord(material[name], `${path}.${name}`);
    preflightString(slot.textureId, `${path}.${name}.textureId`, context);
  }
}

function preflightTexture(
  value: unknown,
  index: number,
  context: PreflightContext,
): void {
  const path = `textures[${index}]`;
  const texture = readRecord(value, path);
  for (const name of [
    "colorSpace",
    "contentDigest",
    "id",
    "mimeType",
    "resourceRef",
  ] as const) {
    preflightString(texture[name], `${path}.${name}`, context);
  }
  const sampler = readRecord(texture.sampler, `${path}.sampler`);
  for (const name of ["magFilter", "minFilter", "wrapS", "wrapT"] as const) {
    preflightString(sampler[name], `${path}.sampler.${name}`, context);
  }
}

function preflightProvenance(value: unknown, context: PreflightContext): void {
  const provenance = readRecord(value, "provenance");
  preflightString(provenance.adapterVersion, "provenance.adapterVersion", context);
  preflightString(provenance.sourceFormat, "provenance.sourceFormat", context);
  preflightStringArray(
    provenance.operations,
    "provenance.operations",
    2,
    "invalid-metadata-shape",
    context,
  );

  if (provenance.repair === undefined) {
    return;
  }
  const repair = readRecord(provenance.repair, "provenance.repair");
  for (const name of ["algorithmVersion", "planDigest", "recipeId"] as const) {
    preflightString(repair[name], `provenance.repair.${name}`, context);
  }
  preflightStringArray(
    repair.operations,
    "provenance.repair.operations",
    6,
    "invalid-metadata-shape",
    context,
  );
}

export function preflightModelDocumentMetadata(
  value: unknown,
  limits: ToolcraftCanonicalModelLimits,
  codecVersion: ModelDocumentCodecVersion,
): asserts value is Record<string, unknown> & {
  nodes: readonly unknown[];
  primitives: readonly unknown[];
} {
  const metadata = readRecord(value, "metadata");
  const context: PreflightContext = {
    childReferences: 0,
    limits,
    primitiveReferences: 0,
    stringCodeUnits: 0,
  };

  preflightBounds(metadata.bounds, "bounds");
  const nodes = readBoundedArray(
    metadata.nodes,
    "metadata.nodes",
    limits.maxNodes,
    "max-nodes-exceeded",
  );
  const primitives = readBoundedArray(
    metadata.primitives,
    "metadata.primitives",
    limits.maxPrimitives,
    "max-primitives-exceeded",
  );
  const materials = codecVersion === 2
    ? readBoundedArray(
        metadata.materials,
        "metadata.materials",
        limits.maxPrimitives,
        "max-primitives-exceeded",
      )
    : [];
  const textures = codecVersion === 2
    ? readBoundedArray(
        metadata.textures,
        "metadata.textures",
        limits.maxTextureCount,
        "max-textures-exceeded",
      )
    : [];
  const roots = preflightStringArray(
    metadata.rootNodeIds,
    "rootNodeIds",
    limits.maxNodes,
    "max-nodes-exceeded",
    context,
  );
  context.childReferences = reserveReferences(
    context.childReferences,
    roots.length,
    limits.maxNodes * 2,
    "rootNodeIds",
  );

  for (let index = 0; index < nodes.length; index += 1) {
    preflightNode(nodes[index], index, context);
  }
  for (let index = 0; index < primitives.length; index += 1) {
    preflightPrimitive(primitives[index], index, context, codecVersion);
  }
  for (let index = 0; index < materials.length; index += 1) {
    preflightMaterial(materials[index], index, context);
  }
  for (let index = 0; index < textures.length; index += 1) {
    preflightTexture(textures[index], index, context);
  }
  preflightProvenance(metadata.provenance, context);
}
