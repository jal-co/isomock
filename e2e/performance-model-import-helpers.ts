import { expect, type Locator, type Page } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import {
  getToolcraftPerformanceProfile,
  type ToolcraftModelPerformancePath,
} from "@/toolcraft/runtime";

import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { expectToolcraftPerformanceBudget } from "./performance-budget-helpers";
import {
  measureToolcraftInteraction,
  type ToolcraftInteractionResult,
} from "./performance-probe-helpers";
import type { ToolcraftModelBrowserFixture } from "./performance-model-import-fixtures";
import {
  expectToolcraftModelRenderedPixels,
  prepareToolcraftModelPixelBaseline,
} from "./performance-model-pixel-helpers";
import {
  getToolcraftPositiveZAxisScreenPoint,
  type ToolcraftBrowserOrientationPose,
} from "./performance-model-orientation-helpers";

const MODEL_LAYER_SELECTOR = "[data-canvas-model-target]";
const TERMINAL_MODEL_PHASES = new Set(["clean", "fixed", "repairable"]);

type ModelLayerSnapshot = Readonly<{
  layerId: string;
  orientation: string | null;
  phase: string;
  renderStatus: string;
}>;

async function findModelLayerMatches(
  page: Page,
  target: string,
): Promise<Readonly<{ layers: Locator; matches: number[] }>> {
  const layers = page.locator(MODEL_LAYER_SELECTOR);
  const matches: number[] = [];
  const count = await layers.count();
  for (let index = 0; index < count; index += 1) {
    if ((await layers.nth(index).getAttribute("data-canvas-model-target")) === target) {
      matches.push(index);
    }
  }
  return { layers, matches };
}

async function readModelLayerSnapshot(
  page: Page,
  target: string,
): Promise<ModelLayerSnapshot | null> {
  const { layers, matches } = await findModelLayerMatches(page, target);
  if (matches.length === 0) return null;
  if (matches.length !== 1) {
    throw new Error(
      `Model performance proof requires exactly one canvas model layer for target "${target}"; found ${matches.length}.`,
    );
  }
  const layer = layers.nth(matches[0]!);
  const phase = await layer.getAttribute("data-canvas-model-phase");
  const layerId = await layer.getAttribute("data-canvas-model-layer");
  const renderStatus = await layer.getAttribute("data-canvas-model-render-status");
  if (!phase || !layerId || !renderStatus) {
    throw new Error(
      `Model performance proof for target "${target}" requires observable phase and layer identity.`,
    );
  }
  return Object.freeze({
    layerId,
    orientation: await layer.getAttribute("data-canvas-model-orientation"),
    phase,
    renderStatus,
  });
}

async function readTerminalModelLayerSnapshot(
  page: Page,
  target: string,
): Promise<ModelLayerSnapshot | null> {
  const snapshot = await readModelLayerSnapshot(page, target);
  return snapshot && TERMINAL_MODEL_PHASES.has(snapshot.phase) && snapshot.renderStatus === "ready"
    ? snapshot
    : null;
}

async function materializeFixtureFiles(fixture: ToolcraftModelBrowserFixture): Promise<
  Readonly<{
    cleanup(): Promise<void>;
    directory: string;
    paths: readonly string[];
  }>
> {
  const directory = await mkdtemp(join(tmpdir(), "toolcraft-model-fixture-"));
  const paths = fixture.files.map(({ name }) => join(directory, basename(name)));
  try {
    await Promise.all(fixture.files.map(({ buffer }, index) => writeFile(paths[index]!, buffer)));
  } catch (error) {
    await rm(directory, { force: true, recursive: true });
    throw error;
  }
  return Object.freeze({
    cleanup: () => rm(directory, { force: true, recursive: true }),
    directory,
    paths: Object.freeze(paths),
  });
}

function modelBudget(path: ToolcraftModelPerformancePath) {
  const { thresholds } = getToolcraftPerformanceProfile(path.profile);
  const completionBudget =
    path.profile === "batch-responsive"
      ? thresholds.maxBatchCompletionMs
      : thresholds.maxVisibleOutputLatencyMs;
  if (completionBudget === undefined) {
    throw new Error(`Model performance path "${path.id}" has no central completion budget.`);
  }
  return Object.freeze({
    maxFrameGapMs: thresholds.maxFrameGapMs,
    maxInteractionMs: completionBudget,
    maxLongTaskMs: thresholds.maxLongTaskMs,
  });
}

function expectModelBudget(
  result: ToolcraftInteractionResult,
  path: ToolcraftModelPerformancePath,
): void {
  expectToolcraftPerformanceBudget(result, modelBudget(path));
}

async function getModelInputs(
  page: Page,
  target: string,
): Promise<Readonly<{ file: Locator; folder: Locator }>> {
  const field = await getToolcraftControlFieldByTarget(page, target);
  const file = field.locator('input[type="file"]:not([webkitdirectory])');
  const folder = field.locator('input[type="file"][webkitdirectory]');
  await expect(file).toHaveCount(1);
  await expect(folder).toHaveCount(1);
  await expect(folder).toHaveAttribute("directory", "");
  return Object.freeze({ file, folder });
}

