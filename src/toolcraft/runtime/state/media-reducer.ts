import { commitToolcraftStatePatch } from "./history-patches";
import {
  cloneToolcraftModelAnalysisSummary,
  cloneToolcraftModelAssetRecord,
  cloneToolcraftSourceAssetFeedback,
} from "../model-import/model-asset-metadata";
import { isToolcraftDefaultModelPlaceholder } from "../model-import/default-model-source-assets";
import { createToolcraftMediaImportAllocation } from "./media-import-allocation";
import { cloneToolcraftMediaAssets } from "./media-defaults";
import { normalizeToolcraftMediaImportIngress } from "./media-import-ingress";
import { getMediaReadyTimelineState } from "./timeline-readiness";
import type {
  ToolcraftCommand,
  ToolcraftMediaAsset,
  ToolcraftMediaAssetDraft,
  ToolcraftMediaTransform,
  ToolcraftState,
} from "./types";

type ToolcraftMediaCommand = Extract<
  ToolcraftCommand,
  {
    type:
      | "media.delete"
      | "media.commitModelRepair"
      | "media.commitCanonicalImportAllocation"
      | "media.hydrateDefaultModel"
      | "media.hydrateModel"
      | "media.importBatch"
      | "media.reorder"
      | "media.setBinaryResourceState"
      | "media.setModelRepairError"
      | "media.transform";
  }
>;

function normalizeMediaRotation(rotationDeg: number): 0 | 90 | 180 | 270 {
  const normalized = (((Math.round(rotationDeg / 90) * 90) % 360) + 360) % 360;

  return normalized === 90 || normalized === 180 || normalized === 270
    ? normalized
    : 0;
}

function compactMediaTransform(
  transform: ToolcraftMediaTransform,
): ToolcraftMediaTransform | undefined {
  const normalizedRotation = normalizeMediaRotation(transform.rotationDeg ?? 0);
  const nextTransform: ToolcraftMediaTransform = {};

  if (normalizedRotation !== 0) {
    nextTransform.rotationDeg = normalizedRotation;
  }

  if (transform.flipHorizontal) {
    nextTransform.flipHorizontal = true;
  }

  if (transform.flipVertical) {
    nextTransform.flipVertical = true;
  }

  return Object.keys(nextTransform).length > 0 ? nextTransform : undefined;
}

function getTransformedMediaAsset(
  mediaAsset: ToolcraftMediaAsset,
  operation: Extract<
    ToolcraftCommand,
    { type: "media.transform" }
  >["operation"],
): ToolcraftMediaAsset {
  if (mediaAsset.assetKind !== "image") {
    return mediaAsset;
  }

  const currentTransform = mediaAsset.transform ?? {};
  const rotationDeg = normalizeMediaRotation(currentTransform.rotationDeg ?? 0);
  const transform: ToolcraftMediaTransform = {
    flipHorizontal: currentTransform.flipHorizontal,
    flipVertical: currentTransform.flipVertical,
    rotationDeg,
  };

  switch (operation) {
    case "flip-horizontal":
      transform.flipHorizontal = !transform.flipHorizontal;
      break;
    case "flip-vertical":
      transform.flipVertical = !transform.flipVertical;
      break;
    case "rotate-left":
      transform.rotationDeg = normalizeMediaRotation(rotationDeg - 90);
      break;
    case "rotate-right":
      transform.rotationDeg = normalizeMediaRotation(rotationDeg + 90);
      break;
  }

  const compactTransform = compactMediaTransform(transform);

  if (!compactTransform) {
    const { transform: _transform, ...rest } = mediaAsset;

    return rest;
  }

  return {
    ...mediaAsset,
    transform: compactTransform,
  };
}

function createImportedMediaAsset({
  draft,
  layerId,
  mediaId,
}: {
  draft: ToolcraftMediaAssetDraft;
  layerId: string;
  mediaId: string;
}): ToolcraftMediaAsset {
  const { layerName: _layerName, ...asset } = draft;
  return cloneToolcraftMediaAssets([{ ...asset, id: mediaId, layerId }])[0]!;
}

