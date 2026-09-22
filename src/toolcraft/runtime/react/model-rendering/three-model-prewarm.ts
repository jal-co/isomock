import type { ToolcraftModelDocument } from "../../model-import/canonical/model-document";

export function createToolcraftThreePrewarmDocument(): ToolcraftModelDocument {
  const bounds = { max: [1, 1, 0], min: [-1, -1, 0] } as const;
  return {
    bounds,
    nodes: [
      {
        children: [],
        id: "toolcraft-prewarm-node",
        localMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        name: "Toolcraft renderer prewarm",
        primitiveIds: ["toolcraft-prewarm-fallback", "toolcraft-prewarm-vertex-color"],
      },
    ],
    materials: [
      {
        alphaCutoff: 0.5,
        alphaMode: "opaque",
        baseColor: [0.8, 0.8, 0.8],
        doubleSided: false,
        emissive: [0, 0, 0],
        id: "toolcraft-prewarm-material",
        metallic: 0,
        opacity: 1,
        roughness: 0.5,
        usesVertexColor: true,
      },
    ],
    primitives: [
      {
        bounds,
        id: "toolcraft-prewarm-fallback",
        indices: new Uint32Array([0, 1, 2]),
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]),
      },
      {
        bounds,
        colors: {
          components: 3,
          values: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
        },
        id: "toolcraft-prewarm-vertex-color",
        indices: new Uint32Array([0, 1, 2]),
        materialId: "toolcraft-prewarm-material",
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]),
      },
    ],
    provenance: {
      adapterVersion: "toolcraft-render-prewarm@2",
      canonicalSchemaVersion: 2,
      operations: ["deterministic-triangulation", "sequential-indexing"],
      sourceFormat: "glb",
    },
    rootNodeIds: ["toolcraft-prewarm-node"],
    textures: [],
    version: 2,
  };
}
