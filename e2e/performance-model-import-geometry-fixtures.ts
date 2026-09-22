import type {
  ToolcraftModelPerformanceDimensionId,
  ToolcraftModelPerformancePath,
} from "@/toolcraft/runtime";

export type ToolcraftModelFixtureGeometrySpec = Readonly<{
  includeNormals: boolean;
  nodeCount: number;
  primitiveCount: number;
  triangleCount: number;
  vertexCount: number;
}>;

type TriangleGridShape = Readonly<{
  cellColumns: number;
  cellRows: number;
  vertexColumns: number;
  vertexCount: number;
}>;

function getTriangleGridShape(triangleCount: number): TriangleGridShape {
  const cellCount = Math.max(1, Math.ceil(triangleCount / 2));
  const cellColumns = Math.max(1, Math.ceil(Math.sqrt(cellCount)));
  const cellRows = Math.max(1, Math.ceil(cellCount / cellColumns));
  const vertexColumns = cellColumns + 1;
  return {
    cellColumns,
    cellRows,
    vertexColumns,
    vertexCount: vertexColumns * (cellRows + 1),
  };
}

export function getToolcraftModelDimensionValue(
  path: ToolcraftModelPerformancePath,
  dimensionId: ToolcraftModelPerformanceDimensionId,
): number | undefined {
  return path.development.values[dimensionId];
}

export function getToolcraftModelFixtureGeometrySpec(
  path: ToolcraftModelPerformancePath,
  dimensionId?: ToolcraftModelPerformanceDimensionId,
): ToolcraftModelFixtureGeometrySpec {
  const target = dimensionId === undefined
    ? 1
    : getToolcraftModelDimensionValue(path, dimensionId) ?? 1;
  const trianglesTarget =
    getToolcraftModelDimensionValue(path, "model-triangles") ?? 1;

  if (dimensionId === "model-nodes") {
    return {
      includeNormals: false,
      nodeCount: target,
      primitiveCount: 1,
      triangleCount: 1,
      vertexCount: 3,
    };
  }
  if (dimensionId === "model-primitives") {
    return {
      includeNormals: false,
      nodeCount: 1,
      primitiveCount: target,
      triangleCount: 1,
      vertexCount: 3,
    };
  }
  if (dimensionId === "model-vertices") {
    return {
      includeNormals: false,
      nodeCount: 1,
      primitiveCount: 1,
      triangleCount: 1,
      vertexCount: Math.max(3, target),
    };
  }
  if (dimensionId === "model-decoded-bytes") {
    return {
      includeNormals: true,
      nodeCount: 1,
      primitiveCount: 1,
      triangleCount: 1,
      vertexCount: Math.max(3, Math.ceil(Math.max(0, target - 12) / 24)),
    };
  }
  if (dimensionId === "model-worker-bytes") {
    return getToolcraftModelFixtureGeometrySpec(path, "model-triangles");
  }
  if (dimensionId === "model-triangles") {
    const grid = getTriangleGridShape(target);
    return {
      includeNormals: false,
      nodeCount: 1,
      primitiveCount: 1,
      triangleCount: target,
      vertexCount: grid.vertexCount,
    };
  }

  return {
    includeNormals: false,
    nodeCount: 1,
    primitiveCount: 1,
    triangleCount: Math.max(1, Math.min(2, trianglesTarget)),
    vertexCount: 4,
  };
}

export function createToolcraftModelFixtureGeometry(
  spec: ToolcraftModelFixtureGeometrySpec,
): Readonly<{
  indices: Uint32Array;
  normals?: Float32Array;
  positions: Float32Array;
}> {
  const positions = new Float32Array(spec.vertexCount * 3);
  const triangleGrid = getTriangleGridShape(spec.triangleCount);
  const gridVertexCount = Math.min(triangleGrid.vertexCount, spec.vertexCount);
  for (let index = 0; index < gridVertexCount; index += 1) {
    const column = index % triangleGrid.vertexColumns;
    const row = Math.floor(index / triangleGrid.vertexColumns);
    positions[index * 3] = -1 + (column / triangleGrid.cellColumns) * 2;
    positions[index * 3 + 1] = -1 + (row / triangleGrid.cellRows) * 2;
  }
  const extraGridWidth = Math.max(2, Math.ceil(Math.sqrt(spec.vertexCount)));
  for (let index = gridVertexCount; index < spec.vertexCount; index += 1) {
    const column = index % extraGridWidth;
    const row = Math.floor(index / extraGridWidth) % extraGridWidth;
    positions[index * 3] = -0.9 + (column / (extraGridWidth - 1)) * 1.8;
    positions[index * 3 + 1] = -0.9 + (row / (extraGridWidth - 1)) * 1.8;
  }

  const indices = new Uint32Array(spec.triangleCount * 3);
  let triangle = 0;
  for (let row = 0; row < triangleGrid.cellRows; row += 1) {
    for (let column = 0; column < triangleGrid.cellColumns; column += 1) {
      const topLeft = row * triangleGrid.vertexColumns + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + triangleGrid.vertexColumns;
      const bottomRight = bottomLeft + 1;
      indices.set([topLeft, topRight, bottomLeft], triangle * 3);
      triangle += 1;
      if (triangle >= spec.triangleCount) break;
      indices.set([topRight, bottomRight, bottomLeft], triangle * 3);
      triangle += 1;
      if (triangle >= spec.triangleCount) break;
    }
    if (triangle >= spec.triangleCount) break;
  }

  if (!spec.includeNormals) return { indices, positions };
  const normals = new Float32Array(spec.vertexCount * 3);
  for (let index = 0; index < spec.vertexCount; index += 1) {
    normals[index * 3 + 2] = 1;
  }
  return { indices, normals, positions };
}
