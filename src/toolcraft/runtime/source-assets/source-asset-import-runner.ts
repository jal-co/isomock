import type { ToolcraftControlSchema } from "../schema/types";
import { normalizeToolcraftMediaImportIngress } from "../state/media-import-ingress";
import { createToolcraftMediaImportAllocation } from "../state/media-import-allocation";
import type { ToolcraftCommand, ToolcraftState } from "../state/types";
import {
  createCanonicalToolcraftSourceAssetPlan,
  snapshotToolcraftSourceAssetBatch,
  snapshotToolcraftSourceAssetControl,
} from "./source-asset-admission";
import type { ToolcraftSourceAssetCleanupManager } from "./source-asset-cleanup-manager";
import {
  createToolcraftSourceAssetFeedback,
  getToolcraftSourceAssetErrorMessage,
  getToolcraftSourceAssetFeedback,
} from "./source-asset-feedback";
import type {
  ToolcraftSourceAssetAdmission,
  ToolcraftSourceAssetDefaultReplacement,
  ToolcraftSourceAssetJob,
  ToolcraftSourceAssetJobManager,
} from "./source-asset-job-manager";
import type { ToolcraftSourceAssetOperationStore } from "./source-asset-operation-store";
import {
  freezeToolcraftPreparedAssetDraft,
  validateToolcraftPreparedSourceAssets,
  validateToolcraftSourceAssetPlan,
} from "./source-asset-prepared-result";
import { createToolcraftSourceAssetAbortError } from "./source-asset-resource-resolver";
import {
  getToolcraftSourceAssetHandler,
  selectToolcraftSourceAssetHandler,
  type ToolcraftSourceAssetRegistry,
} from "./source-asset-registry";
import type {
  ToolcraftBinaryAssetLease,
  ToolcraftBinaryAssetRepository,
} from "./repository/binary-asset-repository";
import type {
  ToolcraftSourceAssetBatch,
  ToolcraftSourceAssetFeedback,
  ToolcraftSourceAssetImportOutcome,
} from "./source-asset-types";
import { getToolcraftCanvasFrame } from "../state/canvas-frame";

export const DIRECT_CANVAS_OPERATION_TARGET = "toolcraft.canvas.image";

export const DIRECT_CANVAS_SOURCE_ASSET_CONTROL: ToolcraftControlSchema =
  Object.freeze({
    applicability: { mode: "always" as const },
    multiple: true,
    target: DIRECT_CANVAS_OPERATION_TARGET,
    type: "fileDrop",
  });

export type ToolcraftSourceAssetImportRunner = Readonly<{
  importBatch: (
    batch: ToolcraftSourceAssetBatch,
    control?: ToolcraftControlSchema,
  ) => Promise<ToolcraftSourceAssetImportOutcome>;
  runAdmittedImport: (
    batch: ToolcraftSourceAssetBatch,
    control: ToolcraftControlSchema,
    admission: ToolcraftSourceAssetAdmission,
    defaultReplacement?: ToolcraftSourceAssetDefaultReplacement,
  ) => Promise<ToolcraftSourceAssetImportOutcome>;
}>;

function getFileDropHardMaxItems(
  control: ToolcraftControlSchema,
): number | null {
  if (control.type !== "fileDrop" || control.hardMaxItems === undefined) {
    return null;
  }
  if (
    typeof control.hardMaxItems !== "number" ||
    !Number.isSafeInteger(control.hardMaxItems) ||
    control.hardMaxItems < 0
  ) {
    throw new Error(
      "fileDrop hardMaxItems must be a finite nonnegative safe integer.",
    );
  }
  return control.hardMaxItems;
}

