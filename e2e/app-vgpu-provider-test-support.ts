import fs from "node:fs";
import path from "node:path";

import { expect, type Locator, type Page } from "@playwright/test";
import {
  createToolcraftState,
  getToolcraftImageExportSize,
  type ToolcraftArtifactSize,
  type ToolcraftExportFrame,
} from "@/toolcraft/runtime";

import { appAcceptance, appControlSectionInventory } from "../src/app/app-acceptance";
import { appSchema } from "../src/app/app-schema";
import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import { deriveToolcraftBrowserRuntimeRequirements } from "./browser-runtime-evidence-requirements";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
import { expectNoToolcraftVgpuPageErrors } from "./renderer-provider-runtime-evidence";

const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
};
export const vgpuEnabled = typeof packageJson.dependencies?.vgpu === "string";
export const scenarioNames = Object.freeze({
  export: "browser vgpu: image export uses scene bounds",
  finite: "browser vgpu: finite scene at render scale 2",
  infinity: "browser vgpu: Infinity scene bounds",
  timeline: "browser vgpu: timeline reset and replay",
  teardown: "browser vgpu: unmount disposes owned resources",
  unsupported: "browser vgpu: unsupported state rejects export",
  viewport: "browser vgpu: viewport interaction coalesces and resumes",
});
export const acceptanceNames = Object.freeze({
  backgroundColor: "browser acceptance: VGPU background color reaches export",
  backgroundInclusion: "browser acceptance: VGPU background inclusion controls output",
  format: "browser acceptance: VGPU image formats remain selectable",
  impulse: "browser acceptance: VGPU impulse changes rendered pixels",
  infinityExport: "browser acceptance: VGPU export preserves framing across Infinity",
  resolution: "browser acceptance: VGPU image resolutions remain selectable",
  viewportZoom: "browser acceptance: VGPU canvas zoom coalesces and resumes",
});
export const supplementalNames = Object.freeze({
  canvasPath: "browser perf: VGPU grouped canvas phases commit fixed scale 1 to 2",
  phaseAdapters: "browser supplemental: VGPU performance adapters repeat every phase",
  playbackExport: "browser supplemental: VGPU export serializes with active playback",
});

function getCurrentVgpuExportSize(frame: ToolcraftExportFrame): ToolcraftArtifactSize {
  const state = createToolcraftState(appSchema);
  const { height, width } = getToolcraftImageExportSize({
    frame,
    resolution: "4k",
    state,
  });
  return { height, width };
}

export function getCurrentVgpuFiniteExportExpectation(): ToolcraftArtifactSize {
  const { height, width } = createToolcraftState(appSchema).canvas.size;
  return getCurrentVgpuExportSize({ height, width, x: 0, y: 0 });
}


export async function attachScenarioEvidence(
  page: Page, testName: string, emitted: ReadonlySet<string> = new Set(),
): Promise<void> {
  const requirements = deriveToolcraftBrowserRuntimeRequirements(
    appAcceptance, appSchema, appControlSectionInventory,
  ).filter((requirement) => requirement.testName === testName);
  expect(requirements.length).toBeGreaterThan(0);
  for (const requirement of requirements) {
    if (emitted.has(`${requirement.requirementId}:${requirement.evidenceType}`)) continue;
    await attachToolcraftBrowserRuntimeEvidence({ evidenceType: requirement.evidenceType,
      requirementId: requirement.requirementId, target: requirement.target });
  }
  await expectNoToolcraftVgpuPageErrors(page);
}

export function target(page: Page, name: string) {
  return page.locator(`[data-toolcraft-control-target="${name}"]`);
}

export async function selectOption(page: Page, controlTarget: string, optionName: string) {
  const trigger = target(page, controlTarget).getByRole("combobox");
  await trigger.click();
  await page.locator('[data-slot="select-item"]').filter({ hasText: optionName }).click();
  await expect(trigger).toContainText(optionName);
}

export async function exportAndInspectPng(
  page: Page,
  backgroundRgba: readonly [number, number, number, number],
) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG" }).click();
  return inspectToolcraftImageDownload({
    backgroundRgba,
    download: await downloadPromise,
    page,
  });
}

