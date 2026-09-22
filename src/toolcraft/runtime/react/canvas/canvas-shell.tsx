"use client";

import * as React from "react";

import {
  DIRECT_CANVAS_OPERATION_TARGET,
  DIRECT_CANVAS_SOURCE_ASSET_CONTROL,
} from "../../source-assets/source-asset-coordinator";
import { getToolcraftRuntimeSetupBackgroundControls } from "../../schema/runtime-setup-background";
import { getToolcraftCanvasBackgroundState } from "../../state/canvas-background-state";
import type { ToolcraftState } from "../../state/types";
import {
  CanvasDefaultMediaLayer,
  getVisibleCanvasImageAssets,
} from "./canvas-default-media-layer";
import { CanvasViewportWorld } from "./canvas-viewport-world";
import { CanvasWorkspaceBackground } from "./canvas-workspace-background";
import { CanvasSceneSurface } from "./canvas-scene-surface";
import {
  useCanvasDropImport,
  type ToolcraftCanvasUploadPresentationState,
} from "./use-canvas-drop-import";
import { useCanvasViewportInteractions } from "./use-canvas-viewport-interactions";
import { useToolcraftCanvasFrame } from "./use-toolcraft-canvas-frame";
import { ToolcraftProductSceneSurface } from "./product-scene-surface";
import { useToolcraftStore } from "../app-shell/toolcraft-store-context";
import { useToolcraftSourceAssetCoordinator } from "../app-shell/toolcraft-source-asset-context";
import { useToolcraftCommittedSelector } from "../app-shell/toolcraft-selectors";
import {
  useToolcraftDispatch,
  useToolcraftEvaluatedValue,
} from "../app-shell/use-toolcraft";
import { hasToolcraftProductSceneContent } from "../app-shell/product-scene-requirement";
import { ToolcraftCanvasHandleLayers } from "../canvas-handles/canvas-handle-layer-registry";
import {
  getVisibleCanvasModelAssets,
  ToolcraftModelCanvasLayers,
} from "../model-rendering/model-canvas-layer";
import { useToolcraftModelPresentationMode } from "../model-rendering/model-presentation-mode";
import { createToolcraftSourceAssetPresentation } from "../source-assets/source-asset-presentation";
import { FiniteCanvasBackgroundLayer } from "./finite-canvas-background-layer";

const directCanvasModelOperationTargets = [
  DIRECT_CANVAS_OPERATION_TARGET,
] as const;

export type CanvasShellProps = {
  children?: React.ReactNode;
  infiniteCanvasContent?: React.ReactNode;
  renderDefaultMedia?: boolean;
};

function isDragLeavingCurrentTarget(
  event: React.DragEvent<HTMLElement>,
): boolean {
  const nextTarget = event.relatedTarget;

  return !(
    nextTarget instanceof Node && event.currentTarget.contains(nextTarget)
  );
}

function mediaAssetListsEqual<MediaAsset>(
  previous: readonly MediaAsset[],
  next: readonly MediaAsset[],
): boolean {
  return (
    previous.length === next.length &&
    previous.every((mediaAsset, index) => mediaAsset === next[index])
  );
}

const selectCanvasSchema = (state: ToolcraftState) => state.schema.canvas;
const selectSchema = (state: ToolcraftState) => state.schema;
const selectSelectedLayerId = (state: ToolcraftState) => state.selectedLayerId;

