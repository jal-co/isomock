import { expect, test } from "@playwright/test";
import {
  expectToolcraftModelAdvertisedFormatImport,
  expectToolcraftModelCleanCommit,
  expectToolcraftModelExportOutput,
  expectToolcraftModelFatalRejection,
  expectToolcraftModelHistoryReset,
  expectToolcraftModelPersistenceRestore,
  expectToolcraftModelPreviewOutput,
  expectToolcraftModelRepairAction,
  expectToolcraftModelRepairProgress,
  expectToolcraftModelRepairableDiagnosis,
  expectToolcraftModelResourceUnavailable,
  expectToolcraftModelStagedPreview,
  expectToolcraftModelVerifiedRepair,
} from "./browser-model-import-evidence-helpers";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { setProofState } from "./browser-semantic-evidence-test-helpers";
import {
  advertisedFormats,
  cleanIdentity,
  emptyRepair,
  modelEvidence,
  output,
  repairedIdentity,
  state,
} from "./model-import-evidence-test-support";

test("model import recipes fail closed for incorrect lifecycle, progress, and output semantics", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  const attachmentCount = testInfo.attachments.length;
  const options = {
    requirementId: "model.source",
    stabilityIntervalMs: 0,
    target: "source.models",
    timeoutMs: 100,
  } as const;
  const observation = session.observe((root) =>
    JSON.parse(root.getAttribute("data-proof-model-import") ?? "null"),
  );

  await setProofState(page, "model-import", state());
  const wrongLifecycle = state({
    attemptFormat: "obj",
    draft: cleanIdentity,
    lifecycle: "committed",
  });
  await expect(
    expectToolcraftModelAdvertisedFormatImport(
      observation,
      session.action((currentPage) =>
        setProofState(currentPage, "model-import", wrongLifecycle),
      ),
      wrongLifecycle,
      options,
    ),
  ).rejects.toThrow();
  expect(testInfo.attachments).toHaveLength(attachmentCount);

  const repairing = state({
    active: cleanIdentity,
    attemptFormat: "stl",
    draft: repairedIdentity,
    lifecycle: "repairing",
    persistenceState: "available",
    previewOutput: output(repairedIdentity, "repair-start", 0.4),
    repair: {
      available: false,
      diagnosisSignature: "non-manifold-edges",
      geometrySignature: "geometry-dirty",
      progress: { completed: 20, phase: "repair", total: 100 },
      verification: "pending",
    },
  });
  const stalledProgress = state({
    ...repairing,
    previewOutput: output(repairedIdentity, "repair-stalled", 0.4),
    repair: {
      ...repairing.repair,
      progress: { completed: 20, phase: "repair-continued", total: 100 },
    },
  });
  await setProofState(page, "model-import", repairing);
  await expect(
    expectToolcraftModelRepairProgress(
      observation,
      session.action((currentPage) =>
        setProofState(currentPage, "model-import", stalledProgress),
      ),
      stalledProgress,
      options,
    ),
  ).rejects.toThrow();
  expect(testInfo.attachments).toHaveLength(attachmentCount);

  const committed = state({
    active: repairedIdentity,
    lifecycle: "verified",
    persistenceState: "available",
    previewOutput: output(repairedIdentity, "verified", 1),
    repair: {
      ...emptyRepair,
      geometrySignature: "geometry-fixed",
      verification: "passed",
    },
  });
  const wrongExport = state({
    ...committed,
    exportOutput: output(repairedIdentity, "different-pose", 1),
  });
  await setProofState(page, "model-import", committed);
  await expect(
    expectToolcraftModelExportOutput(
      observation,
      session.action((currentPage) =>
        setProofState(currentPage, "model-import", wrongExport),
      ),
      wrongExport,
      options,
    ),
  ).rejects.toThrow();
  expect(testInfo.attachments).toHaveLength(attachmentCount);

  const chromeInExport = state({
    ...committed,
    exportOutput: {
      ...output(repairedIdentity, "verified", 1),
      editorChrome: "included",
    },
  });
  await setProofState(page, "model-import", committed);
  await expect(
    expectToolcraftModelExportOutput(
      observation,
      session.action((currentPage) =>
        setProofState(currentPage, "model-import", chromeInExport),
      ),
      chromeInExport,
      options,
    ),
  ).rejects.toThrow(/without editor gizmos or handles/);
  expect(testInfo.attachments).toHaveLength(attachmentCount);
});

