import { expect, type Download, type Page } from "@playwright/test";

import {
  measureToolcraftInteraction,
  type ToolcraftInteractionOptions,
  type ToolcraftInteractionResult,
} from "./performance-probe-helpers";
import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";

export async function clickToolcraftPanelActionByLabel(
  page: Page,
  label: string,
): Promise<void> {
  const action = page.getByRole("button", { name: label, exact: true });
  await expect(action, `Toolcraft panel action "${label}" should be visible`).toBeVisible();
  await action.click();
}

export async function measureToolcraftDownloadActionByLabel(
  page: Page,
  label: string,
  options: ToolcraftInteractionOptions = {},
): Promise<{ completion: Download; result: ToolcraftInteractionResult }> {
  let completion: Download | undefined;
  const result = await measureToolcraftInteraction(
    page,
    async () => {
      [completion] = await Promise.all([
        page.waitForEvent("download"),
        clickToolcraftPanelActionByLabel(page, label),
      ]);
      await completion.path();
    },
    options,
  );

  if (!completion) {
    throw new Error(`Toolcraft panel action "${label}" did not produce a download.`);
  }

  if (options.pathId) {
    await attachToolcraftBrowserRuntimeEvidence({
      evidenceType: "performance-output-completion",
      requirementId: options.pathId,
      target: options.target,
    });
  }

  return { completion, result };
}

async function readToolcraftClipboardSignature(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const entries: Array<{ hash: string; size: number; type: string }> = [];

    for (const item of items) {
      for (const type of [...item.types].sort()) {
        const blob = await item.getType(type);
        const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
        const hash = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
        entries.push({ hash, size: blob.size, type });
      }
    }

    return JSON.stringify(entries);
  });
}

export async function measureToolcraftClipboardActionByLabel(
  page: Page,
  label: string,
  options: ToolcraftInteractionOptions = {},
): Promise<{ completion: string; result: ToolcraftInteractionResult }> {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const sentinel = `toolcraft-clipboard-sentinel-${Date.now()}-${Math.random()}`;
  await page.evaluate((value) => navigator.clipboard.writeText(value), sentinel);
  const before = await readToolcraftClipboardSignature(page);
  let completion: string | undefined;
  const result = await measureToolcraftInteraction(
    page,
    async () => {
      await clickToolcraftPanelActionByLabel(page, label);
      await expect
        .poll(async () => {
          completion = await readToolcraftClipboardSignature(page);
          return completion;
        })
        .not.toBe(before);
    },
    options,
  );

  if (!completion || completion === before) {
    throw new Error(`Toolcraft panel action "${label}" did not update the clipboard.`);
  }

  if (options.pathId) {
    await attachToolcraftBrowserRuntimeEvidence({
      evidenceType: "performance-output-completion",
      requirementId: options.pathId,
      target: options.target,
    });
  }

  return { completion, result };
}
