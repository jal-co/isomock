import type * as React from "react";

import type { ToolcraftProductExportRenderer } from "../../export/product-export-renderer";
import type { ToolcraftProductSvgExportRenderer } from "../../export/product-svg-export-renderer";
import type { ToolcraftProductIntegrationPortId } from "../../modules/contract/integration-port";
import type { AnyToolcraftRendererPipelineRegistration } from "../../rendering";
import type { ToolcraftProductSceneBoundsProvider } from "../../scene";
import type { ToolcraftControlRendererMap } from "../controls-panel/control-renderers";
import type { ToolcraftPanelActionHandler } from "../controls-panel/controls-panel";
import type { ToolcraftModelPresentationMode } from "../model-rendering/model-render-binding";
import { hasToolcraftProductSceneContent } from "./product-scene-requirement";

type ToolcraftAppModelPresentationPort = Extract<
  ToolcraftModelPresentationMode,
  Readonly<{ mode: "custom" }>
>;

type ToolcraftReadonlySetLike<T> = Readonly<{
  has(value: T): boolean;
  keys(): Iterator<T>;
  size: number;
}>;

function forEachToolcraftSetLikeValue<T>(
  values: ToolcraftReadonlySetLike<T>,
  visit: (value: T) => void,
): void {
  const iterator = values.keys();
  for (let step = iterator.next(); !step.done; step = iterator.next()) {
    visit(step.value);
  }
}

export type ToolcraftAppScenePorts = Readonly<{
  canvasContent?: React.ReactNode;
  infiniteCanvasContent?: React.ReactNode;
  rasterFrameRenderer?: ToolcraftProductExportRenderer;
  renderDefaultCanvasMedia?: boolean;
  sceneBoundsProvider?: ToolcraftProductSceneBoundsProvider;
  vectorFrameRenderer?: ToolcraftProductSvgExportRenderer;
}>;

export type ToolcraftAppPorts = Readonly<{
  actions?: Readonly<{ onPanelAction?: ToolcraftPanelActionHandler }>;
  controls?: Readonly<{ renderers?: ToolcraftControlRendererMap }>;
  modelPresentation?: ToolcraftAppModelPresentationPort;
  renderer?: Readonly<{
    pipelineRegistration?: AnyToolcraftRendererPipelineRegistration;
  }>;
  scene?: ToolcraftAppScenePorts;
}>;

export function readToolcraftAppModelPresentationPort(
  ports: ToolcraftAppPorts,
): ToolcraftAppModelPresentationPort | undefined {
  const modelPresentation: Readonly<{ mode?: unknown }> | undefined =
    ports.modelPresentation;
  if (modelPresentation !== undefined && modelPresentation.mode !== "custom") {
    throw new Error(
      'Toolcraft app port "modelPresentation" is invalid; runtime presentation is the omission/default and only custom presentation may be authored.',
    );
  }
  return modelPresentation as ToolcraftAppModelPresentationPort | undefined;
}

const integrationPortPresenceById = Object.freeze({
  modelPresentation: (ports: ToolcraftAppPorts) =>
    ports.modelPresentation?.mode === "custom",
  "scene.canvasContent": (ports: ToolcraftAppPorts) =>
    hasToolcraftProductSceneContent(ports.scene?.canvasContent),
  "scene.rasterFrameRenderer": (ports: ToolcraftAppPorts) =>
    ports.scene?.rasterFrameRenderer !== undefined,
  "scene.vectorFrameRenderer": (ports: ToolcraftAppPorts) =>
    ports.scene?.vectorFrameRenderer !== undefined,
} satisfies Readonly<
  Record<
    ToolcraftProductIntegrationPortId,
    (ports: ToolcraftAppPorts) => boolean
  >
>);

function snapshotRasterRenderer(
  renderer: ToolcraftProductExportRenderer | undefined,
): ToolcraftProductExportRenderer | undefined {
  return renderer === undefined
    ? undefined
    : Object.freeze({
        baseFileName: renderer.baseFileName,
        getContentBounds: renderer.getContentBounds,
        renderFrame: renderer.renderFrame,
      });
}

function snapshotVectorRenderer(
  renderer: ToolcraftProductSvgExportRenderer | undefined,
): ToolcraftProductSvgExportRenderer | undefined {
  return renderer === undefined
    ? undefined
    : Object.freeze({
        baseFileName: renderer.baseFileName,
        getContentBounds: renderer.getContentBounds,
        renderFrame: renderer.renderFrame,
      });
}

function snapshotReactNode(
  node: React.ReactNode,
  ancestors = new WeakSet<object>(),
): React.ReactNode {
  const isIterableContainer =
    node !== null &&
    typeof node === "object" &&
    Symbol.iterator in node &&
    typeof node[Symbol.iterator] === "function";
  if (!Array.isArray(node) && !isIterableContainer) return node;
  const container = node as Iterable<React.ReactNode>;
  if (ancestors.has(container)) {
    throw new Error("Toolcraft app ReactNode containers cannot be cyclic.");
  }
  ancestors.add(container);
  const snapshot = Array.from(container, (child) =>
    snapshotReactNode(child, ancestors),
  );
  ancestors.delete(container);
  return Object.freeze(snapshot);
}

