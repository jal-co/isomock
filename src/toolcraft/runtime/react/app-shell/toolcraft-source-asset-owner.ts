import type { ToolcraftBinaryAssetRepository } from "../../source-assets/repository/binary-asset-repository";
import { withToolcraftDefaultResources } from "../../source-assets/default-resource-repository";
import { createIndexedDbToolcraftBinaryAssetRepository } from "../../source-assets/repository/indexeddb-binary-asset-repository";
import { createMemoryToolcraftBinaryAssetRepository } from "../../source-assets/repository/memory-binary-asset-repository";
import { createUnavailableToolcraftBinaryAssetRepository } from "../../source-assets/repository/unavailable-binary-asset-repository";
import {
  createToolcraftSourceAssetCoordinator,
  type ToolcraftSourceAssetCoordinator,
} from "../../composition/source-asset-coordinator";
import {
  createToolcraftSourceAssetPresentationResources,
  type ToolcraftSourceAssetPresentationResources,
} from "../../source-assets/source-asset-presentation-resources";
import type { ToolcraftExternalStore } from "../../state/toolcraft-external-store";
import { readToolcraftPersistedResourceRefs } from "../../state/persistence-resource-refs";

type ToolcraftSourceAssetCoordinatorFactory = (
  store: ToolcraftExternalStore,
) => ToolcraftSourceAssetCoordinator;

type ToolcraftSourceAssetCoordinatorDecorator = (
  coordinator: ToolcraftSourceAssetCoordinator,
  store: ToolcraftExternalStore,
) => ToolcraftSourceAssetCoordinator;

type ToolcraftSourceAssetOwner = {
  coordinator: ToolcraftSourceAssetCoordinator;
  leases: number;
  lifecycle: "active" | "disposing" | "failed";
  lifecycleGeneration: number;
  onError: (error: unknown) => void;
  presentationResources: ToolcraftSourceAssetPresentationResources | null;
  store: ToolcraftExternalStore;
};

type ToolcraftSourceAssetOwnerLease = Readonly<{
  coordinator: ToolcraftSourceAssetCoordinator;
  presentationResources: ToolcraftSourceAssetPresentationResources | null;
  release: () => void;
  reportError: (error: unknown) => void;
  retain: () => () => void;
}>;

const sourceAssetOwners = new WeakMap<
  ToolcraftExternalStore,
  ToolcraftSourceAssetOwner
>();

function createRepository(): ToolcraftBinaryAssetRepository {
  const collectionOptions = {
    getPersistedResourceRefs: () => readToolcraftPersistedResourceRefs(() => window.localStorage),
  };
  if (typeof globalThis.indexedDB === "undefined") {
    return typeof navigator !== "undefined" &&
      navigator.userAgent.toLowerCase().includes("jsdom")
      ? createMemoryToolcraftBinaryAssetRepository(collectionOptions)
      : createUnavailableToolcraftBinaryAssetRepository();
  }

  try {
    return createIndexedDbToolcraftBinaryAssetRepository(collectionOptions);
  } catch {
    return createUnavailableToolcraftBinaryAssetRepository();
  }
}

function createDefaultCoordinator(
  store: ToolcraftExternalStore,
): ToolcraftSourceAssetCoordinator {
  return createToolcraftSourceAssetCoordinator({
    dispatch: store.dispatch,
    getState: store.getCommittedState,
    repository: withToolcraftDefaultResources(createRepository(), store.getCommittedState().schema.sourceDefaults?.resources ?? []),
  });
}

function reportSourceAssetOwnerError(error: unknown): void {
  const globalReportError = globalThis.reportError;
  if (typeof globalReportError === "function") {
    try {
      globalReportError(error);
      return;
    } catch (reportingFailure) {
      console.error(
        "Toolcraft source asset owner error reporting failed.",
        new AggregateError(
          [error, reportingFailure],
          "Toolcraft source asset owner operation and reporting both failed.",
        ),
      );
      return;
    }
  }
  console.error("Toolcraft source asset owner operation failed.", error);
}

function reportOwnerError(
  owner: ToolcraftSourceAssetOwner,
  error: unknown,
): void {
  try {
    owner.onError(error);
  } catch (reportingFailure) {
    reportSourceAssetOwnerError(
      new AggregateError(
        [error, reportingFailure],
        "Toolcraft source asset owner operation and its injected reporter both failed.",
      ),
    );
  }
}

