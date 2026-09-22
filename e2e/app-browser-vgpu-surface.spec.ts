import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readCanvasSample, toolcraftVgpuChromiumFlags } from "./renderer-provider-runtime-evidence";

const enabled = Boolean(JSON.parse(readFileSync("package.json", "utf8")).dependencies?.vgpu);
test.skip(!enabled, "Provider compatibility requires explicit VGPU activation.");
// Real Chromium headless has the GPU compositor; headless-shell loses the
// external canvas instance on SwiftShader and cannot certify CanvasSurface.
test.use({ channel: "chromium", launchOptions: { args: [...toolcraftVgpuChromiumFlags] } });

test("VGPU direct surface preserves premultiplied pixels across frames, resize and disposal", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => { errors.push(error.message); console.error(error.stack); });
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/e2e/browser-vgpu-surface-fixture.html");
  const canvas = page.locator("canvas[data-toolcraft-vgpu-product]");
  await expect(canvas).toHaveAttribute("data-frames", "1");
  const assertPixels = async (expected: number[]) => {
    const actual = await readCanvasSample(page);
    expected.forEach((value, index) => expect(Math.abs(actual[index]! - value)).toBeLessThanOrEqual(1));
  };
  await assertPixels([128, 0, 0, 255]);
  await page.getByRole("button", { name: "Next frame" }).click();
  await expect(canvas).toHaveAttribute("data-frames", "2");
  await assertPixels([0, 128, 0, 255]);
  await page.getByRole("button", { name: "Resize", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-frames", "3");
  await expect(canvas).toHaveAttribute("width", "160");
  await expect(canvas).toHaveAttribute("height", "80");
  await expect(canvas).toHaveCSS("width", "80px");
  await assertPixels([0, 128, 0, 255]);
  await page.getByRole("button", { name: "Dispose" }).click();
  await expect(canvas).toHaveAttribute("data-disposed", "true");
  expect(errors).toEqual([]);
});


test("VGPU target-readback and export preserve straight alpha and exact backing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/e2e/browser-vgpu-surface-fixture.html");
  await expect(page.locator("canvas[data-toolcraft-vgpu-product]")).toHaveAttribute("data-frames", "1");
  await page.getByRole("button", { name: "Render offscreen" }).click();
  await expect(page.locator("#offscreen-status")).toHaveText("committed");
  await expect(page.locator("#readback")).toHaveAttribute("width", "32");
  await expect(page.locator("#readback")).toHaveCSS("width", "8px");
  for (const [id, expected] of [["readback", [255, 0, 0, 128]], ["export", [128, 0, 127, 255]]] as const) {
    const actual = await page.locator(`#${id}`).evaluate((canvas) => Array.from((canvas as HTMLCanvasElement).getContext("2d")!.getImageData(4, 4, 1, 1).data));
    expected.forEach((value, index) => expect(Math.abs(actual[index]! - value)).toBeLessThanOrEqual(1));
  }
  await page.getByRole("button", { name: "Unsupported export" }).click();
  await expect(page.locator("#unsupported-status")).toHaveText("vgpu-export-unsupported");
  expect(errors).toEqual([]);
});
