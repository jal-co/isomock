import type { ToolcraftRendererPipelineClient } from "@/toolcraft/runtime";

export type PhysicalFeedbackOperationQueue = Readonly<{
  drain(): Promise<void>;
  getSnapshot(): PhysicalFeedbackPipelineProgress;
  run<Result>(operation: () => PromiseLike<Result> | Result): Promise<Result>;
  runRetirement(operation: () => PromiseLike<void> | void): Promise<void>;
  subscribe(listener: () => void): () => void;
}>;

export type PhysicalFeedbackPipelineProgress = Readonly<{
  operationSettledGeneration: number;
  operationStartedGeneration: number;
  retirementSettledGeneration: number;
  retirementStartedGeneration: number;
}>;

export const physicalFeedbackInitialPipelineProgress: PhysicalFeedbackPipelineProgress =
  Object.freeze({
    operationSettledGeneration: 0,
    operationStartedGeneration: 0,
    retirementSettledGeneration: 0,
    retirementStartedGeneration: 0,
  });

export type PhysicalFeedbackPreviewStage = Readonly<{
  coalescedFrames: number;
  pendingRelease: boolean;
}>;

export type PhysicalFeedbackPreviewPlan<Input> = Readonly<{
  releasedCoalescedInput: boolean;
  stage: PhysicalFeedbackPreviewStage;
  submission: Input | null;
}>;

const queues = new WeakMap<
  ToolcraftRendererPipelineClient,
  PhysicalFeedbackOperationQueue
>();

export function createPhysicalFeedbackOperationQueue(): PhysicalFeedbackOperationQueue {
  let tail = Promise.resolve<void>(undefined);
  let retirementTail = Promise.resolve<void>(undefined);
  let snapshot = physicalFeedbackInitialPipelineProgress;
  const listeners = new Set<() => void>();
  const publish = (next: PhysicalFeedbackPipelineProgress) => {
    snapshot = Object.freeze(next);
    for (const listener of [...listeners]) listener();
  };
  const advance = (
    startedKey: "operationStartedGeneration" | "retirementStartedGeneration",
  ) => {
    const generation = snapshot[startedKey] + 1;
    if (!Number.isSafeInteger(generation)) {
      throw new RangeError("Physical feedback pipeline generation is exhausted.");
    }
    publish({ ...snapshot, [startedKey]: generation });
    return generation;
  };
  return Object.freeze({
    drain() {
      return tail;
    },
    getSnapshot: () => snapshot,
    run<Result>(operation: () => PromiseLike<Result> | Result) {
      const generation = advance("operationStartedGeneration");
      const result = tail.then(operation).then(
        (value) => {
          publish({ ...snapshot, operationSettledGeneration: generation });
          return value;
        },
        (error: unknown) => {
          publish({ ...snapshot, operationSettledGeneration: generation });
          throw error;
        },
      );
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    runRetirement(operation: () => PromiseLike<void> | void) {
      const generation = advance("retirementStartedGeneration");
      const result = retirementTail.then(operation).then(
        () => {
          publish({ ...snapshot, retirementSettledGeneration: generation });
        },
        (error: unknown) => {
          publish({ ...snapshot, retirementSettledGeneration: generation });
          throw error;
        },
      );
      retirementTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

export function getPhysicalFeedbackOperationQueue(
  rendererPipeline: ToolcraftRendererPipelineClient,
): PhysicalFeedbackOperationQueue {
  const existing = queues.get(rendererPipeline);
  if (existing) return existing;
  const created = createPhysicalFeedbackOperationQueue();
  queues.set(rendererPipeline, created);
  return created;
}

export function createPhysicalFeedbackPreviewStage(): PhysicalFeedbackPreviewStage {
  return Object.freeze({ coalescedFrames: 0, pendingRelease: false });
}

export function planPhysicalFeedbackPreview<Input>(
  current: PhysicalFeedbackPreviewStage,
  input: Input,
  interactionActive: boolean,
): PhysicalFeedbackPreviewPlan<Input> {
  if (interactionActive) {
    return Object.freeze({
      releasedCoalescedInput: false,
      stage: Object.freeze({
        coalescedFrames: current.coalescedFrames + 1,
        pendingRelease: true,
      }),
      submission: null,
    });
  }
  return Object.freeze({
    releasedCoalescedInput: current.pendingRelease,
    stage: Object.freeze({
      coalescedFrames: current.coalescedFrames,
      pendingRelease: false,
    }),
    submission: input,
  });
}
