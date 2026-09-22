import {
  createToolcraftDefaultModelFiles,
  findToolcraftDefaultModelSchemaAsset,
  isToolcraftDefaultModelPlaceholder,
  resolveToolcraftDefaultModelControl,
} from "../../../../model-import/default-model-source-assets";
import { normalizeToolcraftModelImportLimits } from "../../../../model-import/model-import-limits";
import {
  hydrateToolcraftPersistedModels,
  type ToolcraftModelHydrationController,
} from "../../../../model-import/model-persistence-hydration";
import {
  createToolcraftModelWorkerClient,
  type ToolcraftModelWorkerClient,
} from "../../../../model-import/worker/model-import-worker-client";
import type {
  ToolcraftCommand,
  ToolcraftMediaAsset,
  ToolcraftState,
} from "../../../../state/types";
import { snapshotToolcraftSourceAssetControl } from "../../../../source-assets/source-asset-admission";
import type { ToolcraftSourceAssetCleanupManager } from "../../../../source-assets/source-asset-cleanup-manager";
import {
  createToolcraftSourceAssetFeedback,
  getToolcraftSourceAssetFeedback,
} from "../../../../source-assets/source-asset-feedback";
import type { ToolcraftSourceAssetImportRunner } from "../../../../source-assets/source-asset-import-runner";
import type {
  ToolcraftSourceAssetDefaultReplacement,
  ToolcraftSourceAssetJobManager,
} from "../../../../source-assets/source-asset-job-manager";
import type { ToolcraftSourceAssetOperationStore } from "../../../../source-assets/source-asset-operation-store";
import type { ToolcraftBinaryAssetRepository } from "../../../../source-assets/repository/binary-asset-repository";
import type { ToolcraftSourceAssetFeedback } from "../../../../source-assets/source-asset-types";

export type ToolcraftSourceAssetModelHydrator = Readonly<{
  cancel: () => void;
  disposeWorker: () => void;
  hydrateModels: () => Promise<void>;
  settle: () => Promise<void>;
}>;