async function getModelInput(
  page: Page,
  target: string,
  fixture: ToolcraftModelBrowserFixture,
): Promise<Locator> {
  const inputs = await getModelInputs(page, target);
  return fixture.files.length > 1 ? inputs.folder : inputs.file;
}

function fixtureInputFiles(
  fixture: ToolcraftModelBrowserFixture,
  materialized: Readonly<{ directory: string; paths: readonly string[] }>,
): string | string[] {
  return fixture.files.length > 1 ? materialized.directory : [...materialized.paths];
}

export async function prepareToolcraftModelPerformancePage(
  page: Page,
  target: string,
): Promise<void> {
  await page.goto("/");
  await getModelInputs(page, target);
  await expect
    .poll(
      async () => {
        const candidates = page.locator("[data-canvas-model-prewarm-target]");
        let matches = 0;
        for (let index = 0; index < (await candidates.count()); index += 1) {
          const candidate = candidates.nth(index);
          if (
            (await candidate.getAttribute("data-canvas-model-prewarm-target")) === target &&
            (await candidate.getAttribute("data-canvas-model-render-status")) === "ready"
          ) {
            matches += 1;
          }
        }
        return matches;
      },
      {
        message: `Model renderer for "${target}" must finish visible prewarming.`,
        timeout: 30_000,
      },
    )
    .toBe(1);
  await prepareToolcraftModelPixelBaseline(page, target);
}

export async function importToolcraftModelFixture(
  page: Page,
  path: ToolcraftModelPerformancePath,
  fixture: ToolcraftModelBrowserFixture,
): Promise<ModelLayerSnapshot> {
  const input = await getModelInput(page, path.target, fixture);
  const materialized = await materializeFixtureFiles(fixture);
  try {
    await input.setInputFiles(fixtureInputFiles(fixture, materialized));
    await expect
      .poll(() => readTerminalModelLayerSnapshot(page, path.target), {
        timeout: 30_000,
      })
      .not.toBeNull();
    const terminal = (await readTerminalModelLayerSnapshot(page, path.target))!;
    await expectToolcraftModelRenderedPixels(page, path.target);
    return terminal;
  } finally {
    await materialized.cleanup();
  }
}

export async function measureToolcraftModelImport(
  page: Page,
  path: ToolcraftModelPerformancePath,
  fixture: ToolcraftModelBrowserFixture,
): Promise<ModelLayerSnapshot> {
  const input = await getModelInput(page, path.target, fixture);
  const materialized = await materializeFixtureFiles(fixture);
  try {
    const result = await measureToolcraftInteraction(
      page,
      () => input.setInputFiles(fixtureInputFiles(fixture, materialized)),
      {
        observeOutcome: () => readTerminalModelLayerSnapshot(page, path.target),
        outcomeTimeoutMs: 30_000,
        settleFrames: 3,
      },
    );
    expectModelBudget(result, path);
    const terminal = await readTerminalModelLayerSnapshot(page, path.target);
    expect(terminal, "Model import must finish with visible canvas output.").not.toBeNull();
    await expectToolcraftModelRenderedPixels(page, path.target);
    return terminal!;
  } finally {
    await materialized.cleanup();
  }
}

export async function measureToolcraftModelCacheReuse(
  page: Page,
  path: ToolcraftModelPerformancePath,
  fixture: ToolcraftModelBrowserFixture,
): Promise<void> {
  await importToolcraftModelFixture(page, path, fixture);
  await removeToolcraftModelFixture(page, path, fixture);
  const second = await measureToolcraftModelImport(page, path, fixture);
  expect(second.renderStatus).toBe("ready");
}

export async function removeToolcraftModelFixture(
  page: Page,
  path: ToolcraftModelPerformancePath,
  fixture: ToolcraftModelBrowserFixture,
): Promise<void> {
  const field = await getToolcraftControlFieldByTarget(page, path.target);
  const remove = field.getByRole("button", {
    name: `Remove ${fixture.files[0]!.name}`,
  });
  await expect(remove).toHaveCount(1);
  await remove.click();
  await expect.poll(() => readModelLayerSnapshot(page, path.target), { timeout: 5_000 }).toBeNull();
}

export async function measureToolcraftModelRejectedImport(
  page: Page,
  path: ToolcraftModelPerformancePath,
  fixture: ToolcraftModelBrowserFixture,
): Promise<void> {
  const input = await getModelInput(page, path.target, fixture);
  const materialized = await materializeFixtureFiles(fixture);
  try {
    const result = await measureToolcraftInteraction(
      page,
      () => input.setInputFiles(fixtureInputFiles(fixture, materialized)),
      {
        observeOutcome: async () => {
          const feedback = page.locator('[data-slot="file-drop-feedback"]');
          if ((await feedback.count()) !== 1) return null;
          const text = (await feedback.textContent())?.trim();
          return text ? text : null;
        },
        outcomeTimeoutMs: 30_000,
        settleFrames: 3,
      },
    );
    expectModelBudget(result, path);
    expect(await readTerminalModelLayerSnapshot(page, path.target)).toBeNull();
  } finally {
    await materialized.cleanup();
  }
}

