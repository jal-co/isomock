import type { ToolcraftSourceAssetFeedback } from "../../source-assets/source-asset-types";
import {
  createToolcraftModelAppearanceResourceManifest,
  equalToolcraftModelAppearanceResourceManifests,
  type ToolcraftModelAppearanceResourceManifestEntry,
} from "../canonical/model-appearance-resource";
import {
  type ToolcraftModelWorkerYieldToHost,
  yieldToToolcraftModelWorkerHost,
} from "./cooperative-buffer-snapshot";
import {
  preflightToolcraftModelWorkerImportRequest,
  preflightToolcraftModelWorkerPackageExtractRequest,
  preflightToolcraftModelWorkerRepairRequest,
  runToolcraftModelWorkerSnapshot,
  snapshotToolcraftModelWorkerImportBundle,
  snapshotToolcraftModelWorkerPackageExtractInput,
  snapshotToolcraftModelWorkerRepairInputs,
} from "./model-import-worker-client-snapshot";
import { verifyToolcraftModelWorkerDraft } from "./model-import-worker-client-draft-verification";
import {
  TOOLCRAFT_MODEL_WORKER_FEEDBACK_MAX_LENGTH,
  type ToolcraftModelImportWorkerPayload,
  type ToolcraftModelPackageExtractWorkerResult,
  type ToolcraftModelRepairPlanEnvelope,
  type ToolcraftModelRepairWorkerPayload,
  type ToolcraftModelWorkerRequest,
  type ToolcraftModelWorkerResponse,
  type ToolcraftModelWorkerGeometryTerminalResponse,
  type ToolcraftModelWorkerPackageTerminalResponse,
  type ToolcraftModelWorkerResult,
  type ToolcraftModelWorkerTerminalResponse,
} from "./model-import-worker-protocol";
import {
  createToolcraftModelWorkerResponseLifecycle,
  readToolcraftModelWorkerMessageIdentity,
  validateToolcraftModelWorkerResponse,
  type ToolcraftModelWorkerResponseLifecycle,
  type ToolcraftModelWorkerValidationContext,
} from "./model-import-worker-protocol-validation";
import {
  sha256ToolcraftModelWorkerBytes,
  type ToolcraftModelWorkerAsyncSha256,
} from "./model-import-worker-result-verification";
import { verifyToolcraftModelWorkerResult } from "./model-import-worker-client-result-verification";
import { verifyToolcraftModelWorkerRepairInputs } from "./model-import-worker-client-repair-verification";

type WorkerEventType = "error" | "message" | "messageerror";

export type ToolcraftModelWorkerLike = Readonly<{
  addEventListener: (
    type: WorkerEventType,
    listener: EventListenerOrEventListenerObject,
  ) => void;
  postMessage: (
    message: ToolcraftModelWorkerRequest,
    transfer: Transferable[],
  ) => void;
  removeEventListener: (
    type: WorkerEventType,
    listener: EventListenerOrEventListenerObject,
  ) => void;
  terminate: () => void;
}>;

export type ToolcraftModelWorkerFactory = () => ToolcraftModelWorkerLike;

export type ToolcraftModelWorkerClientOptions = Readonly<{
  sha256?: ToolcraftModelWorkerAsyncSha256;
  workerFactory?: ToolcraftModelWorkerFactory;
  yieldToHost?: ToolcraftModelWorkerYieldToHost;
}>;

export type { ToolcraftModelWorkerYieldToHost } from "./cooperative-buffer-snapshot";

export type ToolcraftModelWorkerClientObservers = Readonly<{
  onDraft?: (
    response: Extract<ToolcraftModelWorkerResponse, { kind: "draft" }>,
  ) => void;
  onDiagnostic?: (
    response: Extract<ToolcraftModelWorkerResponse, { kind: "diagnostic" }>,
  ) => void;
  onProgress?: (
    response: Extract<ToolcraftModelWorkerResponse, { kind: "progress" }>,
  ) => void;
  onPackageResult?: (result: ToolcraftModelPackageExtractWorkerResult) => void;
  onResult?: (result: ToolcraftModelWorkerResult) => void;
  signal?: AbortSignal;
}>;

