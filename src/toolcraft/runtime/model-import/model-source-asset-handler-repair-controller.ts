import type { ToolcraftSourceAssetCleanupManager } from "../source-assets/source-asset-cleanup-manager";
import type {
  ToolcraftBinaryAssetLease,
  ToolcraftBinaryAssetRepository,
} from "../source-assets/repository/binary-asset-repository";
import type {
  ToolcraftSourceAssetFeedback,
  ToolcraftSourceAssetImportOutcome,
  ToolcraftSourceAssetOperationUpdate,
} from "../source-assets/source-asset-types";
import type { ToolcraftCommand, ToolcraftState } from "../state/types";
import type { ToolcraftModelWorkerClient } from "./worker/model-import-worker-client";
import {
  isToolcraftModelRepairSnapshotCurrent,
  prepareToolcraftModelRepair,
  snapshotToolcraftModelRepair,
  type ToolcraftModelRepairSnapshot,
} from "./model-source-asset-handler-repair";

export type ToolcraftModelRepairJob = Readonly<{
  addStagedResourceRef: (ref: string) => void;
  attachLease: (lease: ToolcraftBinaryAssetLease) => void;
  finish: (feedback?: ToolcraftSourceAssetFeedback) => void;
  isCurrent: () => boolean;
  jobId: string;
  release: () => void;
  reportOperation: (update: ToolcraftSourceAssetOperationUpdate) => void;
  settleLease: (lease: ToolcraftBinaryAssetLease) => void;
  signal: AbortSignal;
}>;

export type ToolcraftModelRepairAdmission = Readonly<{
  begin: () => ToolcraftModelRepairJob;
  isCurrent: () => boolean;
}>;

export type ToolcraftModelRepairController = Readonly<{
  repairModel: (assetId: string) => Promise<ToolcraftSourceAssetImportOutcome>;
}>;

export type CreateToolcraftModelRepairControllerOptions = Readonly<{
  admit: (target: string) => ToolcraftModelRepairAdmission;
  cleanupManager: ToolcraftSourceAssetCleanupManager;
  dispatch: (command: ToolcraftCommand) => void;
  getState: () => ToolcraftState;
  isDisposed: () => boolean;
  publishFeedback: (
    target: string,
    feedback: ToolcraftSourceAssetFeedback,
  ) => void;
  repository: ToolcraftBinaryAssetRepository;
  trackInflight: (
    promise: Promise<ToolcraftSourceAssetImportOutcome>,
  ) => Promise<ToolcraftSourceAssetImportOutcome>;
  workerClient: ToolcraftModelWorkerClient;
}>;

const FEEDBACK_CATEGORIES = new Set<ToolcraftSourceAssetFeedback["category"]>([
  "bundle",
  "format",
  "geometry",
  "repair",
  "resource-limit",
  "resource-unavailable",
  "topology",
]);

function feedback(
  code: string,
  message: string,
  category: ToolcraftSourceAssetFeedback["category"],
): ToolcraftSourceAssetFeedback {
  return Object.freeze({ category, code, message });
}

function feedbackFromError(error: unknown): ToolcraftSourceAssetFeedback {
  if (typeof error === "object" && error !== null) {
    const candidate = error as Partial<ToolcraftSourceAssetFeedback>;
    if (
      candidate.category !== undefined &&
      FEEDBACK_CATEGORIES.has(candidate.category) &&
      typeof candidate.code === "string" &&
      typeof candidate.message === "string"
    ) {
      return feedback(candidate.code, candidate.message, candidate.category);
    }
  }
  return feedback(
    "model-repair-failed",
    error instanceof Error && error.message
      ? error.message
      : "The model repair could not be completed.",
    "repair",
  );
}

function abortError(): Error {
  const error = new Error("Model repair was cancelled.");
  error.name = "AbortError";
  return error;
}

function validateStagedRefs(
  declared: readonly string[],
  lease: ToolcraftBinaryAssetLease,
): void {
  const unique = [...new Set(declared)].sort();
  const leased = [...lease.refs()].sort();
  if (
    unique.length !== declared.length ||
    unique.length !== leased.length ||
    unique.some((ref, index) => ref !== leased[index])
  ) {
    throw new Error("Prepared model repair refs must exactly match the lease.");
  }
}

