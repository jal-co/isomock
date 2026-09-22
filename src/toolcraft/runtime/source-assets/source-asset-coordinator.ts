import type { ToolcraftCommand, ToolcraftState } from "../state/types";
import { createToolcraftSourceAssetCleanupManager } from "./source-asset-cleanup-manager";
import {
  createToolcraftSourceAssetImportRunner,
  DIRECT_CANVAS_OPERATION_TARGET,
  DIRECT_CANVAS_SOURCE_ASSET_CONTROL,
} from "./source-asset-import-runner";
import { createToolcraftSourceAssetJobManager } from "./source-asset-job-manager";
import { createToolcraftSourceAssetOperationStore } from "./source-asset-operation-store";
import { createToolcraftSourceAssetResourceResolver } from "./source-asset-resource-resolver";
import type { ToolcraftBinaryAssetRepository } from "./repository/binary-asset-repository";
import { captureToolcraftDefaultResources } from "./default-resource-capture";
import { assertToolcraftBinaryAssetRef } from "./repository/binary-asset-repository";
import { collectToolcraftReachableResourceRefs } from "./repository/resource-reachability";
import { createToolcraftSourceAssetBinaryMediaHydrator } from "./source-asset-binary-media-hydrator";
import { resolveToolcraftSettingsAsset } from "./settings-media";

import type { ToolcraftSourceAssetRuntimeBinding } from "./source-asset-runtime-binding";
import type { ToolcraftSourceAssetCoordinator } from "./source-asset-coordinator-types";
export type { ToolcraftSourceAssetCoordinator, ToolcraftModelRepairCoordinator } from "./source-asset-coordinator-types";

export type CreateToolcraftSourceAssetRuntimeOptions<Services extends object> = {
  binding: ToolcraftSourceAssetRuntimeBinding<Services>;
  dispatch: (command: ToolcraftCommand) => void;
  getState: () => ToolcraftState;
  jobIdFactory?: () => string;
  repository: ToolcraftBinaryAssetRepository;
};
export { DIRECT_CANVAS_OPERATION_TARGET, DIRECT_CANVAS_SOURCE_ASSET_CONTROL };

export function createToolcraftSourceAssetRuntime<Services extends object>({
  binding, dispatch, getState, jobIdFactory, repository,
}: CreateToolcraftSourceAssetRuntimeOptions<Services>): Readonly<{ coordinator: Omit<ToolcraftSourceAssetCoordinator, "hydrateModels" | "repairModel">; services: Services }> {
  const { registry, isDefaultReplacementCurrent } = binding;
  const operationStore = createToolcraftSourceAssetOperationStore();
  const presentationRefCounts = new Map<string, number>();
  let disposePromise: Promise<void> | null = null;

  const jobManager = createToolcraftSourceAssetJobManager({
    jobIdFactory,
    onBegin: (job, phase) => {
      operationStore.setOperation({
        jobId: job.jobId,
        phase,
        target: job.target,
      });
    },
    onCancelTarget: (target) => {
      operationStore.setOperation({ phase: "idle", target });
    },
  });
  const cleanupManager = createToolcraftSourceAssetCleanupManager({
    getReachableRefs: () =>
      collectToolcraftReachableResourceRefs({
        activeJobs: jobManager.getActiveJobs().map((job) => ({
          stagedResourceRefs: [...job.stagedResourceRefs].sort(),
        })),
        activePresentationRefs: [...presentationRefCounts.keys()].sort(),
        state: getState(),
      }),
    repository,
  });

  const importRunner = createToolcraftSourceAssetImportRunner({
    cleanupManager,
    dispatch,
    getState,
    isDefaultReplacementCurrent,
    jobManager,
    operationStore,
    registry,
    repository,
  });
  const importBatch = importRunner.importBatch;
  const extension = binding.attach({ cleanupManager, dispatch, getState, importRunner, isDefaultReplacementCurrent, jobManager, operationStore, repository });
  const hydrateBinaryMedia = createToolcraftSourceAssetBinaryMediaHydrator({
    cleanupManager,
    dispatch,
    getState,
    repository,
  });

  const resolveResource = createToolcraftSourceAssetResourceResolver({
    getActiveJobs: jobManager.getActiveJobs,
    isDisposed: jobManager.isDisposed,
    repository,
  });

  const coordinator: Omit<ToolcraftSourceAssetCoordinator, "hydrateModels" | "repairModel"> = {
    captureDefaultResources: assets => {
      if (jobManager.isDisposed() || jobManager.getActiveJobs().length > 0) {
        return Promise.reject(new Error("Wait for file operations to finish before saving defaults."));
      }
      return captureToolcraftDefaultResources(assets, repository, ref => coordinator.retainResourceRef!(ref));
    },
    cancelTarget: jobManager.cancelTarget,
    clearPresentationFeedback: operationStore.clearPresentationFeedback,
    dispose: () => {
      if (disposePromise) {
        return disposePromise;
      }

      // Publish the promise before abort/cancel callbacks can re-enter dispose.
      let resolveDisposal!: () => void;
      let rejectDisposal!: (error: unknown) => void;
      disposePromise = new Promise<void>((resolve, reject) => {
        resolveDisposal = resolve;
        rejectDisposal = reject;
      });
      void (async () => {
        const failures: unknown[] = [];
        let jobsSettled: Promise<void> | undefined;
        // Close admission synchronously, then cancel extension work before
        // awaiting either owner's settlement.
        try { jobsSettled = jobManager.beginDispose(); } catch (error) { failures.push(error); }
        try { await extension.cancel(); } catch (error) { failures.push(error); }
        try { await jobsSettled; } catch (error) { failures.push(error); }
        try { await extension.settle(); } catch (error) { failures.push(error); }
        try { operationStore.dispose(); } catch (error) { failures.push(error); }
        try { await extension.dispose(); } catch (error) { failures.push(error); }
        try {
          await cleanupManager.dispose();
        } catch (error) {
          failures.push(error);
        }
        if (failures.length > 0) {
          throw new AggregateError(
            failures,
            "Source asset coordinator cleanup and disposal failed",
          );
        }
      })().then(resolveDisposal, rejectDisposal);
      return disposePromise;
    },
    getOperation: operationStore.getOperation,
    supportsKind: (kind) =>
      registry.handlers.some((handler) => handler.kind === kind),
    hydrateBinaryMedia,
    importBatch,
    reportPresentationFeedback: operationStore.setPresentationFeedback,
    retainResourceRef: (ref) => {
      assertToolcraftBinaryAssetRef(ref);
      if (jobManager.isDisposed()) {
        throw new Error("Source asset coordinator is disposed.");
      }
      presentationRefCounts.set(ref, (presentationRefCounts.get(ref) ?? 0) + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const count = presentationRefCounts.get(ref);
        if (count === undefined || count <= 1) presentationRefCounts.delete(ref);
        else presentationRefCounts.set(ref, count - 1);
      };
    },
    resolveResource,
    resolveSettingsAsset: (asset) => resolveToolcraftSettingsAsset(asset, repository),
    subscribe: operationStore.subscribe,
  };
  return Object.freeze({ coordinator, services: extension.services });
}
