import type { ToolcraftPerformanceProfileName } from "@/toolcraft/runtime";

import { serializeToolcraftPerformanceMeasurement } from "../src/app/test-evidence/browser-performance-measurement-contract";
import type { ToolcraftPerformancePipelinePhase } from "../src/app/test-evidence/browser-performance-contract";
import { attachToolcraftPerformanceMeasurementEvidence } from "./browser-performance-measurement-evidence";
import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";

export type ToolcraftFrameProbeResult = {
  droppedFrameCount: number;
  droppedFrameRatio: number;
  frameGapP50Ms: number;
  frameGapP95Ms: number;
  frameGapP99Ms: number;
  frameGapsMs: readonly number[];
  longTaskCount: number;
  longTaskMaxMs: number;
  maxFrameGapMs: number;
  sampleCount: number;
};

export type ToolcraftInteractionResult = ToolcraftFrameProbeResult & {
  durationMs: number;
};

export type ToolcraftInteractionOptions = {
  baselineStabilityIntervalMs?: number;
  baselineStabilitySamples?: number;
  expectedOutcome?: unknown;
  observeOutcome?: () => Promise<unknown>;
  outcomePollIntervalMs?: number;
  outcomeTimeoutMs?: number;
  phase?: ToolcraftPerformancePipelinePhase;
  profile?: ToolcraftPerformanceProfileName;
  pathId?: string;
  settleFrames?: number;
  settleMs?: number;
  stabilityIntervalMs?: number;
  stabilitySamples?: number;
  target?: string;
};

const measurementProvenance = new WeakMap<
  ToolcraftInteractionResult,
  { kind: "animation-frames" | "interaction"; pathId: string; target?: string }
>();

export function getToolcraftMeasurementProvenance(
  result: ToolcraftInteractionResult,
):
  | {
      kind: "animation-frames" | "interaction";
      pathId: string;
      target?: string;
    }
  | undefined {
  return measurementProvenance.get(result);
}

export async function finalizeToolcraftMeasurement(
  result: ToolcraftInteractionResult,
  options: ToolcraftInteractionOptions,
  kind: "animation-frames" | "interaction",
): Promise<ToolcraftInteractionResult> {
  const immutableResult = Object.freeze({
    ...result,
    frameGapsMs: Object.freeze([...result.frameGapsMs]),
  });
  if (options.pathId) {
    measurementProvenance.set(immutableResult, {
      kind,
      pathId: options.pathId,
      target: options.target,
    });
    await attachToolcraftBrowserRuntimeEvidence({
      evidenceType: "performance-measurement",
      requirementId: options.pathId,
      target: options.target,
    });
    if (kind === "animation-frames") {
      await attachToolcraftBrowserRuntimeEvidence({
        evidenceType: "performance-animation-frames",
        requirementId: options.pathId,
        target: options.target,
      });
    }
    if ((options.phase === undefined) !== (options.profile === undefined)) {
      throw new Error(
        "Protected Toolcraft measurement evidence requires phase and profile together.",
      );
    }
    if (options.phase && options.profile) {
      await attachToolcraftPerformanceMeasurementEvidence(
        serializeToolcraftPerformanceMeasurement({
          evidenceType: "performance-measurement-metrics",
          kind,
          metrics: {
            droppedFrameCount: immutableResult.droppedFrameCount,
            droppedFrameRatio: immutableResult.droppedFrameRatio,
            durationMs: immutableResult.durationMs,
            frameGapP50Ms: immutableResult.frameGapP50Ms,
            frameGapP95Ms: immutableResult.frameGapP95Ms,
            frameGapP99Ms: immutableResult.frameGapP99Ms,
            longTaskCount: immutableResult.longTaskCount,
            longTaskMaxMs: immutableResult.longTaskMaxMs,
            maxFrameGapMs: immutableResult.maxFrameGapMs,
            sampleCount: immutableResult.sampleCount,
          },
          pathId: options.pathId,
          phase: options.phase,
          profile: options.profile,
        }),
      );
    }
  }
  return immutableResult;
}
