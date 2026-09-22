import { expect, test, type Page, type TestInfo } from "@playwright/test";

import {
  parseToolcraftBrowserRuntimeEvidence,
} from "../src/app/test-evidence/browser-runtime-contract";
import { attachedEvidenceTypes } from "./browser-semantic-evidence-test-helpers";
import {
  expectToolcraftCanvasRenderScaleEvidence,
  expectToolcraftPerformanceRenderScaleBackingEvidence,
  type ToolcraftRenderScaleStateTransition,
} from "./browser-render-scale-evidence";

const canvasSelector = "[data-render-scale-canvas]";

async function installCanvas(page: Page, backingScale: number): Promise<void> {
  await page.setContent(`
    <canvas
      data-render-scale-canvas
      style="display:block;width:120px;height:80px"
    ></canvas>
  `);
  await setBackingScale(page, backingScale);
}

async function setBackingScale(page: Page, backingScale: number): Promise<void> {
  await page.locator(canvasSelector).evaluate((element, scale) => {
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error("Fixture must target a canvas.");
    }
    const rect = element.getBoundingClientRect();
    element.width = Math.round(rect.width * window.devicePixelRatio * scale);
    element.height = Math.round(rect.height * window.devicePixelRatio * scale);
  }, backingScale);
}

function transition(
  state: ToolcraftRenderScaleStateTransition["state"],
  run: () => Promise<void>,
): ToolcraftRenderScaleStateTransition {
  return { run, state };
}

test("render-scale evidence proves and attaches every covered canvas state", async ({
  page,
}, testInfo: TestInfo) => {
  await installCanvas(page, 2);
  const attachmentCount = testInfo.attachments.length;

  await expectToolcraftCanvasRenderScaleEvidence(page, {
    canvasSelector,
    requirementId: "canvas.render-scale",
    selectedScale: 2,
    stateTransitions: [
      transition("interaction", () => setBackingScale(page, 2)),
      transition("playback", () => setBackingScale(page, 2)),
      transition("steady", () => setBackingScale(page, 2)),
    ],
    target: "canvas.renderScale",
  });

  expect(attachedEvidenceTypes(testInfo, attachmentCount)).toEqual([
    "canvas-render-scale-backing",
    "canvas-render-scale-backing",
    "canvas-render-scale-backing",
  ]);
  expect(
    await page.locator(canvasSelector).evaluate((canvas) => ({
      height: (canvas as HTMLCanvasElement).getBoundingClientRect().height,
      width: (canvas as HTMLCanvasElement).getBoundingClientRect().width,
    })),
  ).toEqual({ height: 80, width: 120 });
});

test("selected 2x rejects a 1x backing store and attaches no evidence", async ({
  page,
}, testInfo: TestInfo) => {
  await installCanvas(page, 1);
  const attachmentCount = testInfo.attachments.length;

  await expect(
    expectToolcraftCanvasRenderScaleEvidence(page, {
      canvasSelector,
      requirementId: "canvas.render-scale",
      selectedScale: 2,
      stateTransitions: [
        transition("interaction", () => setBackingScale(page, 1)),
        transition("steady", () => setBackingScale(page, 1)),
      ],
      target: "canvas.renderScale",
    }),
  ).rejects.toThrow(/backing width.*Resolution scale 2/iu);
  expect(testInfo.attachments).toHaveLength(attachmentCount);
});

test("selected 2x rejects a 3x backing store and attaches no evidence", async ({
  page,
}, testInfo: TestInfo) => {
  await installCanvas(page, 3);
  const attachmentCount = testInfo.attachments.length;

  await expect(
    expectToolcraftCanvasRenderScaleEvidence(page, {
      canvasSelector,
      requirementId: "canvas.render-scale",
      selectedScale: 2,
      stateTransitions: [transition("steady", () => setBackingScale(page, 3))],
      target: "canvas.renderScale",
    }),
  ).rejects.toThrow(/backing width.*one physical pixel/iu);
  expect(testInfo.attachments).toHaveLength(attachmentCount);
});

