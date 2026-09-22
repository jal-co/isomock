import type { ResolvedToolcraftAppSchema } from "../../schema/resolved-app-schema";
import { resolveToolcraftModelPresentationMode } from "../model-rendering/model-presentation-mode";
import type { ToolcraftAppComposition } from "./toolcraft-app";
import {
  createToolcraftAppPortsSnapshot,
  readToolcraftAppModelPresentationPort,
  type ToolcraftAppPorts,
} from "./toolcraft-app-ports";
import { assertToolcraftAppModulePorts } from "./toolcraft-app-port-validation";
import {
  assertToolcraftProductSceneExportCoverage,
  resolveToolcraftProductSceneRequirement,
} from "./product-scene-requirement";

export function composeToolcraftApp(
  schema: ResolvedToolcraftAppSchema,
  ports: ToolcraftAppPorts,
): ToolcraftAppComposition {
  const modelPresentation = readToolcraftAppModelPresentationPort(ports);
  const resolvedModelPresentation = resolveToolcraftModelPresentationMode(
    schema,
    modelPresentation,
  );
  const portSnapshot = createToolcraftAppPortsSnapshot(
    ports,
    resolvedModelPresentation.mode === "custom"
      ? resolvedModelPresentation
      : undefined,
  );
  const sceneRequirement = resolveToolcraftProductSceneRequirement({
    canvasContent: portSnapshot.scene?.canvasContent,
    modelPresentation: resolvedModelPresentation,
    rendererPipelineRegistration: portSnapshot.renderer?.pipelineRegistration,
  });
  assertToolcraftAppModulePorts({
    modelPresentation: resolvedModelPresentation,
    ports: portSnapshot,
    sceneRequirement,
    schema,
  });
  assertToolcraftProductSceneExportCoverage({
    exportRenderer: portSnapshot.scene?.rasterFrameRenderer,
    productSceneRequired: sceneRequirement.productSceneRequired,
    schema,
    svgExportRenderer: portSnapshot.scene?.vectorFrameRenderer,
  });

  return Object.freeze({
    ...(portSnapshot.scene?.canvasContent === undefined
      ? {}
      : { canvasContent: portSnapshot.scene.canvasContent }),
    ...(portSnapshot.controls?.renderers === undefined
      ? {}
      : { controlRenderers: portSnapshot.controls.renderers }),
    ...(portSnapshot.scene?.rasterFrameRenderer === undefined
      ? {}
      : { exportRenderer: portSnapshot.scene.rasterFrameRenderer }),
    ...(portSnapshot.scene?.infiniteCanvasContent === undefined
      ? {}
      : { infiniteCanvasContent: portSnapshot.scene.infiniteCanvasContent }),
    modelPresentation: resolvedModelPresentation,
    ...(portSnapshot.actions?.onPanelAction === undefined
      ? {}
      : { onPanelAction: portSnapshot.actions.onPanelAction }),
    renderDefaultCanvasMedia:
      portSnapshot.scene?.renderDefaultCanvasMedia ?? true,
    ...(portSnapshot.renderer?.pipelineRegistration === undefined
      ? {}
      : {
          rendererPipelineRegistration:
            portSnapshot.renderer.pipelineRegistration,
        }),
    ...(portSnapshot.scene?.sceneBoundsProvider === undefined
      ? {}
      : { sceneBoundsProvider: portSnapshot.scene.sceneBoundsProvider }),
    schema,
    ...(portSnapshot.scene?.vectorFrameRenderer === undefined
      ? {}
      : { svgExportRenderer: portSnapshot.scene.vectorFrameRenderer }),
  });
}
