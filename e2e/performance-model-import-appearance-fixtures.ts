import type { ToolcraftModelBrowserFixture } from "./performance-model-import-fixtures";
import { file, fixture } from "./performance-model-import-appearance-fixture-support";
import { createToolcraftVertexColorPlyFile } from "./performance-model-import-binary-appearance-fixtures";
import { createZip } from "./performance-model-import-zip-fixtures";

const encoder = new TextEncoder();
const fallbackMaterialSignature =
  "fallback:base-linear(0.8,0.8,0.8):metallic(0):roughness(0.5):emissive(0,0,0):alpha(1)";
const redPixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0asAAAAASUVORK5CYII=",
  "base64",
);

export type ToolcraftModelAppearanceFixtureExpectation = Readonly<{
  appearance: "authored" | "fallback" | "warning";
  materialSignature: string;
  outcome: "ready" | "rejected";
  packageKind: "folder" | "standalone" | "zip";
  rejectionCode?: string;
  selectedRootPath: string;
  warningCode?: string;
}>;

export type ToolcraftModelAppearanceFixtureCase = Readonly<{
  expected: ToolcraftModelAppearanceFixtureExpectation;
  fixture: ToolcraftModelBrowserFixture;
  id: string;
}>;

function geometryBuffer(): Uint8Array {
  const bytes = new Uint8Array(44);
  const view = new DataView(bytes.buffer);
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  for (let index = 0; index < positions.length; index += 1) {
    view.setFloat32(index * 4, positions[index]!, true);
  }
  view.setUint16(36, 0, true);
  view.setUint16(38, 1, true);
  view.setUint16(40, 2, true);
  return bytes;
}

function geometryBufferWithNormals(): Uint8Array {
  const bytes = new Uint8Array(80);
  const view = new DataView(bytes.buffer);
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
  for (let index = 0; index < positions.length; index += 1) {
    view.setFloat32(index * 4, positions[index]!, true);
    view.setFloat32(36 + index * 4, normals[index]!, true);
  }
  view.setUint16(72, 0, true);
  view.setUint16(74, 1, true);
  view.setUint16(76, 2, true);
  return bytes;
}

function texturedGltf(textureUri: string | undefined): Record<string, unknown> {
  return {
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        max: [1, 1, 0],
        min: [0, 0, 0],
        type: "VEC3",
      },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    asset: { generator: "Toolcraft appearance fixture", version: "2.0" },
    buffers: [{ byteLength: 44, uri: "mesh.bin" }],
    bufferViews: [
      { buffer: 0, byteLength: 36, byteOffset: 0, target: 34962 },
      { buffer: 0, byteLength: 6, byteOffset: 36, target: 34963 },
    ],
    images: textureUri === undefined ? [] : [{ uri: textureUri }],
    materials: [
      {
        name: "Toolcraft red material",
        pbrMetallicRoughness: {
          baseColorFactor: [0.8, 0.2, 0.1, 1],
          ...(textureUri === undefined ? {} : { baseColorTexture: { index: 0 } }),
          metallicFactor: 0,
          roughnessFactor: 0.5,
        },
      },
    ],
    meshes: [
      {
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }],
      },
    ],
    nodes: [{ mesh: 0 }],
    samplers: textureUri === undefined ? [] : [{}],
    scene: 0,
    scenes: [{ nodes: [0] }],
    textures: textureUri === undefined ? [] : [{ sampler: 0, source: 0 }],
  };
}

function texturedGltfWithNormals(textureUri: string): Record<string, unknown> {
  const gltf = texturedGltf(textureUri);
  return {
    ...gltf,
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        max: [1, 1, 0],
        min: [0, 0, 0],
        type: "VEC3",
      },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    buffers: [{ byteLength: 80, uri: "mesh-with-normals.bin" }],
    bufferViews: [
      { buffer: 0, byteLength: 36, byteOffset: 0, target: 34962 },
      { buffer: 0, byteLength: 36, byteOffset: 36, target: 34962 },
      { buffer: 0, byteLength: 6, byteOffset: 72, target: 34963 },
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: { NORMAL: 1, POSITION: 0 },
            indices: 2,
            material: 0,
          },
        ],
      },
    ],
  };
}

