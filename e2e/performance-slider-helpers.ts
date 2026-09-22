import { expect, type Locator, type Page } from "@playwright/test";

import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { getToolcraftFieldByLabel } from "./performance-control-layout-helpers";

async function dragToolcraftSliderInField(
  page: Page,
  field: Locator,
  description: string,
  targetRatio: number,
): Promise<void> {
  const slider = field.locator('[data-slot="slider"]').first();
  const sliderValues = field.getByRole("slider");

  await expect(slider, `Toolcraft slider "${description}" should be visible`).toBeVisible();

  const box = await slider.boundingBox();
  if (!box) {
    throw new Error(`Could not measure slider "${description}".`);
  }

  const startX = box.x + box.width * 0.15;
  const endX = box.x + box.width * targetRatio;
  const y = box.y + box.height / 2;
  const valuesBefore = await sliderValues.evaluateAll((elements) =>
    elements.map((element) =>
      element.getAttribute("aria-valuenow") ??
      (element instanceof HTMLInputElement ? element.value : null),
    ),
  );

  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(endX, y, { steps: 12 });
  await page.mouse.up();

  const valuesAfter = await sliderValues.evaluateAll((elements) =>
    elements.map((element) =>
      element.getAttribute("aria-valuenow") ??
      (element instanceof HTMLInputElement ? element.value : null),
    ),
  );
  expect(
    valuesAfter,
    `Toolcraft slider "${description}" must expose a changed value after its drag interaction.`,
  ).not.toEqual(valuesBefore);
}

export async function dragToolcraftSliderByLabel(
  page: Page,
  label: string,
  targetRatio: number,
  options: { pathId?: string } = {},
): Promise<void> {
  if (options.pathId) {
    throw new Error(
      "Performance slider evidence must use dragToolcraftSliderByTarget(schemaTarget), not a visible label.",
    );
  }
  const field = await getToolcraftFieldByLabel(page, label);
  await dragToolcraftSliderInField(page, field, label, targetRatio);
}

export async function dragToolcraftSliderByTarget(
  page: Page,
  target: string,
  targetRatio: number,
  options: { pathId?: string } = {},
): Promise<void> {
  const field = await getToolcraftControlFieldByTarget(page, target);
  await dragToolcraftSliderInField(page, field, target, targetRatio);
  if (options.pathId) {
    await attachToolcraftBrowserRuntimeEvidence({
      evidenceType: "performance-control-drag",
      requirementId: options.pathId,
      target,
    });
  }
}

export async function dragToolcraftSliderToValue(
  page: Page,
  label: string,
  value: number,
  options: { pathId?: string } = {},
): Promise<void> {
  const field = await getToolcraftFieldByLabel(page, label);
  const slider = field.getByRole("slider").first();

  await expect(slider, `Toolcraft slider "${label}" should be visible`).toBeVisible();

  const range = await slider.evaluate((element) => {
    const htmlElement = element as HTMLElement;
    const min = Number(
      htmlElement.getAttribute("aria-valuemin") ??
        (htmlElement as HTMLInputElement).min ??
        "0",
    );
    const max = Number(
      htmlElement.getAttribute("aria-valuemax") ??
        (htmlElement as HTMLInputElement).max ??
        "100",
    );

    return {
      max: Number.isFinite(max) ? max : 100,
      min: Number.isFinite(min) ? min : 0,
    };
  });
  const denominator = range.max - range.min;
  const ratio = denominator === 0 ? 0 : (value - range.min) / denominator;

  await dragToolcraftSliderByLabel(
    page,
    label,
    Math.min(1, Math.max(0, ratio)),
    options,
  );
}

export async function dragToolcraftSliderTargetToValue(
  page: Page,
  target: string,
  value: number,
  options: { pathId?: string } = {},
): Promise<void> {
  const field = await getToolcraftControlFieldByTarget(page, target);
  const slider = field.getByRole("slider").first();
  const range = await slider.evaluate((element) => {
    const htmlElement = element as HTMLElement;
    const min = Number(
      htmlElement.getAttribute("aria-valuemin") ??
        (htmlElement as HTMLInputElement).min ??
        "0",
    );
    const max = Number(
      htmlElement.getAttribute("aria-valuemax") ??
        (htmlElement as HTMLInputElement).max ??
        "100",
    );
    return {
      max: Number.isFinite(max) ? max : 100,
      min: Number.isFinite(min) ? min : 0,
    };
  });
  const denominator = range.max - range.min;
  const ratio = denominator === 0 ? 0 : (value - range.min) / denominator;
  await dragToolcraftSliderByTarget(
    page,
    target,
    Math.min(1, Math.max(0, ratio)),
    options,
  );
}
