import { expect, test } from "@playwright/test";

import {
  expectFiniteCanvasObservation,
  expectInfiniteCanvasObservation,
  expectToolcraftInfinityCanvasBackgroundEvidence,
  expectToolcraftInfinityCanvasVideoExportEvidence,
  expectToolcraftInfinityCanvasImageExportEvidence,
  observeInfinityCanvas,
} from "./browser-infinity-canvas-evidence";
import { expectToolcraftInfinityCanvasSvgExportEvidence } from "./browser-infinity-canvas-svg-evidence";
import { createToolcraftSvgFixtureDownload } from "./svg-download-test-fixtures";
import { inspectToolcraftSvgDownload } from "./svg-artifact-inspection";
import {
  readToolcraftCanvasViewport,
  zoomToolcraftCanvasViewport,
} from "./performance-canvas-helpers";

const partialFiniteControlPresence = [
  { aspectRatio: true, height: false, width: false },
  { aspectRatio: false, height: true, width: false },
  { aspectRatio: false, height: false, width: true },
  { aspectRatio: true, height: true, width: false },
  { aspectRatio: true, height: false, width: true },
  { aspectRatio: false, height: true, width: true },
] as const;

test("Infinity canvas evidence rejects every partial finite-control presence", async ({
  page,
}) => {
  const common = {
    finiteControlSize: { height: 200, width: 320 },
    overflow: "visible",
    productClipping: [],
    productScene: {
      output: null,
      viewportRect: null,
      worldRect: null,
    },
    productSceneStatus: "empty" as const,
    viewport: { offsetX: 0, offsetY: 0, zoom: 100 },
  };

  for (const finiteControlsPresent of partialFiniteControlPresence) {
    const controls = Object.entries({
      "canvas.aspectRatio": finiteControlsPresent.aspectRatio,
      "canvas.size.height": finiteControlsPresent.height,
      "canvas.size.width": finiteControlsPresent.width,
    })
      .filter(([, present]) => present)
      .map(
        ([target]) =>
          `<label data-toolcraft-control-target="${target}"><input value="200" /></label>`,
      )
      .join("");
    await page.setContent(`${controls}
      <div
        data-toolcraft-canvas-world
        data-toolcraft-canvas-offset-x="0"
        data-toolcraft-canvas-offset-y="0"
        data-toolcraft-canvas-zoom="100"
      >
        <div data-toolcraft-canvas-mode="infinite" style="overflow:visible"></div>
      </div>
    `);
    const observed = await observeInfinityCanvas(page);
    expect(observed.finiteControlsPresent).toEqual(finiteControlsPresent);
    expect(() => expectInfiniteCanvasObservation(observed)).toThrow();
    expect(() =>
      expectFiniteCanvasObservation({
        ...common,
        artboardPresent: true,
        canvasMode: "finite",
        finiteCanvasSize: { height: 200, width: 320 },
        finiteControlsPresent,
        overflow: "hidden",
      }),
    ).toThrow();
  }
});

test("toolcraft Infinity canvas observation reads runtime-owned geometry", async ({
  page,
}) => {
  await page.setContent(`
    <div
      data-toolcraft-canvas-world
      data-toolcraft-canvas-offset-x="12"
      data-toolcraft-canvas-offset-y="-8"
      data-toolcraft-canvas-zoom="125"
      style="position: fixed; left: 400px; top: 300px; transform: translate(12px, -8px) scale(1.25); transform-origin: 0 0"
    >
      <div data-toolcraft-canvas-mode="infinite" style="overflow: visible">
        <div data-scene style="position:absolute;left:1px;top:2px;width:3px;height:4px"></div>
        <div
          data-toolcraft-product-scene
          data-toolcraft-product-scene-status="ready"
          style="position:absolute;left:-320px;top:-200px;width:640px;height:400px"
        >
          <canvas width="640" height="400"></canvas>
        </div>
      </div>
    </div>
  `);

  const observation = await observeInfinityCanvas(page);
  expect(observation.finiteControlsPresent).toEqual({
    aspectRatio: false,
    height: false,
    width: false,
  });
  expectInfiniteCanvasObservation(observation, {
    height: 400,
    width: 640,
    x: -320,
    y: -200,
  });
  expect(observation.viewport).toEqual({
    offsetX: 12,
    offsetY: -8,
    zoom: 125,
  });
  expect(observation.productScene).toEqual({
    output: { kind: "canvas", backingHeight: 400, backingWidth: 640 },
    viewportRect: {
      height: 500,
      width: 800,
      x: 12,
      y: 42,
    },
    worldRect: { height: 400, width: 640, x: -320, y: -200 },
  });
});

test("toolcraft canvas viewport observation reads the runtime world transform", async ({
  page,
}) => {
  await page.setContent(`
    <div
      data-toolcraft-canvas-world
      data-toolcraft-canvas-offset-x="96"
      data-toolcraft-canvas-offset-y="-64"
      data-toolcraft-canvas-zoom="125"
    ></div>
  `);

  await expect(readToolcraftCanvasViewport(page)).resolves.toEqual({
    offsetX: 96,
    offsetY: -64,
    zoom: 125,
  });
});

