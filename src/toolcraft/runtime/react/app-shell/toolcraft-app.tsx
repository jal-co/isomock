"use client";

import * as React from "react";

import type { ResolvedToolcraftAppSchema } from "../../schema/resolved-app-schema";
import type { AnyToolcraftRendererPipelineRegistration } from "../../rendering";
import {
  createToolcraftRuntimeSceneVisibility,
  type ToolcraftProductSceneBoundsProvider,
} from "../../scene";
import type { ToolcraftState } from "../../state/types";
import type { ToolcraftProductExportRenderer } from "../../export/product-export-renderer";
import type { ToolcraftProductSvgExportRenderer } from "../../export/product-svg-export-renderer";
import { CanvasShell } from "../canvas/canvas-shell";
import { ToolcraftProductSceneBoundsBoundary } from "../canvas/product-scene-surface";
import {
  ControlsPanel,
  type ToolcraftPanelActionHandler,
} from "../controls-panel/controls-panel";
import type { ToolcraftControlRendererMap } from "../controls-panel/control-renderers";
import type { ToolcraftControlsSceneExport } from "../controls-panel/actions/controls-panel-actions";
import { ToolcraftRoot } from "./toolcraft-root";
import { resolveToolcraftModulePanels } from "../composition/react-module-catalog";
import { useToolcraftModelRenderPreparationStatus } from "../model-rendering/model-render-provider";
import { ToolbarPanel } from "./toolbar-panel";
import { useToolcraftCommittedSelector } from "./toolcraft-selectors";
import type { ToolcraftModelPresentationMode } from "../model-rendering/model-render-binding";
import { resolveToolcraftModelPresentationMode } from "../model-rendering/model-presentation-mode";
import {
  assertToolcraftProductSceneExportCoverage,
  resolveToolcraftProductSceneRequirement,
} from "./product-scene-requirement";
import { assertToolcraftAppModulePorts } from "./toolcraft-app-port-validation";
import { useToolcraftPersistenceStatus } from "./use-toolcraft-persistence";
import { ToolcraftPersistenceConflictNotice } from "./toolcraft-persistence-conflict-notice";

export type ToolcraftAppComposition = Readonly<{
  canvasContent?: React.ReactNode;
  controlRenderers?: ToolcraftControlRendererMap;
  exportRenderer?: ToolcraftProductExportRenderer;
  infiniteCanvasContent?: React.ReactNode;
  modelPresentation?: ToolcraftModelPresentationMode;
  onPanelAction?: ToolcraftPanelActionHandler;
  renderDefaultCanvasMedia?: boolean;
  rendererPipelineRegistration?: AnyToolcraftRendererPipelineRegistration;
  sceneBoundsProvider?: ToolcraftProductSceneBoundsProvider;
  schema: ResolvedToolcraftAppSchema;
  svgExportRenderer?: ToolcraftProductSvgExportRenderer;
}>;

export type ToolcraftAppProps = Readonly<
  ToolcraftAppComposition & {
    className?: string;
    style?: React.CSSProperties;
  }
>;

const toolcraftMinAppWidthPx = 1024;

const selectAppSurfaces = (state: ToolcraftState) =>
  state.schema.assembly.surfaces;

function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

