import { expect, test } from "@playwright/test";

import {
  createToolcraftBrowserProofSession,
  getToolcraftBrowserActionSurface,
  getToolcraftBrowserActionTarget,
  runToolcraftBrowserAction,
  runToolcraftBrowserValueAction,
  type ToolcraftBrowserProofSession,
} from "./browser-proof-session";
import { expectToolcraftTimelineDuration } from "./browser-timeline-evidence-helpers";

const TOOLCRAFT_APP_ROOT_SELECTOR = '[data-slot="toolcraft-runtime-app"]';

async function createDurationFixture(
  page: Parameters<typeof createToolcraftBrowserProofSession>[0],
): Promise<ToolcraftBrowserProofSession> {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await page.locator(TOOLCRAFT_APP_ROOT_SELECTOR).evaluate((root) => {
    root.setAttribute(
      "data-duration",
      JSON.stringify({
        renderedCycleDurationSeconds: 8,
        timelineDurationSeconds: 8,
      }),
    );
  });
  return session;
}

test("semantic recipes reject raw in-memory callbacks", async ({ page }) => {
  let duration = {
    renderedCycleDurationSeconds: 8,
    timelineDurationSeconds: 8,
  };

  await expect(
    expectToolcraftTimelineDuration(
      (async () => duration) as never,
      (async () => {
        duration = {
          renderedCycleDurationSeconds: 6,
          timelineDurationSeconds: 6,
        };
      }) as never,
      6,
      { requirementId: "timeline.raw-callback", stabilityIntervalMs: 0 },
    ),
  ).rejects.toThrow(/browser proof session/u);
});

test("semantic recipes reject action and observation from different sessions", async ({
  page,
}) => {
  await page.goto("/");
  const first = await createToolcraftBrowserProofSession(page);
  const second = await createToolcraftBrowserProofSession(page);
  const observation = first.observe((root) =>
    JSON.parse(root.getAttribute("data-duration") ?? "null"),
  );
  const action = second.action(async (currentPage) => {
    await currentPage.locator('[data-slot="toolcraft-runtime-app"]').evaluate((root) => {
      root.setAttribute(
        "data-duration",
        JSON.stringify({
          renderedCycleDurationSeconds: 6,
          timelineDurationSeconds: 6,
        }),
      );
    });
  });

  await expect(
    expectToolcraftTimelineDuration(observation, action, 6, {
      requirementId: "timeline.mixed-session",
      stabilityIntervalMs: 0,
    }),
  ).rejects.toThrow(/same browser proof session/u);
});

test("semantic recipes accept observations rooted in the current Toolcraft page", async ({
  page,
}) => {
  const session = await createDurationFixture(page);
  const observation = session.observe((root) =>
    JSON.parse(root.getAttribute("data-duration") ?? "null"),
  );
  const action = session.action(async (currentPage) => {
    await currentPage.locator('[data-slot="toolcraft-runtime-app"]').evaluate((root) => {
      root.setAttribute(
        "data-duration",
        JSON.stringify({
          renderedCycleDurationSeconds: 6,
          timelineDurationSeconds: 6,
        }),
      );
    });
  });

  await expectToolcraftTimelineDuration(observation, action, 6, {
    requirementId: "timeline.browser-session",
    stabilityIntervalMs: 0,
  });
});

test("target-scoped actions resolve the exact field inside a grouped control", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await page.locator(TOOLCRAFT_APP_ROOT_SELECTOR).evaluate((root) => {
    const boundary = document.createElement("div");
    boundary.className = "contents";
    boundary.dataset.toolcraftControlTargets = JSON.stringify([
      "appearance.fill",
      "appearance.stroke",
    ]);
    for (const target of ["appearance.fill", "appearance.stroke"]) {
      const field = document.createElement("div");
      field.dataset.slot = "field";
      const button = document.createElement("button");
      button.dataset.target = target;
      button.textContent = target;
      field.append(button);
      boundary.append(field);
    }
    root.append(boundary);
  });
  const action = session.controlAction("appearance.stroke", async (control) => {
    await control.getByRole("button").evaluate((button) => {
      button.dataset.clicked = "true";
    });
  });

  expect(getToolcraftBrowserActionTarget(action)).toBe("appearance.stroke");
  expect(getToolcraftBrowserActionSurface(action)).toBe("panel");
  await runToolcraftBrowserAction(action);
  await expect(
    page.locator('button[data-target="appearance.stroke"]'),
  ).toHaveAttribute("data-clicked", "true");
  await expect(page.locator('button[data-target="appearance.fill"]')).not.toHaveAttribute(
    "data-clicked",
    "true",
  );

  const valueAction = session.controlAction(
    "appearance.stroke",
    async () => "stroke-result",
  );
  await expect(runToolcraftBrowserValueAction(valueAction)).resolves.toBe(
    "stroke-result",
  );

  const semanticAction = session.targetAction(
    " layers.order ",
    async (currentPage) => {
      await currentPage
        .locator('button[data-target="appearance.stroke"]')
        .evaluate((button) => {
          button.dataset.semanticAction = "true";
        });
    },
  );
  expect(getToolcraftBrowserActionTarget(semanticAction)).toBe("layers.order");
  await runToolcraftBrowserAction(semanticAction);
  await expect(
    page.locator('button[data-target="appearance.stroke"]'),
  ).toHaveAttribute("data-semantic-action", "true");
  expect(() => session.targetAction(" ", async () => undefined)).toThrow(
    /non-empty semantic target/u,
  );
});

