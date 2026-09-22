import type { ToolcraftModelImportLimits } from "../schema/types";
import type {
  ToolcraftModelArchiveSource,
  ToolcraftModelPackageSource,
  ToolcraftModelSourceBundle,
  ToolcraftModelSourceBundleTransfer,
  ToolcraftModelSourceFile,
} from "./model-import-types";
import type { ToolcraftExtractedModelPackageEntry } from "./model-package-types";
import {
  getToolcraftModelPackageMimeType,
  isToolcraftModelAppearanceSidecarPath,
  normalizeToolcraftModelPackagePath,
} from "./model-package-path";
import {
  selectToolcraftModelFormatAdapter,
  type ToolcraftModelFormatIdentityRegistry,
} from "./formats/model-format-adapter";
import {
  checkedSourceByteTotal,
  snapshotModelSourceBundleLimits,
} from "./model-source-bundle-limits";
import { failModelSourceBundle } from "./model-source-bundle-error";
import { copyOwnedBytesToArrayBuffer, readOwnedModelSourceBytes } from "./model-source-bytes";
import {
  createModelSourceResourceRef,
  digestModelSourceBundle,
  digestModelSourceBytes,
  digestModelSourceBytesAsync,
} from "./model-source-digest";
import { inspectGltfSourceBuffers } from "./model-source-gltf";
import {
  assertModelSourceRawBatchAdmission,
  snapshotModelSourceFiles,
  sourceExtension,
  type ModelSourceFileSnapshot,
} from "./model-source-path";

export { ToolcraftModelSourceBundleError } from "./model-source-bundle-error";

export type CreateToolcraftModelSourceBundleOptions = Readonly<{
  limits?: Partial<ToolcraftModelImportLimits>;
  registry: ToolcraftModelFormatIdentityRegistry;
}>;

function comparePaths(left: ModelSourceFileSnapshot, right: ModelSourceFileSnapshot): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

function assertOnlySelectedOrAppearanceFiles(
  files: readonly ModelSourceFileSnapshot[],
  selectedPaths: ReadonlySet<string>,
): void {
  const unexpected = files
    .filter(
      (file) =>
        !selectedPaths.has(file.path) &&
        !isToolcraftModelAppearanceSidecarPath(file.path) &&
        !file.mimeType.startsWith("image/"),
    )
    .sort(comparePaths)[0];
  if (unexpected) {
    failModelSourceBundle(
      "bundle",
      "unexpected-source-file",
      "A selected source file is neither required geometry nor an appearance-only sidecar.",
    );
  }
}

function assertUniquePackagePaths(files: readonly ModelSourceFileSnapshot[]): void {
  const filesByPath = new Map<string, ModelSourceFileSnapshot[]>();
  for (const source of files) {
    const matches = filesByPath.get(source.path) ?? [];
    matches.push(source);
    filesByPath.set(source.path, matches);
  }
  for (const matches of filesByPath.values()) {
    if (matches.length < 2) continue;
    const code =
      new Set(matches.map(({ rawPath }) => rawPath)).size > 1
        ? "ambiguous-normalized-path"
        : "duplicate-source-path";
    failModelSourceBundle(
      "bundle",
      code,
      "More than one selected source file resolves to the same package path.",
    );
  }
}

async function createSourceFileDto(
  source: ModelSourceFileSnapshot,
  bytes: Uint8Array,
): Promise<ToolcraftModelSourceFile> {
  const contentDigest = await digestModelSourceBytesAsync(bytes);
  const mimeType = getToolcraftModelPackageMimeType(source.path);
  return Object.freeze({
    byteLength: bytes.byteLength,
    contentDigest,
    displayName: source.path.slice(source.path.lastIndexOf("/") + 1),
    mimeType,
    path: source.path,
    resourceRef: createModelSourceResourceRef(contentDigest, mimeType),
  });
}

type OwnedModelSourceFile = Readonly<{
  bytes: Uint8Array;
  dto: ToolcraftModelSourceFile;
}>;

function createSourceBundleTransfer(
  bundle: ToolcraftModelSourceBundle,
  ownedFiles: readonly OwnedModelSourceFile[],
): ToolcraftModelSourceBundleTransfer {
  return Object.freeze({
    aggregateDigest: bundle.aggregateDigest,
    rootPath: bundle.rootPath,
    sourceFiles: Object.freeze(
      ownedFiles.map(({ bytes, dto }) =>
        Object.freeze({
          bytes: copyOwnedBytesToArrayBuffer(bytes),
          contentDigest: dto.contentDigest,
          mimeType: dto.mimeType,
          path: dto.path,
        }),
      ),
    ),
  });
}

