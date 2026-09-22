import type { ToolcraftBinaryAssetLease } from "./repository/binary-asset-repository";
import type {
  ToolcraftSourceAssetImportOutcome,
  ToolcraftSourceAssetOperation,
} from "./source-asset-types";

export type ToolcraftSourceAssetDefaultReplacement = Readonly<{
  assetId: string;
  layerId: string;
  placeholderRef: string;
  sourceTarget: string;
}>;

export type ToolcraftSourceAssetAdmission = Readonly<{
  generation: number;
  target: string;
}>;

export type ToolcraftSourceAssetJobLease = Readonly<{
  lease: ToolcraftBinaryAssetLease;
  settle: () => void;
  settled: Promise<void>;
}>;

export type ToolcraftSourceAssetJob = {
  controller: AbortController;
  defaultReplacement?: ToolcraftSourceAssetDefaultReplacement;
  generation: number;
  jobId: string;
  lease: ToolcraftSourceAssetJobLease | null;
  stagedResourceRefs: Set<string>;
  target: string;
};

export type ToolcraftSourceAssetJobManager = Readonly<{
  attachLease: (
    job: ToolcraftSourceAssetJob,
    lease: ToolcraftBinaryAssetLease,
  ) => void;
  beginDispose: () => Promise<void>;
  beginJob: (
    admission: ToolcraftSourceAssetAdmission,
    phase?: ToolcraftSourceAssetOperation["phase"],
    defaultReplacement?: ToolcraftSourceAssetDefaultReplacement,
  ) => ToolcraftSourceAssetJob;
  cancelTarget: (target: string) => void;
  getActiveJobs: () => readonly ToolcraftSourceAssetJob[];
  hasDefaultReplacement: (assetId: string) => boolean;
  isAdmissionCurrent: (admission: ToolcraftSourceAssetAdmission) => boolean;
  isCurrent: (job: ToolcraftSourceAssetJob) => boolean;
  isDisposed: () => boolean;
  removeJob: (job: ToolcraftSourceAssetJob) => void;
  reserveAdmission: (target: string) => ToolcraftSourceAssetAdmission;
  settleLease: (
    job: ToolcraftSourceAssetJob,
    lease: ToolcraftBinaryAssetLease,
  ) => void;
  trackInflight: (
    promise: Promise<ToolcraftSourceAssetImportOutcome>,
  ) => Promise<ToolcraftSourceAssetImportOutcome>;
}>;

export function createToolcraftSourceAssetJobManager({
  jobIdFactory,
  onBegin,
  onCancelTarget,
}: Readonly<{
  jobIdFactory?: () => string;
  onBegin: (
    job: ToolcraftSourceAssetJob,
    phase: ToolcraftSourceAssetOperation["phase"],
  ) => void;
  onCancelTarget: (target: string) => void;
}>): ToolcraftSourceAssetJobManager {
  const activeByTarget = new Map<string, ToolcraftSourceAssetJob>();
  const activeJobs = new Map<string, ToolcraftSourceAssetJob>();
  const generations = new Map<string, number>();
  const inflight = new Set<Promise<ToolcraftSourceAssetImportOutcome>>();
  let disposed = false;
  let disposePromise: Promise<void> | null = null;
  let jobSequence = 0;

  const nextJobId = (): string => {
    const jobId = jobIdFactory?.() ?? `source-asset-${++jobSequence}`;
    if (jobId.length === 0 || jobId.trim() !== jobId) {
      throw new Error("Source asset job id must be a non-empty trimmed string");
    }
    return jobId;
  };

  const isAdmissionCurrent = (
    admission: ToolcraftSourceAssetAdmission,
  ): boolean =>
    !disposed && generations.get(admission.target) === admission.generation;

  const isCurrent = (job: ToolcraftSourceAssetJob): boolean =>
    !disposed &&
    !job.controller.signal.aborted &&
    generations.get(job.target) === job.generation &&
    activeByTarget.get(job.target) === job;

  const removeJob = (job: ToolcraftSourceAssetJob): void => {
    activeJobs.delete(job.jobId);
    if (activeByTarget.get(job.target) === job) activeByTarget.delete(job.target);
  };

  const reserveAdmission = (target: string): ToolcraftSourceAssetAdmission => {
    activeByTarget.get(target)?.controller.abort();
    const generation = (generations.get(target) ?? 0) + 1;
    generations.set(target, generation);
    return Object.freeze({ generation, target });
  };

  return {
    attachLease: (job, lease) => {
      if (job.lease) {
        throw new Error(`Source asset job "${job.jobId}" already owns a lease`);
      }
      let didSettle = false;
      let resolveSettlement: (() => void) | undefined;
      const settled = new Promise<void>((resolve) => {
        resolveSettlement = resolve;
      });
      job.lease = Object.freeze({
        lease,
        settle: () => {
          if (didSettle) return;
          didSettle = true;
          resolveSettlement?.();
        },
        settled,
      });
    },
    beginDispose: () => {
      if (disposePromise) return disposePromise;
      disposed = true;
      for (const job of activeJobs.values()) job.controller.abort();
      activeByTarget.clear();
      disposePromise = Promise.allSettled([...inflight]).then(() => undefined);
      return disposePromise;
    },
    beginJob: (admission, phase = "analyzing", defaultReplacement) => {
      const job: ToolcraftSourceAssetJob = {
        controller: new AbortController(),
        ...(defaultReplacement ? { defaultReplacement } : {}),
        generation: admission.generation,
        jobId: nextJobId(),
        lease: null,
        stagedResourceRefs: new Set(),
        target: admission.target,
      };
      activeByTarget.set(admission.target, job);
      activeJobs.set(job.jobId, job);
      onBegin(job, phase);
      return job;
    },
    cancelTarget: (target) => {
      const generation = (generations.get(target) ?? 0) + 1;
      generations.set(target, generation);
      activeByTarget.get(target)?.controller.abort();
      activeByTarget.delete(target);
      onCancelTarget(target);
    },
    getActiveJobs: () => [...activeJobs.values()],
    hasDefaultReplacement: (assetId) =>
      [...activeJobs.values()].some(
        (job) => job.defaultReplacement?.assetId === assetId,
      ),
    isAdmissionCurrent,
    isCurrent,
    isDisposed: () => disposed,
    removeJob,
    reserveAdmission,
    settleLease: (job, lease) => {
      if (job.lease?.lease === lease) job.lease.settle();
    },
    trackInflight: (promise) => {
      inflight.add(promise);
      void promise.then(
        () => inflight.delete(promise),
        () => inflight.delete(promise),
      );
      return promise;
    },
  };
}
