import type {
  ToolcraftModelFormat,
  ToolcraftModelPerformanceDimensionId,
  ToolcraftModelPerformancePath,
} from "@/toolcraft/runtime";

import {
  createToolcraftModelFixtureGeometry,
  getToolcraftModelDimensionValue,
  getToolcraftModelFixtureGeometrySpec,
  type ToolcraftModelFixtureGeometrySpec,
} from "./performance-model-import-geometry-fixtures";

const encoder = new TextEncoder();

export type ToolcraftModelBrowserFixtureFile = Readonly<{
  buffer: Buffer;
  mimeType: string;
  name: string;
}>;

export type ToolcraftModelBrowserFixture = Readonly<{
  encoding: "ascii" | "binary" | "json-bundle";
  files: readonly ToolcraftModelBrowserFixtureFile[];
  format: ToolcraftModelFormat;
  observed: Readonly<{
    bundleFiles: number;
    sourceBytes: number;
  }>;
}>;

function align4(value: number): number {
  return (value + 3) & ~3;
}

function asBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function createGltfParts(
  spec: ToolcraftModelFixtureGeometrySpec,
  bufferUri?: string,
) {
  const geometry = createToolcraftModelFixtureGeometry(spec);
  const positionBytes = new Uint8Array(geometry.positions.buffer);
  const normalBytes = geometry.normals
    ? new Uint8Array(geometry.normals.buffer)
    : undefined;
  const indexOffset = align4(
    positionBytes.byteLength + (normalBytes?.byteLength ?? 0),
  );
  const bin = new Uint8Array(indexOffset + geometry.indices.byteLength);
  bin.set(positionBytes);
  if (normalBytes) bin.set(normalBytes, positionBytes.byteLength);
  bin.set(new Uint8Array(geometry.indices.buffer), indexOffset);

  const bufferViews = [
    { buffer: 0, byteLength: positionBytes.byteLength, byteOffset: 0, target: 34962 },
    ...(normalBytes
      ? [{
          buffer: 0,
          byteLength: normalBytes.byteLength,
          byteOffset: positionBytes.byteLength,
          target: 34962,
        }]
      : []),
    {
      buffer: 0,
      byteLength: geometry.indices.byteLength,
      byteOffset: indexOffset,
      target: 34963,
    },
  ];
  const normalAccessor = normalBytes ? 1 : undefined;
  const indexAccessor = normalBytes ? 2 : 1;
  const attributes = normalAccessor === undefined
    ? { POSITION: 0 }
    : { NORMAL: normalAccessor, POSITION: 0 };
  const primitives = Array.from({ length: spec.primitiveCount }, () => ({
    attributes,
    indices: indexAccessor,
    mode: 4,
  }));
  const nodes = Array.from({ length: spec.nodeCount }, (_, index) =>
    index === 0 ? { mesh: 0 } : { name: `Pressure node ${index}` }
  );
  const json = {
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: spec.vertexCount,
        max: [1, 1, 0],
        min: [-1, -1, 0],
        type: "VEC3",
      },
      ...(normalBytes
        ? [{ bufferView: 1, componentType: 5126, count: spec.vertexCount, type: "VEC3" }]
        : []),
      {
        bufferView: normalBytes ? 2 : 1,
        componentType: 5125,
        count: geometry.indices.length,
        type: "SCALAR",
      },
    ],
    asset: { generator: "Toolcraft protected model performance fixture", version: "2.0" },
    buffers: [{ byteLength: bin.byteLength, ...(bufferUri ? { uri: bufferUri } : {}) }],
    bufferViews,
    meshes: [{ primitives }],
    nodes,
    scene: 0,
    scenes: [{ nodes: nodes.map((_, index) => index) }],
  };
  return { bin, json };
}

