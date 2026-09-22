import { expect, test } from "@playwright/test";

import {
  measureToolcraftClipboardActionByLabel,
  measureToolcraftDownloadActionByLabel,
} from "./performance-output-action-helpers";

test("output action helper measures a completed download", async ({ page }) => {
  await page.setContent(`
    <button type="button" onclick="
      const link = document.createElement('a');
      link.download = 'toolcraft-output.txt';
      link.href = 'data:text/plain,toolcraft-output';
      link.click();
    ">Export output</button>
  `);

  const { completion, result } = await measureToolcraftDownloadActionByLabel(
    page,
    "Export output",
  );

  expect(completion.suggestedFilename()).toBe("toolcraft-output.txt");
  expect(await completion.path()).toBeTruthy();
  expect(result.durationMs).toBeGreaterThanOrEqual(0);
});

test("output action helper measures a completed clipboard write", async ({ page }) => {
  await page.goto("/");
  await page.setContent(`
    <button type="button" onclick="navigator.clipboard.writeText('toolcraft-output')">
      Copy output
    </button>
  `);

  const { completion, result } = await measureToolcraftClipboardActionByLabel(
    page,
    "Copy output",
  );

  expect(completion).toContain("text/plain");
  expect(result.durationMs).toBeGreaterThanOrEqual(0);
});
