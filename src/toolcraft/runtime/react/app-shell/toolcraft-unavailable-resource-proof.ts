/// <reference types="vite/client" />

import type { ToolcraftSourceAssetCoordinator } from "../../source-assets/source-asset-coordinator";
import type { ToolcraftExternalStore } from "../../state/toolcraft-external-store";
import type { ToolcraftImageAsset } from "../../state/types";

const TOOLCRAFT_UNAVAILABLE_RESOURCE_PROOF_REQUEST =
  "toolcraft.browser-proof.unavailable-resource-request";
const TOOLCRAFT_UNAVAILABLE_RESOURCE_PROOF_ATTRIBUTE =
  "data-toolcraft-unavailable-resource-evidence";
const toolcraftUnavailableResourceProofEnabled =
  import.meta.env?.MODE === "test" ||
  import.meta.env?.VITE_TOOLCRAFT_BROWSER_PROOF_FIXTURES ===
    "unavailable-resource";

type ToolcraftUnavailableResourceProofRequest = Readonly<{
  action: "activate" | "cleanup";
  fileName: string;
  requestId: string;
  sourceTarget?: string;
}>;

type ActiveUnavailableResourceProof = Readonly<{
  assetId: string;
  requestId: string;
  resourceRef: string;
}>;

type PendingUnavailableResourceProofRequest = Readonly<{
  abortController: AbortController;
  promise: Promise<void>;
  requestId: string;
}>;

const cancelledProofRequest = new Error(
  "Unavailable-resource proof request was cancelled.",
);

function readUnavailableResourceProofRequest(
  event: Event,
): ToolcraftUnavailableResourceProofRequest | null {
  if (!(event instanceof CustomEvent)) return null;
  const detail: unknown = event.detail;
  if (typeof detail !== "object" || detail === null || Array.isArray(detail)) {
    return null;
  }

  const request = detail as Partial<ToolcraftUnavailableResourceProofRequest>;
  if (
    (request.action !== "activate" && request.action !== "cleanup") ||
    typeof request.fileName !== "string" ||
    request.fileName.trim() !== request.fileName ||
    request.fileName.length === 0 ||
    typeof request.requestId !== "string" ||
    request.requestId.trim() !== request.requestId ||
    request.requestId.length === 0 ||
    (
      request.sourceTarget !== undefined &&
      (
        typeof request.sourceTarget !== "string" ||
        request.sourceTarget.trim() !== request.sourceTarget ||
        request.sourceTarget.length === 0
      )
    )
  ) {
    return null;
  }

  return request as ToolcraftUnavailableResourceProofRequest;
}

