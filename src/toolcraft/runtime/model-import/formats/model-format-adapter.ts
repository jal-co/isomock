import type { ToolcraftModelFormat } from "../../schema/types";
import type { ToolcraftModelFormatAdapter } from "../model-import-types";

export type ToolcraftModelFormatAdapterIdentity = Readonly<
  Pick<
    ToolcraftModelFormatAdapter,
    "adapterVersion" | "format" | "rootExtensions"
  >
>;

export type ToolcraftModelFormatIdentityRegistry<
  Adapter extends ToolcraftModelFormatAdapterIdentity =
    ToolcraftModelFormatAdapterIdentity,
> = Readonly<{
  adapters: readonly Adapter[];
}>;

export type ToolcraftModelFormatAdapterRegistry =
  ToolcraftModelFormatIdentityRegistry<ToolcraftModelFormatAdapter>;

const MODEL_FORMATS: ReadonlySet<string> = new Set([
  "fbx",
  "glb",
  "gltf",
  "obj",
  "ply",
  "stl",
] satisfies readonly ToolcraftModelFormat[]);
const ROOT_EXTENSION_PATTERN = /^\.[a-z0-9][a-z0-9-]*$/u;

function fail(message: string): never {
  throw new Error(`[model-format-adapter-registry] ${message}`);
}

function snapshotAdapter(
  adapter: ToolcraftModelFormatAdapter,
): ToolcraftModelFormatAdapter {
  if (typeof adapter !== "object" || adapter === null) {
    return fail("Adapter registration must be an object.");
  }
  const adapterVersion: unknown = adapter.adapterVersion;
  const decode: unknown = adapter.decode;
  const format: unknown = adapter.format;
  const rootExtensions: unknown = adapter.rootExtensions;
  const workerCapable: unknown = adapter.workerCapable;

  if (typeof format !== "string" || !MODEL_FORMATS.has(format)) {
    return fail(`Adapter has unsupported format "${String(format)}".`);
  }
  const modelFormat = format as ToolcraftModelFormat;
  if (
    typeof adapterVersion !== "string" ||
    adapterVersion.trim() !== adapterVersion ||
    adapterVersion.length === 0
  ) {
    return fail(`Adapter "${modelFormat}" has an invalid adapterVersion.`);
  }
  if (typeof decode !== "function") {
    return fail(`Adapter "${modelFormat}" must implement decode.`);
  }
  if (workerCapable !== true) {
    return fail(`Adapter "${modelFormat}" must be workerCapable.`);
  }
  if (!Array.isArray(rootExtensions) || rootExtensions.length === 0) {
    return fail(
      `Adapter "${modelFormat}" must own at least one root extension.`,
    );
  }

  const extensions: string[] = [];
  const ownedExtensions = new Set<string>();
  for (let index = 0; index < rootExtensions.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(rootExtensions, index)) {
      return fail(`Adapter "${modelFormat}" has a sparse root extension list.`);
    }
    const extension: unknown = rootExtensions[index];
    if (
      typeof extension !== "string" ||
      !ROOT_EXTENSION_PATTERN.test(extension)
    ) {
      return fail(
        `Adapter "${modelFormat}" has invalid root extension "${String(extension)}".`,
      );
    }
    if (ownedExtensions.has(extension)) {
      return fail(
        `Adapter "${modelFormat}" repeats root extension "${extension}".`,
      );
    }
    ownedExtensions.add(extension);
    extensions.push(extension);
  }

  return Object.freeze({
    adapterVersion,
    decode: decode as ToolcraftModelFormatAdapter["decode"],
    format: modelFormat,
    rootExtensions: Object.freeze(extensions.sort()),
    workerCapable: true,
  });
}

export function createToolcraftModelFormatAdapterRegistry(
  adapters: readonly ToolcraftModelFormatAdapter[],
): ToolcraftModelFormatAdapterRegistry {
  if (!Array.isArray(adapters)) {
    return fail("Adapter registrations must be an array.");
  }

  const formats = new Set<ToolcraftModelFormat>();
  const extensions = new Set<string>();
  const snapshots: ToolcraftModelFormatAdapter[] = [];
  for (let index = 0; index < adapters.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(adapters, index)) {
      return fail(
        `Adapter registrations have a sparse entry at index ${index}.`,
      );
    }
    const snapshot = snapshotAdapter(adapters[index]!);
    if (formats.has(snapshot.format)) {
      return fail(`Duplicate adapter format "${snapshot.format}".`);
    }
    formats.add(snapshot.format);
    for (const extension of snapshot.rootExtensions) {
      if (extensions.has(extension)) {
        return fail(`Duplicate root extension "${extension}".`);
      }
      extensions.add(extension);
    }
    snapshots.push(snapshot);
  }

  snapshots.sort((left, right) =>
    left.format < right.format ? -1 : left.format > right.format ? 1 : 0,
  );
  return Object.freeze({ adapters: Object.freeze(snapshots) });
}

export function getToolcraftAdvertisedModelFormats(
  registry: ToolcraftModelFormatIdentityRegistry,
): readonly ToolcraftModelFormat[] {
  return Object.freeze(registry.adapters.map(({ format }) => format));
}

export function getToolcraftModelRootExtensions(
  registry: ToolcraftModelFormatIdentityRegistry,
): readonly string[] {
  return Object.freeze(
    registry.adapters.flatMap(({ rootExtensions }) => rootExtensions).sort(),
  );
}

export function selectToolcraftModelFormatAdapter<
  Adapter extends ToolcraftModelFormatAdapterIdentity,
>(
  registry: ToolcraftModelFormatIdentityRegistry<Adapter>,
  rootExtension: string,
): Adapter | undefined {
  if (typeof rootExtension !== "string") return undefined;
  const normalizedExtension = rootExtension.toLowerCase();
  if (!ROOT_EXTENSION_PATTERN.test(normalizedExtension)) return undefined;
  return registry.adapters.find(({ rootExtensions }) =>
    rootExtensions.includes(normalizedExtension),
  );
}
