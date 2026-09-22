"use client";

import * as React from "react";

import type { ToolcraftSourceAssetOperation } from "../../source-assets/source-asset-types";
import { getToolcraftSceneElementRect } from "../../scene";
import { defaultToolcraftSceneElementFrame } from "../../state/scene-element-frame";
import type {
  ToolcraftCommand,
  ToolcraftModelAsset,
  ToolcraftState,
} from "../../state/types";
import { useToolcraftStore } from "../app-shell/toolcraft-store-context";
import { useToolcraftCommittedSelector } from "../app-shell/toolcraft-selectors";
import { isToolcraftLayerVisibleInTree } from "../layers/layer-tree";
import { readToolcraftOrientationPose } from "../orientation-gizmo/orientation-gizmo-math";
import type {
  ToolcraftModelOrbitHitTest,
  ToolcraftModelOrbitInteractionHandlers,
} from "../orientation-gizmo/use-toolcraft-model-orbit-interaction";
import { useToolcraftModelOrbitInteraction } from "../orientation-gizmo/use-toolcraft-model-orbit-interaction";
import { useToolcraftOrientationControlSelection } from "../orientation-gizmo/use-toolcraft-orientation-control-selection";
import type {
  ToolcraftModelPresentationAsset,
  ToolcraftModelPresentationPhase,
} from "./model-render-binding";
import { useOptionalToolcraftModelRenderHost } from "./model-render-provider";
import type { ToolcraftModelViewport } from "./model-display-fit";
import {
  getVisibleToolcraftModelAssets,
  selectToolcraftModelAssets,
  toolcraftModelAssetListsEqual,
} from "./model-render-state";

export type ToolcraftCanvasModelAsset = ToolcraftModelPresentationAsset &
  Readonly<{ fileName: string }>;

export type ToolcraftModelOperationSource = Readonly<{
  getOperation(target: string): ToolcraftSourceAssetOperation;
  subscribe(listener: () => void): () => void;
}>;

function reportModelRenderError(error: unknown): void {
  if (typeof globalThis.reportError === "function") {
    globalThis.reportError(error);
    return;
  }
  console.error("Toolcraft model rendering failed.", error);
}

