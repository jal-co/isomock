import type {
  ToolcraftCanonicalMediaImportAllocation,
  ToolcraftMediaAsset,
  ToolcraftMediaAssetDraft,
  ToolcraftState,
} from "./types";

export type ToolcraftCanonicalMediaImportAllocationInput = {
  assets: readonly ToolcraftMediaAssetDraft[];
  replaceExisting?: boolean;
};

function createIdAllocator(
  existingIds: Iterable<string>,
  prefix: string,
  initialIndex: number,
): (requestedId?: string) => string {
  const allocatedIds = new Set(existingIds);
  let index = initialIndex;

  return (requestedId) => {
    if (requestedId && !allocatedIds.has(requestedId)) {
      allocatedIds.add(requestedId);
      return requestedId;
    }

    while (allocatedIds.has(`${prefix}-${index}`)) index += 1;
    const id = `${prefix}-${index}`;
    allocatedIds.add(id);
    index += 1;
    return id;
  };
}

function getImportedLayerName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").trim() || "Material";
}

function getReplacementKey(sourceTarget: string | undefined): string {
  return sourceTarget ? `target:${sourceTarget}` : "untargeted";
}

function createReplacementQueues(mediaAssets: readonly ToolcraftMediaAsset[]) {
  const queues = new Map<string, ToolcraftMediaAsset[]>();

  for (const mediaAsset of mediaAssets) {
    const key = getReplacementKey(mediaAsset.sourceTarget);
    const queue = queues.get(key) ?? [];
    queue.push(mediaAsset);
    queues.set(key, queue);
  }
  return queues;
}

export function createToolcraftMediaImportAllocation(
  state: ToolcraftState,
  command: ToolcraftCanonicalMediaImportAllocationInput,
): ToolcraftCanonicalMediaImportAllocation {
  const shouldReplaceSingleLayerMedia =
    !state.schema.panels.layers && command.replaceExisting !== false;
  const hasUntargetedDraft = command.assets.some(
    (asset) => asset.sourceTarget === undefined,
  );
  const replacementTargets = new Set(
    command.assets.flatMap((asset) =>
      asset.sourceTarget ? [asset.sourceTarget] : [],
    ),
  );
  const replacedMediaAssets = shouldReplaceSingleLayerMedia
    ? state.mediaAssets.filter(
        (asset) =>
          hasUntargetedDraft ||
          (asset.sourceTarget !== undefined &&
            replacementTargets.has(asset.sourceTarget)),
      )
    : [];
  const replacedMediaIds = new Set(
    replacedMediaAssets.map((asset) => asset.id),
  );
  const replacedLayerIds = new Set(
    replacedMediaAssets.map((asset) => asset.layerId),
  );
  const baseMediaAssets = state.mediaAssets.filter(
    (asset) => !replacedMediaIds.has(asset.id),
  );
  const baseLayerIdsStillInUse = new Set(
    baseMediaAssets.map((asset) => asset.layerId),
  );
  const baseLayers = state.layers.filter(
    (layer) =>
      !replacedLayerIds.has(layer.id) || baseLayerIdsStillInUse.has(layer.id),
  );
  const replacementQueues = createReplacementQueues(replacedMediaAssets);
  const allocateMediaId = createIdAllocator(
    baseMediaAssets.map((asset) => asset.id),
    "media",
    state.mediaAssets.length + 1,
  );
  const allocateLayerId = createIdAllocator(
    baseLayers.map((layer) => layer.id),
    "layer",
    state.layers.length + 1,
  );
  const items = command.assets.map((draft) => {
    const replacement = replacementQueues
      .get(getReplacementKey(draft.sourceTarget))
      ?.shift();

    return {
      draft,
      layerId: allocateLayerId(draft.layerId ?? replacement?.layerId),
      layerName: draft.layerName ?? getImportedLayerName(draft.fileName),
      mediaId: allocateMediaId(draft.id ?? replacement?.id),
    };
  });

  return { baseLayers, baseMediaAssets, items };
}
