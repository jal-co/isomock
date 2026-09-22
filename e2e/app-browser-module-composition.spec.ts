import { expect, test } from "@playwright/test";

test("module panels share commands, undo and persisted reload through ToolcraftApp", async ({ page }) => {
  await page.goto("/e2e/browser-module-composition-fixture.html");
  await expect(page.locator('[data-slot="timeline-panel"]')).toBeVisible();
  await page.getByRole("button", { name: "Add layer", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Layer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Hide Layer 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hide Layer 1", exact: true }).click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("button", { name: "Hide Layer 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hide Layer 1", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("toolcraft:module-composition-fixture:state:v2") ?? "null")?.state?.layers?.[0]?.visible)).toBe(false);
  await page.reload();
  await expect(page.getByRole("button", { name: "Show Layer 1", exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="timeline-panel"]')).toBeVisible();
});

test("absent panel modules contribute no surface to ToolcraftApp", async ({ page }) => {
  await page.goto("/e2e/browser-module-composition-fixture.html?absent=1");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await expect(page.locator('[data-slot="timeline-panel"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add layer", exact: true })).toHaveCount(0);
});
