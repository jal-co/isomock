import type {
  ToolcraftModelBrowserFixture,
  ToolcraftModelBrowserFixtureFile,
} from "./performance-model-import-fixtures";

export function file(
  name: string,
  mimeType: string,
  bytes: Uint8Array,
): ToolcraftModelBrowserFixtureFile {
  return Object.freeze({
    buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    mimeType,
    name,
  });
}

export function fixture(
  format: ToolcraftModelBrowserFixture["format"],
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
