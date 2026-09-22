export type ToolcraftBinaryAssetRepositoryEntry = {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly dependencies: readonly string[];
  readonly durable: boolean;
  readonly ref: string;
};

export type ToolcraftBinaryAssetPutOptions = {
  contentType: string;
  dependencies?: readonly string[];
  durable: boolean;
};

/** Read at the deletion decision. null means durable ownership is unknown. */
export type ToolcraftPersistedResourceRefsReader = () => ReadonlySet<string> | null;

export type ToolcraftBinaryAssetCollectionOptions = Readonly<{
  getPersistedResourceRefs?: ToolcraftPersistedResourceRefsReader;
}>;

export const TOOLCRAFT_BINARY_ASSET_MAX_DEPENDENCIES = 4_096;

export type ToolcraftBinaryAssetLease = {
  /** Final publication. A successful commit makes the lease terminal. */
  commit: () => Promise<void>;
  /** Reads staged or committed data while active; rejects after termination. */
  get: (ref: string) => Promise<ToolcraftBinaryAssetRepositoryEntry | null>;
  put: (
    ref: string,
    bytes: Uint8Array,
    options: ToolcraftBinaryAssetPutOptions,
  ) => Promise<void>;
  /** Returns staged refs while active and an empty list after termination. */
  refs: () => readonly string[];
  /** Discards pre-commit staging only. It cannot undo a successful commit. */
  rollback: () => Promise<void>;
};

export type ToolcraftBinaryAssetRepository = {
  beginLease: (jobId: string) => Promise<ToolcraftBinaryAssetLease>;
  /** Publishes this owner's complete canonical reachability before collection. */
  collect: (reachableRefs: ReadonlySet<string>) => Promise<readonly string[]>;
  /** Releases this repository owner and invalidates every lease it created. */
  dispose: () => Promise<void>;
  get: (ref: string) => Promise<ToolcraftBinaryAssetRepositoryEntry | null>;
};

export function assertToolcraftBinaryAssetRef(
  ref: unknown,
): asserts ref is string {
  if (typeof ref !== "string" || ref.length === 0 || ref.trim() !== ref) {
    throw new Error("Binary asset ref must be a non-empty trimmed string");
  }
}

function snapshotToolcraftBinaryAssetDependencies(
  ownerRef: string,
  value: readonly string[] | undefined,
): readonly string[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) {
    throw new Error("Binary asset dependencies must be an array");
  }
  if (value.length > TOOLCRAFT_BINARY_ASSET_MAX_DEPENDENCIES) {
    throw new Error(
      `Binary asset dependencies exceed ${TOOLCRAFT_BINARY_ASSET_MAX_DEPENDENCIES} entries`,
    );
  }

  const dependencies: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new Error("Binary asset dependencies cannot be sparse");
    }
    const dependency: unknown = value[index];
    assertToolcraftBinaryAssetRef(dependency);
    if (dependency === ownerRef) {
      throw new Error(`Binary asset ref "${ownerRef}" cannot depend on itself`);
    }
    dependencies.push(dependency);
  }

  return Object.freeze([...new Set(dependencies)].sort());
}

export function createToolcraftBinaryAssetRepositoryEntry(
  ref: string,
  bytes: Uint8Array,
  options: ToolcraftBinaryAssetPutOptions,
): ToolcraftBinaryAssetRepositoryEntry {
  assertToolcraftBinaryAssetRef(ref);

  if (options.contentType.length === 0 || options.contentType.trim() !== options.contentType) {
    throw new Error("Binary asset content type must be a non-empty trimmed string");
  }

  const dependencies = snapshotToolcraftBinaryAssetDependencies(
    ref,
    options.dependencies,
  );

  return Object.freeze({
    bytes: new Uint8Array(bytes),
    contentType: options.contentType,
    dependencies,
    durable: options.durable,
    ref,
  });
}

export function cloneToolcraftBinaryAssetRepositoryEntry(
  entry: ToolcraftBinaryAssetRepositoryEntry,
): ToolcraftBinaryAssetRepositoryEntry {
  return createToolcraftBinaryAssetRepositoryEntry(entry.ref, entry.bytes, {
    contentType: entry.contentType,
    dependencies: entry.dependencies,
    durable: entry.durable,
  });
}

export function areToolcraftBinaryAssetRepositoryEntriesEqual(
  left: ToolcraftBinaryAssetRepositoryEntry,
  right: ToolcraftBinaryAssetRepositoryEntry,
): boolean {
  if (
    left.ref !== right.ref ||
    left.contentType !== right.contentType ||
    left.durable !== right.durable ||
    left.dependencies.length !== right.dependencies.length ||
    left.dependencies.some(
      (dependency, index) => dependency !== right.dependencies[index],
    ) ||
    left.bytes.byteLength !== right.bytes.byteLength
  ) {
    return false;
  }

  return left.bytes.every((value, index) => value === right.bytes[index]);
}

export function createToolcraftBinaryAssetConflictError(ref: string): Error {
  return new Error(
    `Binary asset ref "${ref}" is already committed with different content`,
  );
}
