import type { ToolcraftBinaryAssetRepository } from "../source-assets/repository/binary-asset-repository";
import type { ToolcraftModelAsset } from "../state/types";
import { TOOLCRAFT_MODEL_DOCUMENT_CONTENT_TYPE } from "./model-source-asset-handler-resources";
import {
  parseToolcraftModelAppearanceResourceRef,
  parseToolcraftModelRepairPlanResourceRef,
  TOOLCRAFT_MODEL_REPAIR_PLAN_CONTENT_TYPE,
} from "./model-source-asset-handler-resources";
import { decodeToolcraftModelDocument } from "./canonical/model-document-codec";
import { TOOLCRAFT_DEFAULT_MODEL_IMPORT_LIMITS } from "./model-import-limit-values";
import {
  decodeToolcraftModelSourceBundleDescriptor,
  TOOLCRAFT_MODEL_SOURCE_BUNDLE_DESCRIPTOR_CONTENT_TYPE,
} from "./model-source-bundle-codec";
import type {
  ToolcraftModelSourceBundle,
  ToolcraftModelSourceBundleTransfer,
} from "./model-import-types";
import type { ToolcraftModelWorkerClient } from "./worker/model-import-worker-client";
import { sha256ToolcraftModelWorkerBytes } from "./worker/model-import-worker-result-verification";
import { decodeToolcraftModelRepairPlanEnvelope } from "./topology/model-repair-plan-codec";
import type { ToolcraftModelTopologyProfile } from "../schema/types";

export type ToolcraftPersistedModelLifecycle = "clean" | "fixed" | "repairable";

function abortIfRequested(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const error = new Error("Model hydration was cancelled.");
  error.name = "AbortError";
  throw error;
}

function ownedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export function inferToolcraftPersistedModelLifecycle(
  asset: ToolcraftModelAsset,
): ToolcraftPersistedModelLifecycle {
  if (asset.appliedRepairRecipeId || asset.repairedDocumentRef) return "fixed";
  return asset.analysis.outcome === "repairable" ? "repairable" : "clean";
}

export async function hasValidToolcraftModelDocumentResource(
  repository: ToolcraftBinaryAssetRepository,
  ref: string,
  signal: AbortSignal,
): Promise<boolean> {
  abortIfRequested(signal);
  const entry = await repository.get(ref);
  abortIfRequested(signal);
  if (!entry || entry.contentType !== TOOLCRAFT_MODEL_DOCUMENT_CONTENT_TYPE) {
    return false;
  }
  const expectedDigest = ref.startsWith("toolcraft:model-document:")
    ? ref.slice("toolcraft:model-document:".length)
    : null;
  if (!expectedDigest) return false;
  if (
    (await sha256ToolcraftModelWorkerBytes(ownedBytes(entry.bytes))) !==
    expectedDigest
  )
    return false;
  try {
    const document = decodeToolcraftModelDocument(entry.bytes);
    const textures = document.version === 1 ? [] : document.textures;
    const expectedRefs = [
      ...new Set(textures.map(({ resourceRef }) => resourceRef)),
    ].sort();
    if (
      entry.dependencies.length !== expectedRefs.length ||
      entry.dependencies.some(
        (dependency, index) => dependency !== expectedRefs[index],
      )
    )
      return false;
    const texturesByRef = new Map(
      textures.map((texture) => [texture.resourceRef, texture]),
    );
    const valid = await Promise.all(
      expectedRefs.map(async (resourceRef) => {
        const identity = parseToolcraftModelAppearanceResourceRef(resourceRef);
        const texture = texturesByRef.get(resourceRef);
        const resource = await repository.get(resourceRef);
        abortIfRequested(signal);
        return (
          identity !== null &&
          texture?.contentDigest === identity &&
          resource?.contentType === texture.mimeType &&
          (await sha256ToolcraftModelWorkerBytes(
            ownedBytes(resource.bytes),
          )) === identity
        );
      }),
    );
    return valid.every(Boolean);
  } catch {
    return false;
  }
}

export async function hasValidToolcraftModelRepairPlanResource(
  repository: ToolcraftBinaryAssetRepository,
  ref: string,
  topologyProfile: ToolcraftModelTopologyProfile,
  signal: AbortSignal,
): Promise<boolean> {
  abortIfRequested(signal);
  const identity = parseToolcraftModelRepairPlanResourceRef(ref);
  if (!identity) return false;
  const entry = await repository.get(ref);
  abortIfRequested(signal);
  if (
    !entry ||
    entry.ref !== ref ||
    entry.contentType !== TOOLCRAFT_MODEL_REPAIR_PLAN_CONTENT_TYPE ||
    (await sha256ToolcraftModelWorkerBytes(ownedBytes(entry.bytes))) !==
      identity.envelopeDigest
  ) {
    return false;
  }
  try {
    decodeToolcraftModelRepairPlanEnvelope(entry.bytes, {
      expectedPlanDigest: identity.planDigest,
      expectedProfile: topologyProfile,
      limits: TOOLCRAFT_DEFAULT_MODEL_IMPORT_LIMITS,
    });
    return true;
  } catch {
    return false;
  }
}