test("a backing clamp introduced by a state transition fails the whole recipe", async ({
  page,
}, testInfo: TestInfo) => {
  await installCanvas(page, 2);
  const attachmentCount = testInfo.attachments.length;

  await expect(
    expectToolcraftCanvasRenderScaleEvidence(page, {
      canvasSelector,
      requirementId: "canvas.render-scale",
      selectedScale: 2,
      stateTransitions: [
        transition("interaction", () => setBackingScale(page, 2)),
        transition("playback", () => setBackingScale(page, 1)),
        transition("steady", () => setBackingScale(page, 2)),
      ],
      target: "canvas.renderScale",
    }),
  ).rejects.toThrow(/playback.*backing width/iu);
  expect(testInfo.attachments).toHaveLength(attachmentCount);
});

test("a state transition cannot trade stable CSS size for backing pixels", async ({
  page,
}, testInfo: TestInfo) => {
  await installCanvas(page, 2);
  const attachmentCount = testInfo.attachments.length;

  await expect(
    expectToolcraftCanvasRenderScaleEvidence(page, {
      canvasSelector,
      requirementId: "canvas.render-scale",
      selectedScale: 2,
      stateTransitions: [
        transition("interaction", async () => {
          await page
            .locator(canvasSelector)
            .evaluate((canvas) => canvas.setAttribute("style", "width:60px;height:40px"));
          await setBackingScale(page, 2);
        }),
        transition("steady", () => setBackingScale(page, 2)),
      ],
      target: "canvas.renderScale",
    }),
  ).rejects.toThrow(/preserve.*CSS width/iu);
  expect(testInfo.attachments).toHaveLength(attachmentCount);
});

test("render-scale evidence rejects a non-canvas selector clearly", async ({
  page,
}, testInfo: TestInfo) => {
  await page.setContent(
    '<div data-render-scale-canvas style="width:120px;height:80px"></div>',
  );
  const attachmentCount = testInfo.attachments.length;

  await expect(
    expectToolcraftCanvasRenderScaleEvidence(page, {
      canvasSelector,
      requirementId: "canvas.render-scale",
      selectedScale: 2,
      stateTransitions: [transition("steady", async () => undefined)],
      target: "canvas.renderScale",
    }),
  ).rejects.toThrow(/HTMLCanvasElement/iu);
  expect(testInfo.attachments).toHaveLength(attachmentCount);
});

test("performance render-scale evidence attaches only after real backing proof", async ({
  page,
}, testInfo: TestInfo) => {
  await installCanvas(page, 2);
  const attachmentCount = testInfo.attachments.length;

  await expectToolcraftPerformanceRenderScaleBackingEvidence(page, {
    baselineCssSize: { height: 80, width: 120 },
    canvasSelector,
    cssSizePolicy: "fixed",
    pathId: "performance-path:render-scale",
    phase: "cold",
    target: "canvas.renderScale",
  });

  const [qualityEvidence] = testInfo.attachments
    .slice(attachmentCount)
    .map(parseToolcraftBrowserRuntimeEvidence)
    .filter(
      (evidence) => evidence?.evidenceType === "performance-render-scale",
    );
  expect(qualityEvidence?.requirementId).toBe(
    "performance-path:render-scale#cold",
  );
});

test("performance render-scale evidence rejects a quality clamp without attaching", async ({
  page,
}, testInfo: TestInfo) => {
  await installCanvas(page, 1);
  const attachmentCount = testInfo.attachments.length;

  await expect(
    expectToolcraftPerformanceRenderScaleBackingEvidence(page, {
      baselineCssSize: { height: 80, width: 120 },
      canvasSelector,
      cssSizePolicy: "fixed",
      pathId: "performance-path:render-scale",
      phase: "warm",
      target: "canvas.renderScale",
    }),
  ).rejects.toThrow(/warm.*backing width/iu);
  expect(testInfo.attachments).toHaveLength(attachmentCount);
});

test("performance render-scale evidence rejects a changed CSS baseline", async ({
  page,
}, testInfo: TestInfo) => {
  await installCanvas(page, 2);
  const attachmentCount = testInfo.attachments.length;
  await page.locator(canvasSelector).evaluate((canvas) => {
    canvas.setAttribute("style", "display:block;width:60px;height:40px");
  });
  await setBackingScale(page, 2);

  await expect(
    expectToolcraftPerformanceRenderScaleBackingEvidence(page, {
      baselineCssSize: { height: 80, width: 120 },
      canvasSelector,
      cssSizePolicy: "fixed",
      pathId: "performance-path:render-scale",
      phase: "sustained",
      target: "canvas.renderScale",
    }),
  ).rejects.toThrow(/sustained.*preserve.*CSS width/iu);
  expect(testInfo.attachments).toHaveLength(attachmentCount);
});
