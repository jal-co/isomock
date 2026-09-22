import {
  hasValidToolcraftModelDocumentResource,
  hasValidToolcraftModelRepairPlanResource,
  inferToolcraftPersistedModelLifecycle,
} from "../model-import/model-persistence-hydration-resources";
import { decodeToolcraftModelSourceBundleDescriptor } from "../model-import/model-source-bundle-codec";
import { cloneToolcraftMediaAssets } from "../state/media-defaults";
import { projectToolcraftPersistedModel } from "../state/persistence-model-projection";
import { readMediaAssets } from "../state/persistence-reader-media";
import { isToolcraftPersistenceRecord } from "../state/persistence-shared";
import type { ToolcraftMediaAsset } from "../state/types";
import { createToolcraftMediaResourceRef } from "./media-resource-ref";
import type { ToolcraftBinaryAssetRepository } from "./repository/binary-asset-repository";
import { collectToolcraftMediaResourceRefs } from "./repository/resource-reachability";

export type ToolcraftSettingsAttachment = Readonly<{
  paths: readonly string[];
  /** null retains source information for an asset with no durable snapshot yet. */
  asset: ToolcraftMediaAsset | null;
}>;

export function createToolcraftSettingsAttachments(
  assets: readonly ToolcraftMediaAsset[],
): ToolcraftSettingsAttachment[] {
  return cloneToolcraftMediaAssets(assets).map((asset) => {
    const paths = [
      ...(asset.sourcePaths?.length ? asset.sourcePaths : [asset.fileName]),
    ];
    try {
      const { sourcePaths: _paths, ...snapshot } =
        projectToolcraftPersistedModel(asset);
      return { paths, asset: snapshot };
    } catch {
      // An in-flight/default model has paths but not necessarily durable refs.
      return { paths, asset: null };
    }
  });
}

export function parseToolcraftSettingsAttachments(
  entries: readonly unknown[],
): ToolcraftSettingsAttachment[] {
  return entries.map((entry) => {
    if (!isToolcraftPersistenceRecord(entry)) return { paths: [], asset: null };
    const paths = Array.isArray(entry.paths)
      ? entry.paths.filter(
          (path): path is string => typeof path === "string" && path.length > 0,
        )
      : [];
    const asset =
      paths.length && isToolcraftPersistenceRecord(entry.asset)
        ? (readMediaAssets([{ ...entry.asset, sourcePaths: paths }])?.[0] ??
          null)
        : null;
    return { paths, asset };
  });
}

async function hasCompleteResources(
  repository: ToolcraftBinaryAssetRepository,
  asset: ToolcraftMediaAsset,
): Promise<boolean> {
  const pending = [...collectToolcraftMediaResourceRefs([asset])];
  const seen = new Set<string>();
  // Repository dependencies include model source files, archives and textures.
  // Walk iteratively so shared refs/cycles cannot cause recursive expansion.
  while (pending.length) {
    const ref = pending.pop()!;
    if (seen.has(ref)) continue;
    seen.add(ref);
    const entry = await repository.get(ref);
    if (!entry) return false;
    pending.push(...entry.dependencies);
  }
  return true;
}

/** Repository-only restoration: a JSON path never authorizes a disk/network read. */
export async function resolveToolcraftSettingsAsset(
  asset: ToolcraftMediaAsset,
  repository: ToolcraftBinaryAssetRepository,
): Promise<ToolcraftMediaAsset | null> {
  try {
    if (asset.assetKind !== "model") {
      const resource = await repository.get(asset.resourceRef);
      if (
        !resource ||
        createToolcraftMediaResourceRef(asset.assetKind, resource.bytes) !==
          asset.resourceRef
      ) {
        return null;
      }
      const { error: _error, ...record } = { ...asset, error: undefined };
      return { ...record, lifecycle: "ready" };
    }

    if (!(await hasCompleteResources(repository, asset))) return null;
    const descriptor = await repository.get(asset.sourceBundleRef);
    if (
      !descriptor ||
      decodeToolcraftModelSourceBundleDescriptor(descriptor.bytes)
        .aggregateDigest !== asset.sourceBundleDigest
    ) {
      return null;
    }
    const signal = new AbortController().signal;
    if (
      !(await hasValidToolcraftModelDocumentResource(
        repository,
        asset.activeDocumentRef,
        signal,
      ))
    )
      return null;
    const lifecycle = inferToolcraftPersistedModelLifecycle(asset);
    if (
      lifecycle === "repairable" &&
      (!asset.analysis.repairPlanRef ||
        !(await hasValidToolcraftModelRepairPlanResource(
          repository,
          asset.analysis.repairPlanRef,
          asset.topologyProfile,
          signal,
        )))
    ) {
      return null;
    }
    const { lastRepairError: _error, ...record } = asset;
    return { ...record, lifecycle };
  } catch {
    // Failure belongs to this attachment, never the surrounding settings file.
    return null;
  }
}