export type ToolcraftModelWorkerClientImportRequest = ToolcraftModelImportWorkerPayload &
  Readonly<{ jobId: string }>;

export type ToolcraftModelWorkerClientRepairRequest = Readonly<{
  canonicalDocument: ArrayBuffer | Uint8Array;
  canonicalDocumentDigest: string;
  jobId: string;
  limits: ToolcraftModelRepairWorkerPayload["limits"];
  repairPlanEnvelope: ToolcraftModelRepairPlanEnvelope;
}>;

export type ToolcraftModelWorkerClientPackageExtractRequest = Readonly<{
  archive: ArrayBuffer | Uint8Array;
  archiveDigest: string;
  jobId: string;
  limits: ToolcraftModelRepairWorkerPayload["limits"];
}>;

export type ToolcraftModelWorkerClient = Readonly<{
  cancel: (jobId?: string) => void;
  dispose: () => void;
  extractModelPackage: (
    request: ToolcraftModelWorkerClientPackageExtractRequest,
    observers?: ToolcraftModelWorkerClientObservers,
  ) => Promise<ToolcraftModelWorkerPackageTerminalResponse>;
  importModel: (
    request: ToolcraftModelWorkerClientImportRequest,
    observers?: ToolcraftModelWorkerClientObservers,
  ) => Promise<ToolcraftModelWorkerGeometryTerminalResponse>;
  repair: (
    request: ToolcraftModelWorkerClientRepairRequest,
    observers?: ToolcraftModelWorkerClientObservers,
  ) => Promise<ToolcraftModelWorkerGeometryTerminalResponse>;
  reset: () => void;
}>;

type WorkerBinding = {
  onError: EventListener;
  onMessage: EventListener;
  onMessageError: EventListener;
  worker: ToolcraftModelWorkerLike;
};

type ActiveClientJob = {
  abortCleanup?: () => void;
  draftVerification?: Promise<"invalid" | "stale" | "verified">;
  generation: number;
  jobId: string;
  lifecycle: ToolcraftModelWorkerResponseLifecycle;
  observers: ToolcraftModelWorkerClientObservers;
  posted: boolean;
  resolve: (response: ToolcraftModelWorkerTerminalResponse) => void;
  settled: boolean;
  validationContext: ToolcraftModelWorkerValidationContext;
  verifiedDraft?: Readonly<{
    appearanceResources: readonly ToolcraftModelAppearanceResourceManifestEntry[];
    canonicalDocumentDigest: string;
  }>;
};

type PreparedClientJob = Readonly<{
  job: ActiveClientJob;
  promise: Promise<ToolcraftModelWorkerTerminalResponse>;
}>;

type ToolcraftModelWorkerErrorResponse = Extract<
  ToolcraftModelWorkerTerminalResponse,
  { kind: "error" }
>;

function defaultWorkerAssetUrl(): URL {
  // Keep URL resolution separate from the Worker constructor. Vite and Next
  // can then publish the generated, self-contained bundle as an opaque asset
  // instead of reparsing third-party decoder internals for a worker chunk.
  return new URL("./model-import.worker.bundle.js", import.meta.url);
}

function defaultWorkerFactory(): ToolcraftModelWorkerLike {
  const WorkerConstructor = globalThis.Worker;
  return new WorkerConstructor(defaultWorkerAssetUrl(), { type: "module" });
}

function workerFailure(code: string, message: string): ToolcraftSourceAssetFeedback {
  return Object.freeze({
    category: "resource-unavailable",
    code,
    message: message.slice(0, TOOLCRAFT_MODEL_WORKER_FEEDBACK_MAX_LENGTH),
  });
}

