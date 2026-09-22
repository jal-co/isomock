import type {
  ToolcraftModelNode,
  ToolcraftModelPrimitive,
} from "./model-document";
import {
  isDenseArray,
  isNonemptyString,
  isRecord,
} from "./model-document-validation-helpers";
import {
  modelDocumentFailure,
  VALID_TOOLCRAFT_MODEL_DOCUMENT,
  type ToolcraftModelDocumentValidationResult,
} from "./model-document-validation-result";

function validateNode(
  value: unknown,
  index: number,
): ToolcraftModelDocumentValidationResult {
  const path = `nodes[${index}]`;

  if (!isRecord(value)) {
    return modelDocumentFailure("invalid-node", path, `${path} must be an object.`);
  }

  if (!isNonemptyString(value.id)) {
    return modelDocumentFailure(
      "empty-id",
      `${path}.id`,
      `${path}.id must be a nonempty string.`,
    );
  }

  if (typeof value.name !== "string") {
    return modelDocumentFailure(
      "invalid-node-name",
      `${path}.name`,
      `${path}.name must be a string.`,
    );
  }

  if (!isDenseArray(value.localMatrix) || value.localMatrix.length !== 16) {
    return modelDocumentFailure(
      "invalid-node-matrix",
      `${path}.localMatrix`,
      `${path}.localMatrix must contain exactly 16 components.`,
    );
  }

  for (let component = 0; component < 16; component += 1) {
    const matrixValue = value.localMatrix[component];
    if (typeof matrixValue !== "number" || !Number.isFinite(matrixValue)) {
      return modelDocumentFailure(
        "non-finite-node-matrix",
        `${path}.localMatrix[${component}]`,
        `${path}.localMatrix must contain only finite numbers.`,
      );
    }
  }

  if (!isDenseArray(value.children)) {
    return modelDocumentFailure(
      "invalid-node-children",
      `${path}.children`,
      `${path}.children must be a dense string array.`,
    );
  }

  if (!isDenseArray(value.primitiveIds)) {
    return modelDocumentFailure(
      "invalid-node-primitive-ids",
      `${path}.primitiveIds`,
      `${path}.primitiveIds must be a dense string array.`,
    );
  }

  return VALID_TOOLCRAFT_MODEL_DOCUMENT;
}

function findHierarchyCycle(
  nodes: readonly ToolcraftModelNode[],
  nodesById: ReadonlyMap<string, ToolcraftModelNode>,
): string | null {
  const states = new Map<string, "done" | "visiting">();

  for (const startNode of nodes) {
    if (states.has(startNode.id)) {
      continue;
    }

    const stack: { childIndex: number; node: ToolcraftModelNode }[] = [
      { childIndex: 0, node: startNode },
    ];
    states.set(startNode.id, "visiting");

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const childId = frame.node.children[frame.childIndex];

      if (childId === undefined) {
        states.set(frame.node.id, "done");
        stack.pop();
        continue;
      }

      frame.childIndex += 1;
      const state = states.get(childId);
      if (state === "visiting") {
        return childId;
      }

      if (state === "done") {
        continue;
      }

      const child = nodesById.get(childId)!;
      states.set(childId, "visiting");
      stack.push({ childIndex: 0, node: child });
    }
  }

  return null;
}

