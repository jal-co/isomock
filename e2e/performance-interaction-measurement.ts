import type { Frame, Page } from "@playwright/test";
import { performance as nodePerformance } from "node:perf_hooks";
import { isDeepStrictEqual } from "node:util";

import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import {
  finalizeToolcraftMeasurement,
  type ToolcraftFrameProbeResult,
  type ToolcraftInteractionOptions,
  type ToolcraftInteractionResult,
} from "./performance-measurement-evidence";
import {
  mergeToolcraftFrameProbeResults,
  startToolcraftFrameProbe,
} from "./performance-frame-probe";
import {
  expectToolcraftPersistentExpectedOutcome,
  expectToolcraftPersistentOutcomeChange,
  expectToolcraftStableOutcomeBaseline,
  snapshotToolcraftOutcome,
  waitForToolcraftExpectedOutcome,
  waitForToolcraftOutcomeChange,
} from "./stable-outcome-helpers";

export async function measureToolcraftInteraction(
  page: Page,
  action: () => Promise<void>,
  options: ToolcraftInteractionOptions = {},
): Promise<ToolcraftInteractionResult> {
  const hasExpectedOutcome = Object.prototype.hasOwnProperty.call(
    options,
    "expectedOutcome",
  );
  const outcomeMessage = `Toolcraft performance outcome "${options.pathId ?? "interaction"}" should ${hasExpectedOutcome ? "reach the expected state" : "change"} after the measured action.`;
  const outcomeBefore = options.observeOutcome
    ? snapshotToolcraftOutcome(
        await options.observeOutcome(),
        outcomeMessage,
      )
    : undefined;
  const stableOutcomeOptions = {
    baselineStabilityIntervalMs: options.baselineStabilityIntervalMs,
    baselineStabilitySamples: options.baselineStabilitySamples,
    message: outcomeMessage,
    pollIntervalMs: options.outcomePollIntervalMs ?? 16,
    stabilityIntervalMs: options.stabilityIntervalMs,
    stabilitySamples: options.stabilitySamples,
    timeoutMs: options.outcomeTimeoutMs,
  };
  if (options.observeOutcome) {
    await expectToolcraftStableOutcomeBaseline(
      options.observeOutcome,
      outcomeBefore,
      stableOutcomeOptions,
    );
  }
  const expectedOutcome = hasExpectedOutcome
    ? snapshotToolcraftOutcome(options.expectedOutcome, outcomeMessage)
    : undefined;
  if (hasExpectedOutcome) {
    if (!options.observeOutcome) {
      throw new Error(
        `${outcomeMessage} expectedOutcome requires observeOutcome.`,
      );
    }
    if (isDeepStrictEqual(outcomeBefore, expectedOutcome)) {
      throw new Error(
        `${outcomeMessage} The expected state must differ from the pre-action state.`,
      );
    }
  }
  let stopProbe = await startToolcraftFrameProbe(page);
  const frameProbeSegments: ToolcraftFrameProbeResult[] = [];
  let probeRestart = Promise.resolve();
  const restartProbeAfterNavigation = (frame: Frame) => {
    if (frame !== page.mainFrame()) return;
    probeRestart = probeRestart.then(async () => {
      frameProbeSegments.push(await stopProbe());
      stopProbe = await startToolcraftFrameProbe(page);
    });
  };
  page.on("framenavigated", restartProbeAfterNavigation);
  const startedAt = nodePerformance.now();
  let measuredEndedAt: number | undefined;
  let outcomeObservationCancelled = false;
  const observeMeasuredOutcome = async () => {
    if (outcomeObservationCancelled) {
      throw new Error("Toolcraft performance outcome observation was cancelled.");
    }
    return options.observeOutcome!();
  };
  const firstOutcomePromise = options.observeOutcome
    ? hasExpectedOutcome
      ? waitForToolcraftExpectedOutcome(
          observeMeasuredOutcome,
          expectedOutcome,
          {
            message: outcomeMessage,
            onFirstChange: () => {
              measuredEndedAt = nodePerformance.now();
            },
            pollIntervalMs: options.outcomePollIntervalMs ?? 16,
            timeoutMs: options.outcomeTimeoutMs,
          },
        )
      : waitForToolcraftOutcomeChange(
        observeMeasuredOutcome,
        outcomeBefore,
        {
          message: outcomeMessage,
          onFirstChange: () => {
            measuredEndedAt = nodePerformance.now();
          },
          pollIntervalMs: options.outcomePollIntervalMs ?? 16,
          timeoutMs: options.outcomeTimeoutMs,
        },
        )
    : undefined;
  const firstOutcomeResultPromise = firstOutcomePromise?.then(
    () => ({ status: "fulfilled" as const }),
    (reason: unknown) => ({ reason, status: "rejected" as const }),
  );

  try {
    await action();
    await probeRestart;

    const actionEndedAt = nodePerformance.now();

    if (firstOutcomeResultPromise && options.observeOutcome) {
      const firstOutcomeResult = await firstOutcomeResultPromise;
      if (firstOutcomeResult.status === "rejected") {
        throw firstOutcomeResult.reason;
      }
      if (hasExpectedOutcome) {
        await expectToolcraftPersistentExpectedOutcome(
          options.observeOutcome,
          expectedOutcome,
          stableOutcomeOptions,
        );
      } else {
        await expectToolcraftPersistentOutcomeChange(
          options.observeOutcome,
          outcomeBefore,
          stableOutcomeOptions,
        );
      }
      if (options.pathId) {
        await attachToolcraftBrowserRuntimeEvidence({
          evidenceType: "performance-product-outcome",
          requirementId: options.pathId,
          target: options.target,
        });
      }
    }

    await waitForToolcraftAnimationFrames(
      page,
      Math.max(1, options.settleFrames ?? 3),
    );

    if (options.settleMs && options.settleMs > 0) {
      await page.waitForTimeout(options.settleMs);
    }

    frameProbeSegments.push(await stopProbe());
    const frameProbe = mergeToolcraftFrameProbeResults(frameProbeSegments);

    return finalizeToolcraftMeasurement({
      durationMs: (measuredEndedAt ?? actionEndedAt) - startedAt,
      ...frameProbe,
    }, options, "interaction");
  } catch (error) {
    outcomeObservationCancelled = true;
    void firstOutcomeResultPromise;
    await probeRestart.catch(() => undefined);
    await stopProbe();
    throw error;
  } finally {
    page.off("framenavigated", restartProbeAfterNavigation);
  }
}

