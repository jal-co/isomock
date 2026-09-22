import { expect, test, type Page } from "@playwright/test";
import { dragToolcraftCanvasViewport, readToolcraftCanvasViewport } from "./performance-canvas-helpers";

async function pinch(page: Page, x: number, y: number) {
  await page.mouse.move(x, y);
  await page.keyboard.down("Control");
  try { await page.mouse.wheel(0, -120); }
  finally { await page.keyboard.up("Control"); }
  await page.waitForTimeout(180); // Complete the runtime's 120ms wheel boundary.
}

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/browser-rotation-lock-fixture.html");
  await expect(page.getByRole("application", { name: "Canvas viewport" })).toBeVisible();
});

test("trackpad zoom affects only canvas, including while a panel popup is open", async ({ page }) => {
  const panel = page.locator('[data-panel-id="properties"]');
  const panelSize = await panel.boundingBox();
  const pageScale = await page.evaluate(() => ({ scale: visualViewport!.scale, width: innerWidth, dpr: devicePixelRatio }));
  const initial = await readToolcraftCanvasViewport(page);
  await pinch(page, 300, 230);
  const zoomed = await readToolcraftCanvasViewport(page);
  expect(zoomed.zoom).toBeGreaterThan(initial.zoom);
  expect(await panel.boundingBox()).toEqual(panelSize);

  await pinch(page, panelSize!.x + 30, panelSize!.y + 30);
  expect(await readToolcraftCanvasViewport(page)).toEqual(zoomed);
  await page.getByRole("combobox").click();
  const popup = page.locator('[data-slot="select-content"]');
  await expect(popup).toBeVisible();
  expect(await popup.evaluate((element) => Boolean(element.closest("[data-toolcraft-portal-root]")))).toBe(true);
  const popupBox = (await popup.boundingBox())!;
  await pinch(page, popupBox.x + popupBox.width / 2, popupBox.y + 30);
  expect(await readToolcraftCanvasViewport(page)).toEqual(zoomed);
  expect(await panel.boundingBox()).toEqual(panelSize);
  expect(await page.evaluate(() => ({ scale: visualViewport!.scale, width: innerWidth, dpr: devicePixelRatio }))).toEqual(pageScale);
});

test("Space hand tool pans over a model with grab/grabbing cursors and leaves panels alone", async ({ page }, info) => {
  const canvas = page.getByRole("application", { name: "Canvas viewport" });
  const model = page.getByTestId("rotation-lock-model");
  const initial = await readToolcraftCanvasViewport(page);
  const readPose = async () => JSON.parse((await page.getByTestId("rotation-lock-state").textContent())!).pose;
  const pose = await readPose();
  await page.mouse.move(260, 140);
  await page.mouse.down();
  await page.mouse.move(300, 160);
  await page.mouse.up();
  expect(await readToolcraftCanvasViewport(page)).toEqual(initial);

  await canvas.focus();
  await page.keyboard.down("Space");
  await expect(canvas).toHaveCSS("cursor", "grab");
  await expect(model).toHaveCSS("cursor", "grab");
  await expect(page.getByRole("switch", { name: "Lock rotation", exact: true })).toHaveCSS("cursor", "default");
  const box = (await model.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.screenshot({ path: info.outputPath("canvas-hand-ready.png") });
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 30, { steps: 5 });
  await expect(canvas).toHaveCSS("cursor", "grabbing");
  await expect(model).toHaveCSS("cursor", "grabbing");
  await page.screenshot({ path: info.outputPath("canvas-hand-dragging.png") });
  await page.keyboard.up("Space");
  await expect(canvas).toHaveCSS("cursor", "grabbing");
  await page.mouse.up();
  await expect(canvas).toHaveCSS("cursor", "default");
  await expect.poll(() => readToolcraftCanvasViewport(page)).toEqual({ ...initial, offsetX: initial.offsetX + 70, offsetY: initial.offsetY + 30 });
  expect(await readPose()).toEqual(pose);

  // Exercise the canonical generated-test driver without running a benchmark.
  await dragToolcraftCanvasViewport(page, { x: 20, y: 10 });
  await expect.poll(() => readToolcraftCanvasViewport(page)).toEqual({ ...initial, offsetX: initial.offsetX + 90, offsetY: initial.offsetY + 40 });
  await expect(canvas).toHaveAttribute("data-canvas-pan-state", "idle");
});

test("hand tool works after returning from a panel without stealing text editing", async ({ page }) => {
  const canvas = page.getByRole("application", { name: "Canvas viewport" });
  const lock = page.getByRole("switch", { name: "Lock rotation", exact: true });
  await lock.click();
  const checked = await lock.getAttribute("aria-checked");
  await page.mouse.move(260, 140);
  await page.keyboard.down("Space");
  await expect(canvas).toHaveCSS("cursor", "grab");
  await page.mouse.down();
  await page.mouse.move(290, 160);
  await page.mouse.up();
  await page.keyboard.up("Space");
  expect(await lock.getAttribute("aria-checked")).toBe(checked);
  await expect.poll(() => readToolcraftCanvasViewport(page)).toMatchObject({ offsetX: 30, offsetY: 20 });

  const width = page.getByRole("textbox").first();
  await width.focus();
  await page.mouse.move(260, 140);
  await page.keyboard.down("Space");
  await expect(canvas).toHaveAttribute("data-canvas-pan-state", "idle");
  await page.keyboard.up("Space");
});
