import type { Group } from "three";

import { decodeToolcraftModelDocument } from "../../model-import/canonical/model-document-codec";
import { digestToolcraftModelDocument } from "../../model-import/canonical/model-document-digest";
import type { ToolcraftModelDocument } from "../../model-import/canonical/model-document";
import {
  parseToolcraftModelDocumentResourceRef,
} from "../../model-import/model-source-asset-handler-resources";
import { digestModelSourceBytes } from "../../model-import/model-source-digest";
import type {
  ToolcraftModelPresentationAcquirer,
  ToolcraftModelPresentationLease,
  ToolcraftModelResourceResolver,
} from "./model-render-binding";
import {
  buildToolcraftCanonicalThreeModel,
  type ToolcraftCanonicalThreeModel,
} from "./three-canonical-model";
import {
  createToolcraftThreeModelAppearance,
  type ToolcraftThreeModelAppearance,
} from "./three-model-appearance";

const PRESENTATION_ADAPTER_VERSION = "toolcraft-three-presentation@1";

type SharedPresentation = Readonly<{
  appearance: ToolcraftThreeModelAppearance;
  bitmaps: readonly ImageBitmap[];
  built: ToolcraftCanonicalThreeModel;
  document: ToolcraftModelDocument;
}>;

type PendingEntry = {
  activeWaiters: number;
  controller: AbortController;
  key: string;
  promise: Promise<ReadyEntry>;
  releaseReachability: () => void;
  state: "failed" | "pending";
  waiters: number;
};

type ReadyEntry = {
  disposed: boolean;
  key: string;
  pendingAcquisitions: number;
  refCount: number;
  releaseReachability: () => void;
  shared: SharedPresentation;
  state: "ready";
};

type CacheEntry = PendingEntry | ReadyEntry;

export type ToolcraftModelPresentationResourceManager = Readonly<{
  acquirePresentation: ToolcraftModelPresentationAcquirer;
  dispose(): void;
  inspectResourceCounters(): ToolcraftModelPresentationResourceCounters;
}>;

export type ToolcraftModelPresentationResourceCounters = Readonly<{
  acquired: number;
  active: number;
  cacheHits: number;
  disposed: number;
  released: number;
}>;

export type ToolcraftModelPresentationResourceManagerOptions = Readonly<{
  createImageBitmap?: (blob: Blob) => Promise<ImageBitmap>;
  onAppearanceResourceFailure?: (failure: Readonly<{
    code:
      | "appearance-resource-decode-failed"
      | "appearance-resource-digest-mismatch"
      | "appearance-resource-dimensions-mismatch"
      | "appearance-resource-missing";
    resourceRef: string;
    textureId: string;
  }>) => void;
  resolveResource: ToolcraftModelResourceResolver;
  retainResourceRef?: (ref: string) => () => void;
}>;

function abortError(): DOMException {
  return new DOMException("Model presentation acquisition was aborted.", "AbortError");
}

function throwIfAborted(signal: AbortSignal): void {
  signal.throwIfAborted();
}

function ownedBytes(
  value: ArrayBuffer | Uint8Array,
): Uint8Array<ArrayBuffer> {
  const source = value instanceof Uint8Array ? value : new Uint8Array(value);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
}

async function loadTextureBitmaps(
  document: ToolcraftModelDocument,
  resolveResource: ToolcraftModelResourceResolver,
  createImage: ((blob: Blob) => Promise<ImageBitmap>) | undefined,
  reportFailure: ToolcraftModelPresentationResourceManagerOptions[
    "onAppearanceResourceFailure"
  ],
  signal: AbortSignal,
): Promise<Readonly<{
  bitmaps: readonly ImageBitmap[];
  byTextureId: ReadonlyMap<string, ImageBitmap>;
}>> {
  const bitmaps: ImageBitmap[] = [];
  const byTextureId = new Map<string, ImageBitmap>();
  const byResourceRef = new Map<string, ImageBitmap>();
  if (document.version === 1 || !createImage) {
    return Object.freeze({ bitmaps, byTextureId });
  }
  try {
    for (const texture of document.textures) {
      throwIfAborted(signal);
      const retained = byResourceRef.get(texture.resourceRef);
      if (retained) {
        byTextureId.set(texture.id, retained);
        continue;
      }
      const resolved = await resolveResource(texture.resourceRef, { signal });
      throwIfAborted(signal);
      if (resolved === null) {
        reportFailure?.({
          code: "appearance-resource-missing",
          resourceRef: texture.resourceRef,
          textureId: texture.id,
        });
        continue;
      }
      const bytes = ownedBytes(resolved);
      if (digestModelSourceBytes(bytes) !== texture.contentDigest) {
        reportFailure?.({
          code: "appearance-resource-digest-mismatch",
          resourceRef: texture.resourceRef,
          textureId: texture.id,
        });
        continue;
      }
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImage(new Blob([bytes], { type: texture.mimeType }));
      } catch (error) {
        if (signal.aborted) throw error;
        reportFailure?.({
          code: "appearance-resource-decode-failed",
          resourceRef: texture.resourceRef,
          textureId: texture.id,
        });
        continue;
      }
      if (
        signal.aborted ||
        bitmap.width !== texture.width ||
        bitmap.height !== texture.height
      ) {
        bitmap.close();
        throwIfAborted(signal);
        reportFailure?.({
          code: "appearance-resource-dimensions-mismatch",
          resourceRef: texture.resourceRef,
          textureId: texture.id,
        });
        continue;
      }
      bitmaps.push(bitmap);
      byResourceRef.set(texture.resourceRef, bitmap);
      byTextureId.set(texture.id, bitmap);
    }
    return Object.freeze({
      bitmaps: Object.freeze(bitmaps),
      byTextureId,
    });
  } catch (error) {
    for (const bitmap of bitmaps) {
      try { bitmap.close(); } catch { /* The load failure remains primary. */ }
    }
    throw error;
  }
}