function fallbackGltf(): Record<string, unknown> {
  return {
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        max: [1, 1, 0],
        min: [0, 0, 0],
        type: "VEC3",
      },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    asset: { generator: "Toolcraft fallback fixture", version: "2.0" },
    buffers: [{ byteLength: 44 }],
    bufferViews: [
      { buffer: 0, byteLength: 36, byteOffset: 0, target: 34962 },
      { buffer: 0, byteLength: 6, byteOffset: 36, target: 34963 },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    nodes: [{ mesh: 0 }],
    scene: 0,
    scenes: [{ nodes: [0] }],
  };
}

function align4(value: number): number {
  return (value + 3) & ~3;
}

function encodeGlb(json: Record<string, unknown>): Uint8Array {
  json.buffers = [{ byteLength: 44 }];
  const rawJson = encoder.encode(JSON.stringify(json));
  const jsonLength = align4(rawJson.byteLength);
  const bin = geometryBuffer();
  const binLength = align4(bin.byteLength);
  const totalLength = 12 + 8 + jsonLength + 8 + binLength;
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
  bytes.set(bin, binHeader + 8);
  return bytes;
}

function glbWithTexture(): Uint8Array {
  const textureUri = `data:image/png;base64,${redPixelPng.toString("base64")}`;
  return encodeGlb(texturedGltf(textureUri));
}

const obj = encoder.encode(
  "mtllib scene.mtl\no Painted\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nusemtl Painted\nf 1/1 2/2 3/3\n",
);
const mtl = encoder.encode(
  "newmtl Painted\nKd 0.8 0.2 0.1\nKs 0 0 0\nNs 32\nd 1\nmap_Kd albedo.png\n",
);
const asciiStl = encoder.encode(
  "solid fallback\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid fallback\n",
);

function caseFor(
  id: string,
  modelFixture: ToolcraftModelBrowserFixture,
  expected: ToolcraftModelAppearanceFixtureExpectation,
): ToolcraftModelAppearanceFixtureCase {
  return Object.freeze({
    expected: Object.freeze(expected),
    fixture: modelFixture,
    id,
  });
}

