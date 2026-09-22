import { expect, test } from "@playwright/test";
import type {
  FullConfig,
  FullResult,
  Suite,
} from "@playwright/test/reporter";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createMotionReferenceBehavior,
  motionReferenceAcceptance,
  createMotionReferenceInput,
  createTimedMotionReferenceStudy,
} from "../src/app/app-acceptance.motion-reference-test-utils";
import {
  createToolcraftMotionReferenceId,
  createToolcraftMotionReferenceStudyId,
} from "../scripts/toolcraft-motion-reference-artifacts.mjs";
import {
  appAcceptance,
  appControlSectionInventory,
  appProductReadiness,
  appTransferMode,
  type ToolcraftComponentAcceptance,
  type ToolcraftMotionReferenceEvidence,
  type ToolcraftMotionReferenceStudy,
  type ToolcraftTransferMode,
} from "../src/app/app-acceptance";
import { writeCanonicalToolcraftMotionReferenceEvidence } from "../src/app/acceptance/motion-reference-evidence.mjs";
import { appSchema } from "../src/app/app-schema";
import { deriveToolcraftBrowserRuntimeRequirements } from "./browser-runtime-evidence-requirements";
import ToolcraftDeliveryCatalogReporter, {
  validateToolcraftDeliveryCatalogReferences,
} from "./toolcraft-delivery-catalog-reporter";

const motionReferenceId =
  "motion-reference-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

const invalidReferenceTransferMode: ToolcraftTransferMode = {
  ...appTransferMode,
  referenceInputs: [
    {
      behaviors: [],
      kind: "motion-reference",
      referenceId: motionReferenceId,
      studies: [],
    },
  ],
};

const validationFixture = {
  acceptance: appAcceptance,
  productReadiness: appProductReadiness,
  rootDir: process.cwd(),
  schema: appSchema,
  sectionInventory: appControlSectionInventory,
  transferMode: invalidReferenceTransferMode,
};

function createCanonicalMotionReferenceFixture() {
  const authoredStudy = createTimedMotionReferenceStudy();
  if (authoredStudy.evidence.timingMode !== "seconds") {
    throw new Error("Timed motion fixture must use seconds timing.");
  }
  const frameIdByAuthoredId = new Map(
    authoredStudy.evidence.reviewedFrames.map((frame) => [
      frame.frameId,
      `source-frame:${frame.sourceFrameIndex}`,
    ]),
  );
  const reviewedFrames = authoredStudy.evidence.reviewedFrames.map((frame) => ({
    ...frame,
    frameId: frameIdByAuthoredId.get(frame.frameId)!,
  }));
  const detectedEvents = authoredStudy.evidence.detectedEvents.map((event) => {
    const windowFrameIds = event.windowFrameIds.map(
      (frameId) => frameIdByAuthoredId.get(frameId)!,
    );
    return {
      ...event,
      afterFrameId: frameIdByAuthoredId.get(event.afterFrameId)!,
      beforeFrameId: frameIdByAuthoredId.get(event.beforeFrameId)!,
      eventId: `motion-event:${event.kind}:${windowFrameIds
        .map((frameId) => frameId.slice("source-frame:".length))
        .join("-")}`,
      peakFrameId: frameIdByAuthoredId.get(event.peakFrameId)!,
      windowFrameIds,
    };
  });
  const evidenceSeed = {
    ...authoredStudy.evidence,
    detectedEvents,
    overviewFrameIds: authoredStudy.evidence.overviewFrameIds.map(
      (frameId) => frameIdByAuthoredId.get(frameId)!,
    ),
    reviewedFrames,
  };
  const studyId = createToolcraftMotionReferenceStudyId(evidenceSeed);
  const evidence: ToolcraftMotionReferenceEvidence = {
    ...evidenceSeed,
    contactSheet: {
      ...evidenceSeed.contactSheet,
      path: `src/app/reference-studies/${studyId}/contact-sheet.png` as const,
    },
    studyId,
  };
  const study: ToolcraftMotionReferenceStudy = {
    ...authoredStudy,
    evidence,
    evidencePath: `src/app/reference-studies/${studyId}/evidence.json` as const,
    events: authoredStudy.events.map((event, index) => ({
      ...event,
      evidenceEventId: detectedEvents[index].eventId,
    })),
    phases: authoredStudy.phases.map((phase) => ({
      ...phase,
      fromFrameId: frameIdByAuthoredId.get(phase.fromFrameId)!,
      toFrameId: frameIdByAuthoredId.get(phase.toFrameId)!,
    })),
    studyId,
  };
  const referenceId = createToolcraftMotionReferenceId(evidence);
  const behavior = createMotionReferenceBehavior({
    timingClaims: [{ claim: "duration", studyId }],
  });
  const input = createMotionReferenceInput({
    behaviors: [behavior],
    referenceId,
    studies: [study],
  });
  const acceptance = {
    ...motionReferenceAcceptance,
    motionReferenceCoverage: [
      { behaviorId: behavior.id, referenceId },
    ],
  };
  return { acceptance, input, study };
}