export function createToolcraftModelWorkerClient(
  options: ToolcraftModelWorkerClientOptions = {},
): ToolcraftModelWorkerClient {
  const workerFactory = options.workerFactory ?? defaultWorkerFactory;
  const sha256 = options.sha256 ?? sha256ToolcraftModelWorkerBytes;
  const yieldToHost = options.yieldToHost ?? yieldToToolcraftModelWorkerHost;
  let binding: WorkerBinding | undefined;
  let activeJob: ActiveClientJob | undefined;
  let generation = 0;
  let disposed = false;

  const settle = (
    job: ActiveClientJob,
    response: ToolcraftModelWorkerTerminalResponse,
  ): void => {
    if (job.settled) return;
    job.settled = true;
    try {
      job.abortCleanup?.();
    } catch {
      // Observer-owned cleanup cannot keep an otherwise terminal job pending.
    }
    if (activeJob === job) activeJob = undefined;
    job.resolve(response);
    if (response.kind === "result") {
      try {
        job.observers.onResult?.(response.result);
      } catch {
        // Observer callbacks are notifications, never worker lifecycle control.
      }
    }
    if (response.kind === "package-result") {
      try {
        job.observers.onPackageResult?.(response.result);
      } catch {
        // Observer callbacks are notifications, never worker lifecycle control.
      }
    }
  };

  const detach = (ownedBinding: WorkerBinding): void => {
    ownedBinding.worker.removeEventListener("message", ownedBinding.onMessage);
    ownedBinding.worker.removeEventListener("error", ownedBinding.onError);
    ownedBinding.worker.removeEventListener("messageerror", ownedBinding.onMessageError);
  };

  const terminateBinding = (): void => {
    const ownedBinding = binding;
    if (!ownedBinding) return;
    binding = undefined;
    detach(ownedBinding);
    ownedBinding.worker.terminate();
  };

  const cancelActive = (): void => {
    const job = activeJob;
    if (!job) return;
    // Decoder and repair calls may be synchronous; once posted, worker
    // termination is their interruption and decoder-memory release boundary.
    if (job.posted) terminateBinding();
    settle(job, {
      generation: job.generation,
      jobId: job.jobId,
      kind: "cancelled",
    });
  };

  const failTransport = (ownedBinding: WorkerBinding, code: string, message: string): void => {
    if (binding !== ownedBinding) return;
    const job = activeJob;
    terminateBinding();
    if (!job) return;
    settle(job, {
      feedback: workerFailure(code, message),
      generation: job.generation,
      jobId: job.jobId,
      kind: "error",
    });
  };

  const handleResponse = (ownedBinding: WorkerBinding, event: Event): void => {
    if (binding !== ownedBinding || !(event instanceof MessageEvent)) return;
    const data: unknown = event.data;
    const job = activeJob;
    if (!job) return;
    const identity = readToolcraftModelWorkerMessageIdentity(data);
    if (!identity) {
      failTransport(
        ownedBinding,
        "model-worker-invalid-message",
        "The model worker returned an invalid message.",
      );
      return;
    }
    if (identity.generation !== job.generation || identity.jobId !== job.jobId) return;
    const response = validateToolcraftModelWorkerResponse(data, job.validationContext);
    if (!response || !job.lifecycle.accept(response)) {
      failTransport(
        ownedBinding,
        "model-worker-invalid-message",
        "The model worker returned an invalid message.",
      );
      return;
    }
    if (response.kind === "progress") {
      try {
        job.observers.onProgress?.(response);
      } catch {
        // Observer callbacks are notifications, never worker lifecycle control.
      }
      return;
    }
    if (response.kind === "draft") {
      const isCurrent = (): boolean =>
        binding === ownedBinding && activeJob === job && !job.settled &&
        job.generation === response.generation && job.jobId === response.jobId;
      const verification = verifyToolcraftModelWorkerDraft(
        response,
        sha256,
        isCurrent,
      );
      job.draftVerification = verification;
      void verification.then((outcome) => {
        if (!isCurrent() || outcome === "stale") return;
        if (outcome === "verified") {
          job.verifiedDraft = Object.freeze({
            appearanceResources: createToolcraftModelAppearanceResourceManifest(
              response.draft.appearanceResources,
            ),
            canonicalDocumentDigest: response.draft.canonicalDocumentDigest,
          });
          try {
            job.observers.onDraft?.(response);
          } catch {
            // Observer callbacks are notifications, never worker lifecycle control.
          }
          return;
        }
        failTransport(
          ownedBinding,
          "model-worker-invalid-message",
          "The model worker draft failed cryptographic verification.",
        );
      });
      return;
    }
    if (response.kind === "diagnostic") {
      try {
        job.observers.onDiagnostic?.(response);
      } catch {
        // Observer callbacks are notifications, never worker lifecycle control.
      }
      return;
    }
    if (response.kind === "error") {
      settle(job, response);
      return;
    }
    if (response.kind === "result" || response.kind === "package-result") {
      void (async () => {
        const isCurrent = (): boolean =>
          binding === ownedBinding && activeJob === job && !job.settled &&
          job.generation === response.generation && job.jobId === response.jobId;
        if (response.result.operation === "decode-and-analyze") {
          const draftVerification = job.draftVerification;
          if (!draftVerification) {
            failTransport(
              ownedBinding,
              "model-worker-invalid-message",
              "The model worker result arrived without a verified draft.",
            );
            return;
          }
          const draftOutcome = await draftVerification;
          if (!isCurrent() || draftOutcome === "stale") return;
          if (draftOutcome !== "verified") return;
          const verifiedDraft = job.verifiedDraft;
          const resultManifest = createToolcraftModelAppearanceResourceManifest(
            response.result.appearanceResources,
          );
          if (verifiedDraft === undefined ||
              verifiedDraft.canonicalDocumentDigest !==
                response.result.canonicalDocumentDigest ||
              !equalToolcraftModelAppearanceResourceManifests(
                verifiedDraft.appearanceResources,
                resultManifest,
              )) {
            failTransport(
              ownedBinding,
              "model-worker-invalid-message",
              "The model worker result does not match its verified draft.",
            );
            return;
          }
        }
        const verification = await verifyToolcraftModelWorkerResult(
          response,
          job.validationContext,
          sha256,
          isCurrent,
        );
        if (!isCurrent() || verification === "stale") return;
        if (verification === "verified") {
          settle(job, response);
          return;
        }
        failTransport(
          ownedBinding,
          "model-worker-invalid-message",
          "The model worker result failed cryptographic verification.",
        );
      })();
      return;
    }
    settle(job, response);
  };

  const ensureWorker = (): WorkerBinding => {
    if (binding) return binding;
    const worker = workerFactory();
    const ownedBinding = {} as WorkerBinding;
    ownedBinding.worker = worker;
    ownedBinding.onMessage = (event) => handleResponse(ownedBinding, event);
    ownedBinding.onError = () => failTransport(
      ownedBinding,
      "model-worker-error",
      "The model worker stopped before completing the operation.",
    );
    ownedBinding.onMessageError = () => failTransport(
      ownedBinding,
      "model-worker-message-error",
      "The model worker returned an unreadable message.",
    );
    worker.addEventListener("message", ownedBinding.onMessage);
    worker.addEventListener("error", ownedBinding.onError);
    worker.addEventListener("messageerror", ownedBinding.onMessageError);
    binding = ownedBinding;
    return ownedBinding;
  };

  const nextGeneration = (): number => {
    if (generation >= Number.MAX_SAFE_INTEGER) {
      throw new Error("Model worker client generation is exhausted.");
    }
    generation += 1;
    return generation;
  };

  const createJob = (
    currentGeneration: number,
    jobId: string,
    observers: ToolcraftModelWorkerClientObservers,
    validationContext: ToolcraftModelWorkerValidationContext,
  ): PreparedClientJob => {
    let resolve!: (response: ToolcraftModelWorkerTerminalResponse) => void;
    const promise = new Promise<ToolcraftModelWorkerTerminalResponse>((settlePromise) => {
      resolve = settlePromise;
    });
    const job: ActiveClientJob = {
      generation: currentGeneration,
      jobId,
      lifecycle: createToolcraftModelWorkerResponseLifecycle(
        validationContext.expectedOperation,
      ),
      observers,
      posted: false,
      resolve,
      settled: false,
      validationContext,
    };
    activeJob = job;
    if (observers.signal) {
      const abort = (): void => {
        if (activeJob === job) cancelActive();
      };
      observers.signal.addEventListener("abort", abort, { once: true });
      job.abortCleanup = () => observers.signal?.removeEventListener("abort", abort);
      if (observers.signal.aborted) {
        cancelActive();
      }
    }
    return Object.freeze({ job, promise });
  };

  const postJob = (
    prepared: PreparedClientJob,
    request: ToolcraftModelWorkerRequest,
    transfer: Transferable[],
  ): void => {
    const { job } = prepared;
    if (activeJob !== job || job.settled) return;
    try {
      const ownedBinding = ensureWorker();
      job.posted = true;
      ownedBinding.worker.postMessage(request, transfer);
    } catch {
      const ownedBinding = binding;
      if (ownedBinding) {
        failTransport(
          ownedBinding,
          "model-worker-post-failed",
          "The model worker could not receive the operation.",
        );
      } else {
        settle(job, {
          feedback: workerFailure(
            "model-worker-start-failed",
            "The model worker could not be started.",
          ),
          generation: job.generation,
          jobId: job.jobId,
          kind: "error",
        });
      }
    }
  };

  const failPreparedJob = (
    prepared: PreparedClientJob,
    code: string,
    message: string,
  ): void => {
    const { job } = prepared;
    if (activeJob !== job || job.settled) return;
    settle(job, {
      feedback: workerFailure(code, message),
      generation: job.generation,
      jobId: job.jobId,
      kind: "error",
    });
  };

  const failAttempt = (
    jobId: string,
    feedback: ToolcraftSourceAssetFeedback,
  ): Promise<ToolcraftModelWorkerErrorResponse> => Promise.resolve(Object.freeze({
    feedback,
    generation: generation >= Number.MAX_SAFE_INTEGER ? generation : generation + 1,
    jobId,
    kind: "error" as const,
  }));

  const assertAvailable = (): void => {
    if (disposed) throw new Error("Model worker client is disposed.");
  };

  const prepareJob = (): number => {
    assertAvailable();
    if (activeJob) cancelActive();
    return nextGeneration();
  };

  return Object.freeze({
    cancel: (jobId) => {
      if (!activeJob || (jobId !== undefined && activeJob.jobId !== jobId)) return;
      cancelActive();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancelActive();
      terminateBinding();
    },
    extractModelPackage: (request, observers = {}) => {
      assertAvailable();
      const jobId = request.jobId;
      const extractPreflight =
        preflightToolcraftModelWorkerPackageExtractRequest(request);
      if (!extractPreflight.ok) {
        return failAttempt(jobId, extractPreflight.feedback);
      }
      const input = extractPreflight.value;
      const currentGeneration = prepareJob();
      const validationContext = Object.freeze({
        expectedArchiveDigest: input.input.archiveDigest,
        expectedOperation: "extract-model-package" as const,
        limits: input.limits,
      });
      const prepared = createJob(
        currentGeneration,
        jobId,
        observers,
        validationContext,
      );
      const isCurrent = (): boolean =>
        activeJob === prepared.job && !prepared.job.settled;
      runToolcraftModelWorkerSnapshot(
        () => snapshotToolcraftModelWorkerPackageExtractInput(
          input.input,
          isCurrent,
          yieldToHost,
        ),
        isCurrent,
        (snapshot) => postJob(prepared, {
          generation: currentGeneration,
          jobId,
          kind: "extract-model-package",
          payload: {
            archive: snapshot.archive,
            archiveDigest: snapshot.archiveDigest,
            limits: input.limits,
          },
        }, snapshot.transfer),
        () => failPreparedJob(
          prepared,
          "model-worker-archive-snapshot-failed",
          "The model archive could not be copied safely.",
        ),
      );
      return prepared.promise as Promise<ToolcraftModelWorkerPackageTerminalResponse>;
    },
    importModel: (request, observers = {}) => {
      assertAvailable();
      const jobId = request.jobId;
      const importPreflight = preflightToolcraftModelWorkerImportRequest(request);
      if (!importPreflight.ok) {
        return failAttempt(jobId, importPreflight.feedback);
      }
      const input = importPreflight.value;
      const currentGeneration = prepareJob();
      const validationContext = Object.freeze({
        expectedOperation: "decode-and-analyze" as const,
        limits: input.limits,
        topologyProfile: input.topologyProfile,
      });
      const prepared = createJob(
        currentGeneration,
        jobId,
        observers,
        validationContext,
      );
      const isCurrent = (): boolean =>
        activeJob === prepared.job && !prepared.job.settled;
      runToolcraftModelWorkerSnapshot(
        () => snapshotToolcraftModelWorkerImportBundle(
          input.bundle,
          isCurrent,
          yieldToHost,
        ),
        isCurrent,
        (snapshot) => postJob(prepared, {
          generation: currentGeneration,
          jobId,
          kind: "decode-and-analyze",
          payload: {
            adapterVersion: input.adapterVersion,
            bundle: snapshot.bundle,
            format: input.format,
            geometryDecoderVersion: input.geometryDecoderVersion,
            limits: input.limits,
            topologyProfile: input.topologyProfile,
          },
        }, snapshot.transfer),
        () => failPreparedJob(
          prepared,
          "model-worker-source-snapshot-failed",
          "The model source could not be copied safely.",
        ),
      );
      return prepared.promise as Promise<ToolcraftModelWorkerGeometryTerminalResponse>;
    },
    repair: (request, observers = {}) => {
      assertAvailable();
      const jobId = request.jobId;
      const repairPreflight = preflightToolcraftModelWorkerRepairRequest(request);
      if (!repairPreflight.ok) {
        return failAttempt(jobId, repairPreflight.feedback);
      }
      const input = repairPreflight.value;
      const currentGeneration = prepareJob();
      const expectedRepairPlanEnvelope = Object.freeze({
        byteLength: input.inputs.repairPlanEnvelope.source.byteLength,
        envelopeDigest: input.inputs.repairPlanEnvelope.envelopeDigest,
        planDigest: input.inputs.repairPlanEnvelope.planDigest,
        version: 1 as const,
      });
      const validationContext = Object.freeze({
        expectedOperation: "repair" as const,
        expectedRepairPlanEnvelope,
        limits: input.limits,
      });
      const prepared = createJob(
        currentGeneration,
        jobId,
        observers,
        validationContext,
      );
      const isCurrent = (): boolean =>
        activeJob === prepared.job && !prepared.job.settled;
      runToolcraftModelWorkerSnapshot(
        () => snapshotToolcraftModelWorkerRepairInputs(
          input.inputs,
          isCurrent,
          yieldToHost,
        ),
        isCurrent,
        (snapshot) => {
          void verifyToolcraftModelWorkerRepairInputs(
            snapshot,
            sha256,
            isCurrent,
          ).then((verification) => {
            if (verification === "stale") return;
            if (verification !== "verified") {
              failPreparedJob(
                prepared,
                verification.code,
                verification.message,
              );
              return;
            }
            postJob(prepared, {
              generation: currentGeneration,
              jobId,
              kind: "repair",
              payload: {
                canonicalDocument: snapshot.canonicalDocument,
                canonicalDocumentDigest: snapshot.canonicalDocumentDigest,
                limits: input.limits,
                repairPlanEnvelope: snapshot.repairPlanEnvelope,
              },
            }, snapshot.transfer);
          });
        },
        () => failPreparedJob(
          prepared,
          "model-worker-repair-snapshot-failed",
          "The model repair inputs could not be copied safely.",
        ),
      );
      return prepared.promise as Promise<ToolcraftModelWorkerGeometryTerminalResponse>;
    },
    reset: cancelActive,
  });
}