function encodeGlb(
  spec: ToolcraftModelFixtureGeometrySpec,
  minimumBytes = 0,
): Uint8Array {
  const parts = createGltfParts(spec);
  const rawJson = encoder.encode(JSON.stringify(parts.json));
  const jsonLength = align4(rawJson.byteLength);
  const baseLength = 12 + 8 + jsonLength + 8 + align4(parts.bin.byteLength);
  const totalLength = Math.max(baseLength, align4(minimumBytes));
  const binLength = totalLength - (12 + 8 + jsonLength + 8);
  const bytes = new Uint8Array(totalLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20, 20 + jsonLength);
  bytes.set(rawJson, 20);
  const binHeader = 20 + jsonLength;
  view.setUint32(binHeader, binLength, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  bytes.set(parts.bin, binHeader + 8);
  return bytes;
}

function createGlbFixture(
  spec: ToolcraftModelFixtureGeometrySpec,
  minimumBytes = 0,
): ToolcraftModelBrowserFixture {
  const bytes = encodeGlb(spec, minimumBytes);
  return fixture("glb", "binary", [file("scene.glb", "model/gltf-binary", bytes)]);
}

function createGltfFixture(
  spec: ToolcraftModelFixtureGeometrySpec,
  fileCount = 2,
  minimumBytes = 0,
): ToolcraftModelBrowserFixture {
  const dependencyCount = Math.max(1, fileCount - 1);
  const bufferUris = Array.from(
    { length: dependencyCount },
    (_, index) => `mesh-${index + 1}.bin`,
  );
  const parts = createGltfParts(spec, bufferUris[0]);
  const json = {
    ...parts.json,
    buffers: [
      { byteLength: parts.bin.byteLength, uri: bufferUris[0] },
      ...bufferUris.slice(1).map((uri) => ({ byteLength: 1, uri })),
    ],
  };
  const root = encoder.encode(JSON.stringify(json));
  const currentBytes = root.byteLength + parts.bin.byteLength + dependencyCount - 1;
  const firstBin = new Uint8Array(
    parts.bin.byteLength + Math.max(0, minimumBytes - currentBytes),
  );
  firstBin.set(parts.bin);
  const files = [
    file("scene.gltf", "model/gltf+json", root),
    file(bufferUris[0]!, "application/octet-stream", firstBin),
    ...bufferUris.slice(1).map((uri) =>
      file(uri, "application/octet-stream", new Uint8Array([0]))
    ),
  ];
  return fixture("gltf", "json-bundle", files);
}

function createObjFixture(
  spec: ToolcraftModelFixtureGeometrySpec,
  minimumBytes = 0,
): ToolcraftModelBrowserFixture {
  const geometry = createToolcraftModelFixtureGeometry(spec);
  const lines = ["o ToolcraftPressure"];
  for (let index = 0; index < spec.vertexCount; index += 1) {
    lines.push(`v ${geometry.positions[index * 3]} ${geometry.positions[index * 3 + 1]} 0`);
  }
  for (let triangle = 0; triangle < spec.triangleCount; triangle += 1) {
    lines.push(
      `f ${geometry.indices[triangle * 3]! + 1} ${geometry.indices[triangle * 3 + 1]! + 1} ${geometry.indices[triangle * 3 + 2]! + 1}`,
    );
  }
  let text = `${lines.join("\n")}\n`;
  if (encoder.encode(text).byteLength < minimumBytes) {
    text += `#${" ".repeat(Math.max(0, minimumBytes - encoder.encode(text).byteLength - 2))}\n`;
  }
  return fixture("obj", "ascii", [file("scene.obj", "model/obj", encoder.encode(text))]);
}

function createBinaryPlyFixture(
  spec: ToolcraftModelFixtureGeometrySpec,
  minimumBytes = 0,
): ToolcraftModelBrowserFixture {
  const geometry = createToolcraftModelFixtureGeometry(spec);
  const header = encoder.encode(`ply\nformat binary_little_endian 1.0\nelement vertex ${spec.vertexCount}\nproperty float x\nproperty float y\nproperty float z\nelement face ${spec.triangleCount}\nproperty list uchar int vertex_indices\nend_header\n`);
  const bodyLength = spec.vertexCount * 12 + spec.triangleCount * 13;
  const bytes = new Uint8Array(Math.max(header.byteLength + bodyLength, minimumBytes));
  bytes.set(header);
  const view = new DataView(bytes.buffer);
  let offset = header.byteLength;
  for (const value of geometry.positions) {
    view.setFloat32(offset, value, true);
    offset += 4;
  }
  for (let triangle = 0; triangle < spec.triangleCount; triangle += 1) {
    view.setUint8(offset, 3);
    offset += 1;
    for (let corner = 0; corner < 3; corner += 1) {
      view.setInt32(offset, geometry.indices[triangle * 3 + corner]!, true);
      offset += 4;
    }
  }
  return fixture("ply", "binary", [file("scene.ply", "application/octet-stream", bytes)]);
}

function createAsciiPlyFixture(): ToolcraftModelBrowserFixture {
  return fixture("ply", "ascii", [file(
    "scene-ascii.ply",
    "application/octet-stream",
    encoder.encode("ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n"),
  )]);
}

function createBinaryStlFixture(
  spec: ToolcraftModelFixtureGeometrySpec,
  minimumBytes = 0,
): ToolcraftModelBrowserFixture {
  const triangleCount = Math.max(1, Math.min(
    spec.triangleCount,
    Math.floor(spec.vertexCount / 3),
  ));
  const logicalLength = 84 + triangleCount * 50;
  const bytes = new Uint8Array(Math.max(logicalLength, minimumBytes));
  bytes.set(encoder.encode("Toolcraft protected STL pressure fixture").subarray(0, 80));
  const view = new DataView(bytes.buffer);
  view.setUint32(80, triangleCount, true);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = 84 + triangle * 50;
    view.setFloat32(offset + 12, triangle, true);
    view.setFloat32(offset + 24, triangle + 1, true);
    view.setFloat32(offset + 40, 1, true);
  }
  return fixture("stl", "binary", [file("scene.stl", "model/stl", bytes)]);
}