export function createToolcraftAppPortsSnapshot(
  ports: ToolcraftAppPorts,
  resolvedModelPresentation: ToolcraftAppModelPresentationPort | undefined,
): ToolcraftAppPorts {
  const scene = ports.scene;
  return Object.freeze({
    ...(ports.actions === undefined
      ? {}
      : {
          actions: Object.freeze({
            ...(ports.actions.onPanelAction === undefined
              ? {}
              : { onPanelAction: ports.actions.onPanelAction }),
          }),
        }),
    ...(ports.controls === undefined
      ? {}
      : {
          controls: Object.freeze({
            ...(ports.controls.renderers === undefined
              ? {}
              : {
                  renderers: Object.freeze({ ...ports.controls.renderers }),
                }),
          }),
        }),
    ...(resolvedModelPresentation === undefined
      ? {}
      : { modelPresentation: resolvedModelPresentation }),
    ...(ports.renderer === undefined
      ? {}
      : {
          renderer: Object.freeze({
            ...(ports.renderer.pipelineRegistration === undefined
              ? {}
              : {
                  pipelineRegistration: ports.renderer.pipelineRegistration,
                }),
          }),
        }),
    ...(scene === undefined
      ? {}
      : {
          scene: Object.freeze({
            ...(scene.canvasContent === undefined
              ? {}
              : { canvasContent: snapshotReactNode(scene.canvasContent) }),
            ...(scene.infiniteCanvasContent === undefined
              ? {}
              : {
                  infiniteCanvasContent: snapshotReactNode(
                    scene.infiniteCanvasContent,
                  ),
                }),
            ...(scene.rasterFrameRenderer === undefined
              ? {}
              : {
                  rasterFrameRenderer: snapshotRasterRenderer(
                    scene.rasterFrameRenderer,
                  ),
                }),
            ...(scene.renderDefaultCanvasMedia === undefined
              ? {}
              : {
                  renderDefaultCanvasMedia: scene.renderDefaultCanvasMedia,
                }),
            ...(scene.sceneBoundsProvider === undefined
              ? {}
              : { sceneBoundsProvider: scene.sceneBoundsProvider }),
            ...(scene.vectorFrameRenderer === undefined
              ? {}
              : {
                  vectorFrameRenderer: snapshotVectorRenderer(
                    scene.vectorFrameRenderer,
                  ),
                }),
          }),
        }),
  });
}

export function getToolcraftProvidedIntegrationPortIds(
  ports: ToolcraftAppPorts,
): ReadonlySet<ToolcraftProductIntegrationPortId> {
  const ids = Object.entries(integrationPortPresenceById)
    .filter(([, isPresent]) => isPresent(ports))
    .map(([id]) => id as ToolcraftProductIntegrationPortId);
  const values = new Set(ids);
  let snapshot: ReadonlySet<ToolcraftProductIntegrationPortId>;
  snapshot = Object.freeze({
    [Symbol.iterator]: () => values.values(),
    [Symbol.toStringTag]: "Set",
    difference: <U>(other: ToolcraftReadonlySetLike<U>) => {
      const result = new Set<ToolcraftProductIntegrationPortId>();
      for (const value of values) {
        if (!other.has(value as unknown as U)) result.add(value);
      }
      return result;
    },
    entries: () => values.entries(),
    forEach: (
      callback: (
        value: ToolcraftProductIntegrationPortId,
        valueAgain: ToolcraftProductIntegrationPortId,
        set: ReadonlySet<ToolcraftProductIntegrationPortId>,
      ) => void,
      thisArg?: unknown,
    ) => {
      for (const value of values) {
        callback.call(thisArg, value, value, snapshot);
      }
    },
    has: (id: ToolcraftProductIntegrationPortId) => values.has(id),
    intersection: <U>(other: ToolcraftReadonlySetLike<U>) => {
      const result = new Set<ToolcraftProductIntegrationPortId & U>();
      for (const value of values) {
        if (other.has(value as unknown as U)) {
          result.add(value as ToolcraftProductIntegrationPortId & U);
        }
      }
      return result;
    },
    isDisjointFrom: (other: ToolcraftReadonlySetLike<unknown>) => {
      let isDisjoint = true;
      forEachToolcraftSetLikeValue(other, (value) => {
        if (values.has(value as ToolcraftProductIntegrationPortId)) {
          isDisjoint = false;
        }
      });
      return isDisjoint;
    },
    isSubsetOf: (other: ToolcraftReadonlySetLike<unknown>) => {
      for (const value of values) {
        if (!other.has(value)) return false;
      }
      return true;
    },
    isSupersetOf: (other: ToolcraftReadonlySetLike<unknown>) => {
      let isSuperset = true;
      forEachToolcraftSetLikeValue(other, (value) => {
        if (!values.has(value as ToolcraftProductIntegrationPortId)) {
          isSuperset = false;
        }
      });
      return isSuperset;
    },
    keys: () => values.keys(),
    get size() {
      return values.size;
    },
    symmetricDifference: <U>(other: ToolcraftReadonlySetLike<U>) => {
      const result = new Set<ToolcraftProductIntegrationPortId | U>(values);
      forEachToolcraftSetLikeValue(other, (value) => {
        if (values.has(value as ToolcraftProductIntegrationPortId)) {
          result.delete(value);
        } else {
          result.add(value);
        }
      });
      return result;
    },
    union: <U>(other: ToolcraftReadonlySetLike<U>) => {
      const result = new Set<ToolcraftProductIntegrationPortId | U>(values);
      forEachToolcraftSetLikeValue(other, (value) => result.add(value));
      return result;
    },
    values: () => values.values(),
  });
  return snapshot;
}
