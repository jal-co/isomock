import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import {
  createToolcraftDefaultModelPlaceholder,
  resolveToolcraftDefaultModelControl,
} from "../model-import/default-model-source-assets";
import { cloneToolcraftModelAssetRecord } from "../model-import/model-asset-metadata";
import { createToolcraftDataUrlResourceRef } from "../source-assets/media-resource-ref";
import { cloneToolcraftMediaResourceState } from "./media-resource-state";
import type {
  ToolcraftCanvasState,
  ToolcraftFileAsset,
  ToolcraftImageAsset,
  ToolcraftImageAssetDraft,
  ToolcraftImageAssetIngress,
  ToolcraftInitialMediaAsset,
  ToolcraftLayer,
  ToolcraftMediaAsset,
  ToolcraftModelAsset,
} from "./types";
import {
  cloneToolcraftImageAsset,
  normalizeToolcraftImageAssetGeometry,
} from "./image-asset-geometry";
import { normalizeToolcraftSceneElementFrame } from "./scene-element-frame";

export type ToolcraftDefaultMediaState = {
  layers: ToolcraftLayer[];
  mediaAssets: ToolcraftMediaAsset[];
  selectedLayerId: string | null;
};

function getDefaultLayerName(fileName: string): string {
  const baseName = fileName.replace(/\.[^.]+$/u, "").trim();

  return baseName || "Media";
}

function finalizeImageAsset(
  draft: ToolcraftImageAssetDraft,
): ToolcraftImageAsset {
  const { layerName: _layerName, ...asset } = draft;

  if (asset.id === undefined || asset.layerId === undefined) {
    throw new Error("Initial image assets require stable media and layer ids.");
  }

  return {
    ...asset,
    id: asset.id,
    layerId: asset.layerId,
  };
}

function normalizeInitialImageIngress(
  ingress: ToolcraftImageAssetIngress,
  canvas: Pick<ToolcraftCanvasState, "mode" | "size">,
  sizingMode: ResolvedToolcraftAppSchema["canvas"]["sizing"]["mode"],
): ToolcraftImageAsset {
  return finalizeImageAsset(
    normalizeToolcraftImageAssetGeometry(ingress, {
      canvasMode: canvas.mode,
      canvasSize: canvas.size,
      sizingMode,
    }),
  );
}

function cloneModelAsset(asset: ToolcraftModelAsset): ToolcraftModelAsset {
  const record = cloneToolcraftModelAssetRecord(asset);
  const frame = normalizeToolcraftSceneElementFrame(asset);

  return {
    ...record,
    assetKind: "model",
    fileName: asset.fileName,
    ...(asset.sourcePaths ? { sourcePaths: [...asset.sourcePaths] } : {}),
    id: asset.id,
    layerId: asset.layerId,
    mimeType: asset.mimeType,
    position: frame.position,
    size: frame.size,
    ...(asset.sourceTarget ? { sourceTarget: asset.sourceTarget } : {}),
  };
}

function cloneInitialMediaAsset(
  asset: ToolcraftInitialMediaAsset,
  canvas: Pick<ToolcraftCanvasState, "mode" | "size">,
  sizingMode: ResolvedToolcraftAppSchema["canvas"]["sizing"]["mode"],
): ToolcraftMediaAsset {
  if ("policy" in asset) {
    return normalizeInitialImageIngress(asset, canvas, sizingMode);
  }
  if (asset.assetKind === "model") {
    return cloneModelAsset(asset);
  }

  if (asset.assetKind === "file") {
    const resourceState = cloneToolcraftMediaResourceState("file", asset);

    return {
      ...resourceState,
      assetKind: "file",
      fileName: asset.fileName,
      ...(asset.sourcePaths ? { sourcePaths: [...asset.sourcePaths] } : {}),
      id: asset.id,
      layerId: asset.layerId,
      mimeType: asset.mimeType,
      position: { ...asset.position },
      ...(asset.sourceTarget ? { sourceTarget: asset.sourceTarget } : {}),
    };
  }

  return cloneToolcraftImageAsset(asset);
}

function cloneLayer(layer: ToolcraftLayer): ToolcraftLayer {
  return { ...layer };
}

export function cloneToolcraftMediaAssets(
  mediaAssets: readonly ToolcraftMediaAsset[],
): ToolcraftMediaAsset[] {
  return mediaAssets.map((asset) => {
    if (asset.assetKind === "image") {
      return cloneToolcraftImageAsset(asset);
    }

    if (asset.assetKind === "model") {
      return cloneModelAsset(asset);
    }

    const resourceState = cloneToolcraftMediaResourceState("file", asset);
    const cloned: ToolcraftFileAsset = {
      ...resourceState,
      assetKind: "file",
      fileName: asset.fileName,
      ...(asset.sourcePaths ? { sourcePaths: [...asset.sourcePaths] } : {}),
      id: asset.id,
      layerId: asset.layerId,
      mimeType: asset.mimeType,
      position: { ...asset.position },
      ...(asset.sourceTarget ? { sourceTarget: asset.sourceTarget } : {}),
    };

    return cloned;
  });
}

