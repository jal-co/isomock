import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

for (const { label, field, presets, sliderIndex, restoreIndex } of [
  {
    label: "Letter spacing",
    field: "letterSpacing",
    presets: [
      "tightest",
      "tighter",
      "tight",
      "normal",
      "wide",
      "wider",
      "widest",
    ],
    sliderIndex: 0,
    restoreIndex: 0,
  },
  {
    label: "Line height",
    field: "lineHeight",
    presets: [
      "none",
      "tight",
      "snug",
      "normal",
      "relaxed",
      "spacious",
      "loose",
    ],
    sliderIndex: 1,
    restoreIndex: 5,
  },
]) {
  test(`${label} centers normal, reaches both extremes and restores settings`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const value = async () =>
      JSON.parse((await page.getByTestId("font-value").textContent())!);
    await page.goto("/e2e/browser-font-picker-fixture.html");
    await page
      .getByRole("button", { name: "Select Font", exact: true })
      .click();
    // The existing theme portal host is aria-hidden; inspect its real labeled input.
    const spacing = page.getByLabel(label, { exact: true });
    await expect(spacing).toHaveAttribute("aria-valuenow", "3");
    const geometry = await spacing.evaluate((input) => {
      const slider = input.closest('[data-slot="slider"]')!;
      const track = slider
        .querySelector('[data-slot="slider-track"]')!
        .getBoundingClientRect();
      const thumb = slider
        .querySelector('[data-slot="slider-thumb"]')!
        .getBoundingClientRect();
      return {
        trackCenter: track.x + track.width / 2,
        thumbCenter: thumb.x + thumb.width / 2,
      };
    });
    expect(Math.abs(geometry.trackCenter - geometry.thumbCenter)).toBeLessThan(
      1,
    );
    const track = page
      .locator('[data-slot="font-picker-footer-slider"]')
      .nth(sliderIndex)
      .locator('[data-slot="slider-track"]');
    const thumb = page
      .locator('[data-slot="font-picker-footer-slider"]')
      .nth(sliderIndex)
      .locator('[data-slot="slider-thumb"]');
    const trackBox = (await track.boundingBox())!;
    for (const [index, preset] of presets.entries()) {
      const thumbBox = (await thumb.boundingBox())!;
      await page.mouse.move(
        thumbBox.x + thumbBox.width / 2,
        thumbBox.y + thumbBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        trackBox.x + (trackBox.width * index) / 6,
        trackBox.y + trackBox.height / 2,
        { steps: 4 },
      );
      await page.mouse.up();
      await expect.poll(async () => (await value())[field]).toBe(preset);
      await expect(spacing).toHaveAttribute("aria-valuenow", String(index));
    }
    await spacing.press("Home");
    await spacing.press("ArrowLeft");
    await expect.poll(async () => (await value())[field]).toBe(presets[0]);
    await page.mouse.click(
      trackBox.x + Math.max(1, (trackBox.width * restoreIndex) / 6),
      trackBox.y + trackBox.height / 2,
    );
    const restoredPreset = presets[restoreIndex];
    await expect.poll(async () => (await value())[field]).toBe(restoredPreset);
    await page.keyboard.press("Escape");
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export Settings", exact: true })
      .click();
    const payload = JSON.parse(
      await readFile((await (await download).path())!, "utf8"),
    );
    expect(payload.values["text.font"][field]).toBe(restoredPreset);
    await page
      .getByRole("button", { name: "Select Font", exact: true })
      .click();
    await spacing.press("End");
    await spacing.press("ArrowRight");
    await expect.poll(async () => (await value())[field]).toBe(presets[6]);
    await page.keyboard.press("Escape");
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "Import Settings", exact: true })
      .click();
    await (
      await chooser
    ).setFiles({
      name: "settings.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(payload)),
    });
    await expect.poll(async () => (await value())[field]).toBe(restoredPreset);
    await page.reload();
    await expect.poll(async () => (await value())[field]).toBe(restoredPreset);
    await page
      .getByRole("button", { name: "Select Font", exact: true })
      .click();
    await expect(spacing).toHaveAttribute(
      "aria-valuenow",
      String(restoreIndex),
    );
    expect(errors).toEqual([]);
  });
}
