import type { ToolcraftCanonicalModelLimits } from "./model-document-limits";
import {
  snapshotDocumentAppearance,
  snapshotPrimitiveAppearance,
} from "./model-appearance-input-snapshot";
import {
  canSnapshotObject,
  readOwnDataValue,
  snapshotInputArray,
  throwInputFailure,
} from "./model-document-input-reader";
import { createOwnedModelTypedArrayCopy } from "./model-document-safe-typed-array";
import { exceedsOwnedEncodeGeometryWorkerMemory } from "./model-document-worker-memory";

type SnapshotContext = {
  childReferences: number;
  colorComponents: number;
  geometryBytes: number;
  indexComponents: number;
  limits: ToolcraftCanonicalModelLimits;
  normalComponents: number;
  positionComponents: number;
  primitiveReferences: number;
  textureCoordinateComponents: number;
};

function reserveGeometryArray(
  kind: "colors" | "indices" | "normals" | "positions" | "textureCoordinates",
  length: number,
  byteLength: number,
  path: string,
  context: SnapshotContext,
): void {
  if (kind === "colors") {
    context.colorComponents += length;
    if (context.colorComponents > context.limits.maxVertices * 4) {
      throwInputFailure(
        "max-vertices-exceeded",
        path,
        `Canonical colors exceed maxVertices ${context.limits.maxVertices}.`,
      );
    }
  } else if (kind === "textureCoordinates") {
    context.textureCoordinateComponents += length;
    if (context.textureCoordinateComponents > context.limits.maxVertices * 4) {
      throwInputFailure(
        "max-vertices-exceeded",
        path,
        `Canonical texture coordinates exceed maxVertices ${context.limits.maxVertices}.`,
      );
    }
  } else if (kind === "indices") {
    context.indexComponents += length;
    if (context.indexComponents > context.limits.maxTriangles * 3) {
      throwInputFailure(
        "max-triangles-exceeded",
        path,
        `Canonical geometry exceeds maxTriangles ${context.limits.maxTriangles}.`,
      );
    }
  } else if (kind === "positions") {
    context.positionComponents += length;
    if (context.positionComponents > context.limits.maxVertices * 3) {
      throwInputFailure(
        "max-vertices-exceeded",
        path,
        `Canonical geometry exceeds maxVertices ${context.limits.maxVertices}.`,
      );
    }
  } else {
    context.normalComponents += length;
    if (context.normalComponents > context.limits.maxVertices * 3) {
      throwInputFailure(
        "max-vertices-exceeded",
        path,
        `Canonical normals exceed maxVertices ${context.limits.maxVertices}.`,
      );
    }
  }

  const geometryBytes = context.geometryBytes + byteLength;
  if (exceedsOwnedEncodeGeometryWorkerMemory(geometryBytes, context.limits)) {
    throwInputFailure(
      "estimated-worker-memory-limit-exceeded",
      path,
      `${path} cannot be copied within maxEstimatedWorkerBytes ${context.limits.maxEstimatedWorkerBytes}.`,
    );
  }
  context.geometryBytes = geometryBytes;
}

function snapshotString(value: unknown): unknown {
  return value;
}

function snapshotStringArray(
  value: unknown,
  path: string,
  _context: SnapshotContext,
  options: {
    beforeAllocate?: (length: number) => void;
    maxLength: number;
  },
): unknown {
  return snapshotInputArray(
    value,
    path,
    (entry) => snapshotString(entry),
    {
      beforeAllocate: options.beforeAllocate,
      limitCode: "max-references-exceeded",
      maxLength: options.maxLength,
    },
  );
}

function snapshotFixedArray(
  value: unknown,
  path: string,
  length: number,
  code: "invalid-bound" | "invalid-node-matrix",
): unknown {
  return snapshotInputArray(value, path, (entry) => entry, {
    limitCode: code,
    maxLength: length,
  });
}

function snapshotObject(
  value: unknown,
  path: string,
  build: (object: object) => Record<string, unknown>,
): unknown {
  return canSnapshotObject(value, path) ? build(value) : value;
}

