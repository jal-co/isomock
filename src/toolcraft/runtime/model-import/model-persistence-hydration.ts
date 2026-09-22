import type { ToolcraftBinaryAssetLease } from "../source-assets/repository/binary-asset-repository";
import type { ToolcraftBinaryAssetRepository } from "../source-assets/repository/binary-asset-repository";
import type {
  ToolcraftCommand,
  ToolcraftModelAsset,
  ToolcraftState,
} from "../state/types";
import {
  TOOLCRAFT_PRODUCTION_GEOMETRY_DECODER_VERSIONS,
} from "./formats/production-model-format-registry";
import { TOOLCRAFT_DEFAULT_MODEL_IMPORT_LIMITS } from "./model-import-limit-values";
import {
  mergeToolcraftModelAnalysisDiagnostics,
  projectToolcraftModelAnalysisSummary,
} from "./model-analysis-summary";
import {
  createToolcraftModelDocumentResourceRef,
  createToolcraftModelRepairPlanResourceRef,
  TOOLCRAFT_MODEL_DOCUMENT_CONTENT_TYPE,
  TOOLCRAFT_MODEL_REPAIR_PLAN_CONTENT_TYPE,
} from "./model-source-asset-handler-resources";
import {
  hasValidToolcraftModelDocumentResource,
  hasValidToolcraftModelRepairPlanResource,
  inferToolcraftPersistedModelLifecycle,
  readToolcraftModelSourceBundleForHydration,
} from "./model-persistence-hydration-resources";
import { TOOLCRAFT_MODEL_REPAIR_ALGORITHM_VERSION } from "./topology/model-repair-plan";
import type { ToolcraftModelWorkerClient } from "./worker/model-import-worker-client";
import { isToolcraftDefaultModelPlaceholder } from "./default-model-source-assets";
import type { ToolcraftModelDiagnostic } from "./model-import-types";

export type ToolcraftModelHydrationController = Readonly<{
  cancel: () => void;
  promise: Promise<void>;
}>;

type HydrationContext = Readonly<{
  dispatch: (command: ToolcraftCommand) => void;
  getState: () => ToolcraftState;
  repository: ToolcraftBinaryAssetRepository;
  signal: AbortSignal;
  workerClient: ToolcraftModelWorkerClient;
}>;

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const error = new Error("Model hydration was cancelled.");
  error.name = "AbortError";
  throw error;
}

function throwCancelled(): never {
  const error = new Error("Model hydration was cancelled.");
  error.name = "AbortError";
  throw error;
}

function currentRestoringModel(
  getState: () => ToolcraftState,
  snapshot: ToolcraftModelAsset,
): ToolcraftModelAsset | null {
  const current = getState().mediaAssets.find(({ id }) => id === snapshot.id);
  return current?.assetKind === "model" &&
      current.lifecycle === "restoring" &&
      current.sourceBundleDigest === snapshot.sourceBundleDigest &&
      current.topologyProfile === snapshot.topologyProfile
    ? current
    : null;
}

function dispatchHydration(
  context: HydrationContext,
  snapshot: ToolcraftModelAsset,
  asset: ToolcraftModelAsset,
): void {
  context.dispatch({
    asset,
    expectedSourceBundleDigest: snapshot.sourceBundleDigest,
    expectedTopologyProfile: snapshot.topologyProfile,
    type: "media.hydrateModel",
  });
}

async function canRestoreExistingDocument(
  context: HydrationContext,
  asset: ToolcraftModelAsset,
): Promise<boolean> {
  if (!await hasValidToolcraftModelDocumentResource(
    context.repository,
    asset.activeDocumentRef,
    context.signal,
  )) return false;
  if (inferToolcraftPersistedModelLifecycle(asset) !== "repairable") return true;
  const planRef = asset.analysis.repairPlanRef;
  return planRef
    ? hasValidToolcraftModelRepairPlanResource(
        context.repository,
        planRef,
        asset.topologyProfile,
        context.signal,
      )
    : false;
}