export function decorateToolcraftUnavailableResourceProofCoordinator(
  coordinator: ToolcraftSourceAssetCoordinator,
  store: ToolcraftExternalStore,
): ToolcraftSourceAssetCoordinator {
  if (!toolcraftUnavailableResourceProofEnabled) return coordinator;

  const resolveResource = coordinator.resolveResource;
  if (!resolveResource) return coordinator;
  const disposeCoordinator = coordinator.dispose;

  const unavailableResourceRefs = new Set<string>();
  let active: ActiveUnavailableResourceProof | null = null;
  let disposed = false;
  let disposePromise: Promise<void> | null = null;
  let pendingRequest: PendingUnavailableResourceProofRequest | null = null;

  const proofResolveResource = async (
    ref: string,
    options: Readonly<{ signal: AbortSignal }>,
  ): Promise<Uint8Array | null> =>
    unavailableResourceRefs.has(ref)
      ? null
      : resolveResource(ref, options);

  const publish = (
    requestId: string,
    observation: Readonly<Record<string, boolean | string>>,
  ): void => {
    const root = document.querySelector<HTMLElement>(
      '[data-slot="toolcraft-runtime-app"]',
    );
    if (!root) return;
    root.setAttribute(
      TOOLCRAFT_UNAVAILABLE_RESOURCE_PROOF_ATTRIBUTE,
      JSON.stringify({ requestId, ...observation }),
    );
  };

  const handleRequest = (event: Event): void => {
    const request = readUnavailableResourceProofRequest(event);
    if (!request || disposed) return;

    if (pendingRequest) {
      publish(request.requestId, {
        message: `Unavailable-resource proof request "${pendingRequest.requestId}" is still pending.`,
        status: "error",
      });
      return;
    }
    const abortController = new AbortController();
    const assertRequestActive = (): void => {
      if (disposed || abortController.signal.aborted) {
        throw cancelledProofRequest;
      }
    };
    const promise = Promise.resolve().then(async () => {
      assertRequestActive();
      if (request.action === "cleanup") {
        if (!active || active.requestId !== request.requestId) {
          throw new Error(
            "Unavailable-resource proof cleanup must match the active fixture request.",
          );
        }

        const current = active;
        unavailableResourceRefs.delete(current.resourceRef);
        const restoredBytes = await proofResolveResource(
          current.resourceRef,
          { signal: abortController.signal },
        );
        assertRequestActive();
        if (!restoredBytes?.byteLength) {
          throw new Error(
            "Unavailable-resource proof cleanup could not restore the real resolver.",
          );
        }
        store.dispatch({
          assetId: current.assetId,
          expectedResourceRef: current.resourceRef,
          lifecycle: "ready",
          type: "media.setBinaryResourceState",
        });
        assertRequestActive();
        const restored = store
          .getCommittedState()
          .mediaAssets.find((asset) => asset.id === current.assetId);
        if (
          !restored ||
          restored.assetKind !== "image" ||
          restored.lifecycle !== "ready"
        ) {
          throw new Error(
            "Unavailable-resource proof cleanup did not restore the typed resource state.",
          );
        }

        active = null;
        assertRequestActive();
        publish(request.requestId, {
          assetId: current.assetId,
          fileName: request.fileName,
          lifecycle: "ready",
          resolverAvailable: true,
          status: "cleaned",
        });
        return;
      }

      if (active) {
        throw new Error(
          "Unavailable-resource proof supports exactly one active resource fixture.",
        );
      }
      const candidates = store
        .getCommittedState()
        .mediaAssets.filter(
          (
            asset,
          ): asset is ToolcraftImageAsset & { lifecycle: "ready" } =>
            asset.assetKind === "image" &&
            asset.lifecycle === "ready" &&
            asset.fileName === request.fileName &&
            (
              request.sourceTarget === undefined ||
              asset.sourceTarget === request.sourceTarget
            ),
        );
      if (candidates.length !== 1) {
        throw new Error(
          `Unavailable-resource proof requires exactly one ready image named "${request.fileName}", received ${candidates.length}.`,
        );
      }
      const asset = candidates[0];
      if (!asset) {
        throw new Error("Unavailable-resource proof image selection failed.");
      }

      const initialBytes = await proofResolveResource(
        asset.resourceRef,
        { signal: abortController.signal },
      );
      assertRequestActive();
      if (!initialBytes?.byteLength) {
        throw new Error(
          "Unavailable-resource proof requires a resource available through the real resolver before fault activation.",
        );
      }

      unavailableResourceRefs.add(asset.resourceRef);
      const activatedProof: ActiveUnavailableResourceProof = {
        assetId: asset.id,
        requestId: request.requestId,
        resourceRef: asset.resourceRef,
      };
      try {
        const faultedBytes = await proofResolveResource(
          asset.resourceRef,
          { signal: abortController.signal },
        );
        assertRequestActive();
        if (faultedBytes !== null) {
          throw new Error(
            "Unavailable-resource proof did not isolate the requested resolver resource.",
          );
        }
        active = activatedProof;
        store.dispatch({
          assetId: asset.id,
          error: {
            code: "browser-proof-resource-unavailable",
            message:
              "The resource is intentionally unavailable for protected browser proof.",
          },
          expectedResourceRef: asset.resourceRef,
          lifecycle: "unavailable",
          type: "media.setBinaryResourceState",
        });
        assertRequestActive();
        const unavailable = store
          .getCommittedState()
          .mediaAssets.find((candidate) => candidate.id === asset.id);
        if (
          !unavailable ||
          unavailable.assetKind !== "image" ||
          unavailable.lifecycle !== "unavailable"
        ) {
          throw new Error(
            "Unavailable-resource proof did not reach the typed unavailable state.",
          );
        }

        assertRequestActive();
        publish(request.requestId, {
          assetId: asset.id,
          fileName: asset.fileName,
          lifecycle: "unavailable",
          resolverAvailable: false,
          status: "active",
        });
      } catch (error) {
        unavailableResourceRefs.delete(asset.resourceRef);
        if (!disposed && active === activatedProof) active = null;
        throw error;
      }
    });
    const trackedRequest: PendingUnavailableResourceProofRequest = {
      abortController,
      promise,
      requestId: request.requestId,
    };
    pendingRequest = trackedRequest;
    void promise
      .catch((error: unknown) => {
        if (
          error === cancelledProofRequest ||
          disposed ||
          abortController.signal.aborted
        ) {
          return;
        }
        publish(request.requestId, {
          message:
            error instanceof Error
              ? error.message
              : "Unavailable-resource proof fixture failed.",
          status: "error",
        });
      })
      .finally(() => {
        if (pendingRequest === trackedRequest) pendingRequest = null;
      });
  };

  const dispose = (): Promise<void> => {
    if (!disposePromise) {
      disposed = true;
      document.removeEventListener(
        TOOLCRAFT_UNAVAILABLE_RESOURCE_PROOF_REQUEST,
        handleRequest,
      );
      const requestAtDisposal = pendingRequest;
      disposePromise = Promise.resolve().then(async () => {
        const failures: unknown[] = [];
        requestAtDisposal?.abortController.abort();
        if (requestAtDisposal) {
          try {
            await requestAtDisposal.promise;
          } catch {
            // Request failures are fixture observations, not disposal failures.
          }
          if (pendingRequest === requestAtDisposal) pendingRequest = null;
        }
        const activeAtDisposal = active;
        if (activeAtDisposal) {
          unavailableResourceRefs.delete(activeAtDisposal.resourceRef);
          try {
            store.dispatch({
              assetId: activeAtDisposal.assetId,
              expectedResourceRef: activeAtDisposal.resourceRef,
              lifecycle: "ready",
              type: "media.setBinaryResourceState",
            });
            const restored = store
              .getCommittedState()
              .mediaAssets.find(
                (asset) => asset.id === activeAtDisposal.assetId,
              );
            if (
              !restored ||
              restored.assetKind !== "image" ||
              restored.lifecycle !== "ready"
            ) {
              throw new Error(
                "Unavailable-resource proof disposal did not restore the typed resource state.",
              );
            }
          } catch (error) {
            failures.push(error);
          } finally {
            active = null;
          }
        }
        unavailableResourceRefs.clear();
        try {
          await disposeCoordinator.call(coordinator);
        } catch (error) {
          failures.push(error);
        }
        if (failures.length > 0) {
          throw new AggregateError(
            failures,
            "Toolcraft unavailable-resource proof failed to dispose.",
          );
        }
      });
    }
    return disposePromise;
  };

  coordinator.dispose = dispose;
  coordinator.resolveResource = proofResolveResource;
  document.addEventListener(
    TOOLCRAFT_UNAVAILABLE_RESOURCE_PROOF_REQUEST,
    handleRequest,
  );
  return coordinator;
}
