import type { ToolcraftModelImportLimits } from "../../schema/types";
import type {
  ToolcraftModelBounds,
  ToolcraftModelDocument,
  ToolcraftModelPrimitive,
  ToolcraftModelPrimitiveV2,
} from "./model-document";
import { validateToolcraftModelAppearance } from "./model-appearance-validation";
import { isToolcraftModelDocumentInputFailure } from "./model-document-input-reader";
import { snapshotToolcraftModelDocumentInput } from "./model-document-input-snapshot";
import {
  aggregatePrimitiveBounds,
  modelBoundsEqual,
  validateModelBounds,
  validateModelPrimitive,
} from "./model-document-validation-geometry";
import { isDenseArray, isRecord } from "./model-document-validation-helpers";
import { validateModelHierarchy } from "./model-document-validation-hierarchy";
import { validateToolcraftModelProvenance } from "./model-document-validation-provenance";
import {
  modelDocumentFailure,
  ToolcraftModelDocumentValidationError,
  VALID_TOOLCRAFT_MODEL_DOCUMENT,
  type ToolcraftModelDocumentValidationResult,
} from "./model-document-validation-result";
import {
  isToolcraftCanonicalModelLimitError,
  resolveToolcraftCanonicalModelLimits,
} from "./model-document-limits";

export type {
  ToolcraftModelDocumentValidationFailure,
  ToolcraftModelDocumentValidationFailureCode,
  ToolcraftModelDocumentValidationResult,
} from "./model-document-validation-result";
export { ToolcraftModelDocumentValidationError } from "./model-document-validation-result";

function validateToolcraftModelDocumentSnapshot(
  document: unknown,
  limits: ReturnType<typeof resolveToolcraftCanonicalModelLimits>,
): ToolcraftModelDocumentValidationResult {
  if (!isRecord(document)) {
    return modelDocumentFailure(
      "invalid-document",
      "document",
      "Canonical model document must be an object.",
    );
  }

  if (document.version !== 1 && document.version !== 2) {
    return modelDocumentFailure(
      "unsupported-document-version",
      "version",
      "Canonical model document version must be 1 or 2.",
    );
  }

  if (!isDenseArray(document.primitives)) {
    return modelDocumentFailure(
      "invalid-primitives",
      "primitives",
      "primitives must be a dense array.",
    );
  }

  if (!isDenseArray(document.nodes)) {
    return modelDocumentFailure(
      "invalid-nodes",
      "nodes",
      "nodes must be a dense array.",
    );
  }

  if (!isDenseArray(document.rootNodeIds)) {
    return modelDocumentFailure(
      "invalid-root-node-ids",
      "rootNodeIds",
      "rootNodeIds must be a dense array.",
    );
  }

  if (document.primitives.length === 0) {
    return modelDocumentFailure(
      "empty-document-primitives",
      "primitives",
      "Canonical model document must contain at least one primitive.",
    );
  }

  if (document.nodes.length === 0) {
    return modelDocumentFailure(
      "empty-node-hierarchy",
      "nodes",
      "Canonical model document must contain at least one node.",
    );
  }

  if (document.primitives.length > limits.maxPrimitives) {
    return modelDocumentFailure(
      "max-primitives-exceeded",
      "primitives",
      `Canonical document exceeds maxPrimitives ${limits.maxPrimitives}.`,
    );
  }

  if (document.nodes.length > limits.maxNodes) {
    return modelDocumentFailure(
      "max-nodes-exceeded",
      "nodes",
      `Canonical document exceeds maxNodes ${limits.maxNodes}.`,
    );
  }

  const provenanceResult = validateToolcraftModelProvenance(
    document.provenance,
    document.version,
  );
  if (!provenanceResult.ok) {
    return provenanceResult;
  }

  const boundsResult = validateModelBounds(document.bounds, "bounds");
  if (!boundsResult.ok) {
    return boundsResult;
  }

  const primitives: ToolcraftModelPrimitive[] = [];
  const primitiveIds = new Set<string>();
  let totalTriangles = 0;
  let totalVertices = 0;

  for (let index = 0; index < document.primitives.length; index += 1) {
    const result = validateModelPrimitive(
      document.primitives[index],
      index,
      { triangles: totalTriangles, vertices: totalVertices },
      limits,
    );

    if (!result.ok) {
      return result;
    }

    const primitive = document.primitives[index] as ToolcraftModelPrimitive;
    if (primitiveIds.has(primitive.id)) {
      return modelDocumentFailure(
        "duplicate-id",
        `primitives[${index}].id`,
        `Canonical id "${primitive.id}" is duplicated.`,
      );
    }

    primitiveIds.add(primitive.id);
    primitives.push(primitive);
    totalTriangles += result.triangles;
    totalVertices += result.vertices;
  }

  const hierarchyResult = validateModelHierarchy(
    document.nodes,
    document.rootNodeIds,
    primitives,
  );
  if (!hierarchyResult.ok) {
    return hierarchyResult;
  }

  if (
    !modelBoundsEqual(
      document.bounds as ToolcraftModelBounds,
      aggregatePrimitiveBounds(primitives),
    )
  ) {
    return modelDocumentFailure(
      "document-bounds-mismatch",
      "bounds",
      "Document bounds must exactly aggregate its primitive bounds.",
    );
  }

  if (document.version === 2) {
    const appearanceResult = validateToolcraftModelAppearance(
      document.materials,
      document.textures,
      primitives as readonly ToolcraftModelPrimitiveV2[],
      limits,
    );
    if (!appearanceResult.ok) {
      return appearanceResult;
    }
  }

  return VALID_TOOLCRAFT_MODEL_DOCUMENT;
}

