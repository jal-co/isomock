import type { ToolcraftModelDecodeContext } from "../model-import-types";
import {
  checkedThreeStaticGeometryTotal,
  threeStaticGeometryFailure,
  throwIfThreeStaticGeometryAborted,
  type ThreeStaticGeometryFormat,
  validateThreeStaticGeometryLimits,
} from "./three-static-geometry-primitives";

export type ThreeStaticGeometrySourceFile = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  path: string;
}>;
export type ThreeStaticGeometrySourceBundle = Readonly<{
  files: readonly ThreeStaticGeometrySourceFile[];
  root: ThreeStaticGeometrySourceFile;
  sourceByteLength: number;
}>;

const arrayBufferByteLength = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
)!.get!;

function getArrayBufferByteLength(value: unknown): number | undefined {
  try {
    return arrayBufferByteLength.call(value) as number;
  } catch {
    return undefined;
  }
}

export function readThreeStaticGeometryRoot(
  context: ToolcraftModelDecodeContext,
  format: ThreeStaticGeometryFormat,
): ArrayBuffer {
  const bundle = readThreeStaticGeometryBundle(context, format);
  if (bundle.files.length !== 1) {
    return threeStaticGeometryFailure(
      "bundle",
      "invalid-static-geometry-bundle",
      `The ${format.toUpperCase()} adapter requires exactly one root file.`,
    );
  }
  return bundle.root.bytes.buffer;
}

export function readThreeStaticGeometryBundle(
  context: ToolcraftModelDecodeContext,
  format: ThreeStaticGeometryFormat,
): ThreeStaticGeometrySourceBundle {
  throwIfThreeStaticGeometryAborted(context.signal);
  validateThreeStaticGeometryLimits(context.limits);
  const files = context.bundle?.sourceFiles;
  if (!Array.isArray(files) || files.length === 0) {
    return threeStaticGeometryFailure(
      "bundle",
      "invalid-static-geometry-bundle",
      `The ${format.toUpperCase()} adapter requires a nonempty source bundle.`,
    );
  }
  if (files.length > context.limits.maxBundleFiles) {
    return threeStaticGeometryFailure(
      "resource-limit",
      "bundle-file-limit-exceeded",
      `The source exceeds maxBundleFiles ${context.limits.maxBundleFiles}.`,
    );
  }
  const rootPath = context.bundle.rootPath;
  const paths = new Set<string>();
  const admitted: Array<{ bytes: ArrayBuffer; path: string }> = [];
  let sourceByteLength = 0;
  for (const file of files) {
    const byteLength = getArrayBufferByteLength(file?.bytes);
    if (
      !file || typeof file.path !== "string" || file.path.length === 0 ||
      paths.has(file.path) || byteLength === undefined
    ) {
      return threeStaticGeometryFailure(
        "bundle",
        "invalid-static-geometry-file",
        "The static model bundle contains an invalid or duplicate file.",
      );
    }
    paths.add(file.path);
    sourceByteLength = checkedThreeStaticGeometryTotal(
      sourceByteLength,
      byteLength,
      context.limits.maxSourceBytes,
      "source-byte-limit-exceeded",
      "Static model source bytes",
    );
    admitted.push({ bytes: file.bytes, path: file.path });
  }
  if (sourceByteLength > context.limits.maxDecodedBytes) {
    return threeStaticGeometryFailure(
      "resource-limit",
      "decoded-byte-limit-exceeded",
      `The source exceeds maxDecodedBytes ${context.limits.maxDecodedBytes}.`,
    );
  }
  const root = admitted.find(({ path }) => path === rootPath);
  if (
    typeof rootPath !== "string" ||
    !rootPath.toLowerCase().endsWith(`.${format}`) ||
    !root
  ) {
    return threeStaticGeometryFailure(
      "bundle",
      "invalid-static-geometry-root",
      `The ${format.toUpperCase()} root file is missing or invalid.`,
    );
  }
  if (root.bytes.byteLength === 0) {
    return threeStaticGeometryFailure(
      "format",
      `empty-${format}`,
      `The ${format.toUpperCase()} source is empty.`,
    );
  }
  checkedThreeStaticGeometryTotal(
    sourceByteLength,
    sourceByteLength,
    context.limits.maxEstimatedWorkerBytes,
    "estimated-worker-memory-limit-exceeded",
    "Static geometry source memory",
  );
  try {
    const snapshots = Object.freeze(admitted.map((file) => Object.freeze({
      bytes: new Uint8Array(file.bytes).slice(),
      path: file.path,
    })));
    const ownedRoot = snapshots.find(({ path }) => path === rootPath)!;
    return Object.freeze({
      files: snapshots,
      root: ownedRoot,
      sourceByteLength,
    });
  } catch {
    return threeStaticGeometryFailure(
      "resource-unavailable",
      "static-geometry-source-unavailable",
      "The model source buffer could not be snapshotted safely.",
    );
  }
}
