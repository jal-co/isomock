import { expect, test, type Page } from "@playwright/test";

import { expectToolcraftCanvasBackingPixelsForRenderScale } from "./browser-render-scale-evidence";
import { createToolcraftPerformanceCanvasQualityGuard } from "./performance-canvas-quality-guard";

const canvasSelector = "[data-quality-guard-canvas]";

async function installCanvas(page: Page): Promise<void> {
  await page.setContent(`
    <canvas
      data-quality-guard-canvas
      style="display:block;width:120px;height:80px"
    ></canvas>
  `);
  await setBackingScale(page, 2);
}

async function setBackingScale(page: Page, scale: number): Promise<void> {
  await page.locator(canvasSelector).evaluate((canvas, nextScale) => {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Quality guard fixture must target a canvas.");
    }
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * window.devicePixelRatio * nextScale);
    canvas.height = Math.round(rect.height * window.devicePixelRatio * nextScale);
  }, scale);
}

async function createGuard(
  page: Page,
  cssSizePolicy: "fixed" | "viewport-driven" = "fixed",
) {
  const baselineCssSize = await expectToolcraftCanvasBackingPixelsForRenderScale(
    page,
    canvasSelector,
    2,
    { state: "performance-baseline" },
  );
  return createToolcraftPerformanceCanvasQualityGuard(page, {
    baselineCssSize,
    canvasSelector,
    cssSizePolicy,
    pathId: "performance-path:quality-guard",
  });
}

test("quality guard rejects a transient same-document 1x clamp", async ({
  page,
}) => {
  await installCanvas(page);
  const guard = await createGuard(page);

  try {
    await expect(
      guard.runPhase("cold", async () => {
        await setBackingScale(page, 1);
        await page.evaluate(
          () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
        );
        await setBackingScale(page, 2);
      }),
    ).rejects.toThrow(/cold.*backing width/iu);
  } finally {
    await guard.dispose();
  }
});

test("quality guard rejects an immediate 1x clamp followed by canvas replacement", async ({
  page,
}) => {
  await installCanvas(page);
  const guard = await createGuard(page);

  try {
    await expect(
      guard.runPhase("cold", async () => {
        await page.locator(canvasSelector).evaluate((canvas) => {
          if (!(canvas instanceof HTMLCanvasElement)) {
            throw new Error("Quality guard fixture must target a canvas.");
          }
          const rect = canvas.getBoundingClientRect();
          canvas.width = Math.round(rect.width * window.devicePixelRatio);
          canvas.height = Math.round(rect.height * window.devicePixelRatio);
          const replacement = canvas.cloneNode(false) as HTMLCanvasElement;
          replacement.width = Math.round(
            rect.width * window.devicePixelRatio * 2,
          );
          replacement.height = Math.round(
            rect.height * window.devicePixelRatio * 2,
          );
          canvas.replaceWith(replacement);
        });
      }),
    ).rejects.toThrow(/cold.*backing width/iu);
  } finally {
    await guard.dispose();
  }
});

test("quality guard rejects a one-frame CSS transform on a deep ancestor", async ({
  page,
}) => {
  await installCanvas(page);
  await page.locator(canvasSelector).evaluate((canvas) => {
    let child: Element = canvas;
    for (let depth = 0; depth < 8; depth += 1) {
      const wrapper = document.createElement("div");
      wrapper.dataset.qualityGuardDepth = String(depth);
      child.replaceWith(wrapper);
      wrapper.append(child);
      child = wrapper;
    }
  });
  const guard = await createGuard(page);

  try {
    await expect(
      guard.runPhase("warm", async () => {
        await page.locator(canvasSelector).evaluate(async (canvas) => {
          if (!(canvas instanceof HTMLCanvasElement)) {
            throw new Error("Quality guard fixture must target a canvas.");
          }
          const ancestor = document.querySelector(
            '[data-quality-guard-depth="7"]',
          );
          if (!(ancestor instanceof HTMLElement)) {
            throw new Error("Quality guard fixture requires a canvas ancestor.");
          }
          ancestor.style.transform = "scale(.5)";
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          ancestor.style.transform = "";
        });
      }),
    ).rejects.toThrow(/warm.*preserve.*CSS width/iu);
  } finally {
    await guard.dispose();
  }
});

test("quality guard rejects a transient navigation-time 1x clamp", async ({
  page,
}) => {
  await installCanvas(page);
  const guard = await createGuard(page);
  const destination = `data:text/html,${encodeURIComponent(`
    <canvas data-quality-guard-canvas style="display:block;width:120px;height:80px"></canvas>
    <script>
      const canvas = document.querySelector('[data-quality-guard-canvas]');
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * devicePixelRatio);
      canvas.height = Math.round(rect.height * devicePixelRatio);
      requestAnimationFrame(() => {
        canvas.width = Math.round(rect.width * devicePixelRatio * 2);
        canvas.height = Math.round(rect.height * devicePixelRatio * 2);
      });
    <\/script>
  `)}`;

  try {
    await expect(
      guard.runPhase("warm", async () => {
        await page.goto(destination);
        await page.evaluate(
          () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
        );
      }),
    ).rejects.toThrow(/warm.*backing width/iu);
  } finally {
    await guard.dispose();
  }
});

test("quality guard accepts stable exact 2x backing", async ({ page }) => {
  await installCanvas(page);
  const guard = await createGuard(page);

  try {
    await expect(
      guard.runPhase("sustained", async () => {
        await setBackingScale(page, 2);
        return "stable";
      }),
    ).resolves.toBe("stable");
  } finally {
    await guard.dispose();
  }
});

