import type { Document, Mesh, Node } from "@gltf-transform/core";

import type { ToolcraftModelImportLimits } from "../../schema/types";
import type { ToolcraftModelNode } from "../canonical/model-document";
import {
  checkedGltfScale,
  checkedGltfTotal,
  gltfDecodeCheckpoint,
  gltfDecodeFailure,
} from "./gltf-decode-safety";

export type GltfCanonicalHierarchyPlan = Readonly<{
  localMatrices: ReadonlyMap<Node, ToolcraftModelNode["localMatrix"]>;
  nodes: Node[];
  nodePrimitiveReferenceCount: number;
  plannedMetadataBytes: number;
  referencedMeshes: ReadonlySet<Mesh>;
  referencedPrimitiveCount: number;
  roots: Node[];
}>;

function reachableNodes(
  document: Document,
  signal: AbortSignal,
): { nodes: Node[]; roots: Node[] } {
  const root = document.getRoot();
  const sourceNodes = root.listNodes();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const roots =
    scene?.listChildren() ??
    sourceNodes.filter((node) => !node.getParentNode());
  const reachable = new Set<Node>();
  const stack = [...roots];
  let visited = 0;
  while (stack.length > 0) {
    gltfDecodeCheckpoint(signal, visited);
    visited += 1;
    const node = stack.pop()!;
    if (reachable.has(node)) continue;
    reachable.add(node);
    for (const child of node.listChildren()) stack.push(child);
  }
  return {
    nodes: sourceNodes.filter((node) => reachable.has(node)),
    roots,
  };
}

function matrixForNode(node: Node): ToolcraftModelNode["localMatrix"] {
  const matrix = Array.from(node.getMatrix());
  if (matrix.length !== 16 || matrix.some((value) => !Number.isFinite(value))) {
    return gltfDecodeFailure(
      "geometry",
      "invalid-node-transform",
      "A glTF node local transform does not produce a finite matrix.",
    );
  }
  return matrix as unknown as ToolcraftModelNode["localMatrix"];
}

export function planGltfCanonicalHierarchy(
  gltf: Document,
  limits: ToolcraftModelImportLimits,
  retainedWorkerBytes: number,
  signal: AbortSignal,
): GltfCanonicalHierarchyPlan {
  if (gltf.getRoot().listNodes().length > limits.maxNodes) {
    return gltfDecodeFailure(
      "resource-limit",
      "max-nodes-exceeded",
      `Canonical hierarchy exceeds maxNodes ${limits.maxNodes}.`,
    );
  }
  const selected = reachableNodes(gltf, signal);
  const referencedMeshes = new Set<Mesh>();
  let childReferenceCount = 0;
  let nodePrimitiveReferenceCount = 0;
  selected.nodes.forEach((node, index) => {
    gltfDecodeCheckpoint(signal, index);
    const mesh = node.getMesh();
    if (mesh) {
      referencedMeshes.add(mesh);
      nodePrimitiveReferenceCount = checkedGltfTotal(
        nodePrimitiveReferenceCount,
        mesh.listPrimitives().length,
        Number.MAX_SAFE_INTEGER,
        "estimated-worker-memory-limit-exceeded",
        "glTF node primitive references",
      );
    }
    childReferenceCount = checkedGltfTotal(
      childReferenceCount,
      node.listChildren().length,
      Number.MAX_SAFE_INTEGER,
      "estimated-worker-memory-limit-exceeded",
      "glTF child references",
    );
  });
  let referencedPrimitiveCount = 0;
  let meshIndex = 0;
  for (const mesh of referencedMeshes) {
    gltfDecodeCheckpoint(signal, meshIndex);
    meshIndex += 1;
    const meshPrimitives = mesh.listPrimitives().length;
    if (referencedPrimitiveCount > limits.maxPrimitives - meshPrimitives) {
      return gltfDecodeFailure(
        "resource-limit",
        "max-primitives-exceeded",
        `Canonical geometry exceeds maxPrimitives ${limits.maxPrimitives}.`,
      );
    }
    referencedPrimitiveCount += meshPrimitives;
  }
  const baseMetadataBytes = checkedGltfTotal(
    checkedGltfTotal(
      1_024,
      checkedGltfScale(
        selected.nodes.length,
        512,
        "estimated-worker-memory-limit-exceeded",
      ),
      limits.maxEstimatedWorkerBytes,
      "estimated-worker-memory-limit-exceeded",
      "glTF canonical metadata",
    ),
    checkedGltfScale(
      referencedPrimitiveCount,
      256,
      "estimated-worker-memory-limit-exceeded",
    ),
    limits.maxEstimatedWorkerBytes,
    "estimated-worker-memory-limit-exceeded",
    "glTF canonical metadata",
  );
  const totalReferenceCount = checkedGltfTotal(
    checkedGltfTotal(
      nodePrimitiveReferenceCount,
      childReferenceCount,
      Number.MAX_SAFE_INTEGER,
      "estimated-worker-memory-limit-exceeded",
      "glTF canonical references",
    ),
    selected.roots.length,
    Number.MAX_SAFE_INTEGER,
    "estimated-worker-memory-limit-exceeded",
    "glTF canonical references",
  );
  const plannedMetadataBytes = checkedGltfTotal(
    baseMetadataBytes,
    checkedGltfScale(
      totalReferenceCount,
      96,
      "estimated-worker-memory-limit-exceeded",
    ),
    limits.maxEstimatedWorkerBytes,
    "estimated-worker-memory-limit-exceeded",
    "glTF canonical metadata",
  );
  checkedGltfTotal(
    retainedWorkerBytes,
    plannedMetadataBytes,
    limits.maxEstimatedWorkerBytes,
    "estimated-worker-memory-limit-exceeded",
    "glTF worker memory",
  );
  const localMatrices = new Map<Node, ToolcraftModelNode["localMatrix"]>();
  selected.nodes.forEach((node, index) => {
    gltfDecodeCheckpoint(signal, index);
    localMatrices.set(node, matrixForNode(node));
  });
  return {
    localMatrices,
    nodes: selected.nodes,
    nodePrimitiveReferenceCount,
    plannedMetadataBytes,
    referencedMeshes,
    referencedPrimitiveCount,
    roots: selected.roots,
  };
}
