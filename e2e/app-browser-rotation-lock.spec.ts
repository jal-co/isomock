import { expect, test, type Locator, type Page } from "@playwright/test";

async function drag(page: Page, element: Locator) {
  const box = await element.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + 25,
    box!.y + box!.height / 2 + 15,
    { steps: 4 },
  );
  await page.mouse.up();
}

test("Setup rotation lock preserves pose, navigation and reload while dimming the gizmo", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/e2e/browser-rotation-lock-fixture.html");
  const lock = page.getByRole("switch", { name: "Lock rotation", exact: true });
  const timeline = page.getByRole("switch", { name: "Timeline", exact: true });
  const gizmo = page.getByTestId("toolcraft-orientation-gizmo");
  const frame = page.locator('[data-slot="toolcraft-orientation-gizmo-frame"]');
  const probe = page.getByTestId("rotation-lock-state");
  const read = async () => JSON.parse((await probe.textContent())!);
  await expect(lock).toBeVisible();
  await expect(gizmo).toBeVisible();
  const lockBox = (await lock.boundingBox())!;
  const timelineBox = (await timeline.boundingBox())!;
  expect(Math.abs(lockBox.y - timelineBox.y)).toBeLessThan(1);
  expect(lockBox.x).toBeGreaterThan(timelineBox.x);
  await expect(frame).toHaveCSS("opacity", "1");
  await drag(page, gizmo);
  const before = await read();
  // Real keyboard focus must win over the pointer parked on the canvas.
  await lock.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(lock).toBeFocused();
  expect(await lock.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await lock.press("Space");
  await expect(lock).toBeChecked();
  await expect(gizmo).toHaveAttribute("aria-disabled", "true");
  await expect(frame).toHaveCSS("opacity", "0.666667");
  expect((await read()).pose).toEqual(before.pose);
  expect((await read()).timeline).toEqual(before.timeline);
  await drag(page, gizmo);
  const gizmoBox = (await gizmo.boundingBox())!;
  // Raw user input must remain inert even though accessibility marks it disabled.
  await page.mouse.dblclick(gizmoBox.x + 35, gizmoBox.y + 35);
  expect((await read()).pose).toEqual(before.pose);
  await page.getByRole("application", { name: "Canvas viewport" }).focus();
  await page.keyboard.down("Space");
  await drag(page, page.getByTestId("rotation-lock-model"));
  await page.keyboard.up("Space");
  expect((await read()).pose).toEqual(before.pose);
  expect((await read()).canvas.offset).not.toEqual(before.canvas.offset);
  const zoomBefore = (await read()).canvas.zoom;
  await page.mouse.move(300, 250);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -120);
  await page.keyboard.up("Control");
  await expect
    .poll(async () => (await read()).canvas.zoom)
    .not.toBe(zoomBefore);
  // Reload the same runtime identity; no fixture-authored storage writes.
  await page.reload();
  await expect(lock).toBeChecked();
  await expect(gizmo).toHaveAttribute("aria-disabled", "true");
  expect((await read()).pose).toEqual(before.pose);
  await lock.press("Space");
  await expect(lock).not.toBeChecked();
  await expect(frame).toHaveCSS("opacity", "1");
  await drag(page, gizmo);
  await expect.poll(async () => (await read()).pose).not.toEqual(before.pose);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
});
