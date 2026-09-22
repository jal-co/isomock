import { expect, type Page } from "@playwright/test";
import type { ToolcraftInfinityOverflowCoverage } from "../src/app/acceptance/canvas-coverage";

export type ToolcraftInfinityEdgeProbe = Readonly<{
  edge: ToolcraftInfinityOverflowCoverage["edges"][number];
  /** Position along the edge, strictly between its corners. */
  along: number;
  /** Positive CSS pixels beyond the product frame. */
  offset: number;
  colors: readonly (readonly [number, number, number, number])[];
}>;
type Rect = { x: number; y: number; width: number; height: number };

export async function expectInfinityOverflowPixels(page: Page, frame: Rect,
  probes: readonly ToolcraftInfinityEdgeProbe[], visible: boolean): Promise<void> {
  const points = probes.map(probe => {
    if (!Number.isFinite(probe.along) || probe.along <= 0 || probe.along >= 1 ||
        !Number.isFinite(probe.offset) || probe.offset < 2 || !probe.colors.length ||
        probe.colors.some(color => color.length !== 4 || color[3] !== 255 || color.some(channel => !Number.isInteger(channel) || channel < 0 || channel > 255))) {
      throw new Error("Infinity edge probes require an interior edge position, an offset of at least 2 CSS pixels and opaque RGBA colors.");
    }
    const horizontal = probe.edge === "left" || probe.edge === "right";
    return { x: Math.round(horizontal ? frame.x + (probe.edge === "left" ? -probe.offset : frame.width + probe.offset) : frame.x + frame.width * probe.along),
      y: Math.round(horizontal ? frame.y + frame.height * probe.along : frame.y + (probe.edge === "top" ? -probe.offset : frame.height + probe.offset)) };
  });
  const viewport = await page.locator('[data-slot="toolcraft-runtime-canvas"]').boundingBox();
  expect(viewport, "Outside-frame probes require the runtime viewport").not.toBeNull();
  for (const point of points) {
    expect(point.x).toBeGreaterThan(viewport!.x);
    expect(point.x).toBeLessThan(viewport!.x + viewport!.width);
    expect(point.y).toBeGreaterThan(viewport!.y);
    expect(point.y).toBeLessThan(viewport!.y + viewport!.height);
  }
  const raster = await page.screenshot({ scale: "css", animations: "disabled" });
  const pixels = await page.evaluate(async ({ base64, points }) => {
    const image = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: "image/png" }));
    try {
      const canvas = document.createElement("canvas");
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return points.map(({ x, y }) => {
        if (x < 0 || y < 0 || x >= image.width || y >= image.height) throw new Error("Infinity edge probe is outside screenshot bounds.");
        return Array.from(context.getImageData(x, y, 1, 1).data);
      });
    } finally { image.close(); }
  }, { base64: raster.toString("base64"), points });
  for (const [index, pixel] of pixels.entries()) {
    const matches = probes[index]!.colors.some(color => color.every((channel, i) => Math.abs(channel - pixel[i]!) <= 2));
    expect(matches, `${probes[index]!.edge} outside-frame pixel ${pixel.join(",")}`).toBe(visible);
  }
}