export async function measureToolcraftAnimationFrames(
  page: Page,
  frameCount = 120,
  options: ToolcraftInteractionOptions = {},
): Promise<ToolcraftInteractionResult> {
  if (frameCount < 120) {
    throw new Error("Animation performance probes must sample at least 120 frames.");
  }

  const stopProbe = await startToolcraftFrameProbe(page);
  const startedAt = await page.evaluate(() => performance.now());

  try {
    await waitForToolcraftAnimationFrames(page, frameCount);

    if (options.settleFrames && options.settleFrames > 0) {
      await waitForToolcraftAnimationFrames(page, options.settleFrames);
    }

    if (options.settleMs && options.settleMs > 0) {
      await page.waitForTimeout(options.settleMs);
    }

    const endedAt = await page.evaluate(() => performance.now());
    const frameProbe = await stopProbe();

    return finalizeToolcraftMeasurement({
      durationMs: endedAt - startedAt,
      ...frameProbe,
    }, options, "animation-frames");
  } catch (error) {
    await stopProbe();
    throw error;
  }
}

export async function waitForToolcraftAnimationFrames(page: Page, count: number): Promise<void> {
  if (count <= 0) {
    return;
  }

  await page.evaluate(
    (frameCount) =>
      new Promise<void>((resolve) => {
        let remainingFrames = frameCount;

        const tick = () => {
          remainingFrames -= 1;

          if (remainingFrames <= 0) {
            resolve();
            return;
          }

          requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
      }),
    count,
  );
}