test("surface actions verify Canvas and Panel locator provenance", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await page.locator(TOOLCRAFT_APP_ROOT_SELECTOR).evaluate((root) => {
    const canvas = root.querySelector('[data-slot="toolcraft-runtime-canvas"]');
    const panel = root.querySelector("[data-toolcraft-controls-panel-shell]");
    if (!canvas || !panel) {
      throw new Error("Missing runtime surfaces for proof-session fixture.");
    }
    for (const [owner, id] of [
      [canvas, "surface-canvas"],
      [panel, "surface-panel"],
    ] as const) {
      const button = document.createElement("button");
      button.id = id;
      button.type = "button";
      button.textContent = id;
      if (id === "surface-canvas") {
        Object.assign(button.style, {
          left: "16px",
          position: "absolute",
          top: "16px",
          zIndex: "50",
        });
      }
      button.addEventListener("click", () => {
        button.dataset.clicked = "true";
      });
      button.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      owner.append(button);
    }
  });

  const canvasAction = session.surfaceAction("selection.active", {
    selector: "#surface-canvas",
    surface: "canvas",
  });
  const panelAction = session.surfaceAction("selection.active", {
    selector: "#surface-panel",
    surface: "panel",
  });
  expect(getToolcraftBrowserActionSurface(canvasAction)).toBe("canvas");
  expect(getToolcraftBrowserActionSurface(panelAction)).toBe("panel");
  await runToolcraftBrowserAction(canvasAction);
  await runToolcraftBrowserAction(panelAction);
  await expect(page.locator("#surface-canvas")).toHaveAttribute(
    "data-clicked",
    "true",
  );
  await expect(page.locator("#surface-panel")).toHaveAttribute(
    "data-clicked",
    "true",
  );

  await expect(
    runToolcraftBrowserAction(
      session.surfaceAction("selection.active", {
        selector: "#surface-panel",
        surface: "canvas",
      }),
    ),
  ).rejects.toThrow(/declared canvas runtime surface/u);
  await expect(
    runToolcraftBrowserAction(
      session.surfaceAction("selection.active", {
        selector: "#missing-surface",
        surface: "canvas",
      }),
    ),
  ).rejects.toThrow(/resolve exactly once/u);
  expect(() =>
    session.surfaceAction("selection.active", {
      position: { x: -1, y: 0 },
      selector: "#surface-canvas",
      surface: "canvas",
    }),
  ).toThrow(/finite nonnegative coordinates/u);
});

test("proof sessions reject pages without the Toolcraft app identity", async ({ page }) => {
  await page.setContent('<main data-slot="toolcraft-runtime-app"></main>');

  await expect(createToolcraftBrowserProofSession(page)).rejects.toThrow(
    /server-backed http\(s\) page/u,
  );
});

test("proof sessions start from a fresh server document instead of synthetic DOM", async ({
  page,
}) => {
  await page.goto("/");
  await page.setContent(`
    <meta name="toolcraft-app-title" content="Toolcraft App Template" />
    <main data-slot="toolcraft-runtime-app" data-synthetic="true"></main>
  `);

  await createToolcraftBrowserProofSession(page);

  await expect(page.locator('[data-synthetic="true"]')).toHaveCount(0);
  await expect(page.locator(TOOLCRAFT_APP_ROOT_SELECTOR)).toBeVisible();
});

test("proof sessions reject a synthetic root replacement after verification", async ({
  page,
}) => {
  const session = await createDurationFixture(page);
  const observation = session.observe((root) => root.getAttribute("data-duration"));
  const action = session.action(async (currentPage) => {
    await currentPage.locator(TOOLCRAFT_APP_ROOT_SELECTOR).evaluate((root) => {
      const replacement = document.createElement("main");
      replacement.dataset.slot = "toolcraft-runtime-app";
      root.replaceWith(replacement);
    });
  });

  await expect(
    expectToolcraftTimelineDuration(observation, action, 6, {
      requirementId: "timeline.synthetic-root",
      stabilityIntervalMs: 0,
    }),
  ).rejects.toThrow(/original live runtime root/u);
});