async function resolveOwnedModelSourceBundle(
  snapshots: readonly ModelSourceFileSnapshot[],
  packageSource: ToolcraftModelPackageSource,
  options: CreateToolcraftModelSourceBundleOptions,
): Promise<
  Readonly<{
    bundle: ToolcraftModelSourceBundle;
    ownedFiles: readonly OwnedModelSourceFile[];
  }>
> {
  const limits = snapshotModelSourceBundleLimits(options?.limits);
  assertUniquePackagePaths(snapshots);
  const roots = snapshots
    .flatMap((source) => {
      const adapter = selectToolcraftModelFormatAdapter(options.registry, source.extension);
      return adapter ? [{ adapter, source }] : [];
    })
    .sort((left, right) => comparePaths(left.source, right.source));
  if (roots.length === 0) {
    return failModelSourceBundle(
      "format",
      "unsupported-model-root",
      "The selected batch does not contain a root owned by a registered model adapter.",
    );
  }
  const root = roots[0]!;
  checkedSourceByteTotal(0, root.source.size, limits.maxSourceBytes, "source-byte-limit-exceeded");
  checkedSourceByteTotal(
    0,
    root.source.size,
    limits.maxDecodedBytes,
    "decoded-byte-limit-exceeded",
  );
  const rootBytes = await readOwnedModelSourceBytes(root.source);
  let dependencies: readonly ModelSourceFileSnapshot[] = [];
  if (root.adapter.format === "gltf") {
    dependencies = inspectGltfSourceBuffers(root.source, rootBytes, snapshots, limits).dependencies;
  }

  const rootPaths = new Set(roots.map(({ source }) => source.path));
  const appearanceSources = snapshots
    .filter(
      (source) =>
        !rootPaths.has(source.path) &&
        (isToolcraftModelAppearanceSidecarPath(source.path) ||
          source.mimeType.startsWith("image/")),
    )
    .sort(comparePaths);
  const orderedSources = [
    root.source,
    ...[...dependencies, ...appearanceSources]
      .filter(
        (dependency, index, selected) =>
          dependency.path !== root.source.path &&
          selected.findIndex(({ path }) => path === dependency.path) === index,
      )
      .sort(comparePaths),
  ];
  const allowedPaths = new Set([...orderedSources.map(({ path }) => path), ...rootPaths]);
  assertOnlySelectedOrAppearanceFiles(snapshots, allowedPaths);
  if (orderedSources.length > limits.maxBundleFiles) {
    return failModelSourceBundle(
      "resource-limit",
      "bundle-file-limit-exceeded",
      "The model requires too many geometry source files.",
    );
  }
  let logicalSourceBytes = 0;
  for (const source of orderedSources) {
    logicalSourceBytes = checkedSourceByteTotal(
      logicalSourceBytes,
      source.size,
      limits.maxSourceBytes,
      "source-byte-limit-exceeded",
    );
  }

  const bytesByPath = new Map<string, Uint8Array>([[root.source.path, rootBytes]]);
  for (const source of orderedSources.slice(1)) {
    bytesByPath.set(source.path, await readOwnedModelSourceBytes(source));
  }
  const ownedFiles = Object.freeze(
    await Promise.all(
      orderedSources.map(async (source) => {
        const bytes = bytesByPath.get(source.path)!;
        return Object.freeze({
          bytes,
          dto: await createSourceFileDto(source, bytes),
        });
      }),
    ),
  );
  const sourceFiles = Object.freeze(ownedFiles.map(({ dto }) => dto));
  const adapterEvidence = Object.freeze({
    adapterVersion: root.adapter.adapterVersion,
    format: root.adapter.format,
    rootExtension: root.source.extension,
  });
  const aggregateByteLength = sourceFiles.reduce((total, source) => total + source.byteLength, 0);

  const bundle = Object.freeze({
    adapter: adapterEvidence,
    aggregateByteLength,
    aggregateDigest: digestModelSourceBundle(adapterEvidence, root.source.path, sourceFiles),
    descriptorVersion: 2 as const,
    diagnostics: Object.freeze(
      roots.length > 1
        ? [
            Object.freeze({
              affectedCount: roots.length - 1,
              code: "ignored-model-root" as const,
              explanation:
                "Additional supported model roots were ignored after deterministic first-root selection.",
              severity: "info" as const,
            }),
          ]
        : [],
    ),
    packageSource,
    rootPath: root.source.path,
    sourceFiles,
  });
  return Object.freeze({ bundle, ownedFiles });
}