function createAcceptance(
  overrides: Partial<ToolcraftComponentAcceptance> = {},
): ToolcraftComponentAcceptance {
  return {
    automated: true,
    automatedTestName: "matches the reference retarget behavior",
    browser: {
      budget: "standard",
      file: "e2e/app-controls.spec.ts",
      testName: "browser: matches the reference retarget behavior",
    },
    componentType: "custom-renderer",
    evidence: "product-output",
    expectedObservable: "The renderer preserves the delayed retarget behavior.",
    fixture: "motion reference behavior",
    id: "reference.delayed-retarget",
    kind: "runtime",
    target: "renderer.anchor-state",
    userAction: "Compare the running renderer with the inspected reference event.",
    ...overrides,
  };
}

function createReporterFixture(projectRoot: string) {
  const browserRoot = path.join(projectRoot, "e2e");
  const fileSuite = {
    location: { file: path.join(browserRoot, "app-persistence.spec.ts") },
    parent: undefined,
    type: "file",
  };
  const suite = {
    allTests: () => [
      {
        parent: fileSuite,
        title:
          appAcceptance[0].browser === false
            ? ""
            : appAcceptance[0].browser.testName,
      },
    ],
  } as unknown as Suite;
  const config = {
    configFile: path.join(projectRoot, "playwright.config.ts"),
    rootDir: browserRoot,
  } as FullConfig;
  const result = { status: "passed" } as FullResult;
  return { browserRoot, config, result, suite };
}

test("mapped motion behavior requires output-change and reference-parity evidence", () => {
  const requirements = deriveToolcraftBrowserRuntimeRequirements([
    createAcceptance({
      motionReferenceCoverage: [
        { behaviorId: "delayed-retarget", referenceId: motionReferenceId },
      ],
    }),
  ]);

  expect(requirements.map(({ evidenceType }) => evidenceType)).toEqual([
    "product-observable-change",
    "reference-parity",
  ]);
});

test("ordinary output change does not acquire motion reference parity", () => {
  const requirements = deriveToolcraftBrowserRuntimeRequirements([
    createAcceptance(),
  ]);

  expect(requirements.map(({ evidenceType }) => evidenceType)).toEqual([
    "product-observable-change",
  ]);
});

test("delivery catalog validation rejects semantic study errors before catalog work", async () => {
  await expect(
    validateToolcraftDeliveryCatalogReferences(validationFixture, async () => []),
  ).rejects.toThrow(/Toolcraft reference validation failed:[\s\S]*study/iu);
});

