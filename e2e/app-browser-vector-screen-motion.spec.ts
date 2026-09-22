import { expect, test, type Page } from "@playwright/test";

import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { attachedEvidenceTypes } from "./browser-semantic-evidence-test-helpers";
import { expectToolcraftVectorScreenMotion } from "./browser-vector-screen-motion";
import type { VectorFixtureMode } from "./browser-vector-screen-motion-fixture";

const marker = {
  selector: '[data-toolcraft-product-output="vector-fixture"]',
  rgb: [255, 0, 128],
} as const;

async function fixture(page: Page, mode: VectorFixtureMode) {
  await page.goto("/");
  const proofSession = await createToolcraftBrowserProofSession(page);
  await page.evaluate(async (mode) => {
    // Vite serves this framework-only TSX fixture; it is not part of the product composition.
    const fixtureUrl = "/e2e/browser-vector-screen-motion-fixture.tsx";
    const { mountVectorFixture } = await import(/* @vite-ignore */ fixtureUrl);
    mountVectorFixture(mode);
  }, mode);
  await expect(
    page.getByRole("button", { name: "Offset 1 X/Y pad", exact: true }),
  ).toBeVisible();
  return {
    proofSession,
    target: "proof.offset",
    requirementId: "proof.offset",
    markers: mode === "nested-mirror" ? [marker, marker] : [marker],
  };
}

for (const mode of ["dom", "canvas", "cartesian", "shader"] as const) {
  test(`vector screen motion proves four real pad directions: ${mode}`, async ({
    page,
  }, info) => {
    const options = await fixture(page, mode);
    const before = info.attachments.length;
    await expectToolcraftVectorScreenMotion(options);
    expect(attachedEvidenceTypes(info, before)).toEqual([
      "vector-screen-motion",
      "product-observable-change",
      "compound-control-part",
      "compound-control-part",
    ]);
  });
}

for (const mode of [
  "mirror-x",
  "mirror-y",
  "swapped",
  "stationary",
  "release-only",
  "moving-frame",
  "missing-marker",
  "nested-mirror",
  "shader-mirrored",
] as const) {
  test(`vector screen motion rejects ${mode} without evidence`, async ({
    page,
  }, info) => {
    const options = await fixture(page, mode);
    const before = info.attachments.length;
    const failure =
      mode === "moving-frame"
        ? /move\/resize|viewport\/world/
        : mode === "missing-marker"
          ? /16 visible marker pixels/
          : /must move visible product pixels/;
    await expect(expectToolcraftVectorScreenMotion(options)).rejects.toThrow(
      failure,
    );
    expect(info.attachments).toHaveLength(before);
  });
}

test("vector screen motion cannot prove a missing target or omit collection markers", async ({
  page,
}, info) => {
  const options = await fixture(page, "nested-mirror");
  const before = info.attachments.length;
  await expect(
    expectToolcraftVectorScreenMotion({ ...options, target: "wrong.target" }),
  ).rejects.toThrow(/exactly one/);
  await expect(
    expectToolcraftVectorScreenMotion({ ...options, markers: [marker] }),
  ).rejects.toThrow(/every visible spatial pad/);
  expect(info.attachments).toHaveLength(before);
});