function createOwner(
  store: ToolcraftExternalStore,
  createCoordinator: ToolcraftSourceAssetCoordinatorFactory,
  decorateCoordinator: ToolcraftSourceAssetCoordinatorDecorator | undefined,
  onError: (error: unknown) => void,
): ToolcraftSourceAssetOwner {
  const baseCoordinator = createCoordinator(store);
  const resolveResource = baseCoordinator.resolveResource;
  if (resolveResource) {
    baseCoordinator.resolveResource = resolveResource.bind(baseCoordinator);
  }
  const coordinator = decorateCoordinator
    ? decorateCoordinator(baseCoordinator, store)
    : baseCoordinator;
  const presentationResources =
    coordinator.resolveResource && coordinator.retainResourceRef
      ? createToolcraftSourceAssetPresentationResources({
          resolveResource: coordinator.resolveResource,
          retainResourceRef: coordinator.retainResourceRef,
        })
      : null;
  return {
    coordinator,
    leases: 0,
    lifecycle: "active",
    lifecycleGeneration: 0,
    onError,
    presentationResources,
    store,
  };
}

async function disposeOwner(owner: ToolcraftSourceAssetOwner): Promise<void> {
  const failures: unknown[] = [];
  try {
    owner.presentationResources?.dispose();
  } catch (error) {
    failures.push(error);
  }
  try {
    await owner.coordinator.dispose.call(owner.coordinator);
  } catch (error) {
    failures.push(error);
  }

  if (failures.length === 1) {
    owner.lifecycle = "failed";
    reportOwnerError(owner, failures[0]);
  } else if (failures.length > 1) {
    owner.lifecycle = "failed";
    reportOwnerError(
      owner,
      new AggregateError(
        failures,
        "Toolcraft source asset owner failed to dispose all owned resources.",
      ),
    );
  } else if (sourceAssetOwners.get(owner.store) === owner) {
    sourceAssetOwners.delete(owner.store);
  }
}

function scheduleOwnerDisposal(owner: ToolcraftSourceAssetOwner): void {
  const lifecycleGeneration = ++owner.lifecycleGeneration;
  queueMicrotask(() => {
    if (
      owner.lifecycle !== "active" ||
      owner.leases !== 0 ||
      owner.lifecycleGeneration !== lifecycleGeneration ||
      sourceAssetOwners.get(owner.store) !== owner
    ) {
      return;
    }
    owner.lifecycle = "disposing";
    void disposeOwner(owner);
  });
}

export function acquireToolcraftSourceAssetOwner({
  createCoordinator = createDefaultCoordinator,
  decorateCoordinator,
  onError = reportSourceAssetOwnerError,
  store,
}: Readonly<{
  createCoordinator?: ToolcraftSourceAssetCoordinatorFactory;
  decorateCoordinator?: ToolcraftSourceAssetCoordinatorDecorator;
  onError?: (error: unknown) => void;
  store: ToolcraftExternalStore;
}>): ToolcraftSourceAssetOwnerLease {
  let owner = sourceAssetOwners.get(store);
  if (owner?.lifecycle === "disposing") {
    throw new Error("Toolcraft source asset owner is disposing.");
  }
  if (owner?.lifecycle === "failed") {
    throw new Error("Toolcraft source asset owner failed to dispose.");
  }
  if (!owner) {
    owner = createOwner(
      store,
      createCoordinator,
      decorateCoordinator,
      onError,
    );
    sourceAssetOwners.set(store, owner);
  }

  const release = retainOwner(owner);
  return Object.freeze({
    coordinator: owner.coordinator,
    presentationResources: owner.presentationResources,
    release,
    reportError: (error: unknown) => reportOwnerError(owner, error),
    retain: () => retainOwner(owner),
  });
}

function retainOwner(owner: ToolcraftSourceAssetOwner): () => void {
  if (owner.lifecycle !== "active") throw new Error("Toolcraft source asset owner is no longer active.");
  owner.leases += 1;
  owner.lifecycleGeneration += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    owner.leases -= 1;
    if (owner.leases === 0) scheduleOwnerDisposal(owner);
  };
}
