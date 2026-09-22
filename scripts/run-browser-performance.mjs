#!/usr/bin/env node

import { realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { updateToolcraftCheckpointBundle } from "./toolcraft-checkpoint-bundle.mjs";
import { readToolcraftDeliveryAnchor } from "./toolcraft-delivery-anchor.mjs";
import { measureToolcraftPerformanceCheckpoint } from "./toolcraft-performance-checkpoint-runner.mjs";
import { runToolcraftProofPackageScript } from "./toolcraft-proof-process.mjs";
import { createToolcraftPerformanceCheckpointReceipt } from "./toolcraft-performance-receipt-policy.mjs";
import { collectToolcraftVerificationInputs } from "./toolcraft-verification-receipt.mjs";
import { withToolcraftVerificationLock } from "./toolcraft-verification-lock.mjs";

const defaultProjectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function assertOperatorArguments(arguments_) {
  const unsupportedArguments = arguments_.filter((argument) => argument !== "--");
  if (unsupportedArguments.length > 0) {
    throw new Error(
      `Toolcraft full performance operator command does not accept arguments: ${unsupportedArguments.join(" ")}. Run Playwright directly for targeted diagnosis.`,
    );
  }
}

async function runToolcraftFullPerformanceCertificationCore({ projectDir }) {
  const loaded = await readToolcraftDeliveryAnchor(projectDir);
  if (loaded.missing) {
    throw new Error(
      "Toolcraft full performance requires a current successful delivery.",
    );
  }
  if (loaded.error) throw new Error(loaded.error);
  const initialInventory =
    await collectToolcraftVerificationInputs(projectDir);
  await runToolcraftProofPackageScript(projectDir, "build");
  const measurement = await measureToolcraftPerformanceCheckpoint({
    baselineInventory: initialInventory,
    projectDir,
  });
  const checkpoint = createToolcraftPerformanceCheckpointReceipt(measurement);
  return updateToolcraftCheckpointBundle({
    expectedSourceInventory: measurement.inventory,
    rootDir: projectDir,
    update: (bundle) => ({
      ...bundle,
      performanceBaseline: checkpoint,
    }),
  });
}

export async function runToolcraftFullPerformanceCertification({
  projectDir = defaultProjectDir,
} = {}) {
  const resolvedProjectDir = path.resolve(projectDir);
  return withToolcraftVerificationLock(resolvedProjectDir, () => {
    return runToolcraftFullPerformanceCertificationCore({
      projectDir: resolvedProjectDir,
    });
  });
}

async function main() {
  assertOperatorArguments(process.argv.slice(2));
  await runToolcraftFullPerformanceCertification();
}

async function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return (
      (await realpath(process.argv[1])) ===
      (await realpath(fileURLToPath(import.meta.url)))
    );
  } catch {
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
}

if (await isDirectExecution()) {
  await main();
}
