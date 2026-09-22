import { expect, test } from "@playwright/test";
import { observeInfinityCanvas, expectInfiniteCanvasObservation } from "./browser-infinity-canvas-observation";

const frame = { x: 200, y: 200, width: 100, height: 100 };
function fixture(output: string) {
  return `<div data-toolcraft-canvas-world data-toolcraft-canvas-offset-x="0" data-toolcraft-canvas-offset-y="0" data-toolcraft-canvas-zoom="100">
    <div data-toolcraft-canvas-mode="infinite" style="overflow:visible">
      <div data-toolcraft-product-scene data-toolcraft-product-scene-status="ready" style="position:absolute;left:200px;top:200px;width:100px;height:100px">${output}</div>
    </div></div>`;
}

test("Infinity rejects an outer SVG clip-path that removes actual overflow", async ({ page }) => {
  await page.setContent(fixture('<svg id="output" width="100" height="100" style="overflow:visible;clip-path:inset(0)"><rect id="ink" x="-40" width="180" height="100" fill="red" /></svg>'));
  const clipped = await observeInfinityCanvas(page);
  expect(clipped.productClipping).toContain("svg: clip-path inset(0px)");
  expect(() => expectInfiniteCanvasObservation(clipped, frame)).toThrow();
  expect(await page.evaluate(() => document.elementFromPoint(180, 250)?.id)).not.toBe("ink");
  await page.locator("#output").evaluate(node => { (node as SVGElement).style.clipPath = "none"; });
  expect(await page.evaluate(() => document.elementFromPoint(180, 250)?.id)).toBe("ink");
  expectInfiniteCanvasObservation(await observeInfinityCanvas(page), frame);
});

test("Infinity rejects a pure Canvas transport crop and accepts intrinsic bitmap bounds", async ({ page }) => {
  await page.setContent(fixture('<div id="transport" style="width:100px;height:100px;overflow:hidden"><canvas id="output" width="180" height="100" style="position:relative;left:-40px;width:180px;height:100px;overflow:clip;contain:paint"></canvas></div>'));
  await page.locator("canvas").evaluate(node => { const ctx = node.getContext("2d")!; ctx.fillStyle = "red"; ctx.fillRect(0, 0, 180, 100); });
  const clipped = await observeInfinityCanvas(page);
  expect(clipped.productClipping).toContain("DIV: overflow hidden/hidden");
  expect(() => expectInfiniteCanvasObservation(clipped, frame)).toThrow();
  expect(await page.evaluate(() => document.elementFromPoint(180, 250)?.id)).not.toBe("output");
  await page.locator("#transport").evaluate(node => { node.style.overflow = "visible"; });
  expect(await page.evaluate(() => document.elementFromPoint(180, 250)?.id)).toBe("output");
  expectInfiniteCanvasObservation(await observeInfinityCanvas(page), frame);
});

test("Infinity detects outer masks but preserves masks inside product geometry", async ({ page }) => {
  await page.setContent(fixture('<svg width="100" height="100" style="overflow:visible"><defs><clipPath id="shape"><rect width="100" height="100" /></clipPath></defs><g clip-path="url(#shape)"><rect width="180" height="100" /></g></svg>'));
  expectInfiniteCanvasObservation(await observeInfinityCanvas(page), frame);
  await page.locator("svg").evaluate(node => { (node as SVGElement).style.maskImage = "linear-gradient(black, black)"; });
  expect((await observeInfinityCanvas(page)).productClipping.join(" ")).toContain("mask-image");
});
