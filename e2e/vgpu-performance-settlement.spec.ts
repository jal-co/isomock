import { expect, test } from "@playwright/test";

import { readPhysicalFeedbackSettlementGenerations } from "./fixtures/vgpu-physical-feedback/e2e/vgpu-performance-settlement";

const canvasMarkup =
  '<canvas data-toolcraft-vgpu-product=""></canvas>';

test("VGPU settlement rejects missing generation attributes instead of settling", async ({
  page,
}) => {
  await page.setContent(canvasMarkup);
  await expect(readPhysicalFeedbackSettlementGenerations(page)).rejects.toThrow(
    /data-vgpu-operation-settled.*canonical non-negative safe integer/iu,
  );

  await page.locator("canvas").evaluate((canvas) => {
    for (const name of [
      "data-vgpu-operation-settled",
      "data-vgpu-operation-started",
      "data-vgpu-retirement-settled",
      "data-vgpu-retirement-started",
    ]) {
      canvas.setAttribute(name, "0");
    }
  });
  await expect(readPhysicalFeedbackSettlementGenerations(page)).resolves.toEqual({
    operationSettled: 0,
    operationStarted: 0,
    retirementSettled: 0,
    retirementStarted: 0,
  });
});
