import type { ToolcraftBinaryAssetRepositoryEntry } from "../source-assets/repository/binary-asset-repository";
import type {
  ToolcraftSourceAssetFeedback,
  ToolcraftSourceAssetOperationUpdate,
} from "../source-assets/source-asset-types";
import type {
  ToolcraftCommand,
  ToolcraftMediaAsset,
  ToolcraftModelAsset,
} from "../state/types";
import { projectToolcraftModelAnalysisSummary } from "./model-analysis-summary";
import { TOOLCRAFT_DEFAULT_MODEL_IMPORT_LIMITS } from "./model-import-limit-values";
import {
  createToolcraftModelDocumentResourceRef,
  parseToolcraftModelDocumentResourceRef,
  parseToolcraftModelRepairPlanResourceRef,
  TOOLCRAFT_MODEL_DOCUMENT_CONTENT_TYPE,
  TOOLCRAFT_MODEL_REPAIR_PLAN_CONTENT_TYPE,
} from "./model-source-asset-handler-resources";
import { TOOLCRAFT_MODEL_REPAIR_ALGORITHM_VERSION } from "./topology/model-repair-plan";
import type { ToolcraftModelWorkerClient } from "./worker/model-import-worker-client";

export type ToolcraftModelRepairSnapshot = Readonly<{
  activeDocumentRef: string;
  assetId: string;
  repairPlanRef: string;
  sourceBundleDigest: string;
  target: string;
  topologyProfile: ToolcraftModelAsset["topologyProfile"];
}>;

export type PreparedToolcraftModelRepair = Readonly<{
  command: Extract<ToolcraftCommand, { type: "media.commitModelRepair" }>;
  repairedDocumentRef: string;
  stagedResourceRefs: readonly string[];
}>;

export type PrepareToolcraftModelRepairOptions = Readonly<{
  jobId: string;
  readResource: (
    ref: string,
  ) => Promise<ToolcraftBinaryAssetRepositoryEntry | null>;
  reportOperation: (update: ToolcraftSourceAssetOperationUpdate) => void;
  signal: AbortSignal;
  snapshot: ToolcraftModelRepairSnapshot;
  stageResource: (
    ref: string,
    bytes: Uint8Array,
    options: Readonly<{ contentType: string; durable: boolean }>,
  ) => Promise<void>;
  workerClient: ToolcraftModelWorkerClient;
}>;

function rejectRepair(
  code: string,
  message: string,
  category: ToolcraftSourceAssetFeedback["category"] = "repair",
): never {
  throw Object.assign(new Error(message), { category, code, message });
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const error = new Error("Model repair was cancelled.");
  error.name = "AbortError";
  throw error;
}

function requireResource(
  entry: ToolcraftBinaryAssetRepositoryEntry | null,
  ref: string,
  contentType: string,
): ToolcraftBinaryAssetRepositoryEntry {
  if (!entry || entry.ref !== ref || entry.contentType !== contentType) {
    return rejectRepair(
      "model-repair-resource-unavailable",
      "The model repair resources are no longer available.",
      "resource-unavailable",
    );
  }
  return entry;
}

export function snapshotToolcraftModelRepair(
  asset: ToolcraftMediaAsset | undefined,
): ToolcraftModelRepairSnapshot | null {
  if (
    !asset ||
    asset.assetKind !== "model" ||
    asset.lifecycle !== "repairable" ||
    asset.analysis.outcome !== "repairable" ||
    !asset.analysis.repairPlanRef
  ) {
    return null;
  }
  return Object.freeze({
    activeDocumentRef: asset.activeDocumentRef,
    assetId: asset.id,
    repairPlanRef: asset.analysis.repairPlanRef,
    sourceBundleDigest: asset.sourceBundleDigest,
    target: asset.sourceTarget ?? asset.id,
    topologyProfile: asset.topologyProfile,
  });
}

export function isToolcraftModelRepairSnapshotCurrent(
  mediaAssets: readonly ToolcraftMediaAsset[],
  snapshot: ToolcraftModelRepairSnapshot,
): boolean {
  const current = snapshotToolcraftModelRepair(
    mediaAssets.find(({ id }) => id === snapshot.assetId),
  );
  return current !== null &&
    current.activeDocumentRef === snapshot.activeDocumentRef &&
    current.repairPlanRef === snapshot.repairPlanRef &&
    current.sourceBundleDigest === snapshot.sourceBundleDigest &&
    current.target === snapshot.target &&
    current.topologyProfile === snapshot.topologyProfile;
}