export function CanvasShell({
  children,
  infiniteCanvasContent,
  renderDefaultMedia = true,
}: CanvasShellProps): React.JSX.Element {
  const dispatch = useToolcraftDispatch();
  const store = useToolcraftStore();
  const sourceAssetCoordinator = useToolcraftSourceAssetCoordinator();
  const modelPresentation = useToolcraftModelPresentationMode();
  const suppressedModelTargets = React.useMemo(
    () =>
      modelPresentation.mode === "custom"
        ? modelPresentation.consumers.map(({ sourceTarget }) => sourceTarget)
        : [],
    [modelPresentation],
  );
  const [dragOver, setDragOver] = React.useState(false);
  const [uploadPresentation, setUploadPresentation] =
    React.useState<ToolcraftCanvasUploadPresentationState>({
      directOperation: false,
      feedback: null,
    });
  const canvasSchema = useToolcraftCommittedSelector(selectCanvasSchema);
  const schema = useToolcraftCommittedSelector(selectSchema);
  const backgroundControls = React.useMemo(
    () => getToolcraftRuntimeSetupBackgroundControls(schema),
    [schema],
  );
  const backgroundColorTarget =
    backgroundControls?.color.target ?? "toolcraft:runtime:no-background";
  const backgroundIncludeTarget = backgroundControls?.include.target;
  const evaluatedBackgroundColor = useToolcraftEvaluatedValue(
    backgroundColorTarget,
  );
  const selectBackgroundInclude = React.useCallback(
    (state: ToolcraftState) =>
      backgroundIncludeTarget
        ? state.values[backgroundIncludeTarget]
        : undefined,
    [backgroundIncludeTarget],
  );
  const backgroundInclude = useToolcraftCommittedSelector(
    selectBackgroundInclude,
    Object.is,
  );
  const backgroundValues = React.useMemo(
    () => ({
      [backgroundColorTarget]: evaluatedBackgroundColor,
      ...(backgroundIncludeTarget
        ? { [backgroundIncludeTarget]: backgroundInclude }
        : {}),
    }),
    [
      backgroundColorTarget,
      backgroundInclude,
      backgroundIncludeTarget,
      evaluatedBackgroundColor,
    ],
  );
  const background = React.useMemo(
    () =>
      getToolcraftCanvasBackgroundState({ schema, values: backgroundValues }),
    [backgroundValues, schema],
  );
  const selectedLayerId = useToolcraftCommittedSelector(selectSelectedLayerId);
  const canvasFrame = useToolcraftCanvasFrame();
  const infiniteCanvasBackgroundColor =
    canvasFrame.kind === "infinite" && background.enabled
      ? background.color
      : undefined;
  const finiteCanvasBackgroundColor =
    canvasFrame.kind === "finite" && background.enabled
      ? background.color
      : undefined;
  const visibleMediaAssets = useToolcraftCommittedSelector(
    getVisibleCanvasImageAssets,
    mediaAssetListsEqual,
  );
  const visibleModelAssets = useToolcraftCommittedSelector(
    getVisibleCanvasModelAssets,
    mediaAssetListsEqual,
  );
  const getDirectCanvasOperation = React.useCallback(
    () => sourceAssetCoordinator.getOperation(DIRECT_CANVAS_OPERATION_TARGET),
    [sourceAssetCoordinator],
  );
  const directCanvasOperation = React.useSyncExternalStore(
    sourceAssetCoordinator.subscribe,
    getDirectCanvasOperation,
    getDirectCanvasOperation,
  );
  const directCanvasPresentation = sourceAssetCoordinator.supportsKind("image")
    ? createToolcraftSourceAssetPresentation(
        "image",
        DIRECT_CANVAS_SOURCE_ASSET_CONTROL,
        visibleMediaAssets,
        directCanvasOperation,
      )
    : null;
  const uploadStatus = uploadPresentation.directOperation
    ? directCanvasPresentation?.status
    : undefined;
  const uploadFeedback =
    uploadPresentation.feedback ??
    (uploadPresentation.directOperation
      ? (directCanvasPresentation?.feedback ?? null)
      : null);
  const uploadEnabled = canvasSchema.upload;
  const {
    handlePointerDown,
    handlePointerDownCapture,
    handlePointerMoveCapture,
    handlePointerUp,
    handlePointerUpCapture,
    panState,
    viewportRef,
  } = useCanvasViewportInteractions({
    draggable: canvasSchema.draggable,
    store,
  });
  const handleDrop = useCanvasDropImport({
    coordinator: sourceAssetCoordinator,
    onPresentationChange: setUploadPresentation,
    setDragOver,
    store,
    uploadEnabled,
  });
  const hasCanvasContent =
    visibleMediaAssets.length > 0 || visibleModelAssets.length > 0;
  const hasCanvasSlot = hasToolcraftProductSceneContent(children);
  const renderEditableCanvas =
    canvasSchema.sizing.mode !== "intrinsic-media" ||
    canvasSchema.sizeSource === "app" ||
    hasCanvasContent ||
    hasCanvasSlot;

  const beginDragOver = (event: React.DragEvent<HTMLDivElement>): void => {
    if (!uploadEnabled) {
      return;
    }

    event.preventDefault();
    setDragOver(true);
  };

  return (
    <div
      aria-label="Canvas viewport"
      className="group/canvas absolute inset-0 touch-none overflow-clip bg-[color:var(--background)]"
      data-canvas-pan-state={panState}
      data-drag-over={dragOver}
      data-slot="toolcraft-runtime-canvas"
      data-toolcraft-infinite-background-color={infiniteCanvasBackgroundColor}
      onDragEnter={beginDragOver}
      onDragLeave={(event) => {
        if (isDragLeavingCurrentTarget(event)) {
          setDragOver(false);
        }
      }}
      onDragOver={beginDragOver}
      onDrop={handleDrop}
      onLostPointerCapture={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerCancelCapture={handlePointerUpCapture}
      onPointerDown={handlePointerDown}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMoveCapture={handlePointerMoveCapture}
      onPointerUp={handlePointerUp}
      onPointerUpCapture={handlePointerUpCapture}
      ref={viewportRef}
      role="application"
      tabIndex={0}
      style={
        infiniteCanvasBackgroundColor
          ? { backgroundColor: infiniteCanvasBackgroundColor }
          : undefined
      }
    >
      <CanvasWorkspaceBackground />
      {canvasFrame.kind === "infinite" && infiniteCanvasContent ? (
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          data-toolcraft-infinite-canvas-content=""
        >
          {infiniteCanvasContent}
        </div>
      ) : null}
      <CanvasViewportWorld>
        {renderEditableCanvas ? (
          <CanvasSceneSurface frame={canvasFrame}>
            {finiteCanvasBackgroundColor && canvasFrame.kind === "finite" ? (
              <FiniteCanvasBackgroundLayer
                color={finiteCanvasBackgroundColor}
                size={canvasFrame.size}
              />
            ) : null}
            <ToolcraftModelCanvasLayers
              dispatch={dispatch}
              operationTargets={directCanvasModelOperationTargets}
              operationSource={sourceAssetCoordinator}
              suppressedTargets={suppressedModelTargets}
            />
            {renderDefaultMedia
              ? visibleMediaAssets.map((mediaAsset) => (
                  <CanvasDefaultMediaLayer
                    dispatch={dispatch}
                    key={mediaAsset.id}
                    mediaAsset={mediaAsset}
                    selected={selectedLayerId === mediaAsset.layerId}
                  />
                ))
              : null}
            {children ? (
              <ToolcraftProductSceneSurface frame={canvasFrame}>
                {children}
              </ToolcraftProductSceneSurface>
            ) : null}
          </CanvasSceneSurface>
        ) : null}
      </CanvasViewportWorld>
      <ToolcraftCanvasHandleLayers />
      {uploadStatus || uploadFeedback ? (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 flex max-w-[min(32rem,calc(100%-1.5rem))] -translate-x-1/2 flex-col gap-1 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-center text-xs leading-snug shadow-sm">
          {uploadStatus ? (
            <p
              aria-live="polite"
              className="m-0 text-[color:var(--muted-foreground)]"
              data-slot="canvas-upload-status"
              role="status"
            >
              {uploadStatus.label}
              {uploadStatus.progress === undefined
                ? ""
                : ` ${Math.round(uploadStatus.progress * 100)}%`}
            </p>
          ) : null}
          {uploadFeedback ? (
            <p
              className="m-0 text-[color:var(--destructive)]"
              data-canvas-upload-feedback-code={uploadFeedback.code}
              data-slot="canvas-upload-feedback"
              role="alert"
            >
              {uploadFeedback.message}
            </p>
          ) : null}
        </div>
      ) : null}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 bg-[color:color-mix(in_oklab,var(--link)_8%,transparent)] opacity-0 transition-opacity duration-150 ease-out group-data-[drag-over=true]/canvas:opacity-100"
        data-canvas-drag-highlight=""
      />
    </div>
  );
}
