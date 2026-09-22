import { expect, type Locator, type Page } from "@playwright/test";

import {
  countToolcraftControlOwnersByTarget,
  getToolcraftControlFieldByTarget,
} from "./browser-control-target-helpers";
import {
  getToolcraftBrowserProofPage,
  type ToolcraftBrowserProofSession,
} from "./browser-proof-session";

const TOOLCRAFT_APP_ROOT_SELECTOR = '[data-slot="toolcraft-runtime-app"]';
const ORIENTATION_PROOF_OWNER_SELECTOR = "[data-orientation-proof-state]";
const RENDER_SCALE_TARGET = "canvas.renderScale";

type OrientationPreconditionOwner = Readonly<{
  locator: Locator;
  synthetic: boolean;
}>;

async function resolveOrientationPreconditionOwner(
  page: Page,
): Promise<OrientationPreconditionOwner> {
  const root = page.locator(TOOLCRAFT_APP_ROOT_SELECTOR);
  const syntheticOwner = root.locator(ORIENTATION_PROOF_OWNER_SELECTOR);
  const syntheticOwnerCount = await syntheticOwner.count();
  expect(
    syntheticOwnerCount,
    "Orientation proof state must have at most one synthetic owner.",
  ).toBeLessThanOrEqual(1);
  return syntheticOwnerCount === 1
    ? { locator: syntheticOwner, synthetic: true }
    : { locator: root, synthetic: false };
}

async function expectPausedPlaybackWhenPresent(
  owner: OrientationPreconditionOwner,
): Promise<void> {
  const play = owner.locator.getByRole("button", { name: "Play playback" });
  const pause = owner.locator.getByRole("button", { name: "Pause playback" });
  const playCount = await play.count();
  const actionCount = playCount + (await pause.count());

  if (actionCount === 0) return;

  expect(
    actionCount,
    "Orientation axis-drag proof requires exactly one standard playback action.",
  ).toBe(1);
  expect(
    playCount,
    "Orientation axis-drag proof must be paused; Play playback must be visible before its baseline.",
  ).toBe(1);
  await expect(play).toBeVisible();
}

async function readFiniteSliderNumber(
  slider: Locator,
  name: "maximum" | "value",
): Promise<number> {
  const ariaName = name === "maximum" ? "aria-valuemax" : "aria-valuenow";
  const nativeName = name === "maximum" ? "max" : "value";
  const raw =
    (await slider.getAttribute(ariaName)) ??
    (await slider.getAttribute(nativeName));
  const value = raw === null || raw.trim() === "" ? Number.NaN : Number(raw);

  expect(
    Number.isFinite(value),
    `Orientation axis-drag proof requires a finite ${ariaName} or native ${nativeName} on canvas.renderScale.`,
  ).toBe(true);
  return value;
}

async function expectMaximumRenderScaleWhenPresent(
  page: Page,
  owner: OrientationPreconditionOwner,
): Promise<void> {
  const syntheticFields = owner.locator.locator(
    `[data-toolcraft-control-target="${RENDER_SCALE_TARGET}"]`,
  );
  const ownerCount = owner.synthetic
    ? await syntheticFields.count()
    : await countToolcraftControlOwnersByTarget(page, RENDER_SCALE_TARGET);

  if (ownerCount === 0) return;

  expect(
    ownerCount,
    "Orientation axis-drag proof requires exactly one canvas.renderScale owner.",
  ).toBe(1);
  const field = owner.synthetic
    ? syntheticFields.first()
    : await getToolcraftControlFieldByTarget(page, RENDER_SCALE_TARGET);
  const slider = field.getByRole("slider");
  await expect(
    slider,
    "Orientation axis-drag proof requires one canvas.renderScale slider.",
  ).toHaveCount(1);
  await expect(slider).toBeVisible();

  const value = await readFiniteSliderNumber(slider, "value");
  const maximum = await readFiniteSliderNumber(slider, "maximum");
  expect(
    value,
    "Orientation axis-drag proof requires canvas.renderScale at maximum quality before its baseline.",
  ).toBe(maximum);
}

export async function expectToolcraftOrientationLiveDragPreconditions(
  session: ToolcraftBrowserProofSession,
): Promise<void> {
  const page = await getToolcraftBrowserProofPage(session);
  const owner = await resolveOrientationPreconditionOwner(page);
  await expectPausedPlaybackWhenPresent(owner);
  await expectMaximumRenderScaleWhenPresent(page, owner);
}