function availableAsset(asset: ToolcraftModelAsset): ToolcraftModelAsset {
  const { lastRepairError: _lastRepairError, ...record } = asset;
  return Object.freeze({
    ...record,
    lifecycle: inferToolcraftPersistedModelLifecycle(asset),
  });
}

function unavailableAsset(
  asset: ToolcraftModelAsset,
  error: unknown,
): ToolcraftModelAsset {
  return Object.freeze({
    ...asset,
    lastRepairError: Object.freeze({
      category: "resource-unavailable" as const,
      code: "model-resource-unavailable",
      message: error instanceof Error && error.message
        ? error.message
        : "The saved model resources are unavailable.",
    }),
    lifecycle: "unavailable" as const,
  });
}

async function stageDecodeResult(
  lease: ToolcraftBinaryAssetLease,
  result: Extract<
    Awaited<ReturnType<ToolcraftModelWorkerClient["importModel"]>>,
    { kind: "result" }
  >["result"],
  streamedDiagnostics: readonly ToolcraftModelDiagnostic[],
): Promise<Readonly<{
  analysis: ReturnType<typeof projectToolcraftModelAnalysisSummary>;
  appearanceResourceRefs: readonly string[];
  documentRef: string;
}>> {
  if (result.operation !== "decode-and-analyze") {
    throw new Error("Model hydration received the wrong worker result.");
  }
  const documentRef = createToolcraftModelDocumentResourceRef(
    result.canonicalDocumentDigest,
  );
  await Promise.all(result.appearanceResources.map((resource) =>
    lease.put(resource.resourceRef, new Uint8Array(resource.bytes), {
      contentType: resource.mimeType,
      durable: false,
    })
  ));
  const appearanceResourceRefs = result.appearanceResources.map(
    ({ resourceRef }) => resourceRef,
  );
  await lease.put(documentRef, new Uint8Array(result.canonicalDocument), {
    contentType: TOOLCRAFT_MODEL_DOCUMENT_CONTENT_TYPE,
    dependencies: appearanceResourceRefs,
    durable: false,
  });
  let repairPlanRef: string | undefined;
  if (result.repairPlanEnvelope) {
    repairPlanRef = createToolcraftModelRepairPlanResourceRef(
      result.repairPlanEnvelope,
    );
    await lease.put(
      repairPlanRef,
      new Uint8Array(result.repairPlanEnvelope.bytes),
      { contentType: TOOLCRAFT_MODEL_REPAIR_PLAN_CONTENT_TYPE, durable: false },
    );
  }
  return Object.freeze({
    analysis: mergeToolcraftModelAnalysisDiagnostics(
      projectToolcraftModelAnalysisSummary(result.analysis, { repairPlanRef }),
      streamedDiagnostics,
    ),
    appearanceResourceRefs,
    documentRef,
  });
}

