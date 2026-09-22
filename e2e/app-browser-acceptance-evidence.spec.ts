import { expect, test, type TestInfo } from "@playwright/test";

import { expectToolcraftAcceptanceOutcome, expectToolcraftExportedArtifact } from "./browser-acceptance-outcome-helpers";

test("acceptance outcome rejects a return to its baseline during stability sampling", async () => {
  let actionStarted = false;
  let postActionObservations = 0;

  await expect(
    expectToolcraftAcceptanceOutcome(
      async () => {
        if (!actionStarted) return "before";
        postActionObservations += 1;
        return postActionObservations === 1 ? "after" : "before";
      },
      async () => {
        actionStarted = true;
      },
      {
        evidenceType: "command-side-effect",
        requirementId: "command.delayed-transient",
        stabilityIntervalMs: 0,
      },
    ),
  ).rejects.toThrow(/stability window/i);
});

test("acceptance outcome snapshots a reused mutable observation", async ({}) => {
  const outcome = { value: "before" };

  await expect(
    expectToolcraftAcceptanceOutcome(
      async () => outcome,
      async () => {
        outcome.value = "after";
      },
      {
        evidenceType: "command-side-effect",
        requirementId: "command.mutable-observation",
        stabilityIntervalMs: 0,
      },
    ),
  ).resolves.toEqual({ value: "after" });
});

test("generic acceptance outcomes cannot claim specialized runtime evidence", async ({
  page,
}) => {
  await page.setContent('<div id="outcome">before</div>');

  await expect(
    expectToolcraftAcceptanceOutcome(
      () => page.locator("#outcome").textContent(),
      () =>
        page.locator("#outcome").evaluate((node) => {
          node.textContent = "after";
        }),
      {
        evidenceType: "timeline-duration" as never,
        requirementId: "timeline.duration",
      },
    ),
  ).rejects.toThrow(/specialized evidence/i);
});

test("export evidence requires a typed positive artifact inspection", async ({}, testInfo: TestInfo) => {
  const attachmentCount = testInfo.attachments.length;

  await expect(
    expectToolcraftExportedArtifact(
      async () => new Uint8Array([1, 2, 3]),
      async () => ({ ok: true }),
      { requirementId: "export.nominal-object" },
    ),
  ).rejects.toThrow(/byteLength/i);
  await expect(
    expectToolcraftExportedArtifact(
      async () => new Uint8Array([1, 2, 3]),
      async () => ({ byteLength: 0 }),
      { requirementId: "export.zero-bytes" },
    ),
  ).rejects.toThrow(/positive byteLength/i);
  await expect(
    expectToolcraftExportedArtifact(
      async () => new Uint8Array([1, 2, 3]),
      async () => ({ byteLength: 2.5 }),
      { requirementId: "export.fractional-bytes" },
    ),
  ).rejects.toThrow(/byteLength integer/i);
  await expect(
    expectToolcraftExportedArtifact(
      async () => new Uint8Array([1, 2, 3]),
      async () => ({ byteLength: 3, width: 1.5 }),
      { requirementId: "export.fractional-width" },
    ),
  ).rejects.toThrow(/width integer/i);
  expect(testInfo.attachments).toHaveLength(attachmentCount);

  await expectToolcraftExportedArtifact(
    async () => new Uint8Array([1, 2, 3]),
    async (artifact) => ({
      byteLength: artifact.byteLength,
      contentHash: "pixel-hash",
      height: 1,
      mediaType: "image/png",
      width: 1,
    }),
    { requirementId: "export.valid-inspection" },
  );
  expect(testInfo.attachments).toHaveLength(attachmentCount + 1);
});