test("toolcraft canvas zoom helper performs only the requested direction", async ({
  page,
}) => {
  await page.setContent(`
    <button aria-label="Zoom in" onclick="document.body.dataset.zoomIn = String(Number(document.body.dataset.zoomIn ?? 0) + 1)"></button>
    <button aria-label="Zoom out" onclick="document.body.dataset.zoomOut = String(Number(document.body.dataset.zoomOut ?? 0) + 1)"></button>
  `);

  await zoomToolcraftCanvasViewport(page, {
    direction: "in",
    repetitions: 2,
  });
  await expect(page.locator("body")).toHaveAttribute("data-zoom-in", "2");
  await expect(page.locator("body")).not.toHaveAttribute("data-zoom-out");

  await zoomToolcraftCanvasViewport(page, { direction: "out" });
  await expect(page.locator("body")).toHaveAttribute("data-zoom-out", "1");
});

test("toolcraft Infinity canvas video evidence preserves decoded frames and dimensions", async () => {
  await expectToolcraftInfinityCanvasVideoExportEvidence(
    {
      finite: {
        byteLength: 1024,
        durationMs: 1000,
        frameCount: 30,
        samplePixelHashes: ["a".repeat(64)],
        height: 1350,
        width: 1080,
      },
      infinite: {
        byteLength: 768,
        durationMs: 1000,
        frameCount: 30,
        samplePixelHashes: ["a".repeat(64)],
        height: 1350,
        width: 1080,
      },
    },
    {
      expectedSize: { height: 1350, width: 1080 },
      requirementId: "fixture.infinity.video",
      target: "canvas.infinity",
    },
  );
});

test("toolcraft Infinity canvas SVG evidence preserves the inspected viewBox and vector content", async ({
  page,
}) => {
  const source = (width: number, height: number, x: number, y: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}"><g data-toolcraft-product-scene="true"><rect data-shape="true" x="${x}" y="${y}" width="${width}" height="${height}" fill="#52AAFF"/></g></svg>`;
  const finite = await inspectToolcraftSvgDownload({
    download: await createToolcraftSvgFixtureDownload(
      page,
      source(1080, 1350, 0, 0),
      "finite.svg",
    ),
    page,
  });
  const infinite = await inspectToolcraftSvgDownload({
    download: await createToolcraftSvgFixtureDownload(
      page,
      source(1080, 1350, 0, 0),
      "infinite.svg",
    ),
    page,
  });
  await expectToolcraftInfinityCanvasSvgExportEvidence(
    {
      finite: finite.inspection,
      infinite: infinite.inspection,
    },
    {
      expectedSize: { height: 1350, width: 1080 },
      requirementId: "fixture.infinity.svg",
      target: "canvas.infinity",
    },
  );
});

test("toolcraft Infinity canvas background evidence proves viewport color and dependency", async () => {
  await expectToolcraftInfinityCanvasBackgroundEvidence(
    {
      backgroundExcluded: {
        backgroundEnabled: false,
        canvasMode: "infinite",
        infinityDisabled: false,
        runtimeBackgroundColor: null,
        viewportBackgroundColor: "rgb(20, 20, 20)",
        viewportMatchesRuntimeColor: false,
      },
      backgroundRestored: {
        backgroundEnabled: true,
        canvasMode: "infinite",
        infinityDisabled: false,
        runtimeBackgroundColor: "#D4CECA",
        viewportBackgroundColor: "rgb(212, 206, 202)",
        viewportMatchesRuntimeColor: true,
      },
      infinite: {
        backgroundEnabled: true,
        canvasMode: "infinite",
        infinityDisabled: false,
        runtimeBackgroundColor: "#D4CECA",
        viewportBackgroundColor: "rgb(212, 206, 202)",
        viewportMatchesRuntimeColor: true,
      },
    },
    {
      expectedBackgroundColor: "#D4CECA",
      requirementId: "fixture.background",
      target: "export.includeBackground",
    },
  );
});

const parityOptions = { expectedSize: { width: 640, height: 480 }, requirementId: "fixture.infinity.image", target: "canvas.infinity" };
const imageArtifact = { byteLength: 1024, width: 640, height: 480, decodedPixelHash: "a".repeat(64) };

test("Infinity image export accepts the same decoded composition", async () => {
  await expectToolcraftInfinityCanvasImageExportEvidence({ finite: imageArtifact, infinite: imageArtifact }, parityOptions);
});

test("Infinity image export accepts a distinct content-bounds frame", async () => {
  await expectToolcraftInfinityCanvasImageExportEvidence(
    {
      finite: imageArtifact,
      infinite: {
        ...imageArtifact,
        decodedPixelHash: "b".repeat(64),
        height: 400,
      },
    },
    {
      ...parityOptions,
      expectedSize: {
        finite: { height: 480, width: 640 },
        infinite: { height: 400, width: 640 },
      },
    },
  );
});

test("Infinity image export rejects a resized or differently cropped composition", async () => {
  for (const infinite of [
    { ...imageArtifact, width: 320 },
    { ...imageArtifact, decodedPixelHash: "b".repeat(64) },
    { ...imageArtifact, decodedPixelHash: "" },
  ]) {
    await expect(expectToolcraftInfinityCanvasImageExportEvidence({ finite: imageArtifact, infinite }, parityOptions)).rejects.toThrow();
  }
});