async function regenerateModel(
  context: HydrationContext,
  asset: ToolcraftModelAsset,
): Promise<ToolcraftModelAsset> {
  const { bundle, transfer } = await readToolcraftModelSourceBundleForHydration(
    context.repository,
    asset,
    context.workerClient,
    context.signal,
  );
  const geometryDecoderVersion =
    TOOLCRAFT_PRODUCTION_GEOMETRY_DECODER_VERSIONS[bundle.adapter.format];
  if (!geometryDecoderVersion) {
    throw new Error("The saved model format is no longer supported.");
  }
  const lease = await context.repository.beginLease(
    `model-hydration-${asset.id}`,
  );
  let committed = false;
  try {
    const streamedDiagnostics: ToolcraftModelDiagnostic[] = [];
    const terminal = await context.workerClient.importModel({
      adapterVersion: bundle.adapter.adapterVersion,
      bundle: transfer,
      format: bundle.adapter.format,
      geometryDecoderVersion,
      jobId: `model-hydration-decode-${asset.id}`,
      limits: TOOLCRAFT_DEFAULT_MODEL_IMPORT_LIMITS,
      topologyProfile: asset.topologyProfile,
    }, {
      onDiagnostic: ({ diagnostic }) => {
        streamedDiagnostics.push(diagnostic);
      },
      signal: context.signal,
    });
    throwIfAborted(context.signal);
    if (terminal.kind === "cancelled") throwCancelled();
    if (terminal.kind === "error") throw new Error(terminal.feedback.message);
    const decoded = await stageDecodeResult(
      lease,
      terminal.result,
      streamedDiagnostics,
    );
    if (decoded.analysis.outcome === "fatal") {
      throw new Error("The saved model no longer passes topology validation.");
    }
    let hydrated: ToolcraftModelAsset = {
      ...asset,
      activeDocumentRef: decoded.documentRef,
      analysis: decoded.analysis,
      lifecycle: decoded.analysis.outcome === "repairable"
        ? "repairable"
        : "clean",
      originalAnalysis: decoded.analysis,
      originalDocumentRef: decoded.documentRef,
    };
    if (
      inferToolcraftPersistedModelLifecycle(asset) === "fixed" &&
      terminal.result.operation === "decode-and-analyze" &&
      terminal.result.repairPlanEnvelope
    ) {
      const repaired = await context.workerClient.repair({
        canonicalDocument: terminal.result.canonicalDocument,
        canonicalDocumentDigest: terminal.result.canonicalDocumentDigest,
        jobId: `model-hydration-repair-${asset.id}`,
        limits: TOOLCRAFT_DEFAULT_MODEL_IMPORT_LIMITS,
        repairPlanEnvelope: terminal.result.repairPlanEnvelope,
      }, { signal: context.signal });
      throwIfAborted(context.signal);
      if (repaired.kind === "cancelled") throwCancelled();
      if (repaired.kind === "error") throw new Error(repaired.feedback.message);
      if (repaired.result.operation !== "repair") {
        throw new Error("Model hydration received the wrong repair result.");
      }
      const repairedRef = createToolcraftModelDocumentResourceRef(
        repaired.result.canonicalDocumentDigest,
      );
      await lease.put(
        repairedRef,
        new Uint8Array(repaired.result.canonicalDocument),
        {
          contentType: TOOLCRAFT_MODEL_DOCUMENT_CONTENT_TYPE,
          dependencies: decoded.appearanceResourceRefs,
          durable: false,
        },
      );
      hydrated = {
        ...hydrated,
        activeDocumentRef: repairedRef,
        analysis: projectToolcraftModelAnalysisSummary(repaired.result.analysis),
        appliedRepairRecipeId:
          `${TOOLCRAFT_MODEL_REPAIR_ALGORITHM_VERSION}:${repaired.result.repairPlanDigest}`,
        lifecycle: "fixed",
        repairedDocumentRef: repairedRef,
      };
    }
    await lease.commit();
    committed = true;
    return Object.freeze(hydrated);
  } finally {
    if (!committed) await lease.rollback();
  }
}

async function hydrateOne(
  context: HydrationContext,
  snapshot: ToolcraftModelAsset,
): Promise<void> {
  try {
    if (!currentRestoringModel(context.getState, snapshot)) return;
    const hydrated = await canRestoreExistingDocument(context, snapshot)
      ? availableAsset(snapshot)
      : await regenerateModel(context, snapshot);
    throwIfAborted(context.signal);
    dispatchHydration(context, snapshot, hydrated);
  } catch (error) {
    if (context.signal.aborted) return;
    if (!currentRestoringModel(context.getState, snapshot)) return;
    dispatchHydration(context, snapshot, unavailableAsset(snapshot, error));
  }
}

export function hydrateToolcraftPersistedModels(
  options: Omit<HydrationContext, "signal">,
): ToolcraftModelHydrationController {
  const controller = new AbortController();
  const snapshots = options.getState().mediaAssets.filter(
    (asset): asset is ToolcraftModelAsset =>
      asset.assetKind === "model" &&
      asset.lifecycle === "restoring" &&
      !isToolcraftDefaultModelPlaceholder(asset),
  );
  const context = Object.freeze({ ...options, signal: controller.signal });
  const promise = (async () => {
    for (const snapshot of snapshots) {
      await hydrateOne(context, snapshot);
    }
  })();
  return Object.freeze({ cancel: () => controller.abort(), promise });
}
