import { isToolcraftDefaultModelPlaceholder } from "../../../../model-import/default-model-source-assets";
import { createToolcraftModelWorkerClient, type ToolcraftModelWorkerClient } from "../../../../model-import/worker/model-import-worker-client";
import { createToolcraftModelRepairController } from "../../../../model-import/model-source-asset-handler-repair-controller";
import { createToolcraftModelSourceAssetHandler } from "../../../../model-import/model-source-asset-handler";
import { createToolcraftSourceAssetModelHydrator } from "./model-hydrator";
import type { ToolcraftSourceAssetRuntimeContext } from "../../../../source-assets/source-asset-runtime-binding";
import type { ToolcraftSourceAssetDefaultReplacement } from "../../../../source-assets/source-asset-job-manager";
import type { ToolcraftSourceAssetFeedback } from "../../../../source-assets/source-asset-types";
import type { ToolcraftState } from "../../../../state/types";

export function createModelSourceBinding(
  getState: () => ToolcraftState,
  createWorkerClient: (() => ToolcraftModelWorkerClient) | undefined,
) {
  const modelWorkerClient = createWorkerClient?.() ?? createToolcraftModelWorkerClient();
  const isDefaultReplacementCurrent = (
    replacement: ToolcraftSourceAssetDefaultReplacement,
  ): boolean => {
    const asset = getState().mediaAssets.find(
      (candidate) => candidate.id === replacement.assetId,
    );
    return asset?.assetKind === "model" &&
      isToolcraftDefaultModelPlaceholder(asset) &&
      asset.layerId === replacement.layerId &&
      asset.sourceBundleRef === replacement.placeholderRef &&
      asset.sourceTarget === replacement.sourceTarget;
  };


  return {
    handler: createToolcraftModelSourceAssetHandler({ workerClient: modelWorkerClient }),
    isDefaultReplacementCurrent,
    attach: (context: ToolcraftSourceAssetRuntimeContext) => {
      const { cleanupManager, dispatch, getState, importRunner, jobManager, operationStore, repository } = context;
      const {
        attachLease,
        beginJob,
        isAdmissionCurrent,
        isCurrent,
        removeJob: removeActiveJob,
        reserveAdmission,
        settleLease,
        trackInflight,
      } = jobManager;

      const finishOperation = (
        job: Parameters<typeof isCurrent>[0],
        feedback?: ToolcraftSourceAssetFeedback,
      ): void => {
        if (!isCurrent(job)) {
          return;
        }

        operationStore.setOperation({
          ...(feedback ? { feedback } : {}),
          phase: "idle",
          target: job.target,
        });
      };

      const modelHydrator = createToolcraftSourceAssetModelHydrator({
        cleanupManager,
        createModelWorkerClient: createWorkerClient,
        dispatch,
        getState,
        importRunner,
        isDefaultReplacementCurrent,
        jobManager,
        operationStore,
        repository,
      });
      const modelRepairController = createToolcraftModelRepairController({
        admit: (target) => {
          const admission = reserveAdmission(target);
          return {
            begin: () => {
              const job = beginJob(admission, "repairing");
              return {
                addStagedResourceRef: (ref) => job.stagedResourceRefs.add(ref),
                attachLease: (lease) => attachLease(job, lease),
                finish: (feedback) => finishOperation(job, feedback),
                isCurrent: () => isCurrent(job),
                jobId: job.jobId,
                release: () => removeActiveJob(job),
                reportOperation: (update) => {
                  if (isCurrent(job)) {
                    operationStore.updateOperation(job.target, update);
                  }
                },
                settleLease: (lease) => settleLease(job, lease),
                signal: job.controller.signal,
              };
            },
            isCurrent: () => isAdmissionCurrent(admission),
          };
        },
        cleanupManager,
        dispatch,
        getState,
        isDisposed: jobManager.isDisposed,
        publishFeedback: (target, feedback) => {
          operationStore.setOperation({ feedback, phase: "idle", target });
        },
        repository,
        trackInflight,
        workerClient: modelWorkerClient,
      });


      return {
        services: { hydrateModels: modelHydrator.hydrateModels, repairModel: modelRepairController.repairModel },
        cancel: modelHydrator.cancel,
        settle: modelHydrator.settle,
        dispose: () => {
          const failures: unknown[] = [];
          try { modelWorkerClient.dispose(); } catch (error) { failures.push(error); }
          try { modelHydrator.disposeWorker(); } catch (error) { failures.push(error); }
          if (failures.length) throw new AggregateError(failures, "Model source binding disposal failed");
        },
      };
    },
  };
}