type ModelDocumentInspection =
  | {
      document: ToolcraftModelDocument;
      ok: true;
      result: { ok: true };
    }
  | {
      ok: false;
      result: Exclude<ToolcraftModelDocumentValidationResult, { ok: true }>;
    };

function inspectToolcraftModelDocument(
  document: unknown,
  requestedLimits?: Partial<ToolcraftModelImportLimits>,
): ModelDocumentInspection {
  try {
    const limits = resolveToolcraftCanonicalModelLimits(requestedLimits);
    const snapshot = snapshotToolcraftModelDocumentInput(document, limits);
    const result = validateToolcraftModelDocumentSnapshot(snapshot, limits);

    if (!result.ok) {
      return { ok: false, result };
    }

    return {
      document: snapshot as ToolcraftModelDocument,
      ok: true,
      result: VALID_TOOLCRAFT_MODEL_DOCUMENT,
    };
  } catch (error) {
    if (isToolcraftCanonicalModelLimitError(error)) {
      return {
        ok: false,
        result: modelDocumentFailure(
          "invalid-limit-options",
          error.path,
          error.message,
        ),
      };
    }
    if (isToolcraftModelDocumentInputFailure(error)) {
      return { ok: false, result: error.failure };
    }

    return {
      ok: false,
      result: modelDocumentFailure(
        "input-access-failed",
        "document",
        "Canonical input could not be inspected safely.",
      ),
    };
  }
}

export function validateToolcraftModelDocument(
  document: unknown,
  requestedLimits?: Partial<ToolcraftModelImportLimits>,
): ToolcraftModelDocumentValidationResult {
  return inspectToolcraftModelDocument(document, requestedLimits).result;
}

export function getValidatedToolcraftModelDocumentSnapshot(
  document: unknown,
  limits?: Partial<ToolcraftModelImportLimits>,
): ToolcraftModelDocument {
  const inspection = inspectToolcraftModelDocument(document, limits);

  if (!inspection.ok) {
    throw new ToolcraftModelDocumentValidationError(inspection.result);
  }

  return inspection.document;
}

export function assertValidToolcraftModelDocument(
  document: unknown,
  limits?: Partial<ToolcraftModelImportLimits>,
): asserts document is ToolcraftModelDocument {
  getValidatedToolcraftModelDocumentSnapshot(document, limits);
}
