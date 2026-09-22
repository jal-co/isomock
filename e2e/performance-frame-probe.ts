import type { Page } from "@playwright/test";

import type { ToolcraftFrameProbeResult } from "./performance-measurement-evidence";
import { getToolcraftFrameDistributionMetrics } from "./performance-frame-metrics";

let frameProbeReporterSequence = 0;

type ToolcraftRawFrameProbeResult = {
  frameGapsMs: number[];
  longTaskCount: number;
  longTaskMaxMs: number;
};

function emptyToolcraftRawFrameProbeResult(): ToolcraftRawFrameProbeResult {
  return { frameGapsMs: [], longTaskCount: 0, longTaskMaxMs: 0 };
}

function finalizeToolcraftFrameProbeResult(
  result: ToolcraftRawFrameProbeResult,
): ToolcraftFrameProbeResult {
  const frameGapsMs = Object.freeze([...result.frameGapsMs]);
  return Object.freeze({
    ...getToolcraftFrameDistributionMetrics(frameGapsMs),
    frameGapsMs,
    longTaskCount: result.longTaskCount,
    longTaskMaxMs: result.longTaskMaxMs,
  });
}

export function mergeToolcraftFrameProbeResults(
  results: readonly ToolcraftFrameProbeResult[],
): ToolcraftFrameProbeResult {
  return finalizeToolcraftFrameProbeResult(
    results.reduce<ToolcraftRawFrameProbeResult>(
      (merged, result) => ({
        frameGapsMs: [...merged.frameGapsMs, ...result.frameGapsMs],
        longTaskCount: merged.longTaskCount + result.longTaskCount,
        longTaskMaxMs: Math.max(merged.longTaskMaxMs, result.longTaskMaxMs),
      }),
      emptyToolcraftRawFrameProbeResult(),
    ),
  );
}