test("model import recipe proves every required lifecycle and output behavior before attaching evidence", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  const attachmentCount = testInfo.attachments.length;
  const options = {
    requirementId: "model.source",
    stabilityIntervalMs: 0,
    target: "source.models",
  } as const;
  const observation = session.observe((root) =>
    JSON.parse(root.getAttribute("data-proof-model-import") ?? "null"),
  );

  const empty = state();
  const admitted = state({
    attemptFormat: "obj",
    draft: cleanIdentity,
    lifecycle: "staged",
  });
  const staged = state({
    ...admitted,
    previewOutput: output(cleanIdentity, "staged", 0.4),
  });
  const clean = state({
    active: cleanIdentity,
    attemptFormat: "obj",
    lifecycle: "committed",
    persistenceState: "available",
    previewOutput: output(cleanIdentity, "clean", 1),
    repair: { ...emptyRepair, geometrySignature: "geometry-clean" },
  });
  const repairable = state({
    active: cleanIdentity,
    attemptFormat: "stl",
    draft: repairedIdentity,
    lifecycle: "repairable",
    persistenceState: "available",
    previewOutput: output(repairedIdentity, "repairable", 0.4),
    repair: {
      available: true,
      diagnosisSignature: "non-manifold-edges",
      geometrySignature: "geometry-dirty",
      progress: null,
      verification: "pending",
    },
  });
  const repairStarted = state({
    ...repairable,
    lifecycle: "repairing",
    previewOutput: output(repairedIdentity, "repair-started", 0.4),
    repair: {
      ...repairable.repair,
      available: false,
      progress: { completed: 0, phase: "normalize", total: 100 },
    },
  });
  const repairProgressed = state({
    ...repairStarted,
    previewOutput: output(repairedIdentity, "repair-progress", 0.4),
    repair: {
      ...repairStarted.repair,
      progress: { completed: 65, phase: "rebuild", total: 100 },
    },
  });
  const verified = state({
    active: repairedIdentity,
    attemptFormat: "stl",
    lifecycle: "verified",
    persistenceState: "available",
    previewOutput: output(repairedIdentity, "verified", 1),
    repair: {
      ...emptyRepair,
      geometrySignature: "geometry-fixed",
      verification: "passed",
    },
  });
  const rejected = state({
    ...verified,
    attemptFormat: "fbx",
    lifecycle: "rejected",
    rejection: { code: "malformed-topology", format: "fbx" },
  });
  const previewChanged = state({
    ...verified,
    previewOutput: output(repairedIdentity, "view-changed", 1),
  });
  const exported = state({
    ...previewChanged,
    exportOutput: {
      ...output(repairedIdentity, "view-changed", 1),
      outputSignature: "output-export-4k",
    },
  });

  await setProofState(page, "model-import", empty);
  await expectToolcraftModelAdvertisedFormatImport(
    observation,
    session.action((currentPage) =>
      setProofState(currentPage, "model-import", admitted),
    ),
    admitted,
    options,
  );
  await expectToolcraftModelStagedPreview(
    observation,
    session.action((currentPage) =>
      setProofState(currentPage, "model-import", staged),
    ),
    staged,
    options,
  );
  await expectToolcraftModelCleanCommit(
    observation,
    session.action((currentPage) =>
      setProofState(currentPage, "model-import", clean),
    ),
    clean,
    options,
  );
  await expectToolcraftModelRepairableDiagnosis(
    observation,
    session.action((currentPage) =>
      setProofState(currentPage, "model-import", repairable),
    ),
    repairable,
    options,
  );
  await expectToolcraftModelRepairAction(
    observation,
    session.action((currentPage) =>
      setProofState(currentPage, "model-import", repairStarted),
    ),
    repairStarted,
    options,
  );
  await expectToolcraftModelRepairProgress(
    observation,
    session.action((currentPage) =>
      setProofState(currentPage, "model-import", repairProgressed),
    ),
    repairProgressed,
    options,
  );
  await expectToolcraftModelVerifiedRepair(
    observation,
    session.action((currentPage) =>
      setProofState(currentPage, "model-import", verified),
    ),
    verified,
    options,
  );
  await expectToolcraftModelFatalRejection(
    observation,
    session.action((currentPage) =>
      setProofState(currentPage, "model-import", rejected),
    ),
    rejected,
    options,
  );
  await expectToolcraftModelPreviewOutput(
    observation,
    session.action((currentPage) =>
      setProofState(currentPage, "model-import", previewChanged),
    ),
    previewChanged,
    options,
  );
  await expectToolcraftModelExportOutput(
    observation,
    session.action((currentPage) =>
      setProofState(currentPage, "model-import", exported),
    ),
    exported,
    options,
  );
  await expectToolcraftModelHistoryReset(
    observation,
    session.action((currentPage) =>
      setProofState(currentPage, "model-import", clean),
    ),
    session.action((currentPage) =>
      setProofState(currentPage, "model-import", exported),
    ),
    session.action((currentPage) =>
      setProofState(currentPage, "model-import", clean),
    ),
    clean,
    exported,
    options,
  );

  const persistenceKey = "toolcraft-model-import-proof";
  const restored = state({
    ...verified,
    lifecycle: "restored",
    persistenceState: "restored",
    previewOutput: output(repairedIdentity, "restored", 1),
  });
  const unavailable = state({
    ...restored,
    lifecycle: "unavailable",
    persistenceState: "unavailable",
    previewOutput: null,
    unavailableReason: "document-resource-missing",
  });
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: persistenceKey, value: empty },
  );
  const persistenceObservation = session.observe(() =>
    JSON.parse(localStorage.getItem("toolcraft-model-import-proof") ?? "null"),
  );
  await expectToolcraftModelPersistenceRestore(
    persistenceObservation,
    session.action((currentPage) =>
      currentPage.evaluate(
        ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
        { key: persistenceKey, value: restored },
      ),
    ),
    session.reload(),
    restored,
    options,
  );
  await expectToolcraftModelResourceUnavailable(
    persistenceObservation,
    session.action((currentPage) =>
      currentPage.evaluate(
        ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
        { key: persistenceKey, value: unavailable },
      ),
    ),
    unavailable,
    options,
  );

  expect(modelEvidence(testInfo, attachmentCount)).toEqual(
    [
      "model-advertised-format-import",
      "model-staged-preview",
      "model-clean-commit",
      "model-repairable-diagnosis",
      "model-repair-action",
      "model-repair-progress",
      "model-verified-repair",
      "model-fatal-rejection",
      "model-preview-output",
      "model-export-output",
      "model-history-reset",
      "model-persistence-restore",
      "model-resource-unavailable",
    ].map((evidenceType, index) => ({
      evidenceType,
      requirementId: `model.source#${[
        "advertised-format-import",
        "staged-preview",
        "clean-commit",
        "repairable-diagnosis",
        "repair-action",
        "repair-progress",
        "verified-repair",
        "fatal-rejection",
        "preview-output",
        "export-output",
        "history-reset",
        "persistence-restore",
        "resource-unavailable",
      ][index]}`,
      target: "source.models",
      version: 2,
    })),
  );
});
