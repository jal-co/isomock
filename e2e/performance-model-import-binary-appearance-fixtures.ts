import type { ToolcraftModelBrowserFixtureFile } from "./performance-model-import-fixtures";

const encoder = new TextEncoder();

export function createToolcraftVertexColorPlyFile(): ToolcraftModelBrowserFixtureFile {
  const header = encoder.encode(
    "ply\nformat binary_little_endian 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n",
  );
  const body = new Uint8Array(58);
  const view = new DataView(body.buffer);
  const vertices = [
    [0, 0, 0, 255, 0, 0],
    [1, 0, 0, 0, 255, 0],
    [0, 1, 0, 0, 0, 255],
  ] as const;
  let offset = 0;
  for (const vertex of vertices) {
    for (let component = 0; component < 3; component += 1) {
      view.setFloat32(offset, vertex[component]!, true);
      offset += 4;
    }
    for (let component = 3; component < 6; component += 1) {
      view.setUint8(offset, vertex[component]!);
      offset += 1;
    }
  }
  view.setUint8(offset, 3);
  offset += 1;
  for (const index of [0, 1, 2]) {
    view.setInt32(offset, index, true);
    offset += 4;
  }
  const bytes = Buffer.concat([Buffer.from(header), Buffer.from(body)]);
  return Object.freeze({
    buffer: bytes,
    mimeType: "application/octet-stream",
    name: "colors.ply",
  });
}