function createAsciiStlFixture(): ToolcraftModelBrowserFixture {
  return fixture("stl", "ascii", [file(
    "scene-ascii.stl",
    "model/stl",
    encoder.encode("solid scene\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid scene\n"),
  )]);
}

function createFbxFixture(
  spec: ToolcraftModelFixtureGeometrySpec,
  minimumBytes = 0,
): ToolcraftModelBrowserFixture {
  const geometry = createToolcraftModelFixtureGeometry(spec);
  const vertices = Array.from(geometry.positions).join(",");
  const polygonIndices = Array.from(geometry.indices, (value, index) =>
    index % 3 === 2 ? -value - 1 : value
  ).join(",");
  let text = `; FBX 7.4.0 project file
FBXHeaderExtension:  {
\tFBXHeaderVersion: 1003
\tFBXVersion: 7400
}
GlobalSettings:  {
\tVersion: 1000
\tProperties70:  {
\t\tP: "UpAxis", "int", "Integer", "",1
\t\tP: "UnitScaleFactor", "double", "Number", "",1
\t}
}
Objects:  {
\tGeometry: 1, "Geometry::Pressure", "Mesh" {
\t\tVertices: *${geometry.positions.length} {
\t\t\ta: ${vertices}
\t\t}
\t\tPolygonVertexIndex: *${geometry.indices.length} {
\t\t\ta: ${polygonIndices}
\t\t}
\t}
\tModel: 2, "Model::Pressure", "Mesh" {
\t\tVersion: 232
\t\tProperties70:  {
\t\t\tP: "Lcl Translation", "Lcl Translation", "", "A",0,0,0
\t\t\tP: "Lcl Rotation", "Lcl Rotation", "", "A",0,0,0
\t\t\tP: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1
\t\t}
\t\tShading: T
\t\tCulling: "CullingOff"
\t}
}
Connections:  {
\tC: "OO",1,2
\tC: "OO",2,0
}
`;
  if (encoder.encode(text).byteLength < minimumBytes) {
    text += `;${" ".repeat(Math.max(0, minimumBytes - encoder.encode(text).byteLength - 2))}\n`;
  }
  return fixture("fbx", "ascii", [file("scene.fbx", "application/octet-stream", encoder.encode(text))]);
}

