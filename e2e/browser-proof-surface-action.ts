import { expect, type Page } from "@playwright/test";

export type ToolcraftBrowserActionSurface = "canvas" | "panel";

export type ToolcraftBrowserSurfaceActionOptions = Readonly<{
  position?: Readonly<{ x: number; y: number }>;
  selector: string;
  surface: ToolcraftBrowserActionSurface;
}>;

export function normalizeToolcraftSurfaceActionOptions(
  options: ToolcraftBrowserSurfaceActionOptions,
): ToolcraftBrowserSurfaceActionOptions {
  if (!options.selector.trim()) {
    throw new Error("A surface action requires a non-empty selector.");
  }
  if (options.surface !== "canvas" && options.surface !== "panel") {
    throw new Error("A surface action requires canvas or panel ownership.");
  }
  if (
    options.position &&
    (!Number.isFinite(options.position.x) ||
      !Number.isFinite(options.position.y) ||
      options.position.x < 0 ||
      options.position.y < 0)
  ) {
    throw new Error(
      "A surface action position requires finite nonnegative coordinates.",
    );
  }
  return options;
}

async function getToolcraftActionSurface(
  page: Page,
  options: ToolcraftBrowserSurfaceActionOptions,
): Promise<ToolcraftBrowserActionSurface | null> {
  return page.locator(options.selector).evaluate((element) => {
    if (element.closest('[data-slot="toolcraft-runtime-canvas"]')) {
      return "canvas";
    }
    if (
      element.closest(
        "[data-toolcraft-controls-panel-shell], [data-toolcraft-layers-panel]",
      )
    ) {
      return "panel";
    }
    return null;
  });
}

export function createToolcraftSurfaceActionRunner(
  options: ToolcraftBrowserSurfaceActionOptions,
): (page: Page) => Promise<void> {
  return async (page) => {
    const locator = page.locator(options.selector);
    await expect(
      locator,
      `Surface action locator "${options.selector}" must resolve exactly once.`,
    ).toHaveCount(1);
    await expect(locator).toBeVisible();
    expect(
      await getToolcraftActionSurface(page, options),
      `Surface action locator "${options.selector}" must live inside the declared ${options.surface} runtime surface.`,
    ).toBe(options.surface);

    if (options.position) {
      const bounds = await locator.boundingBox();
      expect(bounds).not.toBeNull();
      expect(options.position.x).toBeLessThanOrEqual(bounds!.width);
      expect(options.position.y).toBeLessThanOrEqual(bounds!.height);
    }

    await locator.click(
      options.position ? { position: options.position } : undefined,
    );
  };
}