export async function measureToolcraftModelRemoval(
  page: Page,
  path: ToolcraftModelPerformancePath,
  fixture: ToolcraftModelBrowserFixture,
): Promise<void> {
  await importToolcraftModelFixture(page, path, fixture);
  const field = await getToolcraftControlFieldByTarget(page, path.target);
  const remove = field.getByRole("button", {
    name: `Remove ${fixture.files[0]!.name}`,
  });
  await expect(remove).toHaveCount(1);
  const result = await measureToolcraftInteraction(page, () => remove.click(), {
    expectedOutcome: "removed",
    observeOutcome: async () =>
      (await readModelLayerSnapshot(page, path.target)) === null ? "removed" : null,
    outcomeTimeoutMs: 5_000,
    settleFrames: 3,
  });
  expectModelBudget(result, path);
}

export async function measureToolcraftModelRepair(
  page: Page,
  path: ToolcraftModelPerformancePath,
): Promise<void> {
  const before = await readModelLayerSnapshot(page, path.target);
  expect(before?.phase, "Repair performance requires a repairable model.").toBe("repairable");
  const field = await getToolcraftControlFieldByTarget(page, path.target);
  const action = field.getByRole("button", { name: "Repair model geometry" });
  await expect(action).toBeVisible();

  const result = await measureToolcraftInteraction(page, () => action.click(), {
    expectedOutcome: "fixed",
    observeOutcome: async () =>
      (await readModelLayerSnapshot(page, path.target))?.phase === "fixed" ? "fixed" : null,
    outcomeTimeoutMs: 30_000,
    settleFrames: 3,
  });
  expectModelBudget(result, path);
  await expect(field.getByRole("button", { name: "Repair model geometry" })).toHaveCount(0);
}

export async function measureToolcraftModelOrbit(
  page: Page,
  path: ToolcraftModelPerformancePath,
): Promise<void> {
  const { layers, matches } = await findModelLayerMatches(page, path.target);
  if (matches.length !== 1) {
    throw new Error(
      `Model orbit proof requires exactly one canvas layer for "${path.target}"; found ${matches.length}.`,
    );
  }
  const layer = layers.nth(matches[0]!);
  const bounds = await layer.boundingBox();
  if (!bounds) throw new Error("Model orbit proof requires visible model bounds.");
  // Protected pressure fixtures place their first triangle left/below center.
  // Avoid the shared diagonal, where a ray hit is precision-dependent.
  const start = {
    x: bounds.x + bounds.width * 0.43,
    y: bounds.y + bounds.height * 0.57,
  };
  const initialOrientation = await layer.getAttribute("data-canvas-model-orientation");
  const initialPixels = await expectToolcraftModelRenderedPixels(page, path.target);

  const result = await measureToolcraftInteraction(
    page,
    async () => {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 72, start.y + 36, { steps: 8 });
      await page.mouse.up();
    },
    {
      observeOutcome: async () => {
        const orientation = await layer.getAttribute("data-canvas-model-orientation");
        return orientation && orientation !== initialOrientation ? orientation : null;
      },
      outcomeTimeoutMs: 5_000,
      settleFrames: 3,
    },
  );
  expectModelBudget(result, path);
  await expect(layer).toHaveAttribute("data-canvas-model-orientation", /position/u);
  const draggedOrientation = await layer.getAttribute("data-canvas-model-orientation");
  const draggedPixels = await expectToolcraftModelRenderedPixels(page, path.target);
  expect(draggedPixels.hash).not.toBe(initialPixels.hash);

  const pose = JSON.parse(draggedOrientation!) as ToolcraftBrowserOrientationPose;
  const gizmo = page.getByRole("application", { name: "3D orientation gizmo" });
  const gizmoBounds = await gizmo.boundingBox();
  if (!gizmoBounds) throw new Error("Axis snap proof requires visible gizmo bounds.");
  const positiveZ = getToolcraftPositiveZAxisScreenPoint(pose, gizmoBounds);
  await page.mouse.click(positiveZ.x, positiveZ.y);
  const radius = Math.hypot(...pose.position);
  await expect
    .poll(
      async () => {
        const value = JSON.parse((await layer.getAttribute("data-canvas-model-orientation"))!) as {
          position: [number, number, number];
        };
        return Math.max(
          Math.abs(value.position[0]),
          Math.abs(value.position[1]),
          Math.abs(value.position[2] - radius),
        );
      },
      { timeout: 5_000 },
    )
    .toBeLessThan(1e-3);
  const snappedPixels = await expectToolcraftModelRenderedPixels(page, path.target);
  expect(snappedPixels.hash).toBe(initialPixels.hash);
}
