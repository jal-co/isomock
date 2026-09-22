import fs from "node:fs/promises";
import { existsSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createToolcraftCheckpointBundle,
  writeToolcraftCheckpointBundle,
} from "./toolcraft-checkpoint-bundle.mjs";
import {
  createToolcraftDeliveryReceipt,
} from "./toolcraft-delivery-receipt.mjs";
import {
  createToolcraftFunctionalProofModel,
  createToolcraftFunctionalProofModelHash,
} from "./toolcraft-functional-proof-model.mjs";
import {
  TOOLCRAFT_PERFORMANCE_RECEIPT_VERSION,
  collectToolcraftVerificationInputs,
} from "./toolcraft-verification-receipt.mjs";
import { EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE } from "./toolcraft-delivery-lifecycle-state.mjs";
import { installToolcraftPlaywrightTestShim } from "./playwright-test-shim-fixture.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function installReceiptPlaywrightShim(rootDir) {
  mkdirSync(path.join(rootDir, "node_modules"), { recursive: true });
  if (!existsSync(path.join(rootDir, "node_modules", "cross-spawn"))) {
    symlinkSync(
      realpathSync(path.join(scriptsDir, "..", "node_modules", "cross-spawn")),
      path.join(rootDir, "node_modules", "cross-spawn"),
      process.platform === "win32" ? "junction" : "dir",
    );
  }
  installToolcraftPlaywrightTestShim({
    rootDir,
  });
}

function ensureReceiptPlaywrightShim(rootDir) {
  const playwrightBin = path.join(rootDir, "node_modules", ".bin", "playwright");
  if (!existsSync(playwrightBin)) installReceiptPlaywrightShim(rootDir);
}

export async function createReceiptFixture() {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-receipt-"),
  );
  await fs.mkdir(path.join(rootDir, "src", "app"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "e2e"), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, "src", "app", "app-schema.ts"),
    'export const schema = { mode: "initial" };\n',
  );
  await fs.writeFile(
    path.join(rootDir, "e2e", "app-performance.spec.ts"),
    'export const scenario = "heavy";\n',
  );
  await fs.writeFile(
    path.join(rootDir, "package.json"),
    JSON.stringify({ name: "receipt-fixture", private: true }),
  );
  installReceiptPlaywrightShim(rootDir);
  return rootDir;
}

export function createTargetedMeasurementFixture(pathIds) {
  const metrics = {
    droppedFrameCount: 0,
    droppedFrameRatio: 0,
    durationMs: 10,
    frameGapP50Ms: 10,
    frameGapP95Ms: 16,
    frameGapP99Ms: 16,
    longTaskCount: 0,
    longTaskMaxMs: 0,
    maxFrameGapMs: 16,
    sampleCount: 3,
  };
  return pathIds.flatMap((pathId) =>
    ["cold", "warm", "sustained"].map((phase) => ({
      evidenceType: "performance-measurement-metrics",
      kind: "interaction",
      metrics,
      pathId,
      phase,
      profile: "interactive-discrete",
      profileCatalogVersion: 1,
      version: 1,
    })),
  );
}

export function createPerformanceEvidenceFixture() {
  return {
    environment: {
      browser: { name: "chromium", version: "1" },
      calibration: { durationMs: 1, iterations: 1 },
      cpuThrottling: { mode: "none", rate: 1 },
      evidenceType: "performance-environment",
      hardwareConcurrency: 4,
      version: 1,
      viewport: { height: 720, width: 1280 },
    },
    matrixHash: "b".repeat(64),
    measurements: [{ pathId: "initial", phase: "cold" }],
    pipelineSummaries: [],
    profileCatalogVersion: 1,
    reportHash: "a".repeat(64),
  };
}
export async function writePassedCheckpointFixture(
  rootDir,
  {
    runner = "protected-playwright",
    writeBaseline = true,
  } = {},
) {
  ensureReceiptPlaywrightShim(rootDir);
  const inventory = await collectToolcraftVerificationInputs(rootDir);
  const receipt = {
    completedAt: new Date().toISOString(),
    files: inventory.entries,
    kind: "performance-checkpoint",
    performanceEvidence: createPerformanceEvidenceFixture(),
    runner,
    sourceHash: inventory.sourceHash,
    status: "passed",
    version: TOOLCRAFT_PERFORMANCE_RECEIPT_VERSION,
  };
  const functionalProofModel = createToolcraftFunctionalProofModel({
    catalog: {
      acceptance: [{
        acceptanceId: "persistence.reload",
        contractHash: "c".repeat(64),
        domainId: "persistence",
        file: "e2e/app-controls.spec.ts",
        testName: "browser: focused acceptance",
      }],
      performance: [],
      version: 2,
    },
  });
  const plan = deepFreeze({
    basis: { kind: "initial" },
    functionalProofModelHash:
      createToolcraftFunctionalProofModelHash(functionalProofModel),
    kind: "functional",
    lifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
    manifestHash: "a".repeat(64),
    sourceHash: inventory.sourceHash,
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
  const delivery = createToolcraftDeliveryReceipt({
    functionalProofModel,
    plan,
    result: {
      evidence: [
        { kind: "docs" },
        { kind: "code-health" },
        { files: ["src/app/app-schema.test.ts"], kind: "product-tests" },
        { kind: "build" },
        {
          kind: "browser-functional",
          testNames: ["browser: focused acceptance"],
        },
      ],
      finalInventory: inventory,
    },
  });
  const bundle = createToolcraftCheckpointBundle({
    currentPerformance: receipt,
    delivery,
    performanceBaseline: writeBaseline ? receipt : null,
  });
  await writeToolcraftCheckpointBundle({ bundle, rootDir });
  return receipt;
}
