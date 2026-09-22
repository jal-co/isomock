import type { ToolcraftModelFormat } from "../../schema/types";
import { TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS } from "../model-import-limit-values";
import type { ToolcraftModelDecodeContext } from "../model-import-types";
import { sourceExtension } from "../model-source-path";
import {
  checkedGltfScale,
  checkedGltfTotal,
  gltfDecodeCheckpoint,
  gltfDecodeFailure,
  throwIfGltfDecodeAborted,
} from "./gltf-decode-safety";

export type GltfSourceFileSnapshot = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  path: string;
}>;

export type GltfSourceSnapshot = Readonly<{
  files: readonly GltfSourceFileSnapshot[];
  filesByPath: ReadonlyMap<string, GltfSourceFileSnapshot>;
  root: GltfSourceFileSnapshot;
  sourceWorkerBytes: number;
}>;

const arrayBufferByteLength = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
)!.get!;
const DRIVE_PATH_PATTERN = /^[a-z]:/iu;

function getArrayBufferByteLength(value: unknown): number | undefined {
  try {
    return arrayBufferByteLength.call(value) as number;
  } catch {
    return undefined;
  }
}

function validateLimits(context: ToolcraftModelDecodeContext): void {
  for (const key of Object.keys(
    TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS,
  ) as Array<keyof ToolcraftModelDecodeContext["limits"]>) {
    const value = context.limits[key];
    if (
      !Number.isSafeInteger(value) ||
      value <= 0 ||
      value > TOOLCRAFT_MODEL_IMPORT_LIMIT_CEILINGS[key]
    ) {
      gltfDecodeFailure(
        "resource-limit",
        "invalid-import-limits",
        `Model import limit ${key} is outside its protected integer range.`,
      );
    }
  }
}

function validateSelectedPath(path: unknown): asserts path is string {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.includes("?") ||
    path.includes("#") ||
    path.normalize("NFC") !== path ||
    DRIVE_PATH_PATTERN.test(path.split("/", 1)[0] ?? "") ||
    path.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    gltfDecodeFailure(
      "bundle",
      "unsafe-source-path",
      "The model transfer contains an unsafe selected path.",
    );
  }
}

export function snapshotGltfDecodeSource(
  context: ToolcraftModelDecodeContext,
  format: Extract<ToolcraftModelFormat, "glb" | "gltf">,
): GltfSourceSnapshot {
  throwIfGltfDecodeAborted(context.signal);
  validateLimits(context);
  const sourceFiles = context.bundle?.sourceFiles;
  if (!Array.isArray(sourceFiles) || sourceFiles.length === 0) {
    return gltfDecodeFailure(
      "bundle",
      "empty-model-bundle",
      "The model transfer contains no source files.",
    );
  }
  if (sourceFiles.length > context.limits.maxBundleFiles) {
    return gltfDecodeFailure(
      "resource-limit",
      "bundle-file-limit-exceeded",
      `The model transfer exceeds maxBundleFiles ${context.limits.maxBundleFiles}.`,
    );
  }
  validateSelectedPath(context.bundle.rootPath);
  if (sourceExtension(context.bundle.rootPath) !== `.${format}`) {
    return gltfDecodeFailure(
      "format",
      "adapter-root-format-mismatch",
      `The ${format} adapter requires a .${format} root.`,
    );
  }

  const admitted: Array<{ bytes: ArrayBuffer; path: string }> = [];
  const paths = new Set<string>();
  let sourceBytes = 0;
  for (let index = 0; index < sourceFiles.length; index += 1) {
    gltfDecodeCheckpoint(context.signal, index);
    if (!Object.prototype.hasOwnProperty.call(sourceFiles, index)) {
      return gltfDecodeFailure(
        "bundle",
        "invalid-source-file",
        "The model transfer contains a sparse source-file entry.",
      );
    }
    const file = sourceFiles[index];
    validateSelectedPath(file?.path);
    const byteLength = getArrayBufferByteLength(file?.bytes);
    if (byteLength === undefined) {
      return gltfDecodeFailure(
        "bundle",
        "invalid-source-file",
        "The model transfer source bytes must be an ArrayBuffer.",
      );
    }
    if (paths.has(file.path)) {
      return gltfDecodeFailure(
        "bundle",
        "duplicate-source-path",
        "The model transfer contains a duplicate selected path.",
      );
    }
    paths.add(file.path);
    sourceBytes = checkedGltfTotal(
      sourceBytes,
      byteLength,
      context.limits.maxSourceBytes,
      "source-byte-limit-exceeded",
      "Model source bytes",
    );
    if (sourceBytes > context.limits.maxDecodedBytes) {
      return gltfDecodeFailure(
        "resource-limit",
        "decoded-byte-limit-exceeded",
        `Model source bytes exceed maxDecodedBytes ${context.limits.maxDecodedBytes}.`,
      );
    }
    admitted.push({ bytes: file.bytes, path: file.path });
  }
  const sourceWorkerBytes = checkedGltfScale(
    sourceBytes,
    2,
    "estimated-worker-memory-limit-exceeded",
  );
  checkedGltfTotal(
    0,
    sourceWorkerBytes,
    context.limits.maxEstimatedWorkerBytes,
    "estimated-worker-memory-limit-exceeded",
    "Model source snapshot memory",
  );
  if (!paths.has(context.bundle.rootPath)) {
    return gltfDecodeFailure(
      "bundle",
      "missing-model-root",
      "The model transfer does not contain its declared root file.",
    );
  }

  const files = Object.freeze(
    admitted.map(({ bytes, path }) =>
      Object.freeze({
        bytes: new Uint8Array(bytes).slice(),
        path,
      }),
    ),
  );
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const root = filesByPath.get(context.bundle.rootPath);
  if (!root) throw new Error("Validated glTF root snapshot is missing.");
  return Object.freeze({ files, filesByPath, root, sourceWorkerBytes });
}
