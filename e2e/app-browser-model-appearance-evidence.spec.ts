import { expect, test } from "@playwright/test";

import { expectToolcraftModelAppearanceCoverage } from "./browser-model-appearance-evidence-helpers";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { setProofState } from "./browser-semantic-evidence-test-helpers";
import {
  cleanIdentity,
  fallbackOutput,
  modelEvidence,
  output,
  readyModelResources,
  runtimePresentation,
  state,
  zipPackage,
} from "./model-import-evidence-test-support";

const evidenceOptions = {
  requirementId: "model.source",
  stabilityIntervalMs: 0,
  target: "source.models",
} as const;
const delayedSchedulingMs = 150;

test("model appearance evidence tolerates scheduling beyond 100ms and stays fail closed", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  const observation = session.observe((root) =>
    JSON.parse(root.getAttribute("data-proof-model-import") ?? "null"),
  );
  const attachmentCount = testInfo.attachments.length;
  const packageExtracted = state({ package: zipPackage });
  await setProofState(page, "model-import", state());
  await expectToolcraftModelAppearanceCoverage(
    observation,
    session.action(async (currentPage) => {
      await currentPage.waitForTimeout(delayedSchedulingMs);
      await setProofState(currentPage, "model-import", packageExtracted);
    }),
    packageExtracted,
    "package-extraction",
    evidenceOptions,
  );
  expect(modelEvidence(testInfo, attachmentCount)).toEqual([{
    evidenceType: "model-package-extraction",
    requirementId: "model.source#package-extraction",
    target: "source.models",
    version: 2,
  }]);

  const missingPackagePredicate = state({
    package: { ...zipPackage, extractedFileCount: 1 },
  });
  await setProofState(page, "model-import", state());
  await expect(
    expectToolcraftModelAppearanceCoverage(
      observation,
      session.action(async (currentPage) => {
        await currentPage.waitForTimeout(delayedSchedulingMs);
        await setProofState(currentPage, "model-import", missingPackagePredicate);
      }),
      missingPackagePredicate,
      "package-extraction",
      evidenceOptions,
    ),
  ).rejects.toThrow();
  expect(testInfo.attachments).toHaveLength(attachmentCount + 1);
});

test("model appearance recipes fail closed for metadata-only and incorrect output", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  const observation = session.observe((root) =>
    JSON.parse(root.getAttribute("data-proof-model-import") ?? "null"),
  );
  const attachmentCount = testInfo.attachments.length;

  const metadataOnly = state({
    active: cleanIdentity,
    lifecycle: "committed",
    package: zipPackage,
    presentation: runtimePresentation,
    resources: readyModelResources,
  });
  await setProofState(page, "model-import", state());
  await expect(
    expectToolcraftModelAppearanceCoverage(
      observation,
      session.action((currentPage) =>
        setProofState(currentPage, "model-import", metadataOnly),
      ),
      metadataOnly,
      "appearance-preservation",
      evidenceOptions,
    ),
  ).rejects.toThrow(/visible model output/);

  const wrongFallback = state({
    ...metadataOnly,
    previewOutput: output(cleanIdentity, "wrong-fallback", 1, {
      appearanceSource: "fallback",
      materialSignature: "fallback:generic-gray",
    }),
  });
  await setProofState(page, "model-import", metadataOnly);
  await expect(
    expectToolcraftModelAppearanceCoverage(
      observation,
      session.action((currentPage) =>
        setProofState(currentPage, "model-import", wrongFallback),
      ),
      wrongFallback,
      "fallback-appearance",
      evidenceOptions,
    ),
  ).rejects.toThrow();

  const transparentPixels = state({
    ...metadataOnly,
    previewOutput: output(cleanIdentity, "transparent", 1, {
      pixelSamples: [[0, 0, 0, 0], [255, 255, 255, 0]],
    }),
  });
  await setProofState(page, "model-import", metadataOnly);
  await expect(
    expectToolcraftModelAppearanceCoverage(
      observation,
      session.action((currentPage) =>
        setProofState(currentPage, "model-import", transparentPixels),
      ),
      transparentPixels,
      "pixel-output",
      evidenceOptions,
    ),
  ).rejects.toThrow(/nontransparent/);

  expect(testInfo.attachments).toHaveLength(attachmentCount);
});

test("model appearance recipe proves package, material, presentation, and pixels", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  const observation = session.observe((root) =>
    JSON.parse(root.getAttribute("data-proof-model-import") ?? "null"),
  );
  const attachmentCount = testInfo.attachments.length;

  const packageExtracted = state({ package: zipPackage });
  await setProofState(page, "model-import", state());
  await expectToolcraftModelAppearanceCoverage(
    observation,
    session.action((currentPage) =>
      setProofState(currentPage, "model-import", packageExtracted),
    ),
    packageExtracted,
    "package-extraction",
    evidenceOptions,
  );

  const nondeterministicRoot = state({
    package: { ...zipPackage, selectedRootPath: "models/z.glb" },
  });
  await setProofState(page, "model-import", nondeterministicRoot);
  await expectToolcraftModelAppearanceCoverage(
    observation,
    session.action((currentPage) =>
      setProofState(currentPage, "model-import", packageExtracted),
    ),
    packageExtracted,
    "deterministic-root-selection",
    evidenceOptions,
  );

  const authored = state({
    active: cleanIdentity,
    lifecycle: "committed",
    package: zipPackage,
    persistenceState: "available",
    presentation: runtimePresentation,
    previewOutput: output(cleanIdentity, "authored", 1),
    resources: readyModelResources,
  });
  await setProofState(page, "model-import", packageExtracted);
  await expectToolcraftModelAppearanceCoverage(
    observation,
    session.action((currentPage) =>
      setProofState(currentPage, "model-import", authored),
    ),
    authored,
    "appearance-preservation",
    evidenceOptions,
  );

  const fallback = state({
    ...authored,
    previewOutput: fallbackOutput(cleanIdentity, "fallback", 1),
  });
  await expectToolcraftModelAppearanceCoverage(
    observation,
    session.action((currentPage) =>
      setProofState(currentPage, "model-import", fallback),
    ),
    fallback,
    "fallback-appearance",
    evidenceOptions,
  );

  const presentationError = state({
    ...authored,
    presentation: { ...runtimePresentation, status: "error" },
  });
  await setProofState(page, "model-import", presentationError);
  await expectToolcraftModelAppearanceCoverage(
    observation,
    session.action((currentPage) =>
      setProofState(currentPage, "model-import", authored),
    ),
    authored,
    "presentation-consumer-readiness",
    evidenceOptions,
  );

  const transparent = state({
    ...authored,
    previewOutput: output(cleanIdentity, "transparent-before", 1, {
      pixelSamples: [[0, 0, 0, 0]],
    }),
  });
  await setProofState(page, "model-import", transparent);
  await expectToolcraftModelAppearanceCoverage(
    observation,
    session.action((currentPage) =>
      setProofState(currentPage, "model-import", authored),
    ),
    authored,
    "pixel-output",
    evidenceOptions,
  );

  const coverage = [
    "package-extraction",
    "deterministic-root-selection",
    "appearance-preservation",
    "fallback-appearance",
    "presentation-consumer-readiness",
    "pixel-output",
  ];
  expect(modelEvidence(testInfo, attachmentCount)).toEqual(
    coverage.map((name) => ({
      evidenceType: `model-${name}`,
      requirementId: `model.source#${name}`,
      target: "source.models",
      version: 2,
    })),
  );
});
