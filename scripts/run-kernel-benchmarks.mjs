#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { access, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import spawn from "cross-spawn";

import {
  getToolcraftKernelBenchmarkReceiptPath,
  readToolcraftKernelBenchmarkReceipt,
} from "./toolcraft-kernel-benchmark-receipt.mjs";
import {
  assertToolcraftVerificationInputsUnchanged,
  collectToolcraftVerificationInputs,
} from "./toolcraft-verification-receipt.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv.slice(2).some((argument) => argument !== "--")) {
  throw new Error("Toolcraft protected kernel benchmarks do not accept test filters.");
}

function getBinaryPath(name) {
  return path.join(
    projectDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${name}.cmd` : name,
  );
}

function runBinary(binaryPath, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, args, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${path.basename(binaryPath)} exited after signal ${signal}.`));
      } else if (code !== 0) {
        reject(new Error(`${path.basename(binaryPath)} exited with code ${code ?? 1}.`));
      } else {
        resolve();
      }
    });
  });
}

const playwrightBin = getBinaryPath("playwright");
const tscBin = getBinaryPath("tsc");
const viteBin = getBinaryPath("vite");
await Promise.all([playwrightBin, tscBin, viteBin].map((filePath) => access(filePath)));

const baselineInventory = await collectToolcraftVerificationInputs(projectDir);
const nonce = randomUUID();
const reportPath = path.join(
  projectDir,
  ".toolcraft",
  "verification",
  `kernel-benchmark-${process.pid}.json`,
);
const receiptPath = getToolcraftKernelBenchmarkReceiptPath(projectDir);
await rm(reportPath, { force: true });

try {
  await runBinary(tscBin, ["-p", "tsconfig.json", "--noEmit"]);
  await runBinary(viteBin, ["build"]);
  assertToolcraftVerificationInputsUnchanged({
    baseline: baselineInventory,
    current: await collectToolcraftVerificationInputs(projectDir),
    phase: "during the kernel benchmark production build",
  });
  await runBinary(playwrightBin, ["install", "chromium"]);
  await runBinary(
    playwrightBin,
    [
      "test",
      "e2e/toolcraft-kernel-benchmark.spec.ts",
      "--workers=1",
    ],
    {
      ...process.env,
      TOOLCRAFT_BROWSER_SERVER_MODE: "preview",
      TOOLCRAFT_KERNEL_BENCHMARK_REPORT_NONCE: nonce,
      TOOLCRAFT_KERNEL_BENCHMARK_REPORT_PATH: reportPath,
      TOOLCRAFT_KERNEL_BENCHMARK_SOURCE_HASH: baselineInventory.sourceHash,
    },
  );
  const verifiedInventory = await collectToolcraftVerificationInputs(projectDir);
  assertToolcraftVerificationInputsUnchanged({
    baseline: baselineInventory,
    current: verifiedInventory,
    phase: "during protected kernel benchmark execution",
  });
  await readToolcraftKernelBenchmarkReceipt(reportPath, {
    nonce,
    sourceHash: verifiedInventory.sourceHash,
  });
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await rename(reportPath, receiptPath);
  console.log("Recorded current-source Toolcraft kernel benchmark receipt.");
} finally {
  await rm(reportPath, { force: true });
}
