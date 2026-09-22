import { expect } from "@playwright/test";
import { appPerformancePaths } from "../src/app/app-performance";
import type {
  ToolcraftPerformanceCanvasBacking,
  ToolcraftPerformancePathAdapter,
} from "./performance-path-adapter-contract";
import {
  createPhysicalFeedbackFixtureApplications,
  preparePhysicalFeedbackExportPerformance,
  preparePhysicalFeedbackPerformance,
} from "./vgpu-performance-fixture-support";
import {
  performPhysicalFeedbackPathAction,
  preparePhysicalFeedbackPathPhase,
} from "./vgpu-performance-phase-actions";
import { observePhysicalFeedbackOutcome } from "./vgpu-performance-outcome";
import { settlePhysicalFeedbackPreparedPhase } from "./vgpu-performance-settlement";

export const appPerformanceCanvasBacking:
  | ToolcraftPerformanceCanvasBacking
  | undefined = Object.freeze({
  canvasSelector: 'canvas[data-toolcraft-vgpu-product=""]',
});

export const appPerformancePathAdapters = appPerformancePaths.map(
  (path): ToolcraftPerformancePathAdapter => {
    const common = {
      pathId: path.id,
      ...(path.targets.includes("canvas.renderScale")
        ? { preparationRenderScale: 1 }
        : {}),
      prepare: preparePhysicalFeedbackPerformance,
      preparePhase: ({ page }: { page: Parameters<
        typeof preparePhysicalFeedbackPathPhase
      >[0] }) =>
        preparePhysicalFeedbackPathPhase(
          page,
          path.interaction,
          path.targets,
        ),
      settlePhase: ({ page }: { page: Parameters<
        typeof settlePhysicalFeedbackPreparedPhase
      >[0] }) => settlePhysicalFeedbackPreparedPhase(page),
      ...(path.workloadDimensions.length > 0
        ? {
            fixtureApplications: (page: Parameters<
              typeof createPhysicalFeedbackFixtureApplications
            >[0]) =>
              createPhysicalFeedbackFixtureApplications(
                page,
                path.workloadDimensions,
              ),
          }
        : {}),
    };
    if (path.interaction === "export") {
      return {
        ...common,
        prepare: preparePhysicalFeedbackExportPerformance,
        output: {
          kind: "download",
          label: "Export PNG",
          verify: async (download) => {
            const stream = await download.createReadStream();
            let bytes = 0;
            for await (const chunk of stream) bytes += chunk.length;
            expect(bytes).toBeGreaterThan(100);
          },
        },
      };
    }
    return {
      ...common,
      action: ({ page }) =>
        performPhysicalFeedbackPathAction(
          page,
          path.interaction,
          path.targets,
        ),
      ...(new Set([
        "control-change",
        "control-drag",
        "timeline-playback",
        "timeline-scrub",
      ]).has(path.interaction)
        ? { observeOutcome: ({ page }) => observePhysicalFeedbackOutcome(page) }
        : {
            verifyOutcome: async ({ page }) => {
              await expect(
                page.locator('canvas[data-toolcraft-vgpu-product=""]'),
              ).toBeVisible();
            },
          }),
    };
  },
);
