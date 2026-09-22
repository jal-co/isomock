import type { ToolcraftCommand, ToolcraftMediaAsset, ToolcraftState } from "../state/types";
import type { ToolcraftBinaryMediaHydrationJob } from "./binary-media-hydration";
import { getToolcraftBinaryMediaHydrationKey } from "./binary-media-hydration";
import {
  createToolcraftMediaResourceRef,
  decodeToolcraftDataUrl,
} from "./media-resource-ref";
import type { ToolcraftBinaryAssetRepository } from "./repository/binary-asset-repository";
import type { ToolcraftSourceAssetCleanupManager } from "./source-asset-cleanup-manager";

type ToolcraftBinaryMediaAsset = Exclude<
  ToolcraftMediaAsset,
  { assetKind: "model" }
>;

function isRestoringBinaryMedia(
  asset: ToolcraftMediaAsset,
): asset is ToolcraftBinaryMediaAsset & { lifecycle: "restoring" } {
  return asset.assetKind !== "model" && asset.lifecycle === "restoring";
}

export function createToolcraftSourceAssetBinaryMediaHydrator({
  cleanupManager,
  dispatch,
  getState,
  repository,
}: {
  cleanupManager: ToolcraftSourceAssetCleanupManager;
  dispatch: (command: ToolcraftCommand) => void;
  getState: () => ToolcraftState;
  repository: ToolcraftBinaryAssetRepository;
}): (jobs: readonly ToolcraftBinaryMediaHydrationJob[]) => Promise<void> {
  let sequence = 0;
  const pendingAssets = new Map<string, Promise<void>>();
  const isCurrentAsset = (asset: ToolcraftBinaryMediaAsset): boolean =>
    getState().mediaAssets.some((candidate) =>
      candidate.id === asset.id &&
      isRestoringBinaryMedia(candidate) &&
      candidate.resourceRef === asset.resourceRef
    );

  const markReady = (asset: ToolcraftBinaryMediaAsset): void => {
    if (!isCurrentAsset(asset)) return;
    dispatch({
      assetId: asset.id,
      expectedResourceRef: asset.resourceRef,
      lifecycle: "ready",
      type: "media.setBinaryResourceState",
    });
  };

  const markUnavailable = (
    asset: ToolcraftBinaryMediaAsset,
    error: unknown,
  ): void => {
    if (!isCurrentAsset(asset)) return;
    dispatch({
      assetId: asset.id,
      error: {
        code: "binary-resource-unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Binary media could not be restored.",
      },
      expectedResourceRef: asset.resourceRef,
      lifecycle: "unavailable",
      type: "media.setBinaryResourceState",
    });
  };

  const hydrateAsset = async (
    asset: ToolcraftBinaryMediaAsset,
    job: ToolcraftBinaryMediaHydrationJob | undefined,
  ): Promise<void> => {
    if (!isCurrentAsset(asset)) {
      return;
    }

    if (!job) {
      const entry = await repository.get(asset.resourceRef);

      if (!entry) {
        throw new Error(
          `Binary media resource "${asset.resourceRef}" is missing.`,
        );
      }

      markReady(asset);
      return;
    }

    const bytes = decodeToolcraftDataUrl(job.dataUrl);
    const resourceRef = createToolcraftMediaResourceRef(job.kind, bytes);

    if (resourceRef !== job.resourceRef) {
      throw new Error("Binary media resource digest changed during hydration.");
    }

    sequence += 1;
    const lease = await repository.beginLease(
      `binary-hydration:${job.assetId}:${sequence}`,
    );

    try {
      await lease.put(resourceRef, bytes, {
        contentType: job.mimeType,
        durable: true,
      });
      await lease.commit();
    } catch (error) {
      await cleanupManager.rollback(lease);
      throw error;
    }

    markReady(asset);
  };

  const hydrateOnce = (
    asset: ToolcraftBinaryMediaAsset,
    job: ToolcraftBinaryMediaHydrationJob | undefined,
  ): Promise<void> => {
    const key = getToolcraftBinaryMediaHydrationKey(asset.id, asset.resourceRef);
    const pending = pendingAssets.get(key);
    if (pending) return pending;

    // Ready notifications synchronously re-enter hydration for the remaining
    // assets. Register before starting work so those callers share its lifetime.
    const operation = Promise.resolve()
      .then(() => hydrateAsset(asset, job))
      .catch((error: unknown) => markUnavailable(asset, error))
      .finally(() => pendingAssets.delete(key));
    pendingAssets.set(key, operation);
    return operation;
  };

  return async (jobs) => {
    const jobsByAsset = new Map(
      jobs.map((job) => [
        getToolcraftBinaryMediaHydrationKey(job.assetId, job.resourceRef),
        job,
      ]),
    );
    const restoringAssets = getState().mediaAssets.filter(
      isRestoringBinaryMedia,
    );

    await Promise.all(
      restoringAssets.map((asset) => {
        const job = jobsByAsset.get(
          getToolcraftBinaryMediaHydrationKey(asset.id, asset.resourceRef),
        );

        return hydrateOnce(asset, job);
      }),
    );
    await cleanupManager.collect();
  };
}