export async function prepareToolcraftModelRepair({
  jobId,
  readResource,
  reportOperation,
  signal,
  snapshot,
  stageResource,
  workerClient,
}: PrepareToolcraftModelRepairOptions): Promise<PreparedToolcraftModelRepair> {
  const documentDigest = parseToolcraftModelDocumentResourceRef(
    snapshot.activeDocumentRef,
  );
  const planIdentity = parseToolcraftModelRepairPlanResourceRef(
    snapshot.repairPlanRef,
  );
  if (!documentDigest || !planIdentity) {
    return rejectRepair(
      "model-repair-identity-invalid",
      "The model repair identity is invalid.",
    );
  }

  reportOperation({ phase: "repairing", progress: 0 });
  throwIfAborted(signal);
  const [documentResource, planResource] = await Promise.all([
    readResource(snapshot.activeDocumentRef),
    readResource(snapshot.repairPlanRef),
  ]);
  throwIfAborted(signal);
  const document = requireResource(
    documentResource,
    snapshot.activeDocumentRef,
    TOOLCRAFT_MODEL_DOCUMENT_CONTENT_TYPE,
  );
  const repairPlan = requireResource(
    planResource,
    snapshot.repairPlanRef,
    TOOLCRAFT_MODEL_REPAIR_PLAN_CONTENT_TYPE,
  );
  const terminal = await workerClient.repair({
    canonicalDocument: new Uint8Array(document.bytes).buffer,
    canonicalDocumentDigest: documentDigest,
    jobId,
    limits: TOOLCRAFT_DEFAULT_MODEL_IMPORT_LIMITS,
    repairPlanEnvelope: {
      bytes: new Uint8Array(repairPlan.bytes).buffer,
      envelopeDigest: planIdentity.envelopeDigest,
      planDigest: planIdentity.planDigest,
      version: 1,
    },
  }, {
    onProgress: ({ progress }) => {
      reportOperation({ phase: "repairing", progress });
    },
    signal,
  });
  throwIfAborted(signal);
  if (terminal.kind === "cancelled") {
    const error = new Error("Model repair was cancelled.");
    error.name = "AbortError";
    throw error;
  }
  if (terminal.kind === "error") throw Object.assign(
    new Error(terminal.feedback.message),
    terminal.feedback,
  );
  if (terminal.result.operation !== "repair") {
    return rejectRepair(
      "model-repair-result-invalid",
      "The model worker returned the wrong repair result.",
    );
  }
  const result = terminal.result;
  if (
    result.repairPlanDigest !== planIdentity.planDigest ||
    result.analysis.profile !== snapshot.topologyProfile ||
    (result.analysis.outcome !== "clean" && result.analysis.outcome !== "warning")
  ) {
    return rejectRepair(
      "model-repair-result-inconsistent",
      "The model worker returned an inconsistent repair result.",
    );
  }
  const analysis = projectToolcraftModelAnalysisSummary(result.analysis);
  const repairedDocumentRef = createToolcraftModelDocumentResourceRef(
    result.canonicalDocumentDigest,
  );
  await stageResource(
    repairedDocumentRef,
    new Uint8Array(result.canonicalDocument),
    { contentType: TOOLCRAFT_MODEL_DOCUMENT_CONTENT_TYPE, durable: false },
  );
  throwIfAborted(signal);
  reportOperation({ phase: "repairing", progress: 1 });

  return Object.freeze({
    command: Object.freeze({
      activeDocumentRef: repairedDocumentRef,
      analysis,
      appliedRepairRecipeId:
        `${TOOLCRAFT_MODEL_REPAIR_ALGORITHM_VERSION}:${result.repairPlanDigest}`,
      assetId: snapshot.assetId,
      expectedActiveDocumentRef: snapshot.activeDocumentRef,
      expectedRepairPlanRef: snapshot.repairPlanRef,
      expectedSourceBundleDigest: snapshot.sourceBundleDigest,
      expectedTopologyProfile: snapshot.topologyProfile,
      repairedDocumentRef,
      type: "media.commitModelRepair" as const,
    }),
    repairedDocumentRef,
    stagedResourceRefs: Object.freeze([repairedDocumentRef]),
  });
}
