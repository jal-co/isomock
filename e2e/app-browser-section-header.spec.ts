import { expect, test } from "@playwright/test";

test("section header aligns title left and keeps reset before its separate collapse button", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await page.evaluate(async () => {
    const fixtureUrl = "/e2e/browser-panel-scroll-fixture.tsx";
    const { mountPanelScrollFixture } = await import(/* @vite-ignore */ fixtureUrl);
    mountPanelScrollFixture({ sections: 2, persist: false });
  });
  const section = page.getByTestId("panel-scroll-fixture")
    .locator('[data-toolcraft-controls-section-anchor="toolcraft-controls-section-field-1"]');
  const title = section.locator('[data-slot="panel-title"]');
  await expect(title).toBeVisible();
  const textInset = await title.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getBoundingClientRect().left - element.getBoundingClientRect().left;
  });
  expect(Math.abs(textInset)).toBeLessThan(1);
  const reset = section.getByRole("button", { name: "Reset Field 1 section", exact: true });
  const collapse = section.getByRole("button", { name: "Collapse Field 1 section", exact: true });
  const resetBox = await reset.boundingBox();
  const collapseBox = await collapse.boundingBox();
  expect(resetBox).not.toBeNull();
  expect(collapseBox).not.toBeNull();
  expect(resetBox!.x + resetBox!.width).toBeLessThanOrEqual(collapseBox!.x);
  expect(collapseBox!.width).toBe(24);
  expect(collapseBox!.height).toBe(24);
  expect(await collapse.locator('[data-slot="panel-title"]').count()).toBe(0);
  // The DS ghost button keeps its surface while aria-expanded is true.
  await expect(collapse).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(await collapse.evaluate((element) => parseFloat(getComputedStyle(element).borderRadius))).toBeGreaterThan(0);
  const titleButton = section.getByRole("button", { name: "Toggle Field 1 section", exact: true });
  await titleButton.click();
  await expect(section).toHaveAttribute("data-collapsed", "true");
  const expand = section.getByRole("button", { name: "Expand Field 1 section", exact: true });
  const restingBackground = await expand.evaluate((element) => getComputedStyle(element).backgroundColor);
  await expand.hover();
  await expect.poll(() => expand.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(restingBackground);
  await expand.press("Space");
  await expect(section).toHaveAttribute("data-collapsed", "false");
  await collapse.press("Enter");
  await expect(section).toHaveAttribute("data-collapsed", "true");
  await titleButton.press("Enter");
  await expect(section).toHaveAttribute("data-collapsed", "false");
  await section.getByRole("button", { name: "Edit Amount value", exact: true }).click();
  const input = section.getByRole("textbox").first();
  await input.fill("72");
  await input.press("Enter");
  await expect(section.getByRole("slider", { name: "Amount", exact: true })).toHaveAttribute("aria-valuenow", "72");
  await reset.click();
  await expect(section.getByRole("slider", { name: "Amount", exact: true })).toHaveAttribute("aria-valuenow", "50");
  await expect(section).toHaveAttribute("data-collapsed", "false");
});
