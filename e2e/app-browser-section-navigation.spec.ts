import { expect, test, type Page } from "@playwright/test";

async function openNavigation(page: Page) {
  const panel = page.locator('[data-panel-id="properties"]');
  const bounds = await panel.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + 20, bounds!.y + 90);
  await page.mouse.move(bounds!.x + 6, bounds!.y + 90);
  const navigation = page.getByRole("navigation", { name: "Panel sections" });
  await expect(navigation).toBeVisible();
  return navigation;
}

test("section navigation fades long labels and reopens after repeated panel resets", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/e2e/browser-section-navigation-fixture.html");
  const viewport = page.locator('[data-slot="toolcraft-panel-content"]');
  await expect(viewport).toBeVisible();
  let navigation = await openNavigation(page);
  const title = "Tab 4 points · Competitive Conquesting Customers";
  const longButton = navigation.getByRole("button", { name: title, exact: true });
  const longLabel = longButton.locator('[data-scroll-fade-viewport]');
  const shortLabel = navigation.getByRole("button", { name: "Map life", exact: true }).locator('[data-scroll-fade-viewport]');
  await expect(longLabel).toHaveCSS("--scroll-fade-trailing-fade", "20px");
  await expect(shortLabel).toHaveCSS("--scroll-fade-trailing-fade", "0px");
  await expect(longLabel).toHaveCSS("overflow-x", "hidden");
  expect(await longLabel.evaluate((element) => getComputedStyle(element).maskImage)).toContain("linear-gradient(to right");
  expect(await longLabel.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  const surface = page.locator('[data-toolcraft-controls-section-navigation-surface]');
  expect((await surface.boundingBox())!.width).toBeLessThanOrEqual(240);
  await page.screenshot({ path: info.outputPath("section-navigation-fade.png") });

  // A real slow pointer crossing must retain the popup through its 8px gap.
  const popupBounds = (await surface.boundingBox())!;
  const panelBounds = (await page.locator('[data-panel-id="properties"]').boundingBox())!;
  await page.mouse.move((popupBounds.x + popupBounds.width + panelBounds.x) / 2, popupBounds.y + 20);
  await page.waitForTimeout(80); // Deliberately exceed the 50ms leave grace.
  await expect(navigation).toBeVisible();
  await longButton.click();
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  await expect(longButton).toHaveAttribute("aria-current", "location");

  for (let reset = 0; reset < 3; reset += 1) {
    const oldPanel = await page.locator('[data-panel-id="properties"]').elementHandle();
    await page.getByRole("button", { name: "Reset controls", exact: true }).click();
    expect(await oldPanel!.evaluate((element) => element.isConnected)).toBe(false);
    await expect(navigation).toHaveCount(0);
    navigation = await openNavigation(page);
    await navigation.getByRole("button", { name: "Field 5", exact: true }).click();
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(500);
    await oldPanel!.dispose();
  }

  await page.getByRole("button", { name: "Collapse controls", exact: true }).click();
  await expect(navigation).toHaveCount(0);
  await page.getByRole("button", { name: "Expand controls", exact: true }).click();
  await openNavigation(page);
  expect(errors).toEqual([]);
});
