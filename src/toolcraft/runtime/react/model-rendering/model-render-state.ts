import type { ReadonlyToolcraftState } from "../../state/readonly-state";
import type { ToolcraftModelAsset } from "../../state/types";
import { isToolcraftLayerVisibleInTree } from "../../state/layer-visibility";
import {
  getToolcraftOrientationControlEntries,
  resolveToolcraftOrientationControl,
} from "../orientation-gizmo/orientation-gizmo-selection";
import {
  readToolcraftOrientationPose,
  type ToolcraftOrientationPose,
} from "../orientation-gizmo/orientation-gizmo-math";
import type { ToolcraftModelPresentationRequest } from "./model-render-binding";
import type { ToolcraftModelViewport } from "./model-display-fit";

export type ToolcraftModelExportRequest = Omit<
  ToolcraftModelPresentationRequest,
  "asset"
> & Readonly<{ asset: ToolcraftModelAsset }>;

export function toolcraftModelAssetListsEqual(
  previous: readonly ToolcraftModelAsset[],
  next: readonly ToolcraftModelAsset[],
): boolean {
  return previous.length === next.length &&
    previous.every((asset, index) => asset === next[index]);
}

export function selectToolcraftModelAssets(
  state: ReadonlyToolcraftState,
): ToolcraftModelAsset[] {
  return state.mediaAssets.filter(
    (asset): asset is ToolcraftModelAsset => asset.assetKind === "model",
  );
}

export function getVisibleToolcraftModelAssets(
  state: ReadonlyToolcraftState,
): ToolcraftModelAsset[] {
  return selectToolcraftModelAssets(state).filter(
    (asset) =>
      asset.lifecycle !== "restoring" &&
      asset.lifecycle !== "unavailable" &&
      isToolcraftLayerVisibleInTree(state.layers, asset.layerId),
  );
}

export function getToolcraftActiveModelOrientation(
  state: ReadonlyToolcraftState,
): ToolcraftOrientationPose | undefined {
  const entries = getToolcraftOrientationControlEntries(
    state.schema.panels.controls?.sections ?? [],
  );
  const entry = resolveToolcraftOrientationControl(state, entries);
  return entry
    ? readToolcraftOrientationPose(
        state.values[entry.control.target],
        readToolcraftOrientationPose(entry.control.defaultValue),
      )
    : undefined;
}

export function getToolcraftVisibleModelExportRequests(
  state: ReadonlyToolcraftState,
  options: Readonly<{
    suppressedTargets?: readonly string[];
    viewportForAsset?: (asset: ToolcraftModelAsset) => ToolcraftModelViewport;
  }> = {},
): ToolcraftModelExportRequest[] {
  const orientation = getToolcraftActiveModelOrientation(state);
  const suppressedTargets = new Set(options.suppressedTargets);
  return getVisibleToolcraftModelAssets(state)
    .filter((asset) => !suppressedTargets.has(asset.sourceTarget ?? asset.id))
    .map((asset) => ({
      asset,
      ...(orientation ? { orientation } : {}),
      phase: "final",
      target: asset.sourceTarget ?? asset.id,
      viewport: options.viewportForAsset?.(asset) ?? state.canvas.size,
    }));
}
