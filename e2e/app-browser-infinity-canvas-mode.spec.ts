import { expect, test, type Page } from "@playwright/test";

import {
  expectToolcraftInfinityCanvasModeEvidence,
  observeInfinityCanvas,
} from "./browser-infinity-canvas-evidence";

const sceneRect = { height: 400, width: 640, x: -320, y: -200 };
const svgOutput = `<svg data-toolcraft-product-output style="overflow:visible" width="100%" height="100%" viewBox="-320 -200 640 400"><path d="M -300 -180 H 300 V 180 H -300 Z" fill="#C84B31" /></svg>`;
const canvasOutput = `<canvas data-toolcraft-product-output width="1280" height="800" style="width:100%;height:100%"></canvas>`;

async function mountFixture(page: Page, output: string): Promise<void> {
  await page.setContent(`
    <div data-controls>
      <label data-toolcraft-control-target="canvas.aspectRatio"></label>
      <label data-toolcraft-control-target="canvas.size.width"><input value="1920" /></label>
      <label data-toolcraft-control-target="canvas.size.height"><input value="1080" /></label>
    </div>
    <div data-toolcraft-canvas-world data-toolcraft-canvas-offset-x="0" data-toolcraft-canvas-offset-y="0" data-toolcraft-canvas-zoom="100"
      style="position:fixed;left:400px;top:300px;transform-origin:0 0">
      <div data-toolcraft-canvas-mode="finite" style="overflow:hidden">
        <div data-toolcraft-editable-canvas style="width:1920px;height:1080px"></div>
        <div data-toolcraft-product-scene data-toolcraft-product-scene-status="ready"
          style="position:absolute;left:-320px;top:-200px;width:640px;height:400px">${output}</div>
      </div>
    </div>
  `);
}

async function setFixtureMode(page: Page, infinite: boolean): Promise<void> {
  await page.evaluate((enabled) => {
    const surface = document.querySelector<HTMLElement>(
      "[data-toolcraft-canvas-mode]",
    )!;
    surface.dataset.toolcraftCanvasMode = enabled ? "infinite" : "finite";
    surface.style.overflow = enabled ? "visible" : "hidden";
    const artboard = surface.querySelector<HTMLElement>(
      "[data-toolcraft-editable-canvas], [data-finite-artboard]",
    )!;
    artboard.toggleAttribute("data-toolcraft-editable-canvas", !enabled);
    artboard.toggleAttribute("data-finite-artboard", enabled);
    for (const field of document.querySelectorAll<HTMLElement>(
      "[data-controls] label",
    )) {
      const target =
        field.dataset.toolcraftControlTarget ?? field.dataset.finiteTarget!;
      if (enabled) {
        field.dataset.finiteTarget = target;
        delete field.dataset.toolcraftControlTarget;
      } else {
        field.dataset.toolcraftControlTarget = target;
        delete field.dataset.finiteTarget;
      }
    }
  }, infinite);
}

async function captureIdentity(page: Page) {
  return page.evaluateHandle(() => ({
    host: document.querySelector("[data-toolcraft-product-scene]"),
    output: document.querySelector("[data-toolcraft-product-output], [data-toolcraft-product-scene] svg"),
  }));
}

async function observeModeSequence(
  page: Page,
  output: string,
  afterEnable?: () => Promise<unknown>,
) {
  await mountFixture(page, output);
  const before = await observeInfinityCanvas(page);
  const initialIdentity = await captureIdentity(page);
  const compare = async (
    identity: Awaited<ReturnType<typeof captureIdentity>>,
  ) =>
    page.evaluate(
      (baseline) => ({
        productHostPreserved:
          baseline.host !== null &&
          baseline.host ===
            document.querySelector("[data-toolcraft-product-scene]"),
        productOutputPreserved:
          baseline.output !== null &&
          baseline.output ===
            document.querySelector("[data-toolcraft-product-output], [data-toolcraft-product-scene] svg"),
      }),
      identity,
    );
  await setFixtureMode(page, true);
  await afterEnable?.();
  const enabled = await observeInfinityCanvas(page);
  const beforeToEnabled = await compare(initialIdentity);
  await page.evaluate(() => {
    const world = document.querySelector<HTMLElement>(
      "[data-toolcraft-canvas-world]",
    )!;
    world.dataset.toolcraftCanvasOffsetX = "40";
    world.dataset.toolcraftCanvasOffsetY = "24";
    world.style.transform = "translate(40px,24px)";
  });
  const afterPan = await observeInfinityCanvas(page);
  // This framework fixture tests the proof recipe; real product reload is owned by its browser scenario.
  const afterReload = await observeInfinityCanvas(page);
  const restoredIdentity = await captureIdentity(page);
  await setFixtureMode(page, false);
  const restored = await observeInfinityCanvas(page);
  const afterReloadToRestored = await compare(restoredIdentity);
  await setFixtureMode(page, true);
  const undone = await observeInfinityCanvas(page);
  const restoredToUndone = await compare(restoredIdentity);
  await setFixtureMode(page, false);
  const redone = await observeInfinityCanvas(page);
  const undoneToRedone = await compare(restoredIdentity);
  await initialIdentity.dispose();
  await restoredIdentity.dispose();
  return {
    observations: {
      afterPan,
      afterReload,
      before,
      enabled,
      redone,
      restored,
      undone,
    },
    transitions: {
      afterReloadToRestored,
      beforeToEnabled,
      restoredToUndone,
      undoneToRedone,
    },
  };
}