test("quality guard accepts a declared prepared 1x to committed 2x action", async ({
  page,
}) => {
  await installCanvas(page);
  const baselineCssSize = await expectToolcraftCanvasBackingPixelsForRenderScale(
    page,
    canvasSelector,
    2,
  );
  const guard = await createToolcraftPerformanceCanvasQualityGuard(page, {
    baselineCssSize,
    canvasSelector,
    cssSizePolicy: "fixed",
    pathId: "performance-path:render-scale-action",
    preparationScale: 1,
  });
  await setBackingScale(page, 1);

  try {
    await expect(
      guard.runPhase("cold", async () => setBackingScale(page, 2)),
    ).resolves.toBeUndefined();
    await setBackingScale(page, 1);
    await expect(
      guard.runPhase("warm", async () => undefined),
    ).rejects.toThrow(/warm.*backing width/iu);
  } finally {
    await guard.dispose();
  }
});

test("quality guard rejects a prepared scale after required scale was committed", async ({
  page,
}) => {
  await installCanvas(page);
  const baselineCssSize = await expectToolcraftCanvasBackingPixelsForRenderScale(
    page,
    canvasSelector,
    2,
  );
  const guard = await createToolcraftPerformanceCanvasQualityGuard(page, {
    baselineCssSize,
    canvasSelector,
    cssSizePolicy: "fixed",
    pathId: "performance-path:render-scale-regression",
    preparationScale: 1,
  });
  await setBackingScale(page, 1);

  try {
    await expect(
      guard.runPhase("cold", async () => {
        await setBackingScale(page, 2);
        await setBackingScale(page, 1);
        await setBackingScale(page, 2);
      }),
    ).rejects.toThrow(/cold.*backing width/iu);
  } finally {
    await guard.dispose();
  }
});

test("quality guard accepts exact backing while viewport zoom changes visible size", async ({
  page,
}) => {
  await installCanvas(page);
  const guard = await createGuard(page, "viewport-driven");

  try {
    await expect(
      guard.runPhase("cold", async () => {
        await page.locator(canvasSelector).evaluate((canvas) => {
          if (!(canvas instanceof HTMLCanvasElement)) {
            throw new Error("Quality guard fixture must target a canvas.");
          }
          canvas.style.width = "132px";
          canvas.width = Math.round(132 * window.devicePixelRatio * 2);
        });
      }),
    ).resolves.toBeUndefined();
  } finally {
    await guard.dispose();
  }
});

test("quality guard rejects a transient clamp while viewport zoom changes visible size", async ({
  page,
}) => {
  await installCanvas(page);
  const guard = await createGuard(page, "viewport-driven");

  try {
    await expect(
      guard.runPhase("cold", async () => {
        await page.locator(canvasSelector).evaluate((canvas) => {
          if (!(canvas instanceof HTMLCanvasElement)) {
            throw new Error("Quality guard fixture must target a canvas.");
          }
          canvas.style.width = "132px";
          canvas.width = Math.round(132 * window.devicePixelRatio);
          canvas.width = Math.round(132 * window.devicePixelRatio * 2);
        });
      }),
    ).rejects.toThrow(/backing width/iu);
  } finally {
    await guard.dispose();
  }
});

test("quality guard preserves the original phase callback failure", async ({
  page,
}) => {
  await installCanvas(page);
  const guard = await createGuard(page);

  try {
    await expect(
      guard.runPhase("cold", async () => {
        await setBackingScale(page, 1);
        throw new Error("primary callback failure");
      }),
    ).rejects.toThrow("primary callback failure");
  } finally {
    await guard.dispose();
  }
});

test("quality guard ignores matching 1x canvases in child frames", async ({
  page,
}) => {
  await installCanvas(page);
  const guard = await createGuard(page);

  try {
    await expect(
      guard.runPhase("sustained", async () => {
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              const iframe = document.createElement("iframe");
              iframe.srcdoc = `<canvas data-quality-guard-canvas style="display:block;width:120px;height:80px" width="120" height="80"></canvas>`;
              iframe.addEventListener("load", () => resolve(), { once: true });
              document.body.append(iframe);
            }),
        );
        await page.waitForTimeout(50);
      }),
    ).resolves.toBeUndefined();
    const childFrame = page.frames().find((frame) => frame !== page.mainFrame());
    expect(childFrame).toBeDefined();
    expect(
      await childFrame!.evaluate(() =>
        Object.getOwnPropertyNames(globalThis).filter((key) =>
          key.startsWith("__toolcraftCanvasQualityObserver"),
        ),
      ),
    ).toEqual([]);
  } finally {
    await guard.dispose();
  }
});

test("disposed guard does not recreate observer state after navigation", async ({
  page,
}) => {
  await installCanvas(page);
  const guard = await createGuard(page);
  await guard.dispose();

  await page.goto(
    `data:text/html,${encodeURIComponent(
      '<canvas data-quality-guard-canvas style="display:block;width:120px;height:80px" width="120" height="80"></canvas>',
    )}`,
  );
  await page.waitForTimeout(50);

  expect(
    await page.evaluate(() =>
      Object.getOwnPropertyNames(globalThis).filter((key) =>
        key.startsWith("__toolcraftCanvasQualityObserver"),
      ),
    ),
  ).toEqual([]);
});
