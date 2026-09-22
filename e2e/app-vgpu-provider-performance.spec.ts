import { expect } from "@playwright/test";
import { deriveToolcraftPerformancePaths, TOOLCRAFT_CANVAS_RENDER_SCALE } from "@/toolcraft/runtime";

import { appPerformance } from "../src/app/app-performance";
import { appSchema } from "../src/app/app-schema";
import { appPerformancePathAdapters } from "./app-performance-path-adapters";
import {
  changeImpulse,
  selectOption,
  supplementalNames,
  vgpuEnabled,
  waitTwoAnimationFrames,
} from "./app-vgpu-provider-test-support";
import { expectToolcraftCanvasBackingPixelsForRenderScale } from "./browser-render-scale-evidence";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
import {
  expectNoToolcraftVgpuPageErrors,
  expectToolcraftVgpuRuntime,
  test,
} from "./renderer-provider-runtime-evidence";
import {
  runPhysicalFeedbackGroupedCanvasCase,
  runPhysicalFeedbackMaximumCanvasCase,
} from "./vgpu-performance-canvas-browser-case";

test.skip(!vgpuEnabled, "VGPU browser proof is demand-only.");

type AdapterOutcome = Readonly<{
  canvasCount: number; fieldEnabled: string | null; frames: string | null;
  gpuDisposals: number; impulse: string | null; playing: string | null;
  renderedTime: string | null; status: string | null;
}>;
function asAdapterOutcome(value: unknown): AdapterOutcome {
  if (typeof value !== "object" || value === null) {
    throw new Error("VGPU performance adapter returned no product outcome.");
  }
  return value as AdapterOutcome;
}

test(supplementalNames.playbackExport, async ({ page }) => {
  await expectToolcraftVgpuRuntime(page, { impulse: () => changeImpulse(page), playback: "preserve" });
  await selectOption(page, "export.image.resolution", "2K");
  const canvas = page.locator('canvas[data-toolcraft-vgpu-product=""]');
  const play = page.getByRole("button", { name: "Play playback" });
  if (await play.isVisible()) await play.click();
  await expect(canvas).toHaveAttribute("data-vgpu-playing", "true");
  const before = await canvas.getAttribute("data-vgpu-rendered-time");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG" }).click();
  const artifact = await inspectToolcraftImageDownload({
    backgroundRgba: [20, 31, 56, 255], download: await download, page });
  const pixels = artifact.observation.normalizedPixels;
  expect(Array.from(pixels.slice(0, 4))).toEqual([20, 31, 56, 255]);
  expect(Array.from(pixels.slice((32 * 64 + 32) * 4, (32 * 64 + 32) * 4 + 4)))
    .not.toEqual([20, 31, 56, 255]);
  expect(await canvas.getAttribute("data-vgpu-playing")).toBe("true");
  await expect.poll(() => canvas.getAttribute("data-vgpu-rendered-time")).not.toBe(before);
  await expectNoToolcraftVgpuPageErrors(page);
});

test(supplementalNames.phaseAdapters, async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000);
  const paths = deriveToolcraftPerformancePaths(appSchema, appPerformance);
  const cases = [
    { kind: "impulse", path: paths.find(({ interaction }) => interaction === "control-drag") },
    { kind: "disable", path: paths.find(({ targets }) => targets.includes("simulation.enabled:disable")) },
    { kind: "enable", path: paths.find(({ targets }) => targets.includes("simulation.enabled:enable")) },
    { kind: "playback", path: paths.find(({ interaction }) => interaction === "timeline-playback") },
  ] as const;
  for (const entry of cases) {
    if (!entry.path) throw new Error(`Missing ${entry.kind} performance path.`);
    const adapter = appPerformancePathAdapters.find(({ pathId }) => pathId === entry.path!.id);
    if (!(adapter?.action && adapter.observeOutcome && adapter.preparePhase && adapter.settlePhase)) {
      throw new Error(`Incomplete ${entry.kind} performance adapter hooks.`);
    }
    await adapter.prepare(page);
    const selector = 'canvas[data-toolcraft-vgpu-product=""]';
    const cssSize = await expectToolcraftCanvasBackingPixelsForRenderScale(page, selector,
      TOOLCRAFT_CANVAS_RENDER_SCALE.defaultValue, { state: `${entry.kind}-initial` });
    for (const phase of ["cold", "warm", "sustained"] as const) {
      const context = Object.freeze({ page, path: entry.path, phase });
      await adapter.preparePhase(context);
      await adapter.settlePhase(context);
      await expectToolcraftCanvasBackingPixelsForRenderScale(page, selector,
        TOOLCRAFT_CANVAS_RENDER_SCALE.defaultValue,
        { baselineCssSize: cssSize, state: `${entry.kind}-${phase}-baseline` });
      const baseline = asAdapterOutcome(await adapter.observeOutcome(context));
      await waitTwoAnimationFrames(page);
      expect(asAdapterOutcome(await adapter.observeOutcome(context))).toEqual(baseline);
      await adapter.action(context);
      await expectToolcraftCanvasBackingPixelsForRenderScale(page, selector,
        TOOLCRAFT_CANVAS_RENDER_SCALE.defaultValue,
        { baselineCssSize: cssSize, state: `${entry.kind}-${phase}-outcome` });
      const outcome = asAdapterOutcome(await adapter.observeOutcome(context));
      expect(outcome).not.toEqual(baseline);
      if (entry.kind === "impulse") {
        expect(baseline).toMatchObject({ fieldEnabled: "true", impulse: "0.1", status: "ready" });
        expect(outcome).toMatchObject({ impulse: "1", status: "ready" });
        expect(Number(outcome.frames)).toBeGreaterThan(Number(baseline.frames));
      } else if (entry.kind === "disable") {
        expect(baseline).toMatchObject({ canvasCount: 1, fieldEnabled: "true" });
        expect(outcome).toMatchObject({ canvasCount: 1, fieldEnabled: "false", status: "disabled" });
        expect(outcome.gpuDisposals).toBeGreaterThan(baseline.gpuDisposals);
        expect(outcome.frames).toBe(baseline.frames);
      } else if (entry.kind === "enable") {
        expect(baseline).toMatchObject({ canvasCount: 1, fieldEnabled: "false", status: "disabled" });
        expect(outcome).toMatchObject({ canvasCount: 1, fieldEnabled: "true", status: "ready" });
      } else {
        expect(baseline).toMatchObject({ playing: "false", renderedTime: "0.000" });
        expect(outcome.playing).toBe("false");
        expect(outcome.renderedTime).not.toBe("0.000");
      }
      await waitTwoAnimationFrames(page);
      expect(asAdapterOutcome(await adapter.observeOutcome(context))).toEqual(outcome);
    }
  }
  await runPhysicalFeedbackMaximumCanvasCase(page);
});

test(supplementalNames.canvasPath, async ({ page }) => {
  test.setTimeout(240_000);
  await runPhysicalFeedbackGroupedCanvasCase(page, supplementalNames.canvasPath);
});