test("delivery catalog validation rejects a tampered contact sheet", async () => {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-catalog-tampered-sheet-"),
  );
  const { acceptance, input, study } = createCanonicalMotionReferenceFixture();
  const evidencePath = path.join(rootDir, study.evidencePath);
  const contactSheetPath = path.join(rootDir, study.evidence.contactSheet.path);
  await fs.mkdir(path.dirname(evidencePath), { recursive: true });
  await fs.mkdir(path.join(rootDir, "e2e"));
  await fs.writeFile(
    evidencePath,
    writeCanonicalToolcraftMotionReferenceEvidence(study.evidence),
  );
  await fs.writeFile(contactSheetPath, "tampered-contact-sheet");

  try {
    await expect(
      validateToolcraftDeliveryCatalogReferences({
        ...validationFixture,
        acceptance: [appAcceptance[0], acceptance],
        rootDir: path.join(rootDir, "e2e"),
        transferMode: {
          ...appTransferMode,
          referenceInputs: [input],
        },
      }),
    ).rejects.toThrow(/could not be read/iu);
    await expect(
      validateToolcraftDeliveryCatalogReferences({
        ...validationFixture,
        acceptance: [appAcceptance[0], acceptance],
        rootDir,
        transferMode: {
          ...appTransferMode,
          referenceInputs: [input],
        },
      }),
    ).rejects.toThrow(/contact sheet[\s\S]*SHA-256/iu);
  } finally {
    await fs.rm(rootDir, { force: true, recursive: true });
  }
});

test("no-reference reporter lifecycle skips artifact and process-selection work", async () => {
  const projectRoot = path.join(os.tmpdir(), "toolcraft-reporter-no-reference");
  const { config, result, suite } = createReporterFixture(projectRoot);
  let artifactValidationCalls = 0;
  const reporter = new ToolcraftDeliveryCatalogReporter({
    createCatalog: () => ({ acceptance: [], performance: [], version: 2 }),
    validateReferences: (input) =>
      validateToolcraftDeliveryCatalogReferences(input, async () => {
        artifactValidationCalls += 1;
        throw new Error(
          "Artifact or process selection must not run without references.",
        );
      }),
    writeError: (source) => {
      throw new Error(`Unexpected reporter error: ${source}`);
    },
    writeOutput: () => {},
  });

  reporter.onBegin(config, suite);
  await expect(reporter.onEnd(result)).resolves.toBeUndefined();
  expect(artifactValidationCalls).toBe(0);
});

test("reporter validates the project root at awaited onEnd before publishing JSON", async () => {
  const projectRoot = path.join(os.tmpdir(), "toolcraft-reporter-project");
  const { config, result, suite } = createReporterFixture(projectRoot);
  const output: string[] = [];
  const validatedRoots: string[] = [];
  const lifecycle: string[] = [];
  const reporter = new ToolcraftDeliveryCatalogReporter({
    createCatalog: () => {
      lifecycle.push("catalog");
      return { acceptance: [], performance: [], version: 2 };
    },
    validateReferences: async ({ rootDir }) => {
      lifecycle.push("validation:start");
      await Promise.resolve();
      validatedRoots.push(rootDir);
      lifecycle.push("validation:end");
    },
    writeError: (source) => {
      throw new Error(`Unexpected reporter error: ${source}`);
    },
    writeOutput: (source) => {
      output.push(source);
    },
  });

  expect(reporter.onBegin(config, suite)).toBeUndefined();
  expect(output).toEqual([]);
  await expect(reporter.onEnd(result)).resolves.toBeUndefined();
  expect(validatedRoots).toEqual([projectRoot]);
  expect(lifecycle).toEqual(["validation:start", "validation:end", "catalog"]);
  expect(output).toHaveLength(1);
  expect(JSON.parse(output[0])).toMatchObject({ version: 2 });
});

