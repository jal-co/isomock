import type { GLTF, JSONDocument } from "@gltf-transform/core";

import type { ToolcraftModelImportLimits } from "../../schema/types";
import { preflightGltfAccessors } from "./gltf-accessor-preflight";
import { preflightGltfBuffers } from "./gltf-buffer-preflight";
import {
  checkedGltfScale,
  checkedGltfTotal,
  throwIfGltfDecodeAborted,
} from "./gltf-decode-safety";
import { preflightGltfNodes } from "./gltf-node-preflight";
import { preflightGltfPrimitives } from "./gltf-primitive-preflight";
import type { GltfDecodedCountExpectation } from "./gltf-primitive-preflight";
import { preflightGltfAppearanceResources } from "./gltf-texture-resource";

function totalWithin(
  values: readonly number[],
  maximum: number,
  code: string,
  label: string,
  initial = 0,
): number {
  return values.reduce(
    (total, value) =>
      checkedGltfTotal(total, value, maximum, code, label),
    initial,
  );
}

export function preflightGltfJsonDocument(
  json: GLTF.IGLTF,
  resources: JSONDocument["resources"],
  sourceWorkerBytes: number,
  limits: ToolcraftModelImportLimits,
  signal: AbortSignal,
): {
  decodedCountExpectations: GltfDecodedCountExpectation[];
  retainedWorkerBytes: number;
} {
  throwIfGltfDecodeAborted(signal);
  const retainedWorkerBytes = totalWithin(
    [sourceWorkerBytes],
    limits.maxEstimatedWorkerBytes,
    "estimated-worker-memory-limit-exceeded",
    "glTF source snapshot memory",
  );
  const buffers = preflightGltfBuffers(
    json,
    resources,
    retainedWorkerBytes,
    limits,
    signal,
  );
  const accessors = preflightGltfAccessors(
    json,
    buffers.bufferViews,
    limits,
    signal,
  );
  const primitives = preflightGltfPrimitives(
    json,
    accessors.accessors,
    buffers.bufferViews,
    limits,
    signal,
  );
  const hierarchy = preflightGltfNodes(
    json,
    primitives.meshCount,
    limits,
    signal,
  );
  const appearance = preflightGltfAppearanceResources(
    json,
    resources,
    buffers.bufferViews,
    limits,
    signal,
  );

  totalWithin(
    [
      buffers.embeddedBytes,
      buffers.meshoptBytes,
      accessors.decodedBytes,
      primitives.canonicalBytes,
      appearance.imageBytes,
    ],
    limits.maxDecodedBytes,
    "decoded-byte-limit-exceeded",
    "Decoded glTF geometry",
  );
  totalWithin(
    [
      buffers.embeddedBytes,
      buffers.meshoptBytes,
      accessors.decodedBytes,
      appearance.imageBytes,
      primitives.dracoScratchBytes,
      checkedGltfScale(
        totalWithin(
          [
            hierarchy.metadataBytes,
            checkedGltfScale(
              primitives.primitiveCount,
              256,
              "estimated-worker-memory-limit-exceeded",
            ),
          ],
          Number.MAX_SAFE_INTEGER,
          "estimated-worker-memory-limit-exceeded",
          "glTF canonical snapshot metadata",
          primitives.canonicalBytes,
        ),
        2,
        "estimated-worker-memory-limit-exceeded",
      ),
    ],
    limits.maxEstimatedWorkerBytes,
    "estimated-worker-memory-limit-exceeded",
    "glTF worker memory",
    retainedWorkerBytes,
  );
  return {
    decodedCountExpectations: primitives.decodedCountExpectations,
    retainedWorkerBytes,
  };
}