async function readSourceFile(
  repository: ToolcraftBinaryAssetRepository,
  file: ToolcraftModelSourceBundle["sourceFiles"][number],
  signal: AbortSignal,
): Promise<ToolcraftModelSourceBundleTransfer["sourceFiles"][number]> {
  abortIfRequested(signal);
  const entry = await repository.get(file.resourceRef);
  abortIfRequested(signal);
  if (
    !entry ||
    entry.ref !== file.resourceRef ||
    entry.contentType !== file.mimeType ||
    entry.bytes.byteLength !== file.byteLength ||
    (await sha256ToolcraftModelWorkerBytes(ownedBytes(entry.bytes))) !==
      file.contentDigest
  ) {
    throw new Error(`Model source resource "${file.path}" is unavailable.`);
  }
  return Object.freeze({
    bytes: ownedBytes(entry.bytes).buffer,
    contentDigest: file.contentDigest,
    mimeType: file.mimeType,
    path: file.path,
  });
}

async function readZipSourceFiles(
  repository: ToolcraftBinaryAssetRepository,
  bundle: ToolcraftModelSourceBundle,
  workerClient: ToolcraftModelWorkerClient,
  jobId: string,
  signal: AbortSignal,
): Promise<
  readonly ToolcraftModelSourceBundleTransfer["sourceFiles"][number][]
> {
  if (bundle.packageSource.kind !== "zip") {
    throw new Error("The model source package is not a ZIP archive.");
  }
  const { archive, entries: expectedEntries } = bundle.packageSource;
  abortIfRequested(signal);
  const storedArchive = await repository.get(archive.resourceRef);
  abortIfRequested(signal);
  if (
    !storedArchive ||
    storedArchive.ref !== archive.resourceRef ||
    storedArchive.contentType !== archive.mimeType ||
    storedArchive.bytes.byteLength !== archive.byteLength ||
    (await sha256ToolcraftModelWorkerBytes(ownedBytes(storedArchive.bytes))) !==
      archive.contentDigest
  ) {
    throw new Error("The saved model archive is unavailable.");
  }
  const terminal = await workerClient.extractModelPackage(
    {
      archive: ownedBytes(storedArchive.bytes),
      archiveDigest: archive.contentDigest,
      jobId,
      limits: TOOLCRAFT_DEFAULT_MODEL_IMPORT_LIMITS,
    },
    { signal },
  );
  abortIfRequested(signal);
  if (terminal.kind === "cancelled") {
    const error = new Error("Model hydration was cancelled.");
    error.name = "AbortError";
    throw error;
  }
  if (terminal.kind === "error") throw new Error(terminal.feedback.message);
  if (terminal.result.entries.length !== expectedEntries.length) {
    throw new Error("The saved model archive manifest has changed.");
  }
  const extractedByPath = new Map(
    terminal.result.entries.map((entry) => [entry.path, entry]),
  );
  if (extractedByPath.size !== expectedEntries.length) {
    throw new Error("The saved model archive manifest is ambiguous.");
  }
  for (const expected of expectedEntries) {
    const extracted = extractedByPath.get(expected.path);
    if (
      !extracted ||
      extracted.uncompressedBytes !== expected.byteLength ||
      extracted.contentDigest !== expected.contentDigest ||
      extracted.mimeType !== expected.mimeType ||
      (await sha256ToolcraftModelWorkerBytes(
        new Uint8Array(extracted.bytes),
      )) !== expected.contentDigest
    ) {
      throw new Error("The saved model archive manifest has changed.");
    }
  }
  return Object.freeze(
    bundle.sourceFiles.map((file) => {
      const extracted = extractedByPath.get(file.path);
      if (!extracted) {
        throw new Error(`Model source resource "${file.path}" is unavailable.`);
      }
      return Object.freeze({
        bytes: ownedBytes(new Uint8Array(extracted.bytes)).buffer,
        contentDigest: file.contentDigest,
        mimeType: file.mimeType,
        path: file.path,
      });
    }),
  );
}

export async function readToolcraftModelSourceBundleForHydration(
  repository: ToolcraftBinaryAssetRepository,
  asset: ToolcraftModelAsset,
  workerClient: ToolcraftModelWorkerClient,
  signal: AbortSignal,
): Promise<
  Readonly<{
    bundle: ToolcraftModelSourceBundle;
    transfer: ToolcraftModelSourceBundleTransfer;
  }>
> {
  abortIfRequested(signal);
  const descriptor = await repository.get(asset.sourceBundleRef);
  abortIfRequested(signal);
  if (
    !descriptor ||
    descriptor.ref !== asset.sourceBundleRef ||
    descriptor.contentType !==
      TOOLCRAFT_MODEL_SOURCE_BUNDLE_DESCRIPTOR_CONTENT_TYPE
  ) {
    throw new Error("The model source bundle is unavailable.");
  }
  const bundle = decodeToolcraftModelSourceBundleDescriptor(descriptor.bytes);
  if (bundle.aggregateDigest !== asset.sourceBundleDigest) {
    throw new Error("The model source bundle identity does not match state.");
  }
  const sourceFiles =
    bundle.packageSource.kind === "zip"
      ? await readZipSourceFiles(
          repository,
          bundle,
          workerClient,
          `model-hydration-extract-${asset.id}`,
          signal,
        )
      : (
          await Promise.all(
            bundle.sourceFiles.map(async (file) => {
              try {
                return await readSourceFile(repository, file, signal);
              } catch (error) {
                abortIfRequested(signal);
                if (file.path === bundle.rootPath) throw error;
                return null;
              }
            }),
          )
        ).filter((file): file is NonNullable<typeof file> => file !== null);
  return Object.freeze({
    bundle,
    transfer: Object.freeze({
      aggregateDigest: bundle.aggregateDigest,
      rootPath: bundle.rootPath,
      sourceFiles: Object.freeze(sourceFiles),
    }),
  });
}