async function loadSharedPresentation(
  ref: string,
  options: ToolcraftModelPresentationResourceManagerOptions,
  signal: AbortSignal,
): Promise<SharedPresentation> {
  const resolved = await options.resolveResource(ref, { signal });
  throwIfAborted(signal);
  if (resolved === null) {
    throw new Error(`Canonical model resource "${ref}" is unavailable.`);
  }
  const document = decodeToolcraftModelDocument(ownedBytes(resolved));
  const expectedDigest = parseToolcraftModelDocumentResourceRef(ref);
  if (
    expectedDigest !== null &&
    digestToolcraftModelDocument(document) !== expectedDigest
  ) {
    throw new Error(`Canonical model resource "${ref}" failed verification.`);
  }
  const decoded = await loadTextureBitmaps(
    document,
    options.resolveResource,
    options.createImageBitmap ?? globalThis.createImageBitmap?.bind(globalThis),
    options.onAppearanceResourceFailure,
    signal,
  );
  let appearance: ToolcraftThreeModelAppearance | undefined;
  let built: ToolcraftCanonicalThreeModel | undefined;
  try {
    // Ownership transfers from the texture helper before any abort/constructor
    // can throw. Every resource created below stays inside this cleanup guard.
    throwIfAborted(signal);
    appearance = createToolcraftThreeModelAppearance(document, decoded.byTextureId);
    built = buildToolcraftCanonicalThreeModel(
      document,
      appearance.materialForPrimitive,
    );
    throwIfAborted(signal);
    return Object.freeze({
      appearance,
      bitmaps: decoded.bitmaps,
      built,
      document,
    });
  } catch (error) {
    const cleanups = [
      ...[...new Set(built?.geometries)].map((geometry) => () => geometry.dispose()),
      () => appearance?.dispose(),
      ...decoded.bitmaps.map((bitmap) => () => bitmap.close()),
      () => built?.modelRoot.clear(),
    ];
    for (const cleanup of cleanups) {
      try { cleanup(); } catch { /* Preserve the acquisition/cancellation error. */ }
    }
    throw error;
  }
}

function disposeSharedPresentation(shared: SharedPresentation): void {
  for (const geometry of new Set(shared.built.geometries)) geometry.dispose();
  shared.appearance.dispose();
  for (const bitmap of shared.bitmaps) bitmap.close();
  shared.built.modelRoot.clear();
}

function idempotentRelease(release: () => void): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    release();
  };
}

