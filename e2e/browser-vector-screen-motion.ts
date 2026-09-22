import { expect, type Locator, type Page } from "@playwright/test";

import { isToolcraftSpatialVectorVariant } from "../src/app/acceptance/vector-screen-motion";
import { getToolcraftControlOwnerByTarget } from "./browser-control-target-helpers";
import {
  getToolcraftBrowserProofPage,
  type ToolcraftBrowserProofSession,
} from "./browser-proof-session";
import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import {
  assertVectorMarkerStable,
  createVectorMarkerReader,
  type ToolcraftVectorMarker,
  type VectorMarkerSnapshot,
} from "./browser-vector-marker";

export type { ToolcraftVectorMarker } from "./browser-vector-marker";

const directions = [
  { name: "right", x: 1, y: 0 },
  { name: "left", x: -1, y: 0 },
  { name: "down", x: 0, y: 1 },
  { name: "up", x: 0, y: -1 },
] as const;
type Direction = (typeof directions)[number];

async function settledMarker(
  read: () => Promise<VectorMarkerSnapshot>,
): Promise<VectorMarkerSnapshot> {
  let settled: VectorMarkerSnapshot | undefined;
  await expect(async () => {
    const before = await read();
    const current = await read();
    assertVectorMarkerStable(current, before);
    settled = current;
  }).toPass({ timeout: 2_000, intervals: [50, 100] });
  return settled!;
}

function assertDirection(
  before: VectorMarkerSnapshot,
  after: VectorMarkerSnapshot,
  direction: Direction,
): void {
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const along = dx * direction.x + dy * direction.y;
  const across = Math.abs(dx * direction.y + dy * direction.x);
  expect(
    along,
    `Dragging the pad ${direction.name} must move visible product pixels ${direction.name}, not mirror or ignore the gesture.`,
  ).toBeGreaterThanOrEqual(2);
  expect(
    across,
    `Dragging ${direction.name} must not swap axes or primarily move on the other axis.`,
  ).toBeLessThanOrEqual(Math.max(1, along * 0.25));
  expect(
    Math.abs(after.area / before.area - 1),
    "Track the same product feature, not a color/size change.",
  ).toBeLessThanOrEqual(0.15);
}

async function provePad(
  page: Page,
  pad: Locator,
  marker: ToolcraftVectorMarker,
): Promise<void> {
  await pad.scrollIntoViewIfNeeded();
  const bounds = await pad.boundingBox();
  if (!bounds || bounds.width < 20 || bounds.height < 20)
    throw new Error("Vector proof needs a visible usable pad.");
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const read = await createVectorMarkerReader(page, marker);
  for (const direction of directions) {
    await page.mouse.click(center.x, center.y);
    const baseline = await settledMarker(read);
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    let live: VectorMarkerSnapshot;
    try {
      await page.mouse.move(
        center.x + direction.x * bounds.width * 0.15,
        center.y + direction.y * bounds.height * 0.15,
        { steps: 6 },
      );
      await expect(async () =>
        assertDirection(baseline, await read(), direction),
      ).toPass({ timeout: 2_000, intervals: [50, 100] });
      live = await settledMarker(read);
      assertDirection(baseline, live, direction);
      // A second held sample catches one-frame success followed by stale output.
      assertVectorMarkerStable(await read(), live);
    } finally {
      await page.mouse.up();
    }
    assertVectorMarkerStable(await settledMarker(read), live);
    expect(
      await pad.boundingBox(),
      "Pad layout must remain stable during directional proof.",
    ).toEqual(bounds);
  }
}

/** Four real drags, screenshot-pixel direction, held-pointer output and release persistence. */
export async function expectToolcraftVectorScreenMotion(
  options: Readonly<{
    proofSession: ToolcraftBrowserProofSession;
    requirementId: string;
    target: string;
    /** One product marker per visible spatial pad, in DOM order, including collection fields. */
    markers: readonly ToolcraftVectorMarker[];
  }>,
): Promise<void> {
  expect(options.requirementId.trim()).not.toBe("");
  const page = await getToolcraftBrowserProofPage(options.proofSession);
  const owner = await getToolcraftControlOwnerByTarget(page, options.target);
  const candidates = owner.locator("button[data-vector-pad-variant]");
  const pads: Locator[] = [];
  for (const pad of await candidates.all()) {
    if (
      isToolcraftSpatialVectorVariant(
        (await pad.getAttribute("data-vector-pad-variant")) ?? undefined,
      )
    ) {
      await expect(pad, "Expose every spatial pad in the collection fixture before direction proof.").toBeVisible();
      pads.push(pad);
    }
  }
  expect(
    pads.length,
    "Vector screen-motion proof requires visible spatial pads; an empty/collapsed fixture is not proof.",
  ).toBeGreaterThan(0);
  expect(
    options.markers.length,
    "Provide one genuine product marker for every visible spatial pad under the exact target.",
  ).toBe(pads.length);
  for (const [index, pad] of pads.entries()) {
    await provePad(page, pad, options.markers[index]!);
  }
  await getToolcraftBrowserProofPage(options.proofSession);
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "vector-screen-motion",
    requirementId: options.requirementId,
    target: options.target,
  });
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "product-observable-change",
    requirementId: options.requirementId,
    target: options.target,
  });
  // Both physical axes were just exercised; retain compatibility with ordinary compound coverage.
  for (const part of ["vector.x", "vector.y"]) {
    await attachToolcraftBrowserRuntimeEvidence({
      evidenceType: "compound-control-part",
      requirementId: `${options.requirementId}#${part}`,
      target: options.target,
    });
  }
}
