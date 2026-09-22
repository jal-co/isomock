import * as React from "react";
import {
  FileDrop,
  type ControlChangeMeta,
  type FileDropPresentationItem,
} from "@/toolcraft/ui";

import type { ToolcraftCanvasSize, ToolcraftControlSchema } from "../../../schema/types";
import type { ToolcraftSourceAssetCoordinator } from "../../../source-assets/source-asset-coordinator";
import type {
  ToolcraftCommand,
  ToolcraftImageAsset,
  ToolcraftMediaAsset,
  ToolcraftMediaTransformOperation,
} from "../../../state/types";
import { useToolcraftMediaPresentationUrls } from "../../app-shell/toolcraft-source-asset-context";
import { useToolcraftSelector } from "../../app-shell/use-toolcraft";
import { createToolcraftSourceAssetPresentation } from "../../source-assets/source-asset-presentation";
import { ControlsPanelFileDropItemControls } from "./controls-panel-file-drop-item-controls";

export type FileDropControlRenderArgs = {
  canvasSize: ToolcraftCanvasSize;
  control: ToolcraftControlSchema;
  dispatchCommand: (command: ToolcraftCommand) => void;
  id: string;
  layerSelectionEnabled?: boolean;
  mediaAssets: readonly ToolcraftMediaAsset[];
  name: string;
  setControlValue?: (
    target: string,
    value: unknown,
    label?: string,
    meta?: ControlChangeMeta,
  ) => void;
  sourceAssetCoordinator: ToolcraftSourceAssetCoordinator;
  value?: unknown;
};

const IMAGE_TRANSFORM_OPERATIONS = new Set<ToolcraftMediaTransformOperation>([
  "flip-horizontal",
  "flip-vertical",
  "rotate-left",
  "rotate-right",
]);

const MODEL_REPAIR_ACTION = "model.fix";

function getSourceAssetKind(
  control: ToolcraftControlSchema,
): "file" | "image" | "model" {
  return control.assetKind === "file"
    ? "file"
    : control.assetKind === "model"
      ? "model"
      : "image";
}

function isImageTransformOperation(
  value: string,
): value is ToolcraftMediaTransformOperation {
  return IMAGE_TRANSFORM_OPERATIONS.has(value as ToolcraftMediaTransformOperation);
}