function commitCanonicalMediaImportAllocation(
  state: ToolcraftState,
  allocation: Extract<
    ToolcraftCommand,
    { type: "media.commitCanonicalImportAllocation" }
  >["allocation"],
): ToolcraftState {
  if (allocation.items.length === 0) {
    return state;
  }

  const { baseLayers, baseMediaAssets, items } = allocation;
  const importedAssets: ToolcraftMediaAsset[] = [];
  const importedLayers: ToolcraftState["layers"] = [];
  const lastImageDraft = [...items]
    .reverse()
    .find((item) => item.draft.assetKind === "image")?.draft;
  // Canonical reinsertions resize intrinsic canvases from decoded source
  // geometry while preserving their authored scene frame in the asset.
  const intrinsicCanvasSize =
    state.schema.canvas.sizing.mode === "intrinsic-media" &&
    lastImageDraft?.assetKind === "image"
      ? lastImageDraft.sourceSize
      : undefined;

  for (const { draft, layerId, layerName, mediaId } of items) {
    importedAssets.push(
      createImportedMediaAsset({
        draft,
        layerId,
        mediaId,
      }),
    );
    importedLayers.push({
      displayName: layerName,
      id: layerId,
      kind: "layer",
      name: layerName,
      visible: true,
    });
  }

  const mediaAssets = [...baseMediaAssets, ...importedAssets];
  const layers = [...baseLayers, ...importedLayers];
  const selectedLayerId = importedLayers.at(-1)?.id ?? state.selectedLayerId;
  const after = {
    ...(intrinsicCanvasSize ? { "canvas.size": intrinsicCanvasSize } : {}),
    layers,
    mediaAssets,
    selectedLayerId,
  };
  const before = {
    ...(intrinsicCanvasSize ? { "canvas.size": state.canvas.size } : {}),
    layers: state.layers,
    mediaAssets: state.mediaAssets,
    selectedLayerId: state.selectedLayerId,
  };

  return commitToolcraftStatePatch(state, {
    after,
    before,
    label: "Import media",
  });
}

function reduceMediaImportBatch(
  state: ToolcraftState,
  command: Extract<ToolcraftCommand, { type: "media.importBatch" }>,
): ToolcraftState {
  if (command.assets.length === 0) {
    return state;
  }

  const canonicalAssets = normalizeToolcraftMediaImportIngress(command.assets, {
    canvasMode: state.canvas.mode,
    canvasSize: state.canvas.size,
    sizingMode: state.schema.canvas.sizing.mode,
  });
  const allocation = createToolcraftMediaImportAllocation(state, {
    assets: canonicalAssets,
    replaceExisting: command.replaceExisting,
  });

  return commitCanonicalMediaImportAllocation(state, allocation);
}