export function createToolcraftModelPresentationResourceManager(
  options: ToolcraftModelPresentationResourceManagerOptions,
): ToolcraftModelPresentationResourceManager {
  const entries = new Map<string, CacheEntry>();
  const activeRoots = new Set<Group>();
  let disposed = false;
  let acquiredCount = 0;
  let cacheHitCount = 0;
  let disposedCount = 0;
  let releasedCount = 0;

  const disposeReadyIfUnowned = (entry: ReadyEntry): void => {
    if (entry.refCount !== 0 || entry.pendingAcquisitions !== 0) return;
    if (entries.get(entry.key) === entry) entries.delete(entry.key);
    if (entry.disposed) return;
    entry.disposed = true;
    disposedCount += 1;
    disposeSharedPresentation(entry.shared);
    entry.releaseReachability();
  };

  const startPending = (ref: string, key: string): PendingEntry => {
    const controller = new AbortController();
    const releaseReachability = idempotentRelease(
      options.retainResourceRef?.(ref) ?? (() => undefined),
    );
    const pending: PendingEntry = {
      activeWaiters: 0,
      controller,
      key,
      promise: Promise.resolve(undefined as unknown as ReadyEntry),
      releaseReachability,
      state: "pending" as const,
      waiters: 0,
    };
    pending.promise = loadSharedPresentation(ref, options, controller.signal)
      .then((shared) => {
        if (disposed || controller.signal.aborted || entries.get(key) !== pending) {
          disposedCount += 1;
          disposeSharedPresentation(shared);
          controller.signal.throwIfAborted();
          throw abortError();
        }
        const ready: ReadyEntry = {
          disposed: false,
          key,
          pendingAcquisitions: pending.waiters,
          refCount: 0,
          releaseReachability,
          shared,
          state: "ready",
        };
        entries.set(key, ready);
        return ready;
      }).catch((error: unknown) => {
        pending.state = "failed";
        if (entries.get(key) === pending) entries.delete(key);
        try { releaseReachability(); } catch { /* The load failure remains primary. */ }
        throw error;
      });
    entries.set(key, pending);
    return pending;
  };

  const leaseFromReady = (
    entry: ReadyEntry,
    signal: AbortSignal,
  ): ToolcraftModelPresentationLease => {
    throwIfAborted(signal);
    const root = entry.shared.built.modelRoot.clone(true);
    throwIfAborted(signal);
    entry.refCount += 1;
    acquiredCount += 1;
    activeRoots.add(root);
    let released = false;
    return Object.freeze({
      bounds: entry.shared.document.bounds,
      document: entry.shared.document,
      release: () => {
        if (released) return;
        released = true;
        if (!activeRoots.delete(root)) return;
        releasedCount += 1;
        root.removeFromParent();
        root.clear();
        entry.refCount -= 1;
        disposeReadyIfUnowned(entry);
      },
      root,
    });
  };

  return Object.freeze({
    acquirePresentation: async (ref, acquireOptions) => {
      throwIfAborted(acquireOptions.signal);
      if (disposed) throw new Error("Model presentation manager is disposed.");
      const key = `${PRESENTATION_ADAPTER_VERSION}:${ref}`;
      const current = entries.get(key);
      if (current?.state === "ready") {
        cacheHitCount += 1;
        return leaseFromReady(current, acquireOptions.signal);
      }
      if (current?.state === "failed") entries.delete(key);
      const reusable = current?.state === "pending" && !current.controller.signal.aborted;
      if (reusable) cacheHitCount += 1;
      const pending = reusable
        ? current
        : startPending(ref, key);
      pending.waiters += 1;
      pending.activeWaiters += 1;
      let active = true;
      const stopWaiting = () => {
        if (!active) return;
        active = false;
        pending.activeWaiters -= 1;
        if (pending.activeWaiters === 0 && entries.get(key) === pending) {
          pending.controller.abort(acquireOptions.signal.reason);
        }
      };
      acquireOptions.signal.addEventListener("abort", stopWaiting, { once: true });
      if (acquireOptions.signal.aborted) stopWaiting();
      let ready: ReadyEntry | undefined;
      try {
        // Cancellation stops unused shared work, but does not release its owner
        // before a non-cooperating resolver/decoder has actually settled.
        ready = await pending.promise;
        return leaseFromReady(ready, acquireOptions.signal);
      } catch (error) {
        if (acquireOptions.signal.aborted && pending.controller.signal.aborted &&
          error === pending.controller.signal.reason) throw acquireOptions.signal.reason;
        throw error;
      } finally {
        acquireOptions.signal.removeEventListener("abort", stopWaiting);
        stopWaiting();
        const cached = entries.get(key);
        if (cached === pending) {
          cached.waiters -= 1;
        } else if (ready && cached === ready) {
          ready.pendingAcquisitions -= 1;
          disposeReadyIfUnowned(ready);
        }
      }
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      releasedCount += activeRoots.size;
      for (const root of activeRoots) {
        root.removeFromParent();
        root.clear();
      }
      activeRoots.clear();
      for (const entry of entries.values()) {
        if (entry.state !== "ready") {
          entry.controller.abort();
        } else {
          entry.disposed = true;
          disposedCount += 1;
          disposeSharedPresentation(entry.shared);
          entry.releaseReachability();
        }
      }
      entries.clear();
    },
    inspectResourceCounters: () => Object.freeze({
      acquired: acquiredCount,
      active: activeRoots.size,
      cacheHits: cacheHitCount,
      disposed: disposedCount,
      released: releasedCount,
    }),
  });
}