test("catalog reporter fails invalid project-root config through the shared invariant", async () => {
  const projectRoot = path.join(os.tmpdir(), "toolcraft-reporter-project");
  const { result, suite } = createReporterFixture(projectRoot);
  const errors: string[] = [];
  const reporter = new ToolcraftDeliveryCatalogReporter({
    writeError: (source) => errors.push(source),
    writeOutput: () => {
      throw new Error("Invalid project root must suppress catalog output.");
    },
  });

  reporter.onBegin(
    { configFile: "playwright.config.ts", rootDir: "/app/e2e" } as FullConfig,
    suite,
  );
  await expect(reporter.onEnd(result)).resolves.toEqual({ status: "failed" });
  expect(errors.join("\n")).toContain(
    "Toolcraft Playwright project root requires an absolute configFile.",
  );
});

test("awaited semantic and artifact failures suppress JSON and fail Playwright", async () => {
  const projectRoot = path.join(os.tmpdir(), "toolcraft-reporter-invalid");
  const { config, result, suite } = createReporterFixture(projectRoot);
  for (const validationError of [
    "semantic motion reference study is incomplete",
    "tampered motion reference contact sheet",
  ]) {
    const errors: string[] = [];
    const output: string[] = [];
    let catalogCalls = 0;
    const reporter = new ToolcraftDeliveryCatalogReporter({
      createCatalog: () => {
        catalogCalls += 1;
        throw new Error("Catalog creation must not run after reference failure.");
      },
      validateReferences: async () => {
        await Promise.resolve();
        throw new Error(validationError);
      },
      writeError: (source) => {
        errors.push(source);
      },
      writeOutput: (source) => {
        output.push(source);
      },
    });

    expect(reporter.onBegin(config, suite)).toBeUndefined();
    await expect(reporter.onEnd(result)).resolves.toEqual({ status: "failed" });
    expect(catalogCalls).toBe(0);
    expect(output).toEqual([]);
    expect(errors.join("\n")).toContain(validationError);
  }
});

test("atomic preparation failure masks validation and preserves stack plus cause", async () => {
  const projectRoot = path.join(os.tmpdir(), "toolcraft-reporter-preparation");
  const { config, result } = createReporterFixture(projectRoot);
  const cause = new Error("containing suite cause");
  const preparationError = new Error("containing suite failed", { cause });
  preparationError.stack = "PREPARATION_STACK_MARKER";
  cause.stack = "PREPARATION_CAUSE_MARKER";
  const errors: string[] = [];
  let catalogCalls = 0;
  let validationCalls = 0;
  const reporter = new ToolcraftDeliveryCatalogReporter({
    createCatalog: () => {
      catalogCalls += 1;
      return { acceptance: [], performance: [], version: 2 };
    },
    validateReferences: async () => {
      validationCalls += 1;
      throw new Error("reference validation must remain hidden");
    },
    writeError: (source) => {
      errors.push(source);
    },
    writeOutput: () => {
      throw new Error("Preparation failure must suppress output.");
    },
  });
  const failingSuite = {
    allTests: () => {
      throw preparationError;
    },
  } as unknown as Suite;

  reporter.onBegin(config, failingSuite);
  await expect(reporter.onEnd(result)).resolves.toEqual({ status: "failed" });
  expect(validationCalls).toBe(0);
  expect(catalogCalls).toBe(0);
  expect(errors.join("\n")).toContain("PREPARATION_STACK_MARKER");
  expect(errors.join("\n")).toContain("PREPARATION_CAUSE_MARKER");
  expect(errors.join("\n")).not.toContain("reference validation must remain hidden");
});

test("idle reporter state fails with an explicit lifecycle error", async () => {
  const errors: string[] = [];
  let validationCalls = 0;
  const reporter = new ToolcraftDeliveryCatalogReporter({
    validateReferences: async () => {
      validationCalls += 1;
    },
    writeError: (source) => {
      errors.push(source);
    },
    writeOutput: () => {},
  });

  await expect(
    reporter.onEnd({ status: "passed" } as FullResult),
  ).resolves.toEqual({ status: "failed" });
  expect(validationCalls).toBe(0);
  expect(errors.join("\n")).toMatch(/complete onBegin lifecycle/iu);
});