export async function createToolcraftModelSourceBundle(
  files: readonly File[],
  options: CreateToolcraftModelSourceBundleOptions,
): Promise<ToolcraftModelSourceBundle> {
  if (!Array.isArray(files)) {
    return failModelSourceBundle(
      "bundle",
      "invalid-source-batch",
      "Model source files must be provided as one File array.",
    );
  }
  assertModelSourceRawBatchAdmission(files);
  const snapshots = snapshotModelSourceFiles(files.slice());
  return (
    await resolveOwnedModelSourceBundle(
      snapshots,
      Object.freeze({ kind: "selected-files" }),
      options,
    )
  ).bundle;
}

export async function createToolcraftModelSourceBundleSnapshot(
  files: readonly File[],
  options: CreateToolcraftModelSourceBundleOptions,
): Promise<
  Readonly<{
    bundle: ToolcraftModelSourceBundle;
    transfer: ToolcraftModelSourceBundleTransfer;
  }>
> {
  if (!Array.isArray(files)) {
    return failModelSourceBundle(
      "bundle",
      "invalid-source-batch",
      "Model source files must be provided as one File array.",
    );
  }
  assertModelSourceRawBatchAdmission(files);
  const resolved = await resolveOwnedModelSourceBundle(
    snapshotModelSourceFiles(files.slice()),
    Object.freeze({ kind: "selected-files" }),
    options,
  );
  return Object.freeze({
    bundle: resolved.bundle,
    transfer: createSourceBundleTransfer(resolved.bundle, resolved.ownedFiles),
  });
}

export async function createToolcraftModelSourceBundleSnapshotFromExtractedPackage(
  entries: readonly ToolcraftExtractedModelPackageEntry[],
  source: Readonly<{ archive: ToolcraftModelArchiveSource; kind: "zip" }>,
  options: CreateToolcraftModelSourceBundleOptions,
): Promise<
  Readonly<{
    bundle: ToolcraftModelSourceBundle;
    transfer: ToolcraftModelSourceBundleTransfer;
  }>
> {
  const limits = snapshotModelSourceBundleLimits(options.limits);
  if (!Array.isArray(entries) || entries.length === 0) {
    return failModelSourceBundle(
      "bundle",
      "empty-model-bundle",
      "The model archive does not contain source files.",
    );
  }
  const ownedEntries = entries.map((entry) => {
    const path = normalizeToolcraftModelPackagePath(entry.path, limits.maxArchivePathLength);
    const bytes = new Uint8Array(entry.bytes).slice();
    if (
      path !== entry.path ||
      bytes.byteLength !== entry.uncompressedBytes ||
      digestModelSourceBytes(bytes) !== entry.contentDigest
    ) {
      return failModelSourceBundle(
        "bundle",
        "archive-entry-manifest-mismatch",
        "An extracted model archive entry does not match its verified manifest.",
      );
    }
    return Object.freeze({ bytes, entry, path });
  });
  const snapshots = Object.freeze(
    ownedEntries.map(({ bytes, path }) =>
      Object.freeze({
        displayName: path.slice(path.lastIndexOf("/") + 1),
        extension: sourceExtension(path),
        hasPathEvidence: true,
        mimeType: getToolcraftModelPackageMimeType(path),
        path,
        rawPath: path,
        read: async () => bytes.buffer,
        size: bytes.byteLength,
      }),
    ),
  );
  const packageSource = Object.freeze({
    archive: Object.freeze({ ...source.archive }),
    entries: Object.freeze(
      ownedEntries
        .map(({ bytes, entry, path }) =>
          Object.freeze({
            byteLength: bytes.byteLength,
            contentDigest: entry.contentDigest,
            mimeType: getToolcraftModelPackageMimeType(path),
            path,
          }),
        )
        .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)),
    ),
    kind: "zip" as const,
  });
  const resolved = await resolveOwnedModelSourceBundle(snapshots, packageSource, options);
  return Object.freeze({
    bundle: resolved.bundle,
    transfer: createSourceBundleTransfer(resolved.bundle, resolved.ownedFiles),
  });
}