function snapshotBounds(value: unknown, path: string): unknown {
  return snapshotObject(value, path, (object) => ({
    max: snapshotFixedArray(
      readOwnDataValue(object, "max", `${path}.max`),
      `${path}.max`,
      3,
      "invalid-bound",
    ),
    min: snapshotFixedArray(
      readOwnDataValue(object, "min", `${path}.min`),
      `${path}.min`,
      3,
      "invalid-bound",
    ),
  }));
}

function snapshotTypedArray(
  value: unknown,
  path: string,
  kind: "colors" | "indices" | "normals" | "positions" | "textureCoordinates",
  context: SnapshotContext,
): unknown {
  const arrayKind = kind === "indices" ? "Uint32Array" : "Float32Array";
  const ownedTypedArray = createOwnedModelTypedArrayCopy(
    value,
    path,
    arrayKind,
    (byteLength) =>
      reserveGeometryArray(
        kind,
        byteLength / 4,
        byteLength,
        path,
        context,
      ),
  );
  if (ownedTypedArray === null) {
    return value;
  }
  return ownedTypedArray.array;
}

function snapshotPrimitive(
  value: unknown,
  index: number,
  context: SnapshotContext,
  version: unknown,
): unknown {
  const path = `primitives[${index}]`;
  return snapshotObject(value, path, (object) => {
    const positions = readOwnDataValue(object, "positions", `${path}.positions`);
    const indices = readOwnDataValue(object, "indices", `${path}.indices`);
    const normals = readOwnDataValue(object, "normals", `${path}.normals`);
    return {
      bounds: snapshotBounds(
        readOwnDataValue(object, "bounds", `${path}.bounds`),
        `${path}.bounds`,
      ),
      id: snapshotString(readOwnDataValue(object, "id", `${path}.id`)),
      indices: snapshotTypedArray(indices, `${path}.indices`, "indices", context),
      ...(normals === undefined
        ? {}
        : {
            normals: snapshotTypedArray(
              normals,
              `${path}.normals`,
              "normals",
              context,
            ),
          }),
      positions: snapshotTypedArray(
        positions,
        `${path}.positions`,
        "positions",
        context,
      ),
      ...(version === 2
        ? snapshotPrimitiveAppearance(
            object,
            path,
            (appearanceValue, appearancePath, appearanceKind) =>
              snapshotTypedArray(
                appearanceValue,
                appearancePath,
                appearanceKind,
                context,
              ),
          )
        : {}),
    };
  });
}

function reserveChildReferences(
  length: number,
  path: string,
  context: SnapshotContext,
): void {
  if (context.childReferences + length > context.limits.maxNodes) {
    throwInputFailure(
      "max-references-exceeded",
      path,
      `Canonical hierarchy exceeds maxNodes ${context.limits.maxNodes}.`,
    );
  }
  context.childReferences += length;
}

function reservePrimitiveReferences(
  length: number,
  path: string,
  context: SnapshotContext,
): void {
  const memoryBound = Math.max(
    1,
    Math.floor(context.limits.maxEstimatedWorkerBytes / 64),
  );
  const structuralBound = context.limits.maxNodes * context.limits.maxPrimitives;
  if (
    context.primitiveReferences + length >
    Math.min(memoryBound, structuralBound)
  ) {
    throwInputFailure(
      "max-references-exceeded",
      path,
      "Canonical primitive references exceed the protected aggregate limit.",
    );
  }
  context.primitiveReferences += length;
}

