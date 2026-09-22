import {
  cloneToolcraftLayers,
  cloneToolcraftMediaAssets,
  createToolcraftDefaultMediaState,
} from "./media-defaults";
import { getMediaReadyTimelineState } from "./timeline-readiness";
import { createToolcraftState } from "./create-template-state";
import { areToolcraftControlValuesEqual } from "./control-value-codecs";
import type {
  ToolcraftHistoryPatch,
  ToolcraftState,
} from "./types";

function getFileDropResetTargets(
  state: ToolcraftState,
  targets?: ReadonlySet<string>,
): Set<string> {
  const fileDropTargets = new Set<string>();

  for (const section of state.schema.panels.controls?.sections ?? []) {
    for (const control of Object.values(section.controls)) {
      if (control.type !== "fileDrop" || (targets && !targets.has(control.target))) {
        continue;
      }

      fileDropTargets.add(control.target);
    }
  }

  return fileDropTargets;
}

export function getToolcraftResetMediaPatch(
  state: ToolcraftState,
  targets?: ReadonlySet<string>,
): Pick<ToolcraftHistoryPatch, "after" | "before"> | null {
  if (state.schema.panels.layers && !targets) {
    return null;
  }

  const fileDropTargets = getFileDropResetTargets(state, targets);

  if (fileDropTargets.size === 0) {
    return null;
  }

  const hasWorkspaceDefaults = state.schema.sourceDefaults !== undefined && state.schema.sourceDefaults.scope !== "parameters";
  const defaultMediaState = hasWorkspaceDefaults ? createToolcraftState(state.schema) : createToolcraftDefaultMediaState(
    state.schema,
    state.canvas,
  );
  const defaultTargetMediaAssets = defaultMediaState.mediaAssets.filter((asset) =>
    asset.sourceTarget ? fileDropTargets.has(asset.sourceTarget) : false,
  );
  const defaultTargetLayerIds = new Set(defaultTargetMediaAssets.map((asset) => asset.layerId));
  const currentTargetLayerIds = new Set(
    state.mediaAssets.flatMap((asset) =>
      asset.sourceTarget && fileDropTargets.has(asset.sourceTarget) ? [asset.layerId] : [],
    ),
  );
  const mediaAssets = [
    ...state.mediaAssets.filter((asset) => {
      if (asset.sourceTarget) {
        return !fileDropTargets.has(asset.sourceTarget);
      }

      return hasWorkspaceDefaults;
    }),
    ...cloneToolcraftMediaAssets(defaultTargetMediaAssets),
  ];
  const layers = [
    ...state.layers.filter(
      (layer) => !currentTargetLayerIds.has(layer.id) && !defaultTargetLayerIds.has(layer.id),
    ),
    ...cloneToolcraftLayers(
      defaultMediaState.layers.filter((layer) => defaultTargetLayerIds.has(layer.id)),
    ),
  ];
  const selectedLayerId =
    state.selectedLayerId && layers.some((layer) => layer.id === state.selectedLayerId)
      ? state.selectedLayerId
      : (layers[0]?.id ?? null);

  if (
    (!hasWorkspaceDefaults || (areToolcraftControlValuesEqual(mediaAssets, state.mediaAssets) && areToolcraftControlValuesEqual(layers, state.layers))) &&
    mediaAssets.length === state.mediaAssets.length &&
    mediaAssets.every((asset, index) => asset.id === state.mediaAssets[index]?.id) &&
    layers.length === state.layers.length &&
    layers.every((layer, index) => layer.id === state.layers[index]?.id) &&
    selectedLayerId === state.selectedLayerId
  ) {
    return null;
  }

  const timeline = getMediaReadyTimelineState(state.schema, state.timeline, mediaAssets);
  const shouldCommitTimeline = timeline !== state.timeline;

  return {
    after: {
      layers,
      mediaAssets,
      selectedLayerId,
      ...(shouldCommitTimeline ? { timeline } : {}),
    },
    before: {
      layers: state.layers,
      mediaAssets: state.mediaAssets,
      selectedLayerId: state.selectedLayerId,
      ...(shouldCommitTimeline ? { timeline: state.timeline } : {}),
    },
  };
}
