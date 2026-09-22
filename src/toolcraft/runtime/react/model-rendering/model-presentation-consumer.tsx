"use client";

import * as React from "react";

import type { ToolcraftSourceAssetFeedback } from "../../source-assets/source-asset-types";
import type {
  ToolcraftModelPresentationAcquirer,
  ToolcraftModelPresentationConsumerDeclaration,
} from "./model-render-binding";
import {
  TOOLCRAFT_MODEL_PRESENTATION_CONSUMER_MISSING_FEEDBACK,
  TOOLCRAFT_MODEL_PRESENTATION_UNAVAILABLE_FEEDBACK,
} from "./model-presentation-feedback";

export type ToolcraftModelPresentationConsumer = Readonly<{
  acquirePresentation: ToolcraftModelPresentationAcquirer;
  clearPresentationError(): void;
  reportPresentationError(): void;
}>;

export type ToolcraftModelPresentationConsumerRegistry = Readonly<{
  clearTarget(sourceTarget: string): void;
  consumerFor(
    declaration: ToolcraftModelPresentationConsumerDeclaration,
  ): ToolcraftModelPresentationConsumer;
  isMounted(id: string): boolean;
  register(
    declaration: ToolcraftModelPresentationConsumerDeclaration,
  ): () => void;
  reportMissing(sourceTarget: string): void;
  subscribe(listener: () => void): () => void;
  version(): number;
}>;

type CreateConsumerRegistryOptions = Readonly<{
  acquirePresentation: ToolcraftModelPresentationAcquirer;
  clearPresentationFeedback?: (sourceTarget: string) => void;
  declarations: readonly ToolcraftModelPresentationConsumerDeclaration[];
  reportPresentationFeedback?: (
    sourceTarget: string,
    feedback: ToolcraftSourceAssetFeedback,
  ) => void;
  visibleOrientationTarget?: string;
}>;

function declarationsEqual(
  left: ToolcraftModelPresentationConsumerDeclaration,
  right: ToolcraftModelPresentationConsumerDeclaration,
): boolean {
  return left.id === right.id &&
    left.orientationTarget === right.orientationTarget &&
    left.sourceTarget === right.sourceTarget;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function createToolcraftModelPresentationConsumerRegistry({
  acquirePresentation,
  clearPresentationFeedback = () => undefined,
  declarations,
  reportPresentationFeedback = () => undefined,
  visibleOrientationTarget,
}: CreateConsumerRegistryOptions): ToolcraftModelPresentationConsumerRegistry {
  const byId = new Map(declarations.map((entry) => [entry.id, entry] as const));
  const consumers = new Map<string, ToolcraftModelPresentationConsumer>();
  const listeners = new Set<() => void>();
  const mounted = new Set<string>();
  let currentVersion = 0;

  const resolveDeclaration = (
    requested: ToolcraftModelPresentationConsumerDeclaration,
  ): ToolcraftModelPresentationConsumerDeclaration => {
    const declared = byId.get(requested.id);
    if (!declared || !declarationsEqual(declared, requested)) {
      throw new Error(
        `Model presentation consumer "${requested.id}" does not match the app composition declaration.`,
      );
    }
    if (
      declared.orientationTarget !== undefined &&
      declared.orientationTarget !== visibleOrientationTarget
    ) {
      throw new Error(
        `Model presentation consumer "${requested.id}" orientation target must match the visible orientationGizmo.`,
      );
    }
    return declared;
  };
  const publish = (): void => {
    currentVersion += 1;
    for (const listener of listeners) listener();
  };
  const reportUnavailable = (sourceTarget: string): void => {
    reportPresentationFeedback(
      sourceTarget,
      TOOLCRAFT_MODEL_PRESENTATION_UNAVAILABLE_FEEDBACK,
    );
  };

  return Object.freeze({
    clearTarget: clearPresentationFeedback,
    consumerFor: (requested) => {
      const declaration = resolveDeclaration(requested);
      const current = consumers.get(declaration.id);
      if (current) return current;
      const consumer: ToolcraftModelPresentationConsumer = Object.freeze({
        acquirePresentation: async (ref, options) => {
          try {
            const lease = await acquirePresentation(ref, options);
            clearPresentationFeedback(declaration.sourceTarget);
            return lease;
          } catch (error) {
            if (!isAbortError(error)) {
              reportUnavailable(declaration.sourceTarget);
            }
            throw error;
          }
        },
        clearPresentationError: () => {
          clearPresentationFeedback(declaration.sourceTarget);
        },
        reportPresentationError: () => {
          reportUnavailable(declaration.sourceTarget);
        },
      });
      consumers.set(declaration.id, consumer);
      return consumer;
    },
    isMounted: (id) => mounted.has(id),
    register: (requested) => {
      const declaration = resolveDeclaration(requested);
      if (mounted.has(declaration.id)) {
        throw new Error(
          `Model presentation consumer "${declaration.id}" is mounted more than once.`,
        );
      }
      mounted.add(declaration.id);
      clearPresentationFeedback(declaration.sourceTarget);
      publish();
      let registered = true;
      return () => {
        if (!registered) return;
        registered = false;
        mounted.delete(declaration.id);
        publish();
      };
    },
    reportMissing: (sourceTarget) => {
      reportPresentationFeedback(
        sourceTarget,
        TOOLCRAFT_MODEL_PRESENTATION_CONSUMER_MISSING_FEEDBACK,
      );
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: () => currentVersion,
  });
}

export const ToolcraftModelPresentationConsumerRegistryContext =
  React.createContext<ToolcraftModelPresentationConsumerRegistry | null>(null);

export function useToolcraftModelPresentationConsumer(
  declaration: ToolcraftModelPresentationConsumerDeclaration,
): ToolcraftModelPresentationConsumer {
  const registry = React.useContext(
    ToolcraftModelPresentationConsumerRegistryContext,
  );
  if (!registry) {
    throw new Error(
      "useToolcraftModelPresentationConsumer must be used inside ToolcraftRoot.",
    );
  }
  const consumer = registry.consumerFor(declaration);
  React.useEffect(
    () => registry.register(declaration),
    [
      declaration.id,
      declaration.orientationTarget,
      declaration.sourceTarget,
      registry,
    ],
  );
  return consumer;
}