function snapshotNode(
  value: unknown,
  index: number,
  context: SnapshotContext,
): unknown {
  const path = `nodes[${index}]`;
  return snapshotObject(value, path, (object) => ({
    children: snapshotStringArray(
      readOwnDataValue(object, "children", `${path}.children`),
      `${path}.children`,
      context,
      {
        beforeAllocate: (length) =>
          reserveChildReferences(length, `${path}.children`, context),
        maxLength: context.limits.maxNodes,
      },
    ),
    id: snapshotString(readOwnDataValue(object, "id", `${path}.id`)),
    localMatrix: snapshotFixedArray(
      readOwnDataValue(object, "localMatrix", `${path}.localMatrix`),
      `${path}.localMatrix`,
      16,
      "invalid-node-matrix",
    ),
    name: snapshotString(readOwnDataValue(object, "name", `${path}.name`)),
    primitiveIds: snapshotStringArray(
      readOwnDataValue(object, "primitiveIds", `${path}.primitiveIds`),
      `${path}.primitiveIds`,
      context,
      {
        beforeAllocate: (length) =>
          reservePrimitiveReferences(length, `${path}.primitiveIds`, context),
        maxLength: context.limits.maxPrimitives,
      },
    ),
  }));
}

function snapshotRepair(
  value: unknown,
  context: SnapshotContext,
): unknown {
  const path = "provenance.repair";
  return snapshotObject(value, path, (object) => ({
    algorithmVersion: snapshotString(
      readOwnDataValue(object, "algorithmVersion", `${path}.algorithmVersion`),
    ),
    operations: snapshotStringArray(
      readOwnDataValue(object, "operations", `${path}.operations`),
      `${path}.operations`,
      context,
      { maxLength: 6 },
    ),
    planDigest: snapshotString(
      readOwnDataValue(object, "planDigest", `${path}.planDigest`),
    ),
    recipeId: snapshotString(
      readOwnDataValue(object, "recipeId", `${path}.recipeId`),
    ),
  }));
}

function snapshotProvenance(
  value: unknown,
  context: SnapshotContext,
): unknown {
  const path = "provenance";
  return snapshotObject(value, path, (object) => {
    const repair = readOwnDataValue(object, "repair", `${path}.repair`);
    return {
      adapterVersion: snapshotString(
        readOwnDataValue(object, "adapterVersion", `${path}.adapterVersion`),
      ),
      canonicalSchemaVersion: readOwnDataValue(
        object,
        "canonicalSchemaVersion",
        `${path}.canonicalSchemaVersion`,
      ),
      operations: snapshotStringArray(
        readOwnDataValue(object, "operations", `${path}.operations`),
        `${path}.operations`,
        context,
        { maxLength: 2 },
      ),
      ...(repair === undefined ? {} : { repair: snapshotRepair(repair, context) }),
      sourceFormat: snapshotString(
        readOwnDataValue(object, "sourceFormat", `${path}.sourceFormat`),
      ),
    };
  });
}

export function snapshotToolcraftModelDocumentInput(
  document: unknown,
  limits: ToolcraftCanonicalModelLimits,
): unknown {
  const context: SnapshotContext = {
    childReferences: 0,
    colorComponents: 0,
    geometryBytes: 0,
    indexComponents: 0,
    limits,
    normalComponents: 0,
    positionComponents: 0,
    primitiveReferences: 0,
    textureCoordinateComponents: 0,
  };

  return snapshotObject(document, "document", (object) => {
    const version = readOwnDataValue(object, "version", "version");
    return {
      bounds: snapshotBounds(
        readOwnDataValue(object, "bounds", "bounds"),
        "bounds",
      ),
      primitives: snapshotInputArray(
        readOwnDataValue(object, "primitives", "primitives"),
        "primitives",
        (entry, index) => snapshotPrimitive(entry, index, context, version),
        {
          limitCode: "max-primitives-exceeded",
          maxLength: limits.maxPrimitives,
        },
      ),
      nodes: snapshotInputArray(
        readOwnDataValue(object, "nodes", "nodes"),
        "nodes",
        (entry, index) => snapshotNode(entry, index, context),
        { limitCode: "max-nodes-exceeded", maxLength: limits.maxNodes },
      ),
      provenance: snapshotProvenance(
        readOwnDataValue(object, "provenance", "provenance"),
        context,
      ),
      rootNodeIds: snapshotStringArray(
        readOwnDataValue(object, "rootNodeIds", "rootNodeIds"),
        "rootNodeIds",
        context,
        { maxLength: limits.maxNodes },
      ),
      ...snapshotDocumentAppearance(object, version, limits),
      version,
    };
  });
}
