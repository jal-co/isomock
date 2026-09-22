import type { GLTF } from "@gltf-transform/core";

import type { ToolcraftModelImportLimits } from "../../schema/types";
import {
  checkedGltfTotal,
  gltfDecodeCheckpoint,
  gltfDecodeFailure,
} from "./gltf-decode-safety";
import {
  gltfJsonArray,
  gltfJsonIndexed,
  gltfJsonInteger,
  gltfJsonRecord,
} from "./gltf-json-inspection";

function validateTransform(
  node: Record<string, unknown>,
  nodeIndex: number,
): void {
  if (
    node.matrix !== undefined &&
    (node.rotation !== undefined ||
      node.scale !== undefined ||
      node.translation !== undefined)
  ) {
    gltfDecodeFailure(
      "geometry",
      "invalid-node-transform",
      `node ${nodeIndex} cannot combine matrix and TRS transforms.`,
    );
  }
  for (const key of ["matrix", "rotation", "scale", "translation"] as const) {
    if (node[key] === undefined) continue;
    const values = gltfJsonArray(
      node[key],
      "invalid-gltf-node",
      `node ${nodeIndex}.${key}`,
    );
    const expected = key === "matrix" ? 16 : key === "rotation" ? 4 : 3;
    if (
      values.length !== expected ||
      values.some(
        (value) => typeof value !== "number" || !Number.isFinite(value),
      )
    ) {
      return gltfDecodeFailure(
        "geometry",
        "invalid-node-transform",
        `node ${nodeIndex}.${key} is not a finite ${expected}-component transform.`,
      );
    }
  }
}

function validateHierarchy(
  childrenByNode: readonly (readonly number[])[],
  signal: AbortSignal,
): Int32Array {
  const parents = new Int32Array(childrenByNode.length).fill(-1);
  childrenByNode.forEach((children, parent) => {
    const unique = new Set<number>();
    children.forEach((child) => {
      if (child === parent || unique.has(child) || parents[child] !== -1) {
        gltfDecodeFailure(
          "format",
          "invalid-gltf-hierarchy",
          "glTF nodes must form a hierarchy with unique child ownership.",
        );
      }
      unique.add(child);
      parents[child] = parent;
    });
  });

  const states = new Uint8Array(childrenByNode.length);
  for (let start = 0; start < childrenByNode.length; start += 1) {
    gltfDecodeCheckpoint(signal, start);
    if (states[start] === 2) continue;
    const stack: Array<[number, number]> = [[start, 0]];
    while (stack.length > 0) {
      const current = stack.at(-1)!;
      const node = current[0];
      if (states[node] === 0) states[node] = 1;
      const children = childrenByNode[node]!;
      if (current[1] >= children.length) {
        states[node] = 2;
        stack.pop();
        continue;
      }
      const child = children[current[1]]!;
      current[1] += 1;
      if (states[child] === 1) {
        return gltfDecodeFailure(
          "format",
          "invalid-gltf-hierarchy",
          "glTF node hierarchy contains a cycle.",
        );
      }
      if (states[child] === 0) stack.push([child, 0]);
    }
  }
  return parents;
}

export function preflightGltfNodes(
  json: GLTF.IGLTF,
  meshCount: number,
  limits: ToolcraftModelImportLimits,
  signal: AbortSignal,
): { metadataBytes: number; nodeCount: number } {
  const nodes = gltfJsonArray(json.nodes, "invalid-gltf-nodes", "glTF nodes");
  if (nodes.length > limits.maxNodes) {
    return gltfDecodeFailure(
      "resource-limit",
      "max-nodes-exceeded",
      `glTF exceeds maxNodes ${limits.maxNodes}.`,
    );
  }
  let metadataBytes = 1_024;
  const childrenByNode: number[][] = [];
  nodes.forEach((nodeValue, index) => {
    gltfDecodeCheckpoint(signal, index);
    const node = gltfJsonRecord(
      nodeValue,
      "invalid-gltf-node",
      `node ${index}`,
    );
    if (node.mesh !== undefined) {
      const mesh = gltfJsonInteger(
        node.mesh,
        "invalid-gltf-node",
        `node ${index}.mesh`,
      );
      if (mesh >= meshCount) {
        return gltfDecodeFailure(
          "format",
          "invalid-gltf-node",
          `node ${index}.mesh is out of range.`,
        );
      }
    }
    const children = gltfJsonArray(
      node.children,
      "invalid-gltf-node",
      `node ${index}.children`,
    ).map((child) => {
      const childIndex = gltfJsonInteger(
        child,
        "invalid-gltf-node",
        `node ${index} child`,
      );
      if (childIndex >= nodes.length) {
        return gltfDecodeFailure(
          "format",
          "invalid-gltf-node",
          `node ${index} child is out of range.`,
        );
      }
      return childIndex;
    });
    childrenByNode.push(children);
    validateTransform(node, index);
    metadataBytes = checkedGltfTotal(
      metadataBytes,
      512 +
        (typeof node.name === "string" ? node.name.length * 2 : 0) +
        children.length * 96,
      limits.maxEstimatedWorkerBytes,
      "estimated-worker-memory-limit-exceeded",
      "glTF hierarchy metadata",
    );
  });
  const parents = validateHierarchy(childrenByNode, signal);

  const scenes = gltfJsonArray(
    json.scenes,
    "invalid-gltf-scenes",
    "glTF scenes",
  );
  scenes.forEach((sceneValue, index) => {
    gltfDecodeCheckpoint(signal, index);
    const scene = gltfJsonRecord(
      sceneValue,
      "invalid-gltf-scene",
      `scene ${index}`,
    );
    const roots = new Set<number>();
    gltfJsonArray(
      scene.nodes,
      "invalid-gltf-scene",
      `scene ${index}.nodes`,
    ).forEach((node) => {
      const rootIndex = gltfJsonInteger(
        node,
        "invalid-gltf-scene",
        "Scene root node",
      );
      gltfJsonIndexed(
        nodes,
        rootIndex,
        "invalid-gltf-scene",
        "Scene root node",
      );
      if (roots.has(rootIndex) || parents[rootIndex] !== -1) {
        return gltfDecodeFailure(
          "format",
          "invalid-gltf-hierarchy",
          "Scene roots must be unique nodes without node parents.",
        );
      }
      roots.add(rootIndex);
    });
  });
  if (json.scene !== undefined) {
    gltfJsonIndexed(scenes, json.scene, "invalid-gltf-scene", "Default scene");
  }
  return { metadataBytes, nodeCount: nodes.length };
}