export async function changeImpulse(page: Page) {
  const canvas = page.locator('canvas[data-toolcraft-vgpu-product=""]');
  const previous = Number(await canvas.getAttribute("data-vgpu-frame-count"));
  await target(page, "simulation.impulse").getByRole("slider").press("End");
  await expect.poll(async () => Number(await canvas.getAttribute("data-vgpu-frame-count")))
    .toBeGreaterThan(previous);
}

export type VgpuRendererContinuityObservation = Readonly<{
  allocations: Readonly<{
    presentation: string | null;
    resource: string | null;
  }>;
  boundary: Readonly<{
    editable: boolean;
    height: number;
    infinite: boolean;
    mode: string | null;
    overflow: string;
    width: number;
  }>;
  camera: Readonly<{
    offsetX: string | null;
    offsetY: string | null;
    transform: string;
    zoom: string | null;
  }>;
  canvas: Readonly<{
    backing: Readonly<{ height: number; width: number }>;
    backingAttribute: string | null;
    css: Readonly<{ height: number; width: number }>;
    viewport: Readonly<{
      height: number;
      left: number;
      top: number;
      width: number;
    }>;
  }>;
  frameCount: number;
  lifecycle: Readonly<{
    epoch: string | null;
    gpuDisposals: string | null;
    presentationDisposals: string | null;
    retirementSettled: string | null;
    retirementStarted: string | null;
  }>;
  operations: Readonly<{
    settled: string | null;
    started: string | null;
  }>;
  pixels: Readonly<{ byteLength: number; hash: string }>;
  product: Readonly<{
    css: Readonly<{
      height: number;
      left: number;
      top: number;
      width: number;
    }>;
    viewport: Readonly<{
      height: number;
      left: number;
      top: number;
      width: number;
    }>;
  }>;
}>;

async function hasSettledVgpuOperations(page: Page): Promise<boolean> {
  const canvas = page.locator('canvas[data-toolcraft-vgpu-product=""]');
  const [
    operationSettled,
    operationStarted,
    retirementSettled,
    retirementStarted,
  ] = await Promise.all([
      canvas.getAttribute("data-vgpu-operation-settled"),
      canvas.getAttribute("data-vgpu-operation-started"),
      canvas.getAttribute("data-vgpu-retirement-settled"),
      canvas.getAttribute("data-vgpu-retirement-started"),
    ]);
  return (
    operationSettled !== null &&
    operationSettled === operationStarted &&
    retirementSettled !== null &&
    retirementSettled === retirementStarted
  );
}

export async function waitForVgpuRendererSettlement(page: Page): Promise<void> {
  await expect.poll(() => hasSettledVgpuOperations(page)).toBe(true);
  await waitTwoAnimationFrames(page);
  await expect.poll(() => hasSettledVgpuOperations(page)).toBe(true);
}