function getDevicePixelRatio(): number {
  const ratio = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

export function ToolcraftModelCanvasLayer({
  asset,
  canonicalDocumentRef,
  dispatch,
  hitTest,
  interactionHandlers,
  onRenderError = reportModelRenderError,
  orientation,
  phase,
  presentationRect,
  prewarmOnly = false,
  renderKey = asset.id,
  selectable = true,
  selected,
  target,
  viewport,
}: {
  asset: ToolcraftCanvasModelAsset;
  canonicalDocumentRef?: string;
  dispatch: React.Dispatch<ToolcraftCommand>;
  hitTest?: ToolcraftModelOrbitHitTest;
  interactionHandlers?: ToolcraftModelOrbitInteractionHandlers<HTMLDivElement>;
  onRenderError?: (error: unknown) => void;
  orientation?: ReturnType<typeof readToolcraftOrientationPose>;
  phase: ToolcraftModelPresentationPhase;
  presentationRect: Readonly<{
    height: number;
    width: number;
    x: number;
    y: number;
  }>;
  prewarmOnly?: boolean;
  renderKey?: string;
  selectable?: boolean;
  selected: boolean;
  target: string;
  viewport: ToolcraftModelViewport;
}): React.JSX.Element | null {
  const host = useOptionalToolcraftModelRenderHost();
  const elementRef = React.useRef<HTMLDivElement>(null);
  const request = React.useMemo(
    () => prewarmOnly
      ? null
      : ({
          asset,
          ...(canonicalDocumentRef ? { canonicalDocumentRef } : {}),
          ...(orientation ? { orientation } : {}),
          phase,
          target,
          viewport,
        }),
    [
      asset,
      canonicalDocumentRef,
      orientation,
      phase,
      prewarmOnly,
      target,
      viewport,
    ],
  );
  const [prewarmStatus, setPrewarmStatus] = React.useState<
    "error" | "pending" | "ready"
  >("pending");
  const [renderState, setRenderState] = React.useState<{
    renderKey: string;
    request: NonNullable<typeof request>;
    status: "error" | "pending" | "ready";
  } | null>(null);
  const renderStatus = prewarmOnly
    ? prewarmStatus
    : renderState?.renderKey === renderKey && renderState.request === request
      ? renderState.status
      : "pending";

  React.useEffect(() => {
    if (!host) return undefined;
    return () => host.release(renderKey);
  }, [host, renderKey]);

  React.useEffect(() => {
    const element = elementRef.current;
    if (!host || !element) return undefined;
    let active = true;
    if (prewarmOnly) {
      host.release(renderKey);
      setPrewarmStatus("pending");
      void host.prepare({
        height: viewport.height,
        host: element,
        pixelRatio: getDevicePixelRatio(),
        target,
        width: viewport.width,
      }).then(() => {
        if (active) setPrewarmStatus("ready");
      }).catch((error: unknown) => {
        if (active) {
          setPrewarmStatus("error");
          onRenderError(error);
        }
      });
      return () => {
        active = false;
      };
    }
    if (!request) return undefined;
    setRenderState({ renderKey, request, status: "pending" });

    void host.renderPreview(renderKey, request, {
      height: viewport.height,
      host: element,
      pixelRatio: getDevicePixelRatio(),
      selected,
      width: viewport.width,
    }).then(() => {
      if (active) setRenderState({ renderKey, request, status: "ready" });
    }).catch((error: unknown) => {
      if (active) {
        setRenderState({ renderKey, request, status: "error" });
        onRenderError(error);
      }
    });

    return () => {
      active = false;
    };
  }, [
    host,
    onRenderError,
    prewarmOnly,
    renderKey,
    request,
    selected,
    target,
    viewport,
  ]);

  if (!host) return null;

  const selectLayer = (clientX?: number, clientY?: number): void => {
    if (
      !selectable ||
      (clientX !== undefined && clientY !== undefined &&
        hitTest && !hitTest(clientX, clientY))
    ) return;
    dispatch({ layerId: asset.layerId, type: "layers.select" });
  };

  return (
    <div
      aria-hidden={prewarmOnly ? true : undefined}
      aria-label={!prewarmOnly && selectable ? `Select ${asset.fileName}` : undefined}
      className={[
        "absolute block overflow-hidden border bg-transparent",
        selected
          ? "border-[color:var(--link)] shadow-[0_0_0_1px_color-mix(in_oklab,var(--link)_48%,transparent)]"
          : "border-transparent",
      ].join(" ")}
      data-canvas-model-layer={prewarmOnly ? undefined : asset.layerId}
      data-canvas-model-orientation={
        orientation === undefined ? undefined : JSON.stringify(orientation)
      }
      data-canvas-model-phase={prewarmOnly ? undefined : phase}
      data-canvas-model-prewarm-target={prewarmOnly ? target : undefined}
      data-canvas-model-render-status={renderStatus}
      data-canvas-model-target={prewarmOnly ? undefined : target}
      data-toolcraft-model-orbit-surface={
        !prewarmOnly && interactionHandlers ? "true" : undefined
      }
      data-selected={selected ? "true" : "false"}
      onClick={!prewarmOnly && selectable
        ? (event) => selectLayer(event.clientX, event.clientY)
        : undefined}
      onKeyDown={!prewarmOnly && selectable
        ? (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              selectLayer();
            }
          }
        : undefined}
      ref={elementRef}
      role={!prewarmOnly && selectable ? "button" : undefined}
      style={{
        height: presentationRect.height,
        left: presentationRect.x,
        top: presentationRect.y,
        width: presentationRect.width,
      }}
      tabIndex={!prewarmOnly && selectable ? 0 : undefined}
      {...(prewarmOnly ? {} : interactionHandlers)}
    />
  );
}

export function getVisibleCanvasModelAssets(
  state: ToolcraftState,
): ToolcraftModelAsset[] {
  return getVisibleToolcraftModelAssets(state);
}

const selectLayers = (state: ToolcraftState) => state.layers;
const selectSelectedLayerId = (state: ToolcraftState) => state.selectedLayerId;
const emptySubscribe = () => () => {};

