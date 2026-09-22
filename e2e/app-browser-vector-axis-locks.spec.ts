import { expect, test, type Locator, type Page } from "@playwright/test";

async function mount(page: Page, mode: "dom" | "cartesian" | "nested-mirror") {
  await page.goto("/");
  await page.evaluate(async mode => {
    const url = "/e2e/browser-vector-screen-motion-fixture.tsx";
    const { mountVectorFixture } = await import(/* @vite-ignore */ url);
    mountVectorFixture(mode);
  }, mode);
  const pad = page.getByRole("button", { name: "Offset 1 X/Y pad", exact: true });
  await expect(pad).toBeVisible();
  return pad;
}
async function drag(page: Page, pad: Locator, x: number, y: number) {
  const handle = (await pad.locator(".xy-handle").boundingBox())!;
  const box = (await pad.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 8 });
  await page.mouse.up();
}
async function edit(page: Page, axis: string, draft: string, key = "Tab") {
  await page.getByRole("button", { name: `Edit Offset 1 ${axis} value`, exact: true }).click();
  const editor = page.getByRole("textbox", { name: `Offset 1 ${axis} value`, exact: true });
  await editor.fill(draft);
  await editor.press(key);
}

for (const mode of ["dom", "cartesian"] as const) {
  test(`Vector locks preserve the requested axis and real output: ${mode}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const pad = await mount(page, mode);
    const xAxis = pad.locator('[data-vector-pad-axis="x"]');
    const yAxis = pad.locator('[data-vector-pad-axis="y"]');
    await expect(xAxis).toBeVisible();
    await expect(yAxis).toBeVisible();
    const horizontal = (await xAxis.boundingBox())!;
    const vertical = (await yAxis.boundingBox())!;
    expect(horizontal.width).toBeGreaterThan(horizontal.height);
    expect(vertical.height).toBeGreaterThan(vertical.width);
    const marker = page.locator('[data-toolcraft-product-output="vector-fixture"] > div');
    const initial = (await marker.boundingBox())!;
    const field = page.locator('[data-vector-axis="x"]').first();
    const lockX = page.getByRole("button", { name: "Lock Offset 1 X axis", exact: true });
    await expect(lockX).toHaveAttribute("aria-pressed", "false");
    const iconBox = (await lockX.boundingBox())!;
    const numberBox = (await page.getByRole("button", { name: "Edit Offset 1 X value", exact: true }).boundingBox())!;
    expect(iconBox.x + iconBox.width).toBeLessThanOrEqual(numberBox.x + 1);
    expect(Math.abs(iconBox.y + iconBox.height / 2 - numberBox.y - numberBox.height / 2)).toBeLessThan(2);
    await lockX.click();
    await expect(page.getByRole("button", { name: "Unlock Offset 1 X axis" })).toHaveAttribute("aria-pressed", "true");
    await expect(xAxis).toHaveCount(0);
    await expect(yAxis).toBeVisible();
    await page.keyboard.down("Shift");
    await drag(page, pad, 0.95, 0.75);
    await page.keyboard.up("Shift");
    await expect.poll(async () => (await marker.boundingBox())!.x).toBeCloseTo(initial.x, 0);
    await expect.poll(async () => (await marker.boundingBox())!.y).toBeGreaterThan(initial.y + 20);
    await expect(page.getByRole("button", { name: "Edit Offset 1 X value", exact: true })).toHaveCount(0);
    await expect(field).toContainText("0.00");
    const afterY = (await marker.boundingBox())!;
    await page.getByRole("button", { name: "Lock Offset 1 Y axis", exact: true }).click();
    await expect(pad).toBeDisabled();
    await expect(yAxis).toHaveCount(0);
    await expect(pad.locator(".xy-handle")).toBeVisible();
    const unlockX = page.getByRole("button", { name: "Unlock Offset 1 X axis", exact: true });
    await unlockX.focus();
    await page.keyboard.press("Enter");
    await expect(pad).toBeEnabled();
    await expect(xAxis).toBeVisible();
    await expect(yAxis).toHaveCount(0);
    await drag(page, pad, 0.8, 0.05);
    await expect.poll(async () => (await marker.boundingBox())!.x).toBeGreaterThan(initial.x + 20);
    await expect.poll(async () => (await marker.boundingBox())!.y).toBeCloseTo(afterY.y, 0);
    await edit(page, "X", "-0.5", "Enter");
    await expect.poll(async () => (await marker.boundingBox())!.x).toBeCloseTo(initial.x - 35, 0);
    for (const [draft, key] of [["not a number", "Tab"], ["0.9", "Escape"]]) {
      await edit(page, "X", draft!, key!);
      await expect.poll(async () => (await marker.boundingBox())!.x).toBeCloseTo(initial.x - 35, 0);
    }
    await pad.dblclick();
    await expect.poll(async () => (await marker.boundingBox())!.x).toBeCloseTo(initial.x, 0);
    await expect.poll(async () => (await marker.boundingBox())!.y).toBeCloseTo(afterY.y, 0);
    await page.getByRole("button", { name: "Unlock Offset 1 Y axis", exact: true }).click();
    await expect(xAxis).toBeVisible();
    await expect(yAxis).toBeVisible();
    await drag(page, pad, 0.75, 0.25);
    await expect.poll(async () => (await marker.boundingBox())!.x).toBeGreaterThan(initial.x + 20);
    await expect.poll(async () => (await marker.boundingBox())!.y).toBeLessThan(initial.y - 20);
    await page.getByRole("button", { name: "Lock Offset 1 X axis", exact: true }).click();
    await page.mouse.move(1000, 600);
    await pad.locator("..").screenshot({ path: info.outputPath("vector-axis-locks.png") });
    expect(errors).toEqual([]);
  });
}

test("Vector locks are independent for repeated pads", async ({ page }) => {
  const first = await mount(page, "nested-mirror");
  await page.getByRole("button", { name: "Lock Offset 1 X axis", exact: true }).click();
  await expect(first.locator('[data-vector-pad-axis="x"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Lock Offset 2 X axis", exact: true })).toHaveAttribute("aria-pressed", "false");
  const second = page.getByRole("button", { name: "Offset 2 X/Y pad", exact: true });
  await expect(second.locator('[data-vector-pad-axis="x"]')).toBeVisible();
  await drag(page, second, 0.8, 0.8);
  await expect(page.getByRole("button", { name: "Edit Offset 2 X value", exact: true })).toHaveText("0.60");
  await expect(page.getByRole("button", { name: "Edit Offset 2 Y value", exact: true })).toHaveText("0.60");
});
