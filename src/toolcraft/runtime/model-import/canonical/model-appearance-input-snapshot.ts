import type { ToolcraftCanonicalModelLimits } from "./model-document-limits";
import {
  canSnapshotObject,
  readOwnDataValue,
  snapshotInputArray,
} from "./model-document-input-reader";

type SnapshotFloat32 = (
  value: unknown,
  path: string,
  kind: "colors" | "textureCoordinates",
) => unknown;

function snapshotObject(
  value: unknown,
  path: string,
  build: (object: object) => Record<string, unknown>,
): unknown {
  return canSnapshotObject(value, path) ? build(value) : value;
}

function snapshotTextureSlot(value: unknown, path: string): unknown {
  return snapshotObject(value, path, (object) => {
    const scale = readOwnDataValue(object, "scale", `${path}.scale`);
    const strength = readOwnDataValue(object, "strength", `${path}.strength`);
    return {
      ...(scale === undefined ? {} : { scale }),
      ...(strength === undefined ? {} : { strength }),
      texCoord: readOwnDataValue(object, "texCoord", `${path}.texCoord`),
      textureId: readOwnDataValue(object, "textureId", `${path}.textureId`),
    };
  });
}

function snapshotMaterial(value: unknown, index: number): unknown {
  const path = `materials[${index}]`;
  return snapshotObject(value, path, (object) => {
    const slots: Record<string, unknown> = {};
    for (const name of [
      "baseColorTexture",
      "emissiveTexture",
      "metallicRoughnessTexture",
      "normalTexture",
      "occlusionTexture",
    ] as const) {
      const slot = readOwnDataValue(object, name, `${path}.${name}`);
      if (slot !== undefined) {
        slots[name] = snapshotTextureSlot(slot, `${path}.${name}`);
      }
    }
    return {
      alphaCutoff: readOwnDataValue(object, "alphaCutoff", `${path}.alphaCutoff`),
      alphaMode: readOwnDataValue(object, "alphaMode", `${path}.alphaMode`),
      baseColor: snapshotInputArray(
        readOwnDataValue(object, "baseColor", `${path}.baseColor`),
        `${path}.baseColor`,
        (entry) => entry,
        { limitCode: "invalid-material-factor", maxLength: 3 },
      ),
      doubleSided: readOwnDataValue(object, "doubleSided", `${path}.doubleSided`),
      emissive: snapshotInputArray(
        readOwnDataValue(object, "emissive", `${path}.emissive`),
        `${path}.emissive`,
        (entry) => entry,
        { limitCode: "invalid-material-factor", maxLength: 3 },
      ),
      id: readOwnDataValue(object, "id", `${path}.id`),
      metallic: readOwnDataValue(object, "metallic", `${path}.metallic`),
      opacity: readOwnDataValue(object, "opacity", `${path}.opacity`),
      roughness: readOwnDataValue(object, "roughness", `${path}.roughness`),
      ...slots,
      usesVertexColor: readOwnDataValue(
        object,
        "usesVertexColor",
        `${path}.usesVertexColor`,
      ),
    };
  });
}

function snapshotTexture(value: unknown, index: number): unknown {
  const path = `textures[${index}]`;
  return snapshotObject(value, path, (object) => ({
    colorSpace: readOwnDataValue(object, "colorSpace", `${path}.colorSpace`),
    contentDigest: readOwnDataValue(
      object,
      "contentDigest",
      `${path}.contentDigest`,
    ),
    height: readOwnDataValue(object, "height", `${path}.height`),
    id: readOwnDataValue(object, "id", `${path}.id`),
    mimeType: readOwnDataValue(object, "mimeType", `${path}.mimeType`),
    resourceRef: readOwnDataValue(object, "resourceRef", `${path}.resourceRef`),
    sampler: snapshotObject(
      readOwnDataValue(object, "sampler", `${path}.sampler`),
      `${path}.sampler`,
      (sampler) => ({
        magFilter: readOwnDataValue(
          sampler,
          "magFilter",
          `${path}.sampler.magFilter`,
        ),
        minFilter: readOwnDataValue(
          sampler,
          "minFilter",
          `${path}.sampler.minFilter`,
        ),
        wrapS: readOwnDataValue(sampler, "wrapS", `${path}.sampler.wrapS`),
        wrapT: readOwnDataValue(sampler, "wrapT", `${path}.sampler.wrapT`),
      }),
    ),
    width: readOwnDataValue(object, "width", `${path}.width`),
  }));
}

export function snapshotPrimitiveAppearance(
  object: object,
  path: string,
  snapshotFloat32: SnapshotFloat32,
): Record<string, unknown> {
  const colors = readOwnDataValue(object, "colors", `${path}.colors`);
  const materialId = readOwnDataValue(object, "materialId", `${path}.materialId`);
  const textureCoordinates = readOwnDataValue(
    object,
    "textureCoordinates",
    `${path}.textureCoordinates`,
  );
  return {
    ...(colors === undefined
      ? {}
      : {
          colors: snapshotObject(colors, `${path}.colors`, (record) => ({
            components: readOwnDataValue(
              record,
              "components",
              `${path}.colors.components`,
            ),
            values: snapshotFloat32(
              readOwnDataValue(record, "values", `${path}.colors.values`),
              `${path}.colors.values`,
              "colors",
            ),
          })),
        }),
    ...(materialId === undefined ? {} : { materialId }),
    ...(textureCoordinates === undefined
      ? {}
      : {
          textureCoordinates: snapshotInputArray(
            textureCoordinates,
            `${path}.textureCoordinates`,
            (entry, index) => {
              const coordinatePath = `${path}.textureCoordinates[${index}]`;
              return snapshotObject(entry, coordinatePath, (record) => ({
                set: readOwnDataValue(record, "set", `${coordinatePath}.set`),
                values: snapshotFloat32(
                  readOwnDataValue(record, "values", `${coordinatePath}.values`),
                  `${coordinatePath}.values`,
                  "textureCoordinates",
                ),
              }));
            },
            { limitCode: "invalid-texture-coordinates", maxLength: 2 },
          ),
        }),
  };
}

export function snapshotDocumentAppearance(
  object: object,
  version: unknown,
  limits: ToolcraftCanonicalModelLimits,
): Record<string, unknown> {
  if (version !== 2) return {};
  return {
    materials: snapshotInputArray(
      readOwnDataValue(object, "materials", "materials"),
      "materials",
      (entry, index) => snapshotMaterial(entry, index),
      { limitCode: "max-primitives-exceeded", maxLength: limits.maxPrimitives },
    ),
    textures: snapshotInputArray(
      readOwnDataValue(object, "textures", "textures"),
      "textures",
      (entry, index) => snapshotTexture(entry, index),
      { limitCode: "max-textures-exceeded", maxLength: limits.maxTextureCount },
    ),
  };
}
