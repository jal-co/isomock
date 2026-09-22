import { appSchema } from "../src/app/app-schema";
import { expectToolcraftPersistenceState } from "./browser-state-evidence-helpers";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { expect, test } from "./toolcraft-product-test";

const persistence = appSchema.persistence;

if (persistence.storage !== "localStorage") {
  throw new Error("The app persistence browser proof requires localStorage.");
}

const persistenceKey = persistence.key;
const initialCanvasWidth = appSchema.canvas.size.width;
const changedCanvasWidth =
  initialCanvasWidth > 1 ? initialCanvasWidth - 1 : initialCanvasWidth + 1;
const changedCanvasZoom = 110;
const changedControlsOffset = { x: -48, y: 24 } as const;

type PersistenceObservation = {
  canvasStyleWidth: string | null;
  controlsCollapsed: boolean;
  controlsOffsetX: number | null;
  controlsOffsetY: number | null;
  persistedCanvasWidth: number | null;
  persistedCanvasZoom: number | null;
  persistedControlsCollapsed: boolean | null;
  persistedControlsOffsetX: number | null;
  persistedControlsOffsetY: number | null;
  persistedValuesWidth: number | null;
  visibleZoom: string | null;
};

test(
  "browser: app restores exact canvas, values, and panel workspace slices after reload",
  async ({ page }) => {
    await page.addInitScript((key) => {
      Object.defineProperty(window, "__toolcraftPersistenceProofKey", {
        configurable: false,
        enumerable: false,
        value: key,
        writable: false,
      });
    }, persistenceKey);
    await page.goto("/");
    await page.evaluate((key) => localStorage.removeItem(key), persistenceKey);
    await page.reload();

    const session = await createToolcraftBrowserProofSession(page);
    const persistedWorkspace = session.observe<PersistenceObservation>((root) => {
      const canvas = root.querySelector<HTMLElement>(
        "[data-toolcraft-editable-canvas]",
      );
      const controlsHost = root.querySelector<HTMLElement>(
        '[data-panel-type="controls"]',
      );
      const toolbar = root.querySelector<HTMLElement>(
        '[data-toolcraft-inspect-toolbar="true"]',
      );
      const visibleZoom = [...(toolbar?.querySelectorAll("span") ?? [])]
        .map((candidate) => candidate.textContent?.trim() ?? "")
        .find((text) => /^\d+%$/u.test(text)) ?? null;
      const key = (
        window as Window & { __toolcraftPersistenceProofKey?: unknown }
      ).__toolcraftPersistenceProofKey;
      const rawSnapshot =
        typeof key === "string" ? localStorage.getItem(key) : null;
      let persistedCanvasWidth: number | null = null;
      let persistedCanvasZoom: number | null = null;
      let persistedControlsCollapsed: boolean | null = null;
      let persistedControlsOffsetX: number | null = null;
      let persistedControlsOffsetY: number | null = null;
      let persistedValuesWidth: number | null = null;

      if (rawSnapshot) {
        try {
          const snapshot = JSON.parse(rawSnapshot) as {
            state?: {
              canvas?: {
                size?: { width?: unknown };
                zoom?: unknown;
              };
              panels?: {
                controls?: {
                  collapsed?: unknown;
                  offset?: { x?: unknown; y?: unknown };
                };
              };
              values?: Record<string, unknown>;
            };
          };
          const width = snapshot.state?.canvas?.size?.width;
          const zoom = snapshot.state?.canvas?.zoom;
          const controls = snapshot.state?.panels?.controls;
          const valuesWidth = snapshot.state?.values?.["canvas.size.width"];
          persistedCanvasWidth = typeof width === "number" ? width : null;
          persistedCanvasZoom = typeof zoom === "number" ? zoom : null;
          persistedControlsCollapsed =
            typeof controls?.collapsed === "boolean"
              ? controls.collapsed
              : null;
          persistedControlsOffsetX =
            typeof controls?.offset?.x === "number"
              ? controls.offset.x
              : null;
          persistedControlsOffsetY =
            typeof controls?.offset?.y === "number"
              ? controls.offset.y
              : null;
          persistedValuesWidth =
            typeof valuesWidth === "number" ? valuesWidth : null;
        } catch {
          persistedCanvasWidth = null;
        }
      }

      return {
        canvasStyleWidth: canvas?.style.width ?? null,
        controlsCollapsed:
          root.querySelector('[aria-label="Expand controls"]') !== null,
        controlsOffsetX: controlsHost
          ? Number(controlsHost.dataset.panelOffsetX)
          : null,
        controlsOffsetY: controlsHost
          ? Number(controlsHost.dataset.panelOffsetY)
          : null,
        persistedCanvasWidth,
        persistedCanvasZoom,
        persistedControlsCollapsed,
        persistedControlsOffsetX,
        persistedControlsOffsetY,
        persistedValuesWidth,
        visibleZoom,
      };
    });
    const expected: PersistenceObservation = {
      canvasStyleWidth: `${changedCanvasWidth}px`,
      controlsCollapsed: true,
      controlsOffsetX: changedControlsOffset.x,
      controlsOffsetY: changedControlsOffset.y,
      persistedCanvasWidth: changedCanvasWidth,
      persistedCanvasZoom: changedCanvasZoom,
      persistedControlsCollapsed: true,
      persistedControlsOffsetX: changedControlsOffset.x,
      persistedControlsOffsetY: changedControlsOffset.y,
      persistedValuesWidth: changedCanvasWidth,
      visibleZoom: `${changedCanvasZoom}%`,
    };

    await expectToolcraftPersistenceState(
      persistedWorkspace,
      session.controlAction("canvas.size.width", async (control, currentPage) => {
        const input = control.locator("input");

        await expect(input).toHaveValue(String(initialCanvasWidth));
        await input.fill(String(changedCanvasWidth));
        await input.press("Enter");
        await currentPage.getByRole("button", { name: "Zoom in" }).click();

        const controlsHost = currentPage.locator(
          '[data-panel-type="controls"]',
        );
        const dragHandle = controlsHost.locator(
          '[data-panel-drag-handle=""]',
        ).first();
        const dragBox = await dragHandle.boundingBox();

        expect(dragBox).not.toBeNull();
        if (!dragBox) {
          throw new Error("The Controls drag handle must have layout bounds.");
        }
        await currentPage.mouse.move(
          dragBox.x + dragBox.width / 2,
          dragBox.y + dragBox.height / 2,
        );
        await currentPage.mouse.down();
        await currentPage.mouse.move(
          dragBox.x + dragBox.width / 2 + changedControlsOffset.x,
          dragBox.y + dragBox.height / 2 + changedControlsOffset.y,
          { steps: 4 },
        );
        await currentPage.mouse.up();
        await expect(controlsHost).toHaveAttribute(
          "data-panel-offset-x",
          String(changedControlsOffset.x),
        );
        await expect(controlsHost).toHaveAttribute(
          "data-panel-offset-y",
          String(changedControlsOffset.y),
        );

        await currentPage.getByRole("button", {
          name: "Collapse controls",
        }).click();
        await expect(
          currentPage.getByRole("button", { name: "Expand controls" }),
        ).toBeVisible();
        await expect(
          currentPage.locator('[data-slot="toolcraft-runtime-app"]'),
        ).toHaveAttribute("data-toolcraft-persistence-status", "success");
      }),
      session.reload(),
      expected,
      {
        requirementId: "persistence.reload",
        stabilityIntervalMs: 0,
      },
    );
  },
);