export function validateModelHierarchy(
  nodesValue: readonly unknown[],
  rootNodeIdsValue: readonly unknown[],
  primitives: readonly ToolcraftModelPrimitive[],
): ToolcraftModelDocumentValidationResult {
  const nodesById = new Map<string, ToolcraftModelNode>();
  const allIds = new Set(primitives.map((primitive) => primitive.id));

  for (let index = 0; index < nodesValue.length; index += 1) {
    const result = validateNode(nodesValue[index], index);
    if (!result.ok) {
      return result;
    }

    const node = nodesValue[index] as ToolcraftModelNode;
    if (allIds.has(node.id)) {
      return modelDocumentFailure(
        "duplicate-id",
        `nodes[${index}].id`,
        `Canonical id "${node.id}" is duplicated.`,
      );
    }

    allIds.add(node.id);
    nodesById.set(node.id, node);
  }

  if (rootNodeIdsValue.length === 0) {
    return modelDocumentFailure(
      "missing-root",
      "rootNodeIds",
      "A nonempty node hierarchy must declare at least one root.",
    );
  }

  const rootIds = new Set<string>();
  for (let index = 0; index < rootNodeIdsValue.length; index += 1) {
    const rootId = rootNodeIdsValue[index];
    const path = `rootNodeIds[${index}]`;
    if (!isNonemptyString(rootId)) {
      return modelDocumentFailure(
        "missing-node-reference",
        path,
        `${path} must contain a nonempty node id.`,
      );
    }

    if (rootIds.has(rootId)) {
      return modelDocumentFailure(
        "duplicate-root",
        path,
        `${path} duplicates root "${rootId}".`,
      );
    }

    if (!nodesById.has(rootId)) {
      return modelDocumentFailure(
        "missing-node-reference",
        path,
        `${path} does not resolve to a node.`,
      );
    }

    rootIds.add(rootId);
  }

  const parentCounts = new Map<string, number>();
  const referencedPrimitives = new Set<string>();
  const primitiveIds = new Set(primitives.map((primitive) => primitive.id));

  for (let nodeIndex = 0; nodeIndex < nodesValue.length; nodeIndex += 1) {
    const node = nodesValue[nodeIndex] as ToolcraftModelNode;
    const childIds = new Set<string>();
    for (let childIndex = 0; childIndex < node.children.length; childIndex += 1) {
      const childId = node.children[childIndex];
      const path = `nodes[${nodeIndex}].children[${childIndex}]`;
      if (!isNonemptyString(childId) || !nodesById.has(childId)) {
        return modelDocumentFailure(
          "missing-node-reference",
          path,
          `${path} does not resolve to a node.`,
        );
      }

      if (childIds.has(childId)) {
        return modelDocumentFailure(
          "duplicate-child",
          path,
          `${path} duplicates child "${childId}".`,
        );
      }

      childIds.add(childId);
      parentCounts.set(childId, (parentCounts.get(childId) ?? 0) + 1);
    }

    const nodePrimitiveIds = new Set<string>();
    for (
      let primitiveIndex = 0;
      primitiveIndex < node.primitiveIds.length;
      primitiveIndex += 1
    ) {
      const primitiveId = node.primitiveIds[primitiveIndex];
      const path = `nodes[${nodeIndex}].primitiveIds[${primitiveIndex}]`;
      if (!isNonemptyString(primitiveId) || !primitiveIds.has(primitiveId)) {
        return modelDocumentFailure(
          "missing-primitive-reference",
          path,
          `${path} does not resolve to a primitive.`,
        );
      }

      if (nodePrimitiveIds.has(primitiveId)) {
        return modelDocumentFailure(
          "duplicate-primitive-reference",
          path,
          `${path} duplicates primitive "${primitiveId}".`,
        );
      }

      nodePrimitiveIds.add(primitiveId);
      referencedPrimitives.add(primitiveId);
    }
  }

  const nodes = nodesValue as readonly ToolcraftModelNode[];
  const cycleNodeId = findHierarchyCycle(nodes, nodesById);
  if (cycleNodeId !== null) {
    return modelDocumentFailure(
      "hierarchy-cycle",
      `nodesById.${cycleNodeId}`,
      `Node hierarchy contains a cycle through "${cycleNodeId}".`,
    );
  }

  for (const node of nodes) {
    if ((parentCounts.get(node.id) ?? 0) > 1) {
      return modelDocumentFailure(
        "multiple-parents",
        `nodesById.${node.id}`,
        `Node "${node.id}" has more than one parent.`,
      );
    }
  }

  for (const rootId of rootIds) {
    if ((parentCounts.get(rootId) ?? 0) > 0) {
      return modelDocumentFailure(
        "root-has-parent",
        `rootNodeIds.${rootId}`,
        `Root node "${rootId}" also has a parent.`,
      );
    }
  }

  const reachable = new Set(rootIds);
  const pending = [...rootIds];
  for (let index = 0; index < pending.length; index += 1) {
    const node = nodesById.get(pending[index]!)!;
    for (const childId of node.children) {
      if (!reachable.has(childId)) {
        reachable.add(childId);
        pending.push(childId);
      }
    }
  }

  for (const node of nodes) {
    if (!reachable.has(node.id)) {
      return modelDocumentFailure(
        "unreachable-node",
        `nodesById.${node.id}`,
        `Node "${node.id}" is unreachable from the declared roots.`,
      );
    }
  }

  for (const primitive of primitives) {
    if (!referencedPrimitives.has(primitive.id)) {
      return modelDocumentFailure(
        "unreferenced-primitive",
        `primitivesById.${primitive.id}`,
        `Primitive "${primitive.id}" is not referenced by a node.`,
      );
    }
  }

  return VALID_TOOLCRAFT_MODEL_DOCUMENT;
}