function ToolcraftModelTargetCanvasLayer({
  asset,
  canPrewarm,
  dispatch,
  observeOperation,
  operationSource,
  orientation,
  orientationTarget,
  selectedLayerId,
  target,
  visible,
}: {
  asset?: ToolcraftModelAsset;
  canPrewarm: boolean;
  dispatch: React.Dispatch<ToolcraftCommand>;
  observeOperation: boolean;
  operationSource?: ToolcraftModelOperationSource;
  orientation?: ReturnType<typeof readToolcraftOrientationPose>;
  orientationTarget?: string;
  selectedLayerId?: string | null;
  target: string;
  visible: boolean;
}): React.JSX.Element | null {
  const renderKey = target;
  const renderHost = useOptionalToolcraftModelRenderHost();
  const orbitEnabled =
    asset !== undefined && Boolean(orientationTarget) && renderHost !== null;
  const hitTest = React.useCallback(
    (clientX: number, clientY: number) =>
      renderHost?.hitTest(renderKey, { clientX, clientY }) ?? false,
    [renderHost, renderKey],
  );
  const interactionHandlers = useToolcraftModelOrbitInteraction<HTMLDivElement>({
    enabled: orbitEnabled,
    hitTest,
    target: orientationTarget ?? "",
  });
  const idleOperation = React.useMemo<ToolcraftSourceAssetOperation>(
    () => ({ phase: "idle", target }),
    [target],
  );
  const getOperation = React.useCallback(
    () => observeOperation && operationSource
      ? operationSource.getOperation(target)
      : idleOperation,
    [idleOperation, observeOperation, operationSource, target],
  );
  const operation = React.useSyncExternalStore(
    observeOperation && operationSource
      ? operationSource.subscribe
      : emptySubscribe,
    getOperation,
    getOperation,
  );

  if (!visible) return null;
  const stagedDocumentRef = operation.stagedDocumentRef;
  const renderableAsset = asset &&
    asset.lifecycle !== "restoring" &&
    asset.lifecycle !== "unavailable"
    ? asset
    : undefined;
  const prewarmOnly = canPrewarm && !stagedDocumentRef && !renderableAsset;
  if (!stagedDocumentRef && !renderableAsset && !prewarmOnly) return null;

  const canvasAsset: ToolcraftCanvasModelAsset = renderableAsset ?? {
    activeDocumentRef: stagedDocumentRef ?? "toolcraft:model-prewarm",
    fileName: "Model preview",
    id: `staged:${target}`,
    layerId: `staged:${target}`,
    lifecycle: "clean",
    sourceTarget: target,
  };
  const phase = operation.phase === "idle"
    ? canvasAsset.lifecycle
    : operation.phase;
  const presentationRect = getToolcraftSceneElementRect(
    renderableAsset ?? defaultToolcraftSceneElementFrame,
  );
  const presentationViewport = {
    height: presentationRect.height,
    width: presentationRect.width,
  };

  return (
    <ToolcraftModelCanvasLayer
      asset={canvasAsset}
      canonicalDocumentRef={stagedDocumentRef}
      dispatch={dispatch}
      hitTest={hitTest}
      interactionHandlers={orbitEnabled ? interactionHandlers : undefined}
      orientation={orientation}
      phase={phase}
      presentationRect={presentationRect}
      prewarmOnly={prewarmOnly}
      renderKey={renderKey}
      selectable={renderableAsset !== undefined}
      selected={
        renderableAsset !== undefined &&
        selectedLayerId === renderableAsset.layerId
      }
      target={target}
      viewport={presentationViewport}
    />
  );
}

function getConfiguredModelTargets(state: ToolcraftState): readonly string[] {
  return [
    ...new Set(
      (state.schema.panels.controls?.sections ?? [])
        .flatMap((section) => Object.values(section.controls))
        .filter(
          (control) =>
            control.type === "fileDrop" && control.assetKind === "model",
        )
        .map((control) => control.target),
    ),
  ];
}

export function ToolcraftModelCanvasLayers({
  dispatch,
  operationTargets = [],
  operationSource,
  suppressedTargets = [],
}: {
  dispatch: React.Dispatch<ToolcraftCommand>;
  operationTargets?: readonly string[];
  operationSource?: ToolcraftModelOperationSource;
  suppressedTargets?: readonly string[];
}): React.JSX.Element | null {
  const store = useToolcraftStore();
  const orientationSelection = useToolcraftOrientationControlSelection();
  const assets = useToolcraftCommittedSelector(
    selectToolcraftModelAssets,
    toolcraftModelAssetListsEqual,
  );
  const layers = useToolcraftCommittedSelector(selectLayers);
  const selectedLayerId = useToolcraftCommittedSelector(selectSelectedLayerId);
  const configuredTargets = React.useMemo(
    () => getConfiguredModelTargets(store.getCommittedState()),
    [store],
  );
  const targets = React.useMemo(() => {
    const byTarget = new Map<string, ToolcraftModelAsset | undefined>();
    for (const target of configuredTargets) byTarget.set(target, undefined);
    for (const target of operationTargets) byTarget.set(target, undefined);
    for (const asset of assets) {
      byTarget.set(asset.sourceTarget ?? asset.id, asset);
    }
    return [...byTarget]
      .filter(([target]) => !suppressedTargets.includes(target))
      .map(([target, asset]) => ({ asset, target }));
  }, [assets, configuredTargets, operationTargets, suppressedTargets]);

  if (targets.length === 0) return null;

  const orientation = orientationSelection.control
    ? readToolcraftOrientationPose(
        orientationSelection.value,
        readToolcraftOrientationPose(orientationSelection.control.defaultValue),
      )
    : undefined;

  return (
    <>
      {targets.map(({ asset, target }) => (
        <ToolcraftModelTargetCanvasLayer
          asset={asset}
          canPrewarm={configuredTargets.includes(target)}
          dispatch={dispatch}
          key={target}
          observeOperation={
            configuredTargets.includes(target) ||
            operationTargets.includes(target) ||
            asset?.sourceTarget !== undefined
          }
          operationSource={operationSource}
          orientation={orientation}
          orientationTarget={orientationSelection.control?.target}
          selectedLayerId={selectedLayerId}
          target={target}
          visible={
            asset === undefined ||
            isToolcraftLayerVisibleInTree(layers, asset.layerId)
          }
        />
      ))}
    </>
  );
}
