import {
  chromium,
  expect,
  test as base,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

export const toolcraftVgpuChromiumFlags = Object.freeze([
  "--enable-unsafe-webgpu",
  "--use-webgpu-adapter=swiftshader",
  "--enable-dawn-features=allow_unsafe_apis",
  "--disable-dawn-features=use_dxc",
  "--enable-webgpu-developer-features",
  "--use-gpu-in-tests",
  "--enable-accelerated-2d-canvas",
]);

const errorsByPage = new WeakMap<Page, string[]>();

function observePageErrors(page: Page): void {
  const errors: string[] = [];
  errorsByPage.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
}

export async function expectNoToolcraftVgpuPageErrors(page: Page): Promise<void> {
  expect(errorsByPage.get(page) ?? []).toEqual([]);
}

export async function readCanvasSample(page: Page): Promise<readonly number[]> {
  const canvas = page.locator('canvas[data-toolcraft-vgpu-product=""]');
  const screenshot = await canvas.screenshot();
  return page.evaluate(async (base64) => {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    try {
      const sample = document.createElement("canvas");
      sample.width = bitmap.width;
      sample.height = bitmap.height;
      const context = sample.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Unable to inspect VGPU canvas pixels.");
      context.drawImage(bitmap, 0, 0);
      const x = Math.floor(bitmap.width / 2);
      const y = Math.floor(bitmap.height / 2);
      return Array.from(context.getImageData(x, y, 1, 1).data);
    } finally {
      bitmap.close();
    }
  }, screenshot.toString("base64"));
}

export async function expectToolcraftVgpuRuntime(
  page: Page,
  expected: Readonly<{
    impulse: () => Promise<void>;
    playback?: "pause" | "preserve";
  }>,
): Promise<Readonly<{ after: readonly number[]; before: readonly number[] }>> {
  const canvas = page.locator('canvas[data-toolcraft-vgpu-product=""]');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-toolcraft-gpu-status", "ready");
  await expect(canvas).toHaveAttribute("data-toolcraft-gpu-backend", "webgpu");
  await expect(canvas).toHaveAttribute("data-toolcraft-gpu-provider", "vgpu");
  await expect(canvas).toHaveAttribute(
    "data-toolcraft-gpu-presentation",
    "target-readback",
  );
  const backing = await canvas.getAttribute("data-toolcraft-gpu-backing");
  const actual = await canvas.evaluate((element) => {
    const source = element as HTMLCanvasElement;
    return `${source.width}x${source.height}`;
  });
  expect(backing).toBe(actual);

  if (expected.playback !== "preserve") {
    const pause = page.getByRole("button", { name: "Pause playback" });
    if (await pause.isVisible()) {
      await pause.click();
      await expect(canvas).toHaveAttribute("data-vgpu-playing", "false");
    }
  }

  const before = await readCanvasSample(page);
  await expected.impulse();
  await expect.poll(() => readCanvasSample(page)).not.toEqual(before);
  const after = await readCanvasSample(page);
  expect(after).not.toEqual(before);
  return Object.freeze({ after, before });
}

type VgpuWorkerFixtures = Readonly<{ vgpuBrowser: Browser }>;

type ToolcraftVgpuBrowserMode = "required" | "unsupported";

export async function createToolcraftVgpuBrowserPage(
  browser: Browser,
  baseURL: string | undefined,
  mode: ToolcraftVgpuBrowserMode,
): Promise<Readonly<{ context: BrowserContext; page: Page }>> {
  const context = await browser.newContext({
    baseURL,
    viewport: { height: 720, width: 1280 },
  });
  try {
    if (mode === "unsupported") {
      await context.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, "gpu", {
          configurable: true,
          get: () => undefined,
        });
      });
    }
    const page = await context.newPage();
    observePageErrors(page);
    await page.goto("/");
    if (
      mode === "required" &&
      !(await page.evaluate(() => Boolean(navigator.gpu)))
    ) {
      throw new Error("The isolated VGPU browser has no navigator.gpu.");
    }
    return Object.freeze({ context, page });
  } catch (error) {
    await context.close();
    throw error;
  }
}

export const test = base.extend<
  Readonly<{ page: Page }>,
  VgpuWorkerFixtures
>({
  vgpuBrowser: [
    async ({}, use) => {
      const browser = await chromium.launch({ args: [...toolcraftVgpuChromiumFlags] });
      try {
        await use(browser);
      } finally {
        await browser.close();
      }
    },
    { scope: "worker" },
  ],
  page: async ({ baseURL, vgpuBrowser }, use) => {
    const owned = await createToolcraftVgpuBrowserPage(
      vgpuBrowser,
      baseURL,
      "required",
    );
    try {
      await use(owned.page);
    } finally {
      try {
        await expectNoToolcraftVgpuPageErrors(owned.page);
      } finally {
        await owned.context.close();
      }
    }
  },
});

export async function createToolcraftUnsupportedVgpuPage(
  browser: Browser,
  baseURL: string | undefined,
): Promise<Readonly<{ context: BrowserContext; page: Page }>> {
  return createToolcraftVgpuBrowserPage(browser, baseURL, "unsupported");
}