export function createToolcraftModelAppearanceFixtures(): readonly ToolcraftModelAppearanceFixtureCase[] {
  const texturedGltfBytes = encoder.encode(JSON.stringify(texturedGltf("albedo.png")));
  const missingTextureBytes = encoder.encode(
    JSON.stringify(texturedGltfWithNormals("missing.png")),
  );
  const objPackageEntries = [
    { bytes: obj, path: "scene.obj" },
    { bytes: mtl, path: "scene.mtl" },
    { bytes: redPixelPng, path: "albedo.png" },
  ];
  const authoredSignature = "authored:red-texture:pbr-metallic-roughness";
  return Object.freeze([
    caseFor(
      "standalone-fallback-glb",
      fixture("glb", "binary", [
        file("fallback.glb", "model/gltf-binary", encodeGlb(fallbackGltf())),
      ]),
      {
        appearance: "fallback",
        materialSignature: fallbackMaterialSignature,
        outcome: "ready",
        packageKind: "standalone",
        selectedRootPath: "fallback.glb",
      },
    ),
    caseFor(
      "textured-glb",
      fixture("glb", "binary", [file("textured.glb", "model/gltf-binary", glbWithTexture())]),
      {
        appearance: "authored",
        materialSignature: authoredSignature,
        outcome: "ready",
        packageKind: "standalone",
        selectedRootPath: "textured.glb",
      },
    ),
    caseFor(
      "textured-gltf-folder",
      fixture("gltf", "json-bundle", [
        file("scene.gltf", "model/gltf+json", texturedGltfBytes),
        file("mesh.bin", "application/octet-stream", geometryBuffer()),
        file("albedo.png", "image/png", redPixelPng),
      ]),
      {
        appearance: "authored",
        materialSignature: authoredSignature,
        outcome: "ready",
        packageKind: "folder",
        selectedRootPath: "scene.gltf",
      },
    ),
    caseFor(
      "obj-material-folder",
      fixture("obj", "ascii", [
        file("scene.obj", "model/obj", obj),
        file("scene.mtl", "text/plain", mtl),
        file("albedo.png", "image/png", redPixelPng),
      ]),
      {
        appearance: "authored",
        materialSignature: "authored:obj:Painted:albedo.png",
        outcome: "ready",
        packageKind: "folder",
        selectedRootPath: "scene.obj",
      },
    ),
    caseFor(
      "obj-material-zip",
      fixture("obj", "binary", [
        file("obj-material.zip", "application/zip", createZip(objPackageEntries)),
      ]),
      {
        appearance: "authored",
        materialSignature: "authored:obj:Painted:albedo.png",
        outcome: "ready",
        packageKind: "zip",
        selectedRootPath: "scene.obj",
      },
    ),
    caseFor(
      "fbx-material",
      fixture("fbx", "ascii", [
        file(
          "material.fbx",
          "application/octet-stream",
          encoder.encode(
            `; FBX 7.4.0 project file
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
\tGeometry: 1, "Geometry::Triangle", "Mesh" {
\t\tVertices: *9 {
\t\t\ta: 0,0,0,1,0,0,0,1,0
\t\t}
\t\tPolygonVertexIndex: *3 {
\t\t\ta: 0,1,-3
\t\t}
\t}
\tModel: 2, "Model::Triangle", "Mesh" {
\t\tVersion: 232
\t\tProperties70:  {
\t\t\tP: "Lcl Translation", "Lcl Translation", "", "A",0,0,0
\t\t\tP: "Lcl Rotation", "Lcl Rotation", "", "A",0,0,0
\t\t\tP: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1
\t\t}
\t\tShading: T
\t\tCulling: "CullingOff"
\t}
\tMaterial: 3, "Material::Red", "" {
\t\tVersion: 102
\t\tShadingModel: "phong"
\t\tProperties70:  {
\t\t\tP: "DiffuseColor", "Color", "", "A",0.8,0.2,0.1
\t\t\tP: "SpecularColor", "Color", "", "A",0,0,0
\t\t\tP: "Shininess", "double", "Number", "",32
\t\t}
\t}
}
Connections:  {
\tC: "OO",1,2
\tC: "OO",3,2
\tC: "OO",2,0
}
`,
          ),
        ),
      ]),
      {
        appearance: "authored",
        materialSignature: "authored:fbx:Red",
        outcome: "ready",
        packageKind: "standalone",
        selectedRootPath: "material.fbx",
      },
    ),
    caseFor("ply-vertex-colors", fixture("ply", "binary", [createToolcraftVertexColorPlyFile()]), {
      appearance: "authored",
      materialSignature: "authored:ply:vertex-colors",
      outcome: "ready",
      packageKind: "standalone",
      selectedRootPath: "colors.ply",
    }),
    caseFor(
      "stl-fallback",
      fixture("stl", "ascii", [file("fallback.stl", "model/stl", asciiStl)]),
      {
        appearance: "fallback",
        materialSignature: fallbackMaterialSignature,
        outcome: "ready",
        packageKind: "standalone",
        selectedRootPath: "fallback.stl",
      },
    ),
    caseFor(
      "missing-texture",
      fixture("gltf", "json-bundle", [
        file("scene.gltf", "model/gltf+json", missingTextureBytes),
        file("mesh-with-normals.bin", "application/octet-stream", geometryBufferWithNormals()),
      ]),
      {
        appearance: "warning",
        materialSignature: "authored:red-base-factor",
        outcome: "ready",
        packageKind: "folder",
        selectedRootPath: "scene.gltf",
        warningCode: "missing-appearance-resource",
      },
    ),
    caseFor(
      "multiple-roots-zip",
      fixture("obj", "binary", [
        file(
          "multiple-roots.zip",
          "application/zip",
          createZip([
            { bytes: obj, path: "a.obj" },
            { bytes: encoder.encode("not a valid OBJ root"), path: "z.obj" },
          ]),
        ),
      ]),
      {
        appearance: "fallback",
        materialSignature: fallbackMaterialSignature,
        outcome: "ready",
        packageKind: "zip",
        selectedRootPath: "a.obj",
      },
    ),
    caseFor(
      "hostile-zip",
      fixture("gltf", "binary", [
        file(
          "hostile.zip",
          "application/zip",
          createZip([{ bytes: new Uint8Array(1_000_000), path: "dense.bin" }], true),
        ),
      ]),
      {
        appearance: "fallback",
        materialSignature: fallbackMaterialSignature,
        outcome: "rejected",
        packageKind: "zip",
        rejectionCode: "archive-compression-ratio-exceeded",
        selectedRootPath: "dense.bin",
      },
    ),
  ]);
}