function getHardMaxItemsFeedback({
  control,
  plan,
  state,
}: {
  control: ToolcraftControlSchema;
  plan: Readonly<{
    logicalAssetCount: number;
    replaceExisting: boolean;
    sourceTarget?: string;
  }>;
  state: ToolcraftState;
}): ToolcraftSourceAssetFeedback | null {
  const hardMaxItems = getFileDropHardMaxItems(control);
  if (hardMaxItems === null) return null;

  const existingItemCount = plan.replaceExisting
    ? 0
    : state.mediaAssets.filter(
        (asset) => asset.sourceTarget === plan.sourceTarget,
      ).length;
  const requestedItemCount = existingItemCount + plan.logicalAssetCount;
  if (requestedItemCount <= hardMaxItems) return null;

  return createToolcraftSourceAssetFeedback(
    "hard-max-items-exceeded",
    `This upload accepts at most ${hardMaxItems} item${
      hardMaxItems === 1 ? "" : "s"
    }. Remove an existing item or choose a smaller batch.`,
    "resource-limit",
  );
}

export function createToolcraftSourceAssetImportRunner({
  cleanupManager,
  dispatch,
  getState,
  isDefaultReplacementCurrent,
  jobManager,
  operationStore,
  registry,
  repository,
}: Readonly<{
  cleanupManager: ToolcraftSourceAssetCleanupManager;
  dispatch: (command: ToolcraftCommand) => void;
  getState: () => ToolcraftState;
  isDefaultReplacementCurrent: (
    replacement: ToolcraftSourceAssetDefaultReplacement,
  ) => boolean;
  jobManager: ToolcraftSourceAssetJobManager;
  operationStore: ToolcraftSourceAssetOperationStore;
  registry: ToolcraftSourceAssetRegistry;
  repository: ToolcraftBinaryAssetRepository;
}>): ToolcraftSourceAssetImportRunner {
  const finishOperation = (
    job: ToolcraftSourceAssetJob,
    feedback?: ToolcraftSourceAssetFeedback,
  ): void => {
    if (!jobManager.isCurrent(job)) return;

    operationStore.setOperation({
      ...(feedback ? { feedback } : {}),
      phase: "idle",
      target: job.target,
    });
  };

  const rollbackLease = async (
    job: ToolcraftSourceAssetJob,
    lease: ToolcraftBinaryAssetLease | null,
  ): Promise<void> => {
    try {
      await cleanupManager.rollback(lease);
    } finally {
      if (lease) jobManager.settleLease(job, lease);
    }
  };

  const runAdmittedImport: ToolcraftSourceAssetImportRunner["runAdmittedImport"] =
    async (batch, requestedControl, admission, defaultReplacement) => {
      if (jobManager.isDisposed()) {
        return {
          feedback: createToolcraftSourceAssetFeedback(
            "coordinator-disposed",
            "The source asset coordinator is no longer available.",
          ),
          kind: "rejected",
        };
      }
      if (batch.files.length === 0) {
        return {
          feedback: createToolcraftSourceAssetFeedback(
            "empty-batch",
            "Choose at least one file to import.",
            "bundle",
          ),
          kind: "rejected",
        };
      }

      const usesDirectCanvasFallback =
        requestedControl === DIRECT_CANVAS_SOURCE_ASSET_CONTROL;
      let selection;
      let handler;
      let plan;
      try {
        selection = selectToolcraftSourceAssetHandler(registry, batch, [
          requestedControl,
        ]);
        if (selection.kind === "ambiguous") {
          operationStore.setOperation({
            feedback: selection.feedback,
            phase: "idle",
            target: batch.target ?? requestedControl.target,
          });
          return { feedback: selection.feedback, kind: "rejected" };
        }
        if (selection.kind === "none") {
          const feedback = createToolcraftSourceAssetFeedback(
            "unsupported-batch",
            "The selected files are not compatible with this upload target.",
            "format",
          );
          operationStore.setOperation({
            feedback,
            phase: "idle",
            target: batch.target ?? requestedControl.target,
          });
          return { feedback, kind: "rejected" };
        }

        handler = getToolcraftSourceAssetHandler(
          registry,
          selection.claim.handlerKind,
        );
        if (!handler) {
          throw new Error(
            `No source asset handler is registered for "${selection.claim.handlerKind}".`,
          );
        }
        plan = createCanonicalToolcraftSourceAssetPlan({
          claim: selection.claim,
          control: selection.control,
          handlerPlan: handler.plan(batch, selection.control, selection.claim),
          usesDirectCanvasFallback,
        });
        validateToolcraftSourceAssetPlan(plan);
        if (admission.target !== plan.target) {
          throw new Error(
            "Source asset import plan target must match its admitted target",
          );
        }
        const hardMaxItemsFeedback = getHardMaxItemsFeedback({
          control: selection.control,
          plan,
          state: getState(),
        });
        if (hardMaxItemsFeedback) {
          operationStore.setOperation({
            feedback: hardMaxItemsFeedback,
            phase: "idle",
            target: admission.target,
          });
          return {
            feedback: hardMaxItemsFeedback,
            kind: "rejected",
          };
        }
      } catch (error) {
        const feedback = createToolcraftSourceAssetFeedback(
          "planning-failed",
          getToolcraftSourceAssetErrorMessage(error),
          "bundle",
        );
        operationStore.setOperation({
          feedback,
          phase: "idle",
          target: batch.target ?? requestedControl.target,
        });
        return { feedback, kind: "rejected" };
      }

      await cleanupManager.retryRollbacks();
      if (!jobManager.isAdmissionCurrent(admission))
        return { kind: "cancelled" };

      const job = jobManager.beginJob(
        admission,
        "analyzing",
        defaultReplacement,
      );
      let committed = false;
      let lease: ToolcraftBinaryAssetLease | null = null;

      try {
        lease = await repository.beginLease(job.jobId);
        jobManager.attachLease(job, lease);
        if (!jobManager.isCurrent(job)) {
          await rollbackLease(job, lease);
          jobManager.removeJob(job);
          return { kind: "cancelled" };
        }

        const prepared = await handler.prepare({
          batch,
          canvasFrame: getToolcraftCanvasFrame(getState().canvas),
          claim: selection.claim,
          control: selection.control,
          jobId: job.jobId,
          plan,
          reportOperation: (update) => {
            if (jobManager.isCurrent(job)) {
              operationStore.updateOperation(job.target, update);
            }
          },
          signal: job.controller.signal,
          stageResource: async (ref, bytes, options) => {
            if (!jobManager.isCurrent(job)) {
              throw createToolcraftSourceAssetAbortError();
            }
            await lease?.put(ref, bytes, options);
            job.stagedResourceRefs.add(ref);
            if (!jobManager.isCurrent(job)) {
              throw createToolcraftSourceAssetAbortError();
            }
          },
        });

        if (!jobManager.isCurrent(job)) {
          await rollbackLease(job, lease);
          jobManager.removeJob(job);
          return { kind: "cancelled" };
        }
        validateToolcraftPreparedSourceAssets(
          prepared,
          selection.claim.handlerKind,
          plan.logicalAssetCount,
          lease,
        );
        const assets = Object.freeze(
          prepared.assets.map((asset) =>
            freezeToolcraftPreparedAssetDraft(asset, plan.sourceTarget),
          ),
        );

        if (!jobManager.isCurrent(job)) {
          await rollbackLease(job, lease);
          jobManager.removeJob(job);
          return { kind: "cancelled" };
        }
        await lease.commit();
        committed = true;
        jobManager.settleLease(job, lease);

        if (
          !jobManager.isCurrent(job) ||
          (defaultReplacement &&
            !isDefaultReplacementCurrent(defaultReplacement))
        ) {
          jobManager.removeJob(job);
          await cleanupManager.collect();
          return { kind: "cancelled" };
        }

        let assetIds: readonly string[];
        if (defaultReplacement) {
          const draft = prepared.assets[0];
          if (prepared.assets.length !== 1 || draft?.assetKind !== "model") {
            throw new Error(
              "Default model import must prepare exactly one model asset.",
            );
          }
          dispatch({
            asset: Object.freeze({
              ...draft,
              id: defaultReplacement.assetId,
              layerId: defaultReplacement.layerId,
              sourceTarget: defaultReplacement.sourceTarget,
            }),
            expectedPlaceholderRef: defaultReplacement.placeholderRef,
            type: "media.hydrateDefaultModel",
          });
          const current = getState().mediaAssets.find(
            (asset) => asset.id === defaultReplacement.assetId,
          );
          if (
            current?.assetKind !== "model" ||
            current.lifecycle === "restoring" ||
            current.sourceBundleDigest !== draft.sourceBundleDigest
          ) {
            jobManager.removeJob(job);
            await cleanupManager.collect();
            return { kind: "cancelled" };
          }
          assetIds = Object.freeze([defaultReplacement.assetId]);
        } else {
          const state = getState();
          const canonicalAssets = normalizeToolcraftMediaImportIngress(
            assets,
            {
              canvasMode: state.canvas.mode,
              canvasSize: state.canvas.size,
              sizingMode: state.schema.canvas.sizing.mode,
            },
          ).map((asset) => Object.freeze(asset));
          const allocation = createToolcraftMediaImportAllocation(state, {
            assets: canonicalAssets,
            replaceExisting: plan.replaceExisting,
          });
          const canonicalAllocation = Object.freeze({
            baseLayers: Object.freeze([...allocation.baseLayers]),
            baseMediaAssets: Object.freeze([...allocation.baseMediaAssets]),
            items: Object.freeze(
              allocation.items.map((item) => Object.freeze({ ...item })),
            ),
          });
          assetIds = Object.freeze(
            canonicalAllocation.items.map((item) => item.mediaId),
          );
          dispatch(
            Object.freeze({
              allocation: canonicalAllocation,
              type: "media.commitCanonicalImportAllocation",
            }),
          );
        }

        finishOperation(job);
        jobManager.removeJob(job);
        await cleanupManager.collect();
        return { assetIds, kind: "committed" };
      } catch (error) {
        const feedback = getToolcraftSourceAssetFeedback(
          error,
          "import-failed",
        );
        let shouldReportFailure = false;

        if (committed) {
          shouldReportFailure = jobManager.isCurrent(job);
          if (shouldReportFailure) finishOperation(job, feedback);
          jobManager.removeJob(job);
          await cleanupManager.collect();
        } else {
          await rollbackLease(job, lease);
          shouldReportFailure = jobManager.isCurrent(job);
          if (shouldReportFailure) finishOperation(job, feedback);
          jobManager.removeJob(job);
        }

        return shouldReportFailure
          ? { feedback, kind: "rejected" }
          : { kind: "cancelled" };
      }
    };

  const importBatch: ToolcraftSourceAssetImportRunner["importBatch"] = (
    batch,
    requestedControl,
  ) => {
    const batchSnapshot = snapshotToolcraftSourceAssetBatch(batch);
    const controlSnapshot =
      snapshotToolcraftSourceAssetControl(requestedControl);
    if (jobManager.isDisposed()) {
      return Promise.resolve({
        feedback: createToolcraftSourceAssetFeedback(
          "coordinator-disposed",
          "The source asset coordinator is no longer available.",
        ),
        kind: "rejected",
      });
    }
    if (batchSnapshot.files.length === 0) {
      return Promise.resolve({
        feedback: createToolcraftSourceAssetFeedback(
          "empty-batch",
          "Choose at least one file to import.",
          "bundle",
        ),
        kind: "rejected",
      });
    }
    const usesDirectCanvasFallback =
      controlSnapshot === undefined && batchSnapshot.origin === "canvas";
    const control =
      controlSnapshot ??
      (usesDirectCanvasFallback
        ? DIRECT_CANVAS_SOURCE_ASSET_CONTROL
        : undefined);

    if (!control) {
      return Promise.resolve({
        feedback: createToolcraftSourceAssetFeedback(
          "missing-target",
          "The source asset batch has no upload target.",
          "bundle",
        ),
        kind: "rejected",
      });
    }

    const admissionTarget = batchSnapshot.target ?? control.target;
    const admission = jobManager.reserveAdmission(admissionTarget);

    return jobManager.trackInflight(
      runAdmittedImport(batchSnapshot, control, admission),
    );
  };

  return Object.freeze({ importBatch, runAdmittedImport });
}