export async function observeVgpuRendererContinuity(
  page: Page,
): Promise<VgpuRendererContinuityObservation> {
  const canvas = page.locator('canvas[data-toolcraft-vgpu-product=""]');
  return canvas.evaluate((element) => {
    const product = document.querySelector<HTMLElement>(
      '[data-toolcraft-product-scene-status="ready"]',
    );
    const surface = document.querySelector<HTMLElement>(
      '[data-toolcraft-canvas-surface=""]',
    );
    const world = document.querySelector<HTMLElement>(
      '[data-toolcraft-canvas-world=""]',
    );
    const wrapper = element.closest<HTMLElement>('[data-vgpu-wrapper=""]');
    if (!product || !surface || !world || !wrapper) {
      throw new Error("VGPU continuity requires mounted renderer layout nodes.");
    }
    const frameCountAttribute = element.getAttribute("data-vgpu-frame-count");
    if (
      frameCountAttribute === null ||
      !/^(0|[1-9]\d*)$/u.test(frameCountAttribute)
    ) {
      throw new Error("VGPU continuity requires a canonical frame count.");
    }
    const frameCount = Number(frameCountAttribute);
    if (!Number.isSafeInteger(frameCount) || frameCount < 0) {
      throw new Error("VGPU continuity requires a canonical frame count.");
    }
    const productStyle = getComputedStyle(product);
    const productRect = product.getBoundingClientRect();
    const surfaceStyle = getComputedStyle(surface);
    const surfaceRect = surface.getBoundingClientRect();
    const canvasStyle = getComputedStyle(element);
    const canvasRect = element.getBoundingClientRect();
    const context = element.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("VGPU continuity requires Canvas2D readback.");
    const data = context.getImageData(0, 0, element.width, element.height).data;
    let hash = 0x811c9dc5;
    for (const value of data) {
      hash = Math.imul(hash ^ value, 0x01000193);
    }
    return {
      allocations: {
        presentation: element.getAttribute(
          "data-vgpu-presentation-allocation-id",
        ),
        resource: element.getAttribute("data-vgpu-resource-allocation-id"),
      },
      boundary: {
        editable: surface.hasAttribute("data-toolcraft-editable-canvas"),
        height: surfaceRect.height,
        infinite: surface.hasAttribute("data-toolcraft-infinite-scene"),
        mode: surface.getAttribute("data-toolcraft-canvas-mode"),
        overflow: surfaceStyle.overflow,
        width: surfaceRect.width,
      },
      camera: {
        offsetX: world.getAttribute("data-toolcraft-canvas-offset-x"),
        offsetY: world.getAttribute("data-toolcraft-canvas-offset-y"),
        transform: getComputedStyle(world).transform,
        zoom: world.getAttribute("data-toolcraft-canvas-zoom"),
      },
      canvas: {
        backing: { height: element.height, width: element.width },
        backingAttribute: element.getAttribute("data-toolcraft-gpu-backing"),
        css: {
          height: Number.parseFloat(canvasStyle.height),
          width: Number.parseFloat(canvasStyle.width),
        },
        viewport: {
          height: canvasRect.height,
          left: canvasRect.left,
          top: canvasRect.top,
          width: canvasRect.width,
        },
      },
      frameCount,
      lifecycle: {
        epoch: element.getAttribute("data-vgpu-renderer-epoch"),
        gpuDisposals: wrapper.getAttribute("data-vgpu-gpu-disposals"),
        presentationDisposals: wrapper.getAttribute(
          "data-vgpu-presentation-disposals",
        ),
        retirementSettled: element.getAttribute(
          "data-vgpu-retirement-settled",
        ),
        retirementStarted: element.getAttribute(
          "data-vgpu-retirement-started",
        ),
      },
      operations: {
        settled: element.getAttribute("data-vgpu-operation-settled"),
        started: element.getAttribute("data-vgpu-operation-started"),
      },
      pixels: {
        byteLength: data.byteLength,
        hash: `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`,
      },
      product: {
        css: {
          height: Number.parseFloat(productStyle.height),
          left: Number.parseFloat(productStyle.left),
          top: Number.parseFloat(productStyle.top),
          width: Number.parseFloat(productStyle.width),
        },
        viewport: {
          height: productRect.height,
          left: productRect.left,
          top: productRect.top,
          width: productRect.width,
        },
      },
    };
  });
}

export function expectVgpuRendererTransitionStable(
  before: VgpuRendererContinuityObservation,
  after: VgpuRendererContinuityObservation,
): void {
  expect(after.allocations).toEqual(before.allocations);
  expect(after.camera).toEqual(before.camera);
  expect(after.canvas).toEqual(before.canvas);
  expect(after.frameCount).toBe(before.frameCount);
  expect(after.lifecycle).toEqual(before.lifecycle);
  expect(after.operations).toEqual(before.operations);
  expect(after.pixels).toEqual(before.pixels);
  expect(after.product).toEqual(before.product);
}

export function canvasScreenshot(page: Page) {
  return page.locator('canvas[data-toolcraft-vgpu-product=""]').screenshot();
}

export async function waitTwoAnimationFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

export async function pressTimelineAndWaitForPresentation(
  page: Page, scrubber: Locator, key: "ArrowLeft" | "ArrowRight" | "End" | "Home",
) {
  const canvas = page.locator('canvas[data-toolcraft-vgpu-product=""]');
  const previous = Number(await canvas.getAttribute("data-vgpu-frame-count"));
  await scrubber.press(key);
  await expect.poll(async () => Number(await canvas.getAttribute("data-vgpu-frame-count")))
    .toBeGreaterThan(previous);
}
