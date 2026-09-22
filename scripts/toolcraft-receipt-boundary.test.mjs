import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  getToolcraftDeliveryReceiptShapeError,
  validateToolcraftDeliveryReceipt,
} from "./toolcraft-delivery-receipt.mjs";
import * as deliveryAnchor from "./toolcraft-delivery-anchor.mjs";
import {
  createToolcraftLocalDependencyGraph,
  getToolcraftProductionCycleViolations,
} from "./toolcraft-local-dependency-graph.mjs";
import { getToolcraftPerformanceReceiptShapeError } from "./toolcraft-performance-receipt-policy.mjs";
import * as performanceReceiptPolicy from "./toolcraft-performance-receipt-policy.mjs";
import {
  validateToolcraftPerformanceReceipt,
  validateToolcraftVerificationReceipt,
} from "./toolcraft-verification-receipt.mjs";
import * as verificationReceiptFacade from "./toolcraft-verification-receipt.mjs";
import * as receiptFileIo from "./toolcraft-receipt-file-io.mjs";
import * as deliveryEvidence from "./toolcraft-delivery-evidence.mjs";
import * as deliveryExecutor from "./toolcraft-delivery-executor.mjs";
import * as planExecutionAuthority from "./toolcraft-plan-execution-authority.mjs";
import * as targetedPerformanceExecution from "./toolcraft-targeted-performance-execution.mjs";
import * as proofProcess from "./toolcraft-proof-process.mjs";
import { collectToolcraftSourceInventory } from "./toolcraft-source-inventory.mjs";
import { isToolcraftPackageRootOrSubpath } from "./toolcraft-typescript-source-evidence.mjs";
import { createReceiptFixture } from "./toolcraft-verification-receipt-test-helpers.mjs";

const expectedVerificationReceiptExports = [
  "TOOLCRAFT_PERFORMANCE_RECEIPT_VERSION",
  "assertToolcraftVerificationInputsUnchanged",
  "collectToolcraftVerificationInputs",
  "readToolcraftDurablePerformanceBaseline",
  "validateToolcraftPerformanceReceipt",
  "validateToolcraftVerificationReceipt",
];

const expectedDeliveryExecutorExports = [
  "executeToolcraftDeliveryPlan",
  "executeToolcraftDeliveryPlanCore",
  "finalizeToolcraftPlanExecutionAuthority",
  "releaseToolcraftPlanExecutionAuthority",
  "reserveToolcraftPlanExecutionAuthority",
];

const expectedPerformanceReceiptPolicyExports = [
  "TOOLCRAFT_PERFORMANCE_RECEIPT_VERSION",
  "createToolcraftPerformanceCheckpointReceipt",
  "getToolcraftPerformanceReceiptShapeError",
];

async function collectCrossSpawnImportFacts(rootDir) {
  const inventory = await collectToolcraftSourceInventory({
    rootDir,
    sourceRoots: ["scripts"],
    testSupportPatterns: [
      /(?:^|\/)[^/]+-fixture\.[cm]?js$/u,
      /(?:^|\/)[^/]+-test-(?:helpers|fixtures)\.[cm]?js$/u,
    ],
  });
  assert.deepEqual(inventory.filesystemViolations, []);
  const graph = await createToolcraftLocalDependencyGraph({
    entries: inventory.entries.filter(({ role }) => role === "production"),
    rootDir,
    sourceRecordMode: "imports-only",
  });
  return graph.moduleImports.filter(({ specifier }) =>
    isToolcraftPackageRootOrSubpath(specifier, "cross-spawn")
  );
}

test("receipt production dependency graph is acyclic", async () => {
  const rootDir = path.resolve(import.meta.dirname, "../..");
  const scriptNames = await fs.readdir(import.meta.dirname);
  const entries = scriptNames
    .filter(
      (name) =>
        name.endsWith(".mjs") &&
        !name.endsWith(".test.mjs") &&
        !name.endsWith("-test-helpers.mjs"),
    )
    .map((name) => ({
      absolutePath: path.join(import.meta.dirname, name),
      owner: "product",
      repoPath: `starter/scripts/${name}`,
      role: "production",
    }));
  const graph = await createToolcraftLocalDependencyGraph({
    entries,
    rootDir,
    sourceRecordMode: "imports-only",
  });
  const violations = getToolcraftProductionCycleViolations(graph).filter(({ cycle }) =>
    cycle.some((repoPath) => /toolcraft-(?:delivery|verification)-receipt/iu.test(repoPath)),
  );

  assert.deepEqual(violations, []);
});

test("verification receipt facade preserves its public API", () => {
  assert.deepEqual(
    Object.keys(verificationReceiptFacade).sort(),
    expectedVerificationReceiptExports,
  );
  assert.equal(
    "writeToolcraftPerformanceIteration" in verificationReceiptFacade,
    false,
  );
});

test("delivery anchor exposes only the current receipt boundary", async () => {
  assert.deepEqual(Object.keys(deliveryAnchor).sort(), [
    "getToolcraftDeliveryAnchorShapeError",
    "normalizeToolcraftDeliveryAnchor",
    "readToolcraftDeliveryAnchor",
    "validateToolcraftDeliveryAnchor",
  ]);
  for (const obsolete of [
    "toolcraft-delivery-baseline-policy.mjs",
    "toolcraft-delivery-anchor-utils.mjs",
    "toolcraft-delivery-anchor-verification.mjs",
    "toolcraft-delivery-receipt-builder.mjs",
    "toolcraft-linked-performance-authority.mjs",
    "toolcraft-legacy-targeted-evidence.mjs",
    "toolcraft-verification-receipt-core.mjs",
  ]) {
    await assert.rejects(
      fs.access(path.join(import.meta.dirname, obsolete)),
      /ENOENT/iu,
    );
  }
});