export function createToolcraftSourceAssetModelHydrator({
  cleanupManager,
  createModelWorkerClient,
  dispatch,
  getState,
  importRunner,
  isDefaultReplacementCurrent,
  jobManager,
  operationStore,
  repository,
}: Readonly<{
  cleanupManager: ToolcraftSourceAssetCleanupManager;
  createModelWorkerClient?: () => ToolcraftModelWorkerClient;
  dispatch: (command: ToolcraftCommand) => void;
  getState: () => ToolcraftState;
  importRunner: ToolcraftSourceAssetImportRunner;
  isDefaultReplacementCurrent: (
    replacement: ToolcraftSourceAssetDefaultReplacement,
  ) => boolean;
  jobManager: ToolcraftSourceAssetJobManager;
  operationStore: ToolcraftSourceAssetOperationStore;
  repository: ToolcraftBinaryAssetRepository;
}>): ToolcraftSourceAssetModelHydrator {
  let hydration: ToolcraftModelHydrationController | null = null;
  let hydrationCompletion: Promise<void> | null = null;
  let hydrationRerunRequested = false;
  let hydrationWorkerClient: ToolcraftModelWorkerClient | null = null;
  let workerDisposed = false;

  const markDefaultModelUnavailable = (
    replacement: ToolcraftSourceAssetDefaultReplacement,
    feedback: ToolcraftSourceAssetFeedback,
  ): void => {
    const placeholder = getState().mediaAssets.find(
      (asset) => asset.id === replacement.assetId,
    );
    if (
      placeholder?.assetKind !== "model" ||
      !isDefaultReplacementCurrent(replacement)
    ) return;

    dispatch({
      asset: Object.freeze({
        ...placeholder,
        lastRepairError: feedback,
        lifecycle: "unavailable" as const,
      }),
      expectedPlaceholderRef: replacement.placeholderRef,
      type: "media.hydrateDefaultModel",
    });
  };

  const hydrateDefaultModel = async (
    placeholder: Extract<ToolcraftMediaAsset, { assetKind: "model"; }>,
  ): Promise<void> => {
    if (!placeholder.sourceTarget) {
      markDefaultModelUnavailable(
        {
          assetId: placeholder.id,
          layerId: placeholder.layerId,
          placeholderRef: placeholder.sourceBundleRef,
          sourceTarget: "",
        },
        createToolcraftSourceAssetFeedback(
          "default-model-target-missing",
          "The default model has no upload target.",
          "bundle",
        ),
      );
      return;
    }
    const replacement: ToolcraftSourceAssetDefaultReplacement = Object.freeze({
      assetId: placeholder.id,
      layerId: placeholder.layerId,
      placeholderRef: placeholder.sourceBundleRef,
      sourceTarget: placeholder.sourceTarget,
    });

    try {
      const schemaAsset = findToolcraftDefaultModelSchemaAsset(
        getState().schema,
        placeholder,
      );
      if (!schemaAsset) {
        throw new Error("The default model no longer exists in the app schema.");
      }
      const control = resolveToolcraftDefaultModelControl(
        getState().schema,
        schemaAsset,
      );
      const files = createToolcraftDefaultModelFiles(
        schemaAsset,
        normalizeToolcraftModelImportLimits(control.modelLimits),
      );
      const controlSnapshot = snapshotToolcraftSourceAssetControl(control);
      if (!controlSnapshot) {
        throw new Error("Default model control snapshot is unavailable.");
      }
      const admission = jobManager.reserveAdmission(replacement.sourceTarget);
      const outcome = await jobManager.trackInflight(
        importRunner.runAdmittedImport(
          Object.freeze({
            files,
            origin: "panel" as const,
            target: replacement.sourceTarget,
          }),
          controlSnapshot,
          admission,
          replacement,
        ),
      );
      if (outcome.kind === "rejected") {
        markDefaultModelUnavailable(replacement, outcome.feedback);
      }
    } catch (error) {
      markDefaultModelUnavailable(
        replacement,
        getToolcraftSourceAssetFeedback(error, "default-model-import-failed"),
      );
    }
  };

  const cancelStaleDefaultModelJobs = (): void => {
    for (const job of jobManager.getActiveJobs()) {
      if (
        job.defaultReplacement &&
        !isDefaultReplacementCurrent(job.defaultReplacement)
      ) {
        job.controller.abort();
        operationStore.setOperation({ phase: "idle", target: job.target });
      }
    }
  };

  const runHydrationRound = async (): Promise<void> => {
    cancelStaleDefaultModelJobs();
    const restoringModels = getState().mediaAssets.filter(
      (asset): asset is Extract<ToolcraftMediaAsset, { assetKind: "model"; }> =>
        asset.assetKind === "model" && asset.lifecycle === "restoring",
    );
    const defaultHydrations = restoringModels
      .filter(isToolcraftDefaultModelPlaceholder)
      .filter((asset) => !jobManager.hasDefaultReplacement(asset.id))
      .map((asset) => hydrateDefaultModel(asset));

    const hasPersistedModels = restoringModels.some(
      (asset) => !isToolcraftDefaultModelPlaceholder(asset),
    );
    let persistedHydration: Promise<void> = Promise.resolve();
    if (hasPersistedModels) {
      hydrationWorkerClient ??= createModelWorkerClient?.() ??
        createToolcraftModelWorkerClient();
      hydration = hydrateToolcraftPersistedModels({
        dispatch,
        getState,
        repository,
        workerClient: hydrationWorkerClient,
      });
      persistedHydration = hydration.promise;
    }
    await Promise.all([...defaultHydrations, persistedHydration]);
  };

  const hydrateModels = (): Promise<void> => {
    if (jobManager.isDisposed()) return Promise.resolve();
    cancelStaleDefaultModelJobs();
    if (hydrationCompletion) {
      hydrationRerunRequested = true;
      return hydrationCompletion.then(() => {
        if (jobManager.isDisposed() || !hydrationRerunRequested) return;
        hydrationRerunRequested = false;
        return hydrateModels();
      });
    }

    const completion = runHydrationRound().finally(async () => {
      hydration = null;
      if (!jobManager.isDisposed()) await cleanupManager.collect();
      if (hydrationCompletion === completion) hydrationCompletion = null;
    });
    hydrationCompletion = completion;
    return completion;
  };

  return Object.freeze({
    cancel: () => hydration?.cancel(),
    disposeWorker: () => {
      if (workerDisposed) return;
      workerDisposed = true;
      hydrationWorkerClient?.dispose();
    },
    hydrateModels,
    settle: async () => {
      if (hydrationCompletion) {
        await Promise.allSettled([hydrationCompletion]);
      }
    },
  });
}