function ToolcraftAppContent({
  canvasContent,
  className,
  controlRenderers,
  infiniteCanvasContent,
  onPanelAction,
  renderDefaultCanvasMedia = true,
  sceneExport,
  style,
}: Omit<
  ToolcraftAppProps,
  | "modelPresentation"
  | "rendererPipelineRegistration"
  | "sceneBoundsProvider"
  | "schema"
> &
  Readonly<{ sceneExport: ToolcraftControlsSceneExport }>): React.JSX.Element {
  const surfaces = useToolcraftCommittedSelector(selectAppSurfaces);
  const modulePanels = resolveToolcraftModulePanels(surfaces);
  const modelRendererStatus = useToolcraftModelRenderPreparationStatus();
  const persistenceStatus = useToolcraftPersistenceStatus();

  const controlsPanel = surfaces.panels.controls?.enabled ? (
    <ControlsPanel controlRenderers={controlRenderers} onPanelAction={onPanelAction}
      panelPlacement="floating" sceneExport={sceneExport} />
  ) : null;

  return (
    <div
      className={cn(
        "relative min-h-[640px] w-full overflow-hidden bg-[color:var(--background)]",
        className,
      )}
      data-slot="toolcraft-runtime-app"
      data-toolcraft-model-renderer-status={modelRendererStatus}
      data-toolcraft-persistence-failure-reason={
        persistenceStatus.status === "failed"
          ? persistenceStatus.reason
          : undefined
      }
      data-toolcraft-persistence-status={persistenceStatus.status}
      style={{
        ...style,
        minWidth: toolcraftMinAppWidthPx,
      }}
    >
      {surfaces.canvas.enabled ? (
        <CanvasShell
          infiniteCanvasContent={infiniteCanvasContent}
          renderDefaultMedia={renderDefaultCanvasMedia}
        >
          {canvasContent}
        </CanvasShell>
      ) : null}
      {modulePanels.filter(({ binding }) => binding.slot === "before-controls")
        .map(panel => <React.Fragment key={panel.moduleId}>{panel.binding.render()}</React.Fragment>)}
      {controlsPanel}
      {modulePanels.filter(({ binding }) => binding.slot === "after-controls")
        .map(panel => <React.Fragment key={panel.moduleId}>{panel.binding.render()}</React.Fragment>)}
      {surfaces.panels.toolbar.enabled ? (
        <ToolbarPanel panelPlacement="floating" />
      ) : null}
      <ToolcraftPersistenceConflictNotice />
    </div>
  );
}

export function ToolcraftApp({
  canvasContent,
  exportRenderer,
  modelPresentation,
  renderDefaultCanvasMedia = true,
  rendererPipelineRegistration,
  sceneBoundsProvider,
  schema,
  svgExportRenderer,
  ...props
}: ToolcraftAppProps): React.JSX.Element {
  const resolvedModelPresentation = resolveToolcraftModelPresentationMode(
    schema,
    modelPresentation,
  );
  const sceneRequirement = resolveToolcraftProductSceneRequirement({
    canvasContent,
    modelPresentation: resolvedModelPresentation,
    rendererPipelineRegistration,
  });
  assertToolcraftAppModulePorts({
    modelPresentation: resolvedModelPresentation,
    ports: {
      ...(props.controlRenderers === undefined
        ? {}
        : {
            controls: { renderers: props.controlRenderers },
          }),
      ...(props.onPanelAction === undefined
        ? {}
        : { actions: { onPanelAction: props.onPanelAction } }),
      ...(rendererPipelineRegistration === undefined
        ? {}
        : { renderer: { pipelineRegistration: rendererPipelineRegistration } }),
      scene: {
        canvasContent,
        rasterFrameRenderer: exportRenderer,
        renderDefaultCanvasMedia,
        sceneBoundsProvider,
        vectorFrameRenderer: svgExportRenderer,
      },
    },
    sceneRequirement,
    schema,
  });
  assertToolcraftProductSceneExportCoverage({
    exportRenderer,
    productSceneRequired: sceneRequirement.productSceneRequired,
    schema,
    svgExportRenderer,
  });
  const sceneExport: ToolcraftControlsSceneExport = Object.freeze({
    ...(sceneBoundsProvider ? { boundsProvider: sceneBoundsProvider } : {}),
    ...(exportRenderer ? { exportRenderer } : {}),
    ...(svgExportRenderer ? { svgExportRenderer } : {}),
    visibility: createToolcraftRuntimeSceneVisibility({
      renderDefaultImages: renderDefaultCanvasMedia,
      suppressedModelTargets: sceneRequirement.suppressedModelTargets,
    }),
  });

  return (
    <ToolcraftRoot
      modelPresentation={resolvedModelPresentation}
      rendererPipelineRegistration={rendererPipelineRegistration}
      schema={schema}
    >
      <ToolcraftProductSceneBoundsBoundary boundsProvider={sceneBoundsProvider}>
        <ToolcraftAppContent
          {...props}
          canvasContent={canvasContent}
          renderDefaultCanvasMedia={renderDefaultCanvasMedia}
          sceneExport={sceneExport}
        />
      </ToolcraftProductSceneBoundsBoundary>
    </ToolcraftRoot>
  );
}