export async function startToolcraftFrameProbe(
  page: Page,
): Promise<() => Promise<ToolcraftFrameProbeResult>> {
  type FrameProbeReport = {
    kind: "checkpoint" | "final";
    result: ToolcraftRawFrameProbeResult;
  };
  let reportedCheckpoint = emptyToolcraftRawFrameProbeResult();
  const reportedFinalSegments: ToolcraftRawFrameProbeResult[] = [];
  const reporterName = `__toolcraftReportFrameProbe${++frameProbeReporterSequence}`;
  await page.exposeBinding(
    reporterName,
    (_source, report: FrameProbeReport) => {
      if (report.kind === "final") {
        reportedFinalSegments.push(report.result);
        return;
      }
      reportedCheckpoint = {
        frameGapsMs: [
          ...reportedCheckpoint.frameGapsMs,
          ...report.result.frameGapsMs,
        ],
        longTaskCount:
          reportedCheckpoint.longTaskCount + report.result.longTaskCount,
        longTaskMaxMs: Math.max(
          reportedCheckpoint.longTaskMaxMs,
          report.result.longTaskMaxMs,
        ),
      };
    },
  );
  const probeId = await page.evaluate((currentReporterName) => {
    type FrameProbeReport = {
      kind: "checkpoint" | "final";
      result: ToolcraftRawFrameProbeResult;
    };
    type FrameProbe = {
      active: boolean;
      id: number;
      frameGapsMs: number[];
      longTaskCount: number;
      longTaskMaxMs: number;
      observer?: PerformanceObserver;
      pageHideHandler?: () => void;
      pendingFrameGapsMs: number[];
      reportedMaxFrameGapMs: number;
      rafId: number;
    };
    const win = window as Window & {
      __toolcraftCompletedFrameProbes?: Record<number, ToolcraftRawFrameProbeResult>;
      __toolcraftFrameProbe?: FrameProbe;
      __toolcraftFrameProbeSequence?: number;
      __toolcraftStopFrameProbe?: (probeId: number) => ToolcraftRawFrameProbeResult;
    };

    const emptyResult = (): ToolcraftRawFrameProbeResult => ({
      frameGapsMs: [],
      longTaskCount: 0,
      longTaskMaxMs: 0,
    });
    const reportProbe = (report: FrameProbeReport) => {
      const reporter = (
        win as unknown as Record<
          string,
          ((value: FrameProbeReport) => Promise<void>) | undefined
        >
      )[currentReporterName];
      void reporter?.(report);
    };
    const disposeProbe = (probe: FrameProbe): ToolcraftRawFrameProbeResult => {
      probe.active = false;
      cancelAnimationFrame(probe.rafId);
      probe.observer?.disconnect();
      if (probe.pageHideHandler) {
        window.removeEventListener("pagehide", probe.pageHideHandler);
      }
      return {
        frameGapsMs: [...probe.frameGapsMs],
        longTaskCount: probe.longTaskCount,
        longTaskMaxMs: probe.longTaskMaxMs,
      };
    };

    win.__toolcraftCompletedFrameProbes ??= {};
    if (win.__toolcraftFrameProbe) {
      const previousProbe = win.__toolcraftFrameProbe;
      if (previousProbe.active) {
        win.__toolcraftCompletedFrameProbes[previousProbe.id] =
          disposeProbe(previousProbe);
      }
      win.__toolcraftFrameProbe = undefined;
    }

    const id = (win.__toolcraftFrameProbeSequence ?? 0) + 1;
    win.__toolcraftFrameProbeSequence = id;
    let lastFrame = performance.now();
    win.__toolcraftFrameProbe = {
      active: true,
      frameGapsMs: [],
      id,
      longTaskCount: 0,
      longTaskMaxMs: 0,
      pendingFrameGapsMs: [],
      reportedMaxFrameGapMs: 0,
      rafId: 0,
    };

    try {
      win.__toolcraftFrameProbe.observer = new PerformanceObserver((list) => {
        const probe = win.__toolcraftFrameProbe;
        if (!probe?.active || probe.id !== id) {
          return;
        }

        for (const entry of list.getEntries()) {
          probe.longTaskCount += 1;
          probe.longTaskMaxMs = Math.max(probe.longTaskMaxMs, entry.duration);
          reportProbe({
            kind: "checkpoint",
            result: {
              ...emptyResult(),
              longTaskCount: 1,
              longTaskMaxMs: entry.duration,
            },
          });
        }
      });
      win.__toolcraftFrameProbe.observer.observe({ entryTypes: ["longtask"] });
    } catch {
      // Some browser contexts do not expose longtask entries. Frame gaps still catch jank.
    }

    const tick = (now: number) => {
      const probe = win.__toolcraftFrameProbe;
      if (!probe?.active || probe.id !== id) {
        return;
      }

      if (document.visibilityState === "hidden") {
        lastFrame = now;
        probe.rafId = requestAnimationFrame(tick);
        return;
      }

      const frameGapMs = Math.max(0, now - lastFrame);
      probe.frameGapsMs.push(frameGapMs);
      probe.pendingFrameGapsMs.push(frameGapMs);
      lastFrame = now;
      const nextMaxFrameGapMs = Math.max(
        probe.reportedMaxFrameGapMs,
        frameGapMs,
      );
      if (
        nextMaxFrameGapMs > probe.reportedMaxFrameGapMs ||
        probe.pendingFrameGapsMs.length >= 30
      ) {
        reportProbe({
          kind: "checkpoint",
          result: {
            ...emptyResult(),
            frameGapsMs: probe.pendingFrameGapsMs.splice(0),
          },
        });
        probe.reportedMaxFrameGapMs = nextMaxFrameGapMs;
      }
      probe.rafId = requestAnimationFrame(tick);
    };

    const reportOnPageHide = () => {
      const probe = win.__toolcraftFrameProbe;
      if (!probe?.active || probe.id !== id) return;

      const result = disposeProbe(probe);
      win.__toolcraftFrameProbe = undefined;
      reportProbe({ kind: "final", result });
    };
    win.__toolcraftFrameProbe.pageHideHandler = reportOnPageHide;
    window.addEventListener("pagehide", reportOnPageHide, { once: true });
    win.__toolcraftFrameProbe.rafId = requestAnimationFrame(tick);
    win.__toolcraftStopFrameProbe = (targetProbeId) => {
      const completedProbes = win.__toolcraftCompletedFrameProbes;
      if (
        completedProbes &&
        Object.prototype.hasOwnProperty.call(completedProbes, targetProbeId)
      ) {
        const completed = completedProbes[targetProbeId]!;
        delete completedProbes[targetProbeId];
        return completed;
      }

      const probe = win.__toolcraftFrameProbe;
      if (!probe || probe.id !== targetProbeId) return emptyResult();

      const result = disposeProbe(probe);
      win.__toolcraftFrameProbe = undefined;
      return result;
    };
    return id;
  }, reporterName);

  let stoppedResult: ToolcraftFrameProbeResult | undefined;
  return async () => {
    if (stoppedResult) return stoppedResult;

    let currentSegment: ToolcraftRawFrameProbeResult | undefined;
    try {
      currentSegment = await page.evaluate((targetProbeId) => {
        const win = window as Window & {
          __toolcraftStopFrameProbe?: (probeId: number) => ToolcraftRawFrameProbeResult;
        };

        return win.__toolcraftStopFrameProbe?.(targetProbeId);
      }, probeId);
    } catch {
      // Incremental checkpoints preserve the segment when navigation destroys the old context.
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    const preservedSegments = currentSegment
      ? [currentSegment]
      : reportedFinalSegments.length > 0
        ? reportedFinalSegments
        : [reportedCheckpoint];
    stoppedResult = mergeToolcraftFrameProbeResults(
      preservedSegments.map(finalizeToolcraftFrameProbeResult),
    );
    return stoppedResult;
  };
}
