import { expect } from "@playwright/test";

import type { ToolcraftInteractionResult } from "./performance-probe-helpers";
import type { ToolcraftPerformancePathBudget } from "./performance-profile-helpers";

type ToolcraftPerformanceBudgetResult = Partial<ToolcraftInteractionResult> & {
  durationMs?: number;
  exportMs?: number;
  frameGapMs?: number;
  previewMs?: number;
};

export function expectToolcraftPerformanceBudget(
  result: ToolcraftPerformanceBudgetResult,
  budget: ToolcraftPerformancePathBudget,
): void {
  if (typeof budget.maxInteractionMs === "number") {
    expect(
      result.durationMs,
      `Expected interaction duration to stay within ${budget.maxInteractionMs}ms.`,
    ).toBeLessThanOrEqual(budget.maxInteractionMs);
  }

  if (typeof budget.maxFrameGapMs === "number") {
    expect(
      result.sampleCount,
      "Frame-gap budgets require at least one observed animation frame.",
    ).toBeGreaterThan(0);
    expect(
      result.maxFrameGapMs ?? result.frameGapMs,
      `Expected frame gaps to stay within ${budget.maxFrameGapMs}ms.`,
    ).toBeLessThanOrEqual(budget.maxFrameGapMs);
  }

  if (typeof budget.maxLongTaskMs === "number") {
    expect(
      result.longTaskMaxMs,
      `Expected long tasks to stay within ${budget.maxLongTaskMs}ms.`,
    ).toBeLessThanOrEqual(budget.maxLongTaskMs);
  }

  if (typeof budget.maxExportMs === "number") {
    expect(
      result.exportMs ?? result.durationMs,
      `Expected export/copy duration to stay within ${budget.maxExportMs}ms.`,
    ).toBeLessThanOrEqual(budget.maxExportMs);
  }

  if (typeof budget.maxPreviewMs === "number") {
    expect(
      result.previewMs ?? result.durationMs,
      `Expected preview duration to stay within ${budget.maxPreviewMs}ms.`,
    ).toBeLessThanOrEqual(budget.maxPreviewMs);
  }
}
