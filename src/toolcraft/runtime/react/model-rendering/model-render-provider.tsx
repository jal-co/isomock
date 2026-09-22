"use client";

import * as React from "react";

import type { ToolcraftSourceAssetFeedback } from "../../source-assets/source-asset-types";
import { createToolcraftLazyThreeModelRenderBinding } from "./lazy-three-model-render-binding";
import {
  createToolcraftModelPresentationConsumerRegistry,
  ToolcraftModelPresentationConsumerRegistryContext,
} from "./model-presentation-consumer";
import type {
  ToolcraftModelPresentationConsumerDeclaration,
  ToolcraftModelRenderBinding,
  ToolcraftModelRenderBindingMap,
  ToolcraftModelRenderHost,
  ToolcraftModelRenderPreparationStatus,
  ToolcraftModelResourceResolver,
} from "./model-render-binding";
import { createToolcraftModelRenderHost } from "./model-render-host";
import { createToolcraftModelRenderRegistry } from "./model-render-registry";

const ToolcraftModelRenderContext =
  React.createContext<ToolcraftModelRenderHost | null>(null);

const EMPTY_CUSTOM_CONSUMERS = Object.freeze(
  [] as ToolcraftModelPresentationConsumerDeclaration[],
);
const EMPTY_CUSTOM_TARGETS = Object.freeze([] as string[]);

export function ToolcraftModelRenderProvider({
  activeCustomTargets = EMPTY_CUSTOM_TARGETS,
  bindings,
  children,
  clearPresentationFeedback,
  customConsumers = EMPTY_CUSTOM_CONSUMERS,
  reportPresentationFeedback,
  resolveResource,
  retainResourceRef,
  standardBinding,
  visibleOrientationTarget,
}: {
  activeCustomTargets?: readonly string[];
  bindings?: ToolcraftModelRenderBindingMap;
  children: React.ReactNode;
  clearPresentationFeedback?: (sourceTarget: string) => void;
  customConsumers?: readonly ToolcraftModelPresentationConsumerDeclaration[];
  reportPresentationFeedback?: (
    sourceTarget: string,
    feedback: ToolcraftSourceAssetFeedback,
  ) => void;
  resolveResource: ToolcraftModelResourceResolver;
  retainResourceRef?: (ref: string) => () => void;
  standardBinding?: ToolcraftModelRenderBinding<unknown>;
  visibleOrientationTarget?: string;
}): React.JSX.Element {
  const lifecycleGenerationsRef = React.useRef(
    new WeakMap<ToolcraftModelRenderHost, number>(),
  );
  const resolvedStandardBinding = React.useMemo(
    () => standardBinding ?? createToolcraftLazyThreeModelRenderBinding(),
    [standardBinding],
  );
  const registry = React.useMemo(
    () => createToolcraftModelRenderRegistry({
      ...(bindings ? { bindings } : {}),
      standardBinding: resolvedStandardBinding,
    }),
    [bindings, resolvedStandardBinding],
  );
  const host = React.useMemo(
    () => createToolcraftModelRenderHost(
      registry,
      resolveResource,
      {
        clear: clearPresentationFeedback ?? (() => undefined),
        report: reportPresentationFeedback ?? (() => undefined),
      },
      retainResourceRef,
    ),
    [
      clearPresentationFeedback,
      registry,
      reportPresentationFeedback,
      resolveResource,
      retainResourceRef,
    ],
  );
  const consumerRegistry = React.useMemo(
    () => createToolcraftModelPresentationConsumerRegistry({
      acquirePresentation: host.acquirePresentation,
      ...(clearPresentationFeedback ? { clearPresentationFeedback } : {}),
      declarations: customConsumers,
      ...(reportPresentationFeedback ? { reportPresentationFeedback } : {}),
      ...(visibleOrientationTarget ? { visibleOrientationTarget } : {}),
    }),
    [
      clearPresentationFeedback,
      customConsumers,
      host.acquirePresentation,
      reportPresentationFeedback,
      visibleOrientationTarget,
    ],
  );
  const consumerRegistryVersion = React.useSyncExternalStore(
    consumerRegistry.subscribe,
    consumerRegistry.version,
    consumerRegistry.version,
  );

  React.useEffect(() => {
    const activeTargets = new Set(activeCustomTargets);
    for (const declaration of customConsumers) {
      if (!activeTargets.has(declaration.sourceTarget)) {
        consumerRegistry.clearTarget(declaration.sourceTarget);
      } else if (!consumerRegistry.isMounted(declaration.id)) {
        consumerRegistry.reportMissing(declaration.sourceTarget);
      }
    }
  }, [
    activeCustomTargets,
    consumerRegistry,
    consumerRegistryVersion,
    customConsumers,
  ]);

  React.useEffect(() => {
    const generations = lifecycleGenerationsRef.current;
    const generation = (generations.get(host) ?? 0) + 1;
    generations.set(host, generation);

    return () => {
      queueMicrotask(() => {
        if (generations.get(host) !== generation) return;
        generations.delete(host);
        host.dispose();
      });
    };
  }, [host]);

  return (
    <ToolcraftModelRenderContext.Provider value={host}>
      <ToolcraftModelPresentationConsumerRegistryContext.Provider
        value={consumerRegistry}
      >
        {children}
      </ToolcraftModelPresentationConsumerRegistryContext.Provider>
    </ToolcraftModelRenderContext.Provider>
  );
}

export function useOptionalToolcraftModelRenderHost(): ToolcraftModelRenderHost | null {
  return React.useContext(ToolcraftModelRenderContext);
}

export function useToolcraftModelRenderHost(): ToolcraftModelRenderHost {
  const host = useOptionalToolcraftModelRenderHost();
  if (!host) {
    throw new Error(
      "useToolcraftModelRenderHost must be used inside ToolcraftModelRenderProvider.",
    );
  }
  return host;
}

export function useToolcraftModelRenderPreparationStatus(): ToolcraftModelRenderPreparationStatus {
  const host = useToolcraftModelRenderHost();
  return React.useSyncExternalStore(
    host.subscribePreparation,
    host.getPreparationStatus,
    host.getPreparationStatus,
  );
}
