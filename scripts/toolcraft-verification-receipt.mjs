#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateToolcraftDeliveryReceipt } from "./toolcraft-delivery-receipt.mjs";
import {
  readToolcraftCheckpointBundle,
} from "./toolcraft-checkpoint-bundle.mjs";
import {
  assertToolcraftVerificationInputsUnchanged,
  collectToolcraftVerificationInputs,
} from "./toolcraft-verification-inventory.mjs";
import {
  TOOLCRAFT_PERFORMANCE_RECEIPT_VERSION,
  getToolcraftPerformanceReceiptShapeError,
} from "./toolcraft-performance-receipt-policy.mjs";
import {
  TOOLCRAFT_FULL_PERFORMANCE_VERIFICATION_COMMAND,
} from "./toolcraft-performance-authority-policy.mjs";
export {
  TOOLCRAFT_PERFORMANCE_RECEIPT_VERSION,
  assertToolcraftVerificationInputsUnchanged,
  collectToolcraftVerificationInputs,
};

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function readToolcraftDurablePerformanceBaseline(rootDir) {
  const loaded = await readToolcraftCheckpointBundle(rootDir);
  if (loaded.error) return { error: loaded.error };
  if (loaded.missing || loaded.bundle.performanceBaseline === null) {
    return {
      error: `Toolcraft performance baseline receipt is missing. An operator must run ${TOOLCRAFT_FULL_PERFORMANCE_VERIFICATION_COMMAND} to create one.`,
      missing: true,
    };
  }
  const receipt = loaded.bundle.performanceBaseline;
  const shapeError = getToolcraftPerformanceReceiptShapeError(receipt);
  if (shapeError || receipt.kind !== "performance-checkpoint") {
    return {
      error:
        shapeError ??
        "Toolcraft performance baseline must be a protected passed performance checkpoint.",
    };
  }
  return { receipt };
}

export async function validateToolcraftPerformanceReceipt({ rootDir }) {
  const loaded = await readToolcraftCheckpointBundle(rootDir);
  if (loaded.error) return [loaded.error];
  if (loaded.missing || loaded.bundle.performanceBaseline === null) {
    return [
      `Toolcraft performance receipt is missing. An operator must run ${TOOLCRAFT_FULL_PERFORMANCE_VERIFICATION_COMMAND} to create a full checkpoint.`,
    ];
  }
  const receipt = loaded.bundle.performanceBaseline;
  const shapeError = getToolcraftPerformanceReceiptShapeError(receipt);
  if (shapeError) return [shapeError];

  const baseline = await readToolcraftDurablePerformanceBaseline(rootDir);
  if (baseline.error) return [baseline.error];

  const inventory = await collectToolcraftVerificationInputs(rootDir);
  if (receipt.sourceHash !== inventory.sourceHash) {
    return [
      "Toolcraft performance receipt is stale because product or verification inputs changed after the recorded verification pass.",
    ];
  }
  return [];
}

export async function validateToolcraftVerificationReceipt({ rootDir }) {
  return validateToolcraftDeliveryReceipt({ rootDir });
}

async function runCli() {
  const projectDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const [command = "validate"] = process.argv.slice(2);
  if (command !== "validate") {
    throw new Error(
      `Unknown Toolcraft verification receipt command: ${command}.`,
    );
  }
  const errors = await validateToolcraftVerificationReceipt({
    rootDir: projectDir,
  });
  if (errors.length > 0) throw new Error(errors.join("\n"));
  console.log("Toolcraft delivery authority is current and valid.");
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
