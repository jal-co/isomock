import type { Document } from "@gltf-transform/core";

import {
  gltfDecodeCheckpoint,
  gltfDecodeFailure,
} from "./gltf-decode-safety";
import type { GltfDecodedCountExpectation } from "./gltf-primitive-preflight";

export function validateGltfDecodedCounts(
  document: Document,
  expectations: readonly GltfDecodedCountExpectation[],
  signal: AbortSignal,
): void {
  const meshes = document.getRoot().listMeshes();
  expectations.forEach((expected, index) => {
    gltfDecodeCheckpoint(signal, index);
    const primitive = meshes[expected.meshIndex]?.listPrimitives()[
      expected.primitiveIndex
    ];
    const position = primitive?.getAttribute("POSITION");
    const normal = primitive?.getAttribute("NORMAL");
    const indices = primitive?.getIndices();
    if (
      !position ||
      position.getCount() !== expected.positionCount ||
      (expected.normalCount !== undefined &&
        (!normal || normal.getCount() !== expected.normalCount)) ||
      (expected.indexCount !== undefined &&
        (!indices || indices.getCount() !== expected.indexCount))
    ) {
      return gltfDecodeFailure(
        "geometry",
        "decoded-accessor-count-mismatch",
        "Decoded glTF geometry counts do not match their bounded accessor declarations.",
      );
    }
  });
}
