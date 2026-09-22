import {
  createToolcraftCheckpointBundle,
  readToolcraftCheckpointBundle,
  writeToolcraftCheckpointBundle,
} from "./toolcraft-checkpoint-bundle.mjs";
import {
  createToolcraftFunctionalProofModel,
  createToolcraftFunctionalProofModelHash,
} from "./toolcraft-functional-proof-model.mjs";
import { createToolcraftVerificationSourceHash } from "./toolcraft-verification-inventory.mjs";
import {
  createTargetedMeasurementFixture,
} from "./toolcraft-verification-receipt-test-helpers.mjs";
import {
  EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
  createToolcraftDeliveryLifecycleState,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  createToolcraftTargetedPerformanceReport,
  createToolcraftTargetedPerformanceEvidenceHash,
} from "./toolcraft-targeted-performance-report.mjs";

const hash = (character) => character.repeat(64);
const performancePathId = "control-drag:composite";
const performanceTestName = "browser perf: focused workload";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export function createInventory(files) {
  const entries = Object.entries(files)
    .map(([path, sha256]) => ({ path, sha256 }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return {
    entries,
    sourceHash: createToolcraftVerificationSourceHash(entries),
  };
}

export function createFunctionalProofModelFixture({
  acceptanceId = "canvas.focused",
  contractHash = hash("b"),
} = {}) {
  return createToolcraftFunctionalProofModel({
    catalog: {
      acceptance: [{
        acceptanceId,
        contractHash,
        domainId: acceptanceId.split(".")[0],
        file: "e2e/app-controls.spec.ts",
        testName: "browser: focused acceptance",
      }],
      performance: [],
      version: 2,
    },
  });
}

export function createPlanReceiptFixture(fixture = "functional-initial") {
  if (!["functional-initial", "performance-iteration"].includes(fixture))
    throw new Error(`Unknown delivery fixture: ${fixture}`);
  const comparisonInventory = createInventory({
    "src/app/app-schema.ts": hash("1"),
  });
  const finalInventory = createInventory({
    "src/app/app-schema.ts": hash("2"),
  });
  const functionalProofModel = createFunctionalProofModelFixture();
  const functionalProofModelHash =
    createToolcraftFunctionalProofModelHash(functionalProofModel);
  const common = {
    basis: {
      initialFunctionalProofModelHash: functionalProofModelHash,
      initialSourceHash: comparisonInventory.sourceHash,
      kind: "performance-request",
    },
    functionalProofModelHash,
    lifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
    manifestHash: hash("a"),
    sourceHash: finalInventory.sourceHash,
  };
  if (fixture === "functional-initial") {
    const plan = deepFreeze({
      basis: { kind: "initial" },
      functionalProofModelHash,
      kind: "functional",
      lifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
      manifestHash: hash("a"),
      sourceHash: finalInventory.sourceHash,
      steps: [
        { kind: "docs" },
        { kind: "code-health" },
        {
          acceptanceIds: null,
          files: ["src/app/app-schema.test.ts"],
          kind: "product-tests",
        },
        { kind: "build" },
        {
          kind: "browser-functional",
          testNames: ["browser: focused acceptance"],
        },
      ],
    });
    return {
      functionalProofModel,
      plan,
      result: {
        evidence: [
          { kind: "docs" },
          { kind: "code-health" },
          {
            files: ["src/app/app-schema.test.ts"],
            kind: "product-tests",
          },
          { kind: "build" },
          {
            kind: "browser-functional",
            testNames: ["browser: focused acceptance"],
          },
        ],
        finalInventory,
      },
    };
  }
  const requestAuthorityHash = hash("d");
  const targetedPerformanceReport = createToolcraftTargetedPerformanceReport({
    fixtureResolutionMode: "strict-development",
    fixtureSelector: "development",
    measurements: createTargetedMeasurementFixture([performancePathId]),
    nonce: "fixture-targeted-report",
    performancePassIds: ["composite"],
    performancePathIds: [performancePathId],
    requestAuthorityHash,
    sourceHash: finalInventory.sourceHash,
    testNames: [performanceTestName],
  });
  const testEvidence = [{
    fullTitle: `app-controls.spec.ts › ${performanceTestName}`,
    leafTitle: performanceTestName,
  }];
  const functionalSteps = [{ kind: "build" }];
  const plan = deepFreeze({
    ...common,
    kind: "performance-iteration",
    lifecycle: createToolcraftDeliveryLifecycleState({
      requestAuthorityHash,
    }),
    performanceComparison: { kind: "none" },
    requestAuthorityHash,
    steps: [
      ...functionalSteps,
      {
        kind: "browser-performance",
        passIds: ["composite"],
        pathIds: [performancePathId],
        testNames: [performanceTestName],
      },
    ],
  });
  return {
    functionalProofModel,
    plan,
    result: {
      evidence: [
        ...functionalSteps,
        {
          kind: "browser-performance",
          passIds: ["composite"],
          pathIds: [performancePathId],
          report: targetedPerformanceReport,
          evidenceHash: createToolcraftTargetedPerformanceEvidenceHash({
            report: targetedPerformanceReport,
            testEvidence,
          }),
          testEvidence,
          testNames: [performanceTestName],
        },
      ],
      finalInventory,
    },
  };
}

export async function writeDeliveryReceiptFixture(rootDir, receipt) {
  const loaded = await readToolcraftCheckpointBundle(rootDir);
  if (loaded.error) throw new Error(loaded.error);
  const bundle = loaded.missing
    ? createToolcraftCheckpointBundle({ delivery: receipt })
    : { ...loaded.bundle, delivery: receipt };
  await writeToolcraftCheckpointBundle({ bundle, rootDir });
}