function file(
  name: string,
  mimeType: string,
  bytes: Uint8Array,
): ToolcraftModelBrowserFixtureFile {
  return Object.freeze({ buffer: asBuffer(bytes), mimeType, name });
}

function fixture(
  format: ToolcraftModelFormat,
  encoding: ToolcraftModelBrowserFixture["encoding"],
  files: readonly ToolcraftModelBrowserFixtureFile[],
): ToolcraftModelBrowserFixture {
  return Object.freeze({
    encoding,
    files: Object.freeze([...files]),
    format,
    observed: Object.freeze({
      bundleFiles: files.length,
      sourceBytes: files.reduce((total, entry) => total + entry.buffer.byteLength, 0),
    }),
  });
}

function withBundleFilePressure(
  source: ToolcraftModelBrowserFixture,
  fileCount: number,
): ToolcraftModelBrowserFixture {
  if (source.files.length >= fileCount) return source;
  const sidecars = Array.from(
    { length: fileCount - source.files.length },
    (_, index) => file(
      `dependency-${index + 1}.bin`,
      "application/octet-stream",
      new Uint8Array([index % 256]),
    ),
  );
  return fixture(source.format, source.encoding, [...source.files, ...sidecars]);
}

function selectPressureFormat(
  formats: readonly ToolcraftModelFormat[],
): ToolcraftModelFormat {
  for (const format of ["glb", "gltf", "ply", "obj", "stl", "fbx"] as const) {
    if (formats.includes(format)) return format;
  }
  throw new Error("Model performance path has no supported fixture format.");
}

export function createToolcraftModelPressureFixture(
  path: ToolcraftModelPerformancePath,
  dimensionId: ToolcraftModelPerformanceDimensionId,
): ToolcraftModelBrowserFixture {
  const format = dimensionId === "model-bundle-files" && path.formats.includes("gltf")
    ? "gltf"
    : selectPressureFormat(path.formats);
  const spec = getToolcraftModelFixtureGeometrySpec(path, dimensionId);
  const minimumBytes = dimensionId === "model-source-bytes"
    ? getToolcraftModelDimensionValue(path, dimensionId) ?? 0
    : 0;
  const fileCount = dimensionId === "model-bundle-files"
    ? getToolcraftModelDimensionValue(path, dimensionId) ?? 2
    : 2;

  let pressureFixture: ToolcraftModelBrowserFixture;
  switch (format) {
    case "glb":
      pressureFixture = createGlbFixture(spec, minimumBytes);
      break;
    case "gltf":
      pressureFixture = createGltfFixture(spec, fileCount, minimumBytes);
      break;
    case "obj":
      pressureFixture = createObjFixture(spec, minimumBytes);
      break;
    case "ply":
      pressureFixture = createBinaryPlyFixture(spec, minimumBytes);
      break;
    case "stl":
      pressureFixture = createBinaryStlFixture(spec, minimumBytes);
      break;
    case "fbx":
      pressureFixture = createFbxFixture(spec, minimumBytes);
      break;
  }
  return dimensionId === "model-bundle-files"
    ? withBundleFilePressure(pressureFixture, fileCount)
    : pressureFixture;
}

export function createToolcraftModelCompatibilityFixtures(
  formats: readonly ToolcraftModelFormat[],
): readonly ToolcraftModelBrowserFixture[] {
  const spec: ToolcraftModelFixtureGeometrySpec = {
    includeNormals: false,
    nodeCount: 1,
    primitiveCount: 1,
    triangleCount: 1,
    vertexCount: 3,
  };
  return Object.freeze(formats.flatMap((format) => {
    switch (format) {
      case "glb":
        return [createGlbFixture(spec)];
      case "gltf":
        return [createGltfFixture(spec)];
      case "obj":
        return [createObjFixture(spec)];
      case "ply":
        return [createAsciiPlyFixture(), createBinaryPlyFixture(spec)];
      case "stl":
        return [createAsciiStlFixture(), createBinaryStlFixture(spec)];
      case "fbx":
        return [createFbxFixture(spec)];
    }
  }));
}