export function cloneToolcraftInitialMediaAssets(
  mediaAssets: readonly ToolcraftInitialMediaAsset[],
  canvas: Pick<ToolcraftCanvasState, "mode" | "size">,
  sizingMode: ResolvedToolcraftAppSchema["canvas"]["sizing"]["mode"],
): ToolcraftMediaAsset[] {
  return mediaAssets.map((asset) =>
    cloneInitialMediaAsset(asset, canvas, sizingMode),
  );
}

export function cloneToolcraftLayers(
  layers: readonly ToolcraftLayer[],
): ToolcraftLayer[] {
  return layers.map(cloneLayer);
}

export function createToolcraftLayersFromMediaAssets(
  mediaAssets: readonly ToolcraftMediaAsset[],
  defaultLayers: readonly ToolcraftLayer[] = [],
): ToolcraftLayer[] {
  const layers: ToolcraftLayer[] = [];
  const defaultLayerById = new Map(
    defaultLayers.map((layer) => [layer.id, layer]),
  );
  const seenLayerIds = new Set<string>();

  for (const asset of mediaAssets) {
    if (seenLayerIds.has(asset.layerId)) {
      continue;
    }

    seenLayerIds.add(asset.layerId);
    layers.push(
      cloneLayer(
        defaultLayerById.get(asset.layerId) ?? {
          displayName: getDefaultLayerName(asset.fileName),
          id: asset.layerId,
          kind: "layer",
          name: getDefaultLayerName(asset.fileName),
          visible: true,
        },
      ),
    );
  }

  return layers;
}

export function createToolcraftDefaultMediaState(
  schema: ResolvedToolcraftAppSchema,
  canvas: Pick<ToolcraftCanvasState, "mode" | "size">,
): ToolcraftDefaultMediaState {
  const layers: ToolcraftLayer[] = [];
  const mediaAssets: ToolcraftMediaAsset[] = [];

  schema.media.defaultAssets.forEach((asset, index) => {
    if (asset.assetKind === "model") {
      const control = resolveToolcraftDefaultModelControl(schema, asset);
      const model = createToolcraftDefaultModelPlaceholder({
        asset,
        index,
        topologyProfile: control.topologyProfile ?? "realtime-mesh",
      });
      const layerName = asset.layerName ?? getDefaultLayerName(asset.fileName);

      layers.push({
        displayName: layerName,
        id: model.layerId,
        kind: "layer",
        name: layerName,
        visible: true,
      });
      mediaAssets.push(model);
      return;
    }

    const layerId = asset.layerId ?? `default-media-layer-${index + 1}`;
    const layerName = asset.layerName ?? getDefaultLayerName(asset.fileName);

    layers.push({
      displayName: layerName,
      id: layerId,
      kind: "layer",
      name: layerName,
      visible: true,
    });
    if (asset.assetKind === "file") {
      mediaAssets.push({
        assetKind: "file",
        fileName: asset.fileName,
        id: asset.id ?? `default-media-${index + 1}`,
        layerId,
        mimeType: asset.mimeType ?? "application/octet-stream",
        position: asset.position ?? { x: 0, y: 0 },
        lifecycle: "restoring",
        resourceRef: createToolcraftDataUrlResourceRef("file", asset.dataUrl),
        ...(asset.sourceTarget ? { sourceTarget: asset.sourceTarget } : {}),
      });
      return;
    }

    const baseAsset = {
      assetKind: "image" as const,
      fileName: asset.fileName,
      id: asset.id ?? `default-media-${index + 1}`,
      layerId,
      mimeType: asset.mimeType ?? "image/*",
      lifecycle: "restoring" as const,
      resourceRef: createToolcraftDataUrlResourceRef("image", asset.dataUrl),
      ...(asset.sourceTarget ? { sourceTarget: asset.sourceTarget } : {}),
      ...(asset.transform ? { transform: asset.transform } : {}),
    };

    if (asset.ingressPolicy === "canonical-runtime") {
      mediaAssets.push(
        cloneToolcraftImageAsset({
          ...baseAsset,
          position: asset.position,
          size: asset.size,
          sourceSize: asset.sourceSize,
        }),
      );
      return;
    }

    const ingress: ToolcraftImageAssetIngress = {
      asset: {
        ...baseAsset,
        position: asset.position,
        sourceSize: asset.sourceSize,
      },
      policy: "prepared-source",
    };

    mediaAssets.push(
      finalizeImageAsset(
        normalizeToolcraftImageAssetGeometry(ingress, {
          canvasMode: canvas.mode,
          canvasSize: canvas.size,
          sizingMode: schema.canvas.sizing.mode,
        }),
      ),
    );
  });

  return {
    layers,
    mediaAssets,
    selectedLayerId: layers[0]?.id ?? null,
  };
}