export function createToolcraftModelRepairController({
  admit,
  cleanupManager,
  dispatch,
  getState,
  isDisposed,
  publishFeedback,
  repository,
  trackInflight,
  workerClient,
}: CreateToolcraftModelRepairControllerOptions): ToolcraftModelRepairController {
  const flights = new Map<string, Promise<ToolcraftSourceAssetImportOutcome>>();

  const setRepairError = (
    snapshot: ToolcraftModelRepairSnapshot,
    value: ToolcraftSourceAssetFeedback | null,
  ): void => {
    dispatch({
      assetId: snapshot.assetId,
      expectedActiveDocumentRef: snapshot.activeDocumentRef,
      expectedSourceBundleDigest: snapshot.sourceBundleDigest,
      feedback: value,
      type: "media.setModelRepairError",
    });
  };

  const runRepair = async (
    snapshot: ToolcraftModelRepairSnapshot,
    admission: ToolcraftModelRepairAdmission,
  ): Promise<ToolcraftSourceAssetImportOutcome> => {
    await cleanupManager.retryRollbacks();
    if (!admission.isCurrent()) return { kind: "cancelled" };

    const job = admission.begin();
    let committed = false;
    let lease: ToolcraftBinaryAssetLease | null = null;
    try {
      lease = await repository.beginLease(job.jobId);
      job.attachLease(lease);
      if (
        !job.isCurrent() ||
        !isToolcraftModelRepairSnapshotCurrent(getState().mediaAssets, snapshot)
      ) {
        try {
          await cleanupManager.rollback(lease);
        } finally {
          job.settleLease(lease);
        }
        job.release();
        return { kind: "cancelled" };
      }
      setRepairError(snapshot, null);

      const prepared = await prepareToolcraftModelRepair({
        jobId: job.jobId,
        readResource: (ref) => lease!.get(ref),
        reportOperation: job.reportOperation,
        signal: job.signal,
        snapshot,
        stageResource: async (ref, bytes, options) => {
          if (!job.isCurrent()) throw abortError();
          await lease!.put(ref, bytes, options);
          job.addStagedResourceRef(ref);
          if (!job.isCurrent()) throw abortError();
        },
        workerClient,
      });

      if (
        !job.isCurrent() ||
        !isToolcraftModelRepairSnapshotCurrent(getState().mediaAssets, snapshot)
      ) {
        try {
          await cleanupManager.rollback(lease);
        } finally {
          job.settleLease(lease);
        }
        job.release();
        return { kind: "cancelled" };
      }
      validateStagedRefs(prepared.stagedResourceRefs, lease);
      await lease.commit();
      committed = true;
      job.settleLease(lease);

      if (!job.isCurrent()) {
        job.release();
        await cleanupManager.collect();
        return { kind: "cancelled" };
      }
      dispatch(prepared.command);
      const current = getState().mediaAssets.find(
        ({ id }) => id === snapshot.assetId,
      );
      if (
        !current ||
        current.assetKind !== "model" ||
        current.lifecycle !== "fixed" ||
        current.activeDocumentRef !== prepared.repairedDocumentRef
      ) {
        job.release();
        await cleanupManager.collect();
        return { kind: "cancelled" };
      }

      job.finish();
      job.release();
      await cleanupManager.collect();
      return {
        assetIds: Object.freeze([snapshot.assetId]),
        kind: "committed",
      };
    } catch (error) {
      const failure = feedbackFromError(error);
      const shouldReport = job.isCurrent() &&
        isToolcraftModelRepairSnapshotCurrent(getState().mediaAssets, snapshot);

      if (committed) {
        if (shouldReport) job.finish(failure);
        job.release();
        await cleanupManager.collect();
      } else {
        try {
          await cleanupManager.rollback(lease);
        } finally {
          if (lease) job.settleLease(lease);
        }
        if (shouldReport) {
          setRepairError(snapshot, failure);
          job.finish(failure);
        }
        job.release();
      }
      return shouldReport
        ? { feedback: failure, kind: "rejected" }
        : { kind: "cancelled" };
    }
  };

  return {
    repairModel: (assetId) => {
      const existing = flights.get(assetId);
      if (existing) return existing;

      const asset = getState().mediaAssets.find(({ id }) => id === assetId);
      const snapshot = snapshotToolcraftModelRepair(asset);
      if (isDisposed() || !snapshot) {
        const failure = isDisposed()
          ? feedback(
              "coordinator-disposed",
              "The source asset coordinator is no longer available.",
              "resource-unavailable",
            )
          : feedback(
              "model-not-repairable",
              "The selected model does not have an active repair plan.",
              "repair",
            );
        publishFeedback(asset?.sourceTarget ?? assetId, failure);
        return Promise.resolve({ feedback: failure, kind: "rejected" });
      }

      const admission = admit(snapshot.target);
      const promise = trackInflight(runRepair(snapshot, admission));
      flights.set(assetId, promise);
      void promise.then(
        () => {
          if (flights.get(assetId) === promise) flights.delete(assetId);
        },
        () => {
          if (flights.get(assetId) === promise) flights.delete(assetId);
        },
      );
      return promise;
    },
  };
}