test("receipt file I/O exposes no generic protected receipt writer", () => {
  assert.deepEqual(Object.keys(receiptFileIo), ["readToolcraftReceiptFile"]);
});

test("plan execution owns one exact evidence and authority boundary", async () => {
  assert.deepEqual(
    Object.keys(deliveryExecutor).sort(),
    expectedDeliveryExecutorExports,
  );
  assert.deepEqual(
    Object.keys(deliveryEvidence).sort(),
    [
      "getToolcraftExecutionEvidenceError",
      "getToolcraftProofStepEvidenceError",
    ],
  );
  assert.deepEqual(Object.keys(planExecutionAuthority), [
    "createToolcraftPlanExecutionAuthorityRegistry",
  ]);
  assert.deepEqual(Object.keys(targetedPerformanceExecution).sort(), [
    "executeToolcraftTargetedPerformanceVerification",
    "executeToolcraftTargetedPerformanceVerificationCore",
  ]);
  assert.deepEqual(Object.keys(proofProcess).sort(), [
    "captureToolcraftProofIpcProcess",
    "captureToolcraftProofProcess",
    "detectToolcraftPackageManager",
    "ensureToolcraftChromium",
    "getToolcraftBinaryPath",
    "getToolcraftFrozenInstallCommand",
    "runToolcraftProofPackageScript",
    "runToolcraftProofProcess",
    "terminateToolcraftProofProcessTree",
  ]);
  for (const obsolete of [
    "toolcraft-targeted-evidence-policy.mjs",
    "toolcraft-targeted-execution-authority.mjs",
    "toolcraft-targeted-verification-execution.mjs",
    "toolcraft-targeted-verification-runner.mjs",
    "toolcraft-targeted-verification-selection.mjs",
  ]) {
    await assert.rejects(
      fs.access(path.join(import.meta.dirname, obsolete)),
      /ENOENT/iu,
    );
  }
});

test("short-lived proof execution imports cross-spawn only through the canonical adapter", async () => {
  const rootDir = path.resolve(import.meta.dirname, "..");
  const crossSpawnImporters = [
    ...new Set(
      (await collectCrossSpawnImportFacts(rootDir)).map(
        ({ importerRepoPath }) => importerRepoPath,
      ),
    ),
  ].sort();
  assert.deepEqual(crossSpawnImporters, [
    "scripts/run-kernel-benchmarks.mjs",
    "scripts/run-vite-on-free-port.mjs",
    "scripts/toolcraft-proof-process.mjs",
  ]);
  for (const obsolete of [
    "toolcraft-delivery-command-runner.mjs",
    "toolcraft-targeted-process-adapter.mjs",
  ]) {
    await assert.rejects(
      fs.access(path.join(import.meta.dirname, obsolete)),
      /ENOENT/iu,
    );
  }
});

test("cross-spawn import guard catches recursive structural bypass variants", async (t) => {
  const rootDir = await fs.mkdtemp(
    path.join(tmpdir(), "cross-spawn-import-fixture-"),
  );
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const sources = {
    "scripts/nested/dynamic.mjs": "await import('cross-spawn');\n",
    "scripts/nested/export.mjs":
      'export { default } from "cross-spawn/lib/parse.js";\n',
    "scripts/nested/require.cjs":
      'require("cross-spawn/lib/util/escape.js");\n',
    "scripts/nested/static.mjs": "import spawn from 'cross-spawn';\n",
  };
  for (const [repoPath, source] of Object.entries(sources)) {
    const absolutePath = path.join(rootDir, repoPath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, source);
  }

  assert.deepEqual(
    (await collectCrossSpawnImportFacts(rootDir)).map(
      ({ category, importerRepoPath, specifier }) => ({
        category,
        importerRepoPath,
        specifier,
      }),
    ),
    [
      {
        category: "dynamic-import",
        importerRepoPath: "scripts/nested/dynamic.mjs",
        specifier: "cross-spawn",
      },
      {
        category: "static-export",
        importerRepoPath: "scripts/nested/export.mjs",
        specifier: "cross-spawn/lib/parse.js",
      },
      {
        category: "require",
        importerRepoPath: "scripts/nested/require.cjs",
        specifier: "cross-spawn/lib/util/escape.js",
      },
      {
        category: "static-import",
        importerRepoPath: "scripts/nested/static.mjs",
        specifier: "cross-spawn",
      },
    ],
  );
});

test("current performance evidence remains a dedicated receipt boundary", () => {
  assert.deepEqual(
    Object.keys(performanceReceiptPolicy).sort(),
    expectedPerformanceReceiptPolicyExports,
  );
});

test("receipt validators remain fail-closed without protected authority", async (t) => {
  assert.match(getToolcraftDeliveryReceiptShapeError({}), /malformed/iu);
  assert.match(getToolcraftPerformanceReceiptShapeError({}), /malformed/iu);

  const rootDir = await createReceiptFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  assert.match(
    (await validateToolcraftDeliveryReceipt({ rootDir }))[0],
    /delivery receipt is missing/iu,
  );
  assert.match(
    (await validateToolcraftPerformanceReceipt({ rootDir }))[0],
    /performance receipt is missing/iu,
  );
  assert.match(
    (await validateToolcraftVerificationReceipt({ rootDir }))[0],
    /delivery receipt is missing/iu,
  );
});