export function reduceToolcraftMediaCommand(
  state: ToolcraftState,
  command: ToolcraftMediaCommand,
): ToolcraftState {
  switch (command.type) {
    case "media.commitModelRepair": {
      const targetModel = state.mediaAssets.find(
        (asset) => asset.id === command.assetId && asset.assetKind === "model",
      );

      if (!targetModel || targetModel.assetKind !== "model") {
        return state;
      }

      if (
        targetModel.lifecycle !== "repairable" ||
        targetModel.activeDocumentRef !== command.expectedActiveDocumentRef ||
        targetModel.sourceBundleDigest !== command.expectedSourceBundleDigest ||
        targetModel.topologyProfile !== command.expectedTopologyProfile ||
        targetModel.analysis.repairPlanRef !== command.expectedRepairPlanRef ||
        command.analysis.outcome !== "clean" ||
        command.analysis.repairPlanRef !== undefined ||
        command.activeDocumentRef !== command.repairedDocumentRef
      ) {
        return state;
      }

      const mediaAssets = state.mediaAssets.map((asset) => {
        if (asset.id !== targetModel.id || asset.assetKind !== "model") {
          return asset;
        }

        const {
          lastRepairError: _lastRepairError,
          ...modelWithoutRepairError
        } = asset;

        return {
          ...modelWithoutRepairError,
          activeDocumentRef: command.activeDocumentRef,
          analysis: cloneToolcraftModelAnalysisSummary(command.analysis),
          appliedRepairRecipeId: command.appliedRepairRecipeId,
          lifecycle: "fixed" as const,
          repairedDocumentRef: command.repairedDocumentRef,
        };
      });

      return commitToolcraftStatePatch(state, {
        after: { mediaAssets },
        before: { mediaAssets: state.mediaAssets },
        label: "Fix model",
      });
    }

    case "media.hydrateModel": {
      const targetModel = state.mediaAssets.find(
        (asset) => asset.id === command.asset.id && asset.assetKind === "model",
      );

      if (
        !targetModel ||
        targetModel.assetKind !== "model" ||
        targetModel.lifecycle !== "restoring" ||
        targetModel.sourceBundleDigest !== command.expectedSourceBundleDigest ||
        targetModel.topologyProfile !== command.expectedTopologyProfile ||
        command.asset.sourceBundleDigest !==
          command.expectedSourceBundleDigest ||
        command.asset.topologyProfile !== command.expectedTopologyProfile ||
        command.asset.lifecycle === "restoring"
      ) {
        return state;
      }

      const hydratedRecord = cloneToolcraftModelAssetRecord(command.asset);

      const {
        appliedRepairRecipeId: _appliedRepairRecipeId,
        lastRepairError: _lastRepairError,
        repairedDocumentRef: _repairedDocumentRef,
        ...targetWithoutHydrationResult
      } = targetModel;

      return {
        ...state,
        mediaAssets: state.mediaAssets.map((asset) =>
          asset.id === targetModel.id
            ? {
                ...targetWithoutHydrationResult,
                activeDocumentRef: hydratedRecord.activeDocumentRef,
                analysis: hydratedRecord.analysis,
                lifecycle: hydratedRecord.lifecycle,
                originalAnalysis: hydratedRecord.originalAnalysis,
                originalDocumentRef: hydratedRecord.originalDocumentRef,
                ...(hydratedRecord.appliedRepairRecipeId !== undefined
                  ? {
                      appliedRepairRecipeId:
                        hydratedRecord.appliedRepairRecipeId,
                    }
                  : {}),
                ...(hydratedRecord.lastRepairError !== undefined
                  ? { lastRepairError: hydratedRecord.lastRepairError }
                  : {}),
                ...(hydratedRecord.repairedDocumentRef !== undefined
                  ? { repairedDocumentRef: hydratedRecord.repairedDocumentRef }
                  : {}),
              }
            : asset,
        ),
      };
    }

    case "media.hydrateDefaultModel": {
      const targetModel = state.mediaAssets.find(
        (asset) => asset.id === command.asset.id && asset.assetKind === "model",
      );
      if (
        !targetModel ||
        targetModel.assetKind !== "model" ||
        !isToolcraftDefaultModelPlaceholder(targetModel) ||
        targetModel.sourceBundleRef !== command.expectedPlaceholderRef ||
        command.asset.lifecycle === "restoring" ||
        command.asset.id !== targetModel.id ||
        command.asset.layerId !== targetModel.layerId ||
        command.asset.sourceTarget !== targetModel.sourceTarget
      ) {
        return state;
      }

      const hydrated = cloneToolcraftModelAssetRecord(command.asset);
      return {
        ...state,
        mediaAssets: state.mediaAssets.map((asset) =>
          asset.id === targetModel.id
            ? {
                ...hydrated,
                assetKind: "model" as const,
                fileName: command.asset.fileName,
                ...(command.asset.sourcePaths ? { sourcePaths: [...command.asset.sourcePaths] } : {}),
                id: targetModel.id,
                layerId: targetModel.layerId,
                mimeType: command.asset.mimeType,
                position: { ...targetModel.position },
                size: { ...targetModel.size },
                ...(targetModel.sourceTarget
                  ? { sourceTarget: targetModel.sourceTarget }
                  : {}),
              }
            : asset,
        ),
      };
    }

    case "media.setBinaryResourceState": {
      const target = state.mediaAssets.find(
        (asset) => asset.id === command.assetId && asset.assetKind !== "model",
      );

      if (
        !target ||
        target.assetKind === "model" ||
        target.resourceRef !== command.expectedResourceRef
      ) {
        return state;
      }

      if (command.lifecycle === "ready") {
        return {
          ...state,
          mediaAssets: state.mediaAssets.map((asset) =>
            asset.id === target.id && asset.assetKind !== "model"
              ? { ...asset, lifecycle: "ready" as const }
              : asset,
          ),
        };
      }

      if (!command.error) {
        return state;
      }

      const unavailableError = command.error;

      return {
        ...state,
        mediaAssets: state.mediaAssets.map((asset) => {
          if (asset.id !== target.id || asset.assetKind === "model") {
            return asset;
          }

          return {
            ...asset,
            error: unavailableError,
            lifecycle: "unavailable" as const,
          };
        }),
      };
    }

    case "media.importBatch":
      return reduceMediaImportBatch(state, command);

    case "media.commitCanonicalImportAllocation":
      return commitCanonicalMediaImportAllocation(state, command.allocation);

    case "media.setModelRepairError": {
      const targetModel = state.mediaAssets.find(
        (asset) => asset.id === command.assetId && asset.assetKind === "model",
      );

      if (
        !targetModel ||
        targetModel.assetKind !== "model" ||
        targetModel.lifecycle !== "repairable" ||
        targetModel.activeDocumentRef !== command.expectedActiveDocumentRef ||
        targetModel.sourceBundleDigest !== command.expectedSourceBundleDigest
      ) {
        return state;
      }

      return {
        ...state,
        mediaAssets: state.mediaAssets.map((asset) => {
          if (asset.id !== targetModel.id || asset.assetKind !== "model") {
            return asset;
          }

          if (command.feedback) {
            return {
              ...asset,
              lastRepairError: cloneToolcraftSourceAssetFeedback(
                command.feedback,
              ),
            };
          }

          const {
            lastRepairError: _lastRepairError,
            ...modelWithoutRepairError
          } = asset;
          return modelWithoutRepairError;
        }),
      };
    }

    case "media.delete": {
      if (!state.mediaAssets.some((asset) => asset.id === command.mediaId)) {
        return state;
      }

      const mediaAssets = state.mediaAssets.filter(
        (asset) => asset.id !== command.mediaId,
      );
      const timeline = getMediaReadyTimelineState(
        state.schema,
        state.timeline,
        mediaAssets,
      );
      const shouldCommitTimeline = timeline !== state.timeline;

      return commitToolcraftStatePatch(state, {
        after: {
          mediaAssets,
          ...(shouldCommitTimeline ? { timeline } : {}),
        },
        before: {
          mediaAssets: state.mediaAssets,
          ...(shouldCommitTimeline ? { timeline: state.timeline } : {}),
        },
        label: "Delete media",
      });
    }

    case "media.reorder": {
      if (state.mediaAssets.length < 2 || command.mediaIds.length === 0) {
        return state;
      }

      const mediaById = new Map(
        state.mediaAssets.map((asset) => [asset.id, asset]),
      );
      const seenIds = new Set<string>();
      const reorderedMediaAssets = command.mediaIds.flatMap((mediaId) => {
        const mediaAsset = mediaById.get(mediaId);

        if (!mediaAsset || seenIds.has(mediaId)) {
          return [];
        }

        seenIds.add(mediaId);
        return [mediaAsset];
      });

      if (reorderedMediaAssets.length === 0) {
        return state;
      }

      for (const mediaAsset of state.mediaAssets) {
        if (!seenIds.has(mediaAsset.id)) {
          reorderedMediaAssets.push(mediaAsset);
        }
      }

      if (
        reorderedMediaAssets.length === state.mediaAssets.length &&
        reorderedMediaAssets.every(
          (asset, index) => asset.id === state.mediaAssets[index]?.id,
        )
      ) {
        return state;
      }

      return commitToolcraftStatePatch(state, {
        after: { mediaAssets: reorderedMediaAssets },
        before: { mediaAssets: state.mediaAssets },
        label: "Reorder media",
      });
    }

    case "media.transform": {
      const targetMediaAsset = state.mediaAssets.find(
        (asset) => asset.id === command.mediaId,
      );

      if (!targetMediaAsset || targetMediaAsset.assetKind !== "image") {
        return state;
      }

      const mediaAssets = state.mediaAssets.map((asset) =>
        asset.id === targetMediaAsset.id
          ? getTransformedMediaAsset(asset, command.operation)
          : asset,
      );

      return commitToolcraftStatePatch(state, {
        after: { mediaAssets },
        before: { mediaAssets: state.mediaAssets },
        label: "Transform media",
      });
    }
  }
}
