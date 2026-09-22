import { expect, test, type Locator, type Page } from "@playwright/test";
import type { PanelScrollFixtureOptions } from "./browser-panel-scroll-fixture";

async function mount(page: Page, options: PanelScrollFixtureOptions = {}) {
  await page.evaluate(async (options) => {
    const fixtureUrl = "/e2e/browser-panel-scroll-fixture.tsx";
    const { mountPanelScrollFixture } = await import(/* @vite-ignore */ fixtureUrl);
    mountPanelScrollFixture(options);
  }, options);
  const panel = page.getByTestId("panel-scroll-fixture");
  const viewport = panel.locator('[data-slot="toolcraft-panel-content"]');
  await expect(viewport).toBeVisible();
  return { panel, viewport };
}

function scrollTop(viewport: Locator) {
  return viewport.evaluate((element) => element.scrollTop);
}

async function scroll(page: Page, viewport: Locator, delta = 510, hoverTarget = viewport) {
  const previous = await scrollTop(viewport);
  await hoverTarget.hover();
  // A wheel can still be settling after the first changed offset. Capture the
  // browser's final scroll position before comparing the debounced state.
  await Promise.all([
    viewport.evaluate((element) => new Promise<void>((resolve) => {
      element.addEventListener("scrollend", () => resolve(), { once: true });
    })),
    page.mouse.wheel(0, delta),
  ]);
  await expect.poll(() => scrollTop(viewport)).toBeGreaterThan(previous + 100);
  return scrollTop(viewport);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
});

test("panel scroll survives real reload with collapsed sections and stays through panel collapse and Reset", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let { panel, viewport } = await mount(page);
  const firstSection = panel.locator('[data-toolcraft-controls-section-anchor="toolcraft-controls-section-field-1"]');
  await firstSection.locator("[data-control-section-collapse-button]").click();
  await expect(firstSection).toHaveAttribute("data-collapsed", "true");
  await expect(firstSection.getByRole("slider")).toHaveCount(0);
  const position = await scroll(page, viewport, 510, panel.getByText("Field 3", { exact: true }));
  await expect.poll(async () => JSON.parse(await panel.getByTestId("panel-scroll-state").textContent() ?? "{}").scrollTop).toBe(position);
  await page.reload();
  ({ panel, viewport } = await mount(page));
  await expect.poll(() => scrollTop(viewport)).toBeCloseTo(position, 0);
  await expect(panel.locator('[data-toolcraft-controls-section-anchor="toolcraft-controls-section-field-1"]')).toHaveAttribute("data-collapsed", "true");
  await panel.getByRole("button", { name: "Collapse controls", exact: true }).click();
  await expect(viewport).toHaveCount(0);
  await panel.getByRole("button", { name: "Expand controls", exact: true }).click();
  await expect.poll(() => scrollTop(viewport)).toBeCloseTo(position, 0);
  await panel.getByRole("button", { name: "Reset controls", exact: true }).click();
  await expect.poll(() => scrollTop(viewport)).toBeCloseTo(position, 0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath("panel-scroll-restored.png") });
});

test("panel scroll flushes the latest live position on immediate browser reload", async ({ page }) => {
  let { viewport } = await mount(page);
  await scroll(page, viewport);
  // Navigation in the same JS turn proves pagehide works before the scroll event
  // or either debounce. The preceding wheel also proves the real input path.
  await Promise.all([
    page.waitForEvent("load"),
    viewport.evaluate((element) => { element.scrollTop = 731; location.reload(); }),
  ]);
  ({ viewport } = await mount(page));
  await expect.poll(() => scrollTop(viewport)).toBe(731);
});

test("panel scroll clamps safely when the reloaded panel is shorter", async ({ page }) => {
  let { panel, viewport } = await mount(page);
  const position = await scroll(page, viewport, 1400);
  await expect.poll(async () => JSON.parse(await panel.getByTestId("panel-scroll-state").textContent() ?? "{}").scrollTop).toBe(position);
  await page.reload();
  ({ viewport } = await mount(page, { sections: 3 }));
  const maximum = await viewport.evaluate((element) => Math.max(0, element.scrollHeight - element.clientHeight));
  expect(maximum).toBeGreaterThan(0);
  await expect.poll(() => scrollTop(viewport)).toBe(maximum);
  await viewport.hover();
  await page.mouse.wheel(0, -150);
  await expect.poll(() => scrollTop(viewport)).toBeLessThan(maximum);
});

test("panel scroll respects app isolation and the persistence opt-out", async ({ page }) => {
  let { viewport } = await mount(page);
  await scroll(page, viewport);
  await page.reload();
  ({ viewport } = await mount(page, { appId: "different" }));
  expect(await scrollTop(viewport)).toBe(0);
  await page.reload();
  ({ viewport } = await mount(page, { persist: false }));
  expect(await scrollTop(viewport)).toBe(0);
  await scroll(page, viewport);
  await page.reload();
  ({ viewport } = await mount(page, { persist: false }));
  expect(await scrollTop(viewport)).toBe(0);
});