function FileDropControlRenderer({
  control,
  dispatchCommand,
  id,
  layerSelectedImageAsset = null,
  mediaAssets,
  name,
  setControlValue = () => undefined,
  sourceAssetCoordinator,
  suppressMediaCollection = false,
  value,
}: Omit<
  FileDropControlRenderArgs,
  "canvasSize" | "layerSelectionEnabled"
> & {
  layerSelectedImageAsset?: ToolcraftImageAsset | null;
  suppressMediaCollection?: boolean;
}): React.JSX.Element | null {
  const assetKind = getSourceAssetKind(control);
  const getOperation = React.useCallback(
    () => sourceAssetCoordinator.getOperation(control.target),
    [control.target, sourceAssetCoordinator],
  );
  const operation = React.useSyncExternalStore(
    sourceAssetCoordinator.subscribe,
    getOperation,
    getOperation,
  );
  const previewUrls = useToolcraftMediaPresentationUrls(mediaAssets);
  const [selectedMediaId, setSelectedMediaId] = React.useState<string | null>(null);
  const unresolvedPresentation = sourceAssetCoordinator.supportsKind(assetKind)
    ? createToolcraftSourceAssetPresentation(
        assetKind,
        control,
        mediaAssets,
        operation,
      )
    : null;
  const basePresentation = unresolvedPresentation
    ? {
        ...unresolvedPresentation,
        items: unresolvedPresentation.items.map((item) => {
          const previewSrc = previewUrls.get(item.id);

          return previewSrc ? { ...item, previewSrc } : item;
        }),
      }
    : null;
  const selectedLayerPresentation = layerSelectedImageAsset &&
      sourceAssetCoordinator.supportsKind("image")
    ? createToolcraftSourceAssetPresentation(
        "image",
        control,
        [layerSelectedImageAsset],
        operation,
      )
    : null;
  const previewMediaIds = basePresentation?.items.map((item) => item.id) ?? [];
  const activeImageId = assetKind === "image"
    ? suppressMediaCollection
      ? layerSelectedImageAsset?.id ?? null
      : basePresentation?.items.length === 1
        ? basePresentation.items[0]?.id ?? null
        : selectedMediaId
    : null;
  const activeModelId = assetKind === "model"
    ? basePresentation?.items[0]?.id ?? null
    : null;
  const presentation = basePresentation
    ? suppressMediaCollection
      ? {
          ...basePresentation,
          items: [],
          secondaryActions: selectedLayerPresentation?.secondaryActions ?? [],
        }
      : assetKind === "image" && !activeImageId
        ? { ...basePresentation, secondaryActions: [] }
        : basePresentation
    : null;
  const usesCollectionActions = control.variant === "collection-actions";
  const canAddCollectionItem =
    typeof control.hardMaxItems !== "number" ||
    (basePresentation?.items.length ?? 0) < control.hardMaxItems;

  React.useEffect(() => {
    if (selectedMediaId && !previewMediaIds.includes(selectedMediaId)) {
      setSelectedMediaId(null);
    }
  }, [previewMediaIds, selectedMediaId]);

  if (!basePresentation || !presentation) {
    return null;
  }

  const reorderItems = (orderedIds: readonly string[]): void => {
    if (orderedIds.length !== previewMediaIds.length) {
      return;
    }

    const previewIdSet = new Set(previewMediaIds);
    let orderedPreviewIndex = 0;
    const mediaIds = mediaAssets.map((asset) => {
      if (!previewIdSet.has(asset.id)) {
        return asset.id;
      }

      const nextId = orderedIds[orderedPreviewIndex];
      orderedPreviewIndex += 1;
      return nextId ?? asset.id;
    });

    dispatchCommand({ mediaIds, type: "media.reorder" });
  };

  const importFiles = (files: File[]): void => {
    void sourceAssetCoordinator.importBatch(
      {
        files,
        origin: "panel",
        target: control.target,
      },
      control,
    );
  };

  return (
    <FileDrop
      collectionActions={
        usesCollectionActions
          ? {
              addLabel: control.addLabel ?? `Add ${control.itemLabel ?? "file"}`,
              canAdd: canAddCollectionItem,
              itemLabel: control.itemLabel ?? "file",
              name,
              removeLabel:
                control.removeLabel ?? `Remove ${control.itemLabel ?? "file"}`,
              ...(control.itemControls
                ? {
                    renderItemContent: (
                      item: FileDropPresentationItem,
                      index: number,
                    ) => (
                      <ControlsPanelFileDropItemControls
                        control={control}
                        index={index}
                        mediaId={item.id}
                        name={name}
                        setControlValue={setControlValue}
                        value={value}
                      />
                    ),
                  }
                : {}),
            }
          : undefined
      }
      key={id}
      onAction={
        activeImageId
          ? (value) => {
              if (!isImageTransformOperation(value)) {
                return;
              }

              dispatchCommand({
                mediaId: activeImageId,
                operation: value,
                type: "media.transform",
              });
            }
          : activeModelId
            ? (value) => {
                if (value !== MODEL_REPAIR_ACTION) return;
                void sourceAssetCoordinator.repairModel(activeModelId);
              }
          : undefined
      }
      onFilesSelect={importFiles}
      onFolderSelect={
        presentation.allowsFolderSelection ? importFiles : undefined
      }
      onItemRemove={(item) => {
        dispatchCommand({ mediaId: item.id, type: "media.delete" });
      }}
      onItemSelect={
        assetKind === "image" && basePresentation.presenter === "image-grid"
          ? (item) => setSelectedMediaId(item.id)
          : undefined
      }
      onItemsReorder={
        basePresentation.presenter === "file-list" ||
        basePresentation.presenter === "image-grid"
          ? (items) => reorderItems(items.map((item) => item.id))
          : undefined
      }
      presentation={presentation}
    />
  );
}

function LayerSelectedFileDropControlRenderer(
  props: Omit<
    FileDropControlRenderArgs,
    "canvasSize" | "layerSelectionEnabled"
  >,
): React.JSX.Element | null {
  const { control } = props;
  const assetKind = getSourceAssetKind(control);
  const selectedImageAsset = useToolcraftSelector(
    React.useCallback(
      (state) =>
        assetKind === "image"
          ? state.mediaAssets.find(
              (asset): asset is ToolcraftImageAsset =>
                asset.assetKind === "image" &&
                asset.layerId === state.selectedLayerId &&
                (asset.sourceTarget === undefined ||
                  asset.sourceTarget === control.target),
            ) ?? null
          : null,
      [assetKind, control.target],
    ),
  );

  return (
    <FileDropControlRenderer
      {...props}
      layerSelectedImageAsset={selectedImageAsset}
      suppressMediaCollection
    />
  );
}

export function renderFileDropControl({
  canvasSize: _canvasSize,
  control,
  layerSelectionEnabled = false,
  ...rendererProps
}: FileDropControlRenderArgs): React.ReactNode {
  return layerSelectionEnabled ? (
    <LayerSelectedFileDropControlRenderer
      control={control}
      {...rendererProps}
    />
  ) : (
    <FileDropControlRenderer control={control} {...rendererProps} />
  );
}