async function verifySequence(
  sequence: Awaited<ReturnType<typeof observeModeSequence>>,
) {
  return expectToolcraftInfinityCanvasModeEvidence(
    sequence.observations,
    sequence.transitions,
    {
      expectedFiniteSize: { height: 1080, width: 1920 },
      expectedSceneRect: sceneRect,
      requirementId: "fixture.infinity.mode",
      target: "canvas.infinity",
    },
  );
}

test("Infinity mode evidence accepts mounted SVG-native output without raster backing", async ({
  page,
}) => {
  const sequence = await observeModeSequence(page, svgOutput);
  expect(sequence.observations.before.productScene.output).toEqual({
    kind: "svg",
    contentRect: { x: -300, y: -180, width: 600, height: 360 },
    localRect: sceneRect,
    viewportRect: { x: 80, y: 100, width: 640, height: 400 },
  });
  await expect(verifySequence(sequence)).resolves.toBeUndefined();
});

test("Infinity mode evidence accepts a sized SVG without an authored viewBox", async ({
  page,
}) => {
  await expect(
    verifySequence(
      await observeModeSequence(
        page,
        svgOutput.replace('viewBox="-320 -200 640 400"', ""),
      ),
    ),
  ).resolves.toBeUndefined();
});

test("Infinity mode evidence retains exact raster backing continuity", async ({
  page,
}) => {
  await expect(
    verifySequence(await observeModeSequence(page, canvasOutput)),
  ).resolves.toBeUndefined();
});

test("Infinity mode evidence observes a library-owned SVG without marker attributes", async ({ page }) => {
  await expect(verifySequence(await observeModeSequence(page, svgOutput.replace("data-toolcraft-product-output", "")))).resolves.toBeUndefined();
});

for (const [name, output] of [
  ["missing output", ""],
  ["empty SVG", svgOutput.replace(/<path[^>]+\/>/u, "")],
  [
    "zero SVG viewBox",
    svgOutput.replace('viewBox="-320 -200 640 400"', 'viewBox="0 0 0 0"'),
  ],
  [
    "zero raster backing beside valid SVG",
    canvasOutput.replace('width="1280"', 'width="0"') + svgOutput,
  ],
] as const) {
  test(`Infinity mode evidence rejects ${name}`, async ({ page }) => {
    await expect(
      verifySequence(await observeModeSequence(page, output)),
    ).rejects.toThrow();
    expect(test.info().attachments).toHaveLength(0);
  });
}

for (const mutation of ["viewBox", "content", "viewport", "remount"] as const) {
  test(`Infinity mode evidence rejects changed SVG ${mutation}`, async ({
    page,
  }) => {
    const sequence = await observeModeSequence(page, svgOutput, () =>
      page.evaluate((change) => {
        const svg = document.querySelector<SVGSVGElement>(
          "svg[data-toolcraft-product-output]",
        )!;
        if (change === "viewBox") svg.setAttribute("viewBox", "0 0 640 400");
        if (change === "content")
          svg.querySelector("path")!.setAttribute("d", "M 0 0 H 20 V 20 H 0 Z");
        if (change === "viewport") svg.style.width = "320px";
        if (change === "remount") svg.replaceWith(svg.cloneNode(true));
      }, mutation),
    );
    await expect(verifySequence(sequence)).rejects.toThrow();
    expect(test.info().attachments).toHaveLength(0);
  });
}

test("Infinity mode evidence rejects changed raster backing", async ({
  page,
}) => {
  const sequence = await observeModeSequence(page, canvasOutput, () =>
    page.locator("canvas").evaluate((canvas) => {
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("The raster fixture must contain a canvas.");
      }
      canvas.width = 640;
    }),
  );
  await expect(verifySequence(sequence)).rejects.toThrow();
  expect(test.info().attachments).toHaveLength(0);
});

for (const [name, output] of [
  ["browser-default SVG viewport clipping", svgOutput.replace('style="overflow:visible"', "")],
  ["SVG viewport clipping beside raster output", canvasOutput + svgOutput.replace('style="overflow:visible"', "")],
  ["unmarked secondary SVG clipping", svgOutput + svgOutput.replace('data-toolcraft-product-output style="overflow:visible"', "")],
  ["wrapper overflow clipping", `<div style="width:100%;height:100%;overflow:hidden">${svgOutput}</div>`],
  ["wrapper paint containment", `<div style="width:100%;height:100%;contain:paint">${svgOutput}</div>`],
] as const) {
  test(`Infinity mode evidence rejects ${name}`, async ({ page }) => {
    await expect(verifySequence(await observeModeSequence(page, output))).rejects.toThrow(/product.*clip/i);
    expect(test.info().attachments).toHaveLength(0);
  });
}

test("Infinity mode evidence preserves internal semantic SVG clipping", async ({ page }) => {
  const output = svgOutput.replace("</svg>", '<svg x="-10" y="-10" width="20" height="20" style="overflow:hidden"><path d="M -20 -20 H 40 V 40 H -20 Z" /></svg></svg>');
  await expect(verifySequence(await observeModeSequence(page, output))).resolves.toBeUndefined();
});
